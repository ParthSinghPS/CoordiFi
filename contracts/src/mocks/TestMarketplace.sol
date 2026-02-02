// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract TestMarketplace is IERC721Receiver {
    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    address public owner;
    mapping(uint256 => Listing) public listings;
    uint256 public nextListingId = 1;

    uint256 public constant PLATFORM_FEE_BPS = 500;
    bool private _locked;

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 price
    );
    event Sold(uint256 indexed listingId, address indexed buyer, uint256 price);
    event Cancelled(uint256 indexed listingId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Reentrant");
        _locked = true;
        _;
        _locked = false;
    }

    constructor() {
        owner = msg.sender;
    }

    function list(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external nonReentrant returns (uint256) {
        require(price > 0, "Price must be > 0");
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not owner"
        );

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            active: true
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, price);
        return listingId;
    }

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];

        require(listing.active, "Not active");
        require(msg.value >= listing.price, "Insufficient payment");

        IERC721(listing.nftContract).transferFrom(
            address(this),
            msg.sender,
            listing.tokenId
        );

        uint256 platformFee = (listing.price * PLATFORM_FEE_BPS) / 10000;
        uint256 sellerAmount = listing.price - platformFee;

        payable(listing.seller).transfer(sellerAmount);

        if (msg.value > listing.price) {
            payable(msg.sender).transfer(msg.value - listing.price);
        }

        listing.active = false;
        emit Sold(listingId, msg.sender, listing.price);
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        require(listing.seller == msg.sender, "Not seller");
        require(listing.active, "Not active");

        IERC721(listing.nftContract).transferFrom(
            address(this),
            listing.seller,
            listing.tokenId
        );
        listing.active = false;
        emit Cancelled(listingId);
    }

    function withdrawFees() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
