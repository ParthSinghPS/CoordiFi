// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../interfaces/ISupreme.sol";

// nft escrow for whitelist coordination - deployed as minimal proxy
// flow: CREATED → FUNDED → MINTED → APPROVED → SOLD → SPLIT (or REFUNDED on timeout)
contract NFTEscrow is IERC721Receiver, ReentrancyGuard {
    enum Status {
        CREATED,
        FUNDED,
        MINTED,
        APPROVED,
        SOLD,
        SPLIT,
        REFUNDED
    }

    // factory that deployed this
    address public factory;
    
    // instance id in factory
    uint256 public instanceId;
    
    // participants
    address public wlHolder;
    address public capitalHolder;
    address public smartMintWallet;
    
    // nft details
    address public nftContract;
    uint256 public nftTokenId;
    
    // economics
    uint256 public mintPrice;
    uint256 public splitBPS;
    uint256 public salePrice;
    
    // current status
    Status public status;
    
    // deadline
    uint256 public deadline;
    
    // sale approval tracking
    bool public wlApproved;
    bool public capitalApproved;
    uint256 public approvedSalePrice;
    address public approvedMarketplace;
    
    // init flag
    bool private initialized;

    event Initialized(
        address indexed wlHolder,
        address indexed capitalHolder,
        address nftContract,
        uint256 mintPrice
    );
    event CapitalDeposited(address indexed from, uint256 amount);
    event MintTriggered(address indexed by);
    event NFTReceived(uint256 indexed tokenId);
    event SaleApproved(address indexed approver, uint256 price, address marketplace);
    event BothApproved(uint256 price, address marketplace);
    event NFTSold(address indexed buyer, uint256 price);
    event ProceedsSplit(
        uint256 capitalShare,
        uint256 wlShare,
        uint256 platformFee
    );
    event TimeoutRefund(address indexed recipient, uint256 tokenId);
    event StatusChanged(Status oldStatus, Status newStatus);

    error AlreadyInitialized();
    error NotCapitalHolder();
    error NotParticipant();
    error WrongStatus();
    error WrongAmount();
    error Expired();
    error NotExpired();
    error NFTNotReceived();
    error ApprovalMismatch();
    error InsufficientPayment();
    error TransferFailed();

    modifier onlyCapitalHolder() {
        if (msg.sender != capitalHolder) revert NotCapitalHolder();
        _;
    }
    
    modifier onlyParticipant() {
        if (msg.sender != wlHolder && msg.sender != capitalHolder) {
            revert NotParticipant();
        }
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

    // init escrow instance - called by factory, once only
    function initialize(
        address _wlHolder,
        address _capitalHolder,
        address _smartMintWallet,
        address _nftContract,
        uint256 _mintPrice,
        uint256 _splitBPS,
        uint256 _deadline,
        address _factory
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        
        wlHolder = _wlHolder;
        capitalHolder = _capitalHolder;
        smartMintWallet = _smartMintWallet;
        nftContract = _nftContract;
        mintPrice = _mintPrice;
        splitBPS = _splitBPS;
        deadline = _deadline;
        factory = _factory;
        status = Status.CREATED;
        
        emit Initialized(_wlHolder, _capitalHolder, _nftContract, _mintPrice);
    }

    // capital holder deposits eth - must be exactly mintPrice
    function deposit() 
        external 
        payable 
        onlyCapitalHolder 
        inStatus(Status.CREATED) 
        notExpired 
    {
        if (msg.value != mintPrice) revert WrongAmount();
        
        _updateStatus(Status.FUNDED);
        emit CapitalDeposited(msg.sender, msg.value);
    }

    // trigger nft mint via smart mint wallet
    function executeMint(bytes calldata mintData) 
        external 
        inStatus(Status.FUNDED) 
        notExpired 
        nonReentrant
    {
        ISmartMintWallet(smartMintWallet).executeMint{value: mintPrice}(mintData);
        
        emit MintTriggered(msg.sender);
    }
    
    // verify nft received and take custody
    function verifyMint(uint256 tokenId) 
        external 
        inStatus(Status.FUNDED) 
        notExpired 
    {
        ISmartMintWallet(smartMintWallet).transferToEscrow(tokenId);
        
        if (IERC721(nftContract).ownerOf(tokenId) != address(this)) {
            revert NFTNotReceived();
        }
        
        nftTokenId = tokenId;
        _updateStatus(Status.MINTED);
        emit NFTReceived(tokenId);
    }

    // approve sale terms - both parties must approve matching terms
    function approveSale(uint256 price, address marketplace) 
        external 
        onlyParticipant 
        inStatus(Status.MINTED) 
        notExpired 
    {
        if (msg.sender == wlHolder) {
            approvedSalePrice = price;
            approvedMarketplace = marketplace;
            wlApproved = true;
        } else {
            if (price != approvedSalePrice) revert ApprovalMismatch();
            if (marketplace != approvedMarketplace) revert ApprovalMismatch();
            capitalApproved = true;
        }
        
        emit SaleApproved(msg.sender, price, marketplace);
        
        if (wlApproved && capitalApproved) {
            _updateStatus(Status.APPROVED);
            IERC721(nftContract).approve(marketplace, nftTokenId);
            emit BothApproved(price, marketplace);
        }
    }

    // execute nft sale - buyer sends eth, gets nft
    function executeSale() 
        external 
        payable 
        inStatus(Status.APPROVED) 
        nonReentrant
    {
        if (msg.value < approvedSalePrice) revert InsufficientPayment();
        
        IERC721(nftContract).safeTransferFrom(
            address(this),
            msg.sender,
            nftTokenId
        );
        
        salePrice = msg.value;
        _updateStatus(Status.SOLD);
        emit NFTSold(msg.sender, msg.value);
    }

    // distribute sale proceeds - profit: 0.5% fee, loss: 0.005% fee
    function distributeSale() 
        external 
        inStatus(Status.SOLD) 
        nonReentrant
    {
        uint256 balance = address(this).balance;
        address feeCollector = ISupremeFactory(factory).feeCollector();
        
        uint256 platformFee;
        uint256 remaining;
        
        if (balance > mintPrice) {
            uint256 profit = balance - mintPrice;
            platformFee = (profit * 50) / 10000;
            remaining = balance - platformFee;
        } else {
            platformFee = (balance * 5) / 100000;
            remaining = balance - platformFee;
        }
        
        uint256 capitalShare;
        uint256 wlShare;
        
        if (remaining > mintPrice) {
            uint256 profitAfterFee = remaining - mintPrice;
            uint256 capitalProfit = (profitAfterFee * splitBPS) / 10000;
            capitalShare = mintPrice + capitalProfit;
            wlShare = remaining - capitalShare;
        } else {
            capitalShare = remaining;
            wlShare = 0;
        }
        
        if (platformFee > 0) {
            (bool sentPlatform, ) = feeCollector.call{value: platformFee}("");
            if (!sentPlatform) revert TransferFailed();
        }
        
        if (capitalShare > 0) {
            (bool sentCapital, ) = capitalHolder.call{value: capitalShare}("");
            if (!sentCapital) revert TransferFailed();
        }
        
        if (wlShare > 0) {
            (bool sentWL, ) = wlHolder.call{value: wlShare}("");
            if (!sentWL) revert TransferFailed();
        }
        
        ISupremeFactory(factory).recordSettlement(balance, platformFee);
        
        _updateStatus(Status.SPLIT);
        emit ProceedsSplit(capitalShare, wlShare, platformFee);
    }

    // timeout refund - capital holder gets nft if coordination stalls after deadline
    function timeoutRefund() 
        external 
        onlyCapitalHolder 
        inStatus(Status.MINTED) 
        nonReentrant
    {
        if (block.timestamp <= deadline) revert NotExpired();
        
        IERC721(nftContract).safeTransferFrom(
            address(this),
            capitalHolder,
            nftTokenId
        );
        
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool sent, ) = capitalHolder.call{value: balance}("");
            if (!sent) revert TransferFailed();
        }
        
        _updateStatus(Status.REFUNDED);
        emit TimeoutRefund(capitalHolder, nftTokenId);
    }
    
    // refund capital if mint never happened after deadline
    function refundCapital() 
        external 
        onlyCapitalHolder 
        inStatus(Status.FUNDED) 
        nonReentrant
    {
        if (block.timestamp <= deadline) revert NotExpired();
        
        uint256 balance = address(this).balance;
        (bool sent, ) = capitalHolder.call{value: balance}("");
        if (!sent) revert TransferFailed();
        
        _updateStatus(Status.REFUNDED);
    }

    function _updateStatus(Status newStatus) internal {
        emit StatusChanged(status, newStatus);
        status = newStatus;
    }

    // get full escrow details
    function getDetails() external view returns (
        address _wlHolder,
        address _capitalHolder,
        address _nftContract,
        uint256 _nftTokenId,
        uint256 _mintPrice,
        uint256 _splitBPS,
        uint256 _deadline,
        Status _status
    ) {
        return (
            wlHolder,
            capitalHolder,
            nftContract,
            nftTokenId,
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
