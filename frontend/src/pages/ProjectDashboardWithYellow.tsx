/**
 * ProjectDashboardWithYellow - Yellow Network enabled Project Dashboard
 * 
 * This component wraps the existing ProjectDashboard logic with Yellow Network integration.
 * It provides gasless milestone operations via Yellow Network while maintaining
 * backward compatibility with on-chain fallback.
 * 
 * Usage: Replace ProjectDashboard import with ProjectDashboardWithYellow in routes.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useFreelanceEscrow, Milestone, DISPUTE_TYPE } from '../hooks/useFreelanceEscrow';
import { useYellowCustody } from '../hooks/useYellowCustody';
import { MilestoneCard } from '../components/freelance/MilestoneCard';
import { ProjectPhaseBadge, MilestoneProgressBar } from '../components/freelance/MilestoneStatusBadge';
import {
    YellowSubmitWorkModal,
    YellowApproveMilestoneModal,
    YellowRequestRevisionModal,
    YellowRaiseDisputeModal
} from '../components/freelance/YellowMilestoneModals';
import { YellowProvider, useYellowOptional } from '../components/YellowProvider';
import { SettleProjectModal } from '../components/SettleProjectModal';
import { YellowSavingsCounter } from '../components/YellowStatusBar';
import { disputes as supabaseDisputes, freelanceMilestones as supabaseMilestones, milestoneComms, freelanceProjects, txHistory } from '@/lib/supabase';
import { Zap, DollarSign } from 'lucide-react';
import { requestYellowFaucetTokens } from '../lib/yellowSDK';

/**
 * Inner dashboard component that uses Yellow context
 */
