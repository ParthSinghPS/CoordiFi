// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface INFTEscrow {
    enum Status {
        CREATED,
        CAPITAL_LOCKED,
        MINTED,
        SETTLED,
        REFUNDED
    }

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

    function initialize(
        address _wlHolder,
        address _capitalHolder,
        address _nftContract,
        uint256 _mintPrice,
        uint256 _splitBPS,
        uint256 _deadline,
        address _smartMintWallet,
        address _factory
    ) external;

    function lockCapital() external payable;
    function executeMint(bytes calldata mintData) external;
    function verifyMint(uint256 tokenId) external;
    function settle() external;
    function refund() external;

    function getDetails()
        external
        view
        returns (
            address wlHolder,
            address capitalHolder,
            address nftContract,
            uint256 mintPrice,
            uint256 splitBPS,
            uint256 deadline,
            Status status
        );
}
