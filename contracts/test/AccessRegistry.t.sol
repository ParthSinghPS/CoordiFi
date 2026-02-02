// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AccessRegistry} from "../src/AccessRegistry.sol";

contract AccessRegistryTest is Test {
    AccessRegistry public registry;
    address public admin = address(1);
    address public user = address(2);
    bytes32 public accessTypeId = keccak256("NFT_WHITELIST");
    bytes32 public accessHash;
    bytes32 public merkleRoot;
    bytes32[] public proof;

    function setUp() public {
        vm.prank(admin);
        registry = new AccessRegistry();
        accessHash = keccak256(
            abi.encodePacked("NFT_WHITELIST", address(0x123), uint256(1), user)
        );
        bytes32 leaf = keccak256(abi.encodePacked(accessHash, user));
        merkleRoot = leaf;
        proof = new bytes32[](0);
    }

    function test_CreateAccessType() public {
        vm.prank(admin);
        registry.createAccessType(accessTypeId, "NFT Whitelist", merkleRoot);
        AccessRegistry.AccessType memory at = registry.getAccessType(
            accessTypeId
        );
        assertEq(at.merkleRoot, merkleRoot);
        assertTrue(at.active);
    }

    function test_VerifyAccess() public {
        vm.prank(admin);
        registry.createAccessType(accessTypeId, "Test", merkleRoot);
        bool isValid = registry.verifyAccess(accessHash, user, proof);
        assertTrue(isValid);
    }
}
