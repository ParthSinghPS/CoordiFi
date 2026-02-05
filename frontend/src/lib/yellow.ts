/**
 * Yellow Network Configuration & Types
 * 
 * REAL INTEGRATION - NO FAKE/MOCK DATA
 * 
 * Uses official @erc7824/nitrolite SDK for:
 * - Creating app sessions (project creation)
 * - State updates (milestone approvals, revisions, disputes)
 * - Final settlement (only on-chain TX)
 * 
 * @see https://docs.yellow.org/docs/build/quick-start
 */

// Re-export SDK functions from our SDK module
export {
    createAppSessionMessage,
    parseAnyRPCResponse,
    createRealAppSession,
    parseYellowResponse,
    requestFaucetTokens,
    createNitroRPCMessage,
    parseNitroRPCResponse,
    YellowWebSocket,
    YELLOW_SDK_CONFIG,
    FREELANCE_QUORUM,
} from './yellowSDK';

// Yellow Network Configuration - REAL MODE ONLY
export const YELLOW_CONFIG = {
    // WebSocket endpoint (Sandbox for testing)
    WS_URL: import.meta.env.VITE_YELLOW_WS_URL || 'wss://clearnet-sandbox.yellow.com/ws',

    // Application name - MUST match between auth and session creation
    APP_NAME: 'coordination-protocol',

    // Contract addresses on Sepolia (REAL Yellow Network contracts)
    CUSTODY_ADDRESS: import.meta.env.VITE_YELLOW_CUSTODY_ADDRESS || '0x019B65A265EB3363822f2752141b3dF16131b262',
    ADJUDICATOR_ADDRESS: import.meta.env.VITE_YELLOW_ADJUDICATOR_ADDRESS || '0x7c7ccbc98469190849BCC6c926307794fDfB11F2',

    // Platform address (for quorum)
    PLATFORM_ADDRESS: '0x0000000000000000000000000000000000000001' as `0x${string}`,

    // Test token address (ytest.usd on Sepolia)
    TEST_TOKEN: import.meta.env.VITE_YELLOW_TEST_TOKEN || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',

    // Faucet endpoint for test tokens
    FAUCET_URL: 'https://clearnet-sandbox.yellow.com/faucet/requestTokens',

    // Chain configuration
    CHAIN_ID: 11155111, // Sepolia

    // Session defaults
    DEFAULT_CHALLENGE_DURATION: 3600, // 1 hour in seconds
    SESSION_EXPIRY_HOURS: 24,

    // Protocol version for our app
    PROTOCOL_VERSION: 'freelance-escrow-v1',

    // ⚠️ DEMO_MODE REMOVED - Always use REAL Yellow Network
    // All operations now go through actual SDK and WebSocket
} as const;

// Quorum configuration for freelance escrow
// For demo: 2-party system where either participant can update state
// This allows gasless operations to work without needing both signatures
// In production, you'd use a multi-sig approach with proper dispute resolution
export const FREELANCE_QUORUM_CONFIG = {
    weights: [50, 50] as readonly number[], // [Client, Worker]
    quorum: 50, // Either party can update state unilaterally for gasless ops
} as const;

// Milestone status mapping for Yellow session_data
export const YELLOW_MILESTONE_STATUS = {
    PENDING: 'pending',
    SUBMITTED: 'submitted',
    UNDER_REVISION: 'underRevision',
    APPROVED: 'approved',
    PAID: 'paid',
    DISPUTED: 'disputed',
    CANCELLED: 'cancelled',
} as const;

// Dispute types for Yellow session_data
export const YELLOW_DISPUTE_TYPE = {
    NONE: 'none',
    QUALITY_ISSUE: 'qualityIssue',
    MISSED_DEADLINE: 'missedDeadline',
    SCOPE_CHANGE: 'scopeChange',
    NON_PAYMENT: 'nonPayment',
    ABANDONMENT: 'abandonment',
} as const;

// Project phase for Yellow session_data
export const YELLOW_PROJECT_PHASE = {
    CREATED: 'created',
    FUNDED: 'funded',
    IN_PROGRESS: 'inProgress',
    COMPLETED: 'completed',
    DISPUTED: 'disputed',
    REFUNDED: 'refunded',
} as const;

// Type definitions for Yellow session data
export interface YellowMilestone {
    id: number;
    amount: string;
    status: 'pending' | 'submitted' | 'revision_requested' | 'approved' | 'paid' | 'disputed' | 'cancelled';
    workHash: string | null;
    submittedAt: number | null;
    deadline: number;
    approvals: {
        client: boolean;
        worker: boolean;
        platform: boolean;
    };
    revisionCount: number;
    description?: string;
    feedback?: string;
}

