// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAccessRegistry {
    struct AccessType {
        bytes32 merkleRoot;
        string name;
        bool active;
        uint256 createdAt;
        uint256 updatedAt;
    }

    function verifyAccess(
        bytes32 accessHash,
        address accessHolder,
        bytes32[] calldata proof
    ) external view returns (bool);
    function isAccessUsed(bytes32 accessHash) external view returns (bool);
    function getAccessType(
        bytes32 accessTypeId
    ) external view returns (AccessType memory);
    function isAuthorizedVerifier(
        address verifier
    ) external view returns (bool);
    function markAccessUsed(bytes32 accessHash, address user) external;

    event AccessTypeCreated(
        bytes32 indexed accessTypeId,
        string name,
        bytes32 merkleRoot
    );
    event AccessTypeUpdated(
        bytes32 indexed accessTypeId,
        bytes32 newMerkleRoot
    );
    event AccessTypeDeactivated(bytes32 indexed accessTypeId);
    event AccessUsed(
        bytes32 indexed accessHash,
        bytes32 indexed accessTypeId,
        address indexed user
    );
}
