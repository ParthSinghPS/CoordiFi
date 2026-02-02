// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FreelanceEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant PLATFORM_FEE_BPS = 250;
    uint256 private constant BPS_DENOMINATOR = 10000;
    uint256 private constant MAX_MILESTONES = 20;

    enum Phase {
        Created,
        Funded,
        InProgress,
        Completed,
        Disputed,
        Refunded
    }
    enum MilestoneStatus {
        Pending,
        Submitted,
        UnderRevision,
        Approved,
        Paid,
        Disputed,
        Cancelled
    }
    enum DisputeType {
        None,
        QualityIssue,
        MissedDeadline,
        ScopeChange,
        NonPayment
    }

    struct ProjectInfo {
        address client;
        address paymentToken;
        uint256 totalAmount;
        uint256 totalPaid;
        Phase currentPhase;
        uint256 milestoneCount;
        uint256 completedMilestones;
        bool finalized;
    }

    struct Milestone {
        uint256 id;
        address worker;
        uint256 amount;
        uint256 deadline;
        uint256 revisionLimit;
        uint256 revisionCount;
        MilestoneStatus status;
        string description;
        bool exists;
    }

    struct Deliverable {
        string ipfsHash;
        string description;
        uint256 submittedAt;
    }

    struct Dispute {
        DisputeType disputeType;
        address initiator;
        string reason;
        bool resolved;
        address winner;
        bool exists;
    }

    address public platform;
    ProjectInfo public projectInfo;

    mapping(uint256 => Milestone) public milestones;
    mapping(uint256 => Deliverable) public deliverables;
    mapping(uint256 => Dispute) public disputes;

    bool private initialized;
    uint256 private nextMilestoneId = 1;

    event Initialized(
        address indexed client,
        address paymentToken,
        uint256 totalAmount
    );
    event MilestoneAdded(
        uint256 indexed id,
        address worker,
        uint256 amount,
        uint256 deadline
    );
    event FundsDeposited(address indexed client, uint256 amount);
    event WorkSubmitted(
        uint256 indexed milestoneId,
        address worker,
        string ipfsHash
    );
    event MilestoneApproved(uint256 indexed milestoneId);
    event RevisionRequested(uint256 indexed milestoneId, uint256 revisionCount);
    event PaymentReleased(
        uint256 indexed milestoneId,
        address worker,
        uint256 amount,
        uint256 fee
    );
    event DisputeRaised(
        uint256 indexed milestoneId,
        address initiator,
        DisputeType disputeType
    );
    event DisputeResolved(uint256 indexed milestoneId, address winner);
    event MilestoneRefunded(uint256 indexed milestoneId, uint256 amount);
    event ProjectCompleted(uint256 totalPaid);

    error AlreadyInitialized();
    error OnlyClient();
    error OnlyWorker();
    error OnlyPlatform();
    error InvalidPhase();
    error InvalidStatus();
    error MilestoneNotFound();
    error DeadlinePassed();
    error RevisionLimitReached();

    modifier onlyClient() {
        if (msg.sender != projectInfo.client) revert OnlyClient();
        _;
    }

    modifier onlyPlatform() {
        if (msg.sender != platform) revert OnlyPlatform();
        _;
    }

    function initialize(
        address _client,
        address _paymentToken,
        uint256 _totalAmount,
        address _platform
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;

        platform = _platform;
        projectInfo = ProjectInfo({
            client: _client,
            paymentToken: _paymentToken,
            totalAmount: _totalAmount,
            totalPaid: 0,
            currentPhase: Phase.Created,
            milestoneCount: 0,
            completedMilestones: 0,
            finalized: false
        });

        emit Initialized(_client, _paymentToken, _totalAmount);
    }

    function addMilestone(
        address worker,
        uint256 amount,
        uint256 deadline,
        uint256 revisionLimit,
        string calldata description
    ) external onlyClient returns (uint256 milestoneId) {
        require(projectInfo.currentPhase == Phase.Created, "Wrong phase");
        require(!projectInfo.finalized, "Already finalized");
        require(projectInfo.milestoneCount < MAX_MILESTONES, "Too many");
        require(
            worker != address(0) && worker != projectInfo.client,
            "Invalid worker"
        );
        require(amount > 0 && deadline > block.timestamp, "Invalid params");

        milestoneId = nextMilestoneId++;

        milestones[milestoneId] = Milestone({
            id: milestoneId,
            worker: worker,
            amount: amount,
            deadline: deadline,
            revisionLimit: revisionLimit,
            revisionCount: 0,
            status: MilestoneStatus.Pending,
            description: description,
            exists: true
        });

        projectInfo.milestoneCount++;
        emit MilestoneAdded(milestoneId, worker, amount, deadline);
    }

    function finalizeMilestones() external onlyClient {
        require(projectInfo.currentPhase == Phase.Created, "Wrong phase");
        require(!projectInfo.finalized, "Already finalized");
        require(projectInfo.milestoneCount > 0, "No milestones");

        uint256 total = 0;
        for (uint256 i = 1; i < nextMilestoneId; i++) {
            if (milestones[i].exists) total += milestones[i].amount;
        }
        require(total == projectInfo.totalAmount, "Amount mismatch");

        projectInfo.finalized = true;
    }

    function depositFunds() external payable onlyClient nonReentrant {
        require(projectInfo.currentPhase == Phase.Created, "Wrong phase");
        require(projectInfo.finalized, "Not finalized");

        if (projectInfo.paymentToken == address(0)) {
            require(msg.value == projectInfo.totalAmount, "Wrong ETH amount");
        } else {
            require(msg.value == 0, "ETH not accepted");
            IERC20(projectInfo.paymentToken).safeTransferFrom(
                msg.sender,
                address(this),
                projectInfo.totalAmount
            );
        }

        projectInfo.currentPhase = Phase.Funded;
        emit FundsDeposited(msg.sender, projectInfo.totalAmount);
    }

    function submitWork(
        uint256 milestoneId,
        string calldata ipfsHash,
        string calldata description
    ) external nonReentrant {
        Milestone storage m = milestones[milestoneId];
        if (!m.exists) revert MilestoneNotFound();
        if (msg.sender != m.worker) revert OnlyWorker();
        require(
            projectInfo.currentPhase == Phase.Funded ||
                projectInfo.currentPhase == Phase.InProgress,
            "Wrong phase"
        );
        require(
            m.status == MilestoneStatus.Pending ||
                m.status == MilestoneStatus.UnderRevision,
            "Cannot submit"
        );

        deliverables[milestoneId] = Deliverable({
            ipfsHash: ipfsHash,
            description: description,
            submittedAt: block.timestamp
        });

        m.status = MilestoneStatus.Submitted;

        if (projectInfo.currentPhase == Phase.Funded) {
            projectInfo.currentPhase = Phase.InProgress;
        }

        emit WorkSubmitted(milestoneId, msg.sender, ipfsHash);
    }

    function approveMilestone(
        uint256 milestoneId
    ) external onlyClient nonReentrant {
        Milestone storage m = milestones[milestoneId];
        if (!m.exists) revert MilestoneNotFound();
        require(m.status == MilestoneStatus.Submitted, "Not submitted");
        require(deliverables[milestoneId].submittedAt > 0, "No deliverable");

        m.status = MilestoneStatus.Approved;
        emit MilestoneApproved(milestoneId);

        _releaseMilestonePayment(milestoneId);
    }

    function requestRevision(
        uint256 milestoneId,
        string calldata feedback
    ) external onlyClient {
        Milestone storage m = milestones[milestoneId];
        if (!m.exists) revert MilestoneNotFound();
        require(m.status == MilestoneStatus.Submitted, "Not submitted");
        if (m.revisionCount >= m.revisionLimit) revert RevisionLimitReached();

        m.revisionCount++;
        m.status = MilestoneStatus.UnderRevision;

        emit RevisionRequested(milestoneId, m.revisionCount);
    }

    function _releaseMilestonePayment(uint256 milestoneId) private {
        Milestone storage m = milestones[milestoneId];
        require(m.status == MilestoneStatus.Approved, "Not approved");

        uint256 amount = m.amount;
        uint256 fee = (amount * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 workerReceives = amount - fee;

        m.status = MilestoneStatus.Paid;
        projectInfo.totalPaid += amount;
        projectInfo.completedMilestones++;

        _transfer(m.worker, workerReceives);

        if (fee > 0) {
            _transfer(platform, fee);
        }

        emit PaymentReleased(milestoneId, m.worker, workerReceives, fee);

        if (projectInfo.completedMilestones == projectInfo.milestoneCount) {
            projectInfo.currentPhase = Phase.Completed;
            emit ProjectCompleted(projectInfo.totalPaid);
        }
    }

    function raiseDispute(
        uint256 milestoneId,
        DisputeType disputeType,
        string calldata reason
    ) external {
        Milestone storage m = milestones[milestoneId];
        if (!m.exists) revert MilestoneNotFound();
        require(
            msg.sender == projectInfo.client || msg.sender == m.worker,
            "Not participant"
        );
        require(!disputes[milestoneId].exists, "Already disputed");

        disputes[milestoneId] = Dispute({
            disputeType: disputeType,
            initiator: msg.sender,
            reason: reason,
            resolved: false,
            winner: address(0),
            exists: true
        });

        m.status = MilestoneStatus.Disputed;
        projectInfo.currentPhase = Phase.Disputed;

        emit DisputeRaised(milestoneId, msg.sender, disputeType);
    }

    function resolveDispute(
        uint256 milestoneId,
        address winner
    ) external onlyPlatform nonReentrant {
        Milestone storage m = milestones[milestoneId];
        if (!m.exists) revert MilestoneNotFound();
        require(m.status == MilestoneStatus.Disputed, "Not disputed");
        require(
            winner == projectInfo.client || winner == m.worker,
            "Invalid winner"
        );

        disputes[milestoneId].resolved = true;
        disputes[milestoneId].winner = winner;

        if (winner == m.worker) {
            m.status = MilestoneStatus.Approved;
            _releaseMilestonePayment(milestoneId);
        } else {
            m.status = MilestoneStatus.Cancelled;
            _refundMilestone(milestoneId);
        }

        emit DisputeResolved(milestoneId, winner);
        _checkAllDisputesResolved();
    }

    function _refundMilestone(uint256 milestoneId) private {
        uint256 amount = milestones[milestoneId].amount;
        _transfer(projectInfo.client, amount);
        projectInfo.completedMilestones++;

        emit MilestoneRefunded(milestoneId, amount);
    }

    function _checkAllDisputesResolved() private {
        for (uint256 i = 1; i < nextMilestoneId; i++) {
            if (milestones[i].status == MilestoneStatus.Disputed) return;
        }

        if (projectInfo.completedMilestones == projectInfo.milestoneCount) {
            projectInfo.currentPhase = Phase.Completed;
        } else {
            projectInfo.currentPhase = Phase.InProgress;
        }
    }

    function claimRefundAfterDeadline(
        uint256 milestoneId
    ) external onlyClient nonReentrant {
        Milestone storage m = milestones[milestoneId];
        if (!m.exists) revert MilestoneNotFound();
        require(m.status == MilestoneStatus.Pending, "Not pending");
        require(block.timestamp > m.deadline, "Deadline not passed");
        require(
            deliverables[milestoneId].submittedAt == 0,
            "Already submitted"
        );

        m.status = MilestoneStatus.Cancelled;
        _refundMilestone(milestoneId);
    }

    function _transfer(address to, uint256 amount) private {
        if (projectInfo.paymentToken == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(projectInfo.paymentToken).safeTransfer(to, amount);
        }
    }

    function getProjectInfo() external view returns (ProjectInfo memory) {
        return projectInfo;
    }

    function getMilestone(uint256 id) external view returns (Milestone memory) {
        return milestones[id];
    }

    function getDeliverable(
        uint256 id
    ) external view returns (Deliverable memory) {
        return deliverables[id];
    }

    function getDispute(uint256 id) external view returns (Dispute memory) {
        return disputes[id];
    }

    function getAllMilestones() external view returns (Milestone[] memory) {
        Milestone[] memory result = new Milestone[](projectInfo.milestoneCount);
        uint256 idx = 0;
        for (
            uint256 i = 1;
            i < nextMilestoneId && idx < projectInfo.milestoneCount;
            i++
        ) {
            if (milestones[i].exists) {
                result[idx++] = milestones[i];
            }
        }
        return result;
    }

    receive() external payable {
        require(msg.sender == projectInfo.client, "Only client");
    }
}
