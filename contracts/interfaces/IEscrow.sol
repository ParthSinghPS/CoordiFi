// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEscrow {
    enum Status {
        NONE,
        LOCKED,
        VERIFIED,
        SETTLED,
        REFUNDED
    }

    struct Coordination {
        uint256 id;
        address investor;
        address accessHolder;
        uint256 amount;
        bytes32 accessHash;
        Status status;
        uint256 deadline;
        address assetContract;
        uint256 assetId;
        uint256 createdAt;
    }

    struct CreateParams {
        address accessHolder;
        uint256 amount;
        bytes32 accessHash;
        uint256 deadline;
        address assetContract;
        uint256 assetId;
    }

    function lockCapital(
        CreateParams calldata params
    ) external returns (uint256 coordinationId);
    function verifyAccess(
        uint256 coordinationId,
        bytes32[] calldata proof
    ) external;
    function settle(uint256 coordinationId) external;
    function refund(uint256 coordinationId) external;
    function getCoordination(
        uint256 coordinationId
    ) external view returns (Coordination memory);
    function isAccessUsed(bytes32 accessHash) external view returns (bool);

    event CapitalLocked(
        uint256 indexed coordinationId,
        address indexed investor,
        address indexed accessHolder,
        uint256 amount,
        bytes32 accessHash,
        uint256 deadline
    );
    event AccessVerified(
        uint256 indexed coordinationId,
        address indexed verifier,
        uint256 timestamp
    );
    event Settled(
        uint256 indexed coordinationId,
        address indexed accessHolder,
        uint256 accessHolderAmount,
        uint256 platformFee
    );
    event Refunded(
        uint256 indexed coordinationId,
        address indexed investor,
        uint256 amount
    );
}
