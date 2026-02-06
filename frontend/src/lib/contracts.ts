// Supreme Factory and Escrow Contract Addresses and ABIs
// Deployed on Ethereum Sepolia - Updated 2026-01-29 with dependency fix
// Uses environment variables for addresses to allow easy updates after redeployment

export const CONTRACTS = {
    SUPREME_FACTORY: import.meta.env.VITE_SUPREME_FACTORY_ADDRESS || "0x07177887eebcc93724017958770eff111dafb61d",
    NFT_ESCROW_TEMPLATE: import.meta.env.VITE_NFT_ESCROW_TEMPLATE || "0xdfa81bb447c25bcf67e0c7ecc54c21ddff78a72b",
    OTC_ESCROW_TEMPLATE: import.meta.env.VITE_OTC_ESCROW_TEMPLATE || "0x6046b4bb188ebb4ab58025dfb27b95f123a063c8",
    FREELANCE_ESCROW_TEMPLATE: import.meta.env.VITE_FREELANCE_ESCROW_TEMPLATE || "0x1c85efbf7742e83544e41f5d1ea4791c894381d5",
    TEST_NFT_CONTRACT: "0x40eac109538c6d95dc01a102d8785355687721c9", // 0.002 ETH mint price
    // Token addresses on Sepolia
    WETH: import.meta.env.VITE_WETH_ADDRESS || "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
    USDC: import.meta.env.VITE_USDC_ADDRESS || "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
} as const;

// Standard ERC20 ABI (for approve, allowance, balanceOf)
export const ERC20_ABI = [
    {
        inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
        name: "approve",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
        name: "allowance",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "account", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "decimals",
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
    },
] as const;

// WETH ABI (extends ERC20 with deposit/withdraw)
export const WETH_ABI = [
    ...ERC20_ABI,
    {
        inputs: [],
        name: "deposit",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [{ name: "wad", type: "uint256" }],
        name: "withdraw",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
] as const;

// TestNFTCollection ABI for minting
export const TEST_NFT_ABI = [
    {
        inputs: [],
        name: "publicMint",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [],
        name: "MINT_PRICE",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "nextTokenId",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [
            { name: "owner", type: "address" },
            { name: "index", type: "uint256" },
        ],
        name: "tokenOfOwnerByIndex",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "tokenId", type: "uint256" }],
        name: "ownerOf",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
] as const;

