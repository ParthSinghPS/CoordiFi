// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

// simple nft collection for testnet demos - supports whitelist minting
contract TestNFTCollection is ERC721Enumerable {
    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public constant MINT_PRICE = 0.002 ether;
    uint256 public nextTokenId = 1;
    
    address public owner;
    
    mapping(address => bool) public whitelist;
    
    mapping(uint256 => address) public minter;
    
    event Whitelisted(address indexed user);
    event RemovedFromWhitelist(address indexed user);
    event Minted(address indexed to, uint256 indexed tokenId, address indexed minterAddr);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        owner = msg.sender;
    }
    
    // add to whitelist
    function addToWhitelist(address user) external onlyOwner {
        whitelist[user] = true;
        emit Whitelisted(user);
    }
    
    // batch add to whitelist
    function batchAddToWhitelist(address[] calldata users) external onlyOwner {
        for (uint i = 0; i < users.length; i++) {
            whitelist[users[i]] = true;
            emit Whitelisted(users[i]);
        }
    }
    
    // remove from whitelist
    function removeFromWhitelist(address user) external onlyOwner {
        whitelist[user] = false;
        emit RemovedFromWhitelist(user);
    }
    
    // whitelisted mint - smartmintwallet calls this
    function mint() external payable {
        require(whitelist[msg.sender], "Not whitelisted");
        require(msg.value >= MINT_PRICE, "Insufficient payment");
        require(nextTokenId <= MAX_SUPPLY, "Sold out");
        
        uint256 tokenId = nextTokenId++;
        minter[tokenId] = msg.sender;
        
        whitelist[msg.sender] = false;
        
        _mint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, msg.sender);
    }
    
    // mint to specific address
    function mintTo(address to) external payable {
        require(whitelist[msg.sender], "Not whitelisted");
        require(msg.value >= MINT_PRICE, "Insufficient payment");
        require(nextTokenId <= MAX_SUPPLY, "Sold out");
        
        uint256 tokenId = nextTokenId++;
        minter[tokenId] = msg.sender;
        whitelist[msg.sender] = false;
        
        _mint(to, tokenId);
        emit Minted(to, tokenId, msg.sender);
    }
    
    // public mint for testing
    function publicMint() external payable {
        require(msg.value >= MINT_PRICE, "Insufficient payment");
        require(nextTokenId <= MAX_SUPPLY, "Sold out");
        
        uint256 tokenId = nextTokenId++;
        minter[tokenId] = msg.sender;
        
        _mint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, msg.sender);
    }
    
    // check if whitelisted
    function isWhitelisted(address user) external view returns (bool) {
        return whitelist[user];
    }
    
    // withdraw mint proceeds
    function withdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    function _baseURI() internal pure override returns (string memory) {
        return "https://test-coordination-nft.com/metadata/";
    }
}
