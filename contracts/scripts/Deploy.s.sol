// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SupremeFactory} from "../src/SupremeFactory.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockNFT} from "../src/mocks/MockNFT.sol";
import {TestNFTCollection} from "../src/mocks/TestNFTCollection.sol";

/**
 * @title Deploy
 * @notice Deployment script for Escrow Primitive Protocol
 * 
 * Usage:
 *   # Local (Anvil)
 *   forge script scripts/Deploy.s.sol:Deploy --rpc-url localhost --broadcast
 * 
 *   # Ethereum Sepolia
 *   forge script scripts/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify
 * 
 *   # Base Sepolia (before hackathon)
 *   forge script scripts/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== Escrow Primitive Protocol Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Supreme Factory
        // Deployer is fee collector for now
        SupremeFactory factory = new SupremeFactory(deployer);
        
        console.log("Supreme Factory:", address(factory));
        console.log("  - NFT Escrow Template:", factory.nftEscrowTemplate());
        console.log("  - OTC Escrow Template:", factory.otcEscrowTemplate());
        console.log("  - Freelance Escrow Template:", factory.freelanceEscrowTemplate());
        console.log("  - Platform Fee:", factory.platformFeeBPS(), "bps (5%)");
        console.log("  - Fee Collector:", factory.feeCollector());

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Update your frontend/.env with:");
        console.log("VITE_SUPREME_FACTORY_ADDRESS=", address(factory));
    }
}

/**
 * @title DeployMocks
 * @notice Deploy mock contracts for testing
 */
contract DeployMocks is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDC mockUsdc = new MockUSDC();
        console.log("MockUSDC deployed:", address(mockUsdc));
        
        MockNFT mockNft = new MockNFT();
        console.log("MockNFT deployed:", address(mockNft));
        
        vm.stopBroadcast();
    }
}

/**
 * @title DeployAll
 * @notice Deploy factory + mocks for full local testing
 */
contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== Full Local Deployment ===");
        console.log("Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy mocks
        MockUSDC mockUsdc = new MockUSDC();
        MockNFT mockNft = new MockNFT();
        
        // Deploy factory
        SupremeFactory factory = new SupremeFactory(deployer);
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("Deployed Contracts:");
        console.log("  MockUSDC:", address(mockUsdc));
        console.log("  MockNFT:", address(mockNft));
        console.log("  Supreme Factory:", address(factory));
        console.log("    - NFT Template:", factory.nftEscrowTemplate());
        console.log("    - OTC Template:", factory.otcEscrowTemplate());
    }
}

/**
 * @title DeployTestNFT
 * @notice Deploy TestNFTCollection for demos
 */
contract DeployTestNFT is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        TestNFTCollection nft = new TestNFTCollection("Test Azuki", "TAZUKI");
        
        console.log("TestNFTCollection deployed at:", address(nft));
        
        vm.stopBroadcast();
    }
}