export const SUPREME_FACTORY_ABI = [
    {
        inputs: [{ name: "_feeCollector", type: "address" }],
        stateMutability: "nonpayable",
        type: "constructor",
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "instanceId", type: "uint256" },
            { indexed: true, name: "escrow", type: "address" },
            { indexed: true, name: "smartMintWallet", type: "address" },
            { indexed: false, name: "wlHolder", type: "address" },
            { indexed: false, name: "capitalHolder", type: "address" },
            { indexed: false, name: "nftContract", type: "address" },
            { indexed: false, name: "mintPrice", type: "uint256" },
        ],
        name: "NFTEscrowDeployed",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "instanceId", type: "uint256" },
            { indexed: true, name: "escrow", type: "address" },
            { indexed: true, name: "maker", type: "address" },
            { indexed: false, name: "assetA", type: "address" },
            { indexed: false, name: "assetB", type: "address" },
            { indexed: false, name: "amountA", type: "uint256" },
            { indexed: false, name: "amountB", type: "uint256" },
        ],
        name: "OTCEscrowDeployed",
        type: "event",
    },
    // View functions
    {
        inputs: [{ name: "user", type: "address" }],
        name: "getInstancesByUser",
        outputs: [{ name: "", type: "uint256[]" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [{ name: "instanceId", type: "uint256" }],
        name: "getInstanceDetails",
        outputs: [
            {
                components: [
                    { name: "escrowAddress", type: "address" },
                    { name: "creator", type: "address" },
                    { name: "instanceType", type: "uint8" },
                    { name: "createdAt", type: "uint256" },
                    { name: "status", type: "uint8" },
                ],
                name: "",
                type: "tuple",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getTotalInstances",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "platformFeeBPS",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "feeCollector",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "nftEscrowTemplate",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "otcEscrowTemplate",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "freelanceEscrowTemplate",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    // Deploy functions
    {
        inputs: [
            { name: "wlHolder", type: "address" },
            { name: "capitalHolder", type: "address" },
            { name: "nftContract", type: "address" },
            { name: "mintPrice", type: "uint256" },
            { name: "splitBPS", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
        name: "deployNFTEscrow",
        outputs: [
            { name: "instanceId", type: "uint256" },
            { name: "smartMintWallet", type: "address" },
            { name: "escrowAddress", type: "address" },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { name: "maker", type: "address" },
            { name: "assetA", type: "address" },
            { name: "assetB", type: "address" },
            { name: "amountA", type: "uint256" },
            { name: "amountB", type: "uint256" },
            { name: "toleranceBPS", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
        name: "deployOTCEscrow",
        outputs: [
            { name: "instanceId", type: "uint256" },
            { name: "escrowAddress", type: "address" },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { name: "client", type: "address" },
            { name: "paymentToken", type: "address" },
            { name: "totalAmount", type: "uint256" },
        ],
        name: "deployFreelanceEscrow",
        outputs: [
            { name: "instanceId", type: "uint256" },
            { name: "escrowAddress", type: "address" },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Deploy Freelance Escrow with Milestones (single transaction) - PAYABLE: client sends 0.5% deployment fee
    {
        inputs: [
            { name: "client", type: "address" },
            { name: "paymentToken", type: "address" },
            { name: "totalAmount", type: "uint256" },
            {
                name: "milestones",
                type: "tuple[]",
                components: [
                    { name: "worker", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                    { name: "revisionLimit", type: "uint256" },
                    { name: "description", type: "string" },
                    { name: "dependencies", type: "uint256[]" },
                ],
            },
        ],
        name: "deployFreelanceEscrowWithMilestones",
        outputs: [
            { name: "instanceId", type: "uint256" },
            { name: "escrowAddress", type: "address" },
        ],
        stateMutability: "payable",
        type: "function",
    },
    // Freelance Escrow Event
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "instanceId", type: "uint256" },
            { indexed: true, name: "escrow", type: "address" },
            { indexed: true, name: "client", type: "address" },
            { indexed: false, name: "paymentToken", type: "address" },
            { indexed: false, name: "totalAmount", type: "uint256" },
            { indexed: false, name: "milestoneCount", type: "uint256" },
        ],
        name: "FreelanceEscrowDeployed",
        type: "event",
    },
] as const;

export const NFT_ESCROW_ABI = [
    // View functions
    {
        inputs: [],
        name: "status",
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "wlHolder",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "capitalHolder",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "nftContract",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "mintPrice",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "splitBPS",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "deadline",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "nftTokenId",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getDetails",
        outputs: [
            { name: "_wlHolder", type: "address" },
            { name: "_capitalHolder", type: "address" },
            { name: "_nftContract", type: "address" },
            { name: "_nftTokenId", type: "uint256" },
            { name: "_mintPrice", type: "uint256" },
            { name: "_splitBPS", type: "uint256" },
            { name: "_deadline", type: "uint256" },
            { name: "_status", type: "uint8" },
        ],
        stateMutability: "view",
        type: "function",
    },
    // Approval status fields (for dual-approval tracking)
    {
        inputs: [],
        name: "wlApproved",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "capitalApproved",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "approvedSalePrice",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "approvedMarketplace",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    // State change functions
    {
        inputs: [],
        name: "deposit",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [{ name: "mintData", type: "bytes" }],
        name: "executeMint",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [{ name: "tokenId", type: "uint256" }],
        name: "verifyMint",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            { name: "price", type: "uint256" },
            { name: "marketplace", type: "address" },
        ],
        name: "approveSale",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "executeSale",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    {
        inputs: [],
        name: "distributeSale",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "timeoutRefund",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "refundCapital",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: false, name: "oldStatus", type: "uint8" },
            { indexed: false, name: "newStatus", type: "uint8" },
        ],
        name: "StatusChanged",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "from", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
        ],
        name: "CapitalDeposited",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [{ indexed: true, name: "tokenId", type: "uint256" }],
        name: "NFTReceived",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "buyer", type: "address" },
            { indexed: false, name: "price", type: "uint256" },
        ],
        name: "NFTSold",
        type: "event",
    },
] as const;

export const OTC_ESCROW_ABI = [
    // View functions
    {
        inputs: [],
        name: "status",
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "maker",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "taker",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "assetA",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "assetB",
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "amountA",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "amountB",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "deadline",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getDetails",
        outputs: [
            { name: "_maker", type: "address" },
            { name: "_taker", type: "address" },
            { name: "_assetA", type: "address" },
            { name: "_assetB", type: "address" },
            { name: "_amountA", type: "uint256" },
            { name: "_amountB", type: "uint256" },
            { name: "_deadline", type: "uint256" },
            { name: "_status", type: "uint8" },
        ],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "isPriceValid",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    // State change functions
    {
        inputs: [{ name: "pool", type: "address" }],
        name: "setUniswapPool",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "makerLock",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "takerLock",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "validateAndSettle",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [],
        name: "refund",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: false, name: "oldStatus", type: "uint8" },
            { indexed: false, name: "newStatus", type: "uint8" },
        ],
        name: "StatusChanged",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "maker", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
        ],
        name: "MakerLocked",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "taker", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
        ],
        name: "TakerLocked",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "maker", type: "address" },
            { indexed: true, name: "taker", type: "address" },
            { indexed: false, name: "amountA", type: "uint256" },
            { indexed: false, name: "amountB", type: "uint256" },
            { indexed: false, name: "platformFee", type: "uint256" },
        ],
        name: "OTCSettled",
        type: "event",
    },
] as const;