export interface YellowDispute {
    id: number;
    milestoneId: number;
    disputeType: number;
    raisedBy: string;
    reason: string;
    status: 'pending' | 'resolved';
    createdAt: number;
    resolution: string | null;
}

export interface YellowSessionData {
    projectAddress: string;
    client: string;
    worker: string;
    phase: 'created' | 'funded' | 'active' | 'disputed' | 'completed';
    milestones: YellowMilestone[];
    disputes: YellowDispute[];
    createdAt: number;
    lastUpdated: number;
}

export interface YellowAllocation {
    participant: string;
    asset: string;
    amount: string;
}

export interface YellowAppDefinition {
    protocol: string;
    participants: string[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce: number;
}

// Helper to create app definition for freelance project
export function createFreelanceAppDefinition(
    _adjudicatorAddress: `0x${string}`,
    _chainId: number
): YellowAppDefinition {
    return {
        protocol: YELLOW_CONFIG.PROTOCOL_VERSION,
        participants: [], // Filled in later
        weights: [...FREELANCE_QUORUM_CONFIG.weights],
        quorum: FREELANCE_QUORUM_CONFIG.quorum,
        challenge: YELLOW_CONFIG.DEFAULT_CHALLENGE_DURATION,
        nonce: Date.now(),
    };
}

// Helper to create initial allocations for freelance project
// REAL ALLOCATIONS: Client starts with full amount, Worker starts with 0
// As milestones are approved, allocations shift from Client → Worker
// Uses ytest.usd for Yellow sandbox (off-chain tracking).
// Actual ETH is held in FreelanceEscrow on-chain.
// Amount mapping: 0.001 ETH = 1 ytest.usd
export function createFreelanceAllocations(
    clientAddress: string,
    workerAddress: string,
    totalAmount: bigint
): YellowAllocation[] {
    // Convert ETH wei to ytest.usd (0.001 ETH = 1 ytest.usd)
    // totalAmount is in wei, so: ytest.usd = wei / 10^15
    // For example: 2000000000000000 wei (0.002 ETH) = 2 ytest.usd
    // ytest.usd has 6 decimals, so multiply by 10^6
    const ytestUsdAmount = (totalAmount / 1000000000000000n) * 1000000n; // 10^15 * 10^6 = proper units

    console.log('[Yellow] 💰 Creating REAL allocations:', {
        client: clientAddress,
        worker: workerAddress,
        totalAmountWei: totalAmount.toString(),
        ytestUsdAmount: ytestUsdAmount.toString(),
    });
    return [
        { participant: clientAddress, asset: 'ytest.usd', amount: ytestUsdAmount.toString() },
        { participant: workerAddress, asset: 'ytest.usd', amount: '0' },
    ];
}

// Helper to create initial session data for freelance project
export function createFreelanceSessionData(
    projectAddress: string,
    clientAddress: string,
    workerAddress: string,
    milestones: YellowMilestone[]
): YellowSessionData {
    return {
        projectAddress,
        client: clientAddress,
        worker: workerAddress,
        phase: 'created',
        milestones,
        disputes: [],
        createdAt: Date.now(),
        lastUpdated: Date.now(),
    };
}

// Calculate platform fee (2.5%)
export function calculatePlatformFee(amount: string): string {
    const amountNum = parseFloat(amount);
    const fee = amountNum * 0.025;
    return fee.toFixed(6);
}

// Calculate worker payment after fee
export function calculateWorkerPayment(amount: string): string {
    const amountNum = parseFloat(amount);
    const fee = amountNum * 0.025;
    return (amountNum - fee).toFixed(6);
}

// WebSocket connection state
export type YellowConnectionState = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error';

// Message types for WebSocket
export interface YellowRPCMessage {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params: unknown[];
}

export interface YellowRPCResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

// Fast-forward step for UI animation
export interface FastForwardStep {
    icon: string;
    label: string;
    status: 'pending' | 'loading' | 'done' | 'error';
    time?: string;
    details?: string[];
}

// Fast-forward action types
export type FastForwardAction =
    | 'createProject'
    | 'approveMilestone'
    | 'requestRevision'
    | 'submitWork'
    | 'raiseDispute'
    | 'resolveDispute'
    | 'cancelDispute'
    | 'settleProject';

console.log('[Yellow] Configuration loaded:', {
    wsUrl: YELLOW_CONFIG.WS_URL,
    chainId: YELLOW_CONFIG.CHAIN_ID,
    protocol: YELLOW_CONFIG.PROTOCOL_VERSION,
});
