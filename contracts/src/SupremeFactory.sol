// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

interface ISupremeFactory {
    function platformFeeBPS() external view returns (uint256);
    function feeCollector() external view returns (address);
    function recordSettlement(uint256 volume, uint256 fee) external;
}

contract SupremeFactory is Ownable, ISupremeFactory {
    using Clones for address;

    enum InstanceType {
        NFT,
        OTC,
        FREELANCE
    }
    enum EscrowStatus {
        ACTIVE,
        SETTLED,
        REFUNDED,
        CANCELLED
    }

    struct EscrowInstance {
        address escrowAddress;
        address creator;
        InstanceType instanceType;
        uint256 createdAt;
        EscrowStatus status;
    }

    address public nftEscrowTemplate;
    address public otcEscrowTemplate;
    address public freelanceEscrowTemplate;

    uint256 public platformFeeBPS = 500;
    address public feeCollector;
    uint256 public nextInstanceId = 1;
    uint256 public totalVolume;
    uint256 public totalFees;

    mapping(uint256 => EscrowInstance) public instances;
    mapping(address => uint256[]) public userInstances;
    mapping(address => bool) public validEscrows;

    event NFTEscrowDeployed(
        uint256 indexed instanceId,
        address indexed escrow,
        address indexed smartMintWallet,
        address wlHolder,
        address capitalHolder,
        address nftContract,
        uint256 mintPrice
    );
    event OTCEscrowDeployed(
        uint256 indexed instanceId,
        address indexed escrow,
        address indexed maker,
        address assetA,
        address assetB,
        uint256 amountA,
        uint256 amountB
    );
    event FreelanceEscrowDeployed(
        uint256 indexed instanceId,
        address indexed escrow,
        address indexed client,
        address paymentToken,
        uint256 totalAmount,
        uint256 milestoneCount
    );
    event InstanceStatusUpdated(
        uint256 indexed instanceId,
        EscrowStatus newStatus
    );
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(address oldCollector, address newCollector);

    error InvalidAddress();
    error InvalidFee();
    error NotValidEscrow();
    error InstanceNotFound();

    constructor(address _feeCollector) Ownable(msg.sender) {
        if (_feeCollector == address(0)) revert InvalidAddress();
        feeCollector = _feeCollector;
    }

    function setTemplates(
        address _nftTemplate,
        address _otcTemplate,
        address _freelanceTemplate
    ) external onlyOwner {
        nftEscrowTemplate = _nftTemplate;
        otcEscrowTemplate = _otcTemplate;
        freelanceEscrowTemplate = _freelanceTemplate;
    }

    function setPlatformFee(uint256 newFeeBPS) external onlyOwner {
        if (newFeeBPS > 1000) revert InvalidFee();
        emit PlatformFeeUpdated(platformFeeBPS, newFeeBPS);
        platformFeeBPS = newFeeBPS;
    }

    function setFeeCollector(address newCollector) external onlyOwner {
        if (newCollector == address(0)) revert InvalidAddress();
        emit FeeCollectorUpdated(feeCollector, newCollector);
        feeCollector = newCollector;
    }

    function recordSettlement(uint256 volume, uint256 fee) external override {
        if (!validEscrows[msg.sender]) revert NotValidEscrow();
        totalVolume += volume;
        totalFees += fee;
    }

    function updateInstanceStatus(
        uint256 instanceId,
        EscrowStatus status
    ) external {
        if (!validEscrows[msg.sender]) revert NotValidEscrow();
        if (instances[instanceId].escrowAddress == address(0))
            revert InstanceNotFound();
        instances[instanceId].status = status;
        emit InstanceStatusUpdated(instanceId, status);
    }

    function getInstance(
        uint256 instanceId
    ) external view returns (EscrowInstance memory) {
        return instances[instanceId];
    }

    function getUserInstances(
        address user
    ) external view returns (uint256[] memory) {
        return userInstances[user];
    }

    function _createInstance(
        address escrow,
        address creator,
        InstanceType instanceType
    ) internal returns (uint256 instanceId) {
        instanceId = nextInstanceId++;
        instances[instanceId] = EscrowInstance({
            escrowAddress: escrow,
            creator: creator,
            instanceType: instanceType,
            createdAt: block.timestamp,
            status: EscrowStatus.ACTIVE
        });
        userInstances[creator].push(instanceId);
        validEscrows[escrow] = true;
    }
}
