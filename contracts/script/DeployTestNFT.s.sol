// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/mocks/TestNFTCollection.sol";

contract DeployTestNFT is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        TestNFTCollection nft = new TestNFTCollection("Test Azuki", "TAZUKI");

        console.log("TestNFTCollection deployed at:", address(nft));

        vm.stopBroadcast();
    }
}
