# 🤝 CoordiFi

[![HackMoney 2026](https://img.shields.io/badge/HackMoney_2026-Hackathon_Project-blueviolet?style=for-the-badge)](https://ethglobal.com/events/hackmoney2026)
[![Ethereum](https://img.shields.io/badge/Ethereum-Sepolia-blue?style=for-the-badge&logo=ethereum)](https://ethereum.org/)
[![Yellow Network](https://img.shields.io/badge/Yellow_Network-L2_Integration-yellow?style=for-the-badge)](https://yellow.org/)

**A trust-minimized escrow protocol enabling NFT whitelist coordination, OTC trading, and milestone-based freelance payments—powered by smart contracts, IPFS, and Yellow Network's gasless Layer 2.**

---

## 🎯 The Problem We Solve

The crypto ecosystem faces critical coordination challenges across multiple domains:

### NFT Minting

- **Capital Barrier**: Whitelist holders can't afford mint prices
- **Trust Issues**: Capital providers fear being rugged
- **No Safety Mechanisms**: No trustless profit-splitting solutions

### OTC Trading

- **Price Manipulation**: No reliable price oracles for peer-to-peer swaps
- **Counterparty Risk**: Atomic swaps lack protection against unfair pricing
- **High Slippage**: Traditional DEXs unsuitable for large trades

### Freelance Work

- **Payment Disputes**: No transparent milestone tracking
- **High Gas Costs**: On-chain interactions prohibitively expensive
- **Platform Fees**: 30-50% fees on centralized platforms like Upwork
- **No Recourse**: Freelancers and clients lack trustless dispute resolution

---

## 💡 Our Solution

**CoordiFi** provides three specialized escrow systems:

| 🎨 NFT Whitelist Coordination                          | 💱 OTC Trading                                            | 💼 Freelance Escrow                              |
| ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| WL holders partner with capital providers to mint NFTs | Peer-to-peer token swaps with Uniswap V3 price validation | Milestone-based payments with dispute resolution |
| Automated profit splitting                             | Atomic settlement with price oracle                       | Yellow Network gasless operations                |
| SmartMintWallet for safety                             | Zero slippage guarantees                                  | Multi-worker project support                     |

### Key Innovations

**EIP-1167 Gas Optimization** - Deploy escrow instances for 90% less gas  
**SmartMintWallet** - Whitelisted proxy prevents capital holder rugpulls  
**Uniswap V3 Oracle** - Fair price validation for OTC trades  
**Yellow Network Integration** - Gasless milestone approvals and coordination  
**IPFS Metadata** - Permanent storage via Pinata  
**ENS Support** - Human-readable addresses throughout

---

## 🏗️ Architecture Overview

### System Design

```
                              ┌─────────────────────────────────────┐
                              │          SupremeFactory             │
                              │  (Main Entry Point - EIP-1167)      │
                              │                                     │
                              │  • Deploys escrow clones            │
                              │  • Manages instances                │
                              │  • Collects platform fees           │
                              └─────────────────────────────────────┘
                                               │
            ┌──────────────────────────────────┼──────────────────────────────────┐
            │                                  │                                  │
            ▼                                  ▼                                  ▼
┌───────────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│      NFTEscrow        │        │      OTCEscrow        │        │   FreelanceEscrow     │
│   (templates/)        │        │    (templates/)       │        │    (templates/)       │
├───────────────────────┤        ├───────────────────────┤        ├───────────────────────┤
│ • WL + Capital coord  │        │ • Maker/Taker model   │        │ • Multi-milestone     │
│ • Profit splitting    │        │ • Uniswap V3 oracle   │        │ • Multi-worker        │
│ • NFT custody         │        │ • Atomic token swap   │        │ • Dispute resolution  │
└───────────────────────┘        └───────────────────────┘        │ • Yellow Network      │
            │                              │                      └───────────────────────┘
            │                              │                                  │
            ▼                              ▼                                  ▼
┌───────────────────────┐        ┌───────────────────────┐         ┌───────────────────────┐
│   SmartMintWallet     │        │    IUniswapV3Pool     │         │   IFreelanceEscrow    │
│      (src/)           │        │    (interfaces/)      │         │    (interfaces/)      │
├───────────────────────┤        ├───────────────────────┤         ├───────────────────────┤
│ • Gets WL instead of  │        │ • slot0() for price   │         │ • MilestoneInput      │
│   user's EOA          │        │ • sqrtPriceX96        │         │ • Deployment struct   │
│ • Controlled minting  │        │   conversion          │         └───────────────────────┘
└───────────────────────┘        └───────────────────────┘

```

### Smart Contract Architecture

#### NFT Escrow

```
                                    ┌─────────┐                                                  REFUND PATH
                                    │  Start  │                                          ─────────────────────────
                                    └────┬────┘                                          From: CREATED/FUNDED/MINTED
                                         │                                                              |
                                         │ deployNFTEscrow()                                            │ Deadline expires
                                         │ SupremeFactory                                               :
                                         ▼                                                              :
                        ┌────────────────────────────────────┐                                          ▼
                        │  1. Deploy Escrow + SmartMintWallet│                            ╭─────────────────────────────╮
                        │  WL Holder: Alice                  │                            │  Refund Capital             │
                        │  Capital Holder: Bob               │                            │  Function: refundCapital()  │
                        │  Mint Price: 0.002 ETH             │                            │  Capital → Bob              │
                        │  Profit Split: 70/30               │                            │  NFT → Alice (if minted)    │
                        └────────────────┬───────────────────┘                            ╰──────────────┬──────────────╯
                                         │                                                               |
                                         │ STATUS: CREATED                                               │ STATUS: REFUNDED
                                         ▼                                                               ▼
                        ┌────────────────────────────────────┐                                      ┌─────────┐
                        │  2. Lock Capital                   │                                      │   End   │
                        │  Actor: Bob (Capital Holder)       │                                      └─────────┘
                        │  Function: deposit()               │
                        │  Value: 0.002 ETH                  │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: FUNDED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  3. Execute Mint                   │
                        │  Actor: Alice (WL Holder)          │
                        │  Function: executeMint(mintData)   │
                        │  SmartMintWallet → NFT Contract    │
                        │  NFT minted to SmartMintWallet     │
                        └────────────────┬───────────────────┘
                                         │
                                         │ NFT minted
                                         ▼
                        ┌────────────────────────────────────┐
                        │  4. Verify Mint                    │
                        │  Actor: Alice                      │
                        │  Function: verifyMint(tokenId)     │
                        │  NFT transferred to escrow custody │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: MINTED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  5. Approve Sale                   │
                        │  Actors: Both Parties              │
                        │  Function: approveSale(price,buyer)│
                        │  Alice sets → Bob confirms         │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: APPROVED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  6. Execute Sale                   │
                        │  Actor: Buyer                      │
                        │  Function: executeSale()           │
                        │  Value: 3 ETH                      │
                        │  NFT → Buyer                       │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: SOLD
                                         ▼
                        ┌────────────────────────────────────┐
                        │  7. Distribute Proceeds            │
                        │  Function: distributeSale()        │
                        │  Platform Fee: 0.5% of profit      │
                        │  Bob: 1 ETH + 1.4 ETH (70%)        │
                        │  Alice: 0.6 ETH (30%)              │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: SPLIT
                                         ▼
                                  ┌────────────┐
                                  │  Complete  │
                                  └────────────┘




```

#### OTC Escrow

```
                                    ┌─────────┐
                                    │  Start  │
                                    └────┬────┘
                                         │
                                         │ deployOTCEscrow()
                                         │ SupremeFactory
                                         ▼
                        ┌────────────────────────────────────┐
                        │  Initialize                        │
                        │  Maker: Alice                      │
                        │  Asset A: USDC (1000)              │
                        │  Asset B: WETH (0.5)               │
                        │  Tolerance: ±5%                    │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: CREATED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  1. Maker Locks (Deposits Asset A) │
                        │  Actor: Alice (Maker)              │
                        │  Function: makerLock()             │--------------
                        │  USDC: 1000 → Escrow               │             |
                        └────────────────┬───────────────────┘             |
                                         │                                 |
                  Taker accepts          │                            Cancel before Taker
                         │               │                                 :
                         │               │                                 :
                         │               │ STATUS: MAKER_LOCKED            :
                         │               │                                 :
                         │               │                                 :
                         ▼               │                                 ▼
                        ┌────────────────────────────────────┐      ╭────────────────────────╮
                        │  2. Taker Locks (Deposits Asset B) │      │  Refund Asset A        │
                        │  Actor: Bob (Taker)                │      │  Maker Cancels         │
                        │  Function: takerLock()             │      ╰────────────────────────╯
                        │  WETH: 0.5 → Escrow                │
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: BOTH_LOCKED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  3. Validation & Swap              │
                        │  Function: validateAndSettle()     │
                        │  - Check Uniswap price (if set)    │-------------------
                        │  - Verify ±5% tolerance            │                  |
                        │  - Execute atomic swap             │                  |
                        └────────────────┬───────────────────┘                  |
                                         │                                      |
                 Price within tolerance  │                          Price too high/low OR Expired
                         │               │                                      :
                         │               │                                      :
                         ▼               │                                      ▼
                        ┌────────────────────────────────────┐      ╭────────────────────────╮
                        │  4. Trade Complete                 │      │  Refund All            │
                        │  Platform Fee: 5%                  │      │  Validation Failed     │
                        │  USDC 950 → Bob                    │      │  USDC → Alice          │
                        │  WETH 0.475 → Alice                │      │  WETH → Bob            │
                        │  Fees → Platform                   │      ╰────────────────────────╯
                        └────────────────┬───────────────────┘
                                         │
                                         │ STATUS: SETTLED
                                         ▼
                                  ┌────────────┐
                                  │  Complete  │
                                  └────────────┘

```

#### Freelance Escrow

```
                                    ┌─────────┐                                                 DISPUTE PATH
                                    │  Start  │                                            ──────────────────────────
                                    └────┬────┘                                           From: Any Milestone Status
                                         │                                                         │
                                         │ deployFreelanceEscrowWithMilestones()                   │ raiseDispute()
                                         │ SupremeFactory | Fee: 0.5%                              :
                                         ▼                                                         :
                        ┌────────────────────────────────────┐                                     ▼
                        │  1. Create Project                 │                       ╭─────────────────────────────╮
                        │  Client: Deployer                  │                       │  Platform Review            │
                        │  M1: Frontend (Alice)              │                     --│  resolveDispute()           │--------
                        │  M2: Backend (Bob) - depends on M1 │                     | ╰──────────────┬──────────────╯        |
                        │  Total: 0.01 ytest.usd             │                     |                │                       |
                        └────────────────┬───────────────────┘                Client wins           │                 Worker wins
                                         │                                         :                │                       :
                                         │ PHASE: CREATED                          :                │                       :
                                         ▼                                         ▼                │                       ▼
                        ┌────────────────────────────────────┐             ╭──────────────╮         │                ╭──────────────╮
                        │  2. Deposit Funds                  │             │  CANCELLED   │         │                │  APPROVED    │
                        │  Actor: Client                     │             │  Refund      │         │                │  Payment     │
                        │  Function: depositFunds()          │             │  to Client   │         │                │  to Worker   │
                        │  Amount: 0.01 ytest.usd → Escrow   │             ╰──────────────╯         │                ╰──────────────╯
                        └────────────────┬───────────────────┘                                      ▼
                                         │                                                    Settle continues
                                         │ PHASE: FUNDED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  3. Initialize Yellow Session      │
                        │  Client signs 2 messages           │
                        │  Session ID created                │
                        │  State: V1 (Initial)               │
                        │  Yellow Network Active ✅         │
                        └────────────────┬───────────────────┘
                                         │
                                         │ Session Created
                                         ▼
                        ┌────────────────────────────────────┐
                        │  4. Submit Work - Milestone 1      │
                        │  Actor: Alice (Frontend)           │
                        │  Upload to Pinata → IPFS CID       │
                        │  Yellow Update (Gas: 0 ETH ✨)     │--------------
                        │  State: V1 → V2                    │              │
                        └────────────────┬───────────────────┘              │
                                         │                                  |
                      Client approves    │                             Client requests revision
                         │               │                                  :
                         │               │                                  :
                         │               │ M1: SUBMITTED                    :
                         │               │                                  :
                         │               │                                  ▼
                         ▼               │                          ╭──────────────────╮
                        ┌────────────────────────────────────┐      │  Request Revision│
                        │  5. Approve Milestone 1            │      │  Yellow Update   │
                        │  Actor: Client                     │      │  Back to Submit  │
                        │  Yellow Update (Gas: 0 ETH ✨)     |      ╰─────────────────╯
                        │  State: V2 → V3                    │
                        │  Approval Fee: 2.5%                │
                        └────────────────┬───────────────────┘
                                         │
                                         │ M1: APPROVED
                                         │ M2 unlocked (dependency satisfied)
                                         ▼
                        ┌────────────────────────────────────┐
                        │  6. Submit Work - Milestone 2      │
                        │  Actor: Bob (Backend)              │
                        │  Upload to Pinata → IPFS CID       │
                        │  Yellow Update (Gas: 0 ETH ✨)     │
                        │  State: V3 → V4                    │
                        └────────────────┬───────────────────┘
                                         │
                                         │ M2: SUBMITTED
                                         ▼
                        ┌────────────────────────────────────┐
                        │  7. Approve Milestone 2            │
                        │  Actor: Client                     │
                        │  Yellow Update (Gas: 0 ETH ✨)     │
                        │  State: V4 → V5 (Final)            │
                        │  Approval Fee: 2.5%                │
                        └────────────────┬───────────────────┘
                                         │
                                         │ M2: APPROVED
                                         │ All milestones complete
                                         ▼
                        ┌────────────────────────────────────┐
                        │  8. Settle Project (Batch)         │
                        │  Function: settleWithYellowProof() │
                        │  Verifies Yellow proof (V5 state)  │
                        │  M1: Alice gets 0.004875           │
                        │  M2: Bob gets 0.004875             │
                        │  Platform fees: 0.0003             │
                        │  Gas: ~200k (~$6)                  │
                        │  WITHOUT Yellow: ~600k (~$18)      │
                        └────────────────┬───────────────────┘
                                         │
                                         │ PHASE: COMPLETED
                                         │ Yellow Session: CLOSED
                                         ▼
                                  ┌────────────┐
                                  │  Complete  │
                                  └────────────┘

```

---

## 🔧 Tech Stack

### Frontend

- **Framework**: React 18.3.1 + Vite 6.1.1
- **Language**: TypeScript 5.7.3
- **Styling**: Tailwind CSS 4.0.0
- **Web3**: wagmi 2.15.2 + viem 2.22.6 + ethers 6.15.0
- **Routing**: React Router 7.1.1

### Backend & Services

- **API Routes**: Next.js-style API handlers
- **Database**: Supabase 2.50.0
- **IPFS Storage**: Pinata SDK (pinata-web3 0.5.4)
- **L2 Coordination**: Yellow Network WebSocket SDK

### Blockchain

- **Network**: Ethereum Sepolia Testnet (Chain ID: 11155111)
- **Smart Contracts**: Solidity 0.8.24
- **Development**: Foundry (forge, anvil)
- **Standards**: ERC-20, ERC-721, EIP-1167
- **Libraries**: OpenZeppelin Contracts

### Infrastructure

- **Version Control**: Git
- **Package Manager**: npm
- **Build Tool**: Vite
- **Testing**: Foundry Test Suite

---

## 📦 Smart Contracts

### Core Contracts

#### 1. SupremeFactory.sol ⭐

**The main entry point.** Deploys and manages all escrow instances using EIP-1167 minimal proxies.

**Key Functions:**

```solidity
// Deploy NFT coordination escrow
function deployNFTEscrow(
        address wlHolder,
        address capitalHolder,
        address nftContract,
        uint256 mintPrice,
        uint256 splitBPS,
        uint256 deadline
    ) external returns (
        uint256 instanceId,
        address smartMintWallet,
        address escrowAddress
    )

// Deploy OTC trading escrow
function deployOTCEscrow(
        address maker,
        address assetA,
        address assetB,
        uint256 amountA,
        uint256 amountB,
        uint256 toleranceBPS,
        uint256 deadline
    ) external returns (
        uint256 instanceId,
        address escrowAddress
    )

// Deploy freelance escrow with milestones atomically
function deployFreelanceEscrowWithMilestones(
        address client,
        address paymentToken,
        uint256 totalAmount,
        IFreelanceEscrow.MilestoneInput[] calldata milestones
    ) external payable returns (
        uint256 instanceId,
        address escrowAddress
    )

// Get all instances for a user
function getInstancesByUser(address user) external view returns (uint256[] memory)

// Get instance details
function getInstanceDetails(uint256 instanceId) external view returns (EscrowInstance memory)
```

---

#### 2. SmartMintWallet.sol

**Secure NFT minting proxy.** Gets whitelisted instead of user's EOA to ensure capital safety.

**Key Functions:**

```solidity
// Execute NFT mint (escrow-only)
function executeMint(bytes calldata mintData) external payable

// Transfer NFT to escrow
function transferToEscrow(uint256 tokenId) external
```

**Why This Matters:**  
Capital holders can't be rugged because the NFT goes directly to escrow custody, not the WL holder's address.

---

### Template Contracts

#### 3. NFTEscrow.sol

**NFT whitelist coordination** between WL holders and capital providers.

**State Flow:** `CREATED → FUNDED → MINTED → APPROVED → SOLD → SPLIT`

**Key Functions:**

```solidity
// Capital holder deposits mint price
function deposit()
        external
        payable
        onlyCapitalHolder
        inStatus(Status.CREATED)
        notExpired

// Execute mint via SmartMintWallet
function executeMint(bytes calldata mintData)
        external
        inStatus(Status.FUNDED)
        notExpired
        nonReentrant

// Both parties approve sale terms
function approveSale(uint256 salePrice, address buyer)
        external
        onlyWLHolder
        inStatus(Status.MINTED)
        nonReentrant

// Split proceeds: capital + profit share + platform fee
function distributeSale()
        external
        onlyWLHolder
        inStatus(Status.APPROVED)
        nonReentrant

// Refund capital if mint never happened
function refundCapital()
        external
        onlyCapitalHolder
        inStatus(Status.FUNDED)
        notExpired
        nonReentrant
```

**Fee Structure:**

- **With Profit**: 0.5% of profit
- **No Profit**: 0.005% of sale price

---

#### 4. OTCEscrow.sol

**Peer-to-peer token swaps** with optional Uniswap V3 price validation.

**State Flow:** `CREATED → MAKER_LOCKED → BOTH_LOCKED → SETTLED`

**Key Functions:**

```solidity
// Maker deposits assetA
function makerLock()
        external
        onlyMaker
        inStatus(Status.CREATED)
        notExpired
        nonReentrant

// Taker deposits assetB
function takerLock()
        external
        onlyTaker
        inStatus(Status.MAKER_LOCKED)
        notExpired
        nonReentrant

// Set Uniswap V3 pool for price validation
function setUniswapPool(address poolAddress)
        external
        onlyMaker
        inStatus(Status.MAKER_LOCKED)
        nonReentrant

// Validate price and execute atomic swap
function validateAndSettle()
        external
        inStatus(Status.BOTH_LOCKED)
        nonReentrant

// Refund both parties
function refund()
        external
        inStatus(Status.BOTH_LOCKED)
        notExpired
        nonReentrant
```

**Price Oracle:**  
Uses Uniswap V3 `slot0()` to ensure fair pricing. Prevents trades outside ±5% of market price.

**Platform Fee:** 5% collected at settlement

---

#### 5. FreelanceEscrow.sol

**Milestone-based freelance payments** with multi-worker support and dispute resolution.

**Key Functions:**

```solidity
function depositFunds()
        external
        payable
        override
        onlyClient
        inPhase(Phase.Created)
        nonReentrant

// Worker submits deliverable
function submitWork(uint256 milestoneId, string ipfsHash)
        external
        onlyWorker
        inPhase(Phase.Created)
        nonReentrant

// Client approves + pays 2.5% fee per milestone
function approveMilestone(uint256 milestoneId)
        external
        onlyClient
        inPhase(Phase.Created)
        nonReentrant

// Client requests changes
function requestRevision(uint256 milestoneId, string feedback)
        external
        onlyClient
        inPhase(Phase.Created)
        nonReentrant

// Either party raises dispute
function raiseDispute(uint256 milestoneId, string reason)
        external
        inPhase(Phase.Created)
        nonReentrant

// Platform resolves dispute
function resolveDispute(
        uint256 milestoneId,
        address winner
    )
        external
        override
        onlyPlatform
        milestoneExists(milestoneId)
        milestoneInStatus(milestoneId, MilestoneStatus.Disputed)
        nonReentrant

// Batch settle via Yellow Network proof
function settleWithYellowProof(
        uint256[] calldata approvedMilestoneIds,
        uint256[] calldata cancelledMilestoneIds,
        string calldata yellowSessionId
    ) external payable onlyClient nonReentrant
```

**Milestone States:**  
`PENDING → SUBMITTED → APPROVED → PAID` (or `DISPUTED`)

---

## 🎯 Sponsor Integrations

### Yellow Network

**Status:** ✅ Fully Integrated with Gasless Coordination

**Why Yellow Network?**

Traditional on-chain interactions cost gas for every milestone approval. For a 10-milestone project, that's 10 separate transactions. Yellow Network solves this with:

- **Gasless Operations**: Create payment channels, update milestones off-chain
- **Batch Settlement**: Settle multiple milestones in a single transaction
- **State Channels**: Off-chain coordination with on-chain finality
- **Cryptographic Proofs**: Trustless verification of off-chain state

**How It Works:**

The Yellow Network integration enables freelance projects to coordinate entirely off-chain through WebSocket connections. Milestone updates, approvals, and communications happen without gas costs, with the final state being settled on-chain in a single transaction using cryptographic proofs.

**Gas Savings Example:**

| Operation              | Without Yellow        | With Yellow       |
| ---------------------- | --------------------- | ----------------- |
| 10 milestone approvals | ~2,000,000 gas (~$60) | 200,000 gas (~$6) |
| **Savings**            | **90% reduction**     | **10x cheaper**   |

**User Journey:**

```
1. Client creates project → Yellow session initiated
2. Worker submits milestone → Yellow state update (0 gas)
3. Client approves → Yellow state update (0 gas)
4. Repeat steps 2-3 for all milestones
5. Final settlement → Single transaction settles entire project
```

**Key Components:**

- Yellow Network WebSocket client for real-time coordination
- State channel management for off-chain updates
- Cryptographic proof generation for on-chain settlement
- Session management across multiple milestones

---

### Pinata (IPFS Storage)

**Status:** ✅ Fully Integrated & Production-Ready

**Package:** `pinata-web3` 0.5.4

**Why Pinata?**

Raw IPFS has challenges: unpinning risks, gateway reliability issues, complex APIs. Pinata solves this with:

- **Permanent Pinning**: Content stays available indefinitely
- **Global CDN**: Fast worldwide access via edge gateways
- **Simple SDK**: Easy-to-use upload/retrieval API
- **Metadata Tagging**: Searchable, organized content

**How It Works:**

Pinata provides a managed IPFS infrastructure that handles content persistence, gateway reliability, and global distribution. When users upload deliverables or metadata, Pinata ensures the content remains permanently accessible through its CDN network.

**Data Flow:**

```
Milestone Submission
→ Worker uploads deliverable to Pinata
→ Get IPFS CID (e.g., QmXyz...)
→ Store CID on-chain in milestone struct
→ Client retrieves deliverable from Pinata gateway
```

**Use Cases:**

- Freelance deliverables (designs, code, documents)
- NFT metadata (images, attributes, descriptions)
- Project proposals and contracts
- Dispute evidence and documentation

---

### Supabase (Off-Chain Database)

**Status:** ✅ Fully Integrated

**Package:** `@supabase/supabase-js` 2.50.0

**Why Supabase?**

Not all data belongs on-chain. Supabase provides:

- **Fast Queries**: Instant search/filter without blockchain delays
- **Rich Metadata**: Store descriptions, images, chat logs
- **User Profiles**: Social features without gas costs
- **Real-Time Updates**: Live milestone status, notifications

**How It Works:**

Supabase acts as the off-chain database layer, storing project metadata, milestone communications, user profiles, and transaction history. This enables fast queries and rich user experiences without the cost and latency of on-chain storage.

**Database Schema:**

The database maintains tables for freelance projects, milestones, communications, disputes, OTC offers, NFT listings, and transaction history. Each table syncs with on-chain events while providing additional metadata and search capabilities.

**Key Features:**

- Real-time subscriptions for live updates
- Full-text search across projects and milestones
- User activity tracking and analytics
- Milestone communication threads
- Dispute history and resolution tracking

---

### Uniswap V3 (Price Oracle)

**Status:** ✅ Integrated in OTCEscrow

**Interface:** `IUniswapV3Pool.sol`

**Why Uniswap V3?**

OTC trades need fair pricing guarantees. Uniswap V3 provides:

- **Decentralized Price Feeds**: No centralized oracle dependencies
- **Deep Liquidity**: Accurate prices for most token pairs
- **Tamper-Resistant**: Manipulation-resistant TWAP support

**How It Works:**

The OTC escrow can optionally validate trade prices against Uniswap V3 pool data. Before settlement, the contract reads the current price from the pool's `slot0()` function and ensures the agreed trade price is within ±5% of the market price, preventing unfair trades.

**Price Validation:**

The system converts Uniswap's `sqrtPriceX96` format to human-readable prices, compares the agreed trade price to the market price, and rejects trades with >5% deviation. This protects both parties from price manipulation while allowing for reasonable negotiation margins.

---

### ENS (Ethereum Name Service)

**Status:** ✅ Integrated throughout UI

**Package:** Built-in wagmi support

**Why ENS?**

Wallet addresses like `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` are hard to read. ENS provides:

- **Human-Readable Names**: `vitalik.eth` instead of `0x...`
- **Reverse Resolution**: Display names everywhere
- **Professional UX**: Match Web2 expectations

**How It Works:**

The frontend uses wagmi's ENS hooks to automatically resolve Ethereum addresses to ENS names wherever addresses are displayed. This includes user profiles, milestone assignments, transaction history, and dispute participants, creating a more user-friendly experience.

**Used In:**

- User profiles
- Milestone worker assignments
- Transaction history
- Dispute participants
- NFT escrow parties

---

## 🚀 Setup & Installation

### Prerequisites

- **Node.js** 18+ and npm
- **Foundry** (for smart contract development)
- **Git**
- **MetaMask** browser extension

### Quick Start

#### Smart Contracts Setup

```bash
# 1. Clone repository
git clone https://github.com/CoordiFi/CoordiFi.git

# 2. Install Foundry (skip if already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 3. Navigate to contracts directory
cd contracts

# 4. Create contracts .env file
cp .env.example .env

# 5. Configure contract environment variables
# Edit contracts/.env with:
DEPLOYER_PRIVATE_KEY=0x...your_private_key_here
ETHEREUM_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
ETHERSCAN_API_KEY=your_etherscan_api_key  # Optional: For verification

# 6. Populate lib folder with dependencies
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts

# 7. Build contracts
forge build
```

---

#### Frontend Setup

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install frontend dependencies
npm install

# 3. Create frontend .env file
cp .env.example .env

# 4. Configure frontend environment variables
VITE_SUPREME_FACTORY_ADDRESS=0xYourDeployedFactoryAddress
VITE_USDC_ADDRESS=0xYourUSDCAddress
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PINATA_JWT=your_pinata_jwt_token
VITE_YELLOW_WS_URL=wss://testnet.yellow.org

# 5. Run development server
npm run dev
```

Visit `http://localhost:5173` to see the app!

---

### Get API Keys

| Service            | Purpose            | Link                                 |
| ------------------ | ------------------ | ------------------------------------ |
| **Supabase**       | Off-chain database | [supabase.com](https://supabase.com) |
| **Pinata**         | IPFS storage       | [pinata.cloud](https://pinata.cloud) |
| **Alchemy**        | RPC provider       | [alchemy.com](https://alchemy.com)   |
| **Yellow Network** | L2 coordination    | [yellow.org](https://yellow.org)     |

---

### MetaMask Setup

1. **Add Sepolia Testnet**
   - Network Name: Sepolia
   - RPC URL: `https://eth-sepolia.g.alchemy.com/v2/demo`
   - Chain ID: `11155111`
   - Currency Symbol: `ETH`

2. **Get Test ETH**
   - Visit [Sepolia Faucet](https://sepoliafaucet.com/)
   - Enter your wallet address
   - Receive 0.5 ETH for testing

3. **Connect to App**
   - Click "Connect Wallet"
   - Select MetaMask
   - Approve connection

---

## 📖 Usage Guide

### Creating an NFT Whitelist Coordination

```
1. Navigate to NFT Whitelist
2. Enter NFT contract address
3. Specify mint price and profit split (e.g., 70/30)
4. Enter capital holder address and deploy NFTEscrow
5. Capital holder deposits mint price
6. System executes mint via SmartMintWallet
7. NFT held in escrow until sale approved
8. Both parties approve sale terms
9. Buyer executes purchase → profits split automatically
```

**Example:**  
Azuki mint costs 1 ETH. Capital holder deposits 1 ETH. NFT mints and sells for 3 ETH. Profits split: Capital holder gets 1 ETH (cost) + 1.4 ETH (70% of 2 ETH profit). WL holder gets 0.6 ETH (30% of profit).

---

### Creating an OTC Trade

```
1. Navigate to OTC Trade
2. Maker specifies:
   - Asset A (what they're offering)
   - Asset B (what they want)
   - Amounts for both
   - Optional: Uniswap V3 pool for price validation
3. Deploy escrow
4. Maker locks Asset A
5. Taker locks Asset B
6. Anyone calls validateAndSettle()
7. System checks Uniswap price (if pool specified)
8. Atomic swap executes if price is fair (±5%)
```

**Example:**  
Swap 1000 USDC for 0.5 WETH. Uniswap shows current price: 1 WETH = 2000 USDC. Agreed price: 1 WETH = 2000 USDC. Trade executes (within 5% threshold).

---

### Creating a Freelance Project

```
1. Navigate to Freelance
2. Client fills project form:
   - Title, description
   - Payment token (USDC)
   - Total budget
   - Worker addresses
3. Add milestones:
   - Description, amount, assigned worker
   - Can add multiple milestones
4. Deploy escrow (0.5% deployment fee)
5. Client deposits full project amount
6. Workers submit deliverables (IPFS hash)
7. Client approves milestones (2.5% fee per milestone)
8. Payments released automatically
```

**With Yellow Network:**

```
1-4. Same as above
5. Create Yellow session for gasless coordination
6. Worker submits → Yellow state update (0 gas)
7. Client approves → Yellow state update (0 gas)
8. Repeat 6-7 for all milestones
9. Final settlement → Single transaction settles all milestones
```

---

## 🎨 Key Features

### For NFT Collectors

✅ **Safe Minting** - SmartMintWallet prevents capital holder rugpulls  
✅ **Transparent Profits** - Automated profit splitting via smart contracts  
✅ **No Trust Required** - Escrow holds NFT until both parties agree  
✅ **Low Fees** - 0.5% on profits (or 0.005% if no profit)

### For OTC Traders

✅ **Price Protection** - Uniswap V3 oracle ensures fair pricing  
✅ **Atomic Swaps** - Both assets locked before settlement  
✅ **Zero Slippage** - Exact amounts guaranteed  
✅ **Refund Safety** - Get assets back if trade fails

### For Freelancers & Clients

✅ **Milestone Tracking** - Transparent progress visibility  
✅ **Gasless Approvals** - Yellow Network reduces costs by 90%  
✅ **Dispute Resolution** - Platform-mediated conflict resolution  
✅ **Multi-Worker Support** - Assign milestones to different workers  
✅ **IPFS Deliverables** - Permanent storage of work products

---

## 📊 Fee Structure

| Use Case                   | Fee                  | When Collected       |
| -------------------------- | -------------------- | -------------------- |
| **NFT** (with profit)      | 0.5% of profit       | On sale distribution |
| **NFT** (no profit)        | 0.005% of sale price | On sale distribution |
| **OTC Trading**            | 5% platform fee      | On settlement        |
| **Freelance** (deployment) | 0.5% of total budget | At project creation  |
| **Freelance** (milestones) | 2.5% per milestone   | When client approves |

**Example Calculations:**

**NFT Escrow:**

```
Mint cost: 1 ETH
Sale price: 3 ETH
Profit: 2 ETH
Platform fee: 2 ETH × 0.5% = 0.01 ETH
Capital holder: 1 ETH + (2 ETH × 70%) = 2.4 ETH
WL holder: (2 ETH × 30%) - 0.01 ETH = 0.59 ETH
```

**Freelance Project:**

```
Total budget: 10,000 USDC
Deployment fee: 10,000 × 0.5% = 50 USDC
Per milestone (2,000 USDC): 2,000 × 2.5% = 50 USDC
Total fees: 50 + (50 × 5 milestones) = 300 USDC (3%)
```

---

## 📁 Project Structure

```
CoordiFi/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/     # Reusable React components
│   │   ├── hooks/          # Custom hooks (wagmi, etc.)
│   │   ├── lib/            # Third-party integrations
│   │   ├── pages/          # Application routes
│   │   ├── styles/         # Global styles
│   │   ├── utils/          # Helper functions
│   │   ├── App.tsx         # Main app component
│   │   └── main.tsx        # Entry point
│   ├── .env.example
|   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── contracts/
│   ├── interfaces/         # Solidity interfaces
│   │   ├── IFreelanceEscrow.sol
│   │   ├── ISmartMintWallet.sol
│   │   ├── ISupreme.sol
│   │   └── IUniswapV3Pool.sol
│   ├── scripts/            # Deployment scripts
│   │   ├── Deploy.s.sol
│   │   └── DeployUpdatedFactory.s.sol
│   ├── src/
│   │   ├── mocks/          # Mock contracts for testing
│   │   ├── templates/      # Base escrow contracts
│   │   │   ├── NFTEscrow.sol
│   │   │   ├── OTCEscrow.sol
│   │   │   └── FreelanceEscrow.sol
│   │   ├── SmartMintWallet.sol
│   │   └── SupremeFactory.sol
│   ├── .env.example
│   └── foundry.toml        # Foundry configuration
│
└── README.md
```

---

## 🐛 Known Issues

- Yellow Network testnet occasionally experiences downtime
- Supabase free tier has rate limits (500 requests/day)
- ENS resolution slow for uncommon names
- Gas estimation can be inaccurate for complex escrows

---

## 🌟 Why HackMoney Coordination Protocol Matters

**For the NFT Ecosystem:**  
Democratizes access to high-value mints by enabling trustless capital partnerships

**For DeFi Users:**  
Provides safer OTC trading with price validation and atomic settlement

**For Freelancers:**  
Offers transparent, low-fee work coordination with built-in dispute resolution

**For the Industry:**  
Demonstrates how Layer 2 solutions can dramatically reduce costs while maintaining security

Together, we're building the infrastructure for trustless coordination in Web3. 🚀

---

## 🙏 Acknowledgments

Special thanks to the sponsors and technologies that made this project possible:

- **Yellow Network** - For gasless L2 coordination infrastructure
- **Pinata** - For reliable IPFS storage and global gateway
- **Supabase** - For scalable off-chain database
- **Uniswap** - For decentralized price oracle
- **OpenZeppelin** - For secure smart contract libraries
- **Foundry** - For powerful development tooling
- **Ethereum Foundation** - For the Sepolia testnet

Built with ❤️ by Team **[The Arths]**:

- **[Arshdeep Singh](https://github.com/ArshLabs)**
- **[Parth Singh](https://github.com/ParthSinghPS)**
