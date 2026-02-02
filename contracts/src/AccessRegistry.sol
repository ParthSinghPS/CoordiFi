// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract AccessRegistry is Ownable {
    error InvalidRoot();
    error InvalidProof();
    error AccessAlreadyUsed();
    error AccessTypeNotFound();
    error Unauthorized();

    struct AccessType {
        bytes32 merkleRoot;
        string name;
        bool active;
        uint256 createdAt;
        uint256 updatedAt;
    }

    mapping(bytes32 => AccessType) public accessTypes;
    mapping(bytes32 => bool) public usedAccess;
    mapping(bytes32 => address) public accessUsedBy;
    mapping(address => bool) public authorizedVerifiers;
    bytes32[] public accessTypeIds;

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
    event VerifierAuthorized(address indexed verifier, bool authorized);

    constructor() {
        authorizedVerifiers[msg.sender] = true;
    }

    modifier onlyAuthorized() {
        if (!authorizedVerifiers[msg.sender] && msg.sender != owner()) {
            revert Unauthorized();
        }
        _;
    }

    function createAccessType(
        bytes32 accessTypeId,
        string calldata name,
        bytes32 merkleRoot
    ) external onlyOwner {
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (accessTypes[accessTypeId].createdAt != 0) revert InvalidRoot();

        accessTypes[accessTypeId] = AccessType({
            merkleRoot: merkleRoot,
            name: name,
            active: true,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        accessTypeIds.push(accessTypeId);
        emit AccessTypeCreated(accessTypeId, name, merkleRoot);
    }

    function updateMerkleRoot(bytes32 accessTypeId, bytes32 newMerkleRoot) external onlyOwner {
        if (newMerkleRoot == bytes32(0)) revert InvalidRoot();
        if (accessTypes[accessTypeId].createdAt == 0) revert AccessTypeNotFound();

        accessTypes[accessTypeId].merkleRoot = newMerkleRoot;
        accessTypes[accessTypeId].updatedAt = block.timestamp;
        emit AccessTypeUpdated(accessTypeId, newMerkleRoot);
    }

    function deactivateAccessType(bytes32 accessTypeId) external onlyOwner {
        if (accessTypes[accessTypeId].createdAt == 0) revert AccessTypeNotFound();
        accessTypes[accessTypeId].active = false;
        accessTypes[accessTypeId].updatedAt = block.timestamp;
        emit AccessTypeDeactivated(accessTypeId);
    }

    function setVerifierAuthorization(address verifier, bool authorized) external onlyOwner {
        authorizedVerifiers[verifier] = authorized;
        emit VerifierAuthorized(verifier, authorized);
    }

    function verifyAccess(
        bytes32 accessHash,
        address accessHolder,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (usedAccess[accessHash]) return false;

        for (uint256 i = 0; i < accessTypeIds.length; i++) {
            bytes32 accessTypeId = accessTypeIds[i];
            AccessType storage accessType = accessTypes[accessTypeId];
            
            if (!accessType.active) continue;

            bytes32 leaf = keccak256(abi.encodePacked(accessHash, accessHolder));
            
            if (MerkleProof.verify(proof, accessType.merkleRoot, leaf)) {
                return true;
            }
        }
        return false;
    }

    function markAccessUsed(bytes32 accessHash, address user) external onlyAuthorized {
        if (usedAccess[accessHash]) revert AccessAlreadyUsed();
        usedAccess[accessHash] = true;
        accessUsedBy[accessHash] = user;
        emit AccessUsed(accessHash, bytes32(0), user);
    }

    function getAccessType(bytes32 accessTypeId) external view returns (AccessType memory) {
        return accessTypes[accessTypeId];
    }

    function isAccessUsed(bytes32 accessHash) external view returns (bool) {
        return usedAccess[accessHash];
    }

    function getAccessTypeCount() external view returns (uint256) {
        return accessTypeIds.length;
    }

    function isAuthorizedVerifier(address verifier) external view returns (bool) {
        return authorizedVerifiers[verifier];
    }

    function computeNFTAccessHash(
        address nftContract,
        uint256 slotId,
        address accessHolder
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("NFT_WHITELIST", nftContract, slotId, accessHolder));
    }

    function computeOTCAccessHash(
        address maker,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        uint256 nonce
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked("OTC_TRADE", maker, sellToken, buyToken, sellAmount, buyAmount, nonce));
    }
}