function ProjectDashboardInner() {
    const { address: escrowAddress } = useParams<{ address: string }>();
    const { address: userAddress } = useAccount();
    const yellow = useYellowOptional();

    // Yellow Custody hook (available for future use)
    // Note: In hybrid mode, we use FreelanceEscrow for ETH + Faucet for ytest.usd
    useYellowCustody(); // Keep for balance display

    const [isDepositing, setIsDepositing] = useState(false);
    const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
    const [yellowCustodyTxHash, setYellowCustodyTxHash] = useState<string | null>(null);

    // State for stored funding TX (persisted from Supabase)
    const [storedFundingTx, setStoredFundingTx] = useState<string | null>(null);

    // State for milestone dependencies
    const [milestoneDeps, setMilestoneDeps] = useState<Map<number, { deps: number[], completed: boolean }>>(new Map());

    const {
        projectInfo,
        milestones,
        isClient,
        isWorker,
        isDataLoading,
        isError,
        depositFunds,
        submitWork,
        approveMilestone,
        requestRevision,
        raiseDispute,
        refetchAll,
        getMilestoneDependencies,
        settleWithYellowProof, // Yellow Network batch settlement
    } = useFreelanceEscrow(escrowAddress as `0x${string}` | undefined);

    // Modal states
    const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
    const [activeModal, setActiveModal] = useState<'submit' | 'approve' | 'revision' | 'dispute' | 'settle' | null>(null);

    // State for submitted work details (fetched from Supabase)
    const [submittedWorkDetails, setSubmittedWorkDetails] = useState<{
        proofUrl?: string;
        proofDescription?: string;
    } | null>(null);

    // State for revision feedback (for worker's submit modal)
    const [revisionFeedback, setRevisionFeedback] = useState<{
        message?: string;
        requestedAt?: string;
    } | null>(null);

    // State for revision feedback per milestone (for MilestoneCard display)
    const [milestoneRevisionFeedback, setMilestoneRevisionFeedback] = useState<Record<number, string>>({});

    // State for Supabase milestone statuses (overrides for Yellow/dispute resolutions)
    const [supabaseMilestoneStatuses, setSupabaseMilestoneStatuses] = useState<Record<number, string>>({});

    // State for tx_history (Supabase) - includes dispute resolutions done on admin page
    const [supabaseTxHistory, setSupabaseTxHistory] = useState<any[]>([]);

    // State for milestone communications - includes dispute_resolved entries
    const [supabaseMilestoneComms, setSupabaseMilestoneComms] = useState<any[]>([]);

    // State for settlement info per milestone (from yellow_settlement tx)
    const [settlementInfoByMilestone, setSettlementInfoByMilestone] = useState<Record<number, {
        txHash: string;
        amount: string;
        recipientType: 'worker' | 'client';
    }>>({});

    // Track if we've attempted to initialize Yellow session (use ref to prevent race condition)
    const yellowInitAttemptedRef = useRef(false);

    // Keep a ref to the latest yellow context value to avoid closure capture issues
    // The inline onClick handler captures variables at render time, but yellow may become
    // available AFTER the button renders. This ref always has the current value.
    const yellowRef = useRef(yellow);
    useEffect(() => {
        yellowRef.current = yellow;
    }, [yellow]);

    // Reusable function to fetch Supabase milestone statuses
    const fetchSupabaseMilestoneStatuses = useCallback(async () => {
        if (!escrowAddress) return;
        try {
            const allMilestones = await supabaseMilestones.getByProject(escrowAddress);
            const statusMap: Record<number, string> = {};
            allMilestones.forEach((m: { milestone_index?: number; status?: string }) => {
                if (m.milestone_index !== undefined && m.status) {
                    // DB stores milestone_index as 1-based (matches on-chain milestoneId)
                    // milestone_index 1 = Milestone 1, milestone_index 2 = Milestone 2, etc.
                    statusMap[m.milestone_index] = m.status;
                }
            });
            setSupabaseMilestoneStatuses(statusMap);
            console.log('[ProjectDashboard] 📊 Supabase milestone statuses:', statusMap);
        } catch (err) {
            console.error('[ProjectDashboard] Failed to fetch Supabase statuses:', err);
        }
    }, [escrowAddress]);

    // Fetch Supabase milestone statuses on load and periodically
    useEffect(() => {
        fetchSupabaseMilestoneStatuses();

        // Also refresh every 5 seconds to catch external updates (like dispute resolution)
        const interval = setInterval(fetchSupabaseMilestoneStatuses, 5000);
        return () => clearInterval(interval);
    }, [fetchSupabaseMilestoneStatuses]);

    // Fetch stored funding TX from Supabase on load
    useEffect(() => {
        const fetchFundingTx = async () => {
            if (escrowAddress) {
                try {
                    // Only log on first fetch, not on polling
                    const txs = await txHistory.getByEscrow(escrowAddress);
                    setSupabaseTxHistory(txs); // Store full history for proof display

                    // Load Yellow Custody TX
                    const yellowCustodyTx = txs.find(tx => tx.tx_type === 'yellow_custody_deposit');
                    if (yellowCustodyTx?.tx_hash && yellowCustodyTx.tx_hash !== yellowCustodyTxHash) {
                        console.log('[ProjectDashboard] 🟡 Found Yellow Custody TX:', yellowCustodyTx.tx_hash);
                        setYellowCustodyTxHash(yellowCustodyTx.tx_hash);
                    }

                    // Load FreelanceEscrow funding TX
                    const fundingTx = txs.find(tx => tx.tx_type === 'deposit');
                    if (fundingTx?.tx_hash && fundingTx.tx_hash !== storedFundingTx) {
                        console.log('[ProjectDashboard] ✅ Found funding TX:', fundingTx.tx_hash);
                        setStoredFundingTx(fundingTx.tx_hash);
                    }

                    // Check for settlement TX and populate settlementInfoByMilestone
                    const settlementTx = txs.find(tx => tx.tx_type === 'yellow_settlement');
                    if (settlementTx?.tx_hash && milestones.length > 0) {
                        console.log('[ProjectDashboard] ✅ Found settlement TX:', settlementTx.tx_hash);
                        // Populate settlement info for each paid/cancelled milestone
                        const newSettlementInfo: Record<number, { txHash: string; amount: string; recipientType: 'worker' | 'client' }> = {};
                        milestones.forEach((m) => {
                            const milestoneId = Number(m.milestoneId);
                            const supabaseStatus = supabaseMilestoneStatuses[milestoneId];
                            const isPaid = m.status === 4 || supabaseStatus === 'paid';
                            const isCancelled = m.status === 6 || supabaseStatus === 'cancelled';
                            if (isPaid || isCancelled) {
                                newSettlementInfo[milestoneId] = {
                                    txHash: settlementTx.tx_hash,
                                    amount: formatEther(m.amount),
                                    recipientType: isPaid ? 'worker' : 'client',
                                };
                            }
                        });
                        if (Object.keys(newSettlementInfo).length > 0) {
                            console.log('[ProjectDashboard] 💰 Settlement info loaded:', newSettlementInfo);
                            setSettlementInfoByMilestone(prev => ({ ...prev, ...newSettlementInfo }));
                        }
                    }

                    // Also fetch milestone communications (for dispute_resolved entries)
                    const comms = await milestoneComms.getByEscrow(escrowAddress);
                    setSupabaseMilestoneComms(comms);
                    // Only log if there are new communications
                    if (comms.length > 0) {
                        console.log('[ProjectDashboard] 📝 Milestone communications:', comms.length);
                    }
                } catch (err) {
                    console.error('[ProjectDashboard] Failed to load funding TX:', err);
                }
            }
        };
        fetchFundingTx();
        // Also refresh periodically to catch admin actions like dispute resolution (every 10 seconds)
        const interval = setInterval(fetchFundingTx, 10000);
        return () => clearInterval(interval);
        // Note: Removed supabaseMilestoneStatuses from deps to prevent infinite loop
    }, [escrowAddress, milestones.length, storedFundingTx, yellowCustodyTxHash]);


    // Helper: Check if a milestone is "settled" (out of dependency chain)
    // A milestone is settled if it's approved, paid, or cancelled (dispute resolved)
    const isMilestoneSettled = (milestoneId: number): boolean => {
        // Check Supabase status first (source of truth for Yellow operations)
        const supabaseStatus = supabaseMilestoneStatuses[milestoneId];
        if (supabaseStatus) {
            // These statuses mean the milestone is "done" from dependency perspective
            if (['approved', 'paid', 'cancelled'].includes(supabaseStatus)) {
                return true;
            }
        }

        // Fall back to on-chain status
        const milestone = milestones.find(m => Number(m.milestoneId) === milestoneId);
        if (milestone) {
            // Status: 3=Approved, 4=Paid, 6=Cancelled
            if (milestone.status >= 3) {
                return true;
            }
        }

        return false;
    };

    // Fetch milestone dependencies and re-evaluate when Supabase statuses change
    useEffect(() => {
        const fetchDependencies = async () => {
            // Skip if no milestones
            if (milestones.length === 0) {
                return;
            }

            if (getMilestoneDependencies) {
                const depsMap = new Map<number, { deps: number[], completed: boolean }>();

                for (const milestone of milestones) {
                    const milestoneIndex = Number(milestone.milestoneId);
                    try {
                        const deps = await getMilestoneDependencies(BigInt(milestoneIndex));
                        let completed = true;

                        if (deps.length > 0) {
                            // Check if ALL dependencies are settled (approved, paid, or cancelled)
                            // This includes Yellow dispute resolutions
                            completed = deps.every(depId => isMilestoneSettled(depId));
                            console.log(`[ProjectDashboard] Milestone ${milestoneIndex} deps:`, deps,
                                'completed:', completed,
                                'depStatuses:', deps.map(d => ({ id: d, supabase: supabaseMilestoneStatuses[d], settled: isMilestoneSettled(d) })));
                        }
                        depsMap.set(milestoneIndex, { deps, completed });
                    } catch (err) {
                        console.error(`[ProjectDashboard] Failed to get deps for milestone ${milestoneIndex}:`, err);
                        depsMap.set(milestoneIndex, { deps: [], completed: true });
                    }
                }

                setMilestoneDeps(depsMap);
            }
        };
        fetchDependencies();
        // Re-run when Supabase statuses change (e.g., after dispute resolution)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [milestones.length, getMilestoneDependencies, JSON.stringify(supabaseMilestoneStatuses)]);

    // Initialize Yellow session when project loads (only once)
    useEffect(() => {
        const initYellow = async () => {
            // Skip if already attempted or session is active
            if (yellowInitAttemptedRef.current || yellow?.isSessionActive) {
                // Don't log every time - this runs on every render
                return;
            }

            console.log('[ProjectDashboard] 🟡 Yellow init check:', {
                yellowExists: !!yellow,
                projectInfoExists: !!projectInfo,
                isSessionActive: yellow?.isSessionActive,
                yellowInitAttempted: yellowInitAttemptedRef.current,
                escrowAddress,
                userAddress,
                currentPhase: projectInfo?.currentPhase,
                milestonesCount: milestones?.length,
            });

            if (yellow && projectInfo && escrowAddress && userAddress) {
                // Only initialize if project is funded (phase >= 1)
                if (projectInfo.currentPhase >= 1) {
                    yellowInitAttemptedRef.current = true; // Mark as attempted BEFORE async call
                    console.log('[ProjectDashboard] 🟡 Initializing Yellow session...');

                    // IMPORTANT: Use contract milestoneId (1-indexed) not array index (0-indexed)
                    const milestoneData = milestones.map((m) => ({
                        id: Number(m.milestoneId),
                        amount: m.amount,
                        deadline: Number(m.deadline || 0),
                        description: m.description,
                    }));
                    console.log('[ProjectDashboard] 🟡 Milestone data for Yellow:', milestoneData.map(m => ({ id: m.id, desc: m.description })));

                    // CRITICAL: Gather ALL unique workers from ALL milestones for multi-worker support
                    const allWorkerAddresses = [...new Set(milestones.map(m => m.worker).filter(Boolean))];
                    console.log('[ProjectDashboard] 🟡 All workers for Yellow session:', allWorkerAddresses);

                    try {
                        const success = await yellow.initializeSession({
                            projectAddress: escrowAddress,
                            clientAddress: projectInfo.client,
                            workerAddress: milestones[0]?.worker || userAddress,
                            workerAddresses: allWorkerAddresses.length > 0 ? allWorkerAddresses : undefined,
                            totalAmount: projectInfo.totalAmount,
                            milestones: milestoneData,
                        });

                        console.log('[ProjectDashboard] 🟡 Yellow session result:', success);
                    } catch (err) {
                        console.error('[ProjectDashboard] ❌ Yellow session init failed:', err);
                    }
                } else {
                    console.log('[ProjectDashboard] ⏳ Project not funded yet (phase:', projectInfo.currentPhase, '), skipping Yellow init');
                }
            }
        };

        initYellow();
    }, [yellow, projectInfo, escrowAddress, userAddress, milestones]);

    // Fetch submitted work from Supabase when opening approve modal
    useEffect(() => {
        const fetchSubmittedWork = async () => {
            if (activeModal === 'approve' && selectedMilestone && escrowAddress) {
                try {
                    const milestoneData = await supabaseMilestones.getByProjectAndIndex(
                        escrowAddress,
                        Number(selectedMilestone.milestoneId)
                    );
                    if (milestoneData) {
                        setSubmittedWorkDetails({
                            proofUrl: milestoneData.proof_url || undefined,
                            proofDescription: milestoneData.proof_description || undefined,
                        });
                    } else {
                        setSubmittedWorkDetails(null);
                    }
                } catch (err) {
                    console.error('[ProjectDashboard] Failed to load submitted work:', err);
                    setSubmittedWorkDetails(null);
                }
            }
        };
        fetchSubmittedWork();
    }, [activeModal, selectedMilestone, escrowAddress]);

    // Fetch revision feedback when opening submit modal
    useEffect(() => {
        const fetchRevisionFeedback = async () => {
            if (activeModal === 'submit' && selectedMilestone && escrowAddress) {
                if (selectedMilestone.status === 2) {
                    try {
                        const latestRevisionRequest = await milestoneComms.getLatestByType(
                            escrowAddress,
                            Number(selectedMilestone.milestoneId),
                            'revision_request'
                        );
                        if (latestRevisionRequest) {
                            setRevisionFeedback({
                                message: latestRevisionRequest.message || undefined,
                                requestedAt: latestRevisionRequest.created_at || undefined,
                            });
                        } else {
                            setRevisionFeedback(null);
                        }
                    } catch (err) {
                        console.error('[ProjectDashboard] Failed to load revision feedback:', err);
                        setRevisionFeedback(null);
                    }
                } else {
                    setRevisionFeedback(null);
                }
            }
        };
        fetchRevisionFeedback();
    }, [activeModal, selectedMilestone, escrowAddress]);

    // Stable reference to milestones length to avoid infinite loop
    const milestonesLengthRef = useRef(milestones.length);
    milestonesLengthRef.current = milestones.length;

    // Serialize milestone statuses to detect changes
    const milestoneStatusKey = milestones.map(m => `${m.milestoneId}:${m.status}`).join(',');

    // Fetch revision feedback for ALL milestones with status 2 (RevisionRequested)
    // This is used to display the feedback in the MilestoneCard
    useEffect(() => {
        const fetchAllRevisionFeedback = async () => {
            if (!escrowAddress || !milestonesLengthRef.current) return;

            const feedbackMap: Record<number, string> = {};

            for (const milestone of milestones) {
                // Status 2 = RevisionRequested (from Yellow) or on-chain
                // Also check enhanced milestones status
                const milestoneId = Number(milestone.milestoneId);
                if (milestone.status === 2) {
                    try {
                        const latestRevision = await milestoneComms.getLatestByType(
                            escrowAddress,
                            milestoneId,
                            'revision_request'
                        );
                        if (latestRevision?.message) {
                            feedbackMap[milestoneId] = latestRevision.message;
                        }
                    } catch (err) {
                        console.error(`[ProjectDashboard] Failed to load revision feedback for milestone ${milestoneId}:`, err);
                    }
                }
            }

            // Also check Yellow session for revision feedback
            if (yellow?.activeSession?.sessionData?.milestones) {
                for (const yellowMilestone of yellow.activeSession.sessionData.milestones) {
                    if (yellowMilestone.status === 'revision_requested' && yellowMilestone.feedback) {
                        feedbackMap[yellowMilestone.id] = yellowMilestone.feedback;
                    }
                }
            }

            setMilestoneRevisionFeedback(feedbackMap);
            console.log('[ProjectDashboard] 📝 Loaded revision feedback for milestones:', Object.keys(feedbackMap));
        };

        fetchAllRevisionFeedback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [escrowAddress, milestoneStatusKey]);

    // Helper: Get Yellow milestone status override
    // When Yellow session is active, we use Yellow's off-chain state instead of on-chain state
    const getYellowMilestoneStatus = (milestoneId: number): number | undefined => {
        // Map Yellow/Supabase status strings to on-chain status numbers
        // CORRECT On-chain enum: 0=Pending, 1=Submitted, 2=UnderRevision, 3=Approved, 4=Paid, 5=Disputed, 6=Cancelled
        const statusMap: Record<string, number> = {
            'pending': 0,
            'submitted': 1,
            'under_revision': 2,
            'revision_requested': 2, // Alias
            'approved': 3,
            'paid': 4,
            'disputed': 5,
            'cancelled': 6,
        };

        // PRIORITY 1: Check Supabase status (updated by dispute resolution)
        const supabaseStatus = supabaseMilestoneStatuses[milestoneId];
        if (supabaseStatus && statusMap[supabaseStatus] !== undefined) {
            console.log(`[getYellowMilestoneStatus] Milestone ${milestoneId} - Supabase status: ${supabaseStatus} -> ${statusMap[supabaseStatus]}`);
            return statusMap[supabaseStatus];
        }

        // PRIORITY 2: Check Yellow session status
        if (!yellow?.isSessionActive || !yellow?.activeSession?.sessionData?.milestones) {
            return undefined;
        }
        const yellowMilestone = yellow.activeSession.sessionData.milestones.find(
            (m: { id: number }) => m.id === milestoneId
        );
        if (!yellowMilestone) return undefined;

        return statusMap[yellowMilestone.status] ?? undefined;
    };

    // Helper: Get ALL Yellow verification proofs for a milestone (chronological history)
    // Merges: 1) Yellow operationLog (localStorage) + 2) tx_history (Supabase - dispute resolutions etc)
    const getYellowProofHistory = (milestoneId: number) => {
        // Map operation type to user-friendly name
        const operationNames: Record<string, string> = {
            'milestone_submit': 'Work Submitted',
            'milestone_approve': 'Milestone Approved',
            'milestone_revision': 'Revision Requested',
            'milestone_dispute': 'Dispute Raised',
            'dispute_resolve': 'Dispute Settled',
            'session_settle': 'Session Settled',
            'yellow_submit': 'Work Submitted',
            'yellow_resubmit': 'Work Resubmitted',
            'yellow_approve': 'Milestone Approved',
            'yellow_revision': 'Revision Requested',
            'yellow_dispute': 'Dispute Raised',
            'yellow_dispute_resolve': 'Dispute Settled',
        };

        const results: Array<{
            operation: string;
            timestamp: number;
            yellowSessionId: string;
            yellowStateVersion: number;
            signer: string;
            gasSaved: string;
            submissionNumber?: number;
            revisionNumber?: number;
            proofUrl?: string;
            proofDescription?: string;
            feedbackMessage?: string;
            disputeReason?: string;
            disputeType?: number;
            resolution?: string;
        }> = [];

        // 1) From Yellow operationLog (localStorage)
        if (yellow?.operationLog && yellow.operationLog.length > 0) {
            const relevantOps = yellow.operationLog.filter(
                op => op.milestoneId === milestoneId &&
                    op.status === 'success' &&
                    (op.yellowSessionId || op.yellowStateVersion !== undefined)
            );

            relevantOps.forEach(op => {
                results.push({
                    operation: operationNames[op.type] || op.type,
                    timestamp: op.timestamp,
                    yellowSessionId: op.yellowSessionId || yellow.activeSession?.appSessionId || '',
                    yellowStateVersion: op.yellowStateVersion ?? 0,
                    signer: op.signer || yellow.activeSession?.sessionData?.worker || '0x...',
                    gasSaved: op.gasSaved || '~$1.50',
                    submissionNumber: op.submissionNumber,
                    revisionNumber: op.revisionNumber,
                    proofUrl: op.proofUrl,
                    proofDescription: op.proofDescription,
                    feedbackMessage: op.feedbackMessage,
                    disputeReason: op.disputeReason,
                    disputeType: op.disputeType,
                });
            });
        }

        // 2) From Supabase tx_history (dispute resolutions, admin actions)
        if (supabaseTxHistory.length > 0) {
            const relevantTxs = supabaseTxHistory.filter(tx => {
                const meta = tx.metadata || {};
                // Match by milestone_index in metadata
                return meta.milestone_index === milestoneId ||
                    meta.milestoneId === milestoneId ||
                    meta.milestone_index === milestoneId - 1; // Handle 0-based legacy
            });

            relevantTxs.forEach(tx => {
                const meta = tx.metadata || {};
                // Avoid duplicates by checking timestamp proximity (within 5 seconds)
                const txTimestamp = new Date(tx.created_at).getTime();
                const isDuplicate = results.some(r => Math.abs(r.timestamp - txTimestamp) < 5000 &&
                    operationNames[tx.tx_type] === r.operation);

                if (!isDuplicate && operationNames[tx.tx_type]) {
                    results.push({
                        operation: operationNames[tx.tx_type] || tx.tx_type,
                        timestamp: txTimestamp,
                        yellowSessionId: meta.yellowSessionId || meta.app_session_id || tx.tx_hash || '',
                        yellowStateVersion: meta.yellowStateVersion || meta.state_version || 0,
                        signer: meta.signer || tx.from_address || '0x...',
                        gasSaved: meta.gasSaved || '~$7.60',
                        resolution: meta.resolution,
                        disputeReason: meta.reason,
                        disputeType: meta.dispute_type,
                    });
                }
            });
        }

        // 3) From Supabase milestone_communications (dispute_resolved entries)
        if (supabaseMilestoneComms.length > 0) {
            const relevantComms = supabaseMilestoneComms.filter(comm =>
                comm.milestone_index === milestoneId &&
                comm.message_type === 'dispute_resolved'
            );

            relevantComms.forEach(comm => {
                const commTimestamp = new Date(comm.created_at).getTime();
                // Avoid duplicates
                const isDuplicate = results.some(r =>
                    Math.abs(r.timestamp - commTimestamp) < 5000 &&
                    r.operation === 'Dispute Settled'
                );

                if (!isDuplicate) {
                    results.push({
                        operation: 'Dispute Settled',
                        timestamp: commTimestamp,
                        yellowSessionId: comm.tx_hash || '', // tx_hash stores the session id
                        yellowStateVersion: 0, // Dispute resolution is external
                        signer: comm.sender_address || '0x...',
                        gasSaved: '~$7.60', // Dispute resolution saves gas
                        resolution: comm.message?.includes('Worker') ? 'worker' : 'client',
                    });
                }
            });
        }

        // Sort by timestamp (oldest first for chronological order)
        return results.sort((a, b) => a.timestamp - b.timestamp);
    };

    // Helper: Get Yellow milestone revision count
    const getYellowRevisionCount = (milestoneId: number): number | undefined => {
        if (!yellow?.isSessionActive || !yellow?.activeSession?.sessionData?.milestones) {
            return undefined;
        }
        const yellowMilestone = yellow.activeSession.sessionData.milestones.find(
            (m: { id: number }) => m.id === milestoneId
        );
        return yellowMilestone?.revisionCount;
    };

    // Enhanced milestones with Yellow/Supabase state overlay - use useMemo to avoid infinite re-renders
    // Extended type to include internal tracking fields
    type EnhancedMilestone = typeof milestones[0] & { _onChainStatus: number; _yellowOverride?: boolean };

    const enhancedMilestones = useMemo(() => {
        return milestones.map(m => {
            const milestoneId = Number(m.milestoneId);
            const yellowStatus = getYellowMilestoneStatus(milestoneId);
            const yellowRevisionCount = getYellowRevisionCount(milestoneId);

            // Store original on-chain status before any overrides (needed for settlement)
            let enhanced: EnhancedMilestone = { ...m, _onChainStatus: m.status };

            // IMPORTANT: Supabase/Yellow status is the source of truth for off-chain operations
            // This includes dispute resolutions, which can transition from disputed (5) to:
            //   - approved (3) when worker wins
            //   - cancelled (6) when client wins  
            //   - submitted (1) when dispute is cancelled
            // We should ALWAYS use Supabase status when available, not just when higher

            // First check if there's a Supabase status override (dispute resolution, etc.)
            const supabaseStatus = supabaseMilestoneStatuses[milestoneId] || supabaseMilestoneStatuses[milestoneId - 1];
            if (supabaseStatus) {
                // Map Supabase string status to numeric status for display
                // CORRECT On-chain enum: 0=Pending, 1=Submitted, 2=UnderRevision, 3=Approved, 4=Paid, 5=Disputed, 6=Cancelled
                const supabaseStatusMap: Record<string, number> = {
                    'pending': 0,
                    'submitted': 1,
                    'under_revision': 2,
                    'revision_requested': 2, // Alias - maps to UnderRevision
                    'approved': 3,
                    'paid': 4,
                    'disputed': 5,
                    'cancelled': 6,
                    'resolved_client': 6, // Client won dispute = cancelled
                    'resolved_worker': 3, // Worker won dispute = approved
                };
                const mappedStatus = supabaseStatusMap[supabaseStatus];
                if (mappedStatus !== undefined) {
                    console.log(`[enhancedMilestones] Milestone ${milestoneId}: using Supabase status '${supabaseStatus}' -> ${mappedStatus}, on-chain was ${m.status}`);
                    enhanced = { ...enhanced, status: mappedStatus, _yellowOverride: true };
                }
            } else if (yellowStatus !== undefined && yellowStatus > m.status) {
                // No explicit Supabase override, use Yellow if more advanced
                enhanced = { ...enhanced, status: yellowStatus, _yellowOverride: true };
            }

            // Use Yellow's revision count if higher (more recent)
            if (yellowRevisionCount !== undefined && yellowRevisionCount > Number(m.revisionCount)) {
                enhanced = { ...enhanced, revisionCount: BigInt(yellowRevisionCount) };
            }

            return enhanced;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [milestoneStatusKey, supabaseMilestoneStatuses, yellow?.activeSession?.sessionData?.milestones, yellow?.activeSession?.sessionData?.lastUpdated]);

    // Helper to check if a milestone is in a "terminal" state (project can settle)
    // Terminal states: 3=Approved, 4=Paid, 6=Cancelled
    // A milestone is terminal when it's done - either approved/paid or cancelled (dispute resolution)
    const isTerminalStatus = (status: number): boolean => {
        return status === 3 || status === 4 || status === 6; // Approved (3), Paid (4), or Cancelled (6)
    };

    // Check Supabase status for terminal states (used for Yellow-only approvals)
    const isTerminalSupabaseStatus = (status: string | undefined): boolean => {
        return status === 'approved' || status === 'paid' || status === 'cancelled';
    };

    // Helper to get the effective status of a milestone (combining on-chain + Supabase)
    const getEffectiveStatus = (m: typeof enhancedMilestones[0]): { status: number; supabaseStatus?: string } => {
        const milestoneId = Number(m.milestoneId);
        // Check Supabase (source of truth for Yellow operations)
        const supabaseStatus = supabaseMilestoneStatuses[milestoneId] || supabaseMilestoneStatuses[milestoneId - 1];
        return { status: m.status, supabaseStatus };
    };

    // Count completed milestones (terminal states) for UI display
    const enhancedCompletedMilestones = enhancedMilestones.filter(m => {
        const { status, supabaseStatus } = getEffectiveStatus(m);
        return isTerminalStatus(status) || isTerminalSupabaseStatus(supabaseStatus);
    }).length;

    // Is project done? ALL milestones must be in terminal state (approved, paid, or cancelled)
    const isProjectDone = enhancedCompletedMilestones === enhancedMilestones.length && enhancedMilestones.length > 0;

    // Check if project is ALREADY SETTLED (all milestones paid or cancelled, none just approved)
    // A project is settled when there are no milestones still waiting to be paid
    const isAlreadySettled = enhancedMilestones.length > 0 && enhancedMilestones.every(m => {
        const { status, supabaseStatus } = getEffectiveStatus(m);
        // Paid (4) or Cancelled (6) - NOT just Approved (3)
        const isPaidOrCancelled = status === 4 || status === 6;
        const supabasePaidOrCancelled = supabaseStatus === 'paid' || supabaseStatus === 'cancelled';
        return isPaidOrCancelled || supabasePaidOrCancelled;
    });

    // For backward compatibility with existing UI - but exclude already settled projects
    const enhancedAllApproved = isProjectDone && !isAlreadySettled;


    // Error state
    if (isError) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="mb-6">
                    <Link to="/freelance" className="text-gray-400 hover:text-white text-sm">
                        ← Back to Freelance Hub
                    </Link>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-white mb-2">Failed to Load Project</h2>
                    <p className="text-gray-400 mb-4">Could not fetch data from escrow contract.</p>
                    <p className="text-sm text-gray-500 font-mono mb-4">{escrowAddress}</p>
                </div>
            </div>
        );
    }

    // Loading state
    if (isDataLoading) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-400">Loading project data...</p>
                </div>
            </div>
        );
    }

    if (!projectInfo) {
        return (
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="mb-6">
                    <Link to="/freelance" className="text-gray-400 hover:text-white text-sm">
                        ← Back to Freelance Hub
                    </Link>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-8 text-center">
                    <div className="text-4xl mb-4">📦</div>
                    <h2 className="text-xl font-bold text-white mb-2">Project Not Initialized</h2>
                    <p className="text-gray-400">This escrow contract exists but hasn't been fully initialized yet.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 pb-24"> {/* Extra padding for Yellow status bar */}
            {/* Breadcrumb */}
            <div className="mb-6">
                <Link to="/freelance" className="text-gray-400 hover:text-white text-sm">
                    ← Back to Freelance Hub
                </Link>
            </div>

            {/* Yellow Network Banner */}
            {yellow?.isSessionActive ? (
                <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Zap className="w-5 h-5 text-yellow-400" />
                            <div>
                                <span className="text-yellow-400 font-medium">Yellow Network Active</span>
                                <p className="text-zinc-500 text-sm">
                                    All milestone operations are gasless. Settlement is a single transaction.
                                </p>
                            </div>
                        </div>
                        {yellow.totalSaved !== '~$0.00' && (
                            <YellowSavingsCounter amount={yellow.totalSaved} />
                        )}
                    </div>
                </div>
            ) : yellow && projectInfo && projectInfo.currentPhase >= 1 && (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Zap className="w-5 h-5 text-zinc-500" />
                            <div>
                                <span className="text-zinc-400 font-medium">Yellow Network Available</span>
                                <p className="text-zinc-500 text-sm">
                                    Gasless operations ready. Click to activate session.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                yellowInitAttemptedRef.current = false; // Reset the flag
                                try {
                                    const milestoneData = milestones.map((m) => ({
                                        id: Number(m.milestoneId),
                                        amount: m.amount,
                                        deadline: Number(m.deadline || 0),
                                        description: m.description,
                                    }));
                                    const allWorkers = [...new Set(milestones.map(m => m.worker).filter(Boolean))];
                                    await yellow.initializeSession({
                                        projectAddress: escrowAddress!,
                                        clientAddress: projectInfo.client,
                                        workerAddress: milestones[0]?.worker || userAddress!,
                                        workerAddresses: allWorkers.length > 0 ? allWorkers : undefined,
                                        totalAmount: projectInfo.totalAmount,
                                        milestones: milestoneData,
                                    });
                                } catch (err) {
                                    console.error('[ProjectDashboard] Yellow retry failed:', err);
                                }
                            }}
                            className="px-4 py-2 bg-yellow-400/20 hover:bg-yellow-400/30 text-yellow-400 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Zap className="w-4 h-4" />
                            Activate Yellow
                        </button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-bg-card border border-gray-800 rounded-xl p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold text-white">Project Dashboard</h1>
                            <ProjectPhaseBadge phase={projectInfo.currentPhase} />
                            {yellow?.isSessionActive && (
                                <span className="px-2 py-1 bg-yellow-400/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    Yellow
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Escrow Contract:</span>
                            <a
                                href={`https://sepolia.etherscan.io/address/${escrowAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-gray-400 font-mono hover:text-primary-400 transition-colors"
                            >
                                {escrowAddress} ↗
                            </a>
                        </div>
                        {/* Show Yellow Custody TX if available */}
                        {yellowCustodyTxHash && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-yellow-500">🟡 Yellow Custody:</span>
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${yellowCustodyTxHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-yellow-400 font-mono hover:text-yellow-300 transition-colors"
                                    title="View Yellow Custody deposit transaction"
                                >
                                    {yellowCustodyTxHash.slice(0, 10)}...{yellowCustodyTxHash.slice(-8)} ↗
                                </a>
                            </div>
                        )}
                        {/* Show Funding TX if project is funded */}
                        {projectInfo.currentPhase >= 1 && (storedFundingTx || depositTxHash) && (
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-green-500">✅ Funded:</span>
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${storedFundingTx || depositTxHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-400 font-mono hover:text-green-300 transition-colors"
                                    title="View funding transaction"
                                >
                                    {(storedFundingTx || depositTxHash)?.slice(0, 10)}...{(storedFundingTx || depositTxHash)?.slice(-8)} ↗
                                </a>
                            </div>
                        )}
                    </div>
                    <div className="text-right space-y-2">
                        {isClient && (
                            <span className="block px-2 py-1 bg-primary-500/10 text-primary-400 text-xs rounded-full">
                                👤 You are the Client
                            </span>
                        )}
                        {isWorker && (
                            <span className="block px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full">
                                🔧 You are a Worker
                            </span>
                        )}
                    </div>
                </div>

                {/* Project Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatCard
                        label="Total Budget"
                        value={`${formatEther(projectInfo.totalAmount)} ETH`}
                        icon="💰"
                    />
                    <StatCard
                        label="Deposited"
                        value={`${projectInfo.currentPhase >= 1 ? formatEther(projectInfo.totalAmount) : '0'} ETH`}
                        icon="🏦"
                    />
                    <StatCard
                        label="Milestones"
                        value={`${enhancedMilestones.length}`}
                        icon="📋"
                    />
                    <StatCard
                        label="Completed"
                        value={`${enhancedCompletedMilestones}/${enhancedMilestones.length}`}
                        icon="✅"
                    />
                </div>

                {/* Progress Bar */}
                <MilestoneProgressBar completed={enhancedCompletedMilestones} total={enhancedMilestones.length} />
            </div>

            {/* Deposit Section (Client Only) */}
            {isClient && projectInfo.currentPhase === 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-yellow-400 font-medium mb-1">💵 Fund Project</h3>
                            <p className="text-yellow-400/80 text-sm">
                                Total Amount: <span className="font-mono font-bold">{formatEther(projectInfo.totalAmount)} ETH</span>
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                setIsDepositing(true);
                                try {
                                    // 🔥 HYBRID YELLOW INTEGRATION
                                    // Step 1: Deposit ETH to FreelanceEscrow (on-chain, secures real funds)
                                    // Step 2: Request ytest.usd from Faucet (for Yellow session tracking)

                                    console.log('[ProjectDashboard] 💰 HYBRID FUNDING FLOW');
                                    console.log('[ProjectDashboard] 💰 Amount:', formatEther(projectInfo.totalAmount), 'ETH');

                                    // === STEP 1: Deposit ETH to FreelanceEscrow (on-chain) ===
                                    console.log('[ProjectDashboard] 💰 Step 1: Depositing ETH to FreelanceEscrow...');
                                    const escrowResult = await depositFunds(projectInfo.totalAmount);
                                    // depositFunds returns { hash, receipt } on success, throws on failure
                                    console.log('[ProjectDashboard] ✅ FreelanceEscrow deposit confirmed:', escrowResult.hash);
                                    setDepositTxHash(escrowResult.hash || null);

                                    // === STEP 2: Request ytest.usd from Yellow Faucet ===
                                    // This goes to Unified Balance (off-chain) for Yellow session
                                    console.log('[ProjectDashboard] 🚰 Step 2: Requesting ytest.usd from Yellow Faucet...');
                                    if (!userAddress) {
                                        console.error('[ProjectDashboard] ❌ No user address for Faucet request');
                                    } else {
                                        const faucetResult = await requestYellowFaucetTokens(userAddress);
                                        if (faucetResult.success) {
                                            console.log('[ProjectDashboard] ✅ Faucet tokens received:', faucetResult.message);
                                        } else {
                                            console.warn('[ProjectDashboard] ⚠️ Faucet request failed:', faucetResult.error);
                                            // Don't throw - session creation might still work if user already has tokens
                                        }
                                    }

                                    // Update project status in Supabase
                                    if (escrowAddress) {
                                        await freelanceProjects.updateByEscrow(escrowAddress, {
                                            status: 'funded',
                                        });
                                        // Record FreelanceEscrow deposit
                                        await txHistory.add({
                                            escrow_address: escrowAddress,
                                            escrow_type: 'freelance',
                                            tx_type: 'deposit',
                                            tx_hash: escrowResult.hash || '',
                                            from_address: userAddress,
                                        });
                                    }

                                    // CRITICAL: Refetch to update UI
                                    console.log('[ProjectDashboard] 🔄 Refetching after deposit...');
                                    await refetchAll();
                                    console.log('[ProjectDashboard] 🔄 Refetch complete');

                                    // Reset Yellow init flag
                                    yellowInitAttemptedRef.current = false;

                                    // === STEP 3: Create Yellow Session with ytest.usd allocations ===
                                    const currentYellow = yellowRef.current;
                                    console.log('[ProjectDashboard] 🟡 Post-funding Yellow check:', {
                                        yellowExists: !!currentYellow,
                                        milestonesLength: milestones.length,
                                        escrowAddress,
                                    });

                                    if (currentYellow && milestones.length > 0 && escrowAddress) {
                                        console.log('[ProjectDashboard] 🟡 Creating Yellow session with ytest.usd allocations...');

                                        // No delay needed - Faucet tokens are available immediately in Unified Balance
                                        const milestoneData = milestones.map((m) => ({
                                            id: Number(m.milestoneId),
                                            amount: m.amount,
                                            deadline: Number(m.deadline || 0),
                                            description: m.description,
                                        }));
                                        const allWorkers = [...new Set(milestones.map(m => m.worker).filter(Boolean))];

                                        // Try up to 3 times
                                        let success = false;
                                        let lastError: Error | null = null;
                                        for (let attempt = 1; attempt <= 3; attempt++) {
                                            try {
                                                console.log(`[ProjectDashboard] 🟡 Session creation attempt ${attempt}/3...`);
                                                success = await currentYellow.initializeSession({
                                                    projectAddress: escrowAddress,
                                                    clientAddress: projectInfo.client,
                                                    workerAddress: milestones[0]?.worker || userAddress || '',
                                                    workerAddresses: allWorkers.length > 0 ? allWorkers : undefined,
                                                    totalAmount: projectInfo.totalAmount,
                                                    milestones: milestoneData,
                                                });
                                                if (success) {
                                                    console.log('[ProjectDashboard] ✅ Yellow session created!');
                                                    console.log('[ProjectDashboard] 🔗 View on Yellowscan: https://sandbox.yellowscan.io');
                                                    break;
                                                }
                                            } catch (err) {
                                                lastError = err as Error;
                                                console.warn(`[ProjectDashboard] ⚠️ Attempt ${attempt} failed:`, err);
                                                if (attempt < 3) {
                                                    const delay = attempt * 2000;
                                                    console.log(`[ProjectDashboard] ⏳ Retrying in ${delay / 1000}s...`);
                                                    await new Promise(resolve => setTimeout(resolve, delay));
                                                }
                                            }
                                        }

                                        if (!success && lastError) {
                                            console.error('[ProjectDashboard] ❌ Yellow session failed after 3 attempts:', lastError);
                                        }
                                        yellowInitAttemptedRef.current = true;
                                    } else {
                                        console.log('[ProjectDashboard] ⚠️ Cannot init Yellow after funding:', {
                                            hasYellow: !!currentYellow,
                                            milestonesLength: milestones.length,
                                            escrowAddress,
                                        });
                                    }
                                } catch (err) {
                                    console.error('Deposit failed:', err);
                                }
                                setIsDepositing(false);
                            }}
                            disabled={isDepositing}
                            className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                        >
                            {isDepositing ? 'Funding...' : `💰 Fund Full Amount (${formatEther(projectInfo.totalAmount)} ETH)`}
                        </button>
                    </div>
                    {(depositTxHash || yellowCustodyTxHash) && (
                        <div className="mt-4 pt-4 border-t border-yellow-500/20 space-y-2">
                            {yellowCustodyTxHash && (
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${yellowCustodyTxHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-yellow-400 hover:text-yellow-300 text-sm font-mono"
                                >
                                    🟡 Yellow Custody TX: {yellowCustodyTxHash.slice(0, 10)}...{yellowCustodyTxHash.slice(-8)} ↗
                                </a>
                            )}
                            {depositTxHash && (
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${depositTxHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-primary-400 hover:text-primary-300 text-sm font-mono"
                                >
                                    ✅ Escrow Funding TX: {depositTxHash.slice(0, 10)}...{depositTxHash.slice(-8)} ↗
                                </a>
                            )}
                        </div>
                    )}
                </div>
            )
            }

            {/* Settlement Button (when all milestones approved) */}
            {
                isClient && enhancedAllApproved && yellow?.isSessionActive && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 mb-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-green-400 font-medium mb-1 flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    Ready to Settle
                                </h3>
                                <p className="text-zinc-400 text-sm">
                                    All milestones are approved. Settle to release payments in a single transaction.
                                </p>
                                {yellow.operationLog.length > 0 && (
                                    <p className="text-green-400 text-xs mt-1">
                                        💰 {yellow.operationLog.filter(o => o.status === 'success').length} gasless operations saved {yellow.totalSaved}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => setActiveModal('settle')}
                                className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                            >
                                <Zap className="w-4 h-4" />
                                Settle Project
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Project Settled Banner - Shows when all milestones are paid/cancelled */}
            {
                isAlreadySettled && (
                    <div className="bg-green-500/20 border border-green-500/40 rounded-xl p-6 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                                <span className="text-2xl">✅</span>
                            </div>
                            <div>
                                <h3 className="text-green-400 font-semibold text-lg">Project Settled</h3>
                                <p className="text-zinc-400 text-sm">
                                    All payments have been processed. Workers have been paid and any refunds have been issued.
                                </p>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Milestones Section */}
            <div className="mb-6">
                <h2 className="text-xl font-semibold text-white mb-4">Milestones</h2>
                {enhancedMilestones.length === 0 ? (
                    <div className="bg-bg-card border border-gray-800 rounded-xl p-8 text-center">
                        <p className="text-gray-400">No milestones yet</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {enhancedMilestones.map((milestone, index) => {
                            const milestoneIndex = Number(milestone.milestoneId);
                            const depInfo = milestoneDeps.get(milestoneIndex) || { deps: [], completed: true };

                            return (
                                <MilestoneCard
                                    key={milestone.milestoneId.toString()}
                                    milestone={milestone}
                                    index={index}
                                    isClient={isClient}
                                    isWorker={isWorker && milestone.worker.toLowerCase() === userAddress?.toLowerCase()}
                                    yellowProofHistory={getYellowProofHistory(Number(milestone.milestoneId))}
                                    revisionFeedback={milestoneRevisionFeedback[Number(milestone.milestoneId)]}
                                    settlementInfo={settlementInfoByMilestone[Number(milestone.milestoneId)]}
                                    clientAddress={projectInfo?.client}
                                    dependencies={depInfo.deps}
                                    areDependenciesCompleted={depInfo.completed}
                                    allMilestones={enhancedMilestones}
                                    onSubmitWork={(id) => {
                                        const m = enhancedMilestones.find(ms => ms.milestoneId === id);
                                        if (m) { setSelectedMilestone(m); setActiveModal('submit'); }
                                    }}
                                    onApprove={(id) => {
                                        const m = enhancedMilestones.find(ms => ms.milestoneId === id);
                                        if (m) { setSelectedMilestone(m); setActiveModal('approve'); }
                                    }}
                                    onRequestRevision={(id) => {
                                        const m = enhancedMilestones.find(ms => ms.milestoneId === id);
                                        if (m) { setSelectedMilestone(m); setActiveModal('revision'); }
                                    }}
                                    onDispute={(id) => {
                                        const m = enhancedMilestones.find(ms => ms.milestoneId === id);
                                        if (m) { setSelectedMilestone(m); setActiveModal('dispute'); }
                                    }}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Etherscan Link */}
            <div className="text-center bg-bg-card border border-gray-800 rounded-xl p-4">
                <p className="text-gray-500 text-xs mb-2">Contract Address</p>
                <a
                    href={`https://sepolia.etherscan.io/address/${escrowAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-400 hover:text-primary-300 text-sm font-mono"
                >
                    View Escrow Contract on Etherscan →
                </a>
            </div>

            {/* Yellow-Enhanced Modals */}
            <YellowSubmitWorkModal
                isOpen={activeModal === 'submit'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); setRevisionFeedback(null); }}
                revisionFeedback={revisionFeedback || undefined}
                onYellowSuccess={async (milestoneId, proofUrl, desc) => {
                    // Update Supabase state after Yellow/demo success (NO on-chain TX)
                    console.log('[ProjectDashboard] 🟡 Yellow success - updating Supabase');
                    if (escrowAddress && userAddress) {
                        try {
                            const milestoneData = await supabaseMilestones.getByProjectAndIndex(
                                escrowAddress,
                                Number(milestoneId)
                            );
                            console.log('[ProjectDashboard] Milestone data from Supabase:', milestoneData);
                            if (milestoneData?.id) {
                                const updateResult = await supabaseMilestones.update(milestoneData.id, {
                                    proof_url: proofUrl,
                                    proof_description: desc,
                                    status: 'submitted',
                                });
                                console.log('[ProjectDashboard] ✅ Milestone status updated to "submitted":', updateResult);
                            } else {
                                console.warn('[ProjectDashboard] ⚠️ Milestone not found in Supabase - using local state only');
                            }
                            const isResubmission = selectedMilestone?.status === 2;
                            await milestoneComms.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                sender_address: userAddress,
                                message_type: isResubmission ? 'resubmission' : 'submission',
                                message: desc || undefined,
                                proof_url: proofUrl,
                                tx_hash: 'yellow-gasless', // Mark as Yellow gasless operation
                            });
                            // Persist to tx_history for permanent record
                            await txHistory.add({
                                escrow_address: escrowAddress,
                                escrow_type: 'freelance',
                                tx_type: isResubmission ? 'yellow_resubmit' : 'yellow_submit',
                                tx_hash: `yellow-${Date.now()}-${milestoneId}`,
                                from_address: userAddress,
                            });
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save Yellow submission to Supabase:', err);
                        }
                    }
                    refetchAll();
                }}
                onSubmitOnChain={async (milestoneId, proofUrl, desc) => {
                    const result = await submitWork(milestoneId, proofUrl, desc);
                    if (result?.hash && escrowAddress && userAddress) {
                        try {
                            const milestoneData = await supabaseMilestones.getByProjectAndIndex(
                                escrowAddress,
                                Number(milestoneId)
                            );
                            if (milestoneData?.id) {
                                await supabaseMilestones.update(milestoneData.id, {
                                    proof_url: proofUrl,
                                    proof_description: desc,
                                    status: 'submitted',
                                });
                            }
                            const isResubmission = selectedMilestone?.status === 2;
                            await milestoneComms.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                sender_address: userAddress,
                                message_type: isResubmission ? 'resubmission' : 'submission',
                                message: desc || undefined,
                                proof_url: proofUrl,
                                tx_hash: result.hash,
                            });
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save to Supabase:', err);
                        }
                    }
                    refetchAll();
                    return { hash: result?.hash };
                }}
            />

            <YellowApproveMilestoneModal
                isOpen={activeModal === 'approve'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); setSubmittedWorkDetails(null); }}
                onYellowSuccess={async (milestoneId) => {
                    // Update Supabase state after Yellow/demo success (NO on-chain TX)
                    console.log('[ProjectDashboard] 🟡 Yellow approve success - updating Supabase');
                    if (escrowAddress) {
                        try {
                            const milestoneData = await supabaseMilestones.getByProjectAndIndex(
                                escrowAddress,
                                Number(milestoneId)
                            );
                            if (milestoneData?.id) {
                                await supabaseMilestones.update(milestoneData.id, {
                                    status: 'approved',
                                });
                            }
                            // Check if all milestones will be approved
                            const willBeCompleted = milestones.filter(m => m.status >= 3).length + 1;
                            const totalMilestones = milestones.length;
                            if (willBeCompleted >= totalMilestones) {
                                await freelanceProjects.updateByEscrow(escrowAddress, {
                                    status: 'completed',
                                });
                            }
                            // Persist to tx_history for permanent record
                            await txHistory.add({
                                escrow_address: escrowAddress,
                                escrow_type: 'freelance',
                                tx_type: 'yellow_approve',
                                tx_hash: `yellow-${Date.now()}-${milestoneId}`,
                                from_address: userAddress || '',
                            });
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save Yellow approval to Supabase:', err);
                        }
                    }
                    refetchAll();
                }}
                onApproveOnChain={async (milestoneId, milestoneAmount) => {
                    const result = await approveMilestone(milestoneId, milestoneAmount);
                    if (result?.hash && escrowAddress) {
                        const willBeCompleted = milestones.filter(m => m.status >= 3).length + 1;
                        const totalMilestones = milestones.length;
                        if (willBeCompleted >= totalMilestones) {
                            await freelanceProjects.updateByEscrow(escrowAddress, {
                                status: 'completed',
                            });
                        }
                    }
                    refetchAll();
                    return { hash: result?.hash };
                }}
                submittedWork={submittedWorkDetails || undefined}
                userRole={isClient ? 'client' : 'worker'}
            />

            <YellowRequestRevisionModal
                isOpen={activeModal === 'revision'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); }}
                onYellowSuccess={async (milestoneId, feedback) => {
                    // Update Supabase state after Yellow/demo success (NO on-chain TX)
                    console.log('[ProjectDashboard] 🟡 Yellow revision success - updating Supabase');
                    if (escrowAddress && userAddress) {
                        try {
                            const milestoneData = await supabaseMilestones.getByProjectAndIndex(
                                escrowAddress,
                                Number(milestoneId)
                            );
                            if (milestoneData?.id) {
                                await supabaseMilestones.update(milestoneData.id, {
                                    status: 'revision_requested',
                                });
                            }
                            await milestoneComms.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                sender_address: userAddress,
                                message_type: 'revision_request',
                                message: feedback,
                                tx_hash: 'yellow-gasless',
                            });
                            // Persist to tx_history for permanent record
                            await txHistory.add({
                                escrow_address: escrowAddress,
                                escrow_type: 'freelance',
                                tx_type: 'yellow_revision',
                                tx_hash: `yellow-${Date.now()}-${milestoneId}`,
                                from_address: userAddress,
                            });
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save Yellow revision to Supabase:', err);
                        }
                    }
                    refetchAll();
                }}
                onSubmitOnChain={async (milestoneId, feedback) => {
                    const result = await requestRevision(milestoneId, feedback);
                    if (result?.hash && escrowAddress && userAddress) {
                        try {
                            await milestoneComms.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                sender_address: userAddress,
                                message_type: 'revision_request',
                                message: feedback,
                                tx_hash: result.hash,
                            });
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save revision request:', err);
                        }
                    }
                    refetchAll();
                    return { hash: result?.hash };
                }}
            />

            <YellowRaiseDisputeModal
                isOpen={activeModal === 'dispute'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); }}
                onYellowSuccess={async (milestoneId, disputeType, reason) => {
                    // Update Supabase state after Yellow/demo success (NO on-chain TX)
                    console.log('[ProjectDashboard] 🟡 Yellow dispute success - updating Supabase');
                    if (escrowAddress && userAddress) {
                        try {
                            const milestoneData = await supabaseMilestones.getByProjectAndIndex(
                                escrowAddress,
                                Number(milestoneId)
                            );
                            if (milestoneData?.id) {
                                await supabaseMilestones.update(milestoneData.id, {
                                    status: 'disputed',
                                });
                            }
                            await supabaseDisputes.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                dispute_type: DISPUTE_TYPE[disputeType as keyof typeof DISPUTE_TYPE] || 'Unknown',
                                reason: reason,
                                raised_by: userAddress,
                                status: 'pending',
                            });
                            await milestoneComms.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                sender_address: userAddress,
                                message_type: 'dispute_raised',
                                message: `[${DISPUTE_TYPE[disputeType as keyof typeof DISPUTE_TYPE] || 'Dispute'}] ${reason}`,
                                tx_hash: 'yellow-gasless',
                            });
                            // Persist to tx_history for permanent record
                            await txHistory.add({
                                escrow_address: escrowAddress,
                                escrow_type: 'freelance',
                                tx_type: 'yellow_dispute',
                                tx_hash: `yellow-${Date.now()}-${milestoneId}`,
                                from_address: userAddress,
                            });
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save Yellow dispute to Supabase:', err);
                        }
                    }
                    refetchAll();
                }}
                onSubmitOnChain={async (milestoneId, disputeType, reason) => {
                    const result = await raiseDispute(milestoneId, disputeType, reason);
                    if (result?.hash && escrowAddress && userAddress) {
                        await supabaseDisputes.create({
                            escrow_address: escrowAddress,
                            milestone_index: Number(milestoneId),
                            dispute_type: DISPUTE_TYPE[disputeType as keyof typeof DISPUTE_TYPE] || 'Unknown',
                            reason: reason,
                            raised_by: userAddress,
                            status: 'pending',
                        });
                        await milestoneComms.create({
                            escrow_address: escrowAddress,
                            milestone_index: Number(milestoneId),
                            sender_address: userAddress,
                            message_type: 'dispute_raised',
                            message: `[${DISPUTE_TYPE[disputeType as keyof typeof DISPUTE_TYPE] || 'Dispute'}] ${reason}`,
                            tx_hash: result.hash,
                        });
                    }
                    refetchAll();
                    return { hash: result?.hash };
                }}
            />

            {/* Settlement Modal */}
            {
                yellow && (
                    <SettleProjectModal
                        isOpen={activeModal === 'settle'}
                        onClose={() => setActiveModal(null)}
                        onSettle={async () => {
                            // YELLOW NETWORK BATCH SETTLEMENT
                            // This is THE ONE on-chain transaction that processes everything:
                            // - Pays workers for all approved milestones
                            // - Refunds client for all cancelled milestones
                            // All in ONE MetaMask transaction!

                            console.log('[Settlement] 🟡 Starting Yellow Network batch settlement...');

                            // CRITICAL: Force refresh Supabase statuses before settlement
                            // to ensure we have the latest state from dispute resolutions
                            let freshStatuses: Record<number, string> = {};
                            try {
                                const allMilestones = await supabaseMilestones.getByProject(escrowAddress!);
                                allMilestones.forEach((m: { milestone_index?: number; status?: string }) => {
                                    if (m.milestone_index !== undefined && m.status) {
                                        freshStatuses[m.milestone_index] = m.status;
                                    }
                                });
                                console.log('[Settlement] 📋 Fresh Supabase statuses:', freshStatuses);
                            } catch (err) {
                                console.error('[Settlement] Failed to fetch fresh statuses, using cached:', err);
                                freshStatuses = supabaseMilestoneStatuses;
                            }

                            console.log('[Settlement] 🟡 Yellow session:', yellow?.activeSession?.sessionId);

                            const approvedMilestoneIds: bigint[] = [];
                            const cancelledMilestoneIds: bigint[] = [];

                            // Track payment details for each milestone
                            interface PaymentDetail {
                                milestoneId: number;
                                description: string;
                                amount: bigint;
                                recipient: string;
                                recipientType: 'worker' | 'client';
                            }
                            const paymentDetails: PaymentDetail[] = [];

                            // Categorize milestones based on Yellow/Supabase state
                            for (const m of enhancedMilestones) {
                                const milestoneId = Number(m.milestoneId);
                                // Use fresh statuses fetched just now, with fallback to cached
                                const supabaseStatus = freshStatuses[milestoneId] || freshStatuses[milestoneId - 1] || supabaseMilestoneStatuses[milestoneId];

                                const yellowMilestone = yellow?.activeSession?.sessionData?.milestones?.find(
                                    (ym: { id: number }) => ym.id === milestoneId
                                );
                                const yellowStatus = yellowMilestone?.status;

                                // CRITICAL: Use _onChainStatus (actual blockchain status), NOT m.status (which is Supabase-enhanced)
                                // m.status = enhanced status from Supabase (e.g., 6 for 'cancelled' from dispute resolution)
                                // m._onChainStatus = actual on-chain status (e.g., 0 for Pending if Yellow-only dispute)
                                const actualOnChainStatus = (m as { _onChainStatus?: number })._onChainStatus ?? m.status;
                                const onChainStatusName = ['Pending', 'Submitted', 'UnderRevision', 'Approved', 'Paid', 'Disputed', 'Cancelled'][actualOnChainStatus] || `Unknown(${actualOnChainStatus})`;
                                const enhancedStatusName = ['Pending', 'Submitted', 'UnderRevision', 'Approved', 'Paid', 'Disputed', 'Cancelled'][m.status] || `Unknown(${m.status})`;

                                console.log(`[Settlement]   #${milestoneId}: ACTUAL on-chain=${onChainStatusName}(${actualOnChainStatus}), enhanced=${enhancedStatusName}(${m.status}), supabase=${supabaseStatus || 'none'}, yellow=${yellowStatus || 'none'}`);

                                // Check if already paid on-chain (actual status 4)
                                if (actualOnChainStatus === 4) {
                                    console.log(`[Settlement]   #${milestoneId}: Already paid on-chain, skipping`);
                                    continue;
                                }

                                // Check if already cancelled/refunded on-chain (actual status 6)
                                if (actualOnChainStatus === 6) {
                                    console.log(`[Settlement]   #${milestoneId}: Already cancelled/refunded on-chain, skipping`);
                                    continue;
                                }

                                // Approved milestones (Yellow or Supabase) → Pay worker
                                const isApproved = supabaseStatus === 'approved' || yellowStatus === 'approved' || supabaseStatus === 'paid';
                                // Cancelled milestones (dispute resolved for client) → Refund client
                                const isCancelled = supabaseStatus === 'cancelled' || yellowStatus === 'cancelled';

                                console.log(`[Settlement]   #${milestoneId}: isApproved=${isApproved}, isCancelled=${isCancelled}`);

                                if (isApproved && !isCancelled) {
                                    console.log(`[Settlement]   #${milestoneId}: → Adding to APPROVED (worker: ${m.worker})`);
                                    approvedMilestoneIds.push(BigInt(milestoneId));
                                    // Worker gets 100% of milestone amount (contract handles fee separately)
                                    paymentDetails.push({
                                        milestoneId,
                                        description: m.description || yellowMilestone?.description || `Milestone ${milestoneId}`,
                                        amount: BigInt(m.amount),
                                        recipient: m.worker,
                                        recipientType: 'worker',
                                    });
                                } else if (isCancelled) {
                                    console.log(`[Settlement]   #${milestoneId}: → Adding to CANCELLED (refund to: ${projectInfo?.client})`);
                                    cancelledMilestoneIds.push(BigInt(milestoneId));
                                    // Client gets refund for cancelled milestones
                                    paymentDetails.push({
                                        milestoneId,
                                        description: m.description || yellowMilestone?.description || `Milestone ${milestoneId}`,
                                        amount: BigInt(m.amount),
                                        recipient: projectInfo?.client || '',
                                        recipientType: 'client',
                                    });
                                } else {
                                    console.log(`[Settlement]   #${milestoneId}: → SKIPPED (neither approved nor cancelled)`);
                                }
                            }

                            console.log(`[Settlement] 💰 Approved milestones (workers get paid):`, approvedMilestoneIds.map(id => id.toString()));
                            console.log(`[Settlement] ❌ Cancelled milestones (client gets refund):`, cancelledMilestoneIds.map(id => id.toString()));
                            console.log(`[Settlement] 📊 Payment details:`, paymentDetails);

                            if (approvedMilestoneIds.length === 0 && cancelledMilestoneIds.length === 0) {
                                console.log('[Settlement] ⚠️ No milestones to settle - all already processed on-chain');
                                await yellow.settleProject();
                                refetchAll();
                                return { success: true };
                            }

                            // Call the batch settlement function - ONE MetaMask transaction!
                            const sessionId = yellow?.activeSession?.sessionId || `session_${Date.now()}`;

                            console.log(`[Settlement] 🚀 Calling settleWithYellowProof()...`);
                            console.log(`[Settlement]   → ${approvedMilestoneIds.length} workers will be paid`);
                            console.log(`[Settlement]   → ${cancelledMilestoneIds.length} refunds to client`);

                            try {
                                const result = await settleWithYellowProof(
                                    approvedMilestoneIds,
                                    cancelledMilestoneIds,
                                    sessionId
                                );

                                console.log(`[Settlement] ✅ Yellow Settlement complete! TX: ${result.hash}`);

                                // Calculate totals for tx_history
                                const workerPayments = paymentDetails.filter(p => p.recipientType === 'worker');
                                const clientRefunds = paymentDetails.filter(p => p.recipientType === 'client');
                                const totalToWorkers = workerPayments.reduce((sum, p) => sum + p.amount, BigInt(0));
                                const totalToClient = clientRefunds.reduce((sum, p) => sum + p.amount, BigInt(0));
                                // 2.5% approval fee per approved milestone
                                const platformFee = workerPayments.reduce((sum, p) => sum + (p.amount * BigInt(25) / BigInt(1000)), BigInt(0));

                                // Store settlement transaction in tx_history
                                await txHistory.add({
                                    escrow_address: escrowAddress!,
                                    escrow_type: 'freelance',
                                    tx_type: 'yellow_settlement',
                                    tx_hash: result.hash,
                                    from_address: userAddress,
                                });

                                console.log(`[Settlement] 📝 TX History saved:`, {
                                    txHash: result.hash,
                                    workerPayments: workerPayments.length,
                                    clientRefunds: clientRefunds.length,
                                    totalToWorkers: totalToWorkers.toString(),
                                    totalToClient: totalToClient.toString(),
                                    platformFee: platformFee.toString(),
                                });

                                // Update settlement info for each milestone (for card footer display)
                                const newSettlementInfo: Record<number, { txHash: string; amount: string; recipientType: 'worker' | 'client' }> = {};
                                for (const payment of paymentDetails) {
                                    newSettlementInfo[payment.milestoneId] = {
                                        txHash: result.hash,
                                        amount: formatEther(payment.amount),
                                        recipientType: payment.recipientType,
                                    };
                                }
                                setSettlementInfoByMilestone(prev => ({ ...prev, ...newSettlementInfo }));

                                // Update Supabase milestone statuses
                                for (const milestoneId of approvedMilestoneIds) {
                                    await supabaseMilestones.updateByEscrowAndIndex(
                                        escrowAddress!,
                                        Number(milestoneId),
                                        { status: 'paid' }
                                    );
                                }

                                // Update cancelled milestones status
                                for (const milestoneId of cancelledMilestoneIds) {
                                    await supabaseMilestones.updateByEscrowAndIndex(
                                        escrowAddress!,
                                        Number(milestoneId),
                                        { status: 'cancelled' }
                                    );
                                }

                                // Update project status to 'completed' so it appears in Completed tab
                                await freelanceProjects.updateByEscrow(escrowAddress!, { status: 'completed' });
                                console.log('[Settlement] ✅ Project status updated to completed');

                                // Close Yellow session
                                await yellow.settleProject();
                                refetchAll();
                                fetchSupabaseMilestoneStatuses();

                                // Return detailed settlement info for the modal
                                return {
                                    success: true,
                                    txHash: result.hash,
                                    paymentDetails: paymentDetails.map(p => ({
                                        ...p,
                                        amount: p.amount.toString(),
                                    })),
                                    totalToWorkers: totalToWorkers.toString(),
                                    totalToClient: totalToClient.toString(),
                                    platformFee: platformFee.toString(),
                                };
                            } catch (error) {
                                console.error('[Settlement] ❌ Settlement failed:', error);
                                throw error;
                            }
                        }}
                        projectName={`Project ${escrowAddress?.slice(0, 8)}...`}
                        milestones={yellow.sessionData?.milestones || []}
                        operationLog={yellow.operationLog}
                        totalAmount={projectInfo?.totalAmount || BigInt(0)}
                        workerAddress={milestones[0]?.worker || ''}
                        isSettling={yellow.isSettling}
                        escrowAddress={escrowAddress}
                        supabaseMilestoneStatuses={supabaseMilestoneStatuses}
                    />
                )
            }
        </div >
    );
}

// Stat card helper component
function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
    return (
        <div className="bg-bg-elevated rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
                <span>{icon}</span>
                <span className="text-xs text-gray-400">{label}</span>
            </div>
            <p className="text-lg font-semibold text-white">{value}</p>
        </div>
    );
}

/**
 * ProjectDashboardWithYellow - Exported component that wraps dashboard in Yellow Provider
 */
export function ProjectDashboardWithYellow() {
    return (
        <YellowProvider showStatusBar={true} autoConnect={true}>
            <ProjectDashboardInner />
        </YellowProvider>
    );
}

export default ProjectDashboardWithYellow;
