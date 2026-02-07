// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// freelance escrow interface - milestone-based payments with multiple workers
interface IFreelanceEscrow {
    // escrow lifecycle phase
    enum Phase {
        Created,
        Funded,
        InProgress,
        Completed,
        Disputed,
        Refunded
    }

    // milestone status
    enum MilestoneStatus {
        Pending,
        Submitted,
        UnderRevision,
        Approved,
        Paid,
        Disputed,
        Cancelled
    }

    // dispute type
    enum DisputeType {
        None,
        QualityIssue,
        MissedDeadline,
        ScopeChange,
        NonPayment,
        Abandonment
    }

    // project config and state
    struct ProjectInfo {
        address client;
        address paymentToken;
        uint256 totalAmount;
        uint256 totalPaid;
        uint256 platformFeeCollected;
        Phase currentPhase;
        uint256 fundedAt;
        uint256 milestoneCount;
        uint256 completedMilestones;
        bool allMilestonesCreated;
    }

    // milestone info - each can have different worker, amount, deadline
    struct Milestone {
        uint256 milestoneId;
        address worker;
        uint256 amount;
        uint256 deadline;
        uint256 revisionLimit;
        uint256 revisionCount;
        MilestoneStatus status;
        string description;
        uint256 createdAt;
        bool exists;
    }

    // work submission for a milestone
    struct Deliverable {
        uint256 milestoneId;
        string ipfsHash;
        string description;
        uint256 submittedAt;
        address submittedBy;
    }

    // dispute info
    struct Dispute {
        uint256 milestoneId;
        DisputeType disputeType;
        address initiator;
        string reason;
        uint256 raisedAt;
        bool resolved;
        address winner;
        bool exists;
        MilestoneStatus previousStatus;
    }

    // input for creating milestones at init
    struct MilestoneInput {
        address worker;
        uint256 amount;
        uint256 deadline;
        uint256 revisionLimit;
        string description;
        uint256[] dependencies;
    }

    event EscrowInitialized(
        address indexed client,
        address paymentToken,
        uint256 totalAmount
    );

    event EscrowInitializedWithMilestones(
        address indexed client,
        address paymentToken,
        uint256 totalAmount,
        uint256 milestoneCount
    );

    event MilestoneAdded(
        uint256 indexed milestoneId,
        address indexed worker,
        uint256 amount,
        uint256 deadline,
        string description
    );

    event AllMilestonesCreated(uint256 totalMilestones, uint256 totalAmount);

    event FundsDeposited(
        address indexed client,
        uint256 amount,
        uint256 timestamp
    );

    event WorkSubmitted(
        uint256 indexed milestoneId,
        address indexed worker,
        string ipfsHash,
        string description,
        uint256 timestamp
    );

    event MilestoneApproved(
        uint256 indexed milestoneId,
        address indexed client,
        uint256 timestamp
    );

    event RevisionRequested(
        uint256 indexed milestoneId,
        address indexed client,
        uint256 revisionCount,
        string feedback,
        uint256 timestamp
    );

    event MilestonePaymentReleased(
        uint256 indexed milestoneId,
        address indexed worker,
        uint256 amount,
        uint256 platformFee,
        uint256 timestamp
    );

    event DisputeRaised(
        uint256 indexed milestoneId,
        address indexed initiator,
        DisputeType disputeType,
        string reason,
        uint256 timestamp
    );

    event DisputeResolved(
        uint256 indexed milestoneId,
        address indexed winner,
        address indexed resolver,
        uint256 timestamp
    );

    event DisputeCancelled(
        uint256 indexed milestoneId,
        address indexed canceller,
        uint256 timestamp
    );

    event MilestoneRefunded(
        uint256 indexed milestoneId,
        address indexed client,
        uint256 amount,
        string reason,
        uint256 timestamp
    );

    event MilestoneDeadlineExtended(
        uint256 indexed milestoneId,
        uint256 newDeadline,
        address indexed extendedBy,
        uint256 timestamp
    );

    event ProjectCompleted(
        uint256 totalPaid,
        uint256 platformFees,
        uint256 timestamp
    );