// Status enums
export const NFT_ESCROW_STATUS = {
    0: "Created",
    1: "Funded",
    2: "Minted",
    3: "Approved",
    4: "Sold",
    5: "Split",
    6: "Refunded",
} as const;

export const OTC_ESCROW_STATUS = {
    0: "Created",
    1: "Maker Locked",
    2: "Both Locked",
    3: "Settled",
    4: "Refunded",
} as const;
// Freelance Escrow ABI - Multi-milestone escrow for client-worker projects
export const FREELANCE_ESCROW_ABI = [
    // Project Info View
    {
        inputs: [],
        name: "getProjectInfo",
        outputs: [
            { name: "client", type: "address" },
            { name: "paymentToken", type: "address" },
            { name: "totalAmount", type: "uint256" },
            { name: "totalPaid", type: "uint256" },
            { name: "platformFeeCollected", type: "uint256" },
            { name: "currentPhase", type: "uint8" },
            { name: "fundedAt", type: "uint256" },
            { name: "milestoneCount", type: "uint256" },
            { name: "completedMilestones", type: "uint256" },
            { name: "allMilestonesCreated", type: "bool" },
        ],
        stateMutability: "view",
        type: "function",
    },
    // Get single milestone
    {
        inputs: [{ name: "milestoneId", type: "uint256" }],
        name: "getMilestone",
        outputs: [
            { name: "milestoneId", type: "uint256" },
            { name: "worker", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "revisionLimit", type: "uint256" },
            { name: "revisionCount", type: "uint256" },
            { name: "status", type: "uint8" },
            { name: "description", type: "string" },
            { name: "createdAt", type: "uint256" },
            { name: "exists", type: "bool" },
        ],
        stateMutability: "view",
        type: "function",
    },
    // Get all milestones
    {
        inputs: [],
        name: "getAllMilestones",
        outputs: [{
            name: "",
            type: "tuple[]",
            components: [
                { name: "milestoneId", type: "uint256" },
                { name: "worker", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "deadline", type: "uint256" },
                { name: "revisionLimit", type: "uint256" },
                { name: "revisionCount", type: "uint256" },
                { name: "status", type: "uint8" },
                { name: "description", type: "string" },
                { name: "createdAt", type: "uint256" },
                { name: "exists", type: "bool" },
            ]
        }],
        stateMutability: "view",
        type: "function",
    },
    // Get project progress
    {
        inputs: [],
        name: "getProjectProgress",
        outputs: [
            { name: "totalMilestones", type: "uint256" },
            { name: "completedMilestones", type: "uint256" },
            { name: "totalPaid", type: "uint256" },
            { name: "remainingAmount", type: "uint256" },
        ],
        stateMutability: "view",
        type: "function",
    },
    // Get milestone dependencies
    {
        inputs: [{ name: "milestoneId", type: "uint256" }],
        name: "getMilestoneDependencies",
        outputs: [{ name: "", type: "uint256[]" }],
        stateMutability: "view",
        type: "function",
    },
    // Check if dependencies are completed
    {
        inputs: [{ name: "milestoneId", type: "uint256" }],
        name: "areDependenciesCompleted",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
    },
    // Add Milestone (client only)
    {
        inputs: [
            { name: "worker", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "revisionLimit", type: "uint256" },
            { name: "description", type: "string" },
        ],
        name: "addMilestone",
        outputs: [{ name: "milestoneId", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Finalize milestones (client only)
    {
        inputs: [],
        name: "finalizeMilestones",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Deposit funds (client only)
    {
        inputs: [],
        name: "depositFunds",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    // Submit work (worker only)
    {
        inputs: [
            { name: "milestoneId", type: "uint256" },
            { name: "ipfsHash", type: "string" },
            { name: "description", type: "string" },
        ],
        name: "submitWork",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Request revision (client only)
    {
        inputs: [
            { name: "milestoneId", type: "uint256" },
            { name: "feedback", type: "string" },
        ],
        name: "requestRevision",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Approve milestone (client only) - PAYABLE: client sends 2.5% approval fee
    {
        inputs: [{ name: "milestoneId", type: "uint256" }],
        name: "approveMilestone",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    // Raise dispute
    {
        inputs: [
            { name: "milestoneId", type: "uint256" },
            { name: "disputeType", type: "uint8" },
            { name: "reason", type: "string" },
        ],
        name: "raiseDispute",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Resolve dispute (platform only)
    {
        inputs: [
            { name: "milestoneId", type: "uint256" },
            { name: "winner", type: "address" },
        ],
        name: "resolveDispute",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // Get dispute info
    {
        inputs: [{ name: "milestoneId", type: "uint256" }],
        name: "getDispute",
        outputs: [{
            name: "",
            type: "tuple",
            components: [
                { name: "milestoneId", type: "uint256" },
                { name: "disputeType", type: "uint8" },
                { name: "initiator", type: "address" },
                { name: "reason", type: "string" },
                { name: "raisedAt", type: "uint256" },
                { name: "resolved", type: "bool" },
                { name: "winner", type: "address" },
                { name: "exists", type: "bool" },
                { name: "previousStatus", type: "uint8" },
            ]
        }],
        stateMutability: "view",
        type: "function",
    },
    // Cancel dispute (platform only) - restores milestone to pre-dispute state
    {
        inputs: [{ name: "milestoneId", type: "uint256" }],
        name: "cancelDispute",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    },
    // ============ Yellow Network Settlement ============
    // Batch settle all milestones in ONE transaction using Yellow state
    {
        inputs: [
            { name: "approvedMilestoneIds", type: "uint256[]" },
            { name: "cancelledMilestoneIds", type: "uint256[]" },
            { name: "yellowSessionId", type: "string" },
        ],
        name: "settleWithYellowProof",
        outputs: [],
        stateMutability: "payable",
        type: "function",
    },
    // Yellow Settlement Event
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "sessionId", type: "string" },
            { indexed: false, name: "approvedCount", type: "uint256" },
            { indexed: false, name: "cancelledCount", type: "uint256" },
            { indexed: false, name: "totalPaid", type: "uint256" },
            { indexed: false, name: "totalFees", type: "uint256" },
            { indexed: false, name: "timestamp", type: "uint256" },
        ],
        name: "YellowSettlement",
        type: "event",
    },
    // Events
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "milestoneId", type: "uint256" },
            { indexed: true, name: "worker", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
            { indexed: false, name: "deadline", type: "uint256" },
        ],
        name: "MilestoneAdded",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "milestoneId", type: "uint256" },
            { indexed: true, name: "worker", type: "address" },
        ],
        name: "WorkSubmitted",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "milestoneId", type: "uint256" },
            { indexed: true, name: "worker", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
        ],
        name: "MilestoneApproved",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: false, name: "amount", type: "uint256" },
            { indexed: false, name: "timestamp", type: "uint256" },
        ],
        name: "FundsDeposited",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            { indexed: true, name: "milestoneId", type: "uint256" },
            { indexed: true, name: "initiator", type: "address" },
            { indexed: false, name: "disputeType", type: "uint8" },
        ],
        name: "DisputeRaised",
        type: "event",
    },
] as const;

export const INSTANCE_TYPE = {
    0: "NFT",
    1: "OTC",
    2: "FREELANCE",
} as const;

/**
 * Compute access hash for NFT whitelist coordination
 * Used for off-chain Merkle proof verification
 */
export function computeNFTAccessHash(
    nftContract: `0x${string}`,
    slotId: bigint,
    _holder: `0x${string}`
): `0x${string}` {
    // In production, use keccak256(abi.encodePacked(nftContract, slotId, holder))
    const mockHash = `0x${nftContract.slice(2, 10)}${slotId.toString(16).padStart(8, '0')}${'0'.repeat(48)}`;
    return mockHash as `0x${string}`;
}

/**
 * Legacy Coordination type for backwards compatibility
 * @deprecated Use NFTEscrowDetails or OTCEscrowDetails
 */
export interface Coordination {
    id: bigint;
    investor: `0x${string}`;
    accessHolder: `0x${string}`;
    amount: bigint;
    accessHash: `0x${string}`;
    status: number;
    deadline: bigint;
    assetContract: `0x${string}`;
    assetId: bigint;
    createdAt: bigint;
}
