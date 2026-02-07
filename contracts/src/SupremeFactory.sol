// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./templates/NFTEscrow.sol";
import "./templates/OTCEscrow.sol";
import "./templates/FreelanceEscrow.sol";
import "./SmartMintWallet.sol";
import "../interfaces/IFreelanceEscrow.sol";

// central factory for deploying escrow instances - uses eip-1167 minimal proxies
contract SupremeFactory is Ownable {
    enum InstanceType { NFT, OTC, FREELANCE }
    enum EscrowStatus { ACTIVE, SETTLED, REFUNDED, CANCELLED }
    
    struct EscrowInstance {
        address escrowAddress;
        address creator;
        InstanceType instanceType;
        uint256 createdAt;
        EscrowStatus status;
    }

    // templates - deployed once, cloned for each instance
    address public immutable nftEscrowTemplate;
    address public immutable otcEscrowTemplate;
    address public immutable freelanceEscrowTemplate;
    
    // instance registry
    mapping(uint256 => EscrowInstance) public instances;
    uint256 public nextInstanceId;
    
    // user to instance ids
    mapping(address => uint256[]) public userInstances;
    
    // platform economics
    uint256 public platformFeeBPS = 500;
    address public feeCollector;
    
    // total platform stats
    uint256 public totalVolume;
    uint256 public totalFees;

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
    error InvalidAmount();
    error FeeTooHigh();
    error InstanceNotFound();

    constructor(address _feeCollector) Ownable(msg.sender) {
        if (_feeCollector == address(0)) revert InvalidAddress();
        
        feeCollector = _feeCollector;
        
        nftEscrowTemplate = address(new NFTEscrow());
        otcEscrowTemplate = address(new OTCEscrow());
        freelanceEscrowTemplate = address(new FreelanceEscrow());
    }

    // deploy nft escrow for whitelist coordination
    function deployNFTEscrow(
        address wlHolder,
        address capitalHolder,
        address nftContract,
        uint256 mintPrice,
        uint256 splitBPS,
        uint256 deadline
    ) external returns (
        uint256 instanceId,
        address smartMintWallet,
        address escrowAddress
    ) {
        if (wlHolder == address(0) || capitalHolder == address(0)) revert InvalidAddress();
        if (nftContract == address(0)) revert InvalidAddress();
        if (mintPrice == 0) revert InvalidAmount();
        if (splitBPS > 10000) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidAmount();
        
        escrowAddress = Clones.clone(nftEscrowTemplate);
        
        smartMintWallet = address(new SmartMintWallet(escrowAddress, nftContract));
        
        NFTEscrow(payable(escrowAddress)).initialize(
            wlHolder,
            capitalHolder,
            smartMintWallet,
            nftContract,
            mintPrice,
            splitBPS,
            deadline,
            address(this)
        );
        
        instanceId = nextInstanceId++;
        instances[instanceId] = EscrowInstance({
            escrowAddress: escrowAddress,
            creator: msg.sender,
            instanceType: InstanceType.NFT,
            createdAt: block.timestamp,
            status: EscrowStatus.ACTIVE
        });
        
        userInstances[wlHolder].push(instanceId);
        userInstances[capitalHolder].push(instanceId);
        if (msg.sender != wlHolder && msg.sender != capitalHolder) {
            userInstances[msg.sender].push(instanceId);
        }
        
        emit NFTEscrowDeployed(
            instanceId,
            escrowAddress,
            smartMintWallet,
            wlHolder,
            capitalHolder,
            nftContract,
            mintPrice
        );
    }
    
    // deploy otc escrow for p2p trading
    function deployOTCEscrow(
        address maker,
        address assetA,
        address assetB,
        uint256 amountA,
        uint256 amountB,
        uint256 toleranceBPS,
        uint256 deadline
    ) external returns (
        uint256 instanceId,
        address escrowAddress
    ) {
        if (maker == address(0)) revert InvalidAddress();
        if (assetA == address(0) || assetB == address(0)) revert InvalidAddress();
        if (amountA == 0 || amountB == 0) revert InvalidAmount();
        if (toleranceBPS > 5000) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidAmount();
        
        escrowAddress = Clones.clone(otcEscrowTemplate);
        
        OTCEscrow(payable(escrowAddress)).initialize(
            maker,
            assetA,
            assetB,
            amountA,
            amountB,
            toleranceBPS,
            deadline,
            address(this)
        );
        
        instanceId = nextInstanceId++;
        instances[instanceId] = EscrowInstance({
            escrowAddress: escrowAddress,
            creator: msg.sender,
            instanceType: InstanceType.OTC,
            createdAt: block.timestamp,
            status: EscrowStatus.ACTIVE
        });
        
        userInstances[maker].push(instanceId);
        if (msg.sender != maker) {
            userInstances[msg.sender].push(instanceId);
        }
        
        emit OTCEscrowDeployed(
            instanceId,
            escrowAddress,
            maker,
            assetA,
            assetB,
            amountA,
            amountB
        );
    }
    
    // deploy freelance escrow for milestone-based projects
    function deployFreelanceEscrow(
        address client,
        address paymentToken,
        uint256 totalAmount
    ) external returns (
        uint256 instanceId,
        address escrowAddress
    ) {
        if (client == address(0)) revert InvalidAddress();
        if (totalAmount == 0) revert InvalidAmount();
        
        escrowAddress = Clones.clone(freelanceEscrowTemplate);
        
        FreelanceEscrow(payable(escrowAddress)).initialize(
            client,
            paymentToken,
            totalAmount,
            feeCollector
        );
        
        instanceId = nextInstanceId++;
        instances[instanceId] = EscrowInstance({
            escrowAddress: escrowAddress,
            creator: msg.sender,
            instanceType: InstanceType.FREELANCE,
            createdAt: block.timestamp,
            status: EscrowStatus.ACTIVE
        });
        
        userInstances[client].push(instanceId);
        if (msg.sender != client) {
            userInstances[msg.sender].push(instanceId);
        }
        
        emit FreelanceEscrowDeployed(
            instanceId,
            escrowAddress,
            client,
            paymentToken,
            totalAmount,
            0
        );
    }
    
    // deploy freelance escrow with milestones in one tx - client sends 0.5% deployment fee
    function deployFreelanceEscrowWithMilestones(
        address client,
        address paymentToken,
        uint256 totalAmount,
        IFreelanceEscrow.MilestoneInput[] calldata milestones
    ) external payable returns (
        uint256 instanceId,
        address escrowAddress
    ) {
        if (client == address(0)) revert InvalidAddress();
        if (totalAmount == 0) revert InvalidAmount();
        if (milestones.length == 0) revert InvalidAmount();
        
        escrowAddress = Clones.clone(freelanceEscrowTemplate);
        
        FreelanceEscrow(payable(escrowAddress)).initializeWithMilestones{value: msg.value}(
            client,
            paymentToken,
            totalAmount,
            feeCollector,
            milestones
        );
        
        instanceId = nextInstanceId++;
        instances[instanceId] = EscrowInstance({
            escrowAddress: escrowAddress,
            creator: msg.sender,
            instanceType: InstanceType.FREELANCE,
            createdAt: block.timestamp,
            status: EscrowStatus.ACTIVE
        });
        
        userInstances[client].push(instanceId);
        if (msg.sender != client) {
            userInstances[msg.sender].push(instanceId);
        }
        
        emit FreelanceEscrowDeployed(
            instanceId,
            escrowAddress,
            client,
            paymentToken,
            totalAmount,
            milestones.length
        );
    }

    // update instance status - called by escrow instances
    function updateInstanceStatus(uint256 instanceId, EscrowStatus newStatus) external {
        EscrowInstance storage instance = instances[instanceId];
        if (instance.escrowAddress != msg.sender) revert InstanceNotFound();
        
        instance.status = newStatus;
        emit InstanceStatusUpdated(instanceId, newStatus);
    }
    
    // record volume and fees - called by escrow on settlement
    function recordSettlement(uint256 volume, uint256 fees) external {
        totalVolume += volume;
        totalFees += fees;
    }

    // get all instance ids for a user
    function getInstancesByUser(address user) external view returns (uint256[] memory) {
        return userInstances[user];
    }
    
    // get instance details
    function getInstanceDetails(uint256 instanceId) external view returns (EscrowInstance memory) {
        return instances[instanceId];
    }
    
    // get total instance count
    function getTotalInstances() external view returns (uint256) {
        return nextInstanceId;
    }
    
    // get platform stats
    function getPlatformStats() external view returns (uint256 _totalVolume, uint256 _totalFees) {
        return (totalVolume, totalFees);
    }

    // update platform fee (max 10%)
    function updatePlatformFee(uint256 newFeeBPS) external onlyOwner {
        if (newFeeBPS > 1000) revert FeeTooHigh();
        
        emit PlatformFeeUpdated(platformFeeBPS, newFeeBPS);
        platformFeeBPS = newFeeBPS;
    }
    
    // update fee collector address
    function updateFeeCollector(address newCollector) external onlyOwner {
        if (newCollector == address(0)) revert InvalidAddress();
        
        emit FeeCollectorUpdated(feeCollector, newCollector);
        feeCollector = newCollector;
    }
}
