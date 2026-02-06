import { formatEther } from 'viem';
import { Milestone } from '../../hooks/useFreelanceEscrow';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';
import { useFormattedAddress } from '@/hooks/useENS';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, History } from 'lucide-react';

// Yellow verification proof for gasless operations
export interface YellowProof {
    operation: string;
    timestamp: number;
    // Yellow Network verifiable proof
    yellowSessionId: string;    // ClearNode's app_session_id (like a tx hash)
    yellowStateVersion: number; // State version at this operation (v1, v2, v3...)
    signer: string;
    gasSaved: string;
    // Additional context
    revisionNumber?: number;
    submissionNumber?: number;
    // Content data
    proofUrl?: string;         // For work submissions
    proofDescription?: string; // For work submissions
    feedbackMessage?: string;  // For revision requests
    disputeReason?: string;    // For disputes
    disputeType?: number;      // For disputes
}

// Settlement info passed from parent
export interface SettlementInfo {
    txHash: string;
    amount: string; // ETH amount received/refunded
    recipientType: 'worker' | 'client';
    timestamp?: number;
}

interface MilestoneCardProps {
    milestone: Milestone;
    index: number;
    isClient: boolean;
    isWorker: boolean;
    dependencies?: number[]; // Milestone IDs this depends on
    areDependenciesCompleted?: boolean; // Whether all dependencies are done
    allMilestones?: Milestone[]; // All milestones to show dependency names
    yellowProofHistory?: YellowProof[]; // ALL verification proofs from Yellow Network (chronological)
    revisionFeedback?: string; // Feedback message from client when revision requested
    settlementInfo?: SettlementInfo; // Settlement transaction info for completed/cancelled milestones
    clientAddress?: string; // Client address for refund display
    onSubmitWork?: (milestoneId: bigint) => void;
    onApprove?: (milestoneId: bigint) => void;
    onRequestRevision?: (milestoneId: bigint) => void;
    onDispute?: (milestoneId: bigint) => void;
}

/**
 * Card component for displaying a single milestone with actions
 */
