// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../interfaces/ISupremeFactory.sol";

contract NFTEscrow is IERC721Receiver, ReentrancyGuard {
    enum Status {
        CREATED,
        CAPITAL_LOCKED,
        MINTED,
        SETTLED,
        REFUNDED
    }

    address public factory;
    address public wlHolder;
    address public capitalHolder;
    address public nftContract;
    address public smartMintWallet;

    uint256 public mintPrice;
    uint256 public splitBPS;
    uint256 public deadline;
    uint256 public mintedTokenId;

    Status public status;
    bool private initialized;

    event Initialized(
        address indexed wlHolder,
        address indexed capitalHolder,
        address nftContract,
        uint256 mintPrice
    );
    event CapitalLocked(address indexed capitalHolder, uint256 amount);
    event MintExecuted(uint256 indexed tokenId, address smartMintWallet);
    event NFTVerified(uint256 indexed tokenId);
    event Settled(
        address indexed wlHolder,
        address indexed capitalHolder,
        uint256 wlShare,
        uint256 capitalShare
    );
    event Refunded(address indexed to, uint256 amount);
    event StatusChanged(Status oldStatus, Status newStatus);

    error AlreadyInitialized();
    error NotWLHolder();
    error NotCapitalHolder();
    error WrongStatus();
    error Expired();
    error NotExpired();
    error InsufficientAmount();
    error TransferFailed();
    error InvalidTokenId();

    modifier onlyWLHolder() {
        if (msg.sender != wlHolder) revert NotWLHolder();
        _;
    }

    modifier onlyCapitalHolder() {
        if (msg.sender != capitalHolder) revert NotCapitalHolder();
        _;
    }

    modifier inStatus(Status _status) {
        if (status != _status) revert WrongStatus();
        _;
    }

    modifier notExpired() {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    function initialize(
        address _wlHolder,
        address _capitalHolder,
        address _nftContract,
        uint256 _mintPrice,
        uint256 _splitBPS,
        uint256 _deadline,
        address _smartMintWallet,
        address _factory
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;

        wlHolder = _wlHolder;
        capitalHolder = _capitalHolder;
        nftContract = _nftContract;
        mintPrice = _mintPrice;
        splitBPS = _splitBPS;
        deadline = _deadline;
        smartMintWallet = _smartMintWallet;
        factory = _factory;
        status = Status.CREATED;

        emit Initialized(_wlHolder, _capitalHolder, _nftContract, _mintPrice);
    }

    function lockCapital()
        external
        payable
        onlyCapitalHolder
        inStatus(Status.CREATED)
        notExpired
        nonReentrant
    {
        if (msg.value < mintPrice) revert InsufficientAmount();
        _updateStatus(Status.CAPITAL_LOCKED);
        emit CapitalLocked(capitalHolder, msg.value);
    }

    function executeMint(
        bytes calldata mintData
    )
        external
        onlyWLHolder
        inStatus(Status.CAPITAL_LOCKED)
        notExpired
        nonReentrant
    {
        (bool success, ) = smartMintWallet.call{value: mintPrice}(
            abi.encodeWithSignature("executeMint(bytes)", mintData)
        );
        if (!success) revert TransferFailed();
        emit MintExecuted(0, smartMintWallet);
    }

    function verifyMint(
        uint256 tokenId
    ) external onlyWLHolder inStatus(Status.CAPITAL_LOCKED) notExpired {
        address owner = IERC721(nftContract).ownerOf(tokenId);
        if (owner != smartMintWallet && owner != address(this))
            revert InvalidTokenId();

        if (owner == smartMintWallet) {
            (bool success, ) = smartMintWallet.call(
                abi.encodeWithSignature("transferToEscrow(uint256)", tokenId)
            );
            if (!success) revert TransferFailed();
        }

        mintedTokenId = tokenId;
        _updateStatus(Status.MINTED);
        emit NFTVerified(tokenId);
    }

    function settle() external inStatus(Status.MINTED) nonReentrant {
        require(
            msg.sender == wlHolder || msg.sender == capitalHolder,
            "Not participant"
        );

        IERC721(nftContract).safeTransferFrom(
            address(this),
            capitalHolder,
            mintedTokenId
        );

        uint256 platformFeeBPS = ISupremeFactory(factory).platformFeeBPS();
        address feeCollector = ISupremeFactory(factory).feeCollector();

        uint256 totalValue = address(this).balance;
        uint256 platformFee = (totalValue * platformFeeBPS) / 10000;
        uint256 afterFee = totalValue - platformFee;

        uint256 wlShare = (afterFee * splitBPS) / 10000;
        uint256 capitalShare = afterFee - wlShare;

        if (platformFee > 0) {
            (bool feeSuccess, ) = feeCollector.call{value: platformFee}("");
            if (!feeSuccess) revert TransferFailed();
        }

        (bool wlSuccess, ) = wlHolder.call{value: wlShare}("");
        if (!wlSuccess) revert TransferFailed();

        (bool capSuccess, ) = capitalHolder.call{value: capitalShare}("");
        if (!capSuccess) revert TransferFailed();

        ISupremeFactory(factory).recordSettlement(totalValue, platformFee);
        _updateStatus(Status.SETTLED);

        emit Settled(wlHolder, capitalHolder, wlShare, capitalShare);
    }

    function refund() external nonReentrant {
        if (block.timestamp <= deadline) revert NotExpired();
        if (status == Status.SETTLED || status == Status.REFUNDED)
            revert WrongStatus();

        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = capitalHolder.call{value: balance}("");
            if (!success) revert TransferFailed();
            emit Refunded(capitalHolder, balance);
        }

        _updateStatus(Status.REFUNDED);
    }

    function _updateStatus(Status newStatus) internal {
        emit StatusChanged(status, newStatus);
        status = newStatus;
    }

    function getDetails()
        external
        view
        returns (
            address _wlHolder,
            address _capitalHolder,
            address _nftContract,
            uint256 _mintPrice,
            uint256 _splitBPS,
            uint256 _deadline,
            Status _status
        )
    {
        return (
            wlHolder,
            capitalHolder,
            nftContract,
            mintPrice,
            splitBPS,
            deadline,
            status
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

    receive() external payable {}
}
