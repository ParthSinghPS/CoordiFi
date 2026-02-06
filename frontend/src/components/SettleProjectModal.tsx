/**
 * SettleProjectModal - Final settlement modal for Freelance projects
 * 
 * This is the ONLY on-chain transaction after Yellow integration.
 * Shows:
 * - Summary of all Yellow operations (gasless)
 * - Total gas saved vs traditional approach
 * - Final on-chain settlement transaction
 * - Breakdown of payments to worker
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, 
    Zap, 
    ArrowRight, 
    Check,
    Loader2,
    FileCheck,
    Shield,
    AlertTriangle,
    Clock,
    ExternalLink,
} from 'lucide-react';
import { formatEther } from 'viem';
import { YellowOperationLog } from '../hooks/useYellowSession';
import { YellowMilestone } from '../lib/yellow';

// Payment detail from settlement
export interface SettlementPaymentDetail {
    milestoneId: number;
    description: string;
    amount: string; // String representation of bigint
    recipient: string;
    recipientType: 'worker' | 'client';
}

// Extended settlement result with payment details
export interface SettlementResult {
    success: boolean;
    txHash?: string;
    paymentDetails?: SettlementPaymentDetail[];
    totalToWorkers?: string;
    totalToClient?: string;
    platformFee?: string;
}

interface SettleProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSettle: () => Promise<SettlementResult>;
    projectName: string;
    milestones: YellowMilestone[];
    operationLog: YellowOperationLog[];
    totalAmount: bigint;
    workerAddress: string;
    isSettling: boolean;
    // Additional info for display
    escrowAddress?: string;
    supabaseMilestoneStatuses?: Record<number, string>;
}

export function SettleProjectModal({
    isOpen,
    onClose,
    onSettle,
    projectName,
    milestones,
    operationLog,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    totalAmount: _totalAmount,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    workerAddress: _workerAddress,
    isSettling,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    escrowAddress: _escrowAddress,
    supabaseMilestoneStatuses = {},
}: SettleProjectModalProps) {
    const [step, setStep] = useState<'summary' | 'confirm' | 'processing' | 'complete'>('summary');
    const [txHash, setTxHash] = useState<string | null>(null);
    // Track actual settlement results for completion display
    const [settledMilestones, setSettledMilestones] = useState<{ count: number; totalAmount: bigint }>({ count: 0, totalAmount: BigInt(0) });
    // Store detailed payment breakdown
    const [settlementDetails, setSettlementDetails] = useState<{
        paymentDetails: SettlementPaymentDetail[];
        totalToWorkers: bigint;
        totalToClient: bigint;
        platformFee: bigint;
    } | null>(null);
    
    // Helper: Get effective milestone status (prefers Supabase status for Yellow operations)
    const getEffectiveStatus = (milestone: YellowMilestone): string => {
        const supabaseStatus = supabaseMilestoneStatuses[milestone.id];
        if (supabaseStatus) return supabaseStatus;
        return milestone.status;
    };
    
    // Calculate totals - only count approved milestones, not cancelled ones
    const stats = useMemo(() => {
        const approvedMilestones = milestones.filter(m => {
            const status = getEffectiveStatus(m);
            return status === 'approved';
        });
        const cancelledMilestones = milestones.filter(m => {
            const status = getEffectiveStatus(m);
            return status === 'cancelled';
        });
        
        const totalApproved = approvedMilestones.reduce(
            (sum, m) => sum + BigInt(m.amount), 
            BigInt(0)
        );
        
        const totalCancelled = cancelledMilestones.reduce(
            (sum, m) => sum + BigInt(m.amount), 
            BigInt(0)
        );
        
        const successOps = operationLog.filter(op => op.status === 'success');
        const totalGasSaved = successOps.reduce((sum, op) => {
            const amount = parseFloat(op.gasSaved?.replace(/[^0-9.]/g, '') || '0');
            return sum + amount;
        }, 0);
        
        // Estimate what it would have cost on-chain
        const traditionalTxCount = successOps.length + 1; // +1 for creation
        const avgGasPerTx = 80000;
        const gasPrice = 20; // gwei
        const ethPrice = 2500;
        const traditionalCost = (traditionalTxCount * avgGasPerTx * gasPrice * 1e-9) * ethPrice;
        
        return {
            approvedCount: approvedMilestones.length,
            cancelledCount: cancelledMilestones.length,
            totalMilestones: milestones.length,
            totalApproved,
            totalCancelled,
            operationCount: successOps.length,
            totalGasSaved,
            traditionalCost,
            savingsPercentage: traditionalCost > 0 
                ? ((traditionalCost - 5) / traditionalCost * 100).toFixed(0) // ~$5 for single settlement tx
                : 0,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [milestones, operationLog, JSON.stringify(supabaseMilestoneStatuses)]);
    
    // Handle settlement
    const handleSettle = async () => {
        setStep('processing');
        
        // Store pre-settlement stats for completion display
        const preSettleApproved = milestones.filter(m => {
            const status = getEffectiveStatus(m);
            return status === 'approved';
        });
        const preSettleTotal = preSettleApproved.reduce((sum, m) => sum + BigInt(m.amount), BigInt(0));
        
        try {
            const result = await onSettle();
            
            if (result.success) {
                // Use real TX hash from settlement
                if (result.txHash) {
                    setTxHash(result.txHash);
                }
                // Store the settled milestones count and amount (from pre-settlement)
                setSettledMilestones({ count: preSettleApproved.length, totalAmount: preSettleTotal });
                
                // Store detailed payment breakdown if provided
                if (result.paymentDetails) {
                    setSettlementDetails({
                        paymentDetails: result.paymentDetails,
                        totalToWorkers: BigInt(result.totalToWorkers || '0'),
                        totalToClient: BigInt(result.totalToClient || '0'),
                        platformFee: BigInt(result.platformFee || '0'),
                    });
                }
                
                setStep('complete');
            } else {
                setStep('confirm');
            }
        } catch (error) {
            console.error('Settlement failed:', error);
            setStep('confirm');
        }
    };
    
    if (!isOpen) return null;
    
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-yellow-400/20 rounded-lg">
                                <Zap className="w-5 h-5 text-yellow-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">
                                    Settle Project
                                </h2>
                                <p className="text-zinc-500 text-sm">
                                    {projectName}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    
                    <div className="p-6">
                        {step === 'summary' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {/* Yellow Operations Summary */}
                                <div className="mb-6">
                                    <h3 className="text-zinc-400 text-sm uppercase tracking-wider mb-3">
                                        Yellow Network Summary
                                    </h3>
                                    
                                    <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4">
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-yellow-400">
                                                    {stats.operationCount}
                                                </div>
                                                <div className="text-zinc-500 text-xs">
                                                    Operations
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-green-400">
                                                    ~${stats.totalGasSaved.toFixed(2)}
                                                </div>
                                                <div className="text-zinc-500 text-xs">
                                                    Gas Saved
                                                </div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-2xl font-bold text-blue-400">
                                                    {stats.savingsPercentage}%
                                                </div>
                                                <div className="text-zinc-500 text-xs">
                                                    Cost Reduction
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="text-center text-zinc-400 text-sm">
                                            Traditional approach: {stats.operationCount + 1} transactions (~${stats.traditionalCost.toFixed(2)})
                                            <br />
                                            <span className="text-yellow-400">
                                                With Yellow: 1 transaction (~$5)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Milestone Summary */}
                                <div className="mb-6">
                                    <h3 className="text-zinc-400 text-sm uppercase tracking-wider mb-3">
                                        Milestones
                                    </h3>
                                    
                                    <div className="space-y-2">
                                        {milestones.map((milestone, index) => {
                                            const effectiveStatus = getEffectiveStatus(milestone);
                                            return (
                                            <div
                                                key={milestone.id}
                                                className={`flex items-center justify-between p-3 rounded-lg ${
                                                    effectiveStatus === 'approved'
                                                        ? 'bg-green-500/10 border border-green-500/30'
                                                        : effectiveStatus === 'cancelled'
                                                            ? 'bg-red-500/10 border border-red-500/30'
                                                            : effectiveStatus === 'disputed'
                                                                ? 'bg-orange-500/10 border border-orange-500/30'
                                                                : 'bg-zinc-800 border border-zinc-700'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                        effectiveStatus === 'approved'
                                                            ? 'bg-green-500/20 text-green-400'
                                                            : effectiveStatus === 'cancelled'
                                                                ? 'bg-red-500/20 text-red-400'
                                                                : effectiveStatus === 'disputed'
                                                                    ? 'bg-orange-500/20 text-orange-400'
                                                                    : 'bg-zinc-700 text-zinc-400'
                                                    }`}>
                                                        {effectiveStatus === 'approved' && <Check className="w-4 h-4" />}
                                                        {effectiveStatus === 'cancelled' && <X className="w-4 h-4" />}
                                                        {effectiveStatus === 'disputed' && <AlertTriangle className="w-4 h-4" />}
                                                        {effectiveStatus === 'pending' && <Clock className="w-4 h-4" />}
                                                        {effectiveStatus === 'submitted' && <FileCheck className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-medium">
                                                            Milestone #{index + 1}
                                                        </div>
                                                        <div className="text-zinc-500 text-xs capitalize">
                                                            {effectiveStatus.replace(/_/g, ' ')}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`font-mono ${
                                                    effectiveStatus === 'approved' 
                                                        ? 'text-green-400' 
                                                        : effectiveStatus === 'cancelled'
                                                            ? 'text-red-400 line-through'
                                                            : 'text-zinc-400'
                                                }`}>
                                                    {formatEther(BigInt(milestone.amount))} ETH
                                                </div>
                                            </div>
                                        )})}
                                    </div>
                                </div>
                                
                                {/* Payment Summary */}
                                <div className="bg-zinc-800 rounded-xl p-4 mb-6">
                                    {/* Approved milestones - worker payments */}
                                    {stats.approvedCount > 0 && (
                                        <>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-zinc-400">Total Approved ({stats.approvedCount})</span>
                                                <span className="text-white font-semibold">
                                                    {formatEther(stats.totalApproved)} ETH
                                                </span>
                                            </div>
                                            <div className="border-t border-zinc-700 pt-3 flex items-center justify-between">
                                                <span className="text-white font-medium">Worker Receives</span>
                                                <span className="text-green-400 font-bold text-lg">
                                                    {formatEther(stats.totalApproved)} ETH
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    
                                    {/* Cancelled milestones - client refunds */}
                                    {stats.cancelledCount > 0 && (
                                        <div className={stats.approvedCount > 0 ? "border-t border-zinc-700 pt-3 mt-3" : ""}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-zinc-400">Total Cancelled ({stats.cancelledCount})</span>
                                                <span className="text-orange-400 font-semibold">
                                                    {formatEther(stats.totalCancelled)} ETH
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-medium">Client Refund</span>
                                                <span className="text-orange-400 font-bold text-lg">
                                                    {formatEther(stats.totalCancelled)} ETH
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Platform fee */}
                                    <div className="flex items-center justify-between mt-3 text-xs border-t border-zinc-700 pt-3">
                                        <span className="text-zinc-500">Platform Fee (2.5%)</span>
                                        <span className="text-zinc-500">
                                            {formatEther(stats.totalApproved * BigInt(25) / BigInt(1000))} ETH (paid by client)
                                        </span>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={() => setStep('confirm')}
                                    className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    Continue to Settlement
                                    <ArrowRight className="w-5 h-5" />
                                </button>
                            </motion.div>
                        )}
                        
                        {step === 'confirm' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center"
                            >
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-400/20 flex items-center justify-center">
                                    <Shield className="w-8 h-8 text-yellow-400" />
                                </div>
                                
                                <h3 className="text-xl font-bold text-white mb-2">
                                    Confirm Settlement
                                </h3>
                                
                                <p className="text-zinc-400 mb-6">
                                    This will execute a single on-chain transaction to:
                                </p>
                                
                                <div className="bg-zinc-800 rounded-xl p-4 mb-6 text-left">
                                    <ul className="space-y-2 text-zinc-300">
                                        <li className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-400" />
                                            Finalize all {stats.approvedCount} approved milestones
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-400" />
                                            Transfer {formatEther(stats.totalApproved)} ETH to worker(s)
                                        </li>
                                        {stats.cancelledCount > 0 && (
                                            <li className="flex items-center gap-2">
                                                <Check className="w-4 h-4 text-orange-400" />
                                                Refund {stats.cancelledCount} cancelled milestone(s) to client
                                            </li>
                                        )}
                                        <li className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-400" />
                                            Close Yellow Network session
                                        </li>
                                    </ul>
                                </div>
                                
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setStep('summary')}
                                        className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleSettle}
                                        disabled={isSettling}
                                        className="flex-1 py-3 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        Confirm & Settle
                                    </button>
                                </div>
                            </motion.div>
                        )}
                        
                        {step === 'processing' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-8"
                            >
                                <Loader2 className="w-12 h-12 text-yellow-400 animate-spin mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">
                                    Processing Settlement
                                </h3>
                                <p className="text-zinc-400">
                                    Please confirm the transaction in your wallet...
                                </p>
                            </motion.div>
                        )}
                        
                        {step === 'complete' && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center"
                            >
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-8 h-8 text-green-400" />
                                </div>
                                
                                <h3 className="text-xl font-bold text-white mb-2">
                                    🎉 Settlement Complete!
                                </h3>
                                
                                <p className="text-zinc-400 mb-4">
                                    All payments have been processed on-chain.
                                </p>
                                
                                {/* Detailed Payment Breakdown */}
                                <div className="bg-zinc-800 rounded-xl p-4 mb-4 text-left">
                                    <h4 className="text-zinc-400 text-sm mb-3 flex items-center gap-2">
                                        💸 Payment Breakdown
                                        {txHash && !txHash.startsWith('yellow_') && (
                                            <a 
                                                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-yellow-400 hover:text-yellow-300 text-xs"
                                            >
                                                (view on Etherscan ↗)
                                            </a>
                                        )}
                                    </h4>
                                    
                                    {/* Worker Payments */}
                                    {settlementDetails && settlementDetails.paymentDetails.filter(p => p.recipientType === 'worker').length > 0 && (
                                        <div className="mb-3">
                                            <div className="text-xs text-green-400 uppercase tracking-wider mb-2">Workers Paid</div>
                                            <div className="space-y-2">
                                                {settlementDetails.paymentDetails
                                                    .filter(p => p.recipientType === 'worker')
                                                    .map((payment, idx) => (
                                                        <div key={idx} className="flex items-center justify-between bg-zinc-900/50 rounded-lg p-2">
                                                            <div>
                                                                <div className="text-white text-sm">{payment.description}</div>
                                                                <div className="text-zinc-500 text-xs font-mono">
                                                                    {payment.recipient.slice(0, 6)}...{payment.recipient.slice(-4)}
                                                                </div>
                                                            </div>
                                                            <div className="text-green-400 font-bold">
                                                                {formatEther(BigInt(payment.amount))} ETH
                                                            </div>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Client Refunds */}
                                    {settlementDetails && settlementDetails.paymentDetails.filter(p => p.recipientType === 'client').length > 0 && (
                                        <div className="mb-3">
                                            <div className="text-xs text-orange-400 uppercase tracking-wider mb-2">Refunded to Client</div>
                                            <div className="space-y-2">
                                                {settlementDetails.paymentDetails
                                                    .filter(p => p.recipientType === 'client')
                                                    .map((payment, idx) => (
                                                        <div key={idx} className="flex items-center justify-between bg-zinc-900/50 rounded-lg p-2">
                                                            <div>
                                                                <div className="text-white text-sm">{payment.description} (cancelled)</div>
                                                                <div className="text-zinc-500 text-xs font-mono">
                                                                    {payment.recipient.slice(0, 6)}...{payment.recipient.slice(-4)}
                                                                </div>
                                                            </div>
                                                            <div className="text-orange-400 font-bold">
                                                                {formatEther(BigInt(payment.amount))} ETH
                                                            </div>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Summary totals */}
                                    <div className="border-t border-zinc-700 pt-3 mt-3 space-y-2 text-sm">
                                        {settlementDetails ? (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-zinc-400">Total to Workers:</span>
                                                    <span className="text-green-400 font-bold">
                                                        {formatEther(settlementDetails.totalToWorkers)} ETH
                                                    </span>
                                                </div>
                                                {settlementDetails.totalToClient > BigInt(0) && (
                                                    <div className="flex justify-between">
                                                        <span className="text-zinc-400">Total Refunded:</span>
                                                        <span className="text-orange-400 font-bold">
                                                            {formatEther(settlementDetails.totalToClient)} ETH
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between">
                                                    <span className="text-zinc-400">Platform Fee (2.5%):</span>
                                                    <span className="text-zinc-500">
                                                        {formatEther(settlementDetails.platformFee)} ETH
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-zinc-400">Milestones Settled:</span>
                                                    <span className="text-green-400 font-medium">{settledMilestones.count} approved</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-zinc-400">Total to Worker:</span>
                                                    <span className="text-green-400 font-bold">{formatEther(settledMilestones.totalAmount)} ETH</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Yellow Savings */}
                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4">
                                    <div className="flex items-center justify-center gap-2 mb-2">
                                        <Zap className="w-5 h-5 text-yellow-400" />
                                        <span className="text-yellow-400 font-medium">Yellow Network Savings</span>
                                    </div>
                                    <div className="text-3xl font-bold text-green-400 mb-1">
                                        ~${stats.totalGasSaved.toFixed(2)} saved!
                                    </div>
                                    <div className="text-zinc-500 text-xs">
                                        {stats.operationCount} gasless operations • {stats.savingsPercentage}% cost reduction
                                    </div>
                                </div>
                                
                                {/* Etherscan Link - prominent CTA */}
                                {txHash && !txHash.startsWith('yellow_') && (
                                    <a
                                        href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 text-yellow-400 hover:text-yellow-300 text-sm mb-4 bg-zinc-800 rounded-lg py-3 px-4 border border-yellow-500/30 hover:border-yellow-500/50 transition-all"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        View Full Transaction Details on Etherscan
                                    </a>
                                )}
                                
                                {txHash && txHash.startsWith('yellow_') && (
                                    <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm mb-4 bg-zinc-800 rounded-lg py-3 px-4">
                                        <Zap className="w-4 h-4" />
                                        <span>Settled via Yellow Network (gasless verification)</span>
                                    </div>
                                )}
                                
                                <button
                                    onClick={onClose}
                                    className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-xl transition-colors"
                                >
                                    Done
                                </button>
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default SettleProjectModal;