    // init escrow without milestones (legacy)
    function initialize(
        address _client,
        address _paymentToken,
        uint256 _totalAmount,
        address _platform
    ) external;

    // init with milestones in one tx - locked after
    function initializeWithMilestones(
        address _client,
        address _paymentToken,
        uint256 _totalAmount,
        address _platform,
        MilestoneInput[] calldata _milestones
    ) external payable;

    // add milestone before funding
    function addMilestone(
        address worker,
        uint256 amount,
        uint256 deadline,
        uint256 revisionLimit,
        string calldata description
    ) external returns (uint256 milestoneId);

    // lock milestones before deposit
    function finalizeMilestones() external;

    // update worker before work starts
    function updateMilestoneWorker(
        uint256 milestoneId,
        address newWorker
    ) external;

    // client deposits funds
    function depositFunds() external payable;

    // worker submits deliverable
    function submitWork(
        uint256 milestoneId,
        string calldata ipfsHash,
        string calldata description
    ) external;

    // client approves and pays - 2.5% approval fee
    function approveMilestone(uint256 milestoneId) external payable;

    // client requests revision
    function requestRevision(
        uint256 milestoneId,
        string calldata feedback
    ) external;

    // batch settle via yellow network - one tx for all milestones
    function settleWithYellowProof(
        uint256[] calldata approvedMilestoneIds,
        uint256[] calldata cancelledMilestoneIds,
        string calldata yellowSessionId
    ) external payable;

    // raise dispute
    function raiseDispute(
        uint256 milestoneId,
        DisputeType disputeType,
        string calldata reason
    ) external;

    // platform resolves dispute
    function resolveDispute(uint256 milestoneId, address winner) external;

    // cancel dispute
    function cancelDispute(uint256 milestoneId) external;

    // extend deadline - both parties must agree
    function extendMilestoneDeadline(
        uint256 milestoneId,
        uint256 additionalTime
    ) external;

    // check if deadline passed
    function isMilestoneDeadlinePassed(
        uint256 milestoneId
    ) external view returns (bool);

    // client claims refund after worker missed deadline
    function claimMilestoneRefundAfterDeadline(uint256 milestoneId) external;

    // worker cancels milestone before starting
    function cancelMilestone(uint256 milestoneId) external;

    // platform emergency refund
    function emergencyRefund(
        uint256 milestoneId,
        string calldata reason
    ) external;

    function getProjectInfo() external view returns (ProjectInfo memory);
    function getMilestone(uint256 milestoneId) external view returns (Milestone memory);
    function getDeliverable(uint256 milestoneId) external view returns (Deliverable memory);
    function getDispute(uint256 milestoneId) external view returns (Dispute memory);
    function getCurrentPhase() external view returns (Phase);
    function canDeposit() external view returns (bool);
    function canSubmit(uint256 milestoneId, address worker) external view returns (bool);
    function canReview(uint256 milestoneId) external view returns (bool);
    function canDispute(uint256 milestoneId) external view returns (bool);
    function getRemainingRevisions(uint256 milestoneId) external view returns (uint256);

    // 0.5% deployment fee
    function calculateDeploymentFee(uint256 amount) external pure returns (uint256);

    // 2.5% approval fee
    function calculateApprovalFee(uint256 amount) external pure returns (uint256);

    // legacy - returns approval fee
    function calculatePlatformFee(uint256 amount) external pure returns (uint256);

    function getMilestoneTimeRemaining(uint256 milestoneId) external view returns (uint256);
    function getAllMilestones() external view returns (Milestone[] memory);
    function getWorkerMilestones(address worker) external view returns (uint256[] memory);
    function getProjectProgress() external view returns (
        uint256 totalMilestones,
        uint256 completedMilestones,
        uint256 totalPaid,
        uint256 remainingAmount
    );

    // get dependencies for a milestone
    function getMilestoneDependencies(uint256 milestoneId) external view returns (uint256[] memory);

    // check if all deps completed
    function areDependenciesCompleted(uint256 milestoneId) external view returns (bool);
}
