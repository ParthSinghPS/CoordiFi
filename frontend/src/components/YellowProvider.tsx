/**
 * YellowProvider - Context provider for Yellow Network integration
 * 
 * REAL IMPLEMENTATION - All operations go through @erc7824/nitrolite SDK
 * 
 * Provides Yellow session management to all Freelance components.
 * Wraps Freelance pages to enable gasless operations via Yellow Network.
 * 
 * Usage:
 * <YellowProvider projectAddress={address}>
 *   <ProjectDashboard />
 * </YellowProvider>
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useYellowAuth } from '../hooks/useYellowAuth';
import { useYellowSession, YellowOperationLog, ActiveSession } from '../hooks/useYellowSession';
import { YellowConnectionState, YellowSessionData } from '../lib/yellow';
import { YellowStatusBar } from '../components/YellowStatusBar';
import { YellowFastForward, YellowOperationToast } from '../components/YellowFastForward';

interface YellowContextValue {
    // Connection state
    connectionState: YellowConnectionState;
    isAuthenticated: boolean;
    isSessionActive: boolean;

    // Operations
    operationLog: YellowOperationLog[];
    lastOperation: YellowOperationLog | null;
    totalSaved: string;

    // Session data
    sessionId: string | null;
    sessionData: YellowSessionData | null;
    activeSession: ActiveSession | null;

    // Loading states
    isCreatingSession: boolean;
    isUpdatingSession: boolean;
    isSettling: boolean;

    // Actions
    initializeSession: (params: InitSessionParams) => Promise<boolean>;
    submitMilestoneWork: (milestoneId: number, workHash: string, proofUrl?: string, proofDescription?: string) => Promise<boolean>;
    approveMilestoneWork: (milestoneId: number, approverRole: 'client' | 'worker') => Promise<boolean>;
    requestMilestoneRevision: (milestoneId: number, feedback: string, revisionNumber: number, revisionLimit?: number) => Promise<boolean>;
    raiseMilestoneDispute: (milestoneId: number, disputeType: number, reason: string) => Promise<boolean>;
    settleProject: () => Promise<boolean>;

    // UI controls
    showFastForward: (operations: YellowOperationLog[]) => void;
    hideFastForward: () => void;
}

interface InitSessionParams {
    projectAddress: string;
    clientAddress: string;
    workerAddress: string;      // Primary worker (for backward compatibility)
    workerAddresses?: string[]; // All workers for multi-worker milestones
    totalAmount: bigint;
    milestones: {
        id: number;
        amount: bigint;
        deadline: number;
        description?: string;
        workerAddress?: string; // Optional: specific worker for this milestone
    }[];
}


const YellowContext = createContext<YellowContextValue | null>(null);

export function useYellow() {
    const context = useContext(YellowContext);
    if (!context) {
        throw new Error('useYellow must be used within a YellowProvider');
    }
    return context;
}

// Hook to check if Yellow is available (optional usage)
export function useYellowOptional() {
    return useContext(YellowContext);
}

interface YellowProviderProps {
    children: ReactNode;
    showStatusBar?: boolean;
    autoConnect?: boolean;
}

export function YellowProvider({
    children,
    showStatusBar = true,
    autoConnect = true,
}: YellowProviderProps) {

    // Yellow auth hook - SINGLE INSTANCE shared with session hook
    const {
        connectionState,
        authState,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isConnecting: _isConnecting,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isAuthenticating: _isAuthenticating,
        connect,
        disconnect,
        authenticate,
        sendRPC,  // Share this with session hook to avoid WebSocket duplication
        sendSignedMessage, // For SDK-generated pre-signed messages
    } = useYellowAuth();

    // Pass shared auth props to session hook to use SAME WebSocket connection
    const {
        activeSession,
        isSessionActive,
        operationLog,
        isCreatingSession,
        isUpdatingSession,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isClosingSession: _isClosingSession,
        createSession,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        closeSession: _closeSession,
        submitMilestone,
        approveMilestone,
        requestRevision,
        raiseDispute,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        resolveDispute: _resolveDispute,
        settleProject: settleYellowProject,
        getOperationsSummary,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        clearOperationLog: _clearOperationLog,
    } = useYellowSession({
        // CRITICAL: Share the SAME WebSocket connection to fix duplication bug
        sharedSendRPC: sendRPC,
        sharedSendSignedMessage: sendSignedMessage,
        sharedConnectionState: connectionState,
        sharedAuthState: authState,
        sharedConnect: connect,
        sharedAuthenticate: authenticate,
    });

    // ⚠️ ALL DEMO MODE REMOVED - This is REAL Yellow Network integration
    // Connection and auth come directly from REAL WebSocket to ClearNode

    // Mutex to prevent duplicate session initialization
    const sessionInitInProgressRef = useRef<string | null>(null);

    // UI state
    const [fastForwardOps, setFastForwardOps] = useState<YellowOperationLog[]>([]);
    const [showFastForwardModal, setShowFastForwardModal] = useState(false);
    const [lastOperation, setLastOperation] = useState<YellowOperationLog | null>(null);
    const [showToast, setShowToast] = useState(false);

    // Track last operation for toast
    useEffect(() => {
        if (operationLog.length > 0) {
            const latestOp = operationLog[operationLog.length - 1];
            if (latestOp.status === 'success') {
                setLastOperation(latestOp);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 3000);
            }
        }
    }, [operationLog]);

    // Auto-connect to REAL ClearNode on mount
    useEffect(() => {
        if (autoConnect && connectionState === 'disconnected') {
            console.log('[YellowProvider] 🔌 Auto-connecting to REAL Yellow ClearNode...');
            connect().catch(err => {
                console.error('[YellowProvider] ❌ Auto-connect failed:', err);
            });
        }
    }, [autoConnect, connectionState, connect]);

    // Calculate total savings
    const totalSaved = getOperationsSummary().gasSaved;

    // Initialize REAL Yellow session for a project - uses SDK createAppSessionMessage
    const initializeSession = useCallback(async (params: InitSessionParams): Promise<boolean> => {
        try {
            // MUTEX: Prevent duplicate session creation
            if (sessionInitInProgressRef.current === params.projectAddress) {
                console.log('[YellowProvider] ⏳ Session init already in progress for', params.projectAddress);
                return false;
            }
            sessionInitInProgressRef.current = params.projectAddress;

            // FIRST: Check if session already exists in localStorage (no auth needed for loading!)
            const sessionKey = `yellow_session_${params.projectAddress}`;
            const existingSessionStr = localStorage.getItem(sessionKey);
            if (existingSessionStr) {
                console.log('[YellowProvider] 📦 Found existing session, loading without auth...');
                // createSession will handle loading it - just need to ensure connection
                if (connectionState !== 'connected' && connectionState !== 'authenticated') {
                    console.log('[YellowProvider] 🔌 Connecting to load existing session...');
                    await connect();
                }
                const sessionId = await createSession(params);
                console.log('[YellowProvider] Session loaded:', sessionId);
                return !!sessionId;
            }

            // No existing session - need full auth for creating new one
            console.log('[YellowProvider] 🔐 REAL mode - no existing session, checking authentication...');
            console.log('[YellowProvider] Current auth state:', authState);

            let sessionPrivateKeyToUse: `0x${string}` | undefined;

            if (!authState.isAuthenticated) {
                console.log('[YellowProvider] 🔑 Not authenticated, starting auth flow...');
                const authResult = await authenticate();
                console.log('[YellowProvider] Auth result:', authResult);
                if (!authResult.success) {
                    console.error('[YellowProvider] ❌ Failed to authenticate with ClearNode');
                    return false;
                }
                // Use the sessionPrivateKey directly from authenticate() result
                // This bypasses React state timing issues
                sessionPrivateKeyToUse = authResult.sessionPrivateKey;
                console.log('[YellowProvider] 🔑 Got session key from auth:', sessionPrivateKeyToUse?.substring(0, 20) + '...');
            } else {
                // Already authenticated, use the key from state (should be available)
                sessionPrivateKeyToUse = authState.sessionPrivateKey ?? undefined;
                console.log('[YellowProvider] 🔑 Using existing session key from state');
            }

            console.log('[YellowProvider] ✅ Authenticated, creating REAL session...');
            // Pass sessionPrivateKey directly to avoid React state timing issues
            const sessionId = await createSession({
                ...params,
                skipAuth: true,
                sessionPrivateKey: sessionPrivateKeyToUse,
            });
            console.log('[YellowProvider] Session created:', sessionId);
            return !!sessionId;
        } catch (error) {
            console.error('[YellowProvider] ❌ Failed to initialize session:', error);
            return false;
        } finally {
            // Release mutex
            sessionInitInProgressRef.current = null;
        }
    }, [authState, authenticate, createSession, connectionState, connect]);

    // Wrapper for submit milestone
    const submitMilestoneWork = useCallback(async (
        milestoneId: number,
        workHash: string,
        proofUrl?: string,
        proofDescription?: string
    ): Promise<boolean> => {
        const success = await submitMilestone(milestoneId, workHash, proofUrl, proofDescription);
        return success;
    }, [submitMilestone]);

    // Wrapper for approve milestone
    const approveMilestoneWork = useCallback(async (
        milestoneId: number,
        approverRole: 'client' | 'worker'
    ): Promise<boolean> => {
        const success = await approveMilestone(milestoneId, approverRole);
        return success;
    }, [approveMilestone]);

    // Wrapper for request revision
    const requestMilestoneRevision = useCallback(async (
        milestoneId: number,
        feedback: string,
        revisionNumber: number,
        revisionLimit?: number
    ): Promise<boolean> => {
        const success = await requestRevision(milestoneId, feedback, revisionNumber, revisionLimit);
        return success;
    }, [requestRevision]);

    // Wrapper for raise dispute
    const raiseMilestoneDispute = useCallback(async (
        milestoneId: number,
        disputeType: number,
        reason: string
    ): Promise<boolean> => {
        const success = await raiseDispute(milestoneId, disputeType, reason);
        return success;
    }, [raiseDispute]);

    // Settlement wrapper
    const settleProject = useCallback(async (): Promise<boolean> => {
        return await settleYellowProject();
    }, [settleYellowProject]);

    // Fast forward controls
    const showFastForward = useCallback((operations: YellowOperationLog[]) => {
        setFastForwardOps(operations);
        setShowFastForwardModal(true);
    }, []);

    const hideFastForward = useCallback(() => {
        setShowFastForwardModal(false);
        setFastForwardOps([]);
    }, []);

    // Reconnect to REAL ClearNode
    const handleReconnect = useCallback(async () => {
        console.log('[YellowProvider] 🔄 Reconnecting to REAL ClearNode...');
        disconnect();
        await connect();
        await authenticate();
        console.log('[YellowProvider] ✅ Reconnected');
    }, [disconnect, connect, authenticate]);

    const value: YellowContextValue = {
        // REAL Connection state from ClearNode WebSocket
        connectionState: connectionState,
        isAuthenticated: authState.isAuthenticated,
        isSessionActive: isSessionActive,

        // Operations
        operationLog,
        lastOperation,
        totalSaved,

        // Session data - REAL from Yellow Network
        sessionId: activeSession?.sessionId || null,
        sessionData: activeSession?.sessionData || null,
        activeSession: activeSession || null,

        // Loading states
        isCreatingSession,
        isUpdatingSession,
        isSettling: _isClosingSession,

        // Actions - all go through REAL Yellow Network
        initializeSession,
        submitMilestoneWork,
        approveMilestoneWork,
        requestMilestoneRevision,
        raiseMilestoneDispute,
        settleProject,

        // UI controls
        showFastForward,
        hideFastForward,
    };

    return (
        <YellowContext.Provider value={value}>
            {children}

            {/* Yellow Status Bar - shows REAL connection status */}
            {showStatusBar && (
                <YellowStatusBar
                    connectionState={connectionState}
                    isAuthenticated={authState.isAuthenticated}
                    sessionId={activeSession?.sessionId || null}
                    operationLog={operationLog}
                    totalSaved={totalSaved}
                    onReconnect={handleReconnect}
                />
            )}

            {/* Fast Forward Modal */}
            <YellowFastForward
                operations={fastForwardOps}
                isVisible={showFastForwardModal}
                onClose={hideFastForward}
            />

            {/* Operation Toast */}
            <YellowOperationToast
                operation={lastOperation}
                isVisible={showToast}
            />
        </YellowContext.Provider>
    );
}

export default YellowProvider;
