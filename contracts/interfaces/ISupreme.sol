// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// supreme factory interface - deploys and tracks escrow instances
interface ISupremeFactory {
    function platformFeeBPS() external view returns (uint256);
    function feeCollector() external view returns (address);
    function updateInstanceStatus(uint256 instanceId, uint8 newStatus) external;
    function recordSettlement(uint256 volume, uint256 fees) external;
}

// smart mint wallet interface - mints nfts for escrow
interface ISmartMintWallet {
    function executeMint(bytes calldata mintData) external payable;
    function transferToEscrow(uint256 tokenId) external;
}
