/**
 * Yellow Network SDK Integration - REAL IMPLEMENTATION
 * 
 * This module provides the ACTUAL integration with Yellow Network using
 * the official @erc7824/nitrolite SDK.
 * 
 * NO FAKE/MOCK DATA - Everything is real.
 * 
 * @see https://docs.yellow.org/docs/build/quick-start
 * @see https://www.npmjs.com/package/@erc7824/nitrolite
 */

import {
    createAppSessionMessage,
    parseAnyRPCResponse,
    createCreateChannelMessage,
    createResizeChannelMessage,
    createCloseChannelMessage,
    createGetLedgerBalancesMessage,
    type MessageSigner,
    RPCProtocolVersion,
} from '@erc7824/nitrolite';

// Re-export SDK functions and types for use throughout the app
export {
    createAppSessionMessage,
    parseAnyRPCResponse,
    createCreateChannelMessage,
    createResizeChannelMessage,
    createCloseChannelMessage,
    createGetLedgerBalancesMessage,
};
export type { MessageSigner };

/**
 * App definition for Yellow state channels
 */
export interface YellowAppDefinition {
    protocol: string;
    participants: string[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce: number;
}

/**
 * Allocation for participants in a session
 */
export interface YellowAllocation {
    participant: string;
    asset: string;
    amount: string;
}

/**
 * Session parameters for createAppSessionMessage
 */
export interface AppSessionParams {
    definition: YellowAppDefinition;
    allocations: YellowAllocation[];
}

/**
 * Parsed RPC response from ClearNode
 */
export interface ParsedRPCResponse {
    type: string;
    requestId?: number;
    method?: string;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
    sessionId?: string;
    data?: unknown;
}

// ============ Configuration ============

export const YELLOW_SDK_CONFIG = {
    // WebSocket endpoints
    WS_SANDBOX: 'wss://clearnet-sandbox.yellow.com/ws',
    WS_PRODUCTION: 'wss://clearnet.yellow.com/ws',

    // Use sandbox for hackathon
    WS_URL: 'wss://clearnet-sandbox.yellow.com/ws',

    // Smart contract addresses on Sepolia
    CUSTODY_ADDRESS: '0x019B65A265EB3363822f2752141b3dF16131b262' as `0x${string}`,
    ADJUDICATOR_ADDRESS: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2' as `0x${string}`,

    // Test token (ytest.usd on Sepolia) - from Yellow assets API
    // CORRECT address from Yellow response: 0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb
    TEST_TOKEN: '0xDB9F293e3898c9E5536A3be1b0C56c89d2b32DEb' as `0x${string}`,

    // Chain ID
    CHAIN_ID: 11155111, // Sepolia

    // Faucet for test tokens
    FAUCET_URL: 'https://clearnet-sandbox.yellow.com/faucet/requestTokens',

    // Protocol version
    PROTOCOL: 'freelance-escrow-v1',
} as const;

// ============ Quorum Configuration for Freelance ============

/**
 * Freelance escrow quorum configuration
 * 2-party system: Client + Worker with equal weights
 * Either party can update state for gasless operations
 */
export const FREELANCE_QUORUM = {
    weights: [50, 50] as const,
    quorum: 50, // Either party can update state
    challenge: 3600, // 1 hour challenge period
} as const;

// ============ Faucet API ============

/**
 * Request ytest.usd tokens from Yellow Network sandbox faucet
 * These tokens go directly to the user's Unified Balance (off-chain)
 * 
 * @param userAddress - The wallet address to receive tokens
 * @returns Promise with success status and message
 */
export async function requestYellowFaucetTokens(userAddress: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
}> {
    console.log('[YellowSDK] 🚰 Requesting tokens from Yellow Faucet...');
    console.log('[YellowSDK] 📍 User address:', userAddress);

    try {
        const response = await fetch(YELLOW_SDK_CONFIG.FAUCET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userAddress: userAddress,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[YellowSDK] ❌ Faucet request failed:', response.status, errorText);
            return {
                success: false,
                message: `Faucet request failed: ${response.status}`,
                error: errorText,
            };
        }

        const data = await response.json();
        console.log('[YellowSDK] ✅ Faucet response:', data);

        return {
            success: true,
            message: 'ytest.usd tokens added to Unified Balance',
        };
    } catch (error) {
        console.error('[YellowSDK] ❌ Faucet request error:', error);
        return {
            success: false,
            message: 'Failed to request faucet tokens',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// ============ Payment Channel Functions ============
// These functions create REAL payment channels that appear on Yellowscan
// Payment channels are the on-chain foundation for app sessions

/**
 * Create a payment channel creation message
 * This creates an on-chain channel that will be visible on Yellowscan
 * 
 * @param sessionSigner - The message signer (from session key)
 * @returns Promise with the RPC message to send via WebSocket
 */
export async function createPaymentChannelMessage(
    sessionSigner: MessageSigner
): Promise<string> {
    console.log('[YellowSDK] 🔗 Creating payment channel message...');
    console.log('[YellowSDK] 📍 Chain ID:', YELLOW_SDK_CONFIG.CHAIN_ID);
    console.log('[YellowSDK] 💰 Token:', YELLOW_SDK_CONFIG.TEST_TOKEN);

    const message = await createCreateChannelMessage(
        sessionSigner,
        {
            chain_id: YELLOW_SDK_CONFIG.CHAIN_ID,
            token: YELLOW_SDK_CONFIG.TEST_TOKEN,
        }
    );

    console.log('[YellowSDK] ✅ Channel creation message ready');
    return message;
}

/**
 * Create a channel funding (resize) message
 * Uses allocate_amount to move funds from Unified Balance into the channel
 * 
 * @param sessionSigner - The message signer
 * @param channelId - The channel ID to fund
 * @param amount - Amount to allocate (in ytest.usd base units)
 * @param userAddress - The funds destination address
 * @returns Promise with the RPC message to send via WebSocket
 */
export async function createFundChannelMessage(
    sessionSigner: MessageSigner,
    channelId: `0x${string}`,
    amount: bigint,
    userAddress: `0x${string}`
): Promise<string> {
    console.log('[YellowSDK] 💵 Creating channel fund message...');
    console.log('[YellowSDK] 📍 Channel ID:', channelId);
    console.log('[YellowSDK] 💰 Amount:', amount.toString());
    console.log('[YellowSDK] 👤 Destination:', userAddress);

    // Validate channel ID format
    if (!channelId.startsWith('0x')) {
        throw new Error('Invalid channel ID format - must start with 0x');
    }

    const message = await createResizeChannelMessage(
        sessionSigner,
        {
            channel_id: channelId,
            allocate_amount: amount,
            funds_destination: userAddress,
        }
    );

    console.log('[YellowSDK] ✅ Channel fund message ready');
    return message;
}

/**
 * Create a channel close message
 * Closes the channel and releases funds back to Unified Balance
 * 
 * @param sessionSigner - The message signer
 * @param channelId - The channel ID to close
 * @param userAddress - The funds destination address
 * @returns Promise with the RPC message to send via WebSocket
 */
export async function createChannelCloseMessage(
    sessionSigner: MessageSigner,
    channelId: `0x${string}`,
    userAddress: `0x${string}`
): Promise<string> {
    console.log('[YellowSDK] 🔒 Creating channel close message...');
    console.log('[YellowSDK] 📍 Channel ID:', channelId);

    // Validate channel ID format
    if (!channelId.startsWith('0x')) {
        throw new Error('Invalid channel ID format - must start with 0x');
    }

    const message = await createCloseChannelMessage(
        sessionSigner,
        channelId as `0x${string}`,
        userAddress
    );

    console.log('[YellowSDK] ✅ Channel close message ready');
    return message;
}

/**
 * Create a get ledger balances message
 * Queries the user's Unified Balance from the ClearNode
 * 
 * @param sessionSigner - The message signer
 * @param userAddress - The address to query balances for
 * @returns Promise with the RPC message to send via WebSocket
 */
export async function createGetBalancesMessage(
    sessionSigner: MessageSigner,
    userAddress: string
): Promise<string> {
    console.log('[YellowSDK] 📊 Creating get balances message...');

    const message = await createGetLedgerBalancesMessage(
        sessionSigner,
        userAddress,
        Date.now()
    );

    console.log('[YellowSDK] ✅ Get balances message ready');
    return message;
}

// ============ Helper Functions ============

/**
 * Create app definition for freelance project
 * Uses 2-party system: Client + Worker (no platform participant)
 */
export function createFreelanceAppDefinition(
    clientAddress: string,
    workerAddress: string,
    _platformAddress: string = '' // Deprecated - kept for API compatibility
): YellowAppDefinition {
    // 2-party system: only Client and Worker (no Platform)
    return {
        protocol: YELLOW_SDK_CONFIG.PROTOCOL,
        participants: [clientAddress, workerAddress],
        weights: [...FREELANCE_QUORUM.weights],
        quorum: FREELANCE_QUORUM.quorum,
        challenge: FREELANCE_QUORUM.challenge,
        nonce: Date.now(),
    };
}

/**
 * Create allocations for freelance project
 * 
 * REAL ALLOCATIONS: Client starts with full amount, Worker starts with 0
 * As milestones are approved, allocations shift from Client → Worker
 * 
 * Uses ytest.usd as the asset for Yellow sandbox (off-chain tracking).
 * The actual ETH is held in FreelanceEscrow on-chain.
 * 
 * Amount mapping: 0.001 ETH = 1 ytest.usd
 * 2-party system: Client + Worker allocations
 */
export function createFreelanceAllocations(
    clientAddress: string,
    workerAddress: string,
    _platformAddress: string = '', // Deprecated - kept for API compatibility
    totalAmount: bigint = 0n
): YellowAllocation[] {
    // Convert ETH wei to ytest.usd (0.001 ETH = 1 ytest.usd)
    // totalAmount is in wei, so: ytest.usd = wei / 10^15
    // For example: 2000000000000000 wei (0.002 ETH) = 2 ytest.usd
    const ytestUsdAmount = totalAmount / 1000000000000000n; // 10^15

    console.log('[YellowSDK] 💰 Creating REAL allocations:', {
        client: clientAddress,
        worker: workerAddress,
        totalAmountWei: totalAmount.toString(),
        ytestUsdAmount: ytestUsdAmount.toString(),
    });

    return [
        {
            participant: clientAddress,
            asset: 'ytest.usd',  // Changed from 'eth' to 'ytest.usd' for sandbox
            amount: ytestUsdAmount.toString()
        },
        {
            participant: workerAddress,
            asset: 'ytest.usd',  // Changed from 'eth' to 'ytest.usd' for sandbox
            amount: '0'
        },
    ];
}

/**
 * Create a REAL app session message using the SDK
 * This is the key function that proves real integration
 * 
 * NOTE: This function is kept for compatibility but the actual session creation
 * in useYellowSession.ts now uses createAppSessionMessage directly with proper types.
 */
export async function createRealAppSession(
    messageSigner: MessageSigner,
    appDefinition: YellowAppDefinition,
    allocations: YellowAllocation[]
): Promise<string> {
    console.log('[YellowSDK] 🚀 Creating REAL app session via SDK');
    console.log('[YellowSDK] 📋 App Definition:', JSON.stringify(appDefinition, null, 2));
    console.log('[YellowSDK] 💰 Allocations:', JSON.stringify(allocations, null, 2));

    // Convert our types to SDK types
    // SDK expects: application (string), protocol (RPCProtocolVersion enum)
    const params = {
        definition: {
            application: appDefinition.protocol, // Our "protocol" field is the application name
            protocol: RPCProtocolVersion.NitroRPC_0_2, // Use the standard protocol version
            participants: appDefinition.participants as `0x${string}`[],
            weights: appDefinition.weights,
            quorum: appDefinition.quorum,
            challenge: appDefinition.challenge,
            nonce: appDefinition.nonce,
        },
        allocations: allocations.map(a => ({
            participant: a.participant as `0x${string}`,
            asset: a.asset,
            amount: a.amount,
        })),
    };

    // Use the REAL SDK function
    const sessionMessage = await createAppSessionMessage(messageSigner, params);

    console.log('[YellowSDK] ✅ Session message created via SDK');
    console.log('[YellowSDK] 📤 Message (first 200 chars):', sessionMessage.substring(0, 200));

    return sessionMessage;
}

/**
 * Parse a response from ClearNode using the SDK
 */
export function parseYellowResponse(data: string): ParsedRPCResponse {
    console.log('[YellowSDK] 📨 Parsing response from ClearNode');

    // Use the REAL SDK function
    const parsed = parseAnyRPCResponse(data);

    console.log('[YellowSDK] ✅ Parsed response:', JSON.stringify(parsed, null, 2));

    // Convert to our ParsedRPCResponse format
    return parsed as unknown as ParsedRPCResponse;
}

/**
 * Request test tokens from Yellow faucet
 */
export async function requestFaucetTokens(userAddress: string): Promise<boolean> {
    console.log('[YellowSDK] 🚰 Requesting faucet tokens for:', userAddress);

    try {
        const response = await fetch(YELLOW_SDK_CONFIG.FAUCET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userAddress }),
        });

        if (response.ok) {
            const result = await response.json();
            console.log('[YellowSDK] ✅ Faucet response:', result);
            return true;
        } else {
            console.error('[YellowSDK] ❌ Faucet request failed:', response.status);
            return false;
        }
    } catch (error) {
        console.error('[YellowSDK] ❌ Faucet error:', error);
        return false;
    }
}

/**
 * Create NitroRPC formatted message
 * Format: {req: [requestId, method, params, timestamp], sig: [signatures]}
 * 
 * IMPORTANT: Per Yellow ClearNode API, params should be the direct parameter object,
 * NOT wrapped in an array. For methods like auth_request, the params is a single object.
 * Example: auth_request -> params = {address: "0x...", session_key: "0x...", ...}
 *          ping -> params = {}
 *          create_app_session -> params = {definition: {...}, allocations: [...]}
 */
export function createNitroRPCMessage(
    method: string,
    params: unknown,  // Changed from unknown[] to unknown to accept objects directly
    requestId?: number,
    signatures: string[] = []
): string {
    const id = requestId ?? Math.floor(Math.random() * 1000000);
    const timestamp = Math.floor(Date.now() / 1000);

    // If params is an array with single element, unwrap it for Yellow compatibility
    // Yellow API expects params to be the object directly, not wrapped in array
    let finalParams = params;
    if (Array.isArray(params) && params.length === 1) {
        finalParams = params[0];
    }

    const message = {
        req: [id, method, finalParams, timestamp],
        sig: signatures,
    };

    console.log('[YellowSDK] 📤 NitroRPC message:', JSON.stringify(message, null, 2));

    return JSON.stringify(message);
}

/**
 * Parse NitroRPC response
 * Format: {res: [requestId, method, result, timestamp], sig: [signatures]}
 */
export function parseNitroRPCResponse(data: string): {
    requestId: number;
    method: string;
    result: unknown;
    timestamp: number;
    signatures: string[];
    error?: { code: number; message: string };
} {
    const parsed = JSON.parse(data);

    // Handle error response
    if (parsed.err) {
        const [errorId, errorCode, errorMessage] = parsed.err;
        return {
            requestId: errorId,
            method: 'error',
            result: null,
            timestamp: 0,
            signatures: [],
            error: { code: errorCode, message: errorMessage },
        };
    }

    // Handle success response
    if (parsed.res) {
        const [requestId, method, result, timestamp] = parsed.res;
        return {
            requestId,
            method,
            result,
            timestamp,
            signatures: parsed.sig || [],
        };
    }

    // Fallback
    return {
        requestId: 0,
        method: 'unknown',
        result: parsed,
        timestamp: Date.now(),
        signatures: [],
    };
}

// ============ WebSocket Manager ============

/**
 * WebSocket connection state
 */
export type WSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error';

/**
 * Create and manage WebSocket connection to ClearNode
 */
export class YellowWebSocket {
    private ws: WebSocket | null = null;
    private messageHandlers: Map<number, (response: unknown) => void> = new Map();
    private nextRequestId = 1;
    private onStateChange?: (state: WSConnectionState) => void;
    private onMessage?: (message: unknown) => void;

