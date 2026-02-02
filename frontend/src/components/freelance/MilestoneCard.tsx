import { formatEther } from 'viem';
import { Milestone } from '../../hooks/useFreelanceEscrow';
import { MilestoneStatusBadge } from './MilestoneStatusBadge';
import { useFormattedAddress } from '@/hooks/useENS';

interface MilestoneCardProps {
    milestone: Milestone;
    index: number;
    isClient: boolean;
    isWorker: boolean;
    dependencies?: number[]; // Milestone IDs this depends on
    areDependenciesCompleted?: boolean; // Whether all dependencies are done
    allMilestones?: Milestone[]; // All milestones to show dependency names
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
    onSubmitWork,
    onApprove,
    onRequestRevision,
    onDispute,
}: MilestoneCardProps) {
    const deadline = new Date(Number(milestone.deadline) * 1000);
    const isOverdue = deadline < new Date() && milestone.status < 3;
    const isBlocked = dependencies.length > 0 && !areDependenciesCompleted;
    const canSubmit = isWorker && (milestone.status === 0 || milestone.status === 2) && !isBlocked;
    const canApprove = isClient && milestone.status === 1;
    const canRevise = isClient && milestone.status === 1 &&
        Number(milestone.revisionCount) < Number(milestone.revisionLimit);
    const canDispute = (isClient || isWorker) && milestone.status < 4 && milestone.status !== 5;

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
                        💰 Paid
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

            {/* Transaction Links for Paid Milestones */}
            {milestone.status === 4 && (
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
                    <p className="text-xs text-gray-600 italic">
                        💡 Check "Internal Txns" tab to see escrow → worker transfer
                    </p>
                </div>
            )}
        </div>
    );
}
