// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SupremeFactory} from "../src/SupremeFactory.sol";

/**
 * @title DeployUpdatedFactory
 * @notice Deploy new SupremeFactory with updated fee structure in FreelanceEscrow
 * 
 * This script deploys a fresh SupremeFactory which internally deploys:
 * - NFTEscrow template (unchanged)
 * - OTCEscrow template (unchanged)  
 * - FreelanceEscrow template (UPDATED with new fee structure)
 * 
 * New Fee Structure:
 * - 0.5% deployment fee (collected from client at project creation)
 * - 2.5% approval fee (collected from client per milestone approval)
 * - Worker receives 100% of milestone amount (no deductions)
 * 
 * Usage:
 *   # Ethereum Sepolia
 *   forge script scripts/DeployUpdatedFactory.s.sol:DeployUpdatedFactory \
 *     --rpc-url sepolia --broadcast --verify
 * 
 * After running:
 * 1. Update frontend/src/lib/contracts.ts with new SUPREME_FACTORY address
 * 2. Update TESTING_GUIDE.md with new contract addresses
 * 3. Update docs/ARCHITECTURE.md with new addresses
 */
contract DeployUpdatedFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== SupremeFactory Deployment with Updated Fee Structure ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy new Supreme Factory (deploys all templates internally)
        SupremeFactory factory = new SupremeFactory(deployer);
        
        console.log("Supreme Factory:", address(factory));
        console.log("  - NFT Escrow Template:", factory.nftEscrowTemplate());
        console.log("  - OTC Escrow Template:", factory.otcEscrowTemplate());
        console.log("  - Freelance Escrow Template:", factory.freelanceEscrowTemplate());
        console.log("  - Fee Collector:", factory.feeCollector());

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("NEW FEE STRUCTURE:");
        console.log("  - Deployment Fee: 0.5% (DEPLOYMENT_FEE_BPS = 50)");
        console.log("  - Approval Fee:   2.5% (APPROVAL_FEE_BPS = 250)");
        console.log("  - Worker Payout:  100% of milestone amount");
        console.log("");
        console.log("UPDATE THESE FILES:");
        console.log("  1. frontend/src/lib/contracts.ts");
        console.log("     SUPREME_FACTORY:", address(factory));
        console.log("");
        console.log("  2. TESTING_GUIDE.md contract addresses");
        console.log("");
        console.log("  3. docs/ARCHITECTURE.md contract addresses");
    }
}
