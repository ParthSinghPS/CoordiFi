/**
 * OTC Offer Process Page
 * Dedicated page for tracking and managing an individual OTC trade
 * Features: 5-phase guide, Maker/Taker multi-step flows, price validation, access control
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAccount, useBalance, useReadContract, useWriteContract } from 'wagmi';
import { formatUnits } from 'viem';
import { ArrowLeft, CheckCircle, AlertTriangle, ExternalLink, Copy, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useOTCEscrow } from '../hooks/useOTCEscrow';
import { txToast } from '../lib/toast';
import { CONTRACTS, WETH_ABI, ERC20_ABI } from '../lib/contracts';
import { getSpotPrice } from '../lib/uniswap';
import { txHistory as supabaseTxHistory, otcOffers as supabaseOTC } from '../lib/supabase';

// ========================================
// PHASE DEFINITIONS (matching UX spec)
// ========================================
const PHASES = [
    {
        id: 1,
        status: 0, // CREATED
        name: 'Trade Created',
        description: 'Agreement deployed. Maker must lock WETH.',
        actor: 'maker',
        actorLabel: 'Maker',
    },
    {
        id: 2,
        status: 1, // MAKER_LOCKED
        name: 'Maker Locked',
        description: 'Maker\'s WETH in escrow. Waiting for Taker.',
        actor: 'taker',
        actorLabel: 'Taker',
    },
    {
        id: 3,
        status: 2, // BOTH_LOCKED
        name: 'Both Locked',
        description: 'Both assets locked. Ready for settlement.',
        actor: 'anyone',
        actorLabel: 'Anyone',
    },
    {
        id: 4,
        status: 3, // SETTLED
        name: 'Settled',
        description: 'Trade complete! Assets swapped atomically.',
        actor: 'none',
        actorLabel: 'N/A',
    },
    {
        id: 5,
        status: 4, // REFUNDED
        name: 'Refunded',
        description: 'Trade cancelled. Assets returned to parties.',
        actor: 'none',
        actorLabel: 'N/A',
    },
];

// Maker's 3-step process
const MAKER_STEPS = [
    { id: 1, name: 'Wrap ETH', desc: 'Convert ETH to WETH for ERC20 compatibility' },
    { id: 2, name: 'Approve WETH', desc: 'Allow escrow to spend your WETH' },
    { id: 3, name: 'Lock WETH', desc: 'Lock WETH in the escrow contract' },
];

// Taker's 2-step process
const TAKER_STEPS = [
    { id: 1, name: 'Approve USDC', desc: 'Allow escrow to spend your USDC' },
    { id: 2, name: 'Lock USDC', desc: 'Lock USDC in the escrow contract' },
];

// ========================================
// HELPER FUNCTIONS
// ========================================
const getPhaseByStatus = (status: number) => PHASES.find(p => p.status === status) || PHASES[0];
const isPhaseCompleted = (phaseId: number, currentStatus: number) => {
    const phase = PHASES.find(p => p.id === phaseId);
    return phase ? currentStatus > phase.status : false;
};
const isPhaseCurrent = (phaseId: number, currentStatus: number) => {
    const phase = PHASES.find(p => p.id === phaseId);
    return phase ? currentStatus === phase.status : false;
};

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const ETHERSCAN_BASE = 'https://sepolia.etherscan.io';

// Default ETH/USDC price (fetched from CoinGecko on mount)
const DEFAULT_ETH_PRICE = 2750; // Will be updated with real API data

// ========================================
// TX HISTORY STORAGE (Supabase + localStorage fallback)
// ========================================
interface OTCTxHistory {
    wrap?: string;
    makerApprove?: string;
    makerLock?: string;
    takerApprove?: string;
    takerLock?: string;
    settle?: string;
    refund?: string;
}

const getOTCTxHistory = (escrowAddress: string): OTCTxHistory => {
    // Synchronous load from localStorage (for initial render)
    const stored = localStorage.getItem(`otc_tx_${escrowAddress}`);
    return stored ? JSON.parse(stored) : {};
};

const saveOTCTxHistory = async (escrowAddress: string, key: keyof OTCTxHistory, hash: string) => {
    // Save to localStorage immediately for fast UI
    const current = getOTCTxHistory(escrowAddress);
    current[key] = hash;
    localStorage.setItem(`otc_tx_${escrowAddress}`, JSON.stringify(current));

    // Also save to Supabase tx_history table for persistence
    try {
        await supabaseTxHistory.add({
            escrow_address: escrowAddress,
            escrow_type: 'otc',
            tx_type: key,
            tx_hash: hash,
        });
        console.log('[OTC] TX saved to Supabase tx_history:', key, hash.slice(0, 10));
    } catch (err) {
        console.error('[OTC] Failed to save TX to Supabase:', err);
    }

    // Also update the main otc_offers table with TX hash and status
    try {
        const updates: Record<string, string> = {};

        // Map tx_type to column name and status
        if (key === 'makerLock') {
            updates.maker_lock_tx = hash;
            updates.status = 'locked';
        } else if (key === 'takerLock') {
            updates.taker_lock_tx = hash;
            updates.status = 'funded';
        } else if (key === 'settle') {
            updates.settle_tx = hash;
            updates.status = 'settled';
        }

        if (Object.keys(updates).length > 0) {
            await supabaseOTC.updateByEscrow(escrowAddress, updates);
            console.log('[OTC] Updated otc_offers table:', updates);
        }
    } catch (err) {
        console.error('[OTC] Failed to update otc_offers:', err);
    }
};

// Load TX history from Supabase (async, for hydration)
const loadOTCTxHistoryFromSupabase = async (escrowAddress: string): Promise<OTCTxHistory> => {
    try {
        const records = await supabaseTxHistory.getByEscrow(escrowAddress);
        const history: OTCTxHistory = {};

        for (const record of records) {
            const key = record.tx_type as keyof OTCTxHistory;
            if (key) {
                history[key] = record.tx_hash;
            }
        }

        // Also update localStorage as cache
        if (Object.keys(history).length > 0) {
            localStorage.setItem(`otc_tx_${escrowAddress}`, JSON.stringify(history));
        }

        return history;
    } catch (err) {
        console.error('[OTC] Failed to load TX history from Supabase:', err);
        return getOTCTxHistory(escrowAddress); // Fallback to localStorage
    }
};

// TX Link Component
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
        </a>
    );
};

// Sync status back to otc_offers so main page shows correct category
const syncOTCStatusToOffers = (escrowAddress: string, newStatus: number) => {
    try {
        const stored = localStorage.getItem('otc_offers');
        if (!stored) return;

        const offers = JSON.parse(stored);
        const updated = offers.map((o: any) => {
            if (o.escrowAddress?.toLowerCase() === escrowAddress.toLowerCase()) {
                return { ...o, status: newStatus };
            }
            return o;
        });

        localStorage.setItem('otc_offers', JSON.stringify(updated));
        console.log('[OTC] Synced status to offers:', escrowAddress, 'status:', newStatus);
    } catch (e) {
        console.error('[OTC] Failed to sync status:', e);
    }
};

// ========================================
// MAIN COMPONENT
// ========================================
export function OTCOfferProcess() {
    const { escrowAddress } = useParams<{ escrowAddress: string }>();
    const navigate = useNavigate();
    const { address: userAddress, isConnected } = useAccount();

    // Get escrow data
    const {
        details,
        isMaker,
        isTaker,
        isParticipant,
        isExpired,
        isLoading,
        makerLock,
        takerLock,
        validateAndSettle,
        refund,
        refetchDetails,
    } = useOTCEscrow(escrowAddress as `0x${string}` | undefined);

    const { writeContractAsync } = useWriteContract();

    // Local state
    const [makerStep, setMakerStep] = useState(1);
    const [takerStep, setTakerStep] = useState(1);
    const [marketPrice, setMarketPrice] = useState(DEFAULT_ETH_PRICE);
    const [isRefreshingPrice, setIsRefreshingPrice] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false); // Shows loading during phase transitions

    // TX History state (loaded from localStorage)
    const [txHistory, setTxHistory] = useState<OTCTxHistory>(() =>
        escrowAddress ? getOTCTxHistory(escrowAddress) : {}
    );

    // Refresh txHistory when escrowAddress changes (localStorage first, then Supabase)
    useEffect(() => {
        if (escrowAddress) {
            // Immediate load from localStorage for fast render
            setTxHistory(getOTCTxHistory(escrowAddress));

            // Then hydrate from Supabase for any persisted data
            loadOTCTxHistoryFromSupabase(escrowAddress).then(history => {
                if (Object.keys(history).length > 0) {
                    setTxHistory(history);
                }
            });
        }
    }, [escrowAddress]);

    // Get user balances
    const { data: ethBalance, refetch: refetchEthBalance } = useBalance({ address: userAddress });
    const { data: wethBalance, refetch: refetchWethBalance } = useBalance({ address: userAddress, token: CONTRACTS.WETH as `0x${string}` });
    const { data: usdcBalance, refetch: refetchUsdcBalance } = useBalance({ address: userAddress, token: CONTRACTS.USDC as `0x${string}` });

    // Check WETH allowance for maker
    const { data: wethAllowance, refetch: refetchWethAllowance } = useReadContract({
        address: CONTRACTS.WETH as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: userAddress && escrowAddress ? [userAddress, escrowAddress as `0x${string}`] : undefined,
    });

    // Check USDC allowance for taker
    const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
        address: CONTRACTS.USDC as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: userAddress && escrowAddress ? [userAddress, escrowAddress as `0x${string}`] : undefined,
    });

    // Calculate price and deviation
    const agreedPrice = details
        ? Number(formatUnits(details.amountB, 6)) / Number(formatUnits(details.amountA, 18))
        : 0;
    const priceDeviation = agreedPrice ? Math.abs(((agreedPrice - marketPrice) / marketPrice) * 100) : 0;

    // Determine maker step based on escrow status AND TX history
    // This restores step state from completed TXs on page reload
    useEffect(() => {
        if (!details) return;

        // If escrow status shows maker has locked, we're done
        if (details.status >= 1) {
            setMakerStep(4); // Maker has locked - all done
            return;
        }

        // Otherwise, restore from TX history
        const history = getOTCTxHistory(escrowAddress!);
        if (history.makerLock) {
            setMakerStep(4); // Lock TX exists
        } else if (history.makerApprove) {
            setMakerStep(3); // Approve TX exists, ready for lock
        } else if (history.wrap) {
            setMakerStep(2); // Wrap TX exists, ready for approve
        } else {
            setMakerStep(1); // Start fresh
        }
    }, [details, escrowAddress]);

    // Determine taker step based on escrow status AND TX history
    useEffect(() => {
        if (!details) return;

        // If escrow status shows taker has locked, we're done
        if (details.status >= 2) {
            setTakerStep(3); // Taker has locked - done
            return;
        }

        // Otherwise, restore from TX history
        const history = getOTCTxHistory(escrowAddress!);
        if (history.takerLock) {
            setTakerStep(3); // Lock TX exists
        } else if (history.takerApprove) {
            setTakerStep(2); // Approve TX exists, ready for lock
        } else {
            setTakerStep(1); // Start fresh
        }
    }, [details, escrowAddress]);

    // Poll for updates
    useEffect(() => {
        const interval = setInterval(refetchDetails, 10000);
        return () => clearInterval(interval);
    }, [refetchDetails]);

    // Fetch real ETH price from Uniswap V3 on mount
    useEffect(() => {
        const fetchEthPrice = async () => {
            try {
                const price = await getSpotPrice('ETH', 'USDC');
                if (price > 0) {
                    setMarketPrice(price);
                }
            } catch (error) {
                console.error('[OTC] Failed to fetch ETH price from Uniswap:', error);
            }
        };
        fetchEthPrice();
    }, []);

    // Refresh price from Uniswap
    const refreshPrice = async () => {
        setIsRefreshingPrice(true);
        try {
            const price = await getSpotPrice('ETH', 'USDC');
            if (price > 0) {
                // Only show toast if price changed significantly (>$1)
                const priceChanged = Math.abs(price - marketPrice) > 1;
                setMarketPrice(price);
                if (priceChanged) {
                    txToast.otc.priceUpdate(price);
                }
            }
        } catch (error) {
            console.error('[OTC] Failed to refresh ETH price from Uniswap:', error);
            txToast.error('Failed to fetch price from Uniswap');
        }
        setIsRefreshingPrice(false);
    };

    // ========================================
    // ACTION HANDLERS
    // ========================================
    const handleWrapETH = async () => {
        if (!isMaker) {
            txToast.access.notMaker();
            return;
        }
        if (!details) return;

        const toastId = txToast.otc.wrapPending();
        try {
            const hash = await writeContractAsync({
                address: CONTRACTS.WETH as `0x${string}`,
                abi: WETH_ABI,
                functionName: 'deposit',
                value: details.amountA,
            });
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'wrap', hash);
            setTxHistory(prev => ({ ...prev, wrap: hash }));
            txToast.update(toastId, true, 'Wrapped ETH to WETH!', hash);
            // Refetch WETH balance before moving to next step
            await refetchWethBalance();
            setMakerStep(2);
        } catch (error) {
            txToast.update(toastId, false, 'Wrap failed.');
        }
    };

    const handleApproveWETH = async () => {
        if (!isMaker) {
            txToast.access.notMaker();
            return;
        }
        if (!details) return;

        const toastId = txToast.otc.approvePending();
        try {
            const hash = await writeContractAsync({
                address: CONTRACTS.WETH as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [escrowAddress as `0x${string}`, details.amountA],
            });
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'makerApprove', hash);
            setTxHistory(prev => ({ ...prev, makerApprove: hash }));
            txToast.update(toastId, true, 'WETH approved!', hash);
            // Refetch allowance before moving to next step
            await refetchWethAllowance();
            setMakerStep(3);
        } catch (error) {
            txToast.update(toastId, false, 'Approval failed.');
        }
    };

    const handleMakerLock = async () => {
        if (!isMaker) {
            txToast.access.notMaker();
            return;
        }
        if (!details) return;

        // Debug: Log contract state before attempting lock
        console.log('[OTC Debug] handleMakerLock called');
        console.log('[OTC Debug] Escrow:', escrowAddress);
        console.log('[OTC Debug] Status:', details.status, '(should be 0 = CREATED)');
        console.log('[OTC Debug] Deadline:', Number(details.deadline), 'vs Now:', Math.floor(Date.now() / 1000));
        console.log('[OTC Debug] isMaker:', isMaker);

        // Check escrow status - must be CREATED (0)
        if (details.status !== 0) {
            txToast.error(`Wrong status: ${details.status}. Expected 0 (CREATED).`);
            return;
        }

        // Check deadline
        const now = Math.floor(Date.now() / 1000);
        if (Number(details.deadline) < now) {
            txToast.error('Escrow has expired!');
            return;
        }

        // IMPORTANT: Refetch fresh data before validation to prevent stale state issues
        const { data: freshWethBalance } = await refetchWethBalance();
        const { data: freshWethAllowance } = await refetchWethAllowance();

        console.log('[OTC Debug] Fresh WETH Balance:', freshWethBalance?.value?.toString());
        console.log('[OTC Debug] Fresh WETH Allowance:', freshWethAllowance?.toString());
        console.log('[OTC Debug] Required amountA:', details.amountA.toString());

        // Validate pre-conditions using FRESH data
        if (!freshWethBalance || freshWethBalance.value < details.amountA) {
            txToast.error('Insufficient WETH balance. Complete Step 1 (Wrap ETH) first.');
            setMakerStep(1); // Reset to step 1
            return;
        }
        if (!freshWethAllowance || freshWethAllowance < details.amountA) {
            txToast.error('WETH not approved. Complete Step 2 (Approve WETH) first.');
            setMakerStep(2); // Reset to step 2
            return;
        }

        const toastId = txToast.otc.makerLockPending();
        try {
            const result = await makerLock();
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'makerLock', result.hash);
            setTxHistory(prev => ({ ...prev, makerLock: result.hash }));
            txToast.update(toastId, true, 'WETH locked! Verifying...', result.hash);
            // Show verifying state while refetching
            setIsVerifying(true);
            await refetchDetails();
            setIsVerifying(false);
        } catch (error: any) {
            console.error('[OTC Debug] makerLock failed:', error);
            const errorMsg = error?.message || 'Lock failed.';
            txToast.update(toastId, false, errorMsg.substring(0, 100));
            setIsVerifying(false);
        }
    };

    const handleApproveUSDC = async () => {
        if (!isTaker) {
            txToast.access.notTaker();
            return;
        }
        if (!details) return;

        const toastId = txToast.otc.approvePending();
        try {
            const hash = await writeContractAsync({
                address: CONTRACTS.USDC as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [escrowAddress as `0x${string}`, details.amountB],
            });
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'takerApprove', hash);
            setTxHistory(prev => ({ ...prev, takerApprove: hash }));
            txToast.update(toastId, true, 'USDC approved!', hash);
            // Refetch allowance before moving to next step
            await refetchUsdcAllowance();
            setTakerStep(2);
        } catch (error) {
            txToast.update(toastId, false, 'Approval failed.');
        }
    };

    const handleTakerLock = async () => {
        if (!isTaker) {
            txToast.access.notTaker();
            return;
        }
        if (!details) return;

        // IMPORTANT: Refetch fresh data before validation to prevent stale state issues
        const { data: freshUsdcAllowance } = await refetchUsdcAllowance();
        console.log('[OTC Debug] Fresh USDC Allowance:', freshUsdcAllowance?.toString());
        console.log('[OTC Debug] Required amountB:', details.amountB.toString());

        // Validate pre-conditions using FRESH data
        if (!freshUsdcAllowance || freshUsdcAllowance < details.amountB) {
            txToast.error('USDC not approved. Complete Step 1 (Approve USDC) first.');
            setTakerStep(1); // Reset to step 1
            return;
        }

        const toastId = txToast.otc.takerLockPending();
        try {
            const result = await takerLock();
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'takerLock', result.hash);
            setTxHistory(prev => ({ ...prev, takerLock: result.hash }));
            txToast.update(toastId, true, 'USDC locked! Verifying...', result.hash);
            // Show verifying state while refetching
            setIsVerifying(true);
            await refetchDetails();
            setIsVerifying(false);
        } catch (error) {
            txToast.update(toastId, false, 'Lock failed.');
            setIsVerifying(false);
        }
    };

    const handleSettle = async () => {
        const toastId = txToast.otc.settlePending();
        try {
            const result = await validateAndSettle();
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'settle', result.hash);
            setTxHistory(prev => ({ ...prev, settle: result.hash }));
            txToast.update(toastId, true, 'Trade complete!', result.hash);
            // Sync status to 4 (SETTLED) for CoordinationStatus
            syncOTCStatusToOffers(escrowAddress!, 4);
            setIsVerifying(true);
            await refetchDetails();
            setIsVerifying(false);
        } catch (error) {
            txToast.update(toastId, false, 'Settlement failed.');
            setIsVerifying(false);
        }
    };

    const handleRefund = async () => {
        const toastId = txToast.pending('Processing refund...');
        try {
            const result = await refund();
            // Save TX history
            saveOTCTxHistory(escrowAddress!, 'refund', result.hash);
            setTxHistory(prev => ({ ...prev, refund: result.hash }));
            txToast.update(toastId, true, 'Refund complete!', result.hash);
            // Sync status to 5 (REFUNDED)
            syncOTCStatusToOffers(escrowAddress!, 5);
            setIsVerifying(true);
            await refetchDetails();
            setIsVerifying(false);
        } catch (error) {
            txToast.update(toastId, false, 'Refund failed.');
            setIsVerifying(false);
        }
    };

    // ========================================
    // RENDER
    // ========================================
    if (!escrowAddress) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h1 className="text-2xl font-bold text-white mb-4">Invalid Escrow Address</h1>
                <Link to="/otc-trade" className="text-primary-400 hover:underline">← Back to OTC Trade</Link>
            </div>
        );
    }

    const currentStatus = details?.status ?? 0;
    const currentPhase = getPhaseByStatus(currentStatus);
    const userRole = isMaker ? 'Maker' : isTaker ? 'Taker' : 'Observer';

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            {/* Back Button */}
            <button
                onClick={() => navigate('/otc-trade')}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to OTC Trade
            </button>

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">OTC Trade Process</h1>
                    <div className="flex items-center gap-3">
                        <span className="text-gray-400 font-mono text-sm">{formatAddress(escrowAddress)}</span>
                        <button
                            onClick={() => { navigator.clipboard.writeText(escrowAddress); txToast.info('Address copied!'); }}
                            className="text-gray-500 hover:text-white"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <a href={`${ETHERSCAN_BASE}/address/${escrowAddress}`} target="_blank" rel="noopener noreferrer" className="text-primary-400">
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`px-4 py-2 rounded-lg border ${isParticipant ? 'border-green-500 bg-green-500/10' : 'border-yellow-500 bg-yellow-500/10'
                        }`}>
                        <span className={`text-sm font-medium ${isParticipant ? 'text-green-400' : 'text-yellow-400'}`}>
                            {userRole}
                        </span>
                    </div>
                </div>
            </div>

            {/* Access Control Warning */}
            {!isParticipant && isConnected && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-8">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-yellow-400">Access Restricted</h3>
                            <p className="text-gray-300 text-sm mt-1">
                                You are not a participant in this trade. You can view progress but cannot perform actions.
                            </p>
                            <div className="mt-3 text-sm text-gray-400">
                                <div>Maker: <span className="font-mono">{details?.maker ? formatAddress(details.maker) : '...'}</span></div>
                                <div>Taker: <span className="font-mono">{details?.taker ? formatAddress(details.taker) : '...'}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Price Validation Box */}
            <div className="bg-bg-card border border-gray-800 rounded-xl p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Price Validation</h2>
                    <button
                        onClick={refreshPrice}
                        disabled={isRefreshingPrice}
                        className="flex items-center gap-2 text-gray-400 hover:text-white text-sm"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshingPrice ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 bg-bg-elevated rounded-lg">
                        <span className="text-gray-400 text-sm">Market Price</span>
                        <p className="text-2xl font-bold text-white mt-1">${marketPrice.toFixed(2)}</p>
                        <span className="text-xs text-gray-500">via Uniswap V3</span>
                    </div>
                    <div className="p-4 bg-bg-elevated rounded-lg">
                        <span className="text-gray-400 text-sm">Agreed Price</span>
                        <p className="text-2xl font-bold text-white mt-1">${agreedPrice.toFixed(2)}</p>
                        <span className="text-xs text-gray-500">per contract</span>
                    </div>
                    <div className={`p-4 rounded-lg ${priceDeviation > 20 ? 'bg-red-500/10 border border-red-500/30' :
                        priceDeviation > 10 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                            'bg-green-500/10 border border-green-500/30'
                        }`}>
                        <span className="text-gray-400 text-sm">Deviation</span>
                        <div className="flex items-center gap-2 mt-1">
                            {priceDeviation > 0 ? (
                                agreedPrice > marketPrice
                                    ? <TrendingUp className="w-5 h-5 text-red-400" />
                                    : <TrendingDown className="w-5 h-5 text-red-400" />
                            ) : null}
                            <span className={`text-2xl font-bold ${priceDeviation > 20 ? 'text-red-400' :
                                priceDeviation > 10 ? 'text-yellow-400' :
                                    'text-green-400'
                                }`}>
                                {priceDeviation.toFixed(1)}%
                            </span>
                        </div>
                        <span className={`text-xs ${priceDeviation > 20 ? 'text-red-400' :
                            priceDeviation > 10 ? 'text-yellow-400' :
                                'text-green-500'
                            }`}>
                            {priceDeviation > 20 ? '⚠️ High risk - may refund' :
                                priceDeviation > 10 ? '⚠️ Monitor closely' :
                                    '✓ Within tolerance'}
                        </span>
                    </div>
                </div>
                {priceDeviation > 10 && (
                    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
                        💡 Price Tolerance: This escrow allows ±10% deviation from market. If price exceeds this at settlement, funds will be refunded automatically.
                    </div>
                )}
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Left: Phase Guide */}
                <div className="lg:col-span-1">
                    <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-white mb-6">Trade Phases</h2>
                        <div className="space-y-1">
                            {PHASES.slice(0, 4).map((phase, index) => {
                                const completed = isPhaseCompleted(phase.id, currentStatus);
                                const current = isPhaseCurrent(phase.id, currentStatus);
                                const isClickable = completed || current;

                                return (
                                    <div
                                        key={phase.id}
                                        className={`relative ${isClickable ? 'cursor-pointer' : ''}`}
                                        onClick={() => {
                                            if (isClickable) {
                                                const card = document.getElementById(`phase-details-${phase.id}`);
                                                if (card) {
                                                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                    card.classList.add('ring-2', 'ring-primary-400');
                                                    setTimeout(() => card.classList.remove('ring-2', 'ring-primary-400'), 2000);
                                                }
                                            }
                                        }}
                                    >
                                        {index < 3 && (
                                            <div className={`absolute left-4 top-10 w-0.5 h-12 ${completed ? 'bg-green-500' : current ? 'bg-primary-500' : 'bg-gray-700'
                                                }`} />
                                        )}
                                        <div className={`flex items-start gap-4 p-3 rounded-lg transition-colors ${current ? 'bg-primary-500/10 border border-primary-500/30' : completed ? 'hover:bg-gray-800/50' : ''}`}>
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${completed ? 'bg-green-500' : current ? 'bg-primary-500 animate-pulse' : 'bg-gray-700'
                                                }`}>
                                                {completed ? <CheckCircle className="w-5 h-5 text-white" /> : <span className="text-white font-medium text-sm">{phase.id}</span>}
                                            </div>
                                            <div className="flex-1">
                                                <h3 className={`font-medium ${completed ? 'text-gray-400' : current ? 'text-white' : 'text-gray-500'}`}>{phase.name}</h3>
                                                {current && <p className="text-sm text-gray-400 mt-1">{phase.description}</p>}
                                                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${completed ? 'bg-gray-700 text-gray-400' : current ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-500'
                                                    }`}>{phase.actorLabel}</span>
                                                {isClickable && (
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

                {/* Right: Actions */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Verifying State - Shows when transitioning between phases */}
                    {isVerifying && (
                        <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-6 flex items-center justify-center gap-3">
                            <RefreshCw className="w-5 h-5 text-primary-400 animate-spin" />
                            <span className="text-primary-300 font-medium">Verifying transaction and updating status...</span>
                        </div>
                    )}

                    {/* Completed Phases Summary - Show TX history for completed phases */}
                    {currentStatus >= 1 && (
                        <div id="phase-details-1" className="bg-bg-card border border-green-500/30 rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <h2 className="text-lg font-semibold text-white">Phase 1: Trade Created ✓</h2>
                            </div>
                            <p className="text-gray-400 text-sm mb-4">Escrow deployed and ready for maker to lock funds.</p>
                            <div className="bg-bg-dark/50 rounded-lg p-3 space-y-2">
                                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Completed Steps</div>
                                {txHistory.wrap && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Wrap ETH</span>
                                        <TxLink hash={txHistory.wrap} label="TX" />
                                    </div>
                                )}
                                {txHistory.makerApprove && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Approve WETH</span>
                                        <TxLink hash={txHistory.makerApprove} label="TX" />
                                    </div>
                                )}
                                {txHistory.makerLock && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Lock WETH</span>
                                        <TxLink hash={txHistory.makerLock} label="TX" />
                                    </div>
                                )}
                                {!txHistory.wrap && !txHistory.makerApprove && !txHistory.makerLock && (
                                    <span className="text-gray-500 text-sm italic">No transactions recorded for this phase</span>
                                )}
                            </div>
                        </div>
                    )}

                    {currentStatus >= 2 && (
                        <div id="phase-details-2" className="bg-bg-card border border-green-500/30 rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <h2 className="text-lg font-semibold text-white">Phase 2: Maker Locked ✓</h2>
                            </div>
                            <p className="text-gray-400 text-sm mb-4">Maker's WETH locked. Taker completed their part.</p>
                            <div className="bg-bg-dark/50 rounded-lg p-3 space-y-2">
                                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Taker Steps</div>
                                {txHistory.takerApprove && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Approve USDC</span>
                                        <TxLink hash={txHistory.takerApprove} label="TX" />
                                    </div>
                                )}
                                {txHistory.takerLock && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Lock USDC</span>
                                        <TxLink hash={txHistory.takerLock} label="TX" />
                                    </div>
                                )}
                                {!txHistory.takerApprove && !txHistory.takerLock && (
                                    <span className="text-gray-500 text-sm italic">No transactions recorded for this phase</span>
                                )}
                            </div>
                        </div>
                    )}

                    {currentStatus >= 3 && (
                        <div id="phase-details-3" className="bg-bg-card border border-green-500/30 rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <h2 className="text-lg font-semibold text-white">Phase 3: Both Locked ✓</h2>
                            </div>
                            <p className="text-gray-400 text-sm mb-4">Both parties have locked funds. Ready for settlement.</p>
                            <div className="bg-bg-dark/50 rounded-lg p-3 space-y-2">
                                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Settlement</div>
                                {txHistory.settle && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Settlement</span>
                                        <TxLink hash={txHistory.settle} label="TX" />
                                    </div>
                                )}
                                {txHistory.refund && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400 text-sm">Refund</span>
                                        <TxLink hash={txHistory.refund} label="TX" />
                                    </div>
                                )}
                                {!txHistory.settle && !txHistory.refund && (
                                    <span className="text-gray-500 text-sm italic">Pending settlement or refund</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Maker Steps (Status 0) */}
                    {currentStatus === 0 && (
                        <div id="phase-details-1" className="bg-bg-card border border-gray-800 rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Maker: Lock WETH</h2>

                            {/* Step Progress */}
                            <div className="flex items-center gap-2 mb-6">
                                {MAKER_STEPS.map((step, idx) => (
                                    <div key={step.id} className="flex items-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${makerStep > step.id ? 'bg-green-500' :
                                            makerStep === step.id ? 'bg-primary-500' : 'bg-gray-700'
                                            }`}>
                                            {makerStep > step.id ? <CheckCircle className="w-5 h-5 text-white" /> : <span className="text-white text-sm">{step.id}</span>}
                                        </div>
                                        {idx < MAKER_STEPS.length - 1 && (
                                            <div className={`w-12 h-0.5 ${makerStep > step.id ? 'bg-green-500' : 'bg-gray-700'}`} />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* All Steps - show completed with TX links, current active, future disabled */}
                            <div className="space-y-4">
                                {/* Step 1: Wrap ETH */}
                                <div className={`p-4 rounded-lg ${makerStep === 1 ? 'bg-bg-elevated border border-primary-500/30' : makerStep > 1 ? 'bg-green-900/20 border border-green-500/30' : 'bg-bg-elevated opacity-50'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className={`font-medium ${makerStep >= 1 ? 'text-white' : 'text-gray-500'}`}>Step 1: Wrap ETH</h3>
                                        {txHistory.wrap && <TxLink hash={txHistory.wrap} label="TX" />}
                                    </div>
                                    <p className="text-gray-400 text-sm mb-3">
                                        Convert {details ? formatUnits(details.amountA, 18) : '...'} ETH to WETH
                                    </p>
                                    {makerStep === 1 ? (
                                        <>
                                            <div className="text-sm text-gray-500 mb-3">
                                                Your ETH: {ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : '...'} ETH
                                            </div>
                                            <button onClick={handleWrapETH} disabled={isLoading || !isMaker} className={`w-full py-2.5 rounded-lg font-medium ${isMaker ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                                                {isLoading ? 'Processing...' : !isMaker ? 'Only Maker can wrap' : 'Wrap ETH'}
                                            </button>
                                        </>
                                    ) : makerStep > 1 ? (
                                        <div className="text-green-400 text-sm">✓ Completed</div>
                                    ) : null}
                                </div>

                                {/* Step 2: Approve WETH */}
                                <div className={`p-4 rounded-lg ${makerStep === 2 ? 'bg-bg-elevated border border-primary-500/30' : makerStep > 2 ? 'bg-green-900/20 border border-green-500/30' : 'bg-bg-elevated opacity-50'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className={`font-medium ${makerStep >= 2 ? 'text-white' : 'text-gray-500'}`}>Step 2: Approve WETH</h3>
                                        {txHistory.makerApprove && <TxLink hash={txHistory.makerApprove} label="TX" />}
                                    </div>
                                    <p className="text-gray-400 text-sm mb-3">Allow escrow to spend your WETH</p>
                                    {makerStep === 2 ? (
                                        <button onClick={handleApproveWETH} disabled={isLoading || !isMaker} className={`w-full py-2.5 rounded-lg font-medium ${isMaker ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                                            {isLoading ? 'Processing...' : 'Approve WETH'}
                                        </button>
                                    ) : makerStep > 2 ? (
                                        <div className="text-green-400 text-sm">✓ Completed</div>
                                    ) : (
                                        <button disabled className="w-full py-2.5 rounded-lg font-medium bg-gray-700 text-gray-500 cursor-not-allowed">
                                            Complete Step 1 first
                                        </button>
                                    )}
                                </div>

                                {/* Step 3: Lock WETH */}
                                <div className={`p-4 rounded-lg ${makerStep === 3 ? 'bg-bg-elevated border border-primary-500/30' : makerStep > 3 ? 'bg-green-900/20 border border-green-500/30' : 'bg-bg-elevated opacity-50'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className={`font-medium ${makerStep >= 3 ? 'text-white' : 'text-gray-500'}`}>Step 3: Lock WETH</h3>
                                        {txHistory.makerLock && <TxLink hash={txHistory.makerLock} label="TX" />}
                                    </div>
                                    <p className="text-gray-400 text-sm mb-3">Lock your WETH in the escrow contract</p>
                                    {makerStep === 3 ? (
                                        <button onClick={handleMakerLock} disabled={isLoading || !isMaker} className={`w-full py-2.5 rounded-lg font-medium ${isMaker ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                                            {isLoading ? 'Processing...' : 'Lock WETH'}
                                        </button>
                                    ) : makerStep > 3 ? (
                                        <div className="text-green-400 text-sm">✓ Completed</div>
                                    ) : (
                                        <button disabled className="w-full py-2.5 rounded-lg font-medium bg-gray-700 text-gray-500 cursor-not-allowed">
                                            Complete previous steps first
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!isMaker && isConnected && (
                                <p className="text-yellow-400 text-sm mt-4 text-center">⚠️ Waiting for Maker to lock WETH</p>
                            )}
                        </div>
                    )}

                    {/* Taker Steps (Status 1) */}
                    {currentStatus === 1 && (
                        <div id="phase-details-2" className="bg-bg-card border border-gray-800 rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Taker: Lock USDC</h2>

                            {/* Step Progress */}
                            <div className="flex items-center gap-2 mb-6">
                                {TAKER_STEPS.map((step, idx) => (
                                    <div key={step.id} className="flex items-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${takerStep > step.id ? 'bg-green-500' : takerStep === step.id ? 'bg-primary-500' : 'bg-gray-700'
                                            }`}>
                                            {takerStep > step.id ? <CheckCircle className="w-5 h-5 text-white" /> : <span className="text-white text-sm">{step.id}</span>}
                                        </div>
                                        {idx < TAKER_STEPS.length - 1 && (
                                            <div className={`w-12 h-0.5 ${takerStep > step.id ? 'bg-green-500' : 'bg-gray-700'}`} />
                                        )}
                                    </div>
                                ))}
                            </div>
                            {/* All Steps - show completed with TX links, current active, future disabled */}
                            <div className="space-y-4">
                                {/* Step 1: Approve USDC */}
                                <div className={`p-4 rounded-lg ${takerStep === 1 ? 'bg-bg-elevated border border-primary-500/30' : takerStep > 1 ? 'bg-green-900/20 border border-green-500/30' : 'bg-bg-elevated opacity-50'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className={`font-medium ${takerStep >= 1 ? 'text-white' : 'text-gray-500'}`}>Step 1: Approve USDC</h3>
                                        {txHistory.takerApprove && <TxLink hash={txHistory.takerApprove} label="TX" />}
                                    </div>
                                    <p className="text-gray-400 text-sm mb-3">
                                        Approve {details ? formatUnits(details.amountB, 6) : '...'} USDC
                                    </p>
                                    {takerStep === 1 ? (
                                        <>
                                            <div className="text-sm text-gray-500 mb-3">
                                                Your USDC: {usdcBalance ? parseFloat(usdcBalance.formatted).toFixed(2) : '...'} USDC
                                            </div>
                                            <button onClick={handleApproveUSDC} disabled={isLoading || !isTaker} className={`w-full py-2.5 rounded-lg font-medium ${isTaker ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                                                {isLoading ? 'Processing...' : !isTaker ? 'Only Taker can approve' : 'Approve USDC'}
                                            </button>
                                        </>
                                    ) : takerStep > 1 ? (
                                        <div className="text-green-400 text-sm">✓ Completed</div>
                                    ) : null}
                                </div>

                                {/* Step 2: Lock USDC */}
                                <div className={`p-4 rounded-lg ${takerStep === 2 ? 'bg-bg-elevated border border-primary-500/30' : takerStep > 2 ? 'bg-green-900/20 border border-green-500/30' : 'bg-bg-elevated opacity-50'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className={`font-medium ${takerStep >= 2 ? 'text-white' : 'text-gray-500'}`}>Step 2: Lock USDC</h3>
                                        {txHistory.takerLock && <TxLink hash={txHistory.takerLock} label="TX" />}
                                    </div>
                                    <p className="text-gray-400 text-sm mb-3">Lock your USDC in the escrow</p>
                                    {takerStep === 2 ? (
                                        <button onClick={handleTakerLock} disabled={isLoading || !isTaker} className={`w-full py-2.5 rounded-lg font-medium ${isTaker ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
                                            {isLoading ? 'Processing...' : 'Lock USDC'}
                                        </button>
                                    ) : takerStep > 2 ? (
                                        <div className="text-green-400 text-sm">✓ Completed</div>
                                    ) : (
                                        <button disabled className="w-full py-2.5 rounded-lg font-medium bg-gray-700 text-gray-500 cursor-not-allowed">
                                            Complete Step 1 first
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!isTaker && isConnected && (
                                <p className="text-yellow-400 text-sm mt-4 text-center">⚠️ Waiting for Taker to lock USDC</p>
                            )}

                            {/* Maker can cancel during MAKER_LOCKED (before taker locks) */}
                            {isMaker && (
                                <div className="mt-4 pt-4 border-t border-gray-700">
                                    <button
                                        onClick={handleRefund}
                                        disabled={isLoading}
                                        className="w-full py-2.5 border border-red-500/30 text-red-400 rounded-lg font-medium hover:bg-red-500/10 disabled:opacity-50"
                                    >
                                        Cancel Trade & Get Refund
                                    </button>
                                    <p className="text-xs text-gray-500 mt-2 text-center">
                                        As maker, you can cancel before taker locks
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Settlement (Status 2) */}
                    {currentStatus === 2 && (
                        <div id="phase-details-3" className="bg-bg-card border border-gray-800 rounded-xl p-6">
                            <h2 className="text-lg font-semibold text-white mb-4">Ready for Settlement</h2>
                            <p className="text-gray-400 mb-6">Both assets are locked. Execute the atomic swap.</p>

                            <div className="grid sm:grid-cols-2 gap-4 mb-6">
                                <div className="p-4 bg-bg-elevated rounded-lg text-center">
                                    <span className="text-gray-400 text-sm">Maker Sends</span>
                                    <p className="text-xl font-bold text-white mt-1">{details ? formatUnits(details.amountA, 18) : '...'} WETH</p>
                                </div>
                                <div className="p-4 bg-bg-elevated rounded-lg text-center">
                                    <span className="text-gray-400 text-sm">Taker Sends</span>
                                    <p className="text-xl font-bold text-white mt-1">{details ? formatUnits(details.amountB, 6) : '...'} USDC</p>
                                </div>
                            </div>

                            {/* Deadline info for refund */}
                            {details && (
                                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
                                    <span className="text-yellow-300">⏰ Refund available after deadline: </span>
                                    <span className="text-white font-medium">
                                        {new Date(Number(details.deadline) * 1000).toLocaleString()}
                                    </span>
                                    {Number(details.deadline) * 1000 < Date.now() ? (
                                        <span className="text-green-400 ml-2">✓ Deadline passed - refund available</span>
                                    ) : (
                                        <span className="text-gray-400 ml-2">(not yet)</span>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-4">
                                <button onClick={handleSettle} disabled={isLoading} className="flex-1 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:opacity-50">
                                    {isLoading ? 'Processing...' : 'Execute Trade'}
                                </button>
                                <button
                                    onClick={handleRefund}
                                    disabled={isLoading || Boolean(details && Number(details.deadline) * 1000 > Date.now())}
                                    className={`py-3 px-6 border rounded-lg font-medium ${details && Number(details.deadline) * 1000 > Date.now()
                                        ? 'border-gray-600 text-gray-500 cursor-not-allowed'
                                        : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                                        } disabled:opacity-50`}
                                    title={details && Number(details.deadline) * 1000 > Date.now() ? 'Refund only available after deadline' : 'Cancel and refund both parties'}
                                >
                                    Cancel & Refund
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Complete (Status 3) */}
                    {currentStatus === 3 && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
                            <div className="text-center mb-6">
                                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-green-400 mb-2">Trade Complete!</h2>
                                <p className="text-gray-300">The atomic swap executed successfully. Assets have been exchanged.</p>
                            </div>

                            {/* Trade Breakdown */}
                            {details && (
                                <div className="space-y-4">
                                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Settlement Summary</h3>

                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <div className="p-4 bg-bg-dark/50 rounded-lg border border-green-500/20">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-green-400">→</span>
                                                <span className="text-gray-400 text-sm">Taker Received</span>
                                            </div>
                                            <p className="text-xl font-bold text-white">{formatUnits(details.amountA, 18)} WETH</p>
                                            <p className="text-xs text-gray-500 mt-1">From Maker</p>
                                        </div>

                                        <div className="p-4 bg-bg-dark/50 rounded-lg border border-green-500/20">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-green-400">→</span>
                                                <span className="text-gray-400 text-sm">Maker Received</span>
                                            </div>
                                            <p className="text-xl font-bold text-white">
                                                {formatUnits(BigInt(Math.floor(Number(details.amountB) * 0.95)), 6)} USDC
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">After 5% platform fee</p>
                                        </div>
                                    </div>

                                    {/* Platform Fee Info */}
                                    <div className="p-3 bg-bg-dark/30 rounded-lg flex items-center justify-between text-sm">
                                        <span className="text-gray-400">Platform Fee (5%)</span>
                                        <span className="text-primary-400 font-medium">
                                            {formatUnits(BigInt(Math.floor(Number(details.amountB) * 0.05)), 6)} USDC
                                        </span>
                                    </div>

                                    {/* Settlement TX Link */}
                                    {txHistory.settle && (
                                        <div className="flex items-center justify-center gap-2 pt-2">
                                            <span className="text-gray-400 text-sm">Settlement TX:</span>
                                            <a
                                                href={`${ETHERSCAN_BASE}/tx/${txHistory.settle}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1"
                                            >
                                                {txHistory.settle.slice(0, 10)}...
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Refunded (Status 4) */}
                    {currentStatus === 4 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-8 text-center">
                            <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-yellow-400 mb-2">Trade Refunded</h2>
                            <p className="text-gray-300">This trade was cancelled. All assets have been returned.</p>
                        </div>
                    )}

                    {/* Trade Details */}
                    <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Trade Details</h2>
                        {details ? (
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Maker</span>
                                    <a
                                        href={`${ETHERSCAN_BASE}/address/${details.maker}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-1"
                                    >
                                        {formatAddress(details.maker)}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Taker</span>
                                    <a
                                        href={`${ETHERSCAN_BASE}/address/${details.taker}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-1"
                                    >
                                        {formatAddress(details.taker)}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">WETH Amount</span>
                                    <p className="text-white mt-1">{formatUnits(details.amountA, 18)} WETH</p>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">USDC Amount</span>
                                    <p className="text-white mt-1">{formatUnits(details.amountB, 6)} USDC</p>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Deadline</span>
                                    <p className={`mt-1 ${isExpired ? 'text-red-400' : 'text-white'}`}>
                                        {new Date(Number(details.deadline) * 1000).toLocaleString()}
                                        {isExpired && ' (Expired)'}
                                    </p>
                                </div>
                                <div className="p-3 bg-bg-elevated rounded-lg">
                                    <span className="text-gray-400">Escrow Contract</span>
                                    <a
                                        href={`${ETHERSCAN_BASE}/address/${escrowAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-1"
                                    >
                                        {formatAddress(escrowAddress || '')}
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">Loading trade details...</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OTCOfferProcess;