    constructor(
        onStateChange?: (state: WSConnectionState) => void,
        onMessage?: (message: unknown) => void
    ) {
        this.onStateChange = onStateChange;
        this.onMessage = onMessage;
    }

    /**
     * Connect to Yellow ClearNode
     */
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log('[YellowWebSocket] 🔌 Connecting to:', YELLOW_SDK_CONFIG.WS_URL);
            this.onStateChange?.('connecting');

            this.ws = new WebSocket(YELLOW_SDK_CONFIG.WS_URL);

            this.ws.onopen = () => {
                console.log('[YellowWebSocket] ✅ Connected to ClearNode');
                this.onStateChange?.('connected');
                resolve();
            };

            this.ws.onmessage = (event) => {
                console.log('[YellowWebSocket] 📨 Received:', event.data);

                try {
                    const parsed = parseNitroRPCResponse(event.data);

                    // Check for pending callback
                    if (this.messageHandlers.has(parsed.requestId)) {
                        const handler = this.messageHandlers.get(parsed.requestId);
                        this.messageHandlers.delete(parsed.requestId);
                        handler?.(parsed);
                    }

                    // Notify general listener
                    this.onMessage?.(parsed);
                } catch (err) {
                    console.error('[YellowWebSocket] ❌ Parse error:', err);
                }
            };

