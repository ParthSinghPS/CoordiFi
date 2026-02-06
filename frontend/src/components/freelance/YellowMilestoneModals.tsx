/**
 * YellowMilestoneModals - Yellow-enhanced versions of Milestone Action Modals
 * 
 * These modals use Yellow Network for gasless operations.
 * Each action (submit, approve, revision, dispute) is recorded off-chain via Yellow.
 * Only final settlement triggers an on-chain transaction.
 * 
 * Shows Yellow branding and gas savings for each operation.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatEther } from 'viem';
import {
    Zap,
    Check,
    Loader2,
    FileCheck,
    RefreshCw,
    AlertTriangle,
    DollarSign,
    Upload,
    ExternalLink,
} from 'lucide-react';
import { Milestone } from '../../hooks/useFreelanceEscrow';
import { useYellowOptional } from '../YellowProvider';
import { uploadToIPFS, getIPFSUrl } from '@/lib/pinata';

// Common Yellow branding badge
function YellowBadge() {
    return (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-medium">
            <Zap className="w-3 h-3" />
            Powered by Yellow
        </div>
    );
}

// Gas savings indicator
function GasSavingsIndicator({ amount }: { amount: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg"
        >
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-green-400 text-sm">
                Saved <strong>{amount}</strong> in gas fees
            </span>
        </motion.div>
    );
}

// Yellow verification proof display
function YellowVerificationProof({ yellowSessionId, yellowStateVersion }: { yellowSessionId?: string; yellowStateVersion?: number }) {
    const [copied, setCopied] = useState<string | null>(null);

    const copyToClipboard = async (text: string, field: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(field);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    if (!yellowSessionId && yellowStateVersion === undefined) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg text-left"
        >
            <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-400">🔐</span>
                <span className="text-xs text-yellow-400 font-medium">Yellow Network Proof</span>
            </div>

            {yellowSessionId && (
                <div className="mb-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Session ID</span>
                        <button
                            onClick={() => copyToClipboard(yellowSessionId, 'session')}
                            className="text-[10px] text-yellow-500 hover:text-yellow-400"
                        >
                            {copied === 'session' ? '✓' : 'Copy'}
                        </button>
                    </div>
                    <code className="text-[10px] text-yellow-300/60 font-mono break-all">
                        {yellowSessionId.slice(0, 18)}...{yellowSessionId.slice(-10)}
                    </code>
                </div>
            )}

            {yellowStateVersion !== undefined && (
                <div className="flex items-center justify-between bg-black/20 p-2 rounded">
                    <span className="text-[10px] text-gray-500">State Version</span>
                    <span className="text-[10px] text-blue-400 font-mono font-medium">v{yellowStateVersion}</span>
                </div>
            )}

            <p className="text-[9px] text-gray-600 mt-2 text-center">
                ⚡ State channel proof via Yellow Network
            </p>
        </motion.div>
    );
}

// =======================
// YELLOW SUBMIT WORK MODAL
// =======================
interface YellowSubmitWorkModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    // Falls back to on-chain if Yellow not available
    onSubmitOnChain?: (milestoneId: bigint, ipfsHash: string, description: string) => Promise<{ hash?: string }>;
    // Called after successful Yellow/demo submission to update state
    onYellowSuccess?: (milestoneId: bigint, proofUrl: string, description: string) => Promise<void>;
    isLoading?: boolean;
    revisionFeedback?: {
        message?: string;
        requestedAt?: string;
    };
}

export function YellowSubmitWorkModal({
    isOpen,
    milestone,
    onClose,
    onSubmitOnChain,
    onYellowSuccess,
    isLoading,
    revisionFeedback
}: YellowSubmitWorkModalProps) {
    const yellow = useYellowOptional();

    const [proofUrl, setProofUrl] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [gasSaved, setGasSaved] = useState<string | null>(null);

    // Verification proof from Yellow
    const [verificationProof, setVerificationProof] = useState<{ yellowSessionId?: string; yellowStateVersion?: number } | null>(null);

    // IPFS state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadingToIPFS, setUploadingToIPFS] = useState(false);
    const [ipfsHash, setIpfsHash] = useState<string | null>(null);

    if (!isOpen || !milestone) return null;

    const handleFileUpload = async () => {
        if (!selectedFile) return;
        setUploadingToIPFS(true);
        setError(null);
        try {
            const result = await uploadToIPFS(selectedFile, `proof-milestone-${Number(milestone.milestoneId)}`);
            if (result.success && result.cid) {
                setIpfsHash(result.cid);
                setProofUrl(getIPFSUrl(result.cid));
            } else {
                setError(result.error || 'Failed to upload to IPFS');
            }
        } catch (err: any) {
            setError(err.message || 'IPFS upload failed');
        } finally {
            setUploadingToIPFS(false);
        }
    };

    const handleSubmit = async () => {
        if (!proofUrl.trim()) {
            setError('Please provide a proof link or upload a file');
            return;
        }

        setError(null);
        setSubmitting(true);

        try {
            // Debug: Log Yellow session status
            console.log('[YellowSubmitModal] Yellow context:', !!yellow);
            console.log('[YellowSubmitModal] Session active:', yellow?.isSessionActive);
            console.log('[YellowSubmitModal] Connection state:', yellow?.connectionState);

            // Check if Yellow is available - either connected OR connecting (will wait)
            const yellowAvailable = yellow && (
                yellow.connectionState === 'connected' ||
                yellow.connectionState === 'connecting'
            );

            // If Yellow is available with session, use gasless submission
            const useYellowGasless = yellowAvailable && yellow?.isSessionActive;

            if (useYellowGasless) {
                console.log('[YellowSubmitModal] 🟡 Using REAL Yellow gasless submission');
                console.log('[YellowSubmitModal] 🔄 Connection state: ' + yellow?.connectionState + ' - will wait if connecting');

                let yellowSuccess = false;

                // Try the real submission
                // Note: sendRPC in useYellowAuth will wait for connection if it's "connecting"
                if (yellow?.submitMilestoneWork) {
                    try {
                        yellowSuccess = await yellow.submitMilestoneWork(
                            Number(milestone.milestoneId),
                            proofUrl,
                            proofUrl,      // Pass proofUrl as content
                            description    // Pass description as content
                        );
                        console.log('[YellowSubmitModal] Yellow submission result:', yellowSuccess);
                    } catch (submitError: any) {
                        console.error('[YellowSubmitModal] ❌ Yellow submission error:', submitError.message);
                        // Don't immediately fall back - this is a real error
                        if (submitError.message?.includes('not connected')) {
                            setError('Yellow Network connection lost. Please refresh and try again.');
                            setSubmitting(false);
                            return;
                        }
                    }
                }

                if (yellowSuccess) {
                    // IMPORTANT: Update Supabase state after Yellow success
                    if (onYellowSuccess) {
                        console.log('[YellowSubmitModal] 📝 Updating state via onYellowSuccess callback');
                        await onYellowSuccess(milestone.milestoneId, proofUrl, description);
                    }

                    // Capture verification proof from operation log
                    if (yellow?.operationLog && yellow.operationLog.length > 0) {
                        const lastOp = yellow.operationLog[yellow.operationLog.length - 1];
                        if (lastOp.yellowSessionId || lastOp.yellowStateVersion !== undefined) {
                            setVerificationProof({ yellowSessionId: lastOp.yellowSessionId, yellowStateVersion: lastOp.yellowStateVersion });
                        }
                    }

                    setGasSaved('~$5.20');
                    setSuccess(true);
                    console.log('[YellowSubmitModal] ✅ REAL Yellow submission complete');
                    return;
                }
            }

            // Fallback to on-chain
            if (onSubmitOnChain) {
                console.log('[YellowSubmitModal] ⚠️ Yellow not active, falling back to on-chain');
                console.log('[YellowSubmitModal] 📝 Using on-chain submission (gas required)');
                await onSubmitOnChain(milestone.milestoneId, proofUrl, description);
                setSuccess(true);
            }
        } catch (err: any) {
            console.error('[YellowSubmitModal] ❌ Error:', err);
            setError(err.message || 'Failed to submit work');
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        setProofUrl('');
        setDescription('');
        setSelectedFile(null);
        setIpfsHash(null);
        setError(null);
        setSuccess(false);
        setGasSaved(null);
        setVerificationProof(null);
        onClose();
    };

    // Success screen
    if (success) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 text-center"
                >
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Work Submitted!</h2>
                    <p className="text-zinc-400 text-sm mb-4">Your work has been submitted for review.</p>

                    {gasSaved && (
                        <div className="mb-4">
                            <GasSavingsIndicator amount={gasSaved} />
                        </div>
                    )}

                    {yellow?.isSessionActive && (
                        <div className="mb-4">
                            <YellowBadge />
                            <p className="text-zinc-500 text-xs mt-2">
                                Recorded off-chain • No gas fees paid
                            </p>
                        </div>
                    )}

                    {/* Show verification proof */}
                    {verificationProof && (
                        <YellowVerificationProof
                            yellowSessionId={verificationProof.yellowSessionId}
                            yellowStateVersion={verificationProof.yellowStateVersion}
                        />
                    )}

                    <button
                        onClick={handleClose}
                        className="w-full py-3 mt-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
                    >
                        Done
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <FileCheck className="w-5 h-5 text-blue-400" />
                            {milestone.status === 2 ? 'Resubmit Work' : 'Submit Work'}
                        </h2>
                        {yellow?.isSessionActive && <YellowBadge />}
                    </div>
                    <p className="text-sm text-zinc-400">
                        {milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    {/* Revision feedback */}
                    {milestone.status === 2 && revisionFeedback?.message && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4">
                            <h3 className="text-yellow-400 font-medium mb-2 flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" />
                                Client's Revision Request
                            </h3>
                            <p className="text-white text-sm bg-zinc-800 rounded-lg p-3">
                                {revisionFeedback.message}
                            </p>
                        </div>
                    )}

                    {/* Milestone info */}
                    <div className="bg-zinc-800 rounded-xl p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-zinc-500">Amount:</span>
                                <span className="ml-2 text-white font-mono">
                                    {formatEther(milestone.amount)} ETH
                                </span>
                            </div>
                            <div>
                                <span className="text-zinc-500">Revisions:</span>
                                <span className="ml-2 text-white">
                                    {Number(milestone.revisionCount)}/{Number(milestone.revisionLimit)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Proof URL */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Proof Link <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="url"
                            value={proofUrl}
                            onChange={(e) => { setProofUrl(e.target.value); setIpfsHash(null); }}
                            placeholder="https://github.com/... or https://figma.com/..."
                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-yellow-500 focus:outline-none"
                            disabled={!!ipfsHash}
                        />
                    </div>

                    {/* IPFS Upload */}
                    <div className="border-t border-zinc-700 pt-4">
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Or Upload to IPFS
                        </label>

                        {/* UX Hint - Show if no proof link entered */}
                        {!proofUrl && !ipfsHash && (
                            <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                <p className="text-blue-400 text-xs flex items-center gap-2">
                                    <span>💡</span>
                                    <span><strong>Tip:</strong> Select a file and click the upload button to generate an IPFS proof link before submitting.</span>
                                </p>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <input
                                type="file"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-white file:text-xs"
                            />
                            <button
                                onClick={handleFileUpload}
                                disabled={!selectedFile || uploadingToIPFS}
                                className={`px-4 py-2 text-white rounded-xl text-sm disabled:opacity-50 flex items-center gap-2 ${selectedFile && !ipfsHash
                                    ? 'bg-blue-600 hover:bg-blue-500 animate-pulse'
                                    : 'bg-zinc-700 hover:bg-zinc-600'
                                    }`}
                            >
                                {uploadingToIPFS ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                        {ipfsHash && (
                            <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <p className="text-green-400 text-xs">✅ Uploaded to IPFS</p>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Notes (optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what was completed..."
                            rows={3}
                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-yellow-500 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Yellow info */}
                    {yellow?.isSessionActive && (
                        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                <Zap className="w-4 h-4" />
                                <span>This action will be recorded via Yellow Network (gasless)</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-zinc-800">
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="flex-1 px-4 py-3 text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isLoading}
                        className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <FileCheck className="w-4 h-4" />
                                Submit Work
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}


// =======================
// YELLOW APPROVE MILESTONE MODAL
// =======================
interface YellowApproveMilestoneModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onApproveOnChain?: (milestoneId: bigint, milestoneAmount: bigint) => Promise<{ hash?: string }>;
    onYellowSuccess?: (milestoneId: bigint) => Promise<void>;
    isLoading?: boolean;
    submittedWork?: {
        proofUrl?: string;
        proofDescription?: string;
    };
    userRole: 'client' | 'worker';
}

export function YellowApproveMilestoneModal({
    isOpen,
    milestone,
    onClose,
    onApproveOnChain,
    onYellowSuccess,
    isLoading,
    submittedWork,
    userRole,
}: YellowApproveMilestoneModalProps) {
    const yellow = useYellowOptional();

    const [approving, setApproving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [gasSaved, setGasSaved] = useState<string | null>(null);
    const [verificationProof, setVerificationProof] = useState<{ yellowSessionId?: string; yellowStateVersion?: number } | null>(null);

    if (!isOpen || !milestone) return null;

    const handleApprove = async () => {
        setError(null);
        setApproving(true);

        try {
            // Check if Yellow is available - either connected OR connecting
            const yellowAvailable = yellow && (
                yellow.connectionState === 'connected' ||
                yellow.connectionState === 'connecting'
            );
            const useYellowGasless = yellowAvailable && yellow?.isSessionActive;

            if (useYellowGasless) {
                console.log('[YellowApproveModal] 🟡 Using REAL Yellow gasless approval');

                let yellowSuccess = false;

                if (yellow?.approveMilestoneWork) {
                    try {
                        yellowSuccess = await yellow.approveMilestoneWork(
                            Number(milestone.milestoneId),
                            userRole
                        );
                        console.log('[YellowApproveModal] Yellow approval result:', yellowSuccess);
                    } catch (approveError: any) {
                        console.error('[YellowApproveModal] ❌ Yellow approval error:', approveError.message);
                        if (approveError.message?.includes('not connected')) {
                            setError('Yellow Network connection lost. Please refresh and try again.');
                            setApproving(false);
                            return;
                        }
                    }
                }

                if (yellowSuccess) {
                    // IMPORTANT: Update Supabase state after Yellow success
                    if (onYellowSuccess) {
                        console.log('[YellowApproveModal] 📝 Updating state via onYellowSuccess callback');
                        await onYellowSuccess(milestone.milestoneId);
                    }

                    // Capture verification proof
                    if (yellow?.operationLog && yellow.operationLog.length > 0) {
                        const lastOp = yellow.operationLog[yellow.operationLog.length - 1];
                        if (lastOp.yellowSessionId || lastOp.yellowStateVersion !== undefined) {
                            setVerificationProof({ yellowSessionId: lastOp.yellowSessionId, yellowStateVersion: lastOp.yellowStateVersion });
                        }
                    }

                    setGasSaved('~$4.40');
                    setSuccess(true);
                    console.log('[YellowApproveModal] ✅ REAL Yellow approval complete');
                    return;
                }
            }

            // Fallback to on-chain
            if (onApproveOnChain) {
                console.log('[YellowApproveModal] 📝 Using on-chain approval (gas required)');
                await onApproveOnChain(milestone.milestoneId, milestone.amount);
                setSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to approve milestone');
        } finally {
            setApproving(false);
        }
    };

    const handleClose = () => {
        setError(null);
        setSuccess(false);
        setGasSaved(null);
        setVerificationProof(null);
        onClose();
    };

    // Normalize proof URL
    const normalizeProofUrl = (url: string | undefined): string | undefined => {
        if (!url) return undefined;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('bafy') || url.startsWith('Qm')) {
            return `https://gateway.pinata.cloud/ipfs/${url}`;
        }
        return url;
    };

    const proofUrl = normalizeProofUrl(submittedWork?.proofUrl);

    // Success screen
    if (success) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 text-center"
                >
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Milestone Approved!</h2>

                    {yellow?.isSessionActive ? (
                        <>
                            <p className="text-zinc-400 text-sm mb-4">
                                Your approval has been recorded via Yellow Network.
                            </p>
                            {gasSaved && (
                                <div className="mb-4">
                                    <GasSavingsIndicator amount={gasSaved} />
                                </div>
                            )}
                            <div className="mb-4">
                                <YellowBadge />
                                <p className="text-zinc-500 text-xs mt-2">
                                    Payment will be released when project is settled
                                </p>
                            </div>
                            {/* Show verification proof */}
                            {verificationProof && (
                                <YellowVerificationProof
                                    yellowSessionId={verificationProof.yellowSessionId}
                                    yellowStateVersion={verificationProof.yellowStateVersion}
                                />
                            )}
                        </>
                    ) : (
                        <p className="text-zinc-400 text-sm mb-4">
                            Payment has been sent to the worker.
                        </p>
                    )}

                    <button
                        onClick={handleClose}
                        className="w-full py-3 mt-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
                    >
                        Done
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Check className="w-5 h-5 text-green-400" />
                            Approve Milestone
                        </h2>
                        {yellow?.isSessionActive && <YellowBadge />}
                    </div>
                    <p className="text-sm text-zinc-400">
                        {milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    {/* Submitted work */}
                    {(proofUrl || submittedWork?.proofDescription) && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                            <h3 className="text-blue-400 font-medium mb-3 flex items-center gap-2">
                                <FileCheck className="w-4 h-4" />
                                Worker's Deliverable
                            </h3>

                            {submittedWork?.proofDescription && (
                                <div className="mb-3">
                                    <span className="text-xs text-zinc-500 uppercase">Notes:</span>
                                    <p className="text-white text-sm mt-1 bg-zinc-800 rounded-lg p-3">
                                        {submittedWork.proofDescription}
                                    </p>
                                </div>
                            )}

                            {proofUrl && (
                                <div>
                                    <span className="text-xs text-zinc-500 uppercase">Proof:</span>
                                    <a
                                        href={proofUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm bg-zinc-800 rounded-lg p-3"
                                    >
                                        {proofUrl.slice(0, 50)}...
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Approval info */}
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                        <p className="text-green-400 text-sm mb-3">
                            ✅ By approving, you confirm the work meets your requirements.
                        </p>
                        <div className="bg-zinc-800 rounded-lg p-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">Worker Receives:</span>
                                <span className="text-green-400 font-mono font-medium">
                                    {formatEther(milestone.amount)} ETH
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Yellow info */}
                    {yellow?.isSessionActive && (
                        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-yellow-400 font-medium text-sm">
                                        Gasless Approval via Yellow Network
                                    </p>
                                    <p className="text-zinc-500 text-xs mt-1">
                                        Your approval will be recorded off-chain. Payment will be released
                                        when the project is settled (single on-chain transaction).
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-zinc-800">
                    <button
                        onClick={handleClose}
                        disabled={approving}
                        className="flex-1 px-4 py-3 text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={approving || isLoading}
                        className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {approving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Approving...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Approve
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}


// =======================
// YELLOW REQUEST REVISION MODAL
// =======================
interface YellowRequestRevisionModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onSubmitOnChain?: (milestoneId: bigint, feedback: string) => Promise<{ hash?: string }>;
    onYellowSuccess?: (milestoneId: bigint, feedback: string) => Promise<void>;
    isLoading?: boolean;
}

export function YellowRequestRevisionModal({
    isOpen,
    milestone,
    onClose,
    onSubmitOnChain,
    onYellowSuccess,
    isLoading,
}: YellowRequestRevisionModalProps) {
    const yellow = useYellowOptional();

    const [feedback, setFeedback] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [gasSaved, setGasSaved] = useState<string | null>(null);
    const [verificationProof, setVerificationProof] = useState<{ yellowSessionId?: string; yellowStateVersion?: number } | null>(null);

    if (!isOpen || !milestone) return null;

    const remainingRevisions = Number(milestone.revisionLimit) - Number(milestone.revisionCount);

    const handleSubmit = async () => {
        if (!feedback.trim()) {
            setError('Please provide feedback for the revision');
            return;
        }

        // Check revision limit FIRST - don't allow more revisions than limit
        if (remainingRevisions <= 0) {
            setError(`Revision limit reached (${Number(milestone.revisionLimit)} revisions maximum). Consider approving or raising a dispute.`);
            return;
        }

        setError(null);
        setSubmitting(true);

        try {
            // Check if Yellow is available - either connected OR connecting
            const yellowAvailable = yellow && (
                yellow.connectionState === 'connected' ||
                yellow.connectionState === 'connecting'
            );
            const useYellowGasless = yellowAvailable && yellow?.isSessionActive;

            if (useYellowGasless) {
                console.log('[YellowRevisionModal] 🟡 Using REAL Yellow gasless revision');
                console.log('[YellowRevisionModal] Revision', Number(milestone.revisionCount) + 1, 'of', Number(milestone.revisionLimit));

                let yellowSuccess = false;

                if (yellow?.requestMilestoneRevision) {
                    try {
                        yellowSuccess = await yellow.requestMilestoneRevision(
                            Number(milestone.milestoneId),
                            feedback,
                            Number(milestone.revisionCount) + 1,
                            Number(milestone.revisionLimit) // Pass the limit for enforcement
                        );
                        console.log('[YellowRevisionModal] Yellow revision result:', yellowSuccess);

                        // If Yellow enforced the limit and returned false, show error
                        if (!yellowSuccess) {
                            setError('Revision limit has been reached');
                            setSubmitting(false);
                            return;
                        }
                    } catch (revisionError: any) {
                        console.error('[YellowRevisionModal] ❌ Yellow revision error:', revisionError.message);
                        if (revisionError.message?.includes('not connected')) {
                            setError('Yellow Network connection lost. Please refresh and try again.');
                            setSubmitting(false);
                            return;
                        }
                    }
                }

                if (yellowSuccess) {
                    // IMPORTANT: Update Supabase state after Yellow success
                    if (onYellowSuccess) {
                        console.log('[YellowRevisionModal] 📝 Updating state via onYellowSuccess callback');
                        await onYellowSuccess(milestone.milestoneId, feedback);
                    }

                    // Capture verification proof
                    if (yellow?.operationLog && yellow.operationLog.length > 0) {
                        const lastOp = yellow.operationLog[yellow.operationLog.length - 1];
                        if (lastOp.yellowSessionId || lastOp.yellowStateVersion !== undefined) {
                            setVerificationProof({ yellowSessionId: lastOp.yellowSessionId, yellowStateVersion: lastOp.yellowStateVersion });
                        }
                    }

                    setGasSaved('~$4.80');
                    setSuccess(true);
                    console.log('[YellowRevisionModal] ✅ REAL Yellow revision complete');
                    return;
                }
            }

            // Fallback to on-chain
            if (onSubmitOnChain) {
                console.log('[YellowRevisionModal] 📝 Using on-chain revision (gas required)');
                await onSubmitOnChain(milestone.milestoneId, feedback);
                setSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to request revision');
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        setFeedback('');
        setError(null);
        setSuccess(false);
        setGasSaved(null);
        setVerificationProof(null);
        onClose();
    };

    // Success screen
    if (success) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 text-center"
                >
                    <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <RefreshCw className="w-8 h-8 text-orange-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Revision Requested!</h2>
                    <p className="text-zinc-400 text-sm mb-4">
                        Worker has been notified to make changes.
                    </p>

                    {gasSaved && (
                        <div className="mb-4">
                            <GasSavingsIndicator amount={gasSaved} />
                        </div>
                    )}

                    {yellow?.isSessionActive && (
                        <div className="mb-4">
                            <YellowBadge />
                        </div>
                    )}

                    {/* Show verification proof */}
                    {verificationProof && (
                        <YellowVerificationProof
                            yellowSessionId={verificationProof.yellowSessionId}
                            yellowStateVersion={verificationProof.yellowStateVersion}
                        />
                    )}

                    <button
                        onClick={handleClose}
                        className="w-full py-3 mt-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium transition-colors"
                    >
                        Done
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-orange-400" />
                            Request Revision
                        </h2>
                        {yellow?.isSessionActive && <YellowBadge />}
                    </div>
                    <p className="text-sm text-zinc-400">
                        {milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    {/* Revisions remaining */}
                    <div className={`rounded-xl p-4 ${remainingRevisions <= 1
                        ? 'bg-red-500/10 border border-red-500/20'
                        : 'bg-zinc-800'
                        }`}>
                        <p className={`text-sm ${remainingRevisions <= 1 ? 'text-red-400' : 'text-zinc-400'
                            }`}>
                            {remainingRevisions <= 1 ? '⚠️' : '📊'} Revisions remaining:
                            <strong className="text-white ml-1">{remainingRevisions}</strong>
                        </p>
                    </div>

                    {/* Feedback */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Feedback <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Describe what needs to be changed or improved..."
                            rows={4}
                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-orange-500 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Yellow info */}
                    {yellow?.isSessionActive && (
                        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                <Zap className="w-4 h-4" />
                                <span>This action will be recorded via Yellow Network (gasless)</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-zinc-800">
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="flex-1 px-4 py-3 text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isLoading}
                        className="flex-1 px-4 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Requesting...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-4 h-4" />
                                Request Revision
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}


// =======================
// YELLOW RAISE DISPUTE MODAL
// =======================
interface YellowRaiseDisputeModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onSubmitOnChain?: (milestoneId: bigint, disputeType: number, reason: string) => Promise<{ hash?: string }>;
    onYellowSuccess?: (milestoneId: bigint, disputeType: number, reason: string) => Promise<void>;
    isLoading?: boolean;
}

const DISPUTE_TYPES = [
    { value: 1, label: 'Quality Issue', emoji: '⚠️', desc: 'Work does not meet quality standards' },
    { value: 2, label: 'Missed Deadline', emoji: '⏰', desc: 'Work was not delivered on time' },
    { value: 3, label: 'Scope Change', emoji: '📋', desc: 'Requirements changed mid-project' },
    { value: 4, label: 'Non-Payment', emoji: '💰', desc: 'Client has not funded the escrow' },
    { value: 5, label: 'Abandonment', emoji: '🚪', desc: 'Party has abandoned the project' },
];

export function YellowRaiseDisputeModal({
    isOpen,
    milestone,
    onClose,
    onSubmitOnChain,
    onYellowSuccess,
    isLoading,
}: YellowRaiseDisputeModalProps) {
    const yellow = useYellowOptional();

    const [disputeType, setDisputeType] = useState(1);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [gasSaved, setGasSaved] = useState<string | null>(null);
    const [verificationProof, setVerificationProof] = useState<{ yellowSessionId?: string; yellowStateVersion?: number } | null>(null);

    if (!isOpen || !milestone) return null;

    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError('Please provide a reason for the dispute');
            return;
        }

        setError(null);
        setSubmitting(true);

        try {
            // Check if Yellow is available - either connected OR connecting
            const yellowAvailable = yellow && (
                yellow.connectionState === 'connected' ||
                yellow.connectionState === 'connecting'
            );
            const useYellowGasless = yellowAvailable && yellow?.isSessionActive;

            console.log('[YellowDisputeModal] 🔍 Dispute check:', {
                yellowAvailable,
                connectionState: yellow?.connectionState,
                isSessionActive: yellow?.isSessionActive,
                useYellowGasless,
                hasRaiseMilestoneDispute: !!yellow?.raiseMilestoneDispute,
                hasOnYellowSuccess: !!onYellowSuccess,
            });

            if (useYellowGasless) {
                console.log('[YellowDisputeModal] 🟡 Using REAL Yellow gasless dispute');

                let yellowSuccess = false;

                if (yellow?.raiseMilestoneDispute) {
                    try {
                        yellowSuccess = await yellow.raiseMilestoneDispute(
                            Number(milestone.milestoneId),
                            disputeType,
                            reason
                        );
                        console.log('[YellowDisputeModal] ✅ Yellow dispute result:', yellowSuccess);
                    } catch (disputeError: any) {
                        console.error('[YellowDisputeModal] ❌ Yellow dispute error:', disputeError.message);
                        if (disputeError.message?.includes('not connected')) {
                            setError('Yellow Network connection lost. Please refresh and try again.');
                            setSubmitting(false);
                            return;
                        }
                    }
                } else {
                    console.log('[YellowDisputeModal] ⚠️ No raiseMilestoneDispute function available');
                }

                if (yellowSuccess) {
                    // IMPORTANT: Update Supabase state after Yellow success
                    if (onYellowSuccess) {
                        console.log('[YellowDisputeModal] 📝 Calling onYellowSuccess callback...');
                        await onYellowSuccess(milestone.milestoneId, disputeType, reason);
                        console.log('[YellowDisputeModal] ✅ onYellowSuccess callback complete');
                    } else {
                        console.log('[YellowDisputeModal] ⚠️ No onYellowSuccess callback provided!');
                    }

                    // Capture verification proof
                    if (yellow?.operationLog && yellow.operationLog.length > 0) {
                        const lastOp = yellow.operationLog[yellow.operationLog.length - 1];
                        if (lastOp.yellowSessionId || lastOp.yellowStateVersion !== undefined) {
                            setVerificationProof({ yellowSessionId: lastOp.yellowSessionId, yellowStateVersion: lastOp.yellowStateVersion });
                        }
                    }

                    setGasSaved('~$7.60');
                    setSuccess(true);
                    console.log('[YellowDisputeModal] ✅ Yellow/Demo dispute complete');
                    return;
                }
            }

            // Fallback to on-chain
            if (onSubmitOnChain) {
                console.log('[YellowDisputeModal] 📝 Using on-chain dispute (gas required)');
                await onSubmitOnChain(milestone.milestoneId, disputeType, reason);
                setSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to raise dispute');
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        setReason('');
        setDisputeType(1);
        setError(null);
        setSuccess(false);
        setGasSaved(null);
        setVerificationProof(null);
        onClose();
    };

    // Success screen
    if (success) {
        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 text-center"
                >
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Dispute Raised!</h2>
                    <p className="text-zinc-400 text-sm mb-4">
                        A dispute resolution process has been initiated.
                    </p>

                    {gasSaved && (
                        <div className="mb-4">
                            <GasSavingsIndicator amount={gasSaved} />
                        </div>
                    )}

                    {yellow?.isSessionActive && (
                        <div className="mb-4">
                            <YellowBadge />
                        </div>
                    )}

                    {/* Show verification proof */}
                    {verificationProof && (
                        <YellowVerificationProof
                            yellowSessionId={verificationProof.yellowSessionId}
                            yellowStateVersion={verificationProof.yellowStateVersion}
                        />
                    )}

                    <button
                        onClick={handleClose}
                        className="w-full py-3 mt-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors"
                    >
                        Done
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                            Raise Dispute
                        </h2>
                        {yellow?.isSessionActive && <YellowBadge />}
                    </div>
                    <p className="text-sm text-zinc-400">
                        {milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}
                    </p>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {/* Warning */}
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                        <p className="text-red-400 text-sm">
                            ⚠️ Disputes are serious. A resolution process will be initiated.
                        </p>
                    </div>

                    {/* Dispute type selection */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Dispute Type
                        </label>
                        <div className="space-y-2">
                            {DISPUTE_TYPES.map((type) => (
                                <label
                                    key={type.value}
                                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${disputeType === type.value
                                        ? 'bg-red-500/10 border-red-500/50'
                                        : 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="disputeType"
                                        value={type.value}
                                        checked={disputeType === type.value}
                                        onChange={() => setDisputeType(type.value)}
                                        className="hidden"
                                    />
                                    <span className="text-lg">{type.emoji}</span>
                                    <div>
                                        <p className="text-white text-sm font-medium">{type.label}</p>
                                        <p className="text-zinc-500 text-xs">{type.desc}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Reason <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Explain the issue in detail..."
                            rows={4}
                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-red-500 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Yellow info */}
                    {yellow?.isSessionActive && (
                        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-3">
                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                <Zap className="w-4 h-4" />
                                <span>This action will be recorded via Yellow Network (gasless)</span>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-zinc-800 flex-shrink-0">
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="flex-1 px-4 py-3 text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isLoading}
                        className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="w-4 h-4" />
                                Raise Dispute
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
