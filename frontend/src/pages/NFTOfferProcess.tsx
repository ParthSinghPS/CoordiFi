/**
 * NFT Offer Process Page - ENHANCED
 * Complete UX overhaul with:
 * - All phase cards visible (completed ones locked with TX history)
 * - Approval status indicators
 * - Buyer purchase action for APPROVED phase
 * - TX history per phase stored in localStorage
 * - Faster polling and instant UI updates
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { formatEther, encodeFunctionData } from 'viem';
import { ArrowLeft, CheckCircle, AlertTriangle, ExternalLink, Copy, Wallet, ShoppingCart, Check, X } from 'lucide-react';
import { useNFTEscrow } from '../hooks/useNFTEscrow';
import { txToast } from '../lib/toast';
import { TEST_NFT_ABI } from '../lib/contracts';
import { txHistory as supabaseTxHistory, TxHistoryDB, nftListings as supabaseNFT } from '../lib/supabase';

// ========================================
// CONSTANTS
// ========================================
const ETHERSCAN_BASE = 'https://sepolia.etherscan.io';

const PHASES = [
    { id: 1, status: 0, name: 'Escrow Created', description: 'Agreement deployed. Waiting for capital lock.', actor: 'capitalHolder', actorLabel: 'Capital Holder' },
    { id: 2, status: 1, name: 'Capital Locked', description: 'Funds secured. Ready to mint NFT.', actor: 'anyone', actorLabel: 'Anyone' },
    { id: 3, status: 2, name: 'NFT Minted', description: 'NFT in escrow. Both parties must approve sale.', actor: 'both', actorLabel: 'Both Parties' },
    { id: 4, status: 3, name: 'Sale Approved', description: 'Ready for purchase by approved buyer.', actor: 'buyer', actorLabel: 'Approved Buyer' },
    { id: 5, status: 4, name: 'NFT Sold', description: 'NFT transferred. Ready to distribute funds.', actor: 'anyone', actorLabel: 'Anyone' },
    { id: 6, status: 5, name: 'Settled', description: 'All funds distributed. Complete!', actor: 'none', actorLabel: 'N/A' },
];

// TX History type
interface TxHistory {
    deploy?: string;
    deposit?: string;
    mint?: string;
    verify?: string;
    approvalWL?: string;
    approvalCap?: string;
    sale?: string;
    distribute?: string;
}

// ========================================
// HELPERS
// ========================================
const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const isPhaseCompleted = (phaseId: number, currentStatus: number) => {
    const phase = PHASES.find(p => p.id === phaseId);
    return phase ? currentStatus > phase.status : false;
};
const isPhaseCurrent = (phaseId: number, currentStatus: number) => {
    const phase = PHASES.find(p => p.id === phaseId);
    return phase ? currentStatus === phase.status : false;
};

// ========================================
// TX HISTORY STORAGE (Supabase + localStorage fallback)
// ========================================
const getTxHistory = (escrowAddress: string): TxHistory => {
    // Synchronous load from localStorage (for initial render)
    const stored = localStorage.getItem(`nft_tx_${escrowAddress}`);
    return stored ? JSON.parse(stored) : {};
};

const saveTxHistory = async (escrowAddress: string, key: keyof TxHistory, hash: string) => {
    // Save to localStorage immediately for fast UI
    const current = getTxHistory(escrowAddress);
    current[key] = hash;
    localStorage.setItem(`nft_tx_${escrowAddress}`, JSON.stringify(current));

    // Also save to Supabase tx_history table for persistence
    try {
        await supabaseTxHistory.add({
            escrow_address: escrowAddress,
            escrow_type: 'nft',
            tx_type: key,
            tx_hash: hash,
        });
        console.log('[NFT] TX saved to Supabase tx_history:', key, hash.slice(0, 10));
    } catch (err) {
        console.error('[NFT] Failed to save TX to Supabase:', err);
    }

    // Also update the main nft_listings table with status
    try {
        const updates: Record<string, string> = {};

        // Map tx_type to status
        if (key === 'deposit') {
            updates.status = 'deposited';
        } else if (key === 'mint' || key === 'verify') {
            updates.status = 'minted';
        } else if (key === 'approvalWL' || key === 'approvalCap') {
            updates.status = 'approved';
        } else if (key === 'sale') {
            updates.status = 'sold';
        } else if (key === 'distribute') {
            updates.status = 'split';
        }

        if (Object.keys(updates).length > 0) {
            const success = await supabaseNFT.updateByEscrow(escrowAddress, updates);
            if (success) {
                console.log('[NFT] ✅ Updated nft_listings table:', updates);
            } else {
                console.warn('[NFT] ⚠️ Could not update nft_listings - listing may not exist');
            }
        }
    } catch (err) {
        console.error('[NFT] Failed to update nft_listings:', err);
    }
};

// Load TX history from Supabase (async, for hydration)
const loadTxHistoryFromSupabase = async (escrowAddress: string): Promise<TxHistory> => {
    try {
        const records = await supabaseTxHistory.getByEscrow(escrowAddress);
        const history: TxHistory = {};

        for (const record of records) {
            const key = record.tx_type as keyof TxHistory;
            if (key) {
                history[key] = record.tx_hash;
            }
        }

        // Also update localStorage as cache
        if (Object.keys(history).length > 0) {
            localStorage.setItem(`nft_tx_${escrowAddress}`, JSON.stringify(history));
        }

        return history;
    } catch (err) {
        console.error('[NFT] Failed to load TX history from Supabase:', err);
        return getTxHistory(escrowAddress); // Fallback to localStorage
    }
};

// Sync status back to nft_listings so main page shows correct category
const syncStatusToListings = (escrowAddress: string, newStatus: number) => {
    try {
        const stored = localStorage.getItem('nft_listings');
        if (!stored) return;

        const listings = JSON.parse(stored);
        const updated = listings.map((l: any) => {
            if (l.escrowAddress?.toLowerCase() === escrowAddress.toLowerCase()) {
                return { ...l, status: newStatus };
            }
            return l;
        });

        localStorage.setItem('nft_listings', JSON.stringify(updated));
        console.log('[NFT] Synced status to listings:', escrowAddress, 'status:', newStatus);
    } catch (e) {
        console.error('[NFT] Failed to sync status:', e);
    }
};

// ========================================
// TX LINK COMPONENT
// ========================================
const TxLink = ({ hash, label }: { hash?: string; label: string }) => {
    if (!hash) return null;
    return (
        <a
            href={`${ETHERSCAN_BASE}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
        >
            ✓ {label}: {hash.slice(0, 10)}...
            <ExternalLink className="w-3 h-3" />
        </a>
    );
};

// ========================================
// PHASE CARD COMPONENT (Reusable, with Locked State)
// ========================================
interface PhaseCardProps {
    phaseId: number;
    title: string;
    description?: string;
    isCompleted: boolean;
    isCurrent: boolean;
    txHistory?: { label: string; hash?: string; explanation?: string }[];
    children?: React.ReactNode;
    lockedContent?: React.ReactNode; // Content to show when completed (with locked visual)
}

const PhaseCard = ({ phaseId, title, description, isCompleted, isCurrent, txHistory, children, lockedContent }: PhaseCardProps) => {
    const [isExpanded, setIsExpanded] = useState(!isCompleted); // Completed cards start collapsed

    if (!isCompleted && !isCurrent) return null; // Don't show future phases

    // Filter out empty TX entries
    const validTxHistory = txHistory?.filter(tx => tx.hash) || [];

    return (
        <div
            id={`phase-card-${phaseId}`}
            className={`rounded-lg border transition-all ${isCompleted
                ? 'bg-bg-card border-gray-700 hover:border-gray-600'
                : 'bg-bg-elevated border-primary-500/50'
                }`}
        >
            {/* Header - Clickable for completed phases */}
            <div
                className={`flex items-center justify-between p-4 ${isCompleted ? 'cursor-pointer' : ''}`}
                onClick={() => isCompleted && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    {isCompleted ? (
                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                        </div>
                    ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-primary-400 flex items-center justify-center animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-primary-400" />
                        </div>
                    )}
                    <h3 className={`font-medium ${isCompleted ? 'text-gray-300' : 'text-white'}`}>
                        {title}
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    {isCompleted && validTxHistory.length > 0 && (
                        <span className="text-xs text-gray-500">
                            {validTxHistory.length} TX{validTxHistory.length > 1 ? 's' : ''}
                        </span>
                    )}
                    {isCompleted && (
                        <div className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    )}
                    {isCurrent && !isCompleted && (
                        <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                            Active
                        </span>
                    )}
                </div>
            </div>

            {/* Body - Collapsible for completed, always open for current */}
            {(isExpanded || isCurrent) && (
                <div className="px-4 pb-4 border-t border-gray-800">
                    {/* TX History for completed phases */}
                    {isCompleted && validTxHistory.length > 0 && (
                        <div className="mt-3 space-y-2">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Transaction History</div>
                            <div className="space-y-3 bg-bg-dark/50 rounded-lg p-3">
                                {validTxHistory.map((tx, i) => (
                                    <div key={i} className="space-y-1">
                                        <TxLink hash={tx.hash} label={tx.label} />
                                        {tx.explanation && (
                                            <p className="text-xs text-gray-500 ml-4">{tx.explanation}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Locked content for completed phases */}
                    {isCompleted && lockedContent && (
                        <div className="mt-3 relative">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Action Details</div>
                            <div className="opacity-60 pointer-events-none">
                                {lockedContent}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                                <span className="text-xs bg-gray-700 text-gray-300 px-3 py-1 rounded-full flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3 text-green-400" />
                                    Completed
                                </span>
                            </div>
                        </div>
                    )}

                    {/* No TX and no locked content */}
                    {isCompleted && validTxHistory.length === 0 && !lockedContent && (
                        <div className="mt-3 text-sm text-gray-500 italic">
                            No transaction history recorded
                        </div>
                    )}

                    {/* Description for current phase */}
                    {description && isCurrent && !isCompleted && (
                        <p className="text-sm text-gray-400 mt-3 mb-4">{description}</p>
                    )}

                    {/* Action content for current phase */}
                    {isCurrent && !isCompleted && (
                        <div className="mt-3">
                            {children}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ========================================
// MAIN COMPONENT
// ========================================
export function NFTOfferProcess() {
    const { escrowAddress } = useParams<{ escrowAddress: string }>();
    const navigate = useNavigate();
    const { address: userAddress, isConnected } = useAccount();

    const {
        details,
        approvalStatus,
        isWLHolder,
        isCapitalHolder,
        isParticipant,
        isExpired,
        isLoading,
        deposit,
        executeMint,
        verifyMint,
        approveSale,
        executeSale,
        distributeSale,
        refetchAll,
    } = useNFTEscrow(escrowAddress as `0x${string}` | undefined);

    // Local state
    const [tokenId, setTokenId] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [buyerAddress, setBuyerAddress] = useState('');
    const [txHistory, setTxHistory] = useState<TxHistory>({});

    // Load TX history on mount (localStorage first, then Supabase for persistence)
    useEffect(() => {
        if (escrowAddress) {
            // Immediate load from localStorage for fast render
            setTxHistory(getTxHistory(escrowAddress));

            // Then hydrate from Supabase for any persisted data
            loadTxHistoryFromSupabase(escrowAddress).then(history => {
                if (Object.keys(history).length > 0) {
                    setTxHistory(history);
                }
            });
        }
    }, [escrowAddress]);

    // Poll for updates (faster during active phases)
    useEffect(() => {
        const interval = setInterval(() => {
            refetchAll();
        }, 5000); // 5 second polling
        return () => clearInterval(interval);
    }, [refetchAll]);

    // ========================================
    // ACTION HANDLERS
    // ========================================
    const handleDeposit = async () => {
        if (!isCapitalHolder) {
            txToast.access.notCapitalHolder();
            return;
        }
        const toastId = txToast.nft.depositPending();
        try {
            const result = await deposit();
            saveTxHistory(escrowAddress!, 'deposit', result.hash);
            setTxHistory(prev => ({ ...prev, deposit: result.hash }));
            txToast.update(toastId, true, 'Capital locked!', result.hash);
            await refetchAll();
        } catch (error) {
            console.error('[NFT] Deposit failed:', error);
            txToast.update(toastId, false, 'Deposit failed.');
        }
    };

    const handleMint = async () => {
        const toastId = txToast.nft.mintPending();
        try {
            const mintData = encodeFunctionData({
                abi: TEST_NFT_ABI,
                functionName: 'publicMint',
                args: [],
            });
            const result = await executeMint(mintData);
            saveTxHistory(escrowAddress!, 'mint', result.hash);
            setTxHistory(prev => ({ ...prev, mint: result.hash }));
            txToast.update(toastId, true, 'NFT minted!', result.hash);
            await refetchAll();
        } catch (error) {
            console.error('[NFT] Mint failed:', error);
            txToast.update(toastId, false, 'Mint failed.');
        }
    };

    const handleVerify = async () => {
        if (!tokenId) {
            txToast.warning('Please enter the Token ID');
            return;
        }
        const toastId = txToast.nft.verifyPending();
        try {
            const result = await verifyMint(BigInt(tokenId));
            saveTxHistory(escrowAddress!, 'verify', result.hash);
            setTxHistory(prev => ({ ...prev, verify: result.hash }));
            txToast.update(toastId, true, 'NFT verified!', result.hash);
            await refetchAll();
        } catch (error) {
            console.error('[NFT] Verify failed:', error);
            txToast.update(toastId, false, 'Verification failed.');
        }
    };

    const handleApprove = async () => {
        if (!isParticipant) {
            txToast.access.notParticipant();
            return;
        }
        if (!salePrice || !buyerAddress) {
            txToast.warning('Enter sale price and buyer address');
            return;
        }
        const toastId = txToast.nft.approvePending();
        try {
            const result = await approveSale(salePrice, buyerAddress as `0x${string}`);
            const key = isWLHolder ? 'approvalWL' : 'approvalCap';
            saveTxHistory(escrowAddress!, key, result.hash);
            setTxHistory(prev => ({ ...prev, [key]: result.hash }));
            txToast.update(toastId, true, 'Approval submitted!', result.hash);
            await refetchAll();
        } catch (error) {
            console.error('[NFT] Approval failed:', error);
            txToast.update(toastId, false, 'Approval failed.');
        }
    };

    const handleBuy = async () => {
        if (!approvalStatus.approvedSalePrice) {
            txToast.warning('No sale price set');
            return;
        }
        const toastId = txToast.info('Processing purchase...');
        try {
            const result = await executeSale(approvalStatus.approvedSalePrice);
            saveTxHistory(escrowAddress!, 'sale', result.hash);
            setTxHistory(prev => ({ ...prev, sale: result.hash }));
            txToast.update(toastId, true, 'NFT purchased!', result.hash);
            await refetchAll();
        } catch (error) {
            console.error('[NFT] Purchase failed:', error);
            txToast.update(toastId, false, 'Purchase failed.');
        }
    };

    const handleDistribute = async () => {
        const toastId = txToast.nft.distributePending();
        try {
            const result = await distributeSale();
            saveTxHistory(escrowAddress!, 'distribute', result.hash);
            setTxHistory(prev => ({ ...prev, distribute: result.hash }));
            txToast.update(toastId, true, 'Funds distributed!', result.hash);
            // Sync status to 5 (SPLIT/completed) so main page shows in Completed tab
            syncStatusToListings(escrowAddress!, 5);
            await refetchAll();
        } catch (error) {
            console.error('[NFT] Distribute failed:', error);
            txToast.update(toastId, false, 'Distribution failed.');
        }
    };

    // ========================================
    // RENDER
    // ========================================
    if (!escrowAddress) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-white mb-4">Invalid Escrow Address</h1>
                <Link to="/nft-whitelist" className="text-primary-400 hover:underline">← Back to NFT Whitelist</Link>
            </div>
        );
    }

    const currentStatus = details?.status ?? 0;
    const userRole = isWLHolder ? 'WL Holder' : isCapitalHolder ? 'Capital Holder' : 'Observer';
    const isBuyer = approvalStatus.approvedMarketplace?.toLowerCase() === userAddress?.toLowerCase();

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            {/* Back Button */}
            <button
                onClick={() => navigate('/nft-whitelist')}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to NFT Whitelist
            </button>

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">NFT Escrow Process</h1>
                    <div className="flex items-center gap-3">
                        <span className="text-gray-400 font-mono text-sm">{formatAddress(escrowAddress)}</span>
                        <button
                            onClick={() => { navigator.clipboard.writeText(escrowAddress); txToast.info('Copied!'); }}
                            className="text-gray-500 hover:text-white"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <a
                            href={`${ETHERSCAN_BASE}/address/${escrowAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-400 hover:text-primary-300"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </div>
                <div className={`px-4 py-2 rounded-lg border ${isParticipant || isBuyer ? 'border-green-500 bg-green-500/10' : 'border-yellow-500 bg-yellow-500/10'
                    }`}>
                    <span className={`text-sm font-medium ${isParticipant || isBuyer ? 'text-green-400' : 'text-yellow-400'}`}>
                        {isBuyer ? 'Approved Buyer' : userRole}
                    </span>
                </div>
            </div>

            {/* Access Warning */}
            {!isParticipant && !isBuyer && isConnected && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-8">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                        <div>
                            <h3 className="font-semibold text-yellow-400">View Only</h3>
                            <p className="text-gray-300 text-sm mt-1">
                                You are not a participant in this escrow.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left: Phase Timeline */}
                <div className="lg:col-span-1">
                    <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-white mb-6">Process Phases</h2>
                        <div className="space-y-1">
                            {PHASES.map((phase, index) => {
                                const completed = isPhaseCompleted(phase.id, currentStatus);
                                const current = isPhaseCurrent(phase.id, currentStatus);

                                return (
                                    <div
                                        key={phase.id}
                                        className={`relative ${(completed || current) ? 'cursor-pointer' : ''}`}
                                        onClick={() => {
                                            // Scroll to the phase card on the right
                                            const card = document.getElementById(`phase-card-${phase.id}`);
                                            if (card) {
                                                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                // Briefly highlight
                                                card.classList.add('ring-2', 'ring-primary-400');
                                                setTimeout(() => card.classList.remove('ring-2', 'ring-primary-400'), 2000);
                                            }
                                        }}
                                    >
                                        {index < PHASES.length - 1 && (
                                            <div className={`absolute left-4 top-10 w-0.5 h-12 ${completed ? 'bg-green-500' : current ? 'bg-primary-500' : 'bg-gray-700'
                                                }`} />
                                        )}
                                        <div className={`flex items-start gap-4 p-3 rounded-lg transition-colors ${current ? 'bg-primary-500/10 border border-primary-500/30' :
                                            completed ? 'hover:bg-gray-800/50' : ''
                                            }`}>
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${completed ? 'bg-green-500' :
                                                current ? 'bg-primary-500 animate-pulse' :
                                                    'bg-gray-700'
                                                }`}>
                                                {completed ? (
                                                    <CheckCircle className="w-5 h-5 text-white" />
                                                ) : (
                                                    <span className="text-white font-medium text-sm">{phase.id}</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className={`font-medium ${completed ? 'text-gray-400' :
                                                    current ? 'text-white' :
                                                        'text-gray-500'
                                                    }`}>
                                                    {phase.name}
                                                </h3>
                                                {current && (
                                                    <p className="text-sm text-gray-400 mt-1">{phase.description}</p>
                                                )}
                                                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${completed ? 'bg-gray-700 text-gray-400' :
                                                    current ? 'bg-primary-500/20 text-primary-400' :
                                                        'bg-gray-800 text-gray-500'
                                                    }`}>
                                                    {phase.actorLabel}
                                                </span>
                                                {(completed || current) && (
                                                    <span className="text-xs text-primary-400 ml-2">→ Click to view</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: All Phase Cards */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Phase 1: Deposit */}
                    <PhaseCard
                        phaseId={1}
                        title="Phase 1: Lock Capital"
                        description={`Deposit ${details ? formatEther(details.mintPrice) : '...'} ETH`}
                        isCompleted={isPhaseCompleted(1, currentStatus)}
                        isCurrent={isPhaseCurrent(1, currentStatus)}
                        txHistory={[{ label: 'Deposit', hash: txHistory.deposit, explanation: 'Capital locked in escrow by the investor. Funds secured for mint.' }]}
                    >
                        <div className="space-y-3">
                            <div className="text-sm text-gray-500">
                                <div>→ ETH locked in escrow</div>
                                <div>→ Enables mint execution</div>
                            </div>
                            <button
                                onClick={handleDeposit}
                                disabled={isLoading || !isCapitalHolder}
                                className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${isCapitalHolder
                                    ? 'bg-primary-500 text-white hover:bg-primary-600'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <Wallet className="w-4 h-4" />
                                {isLoading ? 'Processing...' :
                                    !isCapitalHolder ? 'Only Capital Holder' :
                                        `Lock ${details ? formatEther(details.mintPrice) : '...'} ETH`}
                            </button>
                        </div>
                    </PhaseCard>

                    {/* Phase 2: Mint & Verify */}
                    <PhaseCard
                        phaseId={2}
                        title="Phase 2: Mint & Verify NFT"
                        description="Execute mint and verify receipt in escrow"
                        isCompleted={isPhaseCompleted(2, currentStatus)}
                        isCurrent={isPhaseCurrent(2, currentStatus)}
                        txHistory={[
                            { label: 'Mint', hash: txHistory.mint, explanation: 'NFT minted via smart wallet and deposited into escrow.' },
                            { label: 'Verify', hash: txHistory.verify, explanation: 'NFT receipt confirmed in escrow contract.' },
                        ]}
                    >
                        <div className="space-y-4">
                            {/* Step 1: Execute Mint - Lock after done */}
                            <div className={`p-3 rounded-lg ${txHistory.mint ? 'bg-green-500/10 border border-green-500/30' : 'bg-bg-dark'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium text-white">Step 1: Execute Mint</h4>
                                    {txHistory.mint && (
                                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded flex items-center gap-1">
                                            <Check className="w-3 h-3" /> Done
                                        </span>
                                    )}
                                </div>
                                {txHistory.mint ? (
                                    <div className="text-sm text-gray-400">
                                        ✓ NFT minted successfully
                                        <a
                                            href={`${ETHERSCAN_BASE}/tx/${txHistory.mint}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary-400 hover:text-primary-300 ml-2"
                                        >
                                            View TX →
                                        </a>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleMint}
                                        disabled={isLoading}
                                        className="w-full py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Processing...' : 'Execute Mint'}
                                    </button>
                                )}
                            </div>
                            {/* Step 2: Verify Mint - Only active after mint */}
                            <div className={`p-3 rounded-lg ${!txHistory.mint ? 'bg-bg-dark opacity-50' : 'bg-bg-dark'}`}>
                                <h4 className="text-sm font-medium text-white mb-2">Step 2: Verify Mint</h4>
                                <p className="text-xs text-gray-500 mb-2">Token ID is the unique on-chain identifier assigned to your NFT upon minting. Find it in the mint transaction on Etherscan. This ID is needed for transfers and trading.</p>
                                <input
                                    type="text"
                                    placeholder="Token ID (check Etherscan for minted ID)"
                                    value={tokenId}
                                    onChange={(e) => setTokenId(e.target.value)}
                                    disabled={!txHistory.mint}
                                    className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm mb-2 disabled:opacity-50"
                                />
                                <button
                                    onClick={handleVerify}
                                    disabled={isLoading || !tokenId || !txHistory.mint}
                                    className="w-full py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                                >
                                    {isLoading ? 'Processing...' : 'Verify Mint'}
                                </button>
                            </div>
                        </div>
                    </PhaseCard>

                    {/* Phase 3: Approve Sale (with dual-approval tracking) */}
                    <PhaseCard
                        phaseId={3}
                        title="Phase 3: Approve Sale Terms"
                        description="Both parties must approve matching terms"
                        isCompleted={isPhaseCompleted(3, currentStatus)}
                        isCurrent={isPhaseCurrent(3, currentStatus)}
                        txHistory={[
                            { label: 'WL Approval', hash: txHistory.approvalWL, explanation: 'WL Holder approved sale terms (price & buyer address).' },
                            { label: 'Capital Approval', hash: txHistory.approvalCap, explanation: 'Capital Holder confirmed the agreed terms.' },
                        ]}
                    >
                        <div className="space-y-4">
                            {/* Approval Status Indicators */}
                            <div className="p-3 bg-bg-dark rounded-lg">
                                <h4 className="text-sm font-medium text-white mb-3">Approval Status</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-2 rounded-lg border ${approvalStatus.wlApproved
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-gray-700 bg-bg-elevated'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            {approvalStatus.wlApproved ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <X className="w-4 h-4 text-gray-500" />
                                            )}
                                            <span className={`text-sm ${approvalStatus.wlApproved ? 'text-green-400' : 'text-gray-400'}`}>
                                                WL Holder
                                            </span>
                                        </div>
                                        {approvalStatus.wlApproved && (
                                            <TxLink hash={txHistory.approvalWL} label="TX" />
                                        )}
                                    </div>
                                    <div className={`p-2 rounded-lg border ${approvalStatus.capitalApproved
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-gray-700 bg-bg-elevated'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            {approvalStatus.capitalApproved ? (
                                                <Check className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <X className="w-4 h-4 text-gray-500" />
                                            )}
                                            <span className={`text-sm ${approvalStatus.capitalApproved ? 'text-green-400' : 'text-gray-400'}`}>
                                                Capital Holder
                                            </span>
                                        </div>
                                        {approvalStatus.capitalApproved && (
                                            <TxLink hash={txHistory.approvalCap} label="TX" />
                                        )}
                                    </div>
                                </div>
                                {/* Show agreed terms if WL has approved */}
                                {Boolean(approvalStatus.wlApproved && approvalStatus.approvedSalePrice && approvalStatus.approvedSalePrice > 0n) && (
                                    <div className="mt-3 p-2 bg-primary-500/10 rounded-lg text-sm">
                                        <div className="text-gray-400">Agreed Terms:</div>
                                        <div className="text-white">
                                            Price: {formatEther(approvalStatus.approvedSalePrice)} ETH
                                        </div>
                                        <div className="text-white">
                                            Buyer: {approvalStatus.approvedMarketplace ? formatAddress(approvalStatus.approvedMarketplace) : '...'}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Approval Form */}
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="Sale Price (ETH)"
                                    value={salePrice}
                                    onChange={(e) => setSalePrice(e.target.value)}
                                    className="w-full px-3 py-2 bg-bg-dark border border-gray-700 rounded-lg text-white text-sm"
                                />
                                <input
                                    type="text"
                                    placeholder="Buyer Address (0x...)"
                                    value={buyerAddress}
                                    onChange={(e) => setBuyerAddress(e.target.value)}
                                    className="w-full px-3 py-2 bg-bg-dark border border-gray-700 rounded-lg text-white text-sm"
                                />
                                {/* Validation: Buyer must be different from participants */}
                                {buyerAddress && details && (
                                    buyerAddress.toLowerCase() === details.wlHolder.toLowerCase() ||
                                    buyerAddress.toLowerCase() === details.capitalHolder.toLowerCase()
                                ) && (
                                        <p className="text-red-400 text-xs">⚠️ Buyer must be different from WL holder and capital holder</p>
                                    )}
                                {/* Show button state based on user's approval status */}
                                {(isWLHolder && approvalStatus.wlApproved) || (isCapitalHolder && approvalStatus.capitalApproved) ? (
                                    <div className="w-full py-3 rounded-lg font-medium bg-green-500/20 border border-green-500/30 text-center">
                                        <span className="text-green-400">✓ You have approved this sale</span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleApprove}
                                        disabled={isLoading || !isParticipant || Boolean(buyerAddress && details && (
                                            buyerAddress.toLowerCase() === details.wlHolder.toLowerCase() ||
                                            buyerAddress.toLowerCase() === details.capitalHolder.toLowerCase()
                                        ))}
                                        className={`w-full py-3 rounded-lg font-medium ${isParticipant
                                            ? 'bg-primary-500 text-white hover:bg-primary-600'
                                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                            }`}
                                    >
                                        {isLoading ? 'Processing...' :
                                            !isParticipant ? 'Only Participants' :
                                                'Submit Approval'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </PhaseCard>

                    {/* Phase 4: Buy NFT (NEW - This was missing!) */}
                    <PhaseCard
                        phaseId={4}
                        title="Phase 4: Purchase NFT"
                        description={`Buy the NFT for ${approvalStatus.approvedSalePrice ? formatEther(approvalStatus.approvedSalePrice) : '...'} ETH`}
                        isCompleted={isPhaseCompleted(4, currentStatus)}
                        isCurrent={isPhaseCurrent(4, currentStatus)}
                        txHistory={[{ label: 'Purchase', hash: txHistory.sale, explanation: 'Buyer paid ETH and NFT transferred from escrow to buyer.' }]}
                    >
                        <div className="space-y-4">
                            <div className="p-3 bg-bg-dark rounded-lg">
                                <div className="text-sm text-gray-400 mb-2">Sale Details:</div>
                                <div className="text-white">
                                    Price: <span className="text-primary-400 font-bold">
                                        {approvalStatus.approvedSalePrice ? formatEther(approvalStatus.approvedSalePrice) : '...'} ETH
                                    </span>
                                </div>
                                <div className="text-white">
                                    Token ID: <span className="text-primary-400">{details?.nftTokenId?.toString() || '...'}</span>
                                </div>
                                <div className="text-white">
                                    Approved Buyer: <span className="font-mono text-sm">
                                        {approvalStatus.approvedMarketplace ? formatAddress(approvalStatus.approvedMarketplace) : '...'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={handleBuy}
                                disabled={isLoading || !isBuyer}
                                className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${isBuyer
                                    ? 'bg-green-500 text-white hover:bg-green-600'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <ShoppingCart className="w-4 h-4" />
                                {isLoading ? 'Processing...' :
                                    !isBuyer ? 'Only Approved Buyer' :
                                        `Buy for ${approvalStatus.approvedSalePrice ? formatEther(approvalStatus.approvedSalePrice) : '...'} ETH`}
                            </button>
                            {!isBuyer && isConnected && (
                                <p className="text-yellow-400 text-xs text-center">
                                    ⚠️ You are not the approved buyer
                                </p>
                            )}
                        </div>
                    </PhaseCard>

                    {/* Phase 5: Distribute */}
                    <PhaseCard
                        phaseId={5}
                        title="Phase 5: Distribute Funds"
                        description="Split proceeds (0.5% of profit OR 0.005% of sale if loss)"
                        isCompleted={isPhaseCompleted(5, currentStatus)}
                        isCurrent={isPhaseCurrent(5, currentStatus)}
                        txHistory={[{ label: 'Distribute', hash: txHistory.distribute, explanation: 'Funds split based on profit/loss. Profit case: 0.5% of profit to platform. Loss case: 0.005% of sale to platform.' }]}
                    >
                        <div className="space-y-4">
                            {/* Distribution Breakdown */}
                            <div className="p-4 bg-bg-dark rounded-lg text-sm space-y-3">
                                <div className="text-gray-400 font-medium">Fund Distribution:</div>

                                {details && approvalStatus.approvedSalePrice && approvalStatus.approvedSalePrice > 0n ? (() => {
                                    const salePrice = Number(formatEther(approvalStatus.approvedSalePrice));
                                    const mintPrice = Number(formatEther(details.mintPrice));
                                    const isProfit = salePrice > mintPrice;
                                    const profit = isProfit ? salePrice - mintPrice : 0;
                                    const platformFee = isProfit
                                        ? profit * 0.005  // 0.5% of profit
                                        : salePrice * 0.00005; // 0.005% of sale
                                    const remaining = salePrice - platformFee;
                                    const profitAfterFee = remaining - mintPrice;
                                    const capitalProfitShare = profitAfterFee > 0 ? profitAfterFee * (Number(details.splitBPS) / 10000) : 0;
                                    const capitalTotal = profitAfterFee > 0 ? mintPrice + capitalProfitShare : remaining;
                                    const wlShare = profitAfterFee > 0 ? remaining - capitalTotal : 0;

                                    return (
                                        <>
                                            {/* Maths Formula */}
                                            <div className="p-2 bg-bg-elevated rounded border border-gray-700 text-xs font-mono">
                                                <div className="text-gray-500 mb-1">{isProfit ? '📈 PROFIT CASE' : '📉 LOSS CASE'}</div>
                                                {isProfit ? (
                                                    <div className="text-gray-400">
                                                        Platform = (Sale - Mint) × 0.5% = ({salePrice.toFixed(4)} - {mintPrice.toFixed(4)}) × 0.005 = <span className="text-red-400">{platformFee.toFixed(6)} ETH</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-400">
                                                        Platform = Sale × 0.005% = {salePrice.toFixed(4)} × 0.00005 = <span className="text-red-400">{platformFee.toFixed(6)} ETH</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Recipients */}
                                            <div className="space-y-2 pt-2">
                                                <div className="flex justify-between text-red-400">
                                                    <span>🏛️ Platform Fee ({isProfit ? '0.5% profit' : '0.005% sale'})</span>
                                                    <span className="font-mono">{platformFee.toFixed(6)} ETH</span>
                                                </div>
                                                <div className="flex justify-between text-green-400">
                                                    <span>💵 Capital Holder ({isProfit ? `investment + ${Number(details.splitBPS) / 100}% profit` : 'remaining'})</span>
                                                    <span className="font-mono">{capitalTotal.toFixed(4)} ETH</span>
                                                </div>
                                                <div className="flex justify-between text-blue-400">
                                                    <span>🎨 WL Holder ({isProfit ? `${100 - Number(details.splitBPS) / 100}% profit` : 'none'})</span>
                                                    <span className="font-mono">{wlShare.toFixed(4)} ETH</span>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })() : (
                                    <div className="text-gray-500">Loading...</div>
                                )}
                            </div>

                            <button
                                onClick={handleDistribute}
                                disabled={isLoading}
                                className="w-full py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50"
                            >
                                {isLoading ? 'Processing...' : 'Distribute Funds'}
                            </button>
                        </div>
                    </PhaseCard>

                    {/* Phase 6: Complete - Full Summary */}
                    {currentStatus >= 5 && (
                        <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl">
                            <div className="text-center mb-6">
                                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                                <h3 className="text-xl font-semibold text-green-400 mb-2">Process Complete!</h3>
                                <p className="text-gray-300">All funds have been distributed to the parties.</p>
                            </div>

                            {/* Transaction Summary */}
                            <div className="bg-bg-dark rounded-lg p-4 mb-4">
                                <h4 className="text-white font-medium mb-3">📋 Transaction Summary</h4>
                                <div className="space-y-2 text-sm">
                                    {txHistory.deposit && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">1. Capital Locked</span>
                                            <a href={`${ETHERSCAN_BASE}/tx/${txHistory.deposit}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-primary-400 hover:text-primary-300 flex items-center gap-1">
                                                View TX <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                    {txHistory.mint && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">2. NFT Minted</span>
                                            <a href={`${ETHERSCAN_BASE}/tx/${txHistory.mint}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-primary-400 hover:text-primary-300 flex items-center gap-1">
                                                View TX <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                    {txHistory.verify && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">3. NFT Verified</span>
                                            <a href={`${ETHERSCAN_BASE}/tx/${txHistory.verify}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-primary-400 hover:text-primary-300 flex items-center gap-1">
                                                View TX <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                    {(txHistory.approvalWL || txHistory.approvalCap) && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">4. Sale Approved</span>
                                            <div className="flex gap-2">
                                                {txHistory.approvalWL && (
                                                    <a href={`${ETHERSCAN_BASE}/tx/${txHistory.approvalWL}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                        className="text-primary-400 hover:text-primary-300 text-xs">
                                                        WL ↗
                                                    </a>
                                                )}
                                                {txHistory.approvalCap && (
                                                    <a href={`${ETHERSCAN_BASE}/tx/${txHistory.approvalCap}`}
                                                        target="_blank" rel="noopener noreferrer"
                                                        className="text-primary-400 hover:text-primary-300 text-xs">
                                                        Capital ↗
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {txHistory.sale && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400">5. NFT Purchased</span>
                                            <a href={`${ETHERSCAN_BASE}/tx/${txHistory.sale}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-primary-400 hover:text-primary-300 flex items-center gap-1">
                                                View TX <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                    {txHistory.distribute && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-green-400 font-medium">6. Funds Distributed</span>
                                            <a href={`${ETHERSCAN_BASE}/tx/${txHistory.distribute}`}
                                                target="_blank" rel="noopener noreferrer"
                                                className="text-green-400 hover:text-green-300 flex items-center gap-1">
                                                View TX <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Final Distribution Breakdown */}
                            {details && approvalStatus.approvedSalePrice && approvalStatus.approvedSalePrice > 0n ? (
                                <div className="bg-bg-dark rounded-lg p-4">
                                    <h4 className="text-white font-medium mb-3">💰 Who Received What</h4>
                                    {(() => {
                                        const salePrice = Number(formatEther(approvalStatus.approvedSalePrice));
                                        const mintPrice = Number(formatEther(details.mintPrice));
                                        const isProfit = salePrice > mintPrice;
                                        const profit = isProfit ? salePrice - mintPrice : 0;
                                        const platformFee = isProfit
                                            ? profit * 0.005  // 0.5% of profit
                                            : salePrice * 0.00005; // 0.005% of sale
                                        const remaining = salePrice - platformFee;
                                        const profitAfterFee = remaining - mintPrice;
                                        const capitalProfitShare = profitAfterFee > 0 ? profitAfterFee * (Number(details.splitBPS) / 10000) : 0;
                                        const capitalTotal = profitAfterFee > 0 ? mintPrice + capitalProfitShare : remaining;
                                        const wlShare = profitAfterFee > 0 ? remaining - capitalTotal : 0;

                                        return (
                                            <div className="space-y-3 text-sm">
                                                {/* Math Formula */}
                                                <div className="p-2 bg-bg-elevated rounded border border-gray-700 text-xs font-mono">
                                                    <div className="text-gray-500 mb-1">{isProfit ? '📈 PROFIT' : '📉 LOSS'}: Sale {salePrice.toFixed(4)} ETH vs Mint {mintPrice.toFixed(4)} ETH</div>
                                                    {isProfit ? (
                                                        <div className="text-gray-400">
                                                            Fee = Profit × 0.5% = {profit.toFixed(4)} × 0.005 = <span className="text-red-400">{platformFee.toFixed(6)} ETH</span>
                                                        </div>
                                                    ) : (
                                                        <div className="text-gray-400">
                                                            Fee = Sale × 0.005% = {salePrice.toFixed(4)} × 0.00005 = <span className="text-red-400">{platformFee.toFixed(6)} ETH</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Recipients */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center p-2 bg-red-500/10 rounded">
                                                        <span className="text-red-400">🏛️ Platform Fee</span>
                                                        <span className="text-red-400 font-mono font-medium">{platformFee.toFixed(6)} ETH</span>
                                                    </div>

                                                    <div className="flex justify-between items-center p-2 bg-green-500/10 rounded">
                                                        <div>
                                                            <span className="text-green-400">💵 Capital Holder</span>
                                                            <p className="text-xs text-gray-500">{isProfit ? `Investment + ${Number(details.splitBPS) / 100}% profit` : 'Remaining'}</p>
                                                        </div>
                                                        <span className="text-green-400 font-mono font-medium">{capitalTotal.toFixed(4)} ETH</span>
                                                    </div>

                                                    <div className="flex justify-between items-center p-2 bg-blue-500/10 rounded">
                                                        <div>
                                                            <span className="text-blue-400">🎨 WL Holder</span>
                                                            <p className="text-xs text-gray-500">{isProfit ? `${100 - Number(details.splitBPS) / 100}% profit` : 'None (loss)'}</p>
                                                        </div>
                                                        <span className="text-blue-400 font-mono font-medium">{wlShare.toFixed(4)} ETH</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Escrow Details Card */}
                    <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Escrow Details</h2>
                        {details ? (
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">WL Holder</span>
                                    <a
                                        href={`${ETHERSCAN_BASE}/address/${details.wlHolder}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-1"
                                    >
                                        {formatAddress(details.wlHolder)}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Capital Holder</span>
                                    <a
                                        href={`${ETHERSCAN_BASE}/address/${details.capitalHolder}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-1"
                                    >
                                        {formatAddress(details.capitalHolder)}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Mint Price</span>
                                    <p className="text-white mt-1">{formatEther(details.mintPrice)} ETH</p>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Capital Holder Profit</span>
                                    <p className="text-green-400 mt-1">{Number(details.splitBPS) / 100}%</p>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">NFT Contract</span>
                                    <a
                                        href={`${ETHERSCAN_BASE}/address/${details.nftContract}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-1"
                                    >
                                        {formatAddress(details.nftContract)}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Deadline</span>
                                    <p className={`mt-1 ${isExpired ? 'text-red-400' : 'text-white'}`}>
                                        {new Date(Number(details.deadline) * 1000).toLocaleString()}
                                        {isExpired && ' (Expired)'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">Loading...</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NFTOfferProcess;
