// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../../interfaces/IFreelanceEscrow.sol";

// freelance escrow - milestone-based workflow with multiple workers
// handles deposits, submissions, revisions, approvals, disputes, payments
contract FreelanceEscrow is IFreelanceEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant DEPLOYMENT_FEE_BPS = 50;
    uint256 private constant APPROVAL_FEE_BPS = 250;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint256 private constant MAX_DEADLINE_EXTENSION = 90 days;
    uint256 private constant MAX_MILESTONES = 50;

    address public platform;
    ProjectInfo public projectInfo;

    mapping(uint256 => Milestone) public milestones;
    mapping(uint256 => Deliverable) public deliverables;
    mapping(uint256 => Dispute) private disputes;
    mapping(address => uint256[]) private workerMilestones;
    mapping(uint256 => mapping(address => uint256)) private proposedDeadlineExtension;

    bool private initialized;
    uint256 private nextMilestoneId = 1;

    mapping(uint256 => uint256[]) private milestoneDependencies;

    modifier onlyClient() {
        require(msg.sender == projectInfo.client, "Only client");
        _;
    }

    modifier onlyWorker(uint256 milestoneId) {
        require(milestones[milestoneId].exists, "Milestone does not exist");
        require(
            msg.sender == milestones[milestoneId].worker,
            "Only assigned worker"
        );
        _;
    }

    modifier onlyClientOrWorker(uint256 milestoneId) {
        require(milestones[milestoneId].exists, "Milestone does not exist");
        require(
            msg.sender == projectInfo.client ||
                msg.sender == milestones[milestoneId].worker,
            "Only client or milestone worker"
        );
        _;
    }

    modifier onlyPlatform() {
        require(msg.sender == platform, "Only platform");
        _;
    }

    modifier inPhase(Phase _phase) {
        require(projectInfo.currentPhase == _phase, "Invalid phase");
        _;
    }

    modifier milestoneExists(uint256 milestoneId) {
        require(milestones[milestoneId].exists, "Milestone does not exist");
        _;
    }

    modifier milestoneInStatus(uint256 milestoneId, MilestoneStatus _status) {
        require(
            milestones[milestoneId].status == _status,
            "Invalid milestone status"
        );
        _;
    }

    modifier notDisputed(uint256 milestoneId) {
        require(
            !disputes[milestoneId].exists || disputes[milestoneId].resolved,
            "Milestone is disputed"
        );
        _;
    }

    // init without milestones (legacy) - call addMilestone and finalizeMilestones separately
    function initialize(
        address _client,
        address _paymentToken,
        uint256 _totalAmount,
        address _platform
    ) external override {
        require(!initialized, "Already initialized");
        require(_client != address(0), "Invalid client");
        require(_platform != address(0), "Invalid platform");
        require(_totalAmount > 0, "Amount = 0");

        platform = _platform;

        projectInfo = ProjectInfo({
            client: _client,
            paymentToken: _paymentToken,
            totalAmount: _totalAmount,
            totalPaid: 0,
            platformFeeCollected: 0,
            currentPhase: Phase.Created,
            fundedAt: 0,
            milestoneCount: 0,
            completedMilestones: 0,
            allMilestonesCreated: false
        });

        nextMilestoneId = 1;
        initialized = true;

        emit EscrowInitialized(_client, _paymentToken, _totalAmount);
    }

    // init with milestones in one tx - locked after, no changes possible
    function initializeWithMilestones(
        address _client,
        address _paymentToken,
        uint256 _totalAmount,
        address _platform,
        MilestoneInput[] calldata _milestones
    ) external payable override {
        require(!initialized, "Already initialized");
        require(_client != address(0), "Invalid client");
        require(_platform != address(0), "Invalid platform");
        require(_totalAmount > 0, "Amount = 0");
        require(_milestones.length > 0, "No milestones");
        require(_milestones.length <= MAX_MILESTONES, "Too many milestones");

        platform = _platform;

        uint256 deploymentFee = (_totalAmount * DEPLOYMENT_FEE_BPS) /
            BPS_DENOMINATOR;
        if (_paymentToken == address(0)) {
            require(msg.value >= deploymentFee, "Insufficient deployment fee");
            (bool sent, ) = _platform.call{value: msg.value}("");
            require(sent, "Deployment fee transfer failed");
        } else {
            IERC20(_paymentToken).safeTransferFrom(
                msg.sender,
                _platform,
                deploymentFee
            );
        }

        projectInfo = ProjectInfo({
            client: _client,
            paymentToken: _paymentToken,
            totalAmount: _totalAmount,
            totalPaid: 0,
            platformFeeCollected: 0,
            currentPhase: Phase.Created,
            fundedAt: 0,
            milestoneCount: 0,
            completedMilestones: 0,
            allMilestonesCreated: false
        });

        nextMilestoneId = 1;
        initialized = true;

        uint256 allocatedAmount = 0;
        for (uint256 i = 0; i < _milestones.length; i++) {
            MilestoneInput calldata m = _milestones[i];

            require(m.worker != address(0), "Invalid worker");
            require(m.worker != _client, "Worker cannot be client");
            require(m.amount > 0, "Amount = 0");
            require(m.deadline > block.timestamp, "Invalid deadline");
            require(
                m.revisionLimit > 0 && m.revisionLimit <= 10,
                "Invalid revision limit"
            );
            require(bytes(m.description).length > 0, "Empty description");

            uint256 milestoneId = nextMilestoneId++;
            allocatedAmount += m.amount;

            milestones[milestoneId] = Milestone({
                milestoneId: milestoneId,
                worker: m.worker,
                amount: m.amount,
                deadline: m.deadline,
                revisionLimit: m.revisionLimit,
                revisionCount: 0,
                status: MilestoneStatus.Pending,
                description: m.description,
                createdAt: block.timestamp,
                exists: true
            });

            for (uint256 j = 0; j < m.dependencies.length; j++) {
                uint256 depIndex = m.dependencies[j];
                require(
                    depIndex < i,
                    "Dependency must be an earlier milestone"
                );
                uint256 depMilestoneId = depIndex + 1;
                milestoneDependencies[milestoneId].push(depMilestoneId);
            }

            projectInfo.milestoneCount++;
            workerMilestones[m.worker].push(milestoneId);

            emit MilestoneAdded(
                milestoneId,
                m.worker,
                m.amount,
                m.deadline,
                m.description
            );
        }

        require(
            allocatedAmount == _totalAmount,
            "Milestone amounts don't match total"
        );

        projectInfo.allMilestonesCreated = true;

        emit AllMilestonesCreated(projectInfo.milestoneCount, _totalAmount);
        emit EscrowInitializedWithMilestones(
            _client,
            _paymentToken,
            _totalAmount,
            projectInfo.milestoneCount
        );
    }

    // add milestone - only client, before funding
    function addMilestone(
        address worker,
        uint256 amount,
        uint256 deadline,
        uint256 revisionLimit,
        string calldata description
    )
        external
        override
        onlyClient
        inPhase(Phase.Created)
        returns (uint256 milestoneId)
    {
        require(
            !projectInfo.allMilestonesCreated,
            "Milestones already finalized"
        );
        require(
            projectInfo.milestoneCount < MAX_MILESTONES,
            "Too many milestones"
        );
        require(worker != address(0), "Invalid worker");
        require(worker != projectInfo.client, "Worker cannot be client");
        require(amount > 0, "Amount = 0");
        require(deadline > block.timestamp, "Invalid deadline");
        require(
            revisionLimit > 0 && revisionLimit <= 10,
            "Invalid revision limit"
        );
        require(bytes(description).length > 0, "Empty description");

        uint256 allocatedAmount = 0;
        for (uint256 i = 1; i < nextMilestoneId; i++) {
            if (milestones[i].exists) {
                allocatedAmount += milestones[i].amount;
            }
        }
        require(
            allocatedAmount + amount <= projectInfo.totalAmount,
            "Exceeds total amount"
        );

        milestoneId = nextMilestoneId++;

        milestones[milestoneId] = Milestone({
            milestoneId: milestoneId,
            worker: worker,
            amount: amount,
            deadline: deadline,
            revisionLimit: revisionLimit,
            revisionCount: 0,
            status: MilestoneStatus.Pending,
            description: description,
            createdAt: block.timestamp,
            exists: true
        });

        projectInfo.milestoneCount++;
        workerMilestones[worker].push(milestoneId);

        emit MilestoneAdded(milestoneId, worker, amount, deadline, description);
    }

    // finalize milestones - must call before deposit
    function finalizeMilestones()
        external
        override
        onlyClient
        inPhase(Phase.Created)
    {
        require(!projectInfo.allMilestonesCreated, "Already finalized");
        require(projectInfo.milestoneCount > 0, "No milestones added");

        uint256 allocatedAmount = 0;
        for (uint256 i = 1; i < nextMilestoneId; i++) {
            if (milestones[i].exists) {
                allocatedAmount += milestones[i].amount;
            }
        }
        require(
            allocatedAmount == projectInfo.totalAmount,
            "Milestone amounts don't match total"
        );

        projectInfo.allMilestonesCreated = true;

        emit AllMilestonesCreated(
            projectInfo.milestoneCount,
            projectInfo.totalAmount
        );
    }

    // update worker before any work submitted
    function updateMilestoneWorker(
        uint256 milestoneId,
        address newWorker
    ) external override onlyClient milestoneExists(milestoneId) {
        require(newWorker != address(0), "Invalid worker");
        require(newWorker != projectInfo.client, "Worker cannot be client");
        require(
            milestones[milestoneId].status == MilestoneStatus.Pending,
            "Can only update worker before submission"
        );

        address oldWorker = milestones[milestoneId].worker;
        milestones[milestoneId].worker = newWorker;

        _removeWorkerMilestone(oldWorker, milestoneId);
        workerMilestones[newWorker].push(milestoneId);
    }

    // client deposits funds to start project
    function depositFunds()
        external
        payable
        override
        onlyClient
        inPhase(Phase.Created)
        nonReentrant
    {
        require(projectInfo.allMilestonesCreated, "Milestones not finalized");

        if (projectInfo.paymentToken == address(0)) {
            require(
                msg.value == projectInfo.totalAmount,
                "Incorrect ETH amount"
            );
        } else {
            require(msg.value == 0, "ETH not accepted");
            IERC20(projectInfo.paymentToken).safeTransferFrom(
                msg.sender,
                address(this),
                projectInfo.totalAmount
            );
        }

        projectInfo.currentPhase = Phase.Funded;
        projectInfo.fundedAt = block.timestamp;

        emit FundsDeposited(
            msg.sender,
            projectInfo.totalAmount,
            block.timestamp
        );
    }

    // worker submits work for their milestone
    function submitWork(
        uint256 milestoneId,
        string calldata ipfsHash,
        string calldata description
    )
        external
        override
        onlyWorker(milestoneId)
        milestoneExists(milestoneId)
        nonReentrant
        notDisputed(milestoneId)
    {
        require(
            projectInfo.currentPhase == Phase.Funded ||
                projectInfo.currentPhase == Phase.InProgress,
            "Project not active"
        );
        require(
            milestones[milestoneId].status == MilestoneStatus.Pending ||
                milestones[milestoneId].status == MilestoneStatus.UnderRevision,
            "Cannot submit in current status"
        );
        require(bytes(ipfsHash).length > 0, "Empty IPFS hash");
        require(bytes(description).length > 0, "Empty description");

        require(
            _areDependenciesCompleted(milestoneId),
            "Dependencies not completed"
        );

        deliverables[milestoneId] = Deliverable({
            milestoneId: milestoneId,
            ipfsHash: ipfsHash,
            description: description,
            submittedAt: block.timestamp,
            submittedBy: msg.sender
        });

        milestones[milestoneId].status = MilestoneStatus.Submitted;

        if (projectInfo.currentPhase == Phase.Funded) {
            projectInfo.currentPhase = Phase.InProgress;
        }

        emit WorkSubmitted(
            milestoneId,
            msg.sender,
            ipfsHash,
            description,
            block.timestamp
        );
    }

    // client approves and releases payment - pays 2.5% approval fee
    function approveMilestone(
        uint256 milestoneId
    )
        external
        payable
        override
        onlyClient
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Submitted)
        nonReentrant
        notDisputed(milestoneId)
    {
        require(deliverables[milestoneId].submittedAt > 0, "No deliverable");

        uint256 milestoneAmount = milestones[milestoneId].amount;
        uint256 approvalFee = (milestoneAmount * APPROVAL_FEE_BPS) /
            BPS_DENOMINATOR;

        if (projectInfo.paymentToken == address(0)) {
            require(msg.value >= approvalFee, "Insufficient approval fee");
            (bool sent, ) = platform.call{value: msg.value}("");
            require(sent, "Approval fee transfer failed");
        } else {
            IERC20(projectInfo.paymentToken).safeTransferFrom(
                msg.sender,
                platform,
                approvalFee
            );
        }

        projectInfo.platformFeeCollected += approvalFee;

        milestones[milestoneId].status = MilestoneStatus.Approved;

        emit MilestoneApproved(milestoneId, msg.sender, block.timestamp);

        _releaseMilestonePayment(milestoneId);
    }

    // client requests revision
    function requestRevision(
        uint256 milestoneId,
        string calldata feedback
    )
        external
        override
        onlyClient
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Submitted)
        nonReentrant
        notDisputed(milestoneId)
    {
        require(deliverables[milestoneId].submittedAt > 0, "No deliverable");
        require(
            milestones[milestoneId].revisionCount <
                milestones[milestoneId].revisionLimit,
            "Revision limit reached"
        );
        require(bytes(feedback).length > 0, "Empty feedback");

        milestones[milestoneId].revisionCount++;
        milestones[milestoneId].status = MilestoneStatus.UnderRevision;

        emit RevisionRequested(
            milestoneId,
            msg.sender,
            milestones[milestoneId].revisionCount,
            feedback,
            block.timestamp
        );
    }

    // internal payment release - worker gets 100% (fee already collected)
    function _releaseMilestonePayment(uint256 milestoneId) private {
        require(
            milestones[milestoneId].status == MilestoneStatus.Approved,
            "Milestone not approved"
        );

        uint256 milestoneAmount = milestones[milestoneId].amount;

        milestones[milestoneId].status = MilestoneStatus.Paid;
        projectInfo.totalPaid += milestoneAmount;
        projectInfo.completedMilestones++;

        _transfer(milestones[milestoneId].worker, milestoneAmount);

        emit MilestonePaymentReleased(
            milestoneId,
            milestones[milestoneId].worker,
            milestoneAmount,
            0,
            block.timestamp
        );

        if (projectInfo.completedMilestones == projectInfo.milestoneCount) {
            projectInfo.currentPhase = Phase.Completed;
            emit ProjectCompleted(
                projectInfo.totalPaid,
                projectInfo.platformFeeCollected,
                block.timestamp
            );
        }
    }

    // settle via yellow network - batch payment in one tx
    function settleWithYellowProof(
        uint256[] calldata approvedMilestoneIds,
        uint256[] calldata cancelledMilestoneIds,
        string calldata yellowSessionId
    ) external payable onlyClient nonReentrant {
        require(
            projectInfo.currentPhase == Phase.Funded ||
                projectInfo.currentPhase == Phase.InProgress,
            "Project not in settleable phase"
        );

        uint256 totalApprovalFees = 0;
        for (uint256 i = 0; i < approvedMilestoneIds.length; i++) {
            uint256 milestoneId = approvedMilestoneIds[i];
            require(milestones[milestoneId].exists, "Milestone does not exist");
            require(
                milestones[milestoneId].status == MilestoneStatus.Pending ||
                    milestones[milestoneId].status == MilestoneStatus.Submitted,
                "Milestone not in valid status for settlement"
            );
            totalApprovalFees +=
                (milestones[milestoneId].amount * APPROVAL_FEE_BPS) /
                BPS_DENOMINATOR;
        }

        if (projectInfo.paymentToken == address(0)) {
            require(
                msg.value >= totalApprovalFees,
                "Insufficient approval fees"
            );
            if (totalApprovalFees > 0) {
                (bool sent, ) = platform.call{value: totalApprovalFees}("");
                require(sent, "Fee transfer failed");
            }
            if (msg.value > totalApprovalFees) {
                (bool refunded, ) = msg.sender.call{
                    value: msg.value - totalApprovalFees
                }("");
                require(refunded, "Refund failed");
            }
        } else {
            if (totalApprovalFees > 0) {
                IERC20(projectInfo.paymentToken).safeTransferFrom(
                    msg.sender,
                    platform,
                    totalApprovalFees
                );
            }
        }

        projectInfo.platformFeeCollected += totalApprovalFees;

        for (uint256 i = 0; i < approvedMilestoneIds.length; i++) {
            uint256 milestoneId = approvedMilestoneIds[i];
            uint256 amount = milestones[milestoneId].amount;
            address worker = milestones[milestoneId].worker;

            milestones[milestoneId].status = MilestoneStatus.Paid;
            projectInfo.totalPaid += amount;
            projectInfo.completedMilestones++;

            _transfer(worker, amount);

            emit MilestonePaymentReleased(
                milestoneId,
                worker,
                amount,
                0,
                block.timestamp
            );
        }

        for (uint256 i = 0; i < cancelledMilestoneIds.length; i++) {
            uint256 milestoneId = cancelledMilestoneIds[i];
            require(
                milestones[milestoneId].exists,
                "Cancelled milestone does not exist"
            );
            require(
                milestones[milestoneId].status == MilestoneStatus.Pending ||
                    milestones[milestoneId].status == MilestoneStatus.Disputed,
                "Cancelled milestone not in valid status"
            );

            uint256 amount = milestones[milestoneId].amount;
            milestones[milestoneId].status = MilestoneStatus.Cancelled;
            projectInfo.completedMilestones++;

            _transfer(projectInfo.client, amount);

            emit MilestoneRefunded(
                milestoneId,
                projectInfo.client,
                amount,
                "Yellow settlement - cancelled",
                block.timestamp
            );
        }

        emit YellowSettlement(
            yellowSessionId,
            approvedMilestoneIds.length,
            cancelledMilestoneIds.length,
            projectInfo.totalPaid,
            totalApprovalFees,
            block.timestamp
        );

        if (projectInfo.completedMilestones == projectInfo.milestoneCount) {
            projectInfo.currentPhase = Phase.Completed;
            emit ProjectCompleted(
                projectInfo.totalPaid,
                projectInfo.platformFeeCollected,
                block.timestamp
            );
        }
    }

    event YellowSettlement(
        string indexed sessionId,
        uint256 approvedCount,
        uint256 cancelledCount,
        uint256 totalPaid,
        uint256 totalFees,
        uint256 timestamp
    );

    // raise dispute - client or worker can raise
    function raiseDispute(
        uint256 milestoneId,
        DisputeType disputeType,
        string calldata reason
    )
        external
        override
        onlyClientOrWorker(milestoneId)
        milestoneExists(milestoneId)
        nonReentrant
    {
        require(
            milestones[milestoneId].status == MilestoneStatus.Pending ||
                milestones[milestoneId].status == MilestoneStatus.Submitted ||
                milestones[milestoneId].status == MilestoneStatus.UnderRevision,
            "Cannot dispute in current status"
        );
        require(
            !disputes[milestoneId].exists || disputes[milestoneId].resolved,
            "Dispute already exists"
        );
        require(disputeType != DisputeType.None, "Invalid dispute type");
        require(bytes(reason).length > 0, "Empty reason");

        MilestoneStatus _previousStatus = milestones[milestoneId].status;

        disputes[milestoneId] = Dispute({
            milestoneId: milestoneId,
            disputeType: disputeType,
            initiator: msg.sender,
            reason: reason,
            raisedAt: block.timestamp,
            resolved: false,
            winner: address(0),
            exists: true,
            previousStatus: _previousStatus
        });

        milestones[milestoneId].status = MilestoneStatus.Disputed;

        if (projectInfo.currentPhase != Phase.Disputed) {
            projectInfo.currentPhase = Phase.Disputed;
        }

        emit DisputeRaised(
            milestoneId,
            msg.sender,
            disputeType,
            reason,
            block.timestamp
        );
    }

    // resolve dispute - platform only
    function resolveDispute(
        uint256 milestoneId,
        address winner
    )
        external
        override
        onlyPlatform
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Disputed)
        nonReentrant
    {
        require(
            disputes[milestoneId].exists && !disputes[milestoneId].resolved,
            "No active dispute"
        );
        require(
            winner == projectInfo.client ||
                winner == milestones[milestoneId].worker,
            "Invalid winner"
        );

        disputes[milestoneId].resolved = true;
        disputes[milestoneId].winner = winner;

        emit DisputeResolved(milestoneId, winner, msg.sender, block.timestamp);

        if (winner == milestones[milestoneId].worker) {
            milestones[milestoneId].status = MilestoneStatus.Approved;
            _releaseMilestonePayment(milestoneId);
        } else {
            milestones[milestoneId].status = MilestoneStatus.Cancelled;
            _refundMilestone(milestoneId, "Dispute resolved in client's favor");
        }

        _updateProjectPhaseAfterDispute();
    }

    // cancel dispute and restore previous state - platform only
    function cancelDispute(
        uint256 milestoneId
    )
        external
        override
        onlyPlatform
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Disputed)
        nonReentrant
    {
        require(
            disputes[milestoneId].exists && !disputes[milestoneId].resolved,
            "No active dispute"
        );

        disputes[milestoneId].resolved = true;
        disputes[milestoneId].winner = address(0);

        milestones[milestoneId].status = disputes[milestoneId].previousStatus;

        emit DisputeCancelled(milestoneId, msg.sender, block.timestamp);

        _updateProjectPhaseAfterDispute();
    }

    // extend deadline - requires both parties agreement
    function extendMilestoneDeadline(
        uint256 milestoneId,
        uint256 additionalTime
    )
        external
        override
        onlyClientOrWorker(milestoneId)
        milestoneExists(milestoneId)
        nonReentrant
    {
        require(
            milestones[milestoneId].status == MilestoneStatus.Pending ||
                milestones[milestoneId].status == MilestoneStatus.Submitted ||
                milestones[milestoneId].status == MilestoneStatus.UnderRevision,
            "Cannot extend in current status"
        );
        require(
            additionalTime > 0 && additionalTime <= MAX_DEADLINE_EXTENSION,
            "Invalid extension"
        );

        uint256 newDeadline = milestones[milestoneId].deadline + additionalTime;

        proposedDeadlineExtension[milestoneId][msg.sender] = newDeadline;

        address otherParty = msg.sender == projectInfo.client
            ? milestones[milestoneId].worker
            : projectInfo.client;

        if (proposedDeadlineExtension[milestoneId][otherParty] == newDeadline) {
            milestones[milestoneId].deadline = newDeadline;

            delete proposedDeadlineExtension[milestoneId][projectInfo.client];
            delete proposedDeadlineExtension[milestoneId][
                milestones[milestoneId].worker
            ];

            emit MilestoneDeadlineExtended(
                milestoneId,
                newDeadline,
                msg.sender,
                block.timestamp
            );
        }
    }

    // check if deadline passed
    function isMilestoneDeadlinePassed(
        uint256 milestoneId
    ) external view override milestoneExists(milestoneId) returns (bool) {
        return block.timestamp > milestones[milestoneId].deadline;
    }

    // client claims refund if worker missed deadline
    function claimMilestoneRefundAfterDeadline(
        uint256 milestoneId
    )
        external
        override
        onlyClient
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Pending)
        nonReentrant
    {
        require(
            block.timestamp > milestones[milestoneId].deadline,
            "Deadline not passed"
        );
        require(
            deliverables[milestoneId].submittedAt == 0,
            "Work already submitted"
        );

        milestones[milestoneId].status = MilestoneStatus.Cancelled;
        _refundMilestone(milestoneId, "Worker missed deadline");
    }

    // worker cancels their milestone - before starting work
    function cancelMilestone(
        uint256 milestoneId
    )
        external
        override
        onlyWorker(milestoneId)
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Pending)
        nonReentrant
    {
        require(
            deliverables[milestoneId].submittedAt == 0,
            "Work already submitted"
        );

        milestones[milestoneId].status = MilestoneStatus.Cancelled;
        _refundMilestone(milestoneId, "Worker cancelled milestone");
    }

    // emergency refund by platform - milestoneId 0 for entire project
    function emergencyRefund(
        uint256 milestoneId,
        string calldata reason
    ) external override onlyPlatform nonReentrant {
        if (milestoneId == 0) {
            _refundEntireProject(reason);
        } else {
            require(milestones[milestoneId].exists, "Milestone does not exist");
            require(
                milestones[milestoneId].status != MilestoneStatus.Paid &&
                    milestones[milestoneId].status != MilestoneStatus.Cancelled,
                "Milestone already finalized"
            );

            milestones[milestoneId].status = MilestoneStatus.Cancelled;
            _refundMilestone(milestoneId, reason);
        }
    }

    // internal refund for specific milestone
    function _refundMilestone(
        uint256 milestoneId,
        string memory reason
    ) private {
        uint256 refundAmount = milestones[milestoneId].amount;

        _transfer(projectInfo.client, refundAmount);

        emit MilestoneRefunded(
            milestoneId,
            projectInfo.client,
            refundAmount,
            reason,
            block.timestamp
        );

        projectInfo.completedMilestones++;

        if (projectInfo.completedMilestones == projectInfo.milestoneCount) {
            projectInfo.currentPhase = Phase.Refunded;
        }
    }

    // refund entire project
    function _refundEntireProject(string memory reason) private {
        uint256 totalRefund = 0;

        for (uint256 i = 1; i < nextMilestoneId; i++) {
            if (
                milestones[i].exists &&
                milestones[i].status != MilestoneStatus.Paid &&
                milestones[i].status != MilestoneStatus.Cancelled
            ) {
                totalRefund += milestones[i].amount;
                milestones[i].status = MilestoneStatus.Cancelled;

                emit MilestoneRefunded(
                    i,
                    projectInfo.client,
                    milestones[i].amount,
                    reason,
                    block.timestamp
                );
            }
        }

        if (totalRefund > 0) {
            _transfer(projectInfo.client, totalRefund);
        }

        projectInfo.currentPhase = Phase.Refunded;
    }

    // internal transfer for eth or erc20
    function _transfer(address to, uint256 amount) private {
        if (projectInfo.paymentToken == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(projectInfo.paymentToken).safeTransfer(to, amount);
        }
    }

    // remove milestone from worker's list
    function _removeWorkerMilestone(
        address worker,
        uint256 milestoneId
    ) private {
        uint256[] storage milestoneIds = workerMilestones[worker];
        for (uint256 i = 0; i < milestoneIds.length; i++) {
            if (milestoneIds[i] == milestoneId) {
                milestoneIds[i] = milestoneIds[milestoneIds.length - 1];
                milestoneIds.pop();
                break;
            }
        }
    }

    // update project phase after dispute resolution
    function _updateProjectPhaseAfterDispute() private {
        bool hasActiveDispute = false;
        for (uint256 i = 1; i < nextMilestoneId; i++) {
            if (
                milestones[i].exists &&
                milestones[i].status == MilestoneStatus.Disputed
            ) {
                hasActiveDispute = true;
                break;
            }
        }

        if (!hasActiveDispute) {
            if (projectInfo.completedMilestones == projectInfo.milestoneCount) {
                projectInfo.currentPhase = Phase.Completed;
            } else {
                projectInfo.currentPhase = Phase.InProgress;
            }
        }
    }

    function getProjectInfo()
        external
        view
        override
        returns (ProjectInfo memory)
    {
        return projectInfo;
    }

    function getMilestone(
        uint256 milestoneId
    ) external view override returns (Milestone memory) {
        return milestones[milestoneId];
    }

    function getDeliverable(
        uint256 milestoneId
    ) external view override returns (Deliverable memory) {
        return deliverables[milestoneId];
    }

    function getDispute(
        uint256 milestoneId
    ) external view override returns (Dispute memory) {
        return disputes[milestoneId];
    }

    function getCurrentPhase() external view override returns (Phase) {
        return projectInfo.currentPhase;
    }

    function canDeposit() external view override returns (bool) {
        return
            projectInfo.currentPhase == Phase.Created &&
            projectInfo.allMilestonesCreated;
    }

    function canSubmit(
        uint256 milestoneId,
        address worker
    ) external view override returns (bool) {
        if (!milestones[milestoneId].exists) return false;
        if (milestones[milestoneId].worker != worker) return false;
        if (
            projectInfo.currentPhase != Phase.Funded &&
            projectInfo.currentPhase != Phase.InProgress
        ) return false;

        return
            milestones[milestoneId].status == MilestoneStatus.Pending ||
            milestones[milestoneId].status == MilestoneStatus.UnderRevision;
    }

    function canReview(
        uint256 milestoneId
    ) external view override returns (bool) {
        if (!milestones[milestoneId].exists) return false;
        return milestones[milestoneId].status == MilestoneStatus.Submitted;
    }

    function canDispute(
        uint256 milestoneId
    ) external view override returns (bool) {
        if (!milestones[milestoneId].exists) return false;

        return
            (milestones[milestoneId].status == MilestoneStatus.Pending ||
                milestones[milestoneId].status == MilestoneStatus.Submitted ||
                milestones[milestoneId].status ==
                MilestoneStatus.UnderRevision) &&
            (!disputes[milestoneId].exists || disputes[milestoneId].resolved);
    }

    function getRemainingRevisions(
        uint256 milestoneId
    ) external view override returns (uint256) {
        if (!milestones[milestoneId].exists) return 0;
        return
            milestones[milestoneId].revisionLimit -
            milestones[milestoneId].revisionCount;
    }

    // 0.5% deployment fee
    function calculateDeploymentFee(
        uint256 amount
    ) external pure override returns (uint256) {
        return (amount * DEPLOYMENT_FEE_BPS) / BPS_DENOMINATOR;
    }

    // 2.5% approval fee
    function calculateApprovalFee(
        uint256 amount
    ) external pure override returns (uint256) {
        return (amount * APPROVAL_FEE_BPS) / BPS_DENOMINATOR;
    }

    // legacy - returns 2.5% approval fee for compatibility
    function calculatePlatformFee(
        uint256 amount
    ) external pure override returns (uint256) {
        return (amount * APPROVAL_FEE_BPS) / BPS_DENOMINATOR;
    }

    function getMilestoneTimeRemaining(
        uint256 milestoneId
    ) external view override returns (uint256) {
        if (!milestones[milestoneId].exists) return 0;
        if (block.timestamp >= milestones[milestoneId].deadline) {
            return 0;
        }
        return milestones[milestoneId].deadline - block.timestamp;
    }

    function getAllMilestones()
        external
        view
        override
        returns (Milestone[] memory)
    {
        Milestone[] memory result = new Milestone[](projectInfo.milestoneCount);
        uint256 index = 0;

        for (
            uint256 i = 1;
            i < nextMilestoneId && index < projectInfo.milestoneCount;
            i++
        ) {
            if (milestones[i].exists) {
                result[index] = milestones[i];
                index++;
            }
        }

        return result;
    }

    function getWorkerMilestones(
        address worker
    ) external view override returns (uint256[] memory) {
        return workerMilestones[worker];
    }

    function getProjectProgress()
        external
        view
        override
        returns (
            uint256 totalMilestones,
            uint256 completedMilestones,
            uint256 totalPaid,
            uint256 remainingAmount
        )
    {
        return (
            projectInfo.milestoneCount,
            projectInfo.completedMilestones,
            projectInfo.totalPaid,
            projectInfo.totalAmount - projectInfo.totalPaid
        );
    }

    // check if all deps are completed
    function _areDependenciesCompleted(
        uint256 milestoneId
    ) internal view returns (bool) {
        uint256[] storage deps = milestoneDependencies[milestoneId];
        for (uint256 i = 0; i < deps.length; i++) {
            MilestoneStatus status = milestones[deps[i]].status;
            if (
                status != MilestoneStatus.Approved &&
                status != MilestoneStatus.Paid &&
                status != MilestoneStatus.Cancelled
            ) {
                return false;
            }
        }
        return true;
    }

    // get milestone dependencies
    function getMilestoneDependencies(
        uint256 milestoneId
    ) external view override returns (uint256[] memory) {
        return milestoneDependencies[milestoneId];
    }

    // check if deps are done
    function areDependenciesCompleted(
        uint256 milestoneId
    ) external view override returns (bool) {
        return _areDependenciesCompleted(milestoneId);
    }

    // receive eth from client during created phase
    receive() external payable {
        require(msg.sender == projectInfo.client, "Only client can send ETH");
        require(
            projectInfo.currentPhase == Phase.Created,
            "Only during Created phase"
        );
    }
}
