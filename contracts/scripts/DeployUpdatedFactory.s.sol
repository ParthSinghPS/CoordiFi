// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SupremeFactory} from "../src/SupremeFactory.sol";

contract DeployUpdatedFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== SupremeFactory Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        SupremeFactory factory = new SupremeFactory(deployer);

        console.log("Supreme Factory:", address(factory));
        console.log("  - NFT Escrow Template:", factory.nftEscrowTemplate());
        console.log("  - OTC Escrow Template:", factory.otcEscrowTemplate());
        console.log(
            "  - Freelance Escrow Template:",
            factory.freelanceEscrowTemplate()
        );
        console.log("  - Fee Collector:", factory.feeCollector());

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
    }
}
