// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// smart mint wallet interface - whitelisted wallet for escrow minting
interface ISmartMintWallet {
    event MintExecuted(address indexed nftContract, uint256 tokenId);
    event NFTTransferred(address indexed to, address indexed nftContract, uint256 tokenId);

    // escrow that controls this wallet
    function escrow() external view returns (address);
    
    // nft contract address
    function nftContract() external view returns (address);
    
    // has this wallet minted yet
    function hasMinted() external view returns (bool);

    // execute arbitrary call for minting
    function execute(address target, bytes calldata data) external payable returns (bytes memory result);
    
    // execute call with specific value
    function executeWithValue(address target, bytes calldata data, uint256 value) external returns (bytes memory result);
    
    // transfer nft to escrow after mint
    function transferNFTToEscrow(uint256 tokenId) external;
    
    // receive eth for minting
    receive() external payable;
}
