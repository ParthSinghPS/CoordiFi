// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SupremeFactory.sol";
import "../src/templates/NFTEscrow.sol";
import "../src/SmartMintWallet.sol";
import "../src/mocks/MockNFT.sol";
import "../src/mocks/MockUSDC.sol";

contract SupremeFactoryTest is Test {
    SupremeFactory public factory;
    MockNFT public nft;
    MockUSDC public usdc;

    address public deployer = address(this);
    address public wlHolder = address(0x1);
    address public capitalHolder = address(0x2);
    address public maker = address(0x3);
    address public taker = address(0x4);

    function setUp() public {
        factory = new SupremeFactory(deployer);
        nft = new MockNFT();
        usdc = new MockUSDC();

        vm.deal(capitalHolder, 10 ether);
        vm.deal(taker, 10 ether);

        usdc.mint(maker, 10000e6);
        usdc.mint(taker, 10000e6);
    }

    function test_FactoryDeployment() public view {
        assertEq(factory.feeCollector(), deployer);
        assertEq(factory.platformFeeBPS(), 500);
        assertTrue(factory.nftEscrowTemplate() != address(0));
        assertTrue(factory.otcEscrowTemplate() != address(0));
    }

    function test_DeployNFTEscrow() public {
        uint256 deadline = block.timestamp + 1 days;

        (
            uint256 instanceId,
            address smartMintWallet,
            address escrowAddress
        ) = factory.deployNFTEscrow(
                wlHolder,
                capitalHolder,
                address(nft),
                1 ether,
                7000,
                deadline
            );

        assertEq(instanceId, 0);
        assertTrue(smartMintWallet != address(0));
        assertTrue(escrowAddress != address(0));

        SupremeFactory.EscrowInstance memory instance = factory
            .getInstanceDetails(0);
        assertEq(instance.escrowAddress, escrowAddress);
        assertEq(
            uint(instance.instanceType),
            uint(SupremeFactory.InstanceType.NFT)
        );
        assertEq(
            uint(instance.status),
            uint(SupremeFactory.EscrowStatus.ACTIVE)
        );

        NFTEscrow escrow = NFTEscrow(payable(escrowAddress));
        assertEq(escrow.wlHolder(), wlHolder);
        assertEq(escrow.capitalHolder(), capitalHolder);
        assertEq(escrow.mintPrice(), 1 ether);
        assertEq(escrow.splitBPS(), 7000);
    }

    function test_DeployOTCEscrow() public {
        uint256 deadline = block.timestamp + 12 hours;

        (uint256 instanceId, address escrowAddress) = factory.deployOTCEscrow(
            maker,
            address(usdc),
            address(0x123),
            1000e6,
            1 ether,
            500,
            deadline
        );

        assertEq(instanceId, 0);
        assertTrue(escrowAddress != address(0));

        SupremeFactory.EscrowInstance memory instance = factory
            .getInstanceDetails(0);
        assertEq(
            uint(instance.instanceType),
            uint(SupremeFactory.InstanceType.OTC)
        );
    }

    function test_GetInstancesByUser() public {
        uint256 deadline = block.timestamp + 1 days;

        factory.deployNFTEscrow(
            wlHolder,
            capitalHolder,
            address(nft),
            1 ether,
            7000,
            deadline
        );
        factory.deployNFTEscrow(
            wlHolder,
            capitalHolder,
            address(nft),
            2 ether,
            5000,
            deadline
        );

        uint256[] memory wlInstances = factory.getInstancesByUser(wlHolder);
        uint256[] memory capInstances = factory.getInstancesByUser(
            capitalHolder
        );

        assertEq(wlInstances.length, 2);
        assertEq(capInstances.length, 2);
    }

    function test_UpdatePlatformFee() public {
        factory.updatePlatformFee(300);
        assertEq(factory.platformFeeBPS(), 300);
    }

    function test_RevertWhen_UpdatePlatformFeeTooHigh() public {
        vm.expectRevert(SupremeFactory.FeeTooHigh.selector);
        factory.updatePlatformFee(1500);
    }
}

