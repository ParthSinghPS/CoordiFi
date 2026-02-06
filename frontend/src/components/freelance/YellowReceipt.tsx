/**
 * YellowReceipt - Display verification information for Yellow Network operations
 * 
 * Shows:
 * - Operation type and timestamp
 * - Cryptographic signature (mock in demo mode)
 * - State hash for verification
 * - Signer address
 */

import React from 'react';
import { motion } from 'framer-motion';
import { YellowOperationLog } from '../../hooks/useYellowSession';

interface YellowReceiptProps {
    operation: YellowOperationLog;
    onClose?: () => void;
}

// Format operation type for display
const formatOperationType = (type: string): string => {
    const names: Record<string, string> = {
        session_create: 'Session Created',
        milestone_submit: 'Work Submitted',
        milestone_approve: 'Milestone Approved',
        milestone_revision: 'Revision Requested',
        milestone_dispute: 'Dispute Raised',
        dispute_resolve: 'Dispute Resolved',
        session_close: 'Session Closed',
        session_settle: 'Project Settled',
    };
    return names[type] || type;
};

// Truncate hash for display
const truncateHash = (hash: string, length: number = 16): string => {
    if (!hash) return '—';
    if (hash.length <= length * 2 + 4) return hash;
    return `${hash.slice(0, length + 2)}...${hash.slice(-length)}`;
};

export const YellowReceipt: React.FC<YellowReceiptProps> = ({ operation, onClose }) => {
    const [copied, setCopied] = React.useState<string | null>(null);

    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(field);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-gradient-to-br from-yellow-900/20 to-amber-900/20 border border-yellow-500/30 rounded-xl p-4"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🟡</span>
                    <div>
                        <h3 className="text-yellow-400 font-semibold">Yellow Network Receipt</h3>
                        <p className="text-xs text-gray-400">Gasless Operation Verification</p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Operation Details */}
            <div className="space-y-3">
                {/* Operation Type */}
                <div className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                    <span className="text-gray-400 text-sm">Operation</span>
                    <span className="text-white font-medium flex items-center gap-2">
                        {operation.status === 'success' && <span className="text-green-400">✓</span>}
                        {operation.status === 'failed' && <span className="text-red-400">✗</span>}
                        {operation.status === 'pending' && <span className="text-yellow-400 animate-pulse">●</span>}
                        {formatOperationType(operation.type)}
                    </span>
                </div>

                {/* Timestamp */}
                <div className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                    <span className="text-gray-400 text-sm">Timestamp</span>
                    <span className="text-white font-mono text-sm">
                        {new Date(operation.timestamp).toLocaleString()}
                    </span>
                </div>

                {/* Gas Saved */}
                {operation.gasSaved && (
                    <div className="flex items-center justify-between p-2 bg-green-900/20 rounded-lg border border-green-500/20">
                        <span className="text-green-400 text-sm">💰 Gas Saved</span>
                        <span className="text-green-300 font-semibold">{operation.gasSaved}</span>
                    </div>
                )}

                {/* Yellow Session ID */}
                {operation.yellowSessionId && (
                    <div className="p-2 bg-black/20 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-400 text-sm">📍 Session ID</span>
                            <button
                                onClick={() => copyToClipboard(operation.yellowSessionId!, 'sessionId')}
                                className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors"
                            >
                                {copied === 'sessionId' ? '✓ Copied!' : 'Copy'}
                            </button>
                        </div>
                        <code className="text-xs text-yellow-300/70 font-mono break-all">
                            {truncateHash(operation.yellowSessionId, 16)}
                        </code>
                    </div>
                )}

                {/* State Version */}
                {operation.yellowStateVersion !== undefined && (
                    <div className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                        <span className="text-gray-400 text-sm">📊 State Version</span>
                        <span className="text-blue-400 font-mono font-medium">v{operation.yellowStateVersion}</span>
                    </div>
                )}

                {/* Signer */}
                {operation.signer && (
                    <div className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                        <span className="text-gray-400 text-sm">👤 Signer</span>
                        <a
                            href={`https://sepolia.etherscan.io/address/${operation.signer}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white font-mono text-xs hover:text-yellow-400 transition-colors"
                        >
                            {operation.signer.slice(0, 6)}...{operation.signer.slice(-4)} ↗
                        </a>
                    </div>
                )}

                {/* Milestone/Dispute ID if applicable */}
                {operation.milestoneId !== undefined && (
                    <div className="flex items-center justify-between p-2 bg-black/20 rounded-lg">
                        <span className="text-gray-400 text-sm">📌 Milestone</span>
                        <span className="text-white">#{operation.milestoneId + 1}</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-yellow-500/20">
                <p className="text-xs text-gray-500 text-center">
                    ⚡ Processed via Yellow Network State Channel
                </p>
            </div>
        </motion.div>
    );
};

// Mini receipt for inline display
export const YellowReceiptMini: React.FC<{ operation: YellowOperationLog; onClick?: () => void }> = ({
    operation,
    onClick
}) => {
    return (
        <motion.button
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs hover:bg-yellow-500/20 transition-colors"
        >
            <span className="text-yellow-400">🟡</span>
            <span className="text-gray-300">{formatOperationType(operation.type)}</span>
            {operation.yellowStateVersion !== undefined && (
                <span className="text-yellow-500/50 font-mono">
                    v{operation.yellowStateVersion}
                </span>
            )}
            <span className="text-gray-500">→</span>
        </motion.button>
    );
};

export default YellowReceipt;
