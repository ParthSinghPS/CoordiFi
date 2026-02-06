import { useState, useEffect, useCallback } from 'react';
import { useAccount, useTransactionReceipt } from 'wagmi';
import { Plus, TrendingUp, ArrowUpDown, Clock, AlertTriangle, ExternalLink, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatusLegend } from '@/components/ui/StatusLegend';

import { useSupreme } from '@/hooks/useSupreme';
import { formatAmount, formatDeadline, CoordinationStatus, PLATFORM, calculateDeadline, parseAmount, LINKS } from '@/utils/constants';
import { getMockPrice, validateOTCPrice, formatPriceWithDeviation, useUniswapPrice } from '@/lib/uniswap';
import { CONTRACTS } from '@/lib/contracts';
import { otcOffers as supabaseOTC, OTCOfferDB } from '@/lib/supabase';


// Token addresses on Sepolia
// Use centralized CONTRACTS for consistency
const TOKENS = {
    ETH: CONTRACTS.WETH as `0x${string}`, // WETH on Sepolia (used for ETH trades)
    USDC: CONTRACTS.USDC as `0x${string}`,
    WETH: CONTRACTS.WETH as `0x${string}`,
};

interface OTCOffer {
    id: number;
    escrowAddress?: `0x${string}`;
    maker: string;
    makerAddress?: `0x${string}`;
    sellToken: string;
    sellAmount: bigint;
    buyToken: string;
    buyAmount: bigint;
    deadline: number;
    status: number;
    toleranceBPS: number;
    makerStep?: number; // 0=need wrap, 1=need approve, 2=need lock, 3=locked
    takerStep?: number; // 0=need approve, 1=need lock, 2=locked
    // TX history
    txHistory?: {
        deployTx?: string;
        wrapTx?: string;
        makerApproveTx?: string;
        makerLockTx?: string;
        takerApproveTx?: string;
        takerLockTx?: string;
        settleTx?: string;
    };
}

// Demo offers - updated Jan 26, 2026
const mockOffers: OTCOffer[] = [
    {
        id: 1,
        maker: '0xAlice...',
        sellToken: 'ETH',
        sellAmount: BigInt(1 * 10 ** 18),
        buyToken: 'USDC',
        buyAmount: BigInt(2800 * 10 ** 6), // Selling 1 ETH for 2800 USDC
        deadline: Date.now() / 1000 + 12 * 60 * 60,
        status: CoordinationStatus.NONE,
        toleranceBPS: 500,
    },
    {
        id: 2,
        maker: '0xBob...',
        sellToken: 'WETH',
        sellAmount: BigInt(0.5 * 10 ** 18),
        buyToken: 'USDC',
        buyAmount: BigInt(1400 * 10 ** 6), // 0.5 WETH for 1400 USDC
        deadline: Date.now() / 1000 + 6 * 60 * 60,
        status: CoordinationStatus.NONE,
        toleranceBPS: 500,
    },
];