contract NFTEscrowTest is Test {
    SupremeFactory public factory;
    MockNFT public nft;
    NFTEscrow public escrow;
    address public smartMintWallet;

    address public deployer = address(this);
    address public wlHolder = address(0x1);
    address public capitalHolder = address(0x2);
    address public buyer = address(0x5);

    function setUp() public {
        factory = new SupremeFactory(deployer);
        nft = new MockNFT();

        vm.deal(capitalHolder, 10 ether);
        vm.deal(buyer, 10 ether);

        uint256 deadline = block.timestamp + 1 days;
        (, address wallet, address escrowAddr) = factory.deployNFTEscrow(
            wlHolder,
            capitalHolder,
            address(nft),
            1 ether,
            7000,
            deadline
        );

        escrow = NFTEscrow(payable(escrowAddr));
        smartMintWallet = wallet;
    }

    function test_InitialState() public view {
        assertEq(uint(escrow.status()), uint(NFTEscrow.Status.CREATED));
        assertEq(escrow.wlHolder(), wlHolder);
        assertEq(escrow.capitalHolder(), capitalHolder);
        assertEq(escrow.mintPrice(), 1 ether);
    }

    function test_Deposit() public {
        vm.prank(capitalHolder);
        escrow.deposit{value: 1 ether}();

        assertEq(uint(escrow.status()), uint(NFTEscrow.Status.FUNDED));
        assertEq(address(escrow).balance, 1 ether);
    }

    function test_RevertWhen_DepositWrongAmount() public {
        vm.prank(capitalHolder);
        vm.expectRevert(NFTEscrow.WrongAmount.selector);
        escrow.deposit{value: 0.5 ether}();
    }

    function test_TimeoutRefund() public {
        vm.prank(capitalHolder);
        escrow.deposit{value: 1 ether}();

        vm.warp(block.timestamp + 2 days);

        uint256 balanceBefore = capitalHolder.balance;
        vm.prank(capitalHolder);
        escrow.refundCapital();

        assertEq(uint(escrow.status()), uint(NFTEscrow.Status.REFUNDED));
        assertEq(capitalHolder.balance, balanceBefore + 1 ether);
    }
}

contract OTCEscrowTest is Test {
    SupremeFactory public factory;
    MockUSDC public tokenA;
    MockUSDC public tokenB;

    address public deployer = address(this);
    address public maker = address(0x3);
    address public taker = address(0x4);

    function setUp() public {
        factory = new SupremeFactory(deployer);
        tokenA = new MockUSDC();
        tokenB = new MockUSDC();

        tokenA.mint(maker, 10000e6);
        tokenB.mint(taker, 10000e6);
    }

    function test_FullOTCFlow() public {
        uint256 deadline = block.timestamp + 12 hours;

        (, address escrowAddr) = factory.deployOTCEscrow(
            maker,
            address(tokenA),
            address(tokenB),
            1000e6,
            800e6,
            500,
            deadline
        );

        OTCEscrow escrow = OTCEscrow(payable(escrowAddr));

        vm.startPrank(maker);
        tokenA.approve(escrowAddr, 1000e6);
        escrow.makerLock();
        vm.stopPrank();

        assertEq(uint(escrow.status()), uint(OTCEscrow.Status.MAKER_LOCKED));

        vm.startPrank(taker);
        tokenB.approve(escrowAddr, 800e6);
        escrow.takerLock();
        vm.stopPrank();

        assertEq(uint(escrow.status()), uint(OTCEscrow.Status.BOTH_LOCKED));

        escrow.validateAndSettle();

        assertEq(uint(escrow.status()), uint(OTCEscrow.Status.SETTLED));

        uint256 fee = (800e6 * 500) / 10000;
        assertEq(tokenA.balanceOf(taker), 1000e6);
        assertEq(tokenB.balanceOf(maker), 800e6 - fee);
        assertGe(tokenB.balanceOf(deployer), fee);
    }

    function test_OTCRefund() public {
        uint256 deadline = block.timestamp + 12 hours;

        (, address escrowAddr) = factory.deployOTCEscrow(
            maker,
            address(tokenA),
            address(tokenB),
            1000e6,
            800e6,
            500,
            deadline
        );

        OTCEscrow escrow = OTCEscrow(payable(escrowAddr));

        vm.startPrank(maker);
        tokenA.approve(escrowAddr, 1000e6);
        escrow.makerLock();

        escrow.refund();
        vm.stopPrank();

        assertEq(uint(escrow.status()), uint(OTCEscrow.Status.REFUNDED));
        assertEq(tokenA.balanceOf(maker), 10000e6);
    }
}
