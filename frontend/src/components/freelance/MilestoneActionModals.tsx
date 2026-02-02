import { useState } from 'react';
import { Milestone } from '../../hooks/useFreelanceEscrow';
import { formatEther } from 'viem';
import { uploadToIPFS, getIPFSUrl } from '@/lib/pinata';

// =======================
// SUBMIT WORK MODAL
// =======================
interface SubmitWorkModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onSubmit: (milestoneId: bigint, ipfsHash: string, description: string) => Promise<{ hash?: string }>;
    isLoading?: boolean;
    // NEW: Revision feedback from client (if milestone is under revision)
    revisionFeedback?: {
        message?: string;
        requestedAt?: string;
    };
}

export function SubmitWorkModal({ isOpen, milestone, onClose, onSubmit, isLoading, revisionFeedback }: SubmitWorkModalProps) {
    const [proofUrl, setProofUrl] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

    // IPFS upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadingToIPFS, setUploadingToIPFS] = useState(false);
    const [ipfsHash, setIpfsHash] = useState<string | null>(null);

    if (!isOpen || !milestone) return null;


    // Handle IPFS file upload
    const handleFileUpload = async () => {
        if (!selectedFile) return;

        setUploadingToIPFS(true);
        setError(null);

        try {
            const result = await uploadToIPFS(selectedFile, `proof-milestone-${Number(milestone.milestoneId)}`);
            // pinata.ts returns 'cid', not 'ipfsHash'
            if (result.success && result.cid) {
                setIpfsHash(result.cid);
                setProofUrl(getIPFSUrl(result.cid));
                console.log('[SubmitWork] ✅ Uploaded to IPFS:', result.cid);
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
            setError('Please provide a proof link (GitHub, Figma, etc.) or upload a file to IPFS');
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            // Always use the full URL (proofUrl contains gateway URL if uploaded via IPFS)
            const result = await onSubmit(milestone.milestoneId, proofUrl, description);
            if (result?.hash) {
                setSuccessTxHash(result.hash);
            } else {
                setProofUrl('');
                setDescription('');
                setSelectedFile(null);
                setIpfsHash(null);
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit work');
        }
        setSubmitting(false);
    };

    const handleClose = () => {
        setSuccessTxHash(null);
        setProofUrl('');
        setDescription('');
        setSelectedFile(null);
        setIpfsHash(null);
        setError(null);
        onClose();
    };

    // Success screen
    if (successTxHash) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">✅</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Work Submitted!</h2>
                        <p className="text-gray-400 text-sm mb-4">Your work has been submitted for review.</p>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${successTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm font-mono"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="p-6 border-t border-gray-800">
                        <button
                            onClick={handleClose}
                            className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">
                        {milestone.status === 2 ? '🔄 Resubmit Work' : '📤 Submit Work'}
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        {milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}
                    </p>
                </div>

                <div className="p-6 space-y-4">
                    {/* NEW: Show client's revision feedback if milestone is under revision */}
                    {milestone.status === 2 && revisionFeedback?.message && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                            <h3 className="text-yellow-400 font-medium mb-2 flex items-center gap-2">
                                📝 Client's Revision Request
                            </h3>
                            <p className="text-white text-sm bg-bg-card rounded p-3 whitespace-pre-wrap">
                                {revisionFeedback.message}
                            </p>
                            {revisionFeedback.requestedAt && (
                                <p className="text-xs text-gray-500 mt-2">
                                    Requested: {new Date(revisionFeedback.requestedAt).toLocaleString()}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="bg-bg-elevated rounded-lg p-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="text-gray-500">Amount:</span>
                                <span className="ml-2 text-white font-mono">{formatEther(milestone.amount)} ETH</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Revisions:</span>
                                <span className="ml-2 text-white">{Number(milestone.revisionCount)}/{Number(milestone.revisionLimit)}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Proof Link <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="url"
                            value={proofUrl}
                            onChange={(e) => { setProofUrl(e.target.value); setIpfsHash(null); }}
                            placeholder="https://github.com/... or https://figma.com/..."
                            className="w-full px-3 py-2.5 bg-bg-elevated border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:outline-none"
                            disabled={!!ipfsHash}
                        />
                        <p className="text-xs text-gray-500 mt-1">Link to deliverable (GitHub PR, Figma, deployed site, etc.)</p>
                    </div>

                    {/* IPFS File Upload Section */}
                    <div className="border-t border-gray-700 pt-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Or Upload Proof File to IPFS
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="file"
                                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                className="flex-1 px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary-600 file:text-white file:text-xs"
                            />
                            <button
                                onClick={handleFileUpload}
                                disabled={!selectedFile || uploadingToIPFS}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-green-700 transition-colors flex items-center gap-2"
                            >
                                {uploadingToIPFS ? (
                                    <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Uploading...</>
                                ) : (
                                    '📤 Upload'
                                )}
                            </button>
                        </div>
                        {ipfsHash && (
                            <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <p className="text-green-400 text-xs">✅ Uploaded to IPFS</p>
                                <a
                                    href={getIPFSUrl(ipfsHash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary-400 text-xs font-mono hover:underline"
                                >
                                    {ipfsHash.slice(0, 20)}... ↗
                                </a>
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">Upload images, documents, or files as proof of work (stored on IPFS)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Notes (optional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe what was completed..."
                            rows={3}
                            className="w-full px-3 py-2.5 bg-bg-elevated border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:outline-none resize-none"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 p-6 border-t border-gray-800">
                    <button onClick={handleClose} disabled={submitting} className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isLoading}
                        className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>) : '📤 Submit Work'}
                    </button>
                </div>
            </div>
        </div>
    );
}


// =======================
// APPROVE MILESTONE MODAL
// =======================
interface ApproveMilestoneModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onApprove: (milestoneId: bigint, milestoneAmount: bigint) => Promise<{ hash?: string }>;
    isLoading?: boolean;
    // NEW: Submitted work details from Supabase
    submittedWork?: {
        proofUrl?: string;
        proofDescription?: string;
    };
}

export function ApproveMilestoneModal({ isOpen, milestone, onClose, onApprove, isLoading, submittedWork }: ApproveMilestoneModalProps) {
    const [approving, setApproving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

    if (!isOpen || !milestone) return null;

    const handleApprove = async () => {
        setError(null);
        setApproving(true);
        try {
            // Pass milestone amount for 2.5% fee calculation
            const result = await onApprove(milestone.milestoneId, milestone.amount);
            if (result?.hash) {
                setSuccessTxHash(result.hash);
            } else {
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to approve milestone');
        }
        setApproving(false);
    };

    const handleClose = () => {
        setSuccessTxHash(null);
        setError(null);
        onClose();
    };

    // NEW fee structure: client pays 2.5% EXTRA, worker gets 100% from escrow
    const milestoneAmountEth = Number(formatEther(milestone.amount));
    const approvalFee = (milestoneAmountEth * 0.025).toFixed(6);

    // Helper to normalize proof URL (handle case where only CID was stored)
    const normalizeProofUrl = (url: string | undefined): string | undefined => {
        if (!url) return undefined;
        // If it's already a full URL, return as-is
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        // If it looks like a CID (starts with 'bafy' or 'Qm'), convert to gateway URL
        if (url.startsWith('bafy') || url.startsWith('Qm')) {
            return `https://gateway.pinata.cloud/ipfs/${url}`;
        }
        return url;
    };

    const normalizedProofUrl = normalizeProofUrl(submittedWork?.proofUrl);

    // Check if proof is IPFS
    const isIPFS = normalizedProofUrl?.includes('ipfs') || normalizedProofUrl?.includes('gateway.pinata');

    // Success screen
    if (successTxHash) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">💰</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Payment Sent!</h2>
                        <p className="text-gray-400 text-sm mb-2">{formatEther(milestone.amount)} ETH sent to worker (100%)</p>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${successTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm font-mono"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="p-6 border-t border-gray-800">
                        <button onClick={handleClose} className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">Done</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">✅ Approve Milestone</h2>
                    <p className="text-sm text-gray-400 mt-1">{milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}</p>
                </div>

                <div className="p-6 space-y-4">
                    {/* NEW: Worker's Submitted Work Section */}
                    {(normalizedProofUrl || submittedWork?.proofDescription) && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                            <h3 className="text-blue-400 font-medium mb-3 flex items-center gap-2">
                                📦 Worker's Submitted Deliverable
                            </h3>
                            
                            {submittedWork?.proofDescription && (
                                <div className="mb-3">
                                    <span className="text-xs text-gray-500 uppercase">Description / Notes:</span>
                                    <p className="text-white text-sm mt-1 bg-bg-card rounded p-2">
                                        {submittedWork.proofDescription}
                                    </p>
                                </div>
                            )}
                            
                            {normalizedProofUrl && (
                                <div>
                                    <span className="text-xs text-gray-500 uppercase">
                                        {isIPFS ? '📁 IPFS File:' : '🔗 Proof Link:'}
                                    </span>
                                    <a
                                        href={normalizedProofUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1 block text-primary-400 hover:text-primary-300 text-sm break-all bg-bg-card rounded p-2"
                                    >
                                        {normalizedProofUrl} ↗
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    {/* No submitted work warning */}
                    {!normalizedProofUrl && !submittedWork?.proofDescription && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                            <p className="text-yellow-400 text-sm">
                                ⚠️ No deliverable details found in database. The worker may have submitted on-chain only.
                            </p>
                        </div>
                    )}

                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                        <p className="text-green-400 text-sm mb-3">✅ By approving, you confirm the work meets your requirements and authorize payment.</p>
                        <div className="bg-bg-card rounded-lg p-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Worker Receives:</span>
                                <span className="text-green-400 font-mono font-medium">{formatEther(milestone.amount)} ETH (100%)</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-gray-700">
                                <span className="text-yellow-400">You Pay Extra (2.5%):</span>
                                <span className="text-yellow-400 font-mono">{approvalFee} ETH</span>
                            </div>
                            <p className="text-xs text-gray-500">→ This approval fee goes to the platform</p>
                        </div>
                    </div>

                    <div className="bg-bg-elevated rounded-lg p-3">
                        <div className="text-sm">
                            <span className="text-gray-500">Paying to:</span>
                            <p className="text-white font-mono text-xs mt-1 break-all">{milestone.worker}</p>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 p-6 border-t border-gray-800">
                    <button onClick={handleClose} disabled={approving} className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleApprove}
                        disabled={approving || isLoading}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {approving ? (<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Approving...</>) : '✅ Approve & Pay'}
                    </button>
                </div>
            </div>
        </div>
    );
}


// =======================
// REQUEST REVISION MODAL
// =======================
interface RequestRevisionModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onSubmit: (milestoneId: bigint, feedback: string) => Promise<{ hash?: string }>;
    isLoading?: boolean;
}

export function RequestRevisionModal({ isOpen, milestone, onClose, onSubmit, isLoading }: RequestRevisionModalProps) {
    const [feedback, setFeedback] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

    if (!isOpen || !milestone) return null;

    const remainingRevisions = Number(milestone.revisionLimit) - Number(milestone.revisionCount);

    const handleSubmit = async () => {
        if (!feedback.trim()) {
            setError('Please provide feedback for the revision');
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const result = await onSubmit(milestone.milestoneId, feedback);
            if (result?.hash) {
                setSuccessTxHash(result.hash);
            } else {
                setFeedback('');
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to request revision');
        }
        setSubmitting(false);
    };

    const handleClose = () => {
        setSuccessTxHash(null);
        setFeedback('');
        setError(null);
        onClose();
    };

    // Success screen
    if (successTxHash) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🔄</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Revision Requested!</h2>
                        <p className="text-gray-400 text-sm mb-4">Worker has been notified to make changes.</p>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${successTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm font-mono"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="p-6 border-t border-gray-800">
                        <button onClick={handleClose} className="w-full px-4 py-2.5 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700">Done</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md">
                <div className="p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">🔄 Request Revision</h2>
                    <p className="text-sm text-gray-400 mt-1">{milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}</p>
                </div>

                <div className="p-6 space-y-4">
                    <div className={`rounded-lg p-3 ${remainingRevisions <= 1 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-bg-elevated'}`}>
                        <p className={`text-sm ${remainingRevisions <= 1 ? 'text-yellow-400' : 'text-gray-400'}`}>
                            {remainingRevisions <= 1 ? '⚠️' : '📊'} Revisions remaining: <strong className="text-white">{remainingRevisions}</strong>
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Feedback <span className="text-red-400">*</span></label>
                        <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Describe what needs to be changed or improved..."
                            rows={4}
                            className="w-full px-3 py-2.5 bg-bg-elevated border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:outline-none resize-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">Be specific about what needs to change</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 p-6 border-t border-gray-800">
                    <button onClick={handleClose} disabled={submitting} className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isLoading}
                        className="flex-1 px-4 py-2.5 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Requesting...</>) : '🔄 Request Revision'}
                    </button>
                </div>
            </div>
        </div>
    );
}


// =======================
// RAISE DISPUTE MODAL
// =======================
interface RaiseDisputeModalProps {
    isOpen: boolean;
    milestone: Milestone | null;
    onClose: () => void;
    onSubmit: (milestoneId: bigint, disputeType: number, reason: string) => Promise<{ hash?: string }>;
    isLoading?: boolean;
}

const DISPUTE_TYPES = [
    { value: 1, label: 'Quality Issue', emoji: '⚠️', desc: 'Work does not meet quality standards' },
    { value: 2, label: 'Missed Deadline', emoji: '⏰', desc: 'Work was not delivered on time' },
    { value: 3, label: 'Scope Change', emoji: '📋', desc: 'Requirements changed mid-project' },
    { value: 4, label: 'Non-Payment', emoji: '💰', desc: 'Client has not funded the escrow' },
    { value: 5, label: 'Abandonment', emoji: '🚪', desc: 'Party has abandoned the project' },
];

export function RaiseDisputeModal({ isOpen, milestone, onClose, onSubmit, isLoading }: RaiseDisputeModalProps) {
    const [disputeType, setDisputeType] = useState(1);
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

    if (!isOpen || !milestone) return null;

    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError('Please provide a reason for the dispute');
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            const result = await onSubmit(milestone.milestoneId, disputeType, reason);
            if (result?.hash) {
                setSuccessTxHash(result.hash);
            } else {
                setReason('');
                setDisputeType(1);
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to raise dispute');
        }
        setSubmitting(false);
    };

    const handleClose = () => {
        setSuccessTxHash(null);
        setReason('');
        setDisputeType(1);
        setError(null);
        onClose();
    };

    // Success screen
    if (successTxHash) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Dispute Raised!</h2>
                        <p className="text-gray-400 text-sm mb-4">A dispute resolution process has been initiated.</p>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${successTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm font-mono"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="p-6 border-t border-gray-800">
                        <button onClick={handleClose} className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700">Done</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md my-8 max-h-[90vh] flex flex-col">
                {/* Header - fixed at top */}
                <div className="p-6 border-b border-gray-800 flex-shrink-0">
                    <h2 className="text-xl font-bold text-white">⚠️ Raise Dispute</h2>
                    <p className="text-sm text-gray-400 mt-1">{milestone.description || `Milestone #${Number(milestone.milestoneId) + 1}`}</p>
                </div>

                {/* Content - scrollable */}
                <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-red-400 text-sm">⚠️ Disputes are serious. A resolution process will be initiated.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Dispute Type</label>
                        <div className="space-y-2">
                            {DISPUTE_TYPES.map((type) => (
                                <label
                                    key={type.value}
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${disputeType === type.value ? 'bg-red-500/10 border-red-500/50' : 'bg-bg-elevated border-gray-700 hover:border-gray-600'}`}
                                >
                                    <input type="radio" name="disputeType" value={type.value} checked={disputeType === type.value} onChange={() => setDisputeType(type.value)} className="hidden" />
                                    <span className="text-lg">{type.emoji}</span>
                                    <div>
                                        <p className="text-white text-sm font-medium">{type.label}</p>
                                        <p className="text-gray-500 text-xs">{type.desc}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Reason <span className="text-red-400">*</span></label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Explain the issue in detail..."
                            rows={4}
                            className="w-full px-3 py-2.5 bg-bg-elevated border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none resize-none"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                {/* Footer - always visible */}
                <div className="flex gap-3 p-6 border-t border-gray-800 flex-shrink-0 bg-bg-card">
                    <button onClick={handleClose} disabled={submitting} className="flex-1 px-4 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isLoading}
                        className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {submitting ? (<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>) : '⚠️ Raise Dispute'}
                    </button>
                </div>
            </div>
        </div>
    );
}
