/**
 * useYellowAuth - Hook for Yellow Network Authentication
 * 
 * REAL IMPLEMENTATION using @erc7824/nitrolite SDK
 * 
 * Authentication Flow (per Yellow ClearNode API):
 * 1. Connect WebSocket to ClearNode
 * 2. Send auth_request with session key params
 * 3. Receive auth_challenge with challenge_message UUID
 * 4. Sign challenge with EIP-712 signature
 * 5. Send auth_verify with signature in sig[] field
 * 6. Receive auth_verify response with success + JWT token
 * 
 * @see https://github.com/erc7824/nitrolite/blob/main/clearnode/docs/API.md
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
    createAuthRequestMessage,
    createAuthVerifyMessage,
    createAuthVerifyMessageWithJWT,
    createEIP712AuthMessageSigner,
    parseAnyRPCResponse,
    RPCMethod,
} from '@erc7824/nitrolite';
import type { AuthChallengeResponse, AuthRequestParams } from '@erc7824/nitrolite';
import { YELLOW_CONFIG, YellowConnectionState } from '../lib/yellow';

// Storage keys
const JWT_STORAGE_KEY = 'yellow_jwt_token';
const SESSION_PRIVATE_KEY_STORAGE = 'yellow_session_private_key';

// Helper: Extract wallet address from JWT payload
function getWalletFromJWT(jwt: string): string | null {
    try {
        // JWT format: header.payload.signature
        const parts = jwt.split('.');
        if (parts.length !== 3) return null;

        // Decode base64 payload (URL-safe base64)
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

        // The wallet is in policy.wallet
        return payload?.policy?.wallet?.toLowerCase() || null;
    } catch (e) {
        console.error('[YellowAuth] Failed to parse JWT:', e);
        return null;
    }
}

// Generate or retrieve a session key pair (private key + address)
// The private key is used to sign RPC messages (like create_app_session)
// The address is registered with ClearNode during auth
function getOrCreateSessionKeyPair(walletAddress: string): { privateKey: `0x${string}`, address: `0x${string}` } {
    // Try to get existing session key for this wallet
    const storageKey = `${SESSION_PRIVATE_KEY_STORAGE}_${walletAddress.toLowerCase()}`;
    const stored = localStorage.getItem(storageKey);

    if (stored) {
        try {
            const { privateKey, timestamp } = JSON.parse(stored);
            // Check if key is still valid (less than 1 hour old)
            const ageMs = Date.now() - timestamp;
            if (ageMs < 3600000) { // 1 hour
                const account = privateKeyToAccount(privateKey as `0x${string}`);
                console.log('[YellowAuth] 🔑 Using existing session key:', account.address);
                return { privateKey: privateKey as `0x${string}`, address: account.address };
            }
        } catch (e) {
            console.log('[YellowAuth] Failed to parse stored session key, generating new one');
        }
    }

    // Generate new session key pair
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);

    // Store for reuse within the hour
    localStorage.setItem(storageKey, JSON.stringify({
        privateKey,
        timestamp: Date.now(),
    }));

    console.log('[YellowAuth] 🔑 Generated NEW session key:', account.address);
    return { privateKey, address: account.address };
}

// Re-export for convenience
export type { YellowConnectionState };

interface AuthState {
    isAuthenticated: boolean;
    authenticatedAddress: string | null; // Track WHICH wallet is authenticated
    sessionKey: string | null;
    sessionPrivateKey: `0x${string}` | null; // Private key for signing RPC messages
    jwtToken: string | null;
    expiresAt: number | null;
    error: string | null;
}

// Return type for authenticate - includes sessionPrivateKey for direct passing
interface AuthenticateResult {
    success: boolean;
    sessionPrivateKey?: `0x${string}`;
}

interface UseYellowAuthReturn {
    // State
    connectionState: YellowConnectionState;
    authState: AuthState;
    isConnecting: boolean;
    isAuthenticating: boolean;

    // Actions
    connect: () => Promise<void>;
    disconnect: () => void;
    authenticate: () => Promise<AuthenticateResult>;

    // WebSocket
    ws: WebSocket | null;
    sendMessage: (message: string) => void;
    sendSignedMessage: (signedMessage: string) => Promise<unknown>;
    sendRPC: (method: string, params: unknown[]) => Promise<unknown>;
}

export function useYellowAuth(): UseYellowAuthReturn {
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    // WebSocket reference
    const wsRef = useRef<WebSocket | null>(null);
    const pendingCallbacksRef = useRef<Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>>(new Map());

    // State
    const [connectionState, setConnectionState] = useState<YellowConnectionState>('disconnected');
    const [isConnecting, setIsConnecting] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [authState, setAuthState] = useState<AuthState>({
        isAuthenticated: false,
        authenticatedAddress: null,
        sessionKey: null,
        sessionPrivateKey: null,
        jwtToken: null,
        expiresAt: null,
        error: null,
    });

    // Keepalive interval ref
    const keepaliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Auth in progress ref to prevent race conditions
    const authInProgressRef = useRef<Promise<AuthenticateResult> | null>(null);

    // Connection promise for waiting
    const connectionPromiseRef = useRef<Promise<void> | null>(null);
    const connectionResolveRef = useRef<(() => void) | null>(null);

    // Connect to Yellow Network ClearNode
    const connect = useCallback(async (): Promise<void> => {
        // Already connected
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[YellowAuth] Already connected');
            return;
        }

        // Already connecting - wait for existing connection
        if (connectionPromiseRef.current) {
            console.log('[YellowAuth] ⏳ Connection already in progress, waiting...');
            await connectionPromiseRef.current;
            return;
        }

        setIsConnecting(true);
        setConnectionState('connecting');

        // Create a connection promise that others can wait on
        const connectionPromise = new Promise<void>((resolveConnection, rejectConnection) => {
            connectionResolveRef.current = resolveConnection;

            console.log('%c═══════════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold');
            console.log('%c🟡 YELLOW NETWORK - REAL CONNECTION', 'color: #FFD700; font-size: 16px; font-weight: bold');
            console.log('%c═══════════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold');
            console.log('%c📡 Endpoint: ' + YELLOW_CONFIG.WS_URL, 'color: #00FF00; font-weight: bold');
            console.log('%c═══════════════════════════════════════════════════════════════', 'color: #FFD700; font-weight: bold');

            try {
                const ws = new WebSocket(YELLOW_CONFIG.WS_URL);

                ws.onopen = () => {
                    console.log('%c✅ YELLOW NETWORK - CONNECTED!', 'color: #00FF00; font-size: 16px; font-weight: bold');

                    wsRef.current = ws;
                    setConnectionState('connected');
                    setIsConnecting(false);

                    // Start keepalive ping every 25 seconds
                    if (keepaliveIntervalRef.current) {
                        clearInterval(keepaliveIntervalRef.current);
                    }
                    keepaliveIntervalRef.current = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            const pingId = Math.floor(Math.random() * 1000000);
                            const pingMsg = JSON.stringify({ req: [pingId, "ping", {}, Math.floor(Date.now() / 1000)], sig: [] });
                            ws.send(pingMsg);
                            console.log('[YellowAuth] 💓 Keepalive ping sent');
                        }
                    }, 25000);

                    resolveConnection();
                    connectionResolveRef.current = null;
                };

                ws.onmessage = (event) => {
                    try {
                        const rawData = event.data;
                        console.log('%c📨 YELLOW RESPONSE:', 'color: #FFD700; font-weight: bold', rawData);

                        // Parse using SDK
                        let parsed: any;
                        try {
                            parsed = parseAnyRPCResponse(rawData);
                        } catch {
                            // Fallback to manual parsing
                            parsed = JSON.parse(rawData);
                            if (parsed.res) {
                                parsed = {
                                    requestId: parsed.res[0],
                                    method: parsed.res[1],
                                    params: parsed.res[2],
                                    timestamp: parsed.res[3],
                                    signatures: parsed.sig,
                                };
                            }
                        }
                        console.log('%c📦 Parsed Response:', 'color: #00FF00', parsed);

                        // Extract request ID and method
                        const requestId = parsed.requestId;
                        const method = parsed.method;

                        // Check for errors - errors have the requestId in them
                        if (method === RPCMethod.Error || method === 'error' || parsed.params?.error) {
                            const errorMsg = parsed.params?.error || 'Unknown error';
                            console.error('%c❌ YELLOW ERROR:', 'color: #FF0000; font-weight: bold', errorMsg, 'requestId:', requestId);

                            // If this error has a requestId, reject THAT specific callback
                            if (requestId && pendingCallbacksRef.current.has(requestId)) {
                                const callbacks = pendingCallbacksRef.current.get(requestId);
                                pendingCallbacksRef.current.delete(requestId);
                                callbacks?.reject(new Error(errorMsg));
                            } else {
                                // Error doesn't match any callback by ID - might be an auth error
                                // For auth flow errors, reject the first pending auth callback
                                for (const [id, callbacks] of pendingCallbacksRef.current.entries()) {
                                    if (id < 0) { // Our auth callbacks use negative IDs (-1, -2, -3)
                                        console.log('[YellowAuth] Routing error to auth callback:', id);
                                        pendingCallbacksRef.current.delete(id);
                                        callbacks.reject(new Error(errorMsg));
                                        return;
                                    }
                                }
                            }
                            return;
                        }

                        // Find pending callback by ID
                        if (requestId && pendingCallbacksRef.current.has(requestId)) {
                            const callbacks = pendingCallbacksRef.current.get(requestId);
                            pendingCallbacksRef.current.delete(requestId);
                            callbacks?.resolve(parsed);
                            return;
                        }

                        // Log unhandled messages (except broadcast messages with requestId=0)
                        if (requestId !== 0) {
                            console.log('[YellowAuth] Unhandled response (no matching callback):', method, requestId);
                        }

                    } catch (err) {
                        console.error('[YellowAuth] Failed to parse message:', err, event.data);
                    }
                };

                ws.onerror = (error) => {
                    console.error('[YellowAuth] ❌ WebSocket error:', error);
                    setConnectionState('error');
                    setIsConnecting(false);
                    connectionPromiseRef.current = null;
                    rejectConnection(new Error('WebSocket connection error'));
                };

                ws.onclose = () => {
                    console.log('[YellowAuth] WebSocket closed');
                    wsRef.current = null;
                    setConnectionState('disconnected');
                    setAuthState(prev => ({ ...prev, isAuthenticated: false }));
                    connectionPromiseRef.current = null;

                    if (keepaliveIntervalRef.current) {
                        clearInterval(keepaliveIntervalRef.current);
                        keepaliveIntervalRef.current = null;
                    }
                };

            } catch (error) {
                console.error('[YellowAuth] Failed to connect:', error);
                setConnectionState('error');
                setIsConnecting(false);
                connectionPromiseRef.current = null;
                rejectConnection(error as Error);
            }
        });

        connectionPromiseRef.current = connectionPromise;
        return connectionPromise;
    }, []);

    // Disconnect from Yellow Network
    const disconnect = useCallback(() => {
        if (keepaliveIntervalRef.current) {
            clearInterval(keepaliveIntervalRef.current);
            keepaliveIntervalRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        connectionPromiseRef.current = null;
        setConnectionState('disconnected');
        setAuthState({
            isAuthenticated: false,
            authenticatedAddress: null,
            sessionKey: null,
            sessionPrivateKey: null,
            jwtToken: null,
            expiresAt: null,
            error: null,
        });
    }, []);

    // Send raw message via WebSocket
    const sendMessage = useCallback((message: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.error('[YellowAuth] WebSocket not connected');
            return;
        }

        // Log full message when it contains a signature
        try {
            const parsed = JSON.parse(message);
            if (parsed.sig && parsed.sig.length > 0) {
                console.log('%c📤 SENDING SIGNED MESSAGE TO YELLOW:', 'color: #FFA500; font-weight: bold');
                console.log('  Method:', parsed.req?.[1]);
                console.log('  RequestId:', parsed.req?.[0]);
                console.log('  Has signature:', !!parsed.sig?.[0]);
                console.log('  Signature preview:', parsed.sig?.[0]?.substring(0, 40) + '...');
                console.log('  Full message:', message);
            } else {
                console.log('%c📤 SENDING TO YELLOW:', 'color: #FFA500; font-weight: bold', message.substring(0, 500));
            }
        } catch {
            console.log('%c📤 SENDING TO YELLOW:', 'color: #FFA500; font-weight: bold', message.substring(0, 500));
        }

        wsRef.current.send(message);
    }, []);

    // Send a pre-signed message and wait for response
    // Used for SDK-generated messages that already have signatures
    const sendSignedMessage = useCallback(async (signedMessage: string): Promise<unknown> => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            if (connectionPromiseRef.current) {
                await connectionPromiseRef.current;
            }
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }
        }

        return new Promise((resolve, reject) => {
            // Parse the signed message to extract requestId
            let requestId: number;
            try {
                const parsed = JSON.parse(signedMessage);
                requestId = parsed.req?.[0];
                if (requestId === undefined) {
                    throw new Error('No request ID in signed message');
                }
            } catch (e) {
                reject(new Error(`Invalid signed message format: ${e}`));
                return;
            }

            const timeout = setTimeout(() => {
                pendingCallbacksRef.current.delete(requestId);
                reject(new Error(`Request timeout for signed message (id: ${requestId})`));
            }, 30000);

            pendingCallbacksRef.current.set(requestId, {
                resolve: (response) => {
                    clearTimeout(timeout);
                    resolve(response);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            sendMessage(signedMessage);
        });
    }, [sendMessage]);

    // Send RPC and wait for response
    const sendRPC = useCallback(async (method: string, params: unknown[]): Promise<unknown> => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            // Wait for connection if connecting
            if (connectionPromiseRef.current) {
                await connectionPromiseRef.current;
            }
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }
        }

        return new Promise((resolve, reject) => {
            // CRITICAL: Yellow ClearNode expects millisecond timestamps for BOTH fields
            // - Request ID (1st element): Used for response matching AND freshness validation
            // - Timestamp (4th element): Also milliseconds, used for message validation
            // Using seconds for the 4th element causes "invalid message timestamp" error!
            const id = Date.now();
            const timestamp = Date.now(); // MUST be milliseconds, NOT seconds!

            // NitroRPC format: [requestId (ms), method, params, timestamp (ms)]
            const message = JSON.stringify({
                req: [id, method, params, timestamp],
                sig: []
            });

            const timeout = setTimeout(() => {
                pendingCallbacksRef.current.delete(id);
                reject(new Error(`Request timeout for ${method}`));
            }, 30000);

            pendingCallbacksRef.current.set(id, {
                resolve: (response) => {
                    clearTimeout(timeout);
                    resolve(response);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            sendMessage(message);
        });
    }, [sendMessage]);

    // Authenticate with Yellow Network using REAL SDK
    const authenticate = useCallback(async (): Promise<AuthenticateResult> => {
        // Prevent multiple simultaneous auth attempts
        if (authInProgressRef.current) {
            console.log('[YellowAuth] ⏳ Auth already in progress, waiting...');
            return authInProgressRef.current;
        }

        if (!address || !walletClient) {
            console.error('[YellowAuth] Wallet not connected');
            setAuthState(prev => ({ ...prev, error: 'Wallet not connected' }));
            return { success: false };
        }

        // Create the auth promise
        const authPromise = (async (): Promise<AuthenticateResult> => {
            // Ensure connected
            if (connectionState !== 'connected' && connectionState !== 'authenticated') {
                await connect();
            }

            setIsAuthenticating(true);
            setAuthState(prev => ({ ...prev, error: null }));

            try {
                // Check for existing JWT token
                const storedJWT = localStorage.getItem(JWT_STORAGE_KEY);
                if (storedJWT) {
                    // CRITICAL: Verify JWT is for the CURRENT wallet
                    const jwtWallet = getWalletFromJWT(storedJWT);
                    const currentWallet = address.toLowerCase();

                    if (jwtWallet !== currentWallet) {
                        console.log(`[YellowAuth] ⚠️ Stored JWT is for different wallet (${jwtWallet?.slice(0, 10)}...), clearing...`);
                        localStorage.removeItem(JWT_STORAGE_KEY);
                        // Fall through to full auth
                    } else {
                        console.log('[YellowAuth] 🔑 Found stored JWT for current wallet, attempting re-authentication...');

                        try {
                            // Create auth_verify message with JWT
                            const jwtAuthMessage = await createAuthVerifyMessageWithJWT(storedJWT);

                            // Extract actual requestId from the message
                            let jwtRequestId: number;
                            try {
                                const parsed = JSON.parse(jwtAuthMessage);
                                jwtRequestId = parsed.req?.[0];
                            } catch {
                                throw new Error('Failed to parse JWT auth message');
                            }

                            // Set up callback BEFORE sending with actual requestId
                            const responsePromise = new Promise<any>((resolve, reject) => {
                                const timeout = setTimeout(() => {
                                    pendingCallbacksRef.current.delete(jwtRequestId);
                                    reject(new Error('JWT auth timeout'));
                                }, 10000);
                                pendingCallbacksRef.current.set(jwtRequestId, {
                                    resolve: (r) => { clearTimeout(timeout); resolve(r); },
                                    reject: (e) => { clearTimeout(timeout); reject(e); }
                                });
                            });

                            // Send and wait for response
                            sendMessage(jwtAuthMessage);
                            const response = await responsePromise;

                            if (response.method === RPCMethod.AuthVerify && response.params?.success) {
                                console.log('[YellowAuth] ✅ Re-authenticated with stored JWT');
                                console.log('[YellowAuth] 👤 Authenticated wallet:', address);

                                // Try to retrieve the stored session key pair for this wallet
                                // This allows us to sign RPC messages even after JWT re-auth
                                const sessionKeyPair = getOrCreateSessionKeyPair(address);

                                setAuthState({
                                    isAuthenticated: true,
                                    authenticatedAddress: address, // Track which wallet is authenticated
                                    sessionKey: sessionKeyPair.address,
                                    sessionPrivateKey: sessionKeyPair.privateKey, // Use stored/new session key
                                    jwtToken: storedJWT,
                                    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
                                    error: null,
                                });
                                setConnectionState('authenticated');
                                setIsAuthenticating(false);
                                // Return both success AND sessionPrivateKey for direct passing
                                return { success: true, sessionPrivateKey: sessionKeyPair.privateKey };
                            }
                        } catch (e) {
                            console.log('[YellowAuth] JWT re-auth failed, doing full auth:', e);
                            localStorage.removeItem(JWT_STORAGE_KEY);
                        }
                    } // End else block for JWT wallet match
                }

                // Calculate expiry (1 hour from now as bigint)
                const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);

                // Generate or retrieve session key PAIR (private key + address)
                // The private key will be used to sign RPC messages (like create_app_session)
                // The address is registered with ClearNode during auth
                const sessionKeyPair = getOrCreateSessionKeyPair(address);
                console.log('[YellowAuth] 🔑 Session key address:', sessionKeyPair.address);

                // Step 1: Create auth_request message using SDK
                console.log('[YellowAuth] 📝 Step 1: Creating auth_request...');

                const authRequestParams: AuthRequestParams = {
                    address: address,
                    session_key: sessionKeyPair.address, // Use the session key ADDRESS
                    application: YELLOW_CONFIG.APP_NAME, // MUST match create_app_session
                    // Session key needs permission to spend the assets used in allocations
                    // Using ytest.usd for sandbox environment (matches session allocations)
                    allowances: [
                        { asset: 'ytest.usd', amount: '1000000000' }, // 1000 ytest.usd (6 decimals)
                    ],
                    expires_at: expiresAt,
                    scope: 'console',
                };

                const authRequestMessage = await createAuthRequestMessage(authRequestParams);
                console.log('[YellowAuth] 📤 Sending auth_request:', authRequestMessage);

                // Extract the actual requestId from the SDK-generated message
                let authRequestId: number;
                try {
                    const parsed = JSON.parse(authRequestMessage);
                    authRequestId = parsed.req?.[0];
                    console.log('[YellowAuth] 📌 Auth request ID:', authRequestId);
                } catch {
                    throw new Error('Failed to parse auth_request message');
                }

                // Set up callback BEFORE sending auth_request
                // Use the ACTUAL requestId from the message, not a hardcoded one
                const challengePromise = new Promise<AuthChallengeResponse>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        pendingCallbacksRef.current.delete(authRequestId);
                        reject(new Error('Auth challenge timeout'));
                    }, 15000);
                    pendingCallbacksRef.current.set(authRequestId, {
                        resolve: (r) => { clearTimeout(timeout); resolve(r as AuthChallengeResponse); },
                        reject: (e) => { clearTimeout(timeout); reject(e); }
                    });
                });

                // Send auth_request
                sendMessage(authRequestMessage);

                // Wait for auth_challenge
                const challengeResponse = await challengePromise;

                console.log('[YellowAuth] 📩 Step 2: Received auth_challenge:', challengeResponse);

                // Verify we got a challenge
                if (challengeResponse.method !== RPCMethod.AuthChallenge && challengeResponse.method !== 'auth_challenge') {
                    throw new Error(`Expected auth_challenge, got ${challengeResponse.method}`);
                }

                // Step 3: Create EIP-712 signer and sign the challenge
                console.log('[YellowAuth] ✍️ Step 3: Signing challenge with EIP-712...');

                const eip712Signer = createEIP712AuthMessageSigner(
                    walletClient,
                    {
                        scope: authRequestParams.scope,
                        session_key: authRequestParams.session_key as `0x${string}`,
                        expires_at: authRequestParams.expires_at,
                        allowances: authRequestParams.allowances,
                    },
                    {
                        name: YELLOW_CONFIG.APP_NAME, // Must match application in auth_request
                    }
                );

                // Create auth_verify message with EIP-712 signature
                const authVerifyMessage = await createAuthVerifyMessage(
                    eip712Signer,
                    challengeResponse
                );

                console.log('[YellowAuth] 📤 Step 4: Sending auth_verify:', authVerifyMessage);

                // Extract the actual requestId from the SDK-generated auth_verify message
                let authVerifyId: number;
                try {
                    const parsed = JSON.parse(authVerifyMessage);
                    authVerifyId = parsed.req?.[0];
                    console.log('[YellowAuth] 📌 Auth verify ID:', authVerifyId);
                } catch {
                    throw new Error('Failed to parse auth_verify message');
                }

                // Set up callback BEFORE sending auth_verify
                // Use the ACTUAL requestId from the message
                const verifyPromise = new Promise<any>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        pendingCallbacksRef.current.delete(authVerifyId);
                        reject(new Error('Auth verify timeout'));
                    }, 15000);
                    pendingCallbacksRef.current.set(authVerifyId, {
                        resolve: (r) => { clearTimeout(timeout); resolve(r); },
                        reject: (e) => { clearTimeout(timeout); reject(e); }
                    });
                });

                // Send auth_verify
                sendMessage(authVerifyMessage);

                // Wait for response
                const verifyResponse = await verifyPromise;

                console.log('[YellowAuth] 📩 Step 5: Received auth_verify response:', verifyResponse);

                // Check for success
                if (verifyResponse.method === RPCMethod.Error || verifyResponse.method === 'error') {
                    throw new Error(verifyResponse.params?.error || 'Authentication failed');
                }

                if (verifyResponse.method !== RPCMethod.AuthVerify && verifyResponse.method !== 'auth_verify') {
                    throw new Error('Unexpected response: ' + verifyResponse.method);
                }

                if (!verifyResponse.params?.success) {
                    throw new Error('Authentication failed: ' + JSON.stringify(verifyResponse.params));
                }

                // Extract JWT token
                const jwtToken = verifyResponse.params?.jwtToken || verifyResponse.params?.jwt_token;

                if (jwtToken) {
                    localStorage.setItem(JWT_STORAGE_KEY, jwtToken);
                    console.log('[YellowAuth] 💾 Stored JWT token for future use');
                }

                console.log('%c✅ YELLOW AUTHENTICATION SUCCESSFUL!', 'color: #00FF00; font-size: 16px; font-weight: bold');
                console.log('[YellowAuth] 🔐 Session key (for RPC signing) available:', sessionKeyPair.address);
                console.log('[YellowAuth] 👤 Authenticated wallet:', address);

                setAuthState({
                    isAuthenticated: true,
                    authenticatedAddress: address, // Track which wallet is authenticated
                    sessionKey: sessionKeyPair.address, // Store the session key ADDRESS
                    sessionPrivateKey: sessionKeyPair.privateKey, // Store private key for RPC signing
                    jwtToken: jwtToken || 'authenticated',
                    expiresAt: Number(expiresAt) * 1000,
                    error: null,
                });
                setConnectionState('authenticated');
                setIsAuthenticating(false);

                // Return BOTH success flag AND the sessionPrivateKey for direct passing to createSession
                // This bypasses React state update timing issues
                return { success: true, sessionPrivateKey: sessionKeyPair.privateKey };

            } catch (error: any) {
                console.error('%c❌ YELLOW AUTHENTICATION FAILED:', 'color: #FF0000; font-weight: bold', error);

                setAuthState(prev => ({
                    ...prev,
                    isAuthenticated: false,
                    error: error.message || 'Authentication failed',
                }));
                setIsAuthenticating(false);
                return { success: false };
            }
        })();

        // Store the promise and wait for it
        authInProgressRef.current = authPromise;
        try {
            return await authPromise;
        } finally {
            authInProgressRef.current = null;
        }
    }, [address, walletClient, connectionState, connect, sendMessage]);

    // Auto-disconnect when wallet disconnects
    useEffect(() => {
        if (!isConnected && wsRef.current) {
            disconnect();
        }
    }, [isConnected, disconnect]);

    // ⚠️ CRITICAL: Reset auth state when wallet ADDRESS changes
    // This prevents using old wallet's auth for new wallet's operations
    useEffect(() => {
        if (address && authState.authenticatedAddress && address.toLowerCase() !== authState.authenticatedAddress.toLowerCase()) {
            console.log('[YellowAuth] ⚠️ Wallet changed! Resetting auth state');
            console.log('[YellowAuth]   Previous wallet:', authState.authenticatedAddress);
            console.log('[YellowAuth]   New wallet:', address);
            setAuthState({
                isAuthenticated: false,
                authenticatedAddress: null,
                sessionKey: null,
                sessionPrivateKey: null,
                jwtToken: null,
                expiresAt: null,
                error: null,
            });
            // Don't disconnect WebSocket - just reset auth state
            // The WebSocket connection can be reused after re-auth
            setConnectionState('connected');
        }
    }, [address, authState.authenticatedAddress]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (keepaliveIntervalRef.current) {
                clearInterval(keepaliveIntervalRef.current);
            }
        };
    }, []);

    return {
        connectionState,
        authState,
        isConnecting,
        isAuthenticating,
        connect,
        disconnect,
        authenticate,
        ws: wsRef.current,
        sendMessage,
        sendSignedMessage,
        sendRPC,
    };
}

export default useYellowAuth;
