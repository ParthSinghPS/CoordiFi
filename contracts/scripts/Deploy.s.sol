// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SupremeFactory} from "../src/SupremeFactory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        SupremeFactory factory = new SupremeFactory(deployer);

        console.log("Supreme Factory:", address(factory));
        console.log("NFT Escrow Template:", factory.nftEscrowTemplate());
        console.log("OTC Escrow Template:", factory.otcEscrowTemplate());
        console.log(
            "Freelance Escrow Template:",
            factory.freelanceEscrowTemplate()
        );
        console.log("Platform Fee:", factory.platformFeeBPS(), "bps");
        console.log("Fee Collector:", factory.feeCollector());

        vm.stopBroadcast();

        console.log("");
        console.log("Update frontend/.env:");
        console.log("VITE_SUPREME_FACTORY_ADDRESS=", address(factory));
    }
}

contract DeployMocks is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        MockUSDC mockUsdc = new MockUSDC();
        console.log("MockUSDC:", address(mockUsdc));

        MockNFT mockNft = new MockNFT();
        console.log("MockNFT:", address(mockNft));

        vm.stopBroadcast();
    }
}

contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract MockNFT {
    string public name = "Mock NFT";
    string public symbol = "MNFT";
    uint256 public totalSupply;
    uint256 public mintPrice = 0.01 ether;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );
    event Approval(
        address indexed owner,
        address indexed approved,
        uint256 indexed tokenId
    );
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    function mint() external payable returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient payment");
        uint256 tokenId = ++totalSupply;
        ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender]++;
        emit Transfer(address(0), msg.sender, tokenId);
        return tokenId;
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "Not owner");
        getApproved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "Not owner");
        require(
            msg.sender == from ||
                getApproved[tokenId] == msg.sender ||
                isApprovedForAll[from][msg.sender],
            "Not approved"
        );
        ownerOf[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        delete getApproved[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external {
        this.transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata
    ) external {
        this.transferFrom(from, to, tokenId);
    }
}