            this.ws.onerror = (error) => {
                console.error('[YellowWebSocket] ❌ Error:', error);
                this.onStateChange?.('error');
                reject(error);
            };

            this.ws.onclose = () => {
                console.log('[YellowWebSocket] 🔌 Disconnected');
                this.onStateChange?.('disconnected');
                this.ws = null;
            };
        });
    }

    /**
     * Send message and wait for response
     */
    async sendAndWait<T>(method: string, params: unknown[], timeoutMs = 30000): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            const requestId = this.nextRequestId++;
            const message = createNitroRPCMessage(method, params, requestId);

            // Set up timeout
            const timeout = setTimeout(() => {
                this.messageHandlers.delete(requestId);
                reject(new Error(`Request timeout for ${method}`));
            }, timeoutMs);

            // Set up response handler
            this.messageHandlers.set(requestId, (response: any) => {
                clearTimeout(timeout);
                if (response.error) {
                    reject(new Error(response.error.message));
                } else {
                    resolve(response.result as T);
                }
            });

            // Send message
            console.log('[YellowWebSocket] 📤 Sending:', message);
            this.ws.send(message);
        });
    }

    /**
     * Send raw message (for SDK-generated messages)
     */
    send(message: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        console.log('[YellowWebSocket] 📤 Sending raw:', message.substring(0, 200));
        this.ws.send(message);
    }

    /**
     * Disconnect from ClearNode
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get next request ID
     */
    getNextRequestId(): number {
        return this.nextRequestId++;
    }
}

export default {
    createAppSessionMessage,
    parseAnyRPCResponse,
    createRealAppSession,
    parseYellowResponse,
    requestFaucetTokens,
    createNitroRPCMessage,
    parseNitroRPCResponse,
    createFreelanceAppDefinition,
    createFreelanceAllocations,
    YellowWebSocket,
    YELLOW_SDK_CONFIG,
    FREELANCE_QUORUM,
};
