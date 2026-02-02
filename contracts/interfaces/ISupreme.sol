// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISupreme {
    enum InstanceType { NFT, OTC, FREELANCE }
    enum EscrowStatus { ACTIVE, SETTLED, REFUNDED, CANCELLED }

    struct EscrowInstance {
        address escrowAddress;
        address creator;
        InstanceType instanceType;
        uint256 createdAt;
        EscrowStatus status;
    }

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

    event InstanceStatusUpdated(uint256 indexed instanceId, EscrowStatus newStatus);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(address oldCollector, address newCollector);

    function deployNFTEscrow(
        address wlHolder,
        address capitalHolder,
        address nftContract,
        uint256 mintPrice,
        uint256 splitBPS,
        uint256 deadline
    ) external returns (uint256 instanceId, address smartMintWallet, address escrowAddress);

    function deployOTCEscrow(
        address maker,
        address assetA,
        address assetB,
        uint256 amountA,
        uint256 amountB,
        uint256 toleranceBPS,
        uint256 deadline
    ) external returns (uint256 instanceId, address escrowAddress);

    function getInstance(uint256 instanceId) external view returns (EscrowInstance memory);
    function getUserInstances(address user) external view returns (uint256[] memory);
    function updateInstanceStatus(uint256 instanceId, EscrowStatus status) external;
    function setPlatformFee(uint256 newFeeBPS) external;
    function setFeeCollector(address newCollector) external;
    function nftEscrowTemplate() external view returns (address);
    function otcEscrowTemplate() external view returns (address);
    function freelanceEscrowTemplate() external view returns (address);
    function platformFeeBPS() external view returns (uint256);
    function feeCollector() external view returns (address);
    function nextInstanceId() external view returns (uint256);
    function totalVolume() external view returns (uint256);
    function totalFees() external view returns (uint256);
}