export function OTCTrade() {
    const { address, isConnected } = useAccount();

    const { deployOTCEscrow, isLoading: deployLoading, pendingTx, clearPendingTx } = useSupreme();

    const [deployingOfferId, setDeployingOfferId] = useState<number | null>(null);

    // OFFERS STATE - now loaded from Supabase
    const [offers, setOffers] = useState<OTCOffer[]>(mockOffers);
    const [isLoadingOffers, setIsLoadingOffers] = useState(true);

    // Load offers from Supabase on mount
    const loadOffers = useCallback(async () => {
        try {
            setIsLoadingOffers(true);
            const dbOffers = await supabaseOTC.getAll();

            // Convert DB format to local format
            const converted: OTCOffer[] = dbOffers.map((o, idx) => ({
                id: idx + 100, // Offset to avoid mock ID collision
                escrowAddress: o.escrow_address as `0x${string}` | undefined,
                maker: o.maker_address ? `${o.maker_address.slice(0, 6)}...${o.maker_address.slice(-4)}` : '0x...',
                makerAddress: o.maker_address as `0x${string}`,
                sellToken: o.sell_token,
                sellAmount: BigInt(o.sell_amount),
                buyToken: o.buy_token,
                buyAmount: BigInt(o.buy_amount),
                deadline: o.deadline ? new Date(o.deadline).getTime() / 1000 : Date.now() / 1000 + 86400,
                status: o.status === 'created' ? CoordinationStatus.NONE
                    : o.status === 'locked' ? CoordinationStatus.LOCKED
                        : o.status === 'funded' ? CoordinationStatus.FUNDED
                            : o.status === 'verified' ? CoordinationStatus.VERIFIED
                                : o.status === 'settled' ? CoordinationStatus.SETTLED
                                    : CoordinationStatus.NONE,
                toleranceBPS: (o.tolerance_percent || 5) * 100,
                txHistory: {
                    deployTx: o.deploy_tx || undefined,
                    makerLockTx: o.maker_lock_tx || undefined,
                    takerLockTx: o.taker_lock_tx || undefined,
                    settleTx: o.settle_tx || undefined,
                },
            }));

            // Merge with mock offers
            setOffers([...mockOffers, ...converted]);
            console.log('[OTCTrade] Loaded', converted.length, 'offers from Supabase');
        } catch (err) {
            console.error('[OTCTrade] Failed to load offers:', err);
        } finally {
            setIsLoadingOffers(false);
        }
    }, []);

    useEffect(() => {
        loadOffers();
    }, [loadOffers]);

    // Category filter: 'active' or 'completed'
    const [categoryFilter, setCategoryFilter] = useState<'active' | 'completed'>('active');

    // Filter offers by category
    const filteredOffers = offers.filter(o => {
        // SETTLED (status 7) = completed
        const isCompleted = o.status === CoordinationStatus.SETTLED;
        return categoryFilter === 'completed' ? isCompleted : !isCompleted;
    });

    // Watch for deploy TX receipt to extract escrow address
    const { data: receipt, isSuccess: isConfirmed } = useTransactionReceipt({
        hash: pendingTx ?? undefined,
    });

    // Extract escrow address from deploy receipt
    useEffect(() => {
        if (isConfirmed && receipt && deployingOfferId !== null) {
            console.log('[OTC] TX confirmed, extracting escrow address...');
            console.log('[OTC] Receipt logs:', receipt.logs);

            let escrowAddress: `0x${string}` | null = null;

            // OTCEscrowDeployed event has escrow address as indexed topic
            for (const log of receipt.logs) {
                if (log.topics.length >= 4) {
                    // topic[2] is the escrow address
                    const escrowTopic = log.topics[2];
                    if (escrowTopic) {
                        escrowAddress = `0x${escrowTopic.slice(-40)}` as `0x${string}`;
                        console.log('[OTC] Found escrow address:', escrowAddress);
                        break;
                    }
                }
            }

            if (escrowAddress) {
                setOffers(prevOffers => prevOffers.map(o =>
                    o.id === deployingOfferId
                        ? { ...o, escrowAddress, status: CoordinationStatus.LOCKED }
                        : o
                ));
                console.log('[OTC] ✅ Escrow address saved:', escrowAddress);
            } else {
                console.error('[OTC] ❌ Could not find escrow address in logs');
            }

            setDeployingOfferId(null);
            clearPendingTx();
        }
    }, [isConfirmed, receipt, deployingOfferId, clearPendingTx]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isTakeModalOpen, setIsTakeModalOpen] = useState(false);
    const [selectedOffer, setSelectedOffer] = useState<OTCOffer | null>(null);
    const [isCreating, setIsCreating] = useState(false); // Prevent double-submission

    // Create offer form
    const [newOffer, setNewOffer] = useState({
        sellToken: 'ETH',
        sellAmount: '',
        buyToken: 'USDC',
        buyAmount: '',
        toleranceBPS: '5', // 5%
        deadlineHours: '12',
    });

    // Calculate price info with live market price
    const getOfferPriceInfo = (offer: OTCOffer, liveMarketPrice: number) => {
        const agreedPrice = Number(offer.buyAmount) / Number(offer.sellAmount) *
            (offer.sellToken === 'ETH' ? 10 ** 12 : 10 ** 2);
        const validation = validateOTCPrice(agreedPrice, liveMarketPrice, PLATFORM.PRICE_TOLERANCE_BPS / 100);
        return { agreedPrice, validation };
    };

    // Supabase sync: offers are saved directly when created/updated, no localStorage needed

    // Handle create offer
    const handleCreateOffer = async () => {
        // Guard against double-submission (React StrictMode calls twice in dev)
        if (isCreating) {
            console.log('[OTCTrade] ⚠️ Already creating, skipping duplicate call');
            return;
        }
        setIsCreating(true);

        try {
            const offer: OTCOffer = {
                id: offers.length + 1,
                maker: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '0x...',
                makerAddress: address,
                sellToken: newOffer.sellToken,
                sellAmount: parseAmount(newOffer.sellAmount, 18),
                buyToken: newOffer.buyToken,
                buyAmount: parseAmount(newOffer.buyAmount, 6),
                deadline: calculateDeadline(parseInt(newOffer.deadlineHours)),
                status: CoordinationStatus.NONE,
                toleranceBPS: parseInt(newOffer.toleranceBPS) * 100,
            };
            // Save to Supabase using createOrUpdate to prevent duplicates
            const dbOffer: OTCOfferDB = {
                maker_address: address!,
                sell_token: newOffer.sellToken,
                sell_amount: offer.sellAmount.toString(),
                buy_token: newOffer.buyToken,
                buy_amount: offer.buyAmount.toString(),
                tolerance_percent: parseFloat(newOffer.toleranceBPS),
                deadline: new Date(offer.deadline * 1000).toISOString(),
                status: 'created',
            };

            const saved = await supabaseOTC.createOrUpdate(dbOffer);
            if (saved) {
                console.log('[OTCTrade] ✅ Offer saved to Supabase');
            }

            // Reload from Supabase to get fresh data
            await loadOffers();
            setIsCreateModalOpen(false);
            setNewOffer({ sellToken: 'ETH', sellAmount: '', buyToken: 'USDC', buyAmount: '', toleranceBPS: '5', deadlineHours: '12' });
        } finally {
            setIsCreating(false);
        }
    };

    // Handle deploy OTC escrow - REAL on-chain!
    const handleDeployOTCEscrow = async () => {
        if (!selectedOffer || !address) return;

        try {
            console.log('[OTCTrade] Deploying OTC Escrow...');

            const assetA = TOKENS[selectedOffer.sellToken as keyof typeof TOKENS] || TOKENS.ETH;
            const assetB = TOKENS[selectedOffer.buyToken as keyof typeof TOKENS] || TOKENS.USDC;

            const result = await deployOTCEscrow({
                maker: address,
                assetA,
                assetB,
                amountA: selectedOffer.sellAmount,
                amountB: selectedOffer.buyAmount,
                toleranceBPS: selectedOffer.toleranceBPS,
                deadline: Math.floor(selectedOffer.deadline),
            });

            console.log('[OTCTrade] Deploy TX confirmed, escrow:', result.escrowAddress);

            // Update offer with status AND escrow address + deploy TX
            setOffers(prevOffers => prevOffers.map(o =>
                o.id === selectedOffer.id
                    ? {
                        ...o,
                        status: CoordinationStatus.LOCKED,
                        escrowAddress: result.escrowAddress || undefined,
                        txHistory: { ...o.txHistory, deployTx: result.hash }
                    }
                    : o
            ));

            // Sync to Supabase - UPDATE existing offer with escrow address and status
            if (result.escrowAddress && selectedOffer.makerAddress) {
                // Update the existing offer by maker + sell_amount (unique key)
                const success = await supabaseOTC.updateByMakerAndAmount(
                    selectedOffer.makerAddress,
                    selectedOffer.sellAmount.toString(),
                    {
                        escrow_address: result.escrowAddress,
                        status: 'locked',
                        deploy_tx: result.hash,
                    }
                );
                if (success) {
                    console.log('[OTCTrade] ✅ Updated existing offer in Supabase');
                } else {
                    console.warn('[OTCTrade] ⚠️ Could not update offer - creating new');
                }
            }

            // Close modal and show success
            setIsTakeModalOpen(false);
            clearPendingTx();

            if (result.escrowAddress) {
                alert(`✅ OTC Escrow Deployed!\n\nEscrow: ${result.escrowAddress.slice(0, 10)}...\n\nNow lock your ${selectedOffer.sellToken} as maker.`);
            } else {
                alert(`✅ Escrow Deployed!\n\nTX: ${result.hash.slice(0, 10)}...\n\n⚠️ Could not auto-extract escrow address.`);
            }

        } catch (error) {
            console.error('[OTCTrade] Deploy failed:', error);
            alert('Failed to deploy OTC escrow. Check console for details.');
        }
    };

    // Check if current user is platform admin
    const isPlatformAdmin = address?.toLowerCase() === PLATFORM.ADMIN_ADDRESS.toLowerCase();

    // Handle delete offer (admin only)
    const handleDeleteOffer = async (offer: OTCOffer) => {
        if (!isPlatformAdmin) return;

        // Check if this is a Supabase offer (has makerAddress) vs mock offer
        const isFromSupabase = !!offer.makerAddress;
        if (!isFromSupabase) {
            alert('Cannot delete mock offers. They are hardcoded demo data.');
            return;
        }

        if (window.confirm('Delete this offer?\n\n⚠️ This will permanently remove it from the database (not blockchain).')) {
            let success = false;

            if (offer.escrowAddress) {
                // Has escrow deployed - delete by escrow address
                success = await supabaseOTC.deleteByEscrow(offer.escrowAddress);
            } else {
                // No escrow deployed - delete by maker + amount
                success = await supabaseOTC.deleteByMakerAndAmount(
                    offer.makerAddress!,
                    offer.sellAmount.toString()
                );
            }

            if (success) {
                // Remove from local state
                if (offer.escrowAddress) {
                    setOffers(offers.filter(o => o.escrowAddress !== offer.escrowAddress));
                } else {
                    setOffers(offers.filter(o =>
                        !(o.makerAddress === offer.makerAddress && o.sellAmount === offer.sellAmount)
                    ));
                }
                console.log('[OTCTrade] Offer deleted from Supabase');
            } else {
                alert('Failed to delete. Check console for details.');
            }
        }
    };

    // Offer Card component with live price updates
    const OfferCard = ({ offer }: { offer: OTCOffer }) => {
        const { price: livePrice, loading: priceLoading } = useUniswapPrice(
            offer.sellToken === 'WETH' ? 'ETH' : offer.sellToken,
            offer.buyToken,
            30000 // Update every 30s
        );

        const marketPrice = livePrice || 2865; // Fallback
        const { agreedPrice, validation } = getOfferPriceInfo(offer, marketPrice);
        const priceDisplay = formatPriceWithDeviation(validation);

        return (
            <Card key={offer.id} variant="elevated">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-5 h-5 text-primary-400" />
                        <span className="font-semibold text-white">
                            {offer.sellToken} → {offer.buyToken}
                        </span>
                    </div>
                    <StatusBadge status={offer.status} />
                </div>

                {/* Trade Details */}
                <div className="p-4 bg-bg-dark rounded-lg mb-4 space-y-2">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Selling</span>
                        <span className="font-medium text-white">
                            {offer.sellToken === 'ETH'
                                ? formatAmount(offer.sellAmount, 18)
                                : formatAmount(offer.sellAmount, 8)} {offer.sellToken}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">For</span>
                        <span className="font-medium text-white">
                            {formatAmount(offer.buyAmount)} USDC
                        </span>
                    </div>
                </div>

                {/* Price Comparison */}
                <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Market Price {priceLoading && '⏳'}</span>
                        <span className="text-gray-300">${marketPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Agreed Price</span>
                        <span className="text-white">${agreedPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Deviation</span>
                        <span className={priceDisplay.color}>
                            {validation.isValid ? '✓ ' : '⚠ '}
                            {priceDisplay.display}
                        </span>
                    </div>
                </div>

                {/* Meta */}
                <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
                    <span>by {offer.maker}</span>
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDeadline(offer.deadline)}
                    </span>
                </div>

                {/* View Process Page Link */}
                {offer.escrowAddress && (
                    <Link
                        to={`/otc/offer/${offer.escrowAddress}`}
                        className="mb-4 flex items-center justify-center gap-2 py-2 px-4 bg-primary-500/10 border border-primary-500/30 rounded-lg text-primary-400 hover:bg-primary-500/20 transition-colors text-sm"
                    >
                        <Eye className="w-4 h-4" />
                        View Process →
                    </Link>
                )}

                {/* Action Buttons */}
                {offer.status === CoordinationStatus.NONE && (
                    <Button
                        className="w-full"
                        variant={validation.isValid ? 'primary' : 'secondary'}
                        onClick={() => {
                            setSelectedOffer(offer);
                            setIsTakeModalOpen(true);
                        }}
                        disabled={!isConnected}
                    >
                        {validation.isValid ? 'Deploy Escrow' : 'Review Offer'}
                    </Button>
                )}
                {/* After escrow deploy - direct to process page */}
                {offer.status === CoordinationStatus.LOCKED && (
                    <p className="text-xs text-gray-500 text-center py-2">
                        ⏳ Maker needs to complete steps. Use "View Process" above.
                    </p>
                )}

                {/* Taker needs to complete - direct to process page */}
                {offer.status === CoordinationStatus.FUNDED && (
                    <p className="text-xs text-gray-500 text-center py-2">
                        ⏳ Taker needs to complete steps. Use "View Process" above.
                    </p>
                )}
                {/* Both locked - ready for settlement */}
                {offer.status === CoordinationStatus.VERIFIED && (
                    <p className="text-xs text-green-500 text-center py-2">
                        ✅ Ready to settle! Use "View Process" above.
                    </p>
                )}
                {offer.status === CoordinationStatus.SETTLED && (
                    <Button className="w-full" variant="secondary" disabled>
                        ✅ Trade Complete
                    </Button>
                )}

                {/* Admin Delete Button - shows for any Supabase offer */}
                {isPlatformAdmin && offer.makerAddress && (
                    <button
                        onClick={() => handleDeleteOffer(offer)}
                        className="mt-2 w-full py-2 bg-red-500/10 text-red-400 text-xs rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                        🗑️ Delete from Database (Admin)
                    </button>
                )}
            </Card>
        );
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header - Centered like FreelanceHub */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/10 rounded-full text-green-400 text-sm mb-4">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    Atomic Swap Escrow
                </div>
                <h1 className="text-4xl font-bold text-white mb-4">
                    OTC <span className="text-green-400">Trading</span>
                </h1>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-6">
                    Deploy atomic swap escrows. Trade at agreed prices with Uniswap price validation.
                </p>
                <Button
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => setIsCreateModalOpen(true)}
                    disabled={!isConnected}
                >
                    Create Offer
                </Button>
            </div>

            {/* Status Legend */}
            <StatusLegend type="otc" className="mb-6" />

            {/* Info Banner */}
            <Card className="mb-6 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border-blue-500/30">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/30 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white mb-1">Uniswap Price Oracle</h3>
                        <p className="text-sm text-gray-300">
                            All prices validated against Uniswap v3 pools. Trades outside ±{PLATFORM.PRICE_TOLERANCE_BPS / 100}%
                            of market price will be flagged.
                        </p>
                    </div>
                </div>
            </Card>

            {/* Pending TX Banner */}
            {pendingTx && (
                <Card className="mb-6 bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-amber-500/30">
                    <div className="flex items-center gap-4">
                        <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                        <div className="flex-1">
                            <p className="text-amber-400 font-medium">Transaction Pending</p>
                            <a
                                href={`${LINKS.BLOCK_EXPLORER}/tx/${pendingTx}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-amber-300/80 hover:text-amber-200 flex items-center gap-1"
                            >
                                View on Etherscan <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={clearPendingTx}
                        >
                            Dismiss
                        </Button>
                    </div>
                </Card>
            )}

            {/* Category Tabs */}
            <div className="flex border-b border-gray-800 mb-6">
                <button
                    onClick={() => setCategoryFilter('active')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${categoryFilter === 'active'
                        ? 'text-primary-400 border-primary-400'
                        : 'text-gray-400 border-transparent hover:text-gray-300'
                        }`}
                >
                    Active Trades
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${categoryFilter === 'active' ? 'bg-primary-500/20' : 'bg-gray-800'
                        }`}>
                        {offers.filter(o => o.status !== CoordinationStatus.SETTLED).length}
                    </span>
                </button>
                <button
                    onClick={() => setCategoryFilter('completed')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${categoryFilter === 'completed'
                        ? 'text-green-400 border-green-400'
                        : 'text-gray-400 border-transparent hover:text-gray-300'
                        }`}
                >
                    Completed Trades
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${categoryFilter === 'completed' ? 'bg-green-500/20' : 'bg-gray-800'
                        }`}>
                        {offers.filter(o => o.status === CoordinationStatus.SETTLED).length}
                    </span>
                </button>
            </div>

            {/* Offers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOffers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </div>

            {/* Create Offer Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create OTC Offer"
                description="Configure a private OTC trade offer"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="input-label">Sell Token</label>
                            <select
                                className="input"
                                value={newOffer.sellToken}
                                onChange={(e) => setNewOffer({ ...newOffer, sellToken: e.target.value })}
                            >
                                <option value="ETH">ETH</option>

                            </select>
                        </div>
                        <Input
                            label="Amount"
                            type="number"
                            placeholder="1.0"
                            value={newOffer.sellAmount}
                            onChange={(e) => setNewOffer({ ...newOffer, sellAmount: e.target.value })}
                        />
                    </div>
                    <Input
                        label="Request (USDC)"
                        type="number"
                        placeholder="1800"
                        value={newOffer.buyAmount}
                        onChange={(e) => setNewOffer({ ...newOffer, buyAmount: e.target.value })}
                        rightAddon="USDC"
                    />
                    <Input
                        label="Price Tolerance (%)"
                        type="number"
                        placeholder="5"
                        value={newOffer.toleranceBPS}
                        onChange={(e) => setNewOffer({ ...newOffer, toleranceBPS: e.target.value })}
                        rightAddon="%"
                        hint="Max deviation from Uniswap price"
                    />
                    <Input
                        label="Deadline (hours)"
                        type="number"
                        placeholder="12"
                        value={newOffer.deadlineHours}
                        onChange={(e) => setNewOffer({ ...newOffer, deadlineHours: e.target.value })}
                    />

                    {/* Price Preview */}
                    {newOffer.sellAmount && newOffer.buyAmount && (
                        <div className="p-3 bg-bg-dark rounded-lg text-sm">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1">
                                    <span className="text-gray-400">Your Price</span>
                                    <span className="text-gray-500 text-xs" title="The exchange rate you're requesting (USDC per ETH). This is the amount you'll receive for your tokens.">ⓘ</span>
                                </div>
                                <span className="text-white">
                                    ${(parseFloat(newOffer.buyAmount) / parseFloat(newOffer.sellAmount)).toFixed(2)}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">This is the price (USDC per ETH) you're requesting to receive for your tokens.</p>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)} className="flex-1">
                            Cancel
                        </Button>
                        <Button onClick={handleCreateOffer} className="flex-1">
                            Create Offer
                        </Button>
                    </div>
                </div>
            </Modal >

            {/* Deploy OTC Escrow Modal */}
            < Modal
                isOpen={isTakeModalOpen}
                onClose={() => setIsTakeModalOpen(false)}
                title="Deploy OTC Escrow"
                size="lg"
            >
                {selectedOffer && (() => {
                    const marketPrice = getMockPrice(`${selectedOffer.sellToken === 'WETH' ? 'ETH' : selectedOffer.sellToken}-${selectedOffer.buyToken}`).price;
                    const { agreedPrice, validation } = getOfferPriceInfo(selectedOffer, marketPrice);
                    const priceDisplay = formatPriceWithDeviation(validation);

                    return (
                        <div className="space-y-4">
                            {/* Warning if price outside tolerance */}
                            {!validation.isValid && (
                                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-400">Price Warning</p>
                                        <p className="text-sm text-amber-300/80">
                                            This offer is {Math.abs(validation.deviationPercent).toFixed(1)}% away from market price.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Trade Summary */}
                            <div className="p-4 bg-bg-dark rounded-lg space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">You Provide</span>
                                    <span className="font-semibold text-white">
                                        {formatAmount(selectedOffer.buyAmount)} USDC
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">You Receive</span>
                                    <span className="font-semibold text-green-400">
                                        {selectedOffer.sellToken === 'ETH'
                                            ? formatAmount(selectedOffer.sellAmount, 18)
                                            : formatAmount(selectedOffer.sellAmount, 8)} {selectedOffer.sellToken}
                                    </span>
                                </div>
                                <hr className="border-gray-700" />
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Market Price</span>
                                    <span className="text-gray-300">${marketPrice.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Agreed Price</span>
                                    <span className={priceDisplay.color}>${agreedPrice.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                <p className="text-sm text-blue-300">
                                    ⚠️ This will deploy a real OTC Escrow contract on Ethereum Sepolia.
                                    Atomic swap ensures you receive tokens or get refunded.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button variant="secondary" onClick={() => setIsTakeModalOpen(false)} className="flex-1">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleDeployOTCEscrow}
                                    isLoading={deployLoading}
                                    className="flex-1"
                                    variant={validation.isValid ? 'primary' : 'danger'}
                                >
                                    {validation.isValid ? 'Deploy Escrow' : 'Proceed Anyway'}
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal >
        </div >
    );
}
