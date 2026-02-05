import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import { useFreelanceEscrow, Milestone, DISPUTE_TYPE } from '../hooks/useFreelanceEscrow';
import { MilestoneCard } from '../components/freelance/MilestoneCard';
import { ProjectPhaseBadge, MilestoneProgressBar } from '../components/freelance/MilestoneStatusBadge';
import { SubmitWorkModal, RequestRevisionModal, RaiseDisputeModal, ApproveMilestoneModal } from '../components/freelance/MilestoneActionModals';
import { disputes as supabaseDisputes, freelanceMilestones as supabaseMilestones, milestoneComms, freelanceProjects, txHistory } from '@/lib/supabase';

/**
 * ProjectDashboard - Detailed view of a single freelance escrow project
 * Shows project info, milestones, and actions for client/worker
 */
export function ProjectDashboard() {
    const { address: escrowAddress } = useParams<{ address: string }>();
    const { address: userAddress } = useAccount();
    const [isDepositing, setIsDepositing] = useState(false);
    const [depositTxHash, setDepositTxHash] = useState<string | null>(null);

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
    } = useFreelanceEscrow(escrowAddress as `0x${string}` | undefined);

    // Modal states
    const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
    const [activeModal, setActiveModal] = useState<'submit' | 'approve' | 'revision' | 'dispute' | null>(null);
    
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
                        console.log('[ProjectDashboard] Loaded submitted work:', milestoneData.proof_url);
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

    // Fetch revision feedback when opening submit modal (for worker)
    useEffect(() => {
        const fetchRevisionFeedback = async () => {
            if (activeModal === 'submit' && selectedMilestone && escrowAddress) {
                // Only fetch if milestone is under revision (status 2)
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
                            console.log('[ProjectDashboard] Loaded revision feedback');
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

    // Calculate completed milestones
    const completedMilestones = milestones.filter(m => m.status >= 3).length;

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
                    <a
                        href={`https://sepolia.etherscan.io/address/${escrowAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:text-primary-300 text-sm"
                    >
                        View on Etherscan →
                    </a>
                </div>
            </div>
        );
    }

    // Loading state - only show if actually loading data
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

    // No project info (shouldn't happen if not loading/error, but handle anyway)
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
                    <p className="text-sm text-gray-500 font-mono mt-4">{escrowAddress}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            {/* Breadcrumb */}
            <div className="mb-6">
                <Link to="/freelance" className="text-gray-400 hover:text-white text-sm">
                    ← Back to Freelance Hub
                </Link>
            </div>

            {/* Header */}
            <div className="bg-bg-card border border-gray-800 rounded-xl p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold text-white">Project Dashboard</h1>
                            <ProjectPhaseBadge phase={projectInfo.currentPhase} />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Escrow Contract:</span>
                            <a
                                href={`https://sepolia.etherscan.io/address/${escrowAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-gray-400 font-mono hover:text-primary-400 transition-colors"
                                title="View all project transactions on Etherscan"
                            >
                                {escrowAddress} ↗
                            </a>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                            💡 Click to see deposits, payments, and fee transfers
                        </p>
                    </div>
                    <div className="text-right">
                        {isClient && (
                            <span className="px-2 py-1 bg-primary-500/10 text-primary-400 text-xs rounded-full">
                                👤 You are the Client
                            </span>
                        )}
                        {isWorker && (
                            <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full">
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
                        value={`${milestones.length}`}
                        icon="📋"
                    />
                    <StatCard
                        label="Completed"
                        value={`${completedMilestones}/${milestones.length}`}
                        icon="✅"
                    />
                </div>

                {/* Progress Bar */}
                <MilestoneProgressBar completed={completedMilestones} total={milestones.length} />
            </div>

            {/* Deposit Section (Client Only) - Show if not yet funded (phase 0) */}
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
                                    const result = await depositFunds(projectInfo.totalAmount);
                                    if (result?.hash) {
                                        setDepositTxHash(result.hash);
                                        
                                        // Update project status in Supabase
                                        if (escrowAddress) {
                                            await freelanceProjects.updateByEscrow(escrowAddress, {
                                                status: 'funded',
                                            });
                                            
                                            // Log transaction
                                            await txHistory.create({
                                                escrow_address: escrowAddress,
                                                escrow_type: 'freelance',
                                                tx_type: 'deposit',
                                                tx_hash: result.hash,
                                                from_address: userAddress,
                                            });
                                            console.log('[ProjectDashboard] ✅ Funding recorded to Supabase');
                                        }
                                    }
                                    refetchAll();
                                } catch (err) {
                                    console.error('Deposit failed:', err);
                                }
                                setIsDepositing(false);
                            }}
                            disabled={isDepositing}
                            className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                        >
                            {isDepositing ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Funding...
                                </span>
                            ) : (
                                `💰 Fund Full Amount (${formatEther(projectInfo.totalAmount)} ETH)`
                            )}
                        </button>
                    </div>
                    {depositTxHash && (
                        <div className="mt-4 pt-4 border-t border-yellow-500/20">
                            <a
                                href={`https://sepolia.etherscan.io/tx/${depositTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-400 hover:text-primary-300 text-sm font-mono"
                            >
                                ✅ Funding TX: {depositTxHash.slice(0, 10)}...{depositTxHash.slice(-8)} ↗
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* Milestones Section */}
            <div className="mb-6">
                <h2 className="text-xl font-semibold text-white mb-4">Milestones</h2>
                {milestones.length === 0 ? (
                    <div className="bg-bg-card border border-gray-800 rounded-xl p-8 text-center">
                        <p className="text-gray-400">No milestones yet</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {milestones.map((milestone, index) => (
                            <MilestoneCard
                                key={milestone.milestoneId.toString()}
                                milestone={milestone}
                                index={index}
                                isClient={isClient}
                                isWorker={isWorker && milestone.worker.toLowerCase() === userAddress?.toLowerCase()}
                                onSubmitWork={(id) => {
                                    const m = milestones.find(ms => ms.milestoneId === id);
                                    if (m) { setSelectedMilestone(m); setActiveModal('submit'); }
                                }}
                                onApprove={(id) => {
                                    const m = milestones.find(ms => ms.milestoneId === id);
                                    if (m) { setSelectedMilestone(m); setActiveModal('approve'); }
                                }}
                                onRequestRevision={(id) => {
                                    const m = milestones.find(ms => ms.milestoneId === id);
                                    if (m) { setSelectedMilestone(m); setActiveModal('revision'); }
                                }}
                                onDispute={(id) => {
                                    const m = milestones.find(ms => ms.milestoneId === id);
                                    if (m) { setSelectedMilestone(m); setActiveModal('dispute'); }
                                }}
                            />
                        ))}
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

            {/* Action Modals */}
            <SubmitWorkModal
                isOpen={activeModal === 'submit'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); setRevisionFeedback(null); }}
                revisionFeedback={revisionFeedback || undefined}
                onSubmit={async (milestoneId, proofUrl, desc) => {
                    const result = await submitWork(milestoneId, proofUrl, desc);
                    
                    // Save to Supabase for client visibility AND log communication
                    if (result?.hash && escrowAddress && userAddress) {
                        try {
                            // 1. Update milestone record with proof
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
                            
                            // 2. Log communication (submission or resubmission)
                            const isResubmission = selectedMilestone?.status === 2; // UnderRevision
                            await milestoneComms.create({
                                escrow_address: escrowAddress,
                                milestone_index: Number(milestoneId),
                                sender_address: userAddress,
                                message_type: isResubmission ? 'resubmission' : 'submission',
                                message: desc || undefined,
                                proof_url: proofUrl,
                                tx_hash: result.hash,
                            });
                            console.log('[ProjectDashboard] ✅ Submission logged to communications');
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save to Supabase:', err);
                        }
                    }
                    
                    refetchAll();
                    return { hash: result?.hash };
                }}
            />

            <ApproveMilestoneModal
                isOpen={activeModal === 'approve'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); setSubmittedWorkDetails(null); }}
                onApprove={async (milestoneId, milestoneAmount) => {
                    const result = await approveMilestone(milestoneId, milestoneAmount);
                    
                    // Check if ALL milestones are now completed after this approval
                    // Status 3 = Approved, 4 = Paid - both count as completed
                    if (result?.hash && escrowAddress) {
                        // After approval, check if this was the last milestone
                        // We add 1 because this milestone is now approved but milestones array hasn't refreshed yet
                        const willBeCompleted = milestones.filter(m => m.status >= 3).length + 1;
                        const totalMilestones = milestones.length;
                        
                        if (willBeCompleted >= totalMilestones) {
                            // All milestones completed - update project status
                            await freelanceProjects.updateByEscrow(escrowAddress, {
                                status: 'completed',
                            });
                            console.log('[ProjectDashboard] ✅ Project marked as completed');
                        }
                    }
                    
                    refetchAll();
                    return { hash: result?.hash };
                }}
                submittedWork={submittedWorkDetails || undefined}
            />

            <RequestRevisionModal
                isOpen={activeModal === 'revision'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); }}
                onSubmit={async (milestoneId, feedback) => {
                    const result = await requestRevision(milestoneId, feedback);
                    
                    // Save revision request to communications for worker visibility
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
                            console.log('[ProjectDashboard] ✅ Revision request logged to communications');
                        } catch (err) {
                            console.error('[ProjectDashboard] Failed to save revision request:', err);
                        }
                    }
                    
                    refetchAll();
                    return { hash: result?.hash };
                }}
            />

            <RaiseDisputeModal
                isOpen={activeModal === 'dispute'}
                milestone={selectedMilestone}
                onClose={() => { setActiveModal(null); setSelectedMilestone(null); }}
                onSubmit={async (milestoneId, disputeType, reason) => {
                    const result = await raiseDispute(milestoneId, disputeType, reason);

                    // Save dispute to Supabase for admin panel visibility
                    if (result?.hash && escrowAddress && userAddress) {
                        // 1. Save to disputes table
                        await supabaseDisputes.create({
                            escrow_address: escrowAddress,
                            milestone_index: Number(milestoneId),
                            dispute_type: DISPUTE_TYPE[disputeType as keyof typeof DISPUTE_TYPE] || 'Unknown',
                            reason: reason,
                            raised_by: userAddress,
                            status: 'pending',
                        });
                        
                        // 2. Also log to communications for timeline
                        await milestoneComms.create({
                            escrow_address: escrowAddress,
                            milestone_index: Number(milestoneId),
                            sender_address: userAddress,
                            message_type: 'dispute_raised',
                            message: `[${DISPUTE_TYPE[disputeType as keyof typeof DISPUTE_TYPE] || 'Dispute'}] ${reason}`,
                            tx_hash: result.hash,
                        });
                        
                        console.log('[ProjectDashboard] Dispute saved to Supabase');
                    }

                    refetchAll();
                    return { hash: result?.hash };
                }}
            />
        </div>
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
