// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOTCEscrow {
    enum Status {
        CREATED,
        MAKER_LOCKED,
        BOTH_LOCKED,
        SETTLED,
        REFUNDED
    }

    event Initialized(
        address indexed maker,
        address assetA,
        address assetB,
        uint256 amountA,
        uint256 amountB
    );
    event MakerLocked(address indexed maker, uint256 amount);
    event TakerLocked(address indexed taker, uint256 amount);
    event PriceValidated(
        uint256 marketPrice,
        uint256 agreedPrice,
        uint256 deviation
    );
    event Settled(
        address indexed maker,
        address indexed taker,
        uint256 amountA,
        uint256 amountB,
        uint256 fee
    );
    event Refunded(address indexed to, address asset, uint256 amount);
    event StatusChanged(Status oldStatus, Status newStatus);

    function initialize(
        address _maker,
        address _assetA,
        address _assetB,
        uint256 _amountA,
        uint256 _amountB,
        uint256 _toleranceBPS,
        uint256 _deadline,
        address _factory
    ) external;

    function setUniswapPool(address pool) external;
    function makerLock() external;
    function takerLock() external;
    function validateAndSettle() external;
    function refund() external;

    function getDetails()
        external
        view
        returns (
            address maker,
            address taker,
            address assetA,
            address assetB,
            uint256 amountA,
            uint256 amountB,
            uint256 deadline,
            Status status
        );

    function isPriceValid() external view returns (bool);
}