export function MilestoneCard({
    milestone,
    index,
    isClient,
    isWorker,
    dependencies = [],
    areDependenciesCompleted = true,
    allMilestones = [],
    yellowProofHistory = [],
    revisionFeedback,
    settlementInfo,
    clientAddress,
    onSubmitWork,
    onApprove,
    onRequestRevision,
    onDispute,
}: MilestoneCardProps) {
    const [showHistory, setShowHistory] = useState(false);
    const [expandedProofIndex, setExpandedProofIndex] = useState<number | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const deadline = new Date(Number(milestone.deadline) * 1000);

    // Get the latest proof for the summary
    const latestProof = yellowProofHistory.length > 0 ? yellowProofHistory[yellowProofHistory.length - 1] : null;

    // Calculate total gas saved across all operations
    const totalGasSaved = yellowProofHistory.reduce((acc, proof) => {
        const match = proof.gasSaved.match(/\$([\d.]+)/);
        return acc + (match ? parseFloat(match[1]) : 0);
    }, 0);
    const isOverdue = deadline < new Date() && milestone.status < 3;
    const isBlocked = dependencies.length > 0 && !areDependenciesCompleted;
    const canSubmit = isWorker && (milestone.status === 0 || milestone.status === 2) && !isBlocked;
    const canApprove = isClient && milestone.status === 1;
    const canRevise = isClient && milestone.status === 1 &&
        Number(milestone.revisionCount) < Number(milestone.revisionLimit);
    // Can only dispute if milestone is in progress (0=Pending, 1=Submitted, 2=UnderRevision)
    // Cannot dispute if already Approved (3), Paid (4), or already Disputed (5)
    const canDispute = (isClient || isWorker) && milestone.status >= 0 && milestone.status <= 2;

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    // Format worker address with ENS if available
    const formattedWorker = useFormattedAddress(milestone.worker as `0x${string}`, 6);

    return (
        <div className={`bg-bg-card border ${isOverdue ? 'border-red-500/50' : 'border-gray-800'} rounded-xl p-5 hover:border-primary-500/30 transition-colors`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-600/20 flex items-center justify-center">
                        <span className="text-primary-400 font-bold">{index + 1}</span>
                    </div>
                    <div>
                        <h4 className="font-medium text-white">
                            {milestone.description || `Milestone ${index + 1}`}
                        </h4>
                        <a
                            href={`https://sepolia.etherscan.io/address/${milestone.worker}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-400 font-mono hover:text-primary-400 transition-colors"
                        >
                            Worker: {formattedWorker} ↗
                        </a>
                    </div>
                </div>
                <MilestoneStatusBadge status={milestone.status} />
            </div>

            {/* Details */}
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                <div>
                    <span className="text-gray-500">Amount</span>
                    <p className="text-white font-mono">{formatEther(milestone.amount)} ETH</p>
                </div>
                <div>
                    <span className="text-gray-500">Deadline</span>
                    <p className={`${isOverdue ? 'text-red-400' : 'text-white'}`}>
                        {deadline.toLocaleDateString()}
                    </p>
                </div>
                <div>
                    <span className="text-gray-500">Revisions</span>
                    <p className="text-white">
                        {Number(milestone.revisionCount)}/{Number(milestone.revisionLimit)}
                    </p>
                </div>
            </div>

            {/* Overdue Warning */}
            {isOverdue && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-4">
                    <p className="text-red-400 text-xs">⚠️ This milestone is overdue</p>
                </div>
            )}

            {/* Auto-Approval Timer - Shows for submitted milestones */}
            {milestone.status === 1 && (() => {
                // Auto-approval occurs 7 days after submission (createdAt is when work was submitted)
                const submittedAt = Number(milestone.createdAt) * 1000;
                const autoApproveAt = submittedAt + (7 * 24 * 60 * 60 * 1000); // 7 days in ms
                const now = Date.now();
                const daysRemaining = Math.max(0, Math.ceil((autoApproveAt - now) / (24 * 60 * 60 * 1000)));
                const hoursRemaining = Math.max(0, Math.ceil((autoApproveAt - now) / (60 * 60 * 1000)));

                if (daysRemaining <= 0) {
                    return (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 mb-4">
                            <p className="text-green-400 text-xs">✅ Auto-approval available - milestone can be automatically approved</p>
                        </div>
                    );
                }

                return (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 mb-4">
                        <p className="text-blue-400 text-xs">
                            ⏱️ Auto-approves in {daysRemaining > 1 ? `${daysRemaining} days` : hoursRemaining > 1 ? `${hoursRemaining} hours` : 'less than an hour'} if no action taken
                        </p>
                    </div>
                );
            })()}

            {/* Blocked by Dependencies */}
            {isBlocked && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 mb-4">
                    <p className="text-yellow-400 text-xs">
                        🔒 Waiting for dependencies: {dependencies.map(depId => {
                            const dep = allMilestones.find(m => Number(m.milestoneId) === depId);
                            return dep ? `#${depId} ${dep.description || 'Milestone'}` : `#${depId}`;
                        }).join(', ')}
                    </p>
                </div>
            )}

            {/* Revision Feedback - Show when status is RevisionRequested (2) and there's feedback */}
            {milestone.status === 2 && revisionFeedback && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-orange-400">📝</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-orange-400 text-sm font-medium mb-1">
                                Revision Requested by Client
                            </p>
                            <p className="text-gray-300 text-sm">
                                {revisionFeedback}
                            </p>
                            <p className="text-gray-500 text-xs mt-2">
                                Please review the feedback and submit your updated work.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Yellow Network Transaction History */}
            {yellowProofHistory.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                    {/* Summary Header */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400 text-xs font-medium">🟡 Yellow Network</span>
                            <span className="text-gray-400 text-xs">•</span>
                            <span className="text-green-400 text-xs">💰 Total Saved: ~${totalGasSaved.toFixed(2)}</span>
                        </div>
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors flex items-center gap-1"
                        >
                            <History className="w-3 h-3" />
                            {showHistory ? 'Hide History' : `View History (${yellowProofHistory.length})`}
                            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                    </div>

                    {/* Latest Operation Summary */}
                    {latestProof && !showHistory && (
                        <div className="flex items-center gap-2 text-xs text-gray-400 bg-black/20 rounded-lg px-3 py-2">
                            <Clock className="w-3 h-3" />
                            <span>Latest: <span className="text-yellow-300">{latestProof.operation}</span></span>
                            <span className="text-gray-600">•</span>
                            <span>{new Date(latestProof.timestamp).toLocaleString()}</span>
                        </div>
                    )}

                    {/* Full Transaction History */}
                    {showHistory && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-yellow-500/20">
                            <p className="text-xs text-gray-400 mb-3 flex items-center gap-2">
                                📜 <span>Transaction History ({yellowProofHistory.length} operations)</span>
                            </p>

                            {/* Timeline of operations */}
                            <div className="space-y-2">
                                {yellowProofHistory.map((proof, idx) => (
                                    <div
                                        key={`${proof.timestamp}-${idx}`}
                                        className="bg-black/30 rounded-lg overflow-hidden"
                                    >
                                        {/* Operation Header - Always visible */}
                                        <button
                                            onClick={() => setExpandedProofIndex(expandedProofIndex === idx ? null : idx)}
                                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Timeline indicator */}
                                                <div className="flex flex-col items-center">
                                                    <div className={`w-2 h-2 rounded-full ${proof.operation.includes('Submitted') ? 'bg-blue-400' :
                                                        proof.operation.includes('Approved') ? 'bg-green-400' :
                                                            proof.operation.includes('Revision') ? 'bg-orange-400' :
                                                                proof.operation.includes('Dispute') ? 'bg-red-400' :
                                                                    'bg-yellow-400'
                                                        }`} />
                                                    {idx < yellowProofHistory.length - 1 && (
                                                        <div className="w-0.5 h-4 bg-gray-600 mt-1" />
                                                    )}
                                                </div>

                                                <div className="text-left">
                                                    <span className={`text-xs font-medium ${proof.operation.includes('Submitted') ? 'text-blue-300' :
                                                        proof.operation.includes('Approved') ? 'text-green-300' :
                                                            proof.operation.includes('Revision') ? 'text-orange-300' :
                                                                proof.operation.includes('Dispute') ? 'text-red-300' :
                                                                    'text-yellow-300'
                                                        }`}>
                                                        {proof.operation}
                                                        {/* Show submission/revision number as additional context */}
                                                        {proof.submissionNumber && proof.submissionNumber > 1 && (
                                                            <span className="ml-1 text-gray-400 font-normal">
                                                                (after revision #{proof.submissionNumber - 1})
                                                            </span>
                                                        )}
                                                        {proof.revisionNumber && (
                                                            <span className="ml-1 text-gray-400 font-normal">
                                                                #{proof.revisionNumber}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(proof.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-green-400/70">{proof.gasSaved}</span>
                                                {expandedProofIndex === idx ? (
                                                    <ChevronUp className="w-4 h-4 text-gray-500" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                                )}
                                            </div>
                                        </button>

                                        {/* Expanded Proof Details */}
                                        {expandedProofIndex === idx && (
                                            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-700">
                                                {/* Content Data Section */}
                                                {(proof.proofUrl || proof.proofDescription || proof.feedbackMessage || proof.disputeReason) && (
                                                    <div className="mb-3 pb-2 border-b border-gray-700">
                                                        <p className="text-xs text-gray-500 mb-2">📋 Operation Details:</p>

                                                        {/* Work Submission - Proof URL */}
                                                        {proof.proofUrl && (
                                                            <div className="mb-2">
                                                                <span className="text-xs text-gray-500">Proof URL:</span>
                                                                <a
                                                                    href={proof.proofUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="block text-xs text-primary-400 hover:text-primary-300 truncate mt-1"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {proof.proofUrl} ↗
                                                                </a>
                                                            </div>
                                                        )}

                                                        {/* Work Submission - Description */}
                                                        {proof.proofDescription && (
                                                            <div className="mb-2">
                                                                <span className="text-xs text-gray-500">Description:</span>
                                                                <p className="text-xs text-gray-300 mt-1 bg-black/20 p-2 rounded">
                                                                    {proof.proofDescription}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Revision - Feedback Message */}
                                                        {proof.feedbackMessage && (
                                                            <div className="mb-2">
                                                                <span className="text-xs text-orange-400">Client Feedback:</span>
                                                                <p className="text-xs text-orange-300/80 mt-1 bg-orange-900/20 p-2 rounded">
                                                                    "{proof.feedbackMessage}"
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Dispute - Reason */}
                                                        {proof.disputeReason && (
                                                            <div className="mb-2">
                                                                <span className="text-xs text-red-400">
                                                                    Dispute Type: {proof.disputeType === 0 ? 'Quality' : proof.disputeType === 1 ? 'Deadline' : proof.disputeType === 2 ? 'Scope' : 'Other'}
                                                                </span>
                                                                <p className="text-xs text-red-300/80 mt-1 bg-red-900/20 p-2 rounded">
                                                                    "{proof.disputeReason}"
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <p className="text-xs text-gray-500">🔐 Yellow Network Proof:</p>

                                                {/* Yellow Session ID */}
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-gray-500">Session ID:</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigator.clipboard.writeText(proof.yellowSessionId);
                                                                setCopied(`session-${idx}`);
                                                                setTimeout(() => setCopied(null), 2000);
                                                            }}
                                                            className="text-xs text-primary-400 hover:text-primary-300"
                                                        >
                                                            {copied === `session-${idx}` ? '✓ Copied!' : '📋 Copy'}
                                                        </button>
                                                    </div>
                                                    <code className="block text-xs text-yellow-400 font-mono bg-black/30 p-2 rounded break-all">
                                                        {proof.yellowSessionId?.slice(0, 20)}...{proof.yellowSessionId?.slice(-10)}
                                                    </code>
                                                </div>

                                                {/* State Version */}
                                                <div className="flex items-center justify-between bg-black/30 p-2 rounded">
                                                    <span className="text-xs text-gray-500">State Version:</span>
                                                    <span className="text-xs text-blue-400 font-mono font-medium">
                                                        v{proof.yellowStateVersion}
                                                    </span>
                                                </div>

                                                {/* Signer */}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Signer:</span>
                                                    <a
                                                        href={`https://sepolia.etherscan.io/address/${proof.signer}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-primary-400 hover:text-primary-300 font-mono"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {proof.signer.slice(0, 8)}...{proof.signer.slice(-6)} ↗
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Verification Guide */}
                            <div className="mt-3 pt-2 border-t border-yellow-500/10">
                                <p className="text-xs text-gray-500">
                                    💡 <span className="text-gray-400">Each operation is cryptographically signed.</span> On settlement,
                                    Yellow Network will submit these proofs on-chain to verify the entire milestone workflow.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
                {canSubmit && (
                    <button
                        onClick={() => onSubmitWork?.(milestone.milestoneId)}
                        className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        📤 Submit Work
                    </button>
                )}
                {canApprove && (
                    <button
                        onClick={() => onApprove?.(milestone.milestoneId)}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                    >
                        ✅ Approve
                    </button>
                )}
                {canRevise && (
                    <button
                        onClick={() => onRequestRevision?.(milestone.milestoneId)}
                        className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
                    >
                        🔄 Request Revision
                    </button>
                )}
                {canDispute && (
                    <button
                        onClick={() => onDispute?.(milestone.milestoneId)}
                        className="px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30 transition-colors"
                    >
                        ⚠️ Dispute
                    </button>
                )}
                {milestone.status === 4 && (
                    <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg">
                        🎉 Completed
                    </span>
                )}
                {milestone.status === 5 && (
                    <span className="px-3 py-1.5 bg-red-500/10 text-red-400 text-sm rounded-lg">
                        ⚖️ Under Dispute Review
                    </span>
                )}
                {milestone.status === 6 && (
                    <span className="px-3 py-1.5 bg-gray-500/10 text-gray-400 text-sm rounded-lg">
                        ❌ Cancelled / Refunded
                    </span>
                )}
            </div>

            {/* Settlement Info for Completed Milestones (Worker Paid) */}
            {milestone.status === 4 && settlementInfo && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">💸 Settlement Complete</span>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${settlementInfo.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-green-400 text-sm font-medium">Worker Received</p>
                                <p className="text-xs text-gray-500 font-mono">{formatAddress(milestone.worker)}</p>
                            </div>
                            <p className="text-green-400 font-bold">{settlementInfo.amount} ETH</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Settlement Info for Cancelled Milestones (Client Refunded) */}
            {milestone.status === 6 && settlementInfo && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">💸 Refund Complete</span>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${settlementInfo.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-orange-400 text-sm font-medium">Refunded to Client</p>
                                {clientAddress && <p className="text-xs text-gray-500 font-mono">{formatAddress(clientAddress)}</p>}
                            </div>
                            <p className="text-orange-400 font-bold">{settlementInfo.amount} ETH</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Fallback for status 4 without settlement info (legacy) */}
            {milestone.status === 4 && !settlementInfo && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
                    <p className="text-xs text-gray-500 mb-2">🔗 Verification Links:</p>
                    <div className="flex flex-wrap gap-3">
                        <a
                            href={`https://sepolia.etherscan.io/address/${milestone.worker}#internaltx`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                        >
                            View Worker Payments ↗
                        </a>
                        <span className="text-gray-600">|</span>
                        <a
                            href={`https://sepolia.etherscan.io/address/${milestone.worker}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                        >
                            Worker Wallet: {formatAddress(milestone.worker)} ↗
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
