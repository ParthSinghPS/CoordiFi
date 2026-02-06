// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// whitelisted wallet that mints nfts and sends them to escrow
// gets whitelisted by nft founders instead of the wl holder's eoa
contract SmartMintWallet is IERC721Receiver {
    // escrow that controls this wallet
    address public immutable escrowContract;
    
    // nft contract to mint from
    address public immutable nftContract;
    
    // mint executed flag
    bool public mintExecuted;
    
    // minted token id
    uint256 public mintedTokenId;

    event MintExecuted(uint256 indexed tokenId, address indexed escrow);
    event ETHReceived(address indexed from, uint256 amount);

    error OnlyEscrow();
    error AlreadyMinted();
    error MintFailed();
    error TransferFailed();

    constructor(address _escrow, address _nft) {
        escrowContract = _escrow;
        nftContract = _nft;
    }

    // mint on behalf of escrow - wallet must be whitelisted by nft founder
    function executeMint(bytes calldata mintData) external payable {
        if (msg.sender != escrowContract) revert OnlyEscrow();
        if (mintExecuted) revert AlreadyMinted();
        
        (bool success, ) = nftContract.call{value: msg.value}(mintData);
        if (!success) revert MintFailed();
        
        uint256 balance = IERC721(nftContract).balanceOf(address(this));
        require(balance > 0, "No NFT received");
        
        mintExecuted = true;
        
        emit MintExecuted(0, escrowContract);
    }
    
    // transfer nft to escrow after mint
    function transferToEscrow(uint256 tokenId) external {
        if (msg.sender != escrowContract) revert OnlyEscrow();
        
        mintedTokenId = tokenId;
        
        IERC721(nftContract).safeTransferFrom(
            address(this),
            escrowContract,
            tokenId
        );
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {
        emit ETHReceived(msg.sender, msg.value);
    }
}
