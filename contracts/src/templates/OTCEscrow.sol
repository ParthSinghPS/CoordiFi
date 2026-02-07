// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../interfaces/IUniswapV3Pool.sol";
import "../../interfaces/ISupreme.sol";

// otc escrow for p2p trading with price validation - deployed as minimal proxy
// flow: CREATED → MAKER_LOCKED → BOTH_LOCKED → SETTLED (or REFUNDED)
contract OTCEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        CREATED,
        MAKER_LOCKED,
        BOTH_LOCKED,
        SETTLED,
        REFUNDED
    }

    // factory that deployed this
    address public factory;
    
    // participants
    address public maker;
    address public taker;
    
    // assets being traded
    address public assetA;
    address public assetB;
    uint256 public amountA;
    uint256 public amountB;
    
    // price validation via uniswap v3
    address public uniswapPool;
    uint256 public toleranceBPS;
    
    // current status
    Status public status;
    
    // deadline
    uint256 public deadline;
    
    // init flag
    bool private initialized;

    event Initialized(
        address indexed maker,
        address assetA,
        address assetB,
        uint256 amountA,
        uint256 amountB
    );
    event MakerLocked(address indexed maker, uint256 amount);
    event TakerLocked(address indexed taker, uint256 amount);
    event PriceValidated(uint256 marketPrice, uint256 agreedPrice, uint256 deviation);
    event OTCSettled(
        address indexed maker,
        address indexed taker,
        uint256 amountA,
        uint256 amountB,
        uint256 platformFee
    );
    event Refunded(address indexed recipient, address asset, uint256 amount);
    event StatusChanged(Status oldStatus, Status newStatus);
    event UniswapPoolSet(address indexed pool);

    error AlreadyInitialized();
    error NotMaker();
    error WrongStatus();
    error Expired();
    error NotExpired();
    error PriceOutOfBounds();
    error TransferFailed();
    error ZeroAddress();

    modifier onlyMaker() {
        if (msg.sender != maker) revert NotMaker();
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

    // init otc escrow - called by factory, once only
    function initialize(
        address _maker,
        address _assetA,
        address _assetB,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _toleranceBPS,
        uint256 _deadline,
        address _factory
    ) external {
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        
        maker = _maker;
        assetA = _assetA;
        assetB = _assetB;
        amountA = _amountA;
        amountB = _amountB;
        toleranceBPS = _toleranceBPS;
        deadline = _deadline;
        factory = _factory;
        status = Status.CREATED;
        
        emit Initialized(_maker, _assetA, _assetB, _amountA, _amountB);
    }
    
    // set uniswap v3 pool for price validation (optional)
    function setUniswapPool(address pool) external onlyMaker inStatus(Status.CREATED) {
        uniswapPool = pool;
        emit UniswapPoolSet(pool);
    }

    // maker locks asset a into escrow
    function makerLock() 
        external 
        onlyMaker 
        inStatus(Status.CREATED) 
        notExpired 
        nonReentrant
    {
        IERC20(assetA).safeTransferFrom(maker, address(this), amountA);
        
        _updateStatus(Status.MAKER_LOCKED);
        emit MakerLocked(maker, amountA);
    }

    // taker accepts offer and locks asset b
    function takerLock() 
        external 
        inStatus(Status.MAKER_LOCKED) 
        notExpired 
        nonReentrant
    {
        if (msg.sender == address(0)) revert ZeroAddress();
        
        taker = msg.sender;
        IERC20(assetB).safeTransferFrom(taker, address(this), amountB);
        
        _updateStatus(Status.BOTH_LOCKED);
        emit TakerLocked(taker, amountB);
    }

    // validate price and execute atomic swap
    function validateAndSettle() 
        external 
        inStatus(Status.BOTH_LOCKED) 
        notExpired 
        nonReentrant
    {
        if (uniswapPool != address(0)) {
            if (!_validatePrice()) revert PriceOutOfBounds();
        }
        
        uint256 platformFeeBPS = ISupremeFactory(factory).platformFeeBPS();
        address feeCollector = ISupremeFactory(factory).feeCollector();
        
        uint256 platformFee = (amountB * platformFeeBPS) / 10000;
        uint256 makerReceives = amountB - platformFee;
        
        IERC20(assetA).safeTransfer(taker, amountA);
        
        IERC20(assetB).safeTransfer(maker, makerReceives);
        
        if (platformFee > 0) {
            IERC20(assetB).safeTransfer(feeCollector, platformFee);
        }
        
        ISupremeFactory(factory).recordSettlement(amountB, platformFee);
        
        _updateStatus(Status.SETTLED);
        emit OTCSettled(maker, taker, amountA, makerReceives, platformFee);
    }

    // refund all parties after deadline or by maker if not started
    function refund() external nonReentrant {
        
        bool isPastDeadline = block.timestamp > deadline;
        bool makerCancelling = msg.sender == maker && status == Status.MAKER_LOCKED;
        
        if (!isPastDeadline && !makerCancelling) {
            revert NotExpired();
        }
        
        if (status == Status.SETTLED || status == Status.REFUNDED) {
            revert WrongStatus();
        }
        
        if (status >= Status.MAKER_LOCKED) {
            uint256 balanceA = IERC20(assetA).balanceOf(address(this));
            if (balanceA > 0) {
                IERC20(assetA).safeTransfer(maker, balanceA);
                emit Refunded(maker, assetA, balanceA);
            }
        }
        
        if (status == Status.BOTH_LOCKED && taker != address(0)) {
            uint256 balanceB = IERC20(assetB).balanceOf(address(this));
            if (balanceB > 0) {
                IERC20(assetB).safeTransfer(taker, balanceB);
                emit Refunded(taker, assetB, balanceB);
            }
        }
        
        _updateStatus(Status.REFUNDED);
    }

    // validate agreed price against uniswap v3 oracle
    function _validatePrice() internal returns (bool isValid) {
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(uniswapPool).slot0();
        
        uint256 marketPrice = _convertSqrtPriceToPrice(sqrtPriceX96);
        
        uint256 agreedPrice = (amountB * 1e18) / amountA;
        
        uint256 deviation;
        if (agreedPrice > marketPrice) {
            deviation = ((agreedPrice - marketPrice) * 10000) / marketPrice;
        } else {
            deviation = ((marketPrice - agreedPrice) * 10000) / marketPrice;
        }
        
        emit PriceValidated(marketPrice, agreedPrice, deviation);
        
        return deviation <= toleranceBPS;
    }
    
    // convert uniswap v3 sqrtpricex96 to regular price
    function _convertSqrtPriceToPrice(uint160 sqrtPriceX96) 
        internal 
        pure 
        returns (uint256) 
    {
        uint256 numerator = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        return numerator >> 192;
    }

    function _updateStatus(Status newStatus) internal {
        emit StatusChanged(status, newStatus);
        status = newStatus;
    }

    // get full escrow details
    function getDetails() external view returns (
        address _maker,
        address _taker,
        address _assetA,
        address _assetB,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _deadline,
        Status _status
    ) {
        return (
            maker,
            taker,
            assetA,
            assetB,
            amountA,
            amountB,
            deadline,
            status
        );
    }
    
    // check if price is currently valid
    function isPriceValid() external view returns (bool) {
        if (uniswapPool == address(0)) return true;
        
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(uniswapPool).slot0();
        uint256 marketPrice = _convertSqrtPriceToPrice(sqrtPriceX96);
        uint256 agreedPrice = (amountB * 1e18) / amountA;
        
        uint256 deviation;
        if (agreedPrice > marketPrice) {
            deviation = ((agreedPrice - marketPrice) * 10000) / marketPrice;
        } else {
            deviation = ((marketPrice - agreedPrice) * 10000) / marketPrice;
        }
        
        return deviation <= toleranceBPS;
    }
}
