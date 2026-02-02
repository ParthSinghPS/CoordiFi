// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFreelanceEscrow {
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

    function initialize(
        address _client,
        address _paymentToken,
        uint256 _totalAmount,
        address _platform
    ) external;
    function addMilestone(
        address worker,
        uint256 amount,
        uint256 deadline,
        uint256 revisionLimit,
        string calldata description
    ) external returns (uint256 milestoneId);
    function finalizeMilestones() external;
    function depositFunds() external payable;
    function submitWork(
        uint256 milestoneId,
        string calldata ipfsHash,
        string calldata description
    ) external;
    function approveMilestone(uint256 milestoneId) external;
    function requestRevision(
        uint256 milestoneId,
        string calldata feedback
    ) external;
    function raiseDispute(
        uint256 milestoneId,
        DisputeType disputeType,
        string calldata reason
    ) external;
    function resolveDispute(uint256 milestoneId, address winner) external;
    function claimRefundAfterDeadline(uint256 milestoneId) external;
    function getProjectInfo() external view returns (ProjectInfo memory);
    function getMilestone(uint256 id) external view returns (Milestone memory);
    function getDeliverable(
        uint256 id
    ) external view returns (Deliverable memory);
    function getDispute(uint256 id) external view returns (Dispute memory);
    function getAllMilestones() external view returns (Milestone[] memory);
}
