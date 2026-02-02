import { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import toast from 'react-hot-toast';
import { otcOffers, OTCOfferDB } from '../lib/supabase';
import { CONTRACTS, SUPREME_FACTORY_ABI, ERC20_ABI, OTC_ESCROW_ABI } from '../lib/contracts';

const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
    WETH: { address: CONTRACTS.WETH, symbol: 'WETH', decimals: 18 },
    USDC: { address: CONTRACTS.USDC, symbol: 'USDC', decimals: 6 },
};

interface Offer {
    id: string;
    escrowAddress?: string;
    makerAddress: string;
    sellToken: string;
    sellAmount: string;
    buyToken: string;
    buyAmount: string;
    tolerancePercent: number;
    deadline: string;
    status: string;
}

export function OTCTrade() {
    const { address, isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<'create' | 'browse'>('browse');
    const [offers, setOffers] = useState<Offer[]>([]);
    const [loading, setLoading] = useState(true);

    const loadOffers = async () => {
        try {
            setLoading(true);
            const dbOffers = await otcOffers.getAll();
            const converted: Offer[] = dbOffers.map(o => ({
                id: o.id || '',
                escrowAddress: o.escrow_address,
                makerAddress: o.maker_address,
                sellToken: o.sell_token,
                sellAmount: o.sell_amount,
                buyToken: o.buy_token,
                buyAmount: o.buy_amount,
                tolerancePercent: o.tolerance_percent || 5,
                deadline: o.deadline || '',
                status: o.status,
            }));
            setOffers(converted);
        } catch (err) {
            console.error('Failed to load offers:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOffers();
    }, []);

    if (!isConnected) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h1 className="text-3xl font-bold text-white mb-4">OTC Trading</h1>
                <p className="text-gray-400 mb-8">Connect your wallet to create or take OTC offers</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">OTC Trade</h1>
                <p className="text-gray-400">Trustless peer-to-peer token swaps with price validation</p>
            </div>

            <div className="flex gap-2 mb-8">
                <button
                    onClick={() => setActiveTab('browse')}
                    className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'browse' ? 'bg-primary-600 text-white' : 'bg-bg-elevated text-gray-400'}`}
                >
                    Browse Offers
                </button>
                <button
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'create' ? 'bg-primary-600 text-white' : 'bg-bg-elevated text-gray-400'}`}
                >
                    Create Offer
                </button>
            </div>

            {activeTab === 'browse' ? (
                <BrowseOffers offers={offers} loading={loading} onRefresh={loadOffers} />
            ) : (
                <CreateOffer onCreated={() => { loadOffers(); setActiveTab('browse'); }} />
            )}
        </div>
    );
}

function BrowseOffers({ offers, loading, onRefresh }: { offers: Offer[]; loading: boolean; onRefresh: () => void }) {
    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const [takingOffer, setTakingOffer] = useState<string | null>(null);

    const handleTake = async (offer: Offer) => {
        if (!offer.escrowAddress) {
            toast.error('Escrow not deployed yet');
            return;
        }

        try {
            setTakingOffer(offer.id);

            const buyTokenInfo = Object.values(TOKENS).find(t => t.symbol === offer.buyToken);
            if (!buyTokenInfo) throw new Error('Unknown token');

            const amount = parseUnits(offer.buyAmount, buyTokenInfo.decimals);

            await writeContractAsync({
                address: buyTokenInfo.address as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [offer.escrowAddress as `0x${string}`, amount],
            });
            toast.success('Approval submitted');

            await writeContractAsync({
                address: offer.escrowAddress as `0x${string}`,
                abi: OTC_ESCROW_ABI,
                functionName: 'take',
                args: [amount],
            });
            toast.success('Offer taken!');

            onRefresh();
        } catch (err: any) {
            toast.error(err.shortMessage || 'Failed to take offer');
        } finally {
            setTakingOffer(null);
        }
    };

    if (loading) {
        return <div className="card p-8 text-center"><p className="text-gray-400">Loading...</p></div>;
    }

    if (offers.length === 0) {
        return <div className="card p-8 text-center"><p className="text-gray-400">No offers found. Create one!</p></div>;
    }

    return (
        <div className="grid gap-4">
            {offers.map(offer => (
                <div key={offer.id} className="card p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl font-semibold text-white">
                                    {offer.sellAmount} {offer.sellToken}
                                </span>
                                <span className="text-gray-500">→</span>
                                <span className="text-xl font-semibold text-primary-400">
                                    {offer.buyAmount} {offer.buyToken}
                                </span>
                            </div>
                            <p className="text-sm text-gray-400">
                                Maker: {offer.makerAddress.slice(0, 6)}...{offer.makerAddress.slice(-4)}
                            </p>
                            {offer.escrowAddress && (
                                <p className="text-sm text-gray-500">
                                    Escrow: {offer.escrowAddress.slice(0, 10)}...
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <span className={`px-2 py-1 rounded text-xs ${
                                offer.status === 'open' ? 'bg-green-500/20 text-green-400' :
                                offer.status === 'filled' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                            }`}>
                                {offer.status}
                            </span>
                            <p className="text-sm text-gray-400 mt-2">±{offer.tolerancePercent}% tolerance</p>
                        </div>
                    </div>
                    {offer.status === 'open' && offer.makerAddress.toLowerCase() !== address?.toLowerCase() && (
                        <div className="mt-4">
                            <button
                                onClick={() => handleTake(offer)}
                                disabled={takingOffer === offer.id}
                                className="btn-primary"
                            >
                                {takingOffer === offer.id ? 'Taking...' : 'Take Offer'}
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function CreateOffer({ onCreated }: { onCreated: () => void }) {
    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        sellToken: 'WETH',
        sellAmount: '',
        buyToken: 'USDC',
        buyAmount: '',
        tolerancePercent: '5',
        deadline: '',
    });

    const handleCreate = async () => {
        if (!address) return;

        try {
            setIsSubmitting(true);

            const sellTokenInfo = TOKENS[formData.sellToken];
            const buyTokenInfo = TOKENS[formData.buyToken];
            const deadlineTimestamp = Math.floor(new Date(formData.deadline).getTime() / 1000);

            const sellAmount = parseUnits(formData.sellAmount, sellTokenInfo.decimals);
            const buyAmountMin = parseUnits(formData.buyAmount, buyTokenInfo.decimals);
            const tolerance = BigInt(parseInt(formData.tolerancePercent) * 100);
            const buyAmountMax = buyAmountMin * (10000n + tolerance) / 10000n;

            await writeContractAsync({
                address: sellTokenInfo.address as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [CONTRACTS.SUPREME_FACTORY as `0x${string}`, sellAmount],
            });

            const tx = await writeContractAsync({
                address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
                abi: SUPREME_FACTORY_ABI,
                functionName: 'createOTCEscrow',
                args: [
                    sellTokenInfo.address as `0x${string}`,
                    buyTokenInfo.address as `0x${string}`,
                    sellAmount,
                    buyAmountMin,
                    buyAmountMax,
                    BigInt(deadlineTimestamp),
                    '0x0000000000000000000000000000000000000000' as `0x${string}`,
                    tolerance,
                ],
            });

            toast.success('OTC offer created!');

            await otcOffers.create({
                maker_address: address,
                sell_token: formData.sellToken,
                sell_amount: formData.sellAmount,
                buy_token: formData.buyToken,
                buy_amount: formData.buyAmount,
                tolerance_percent: parseInt(formData.tolerancePercent),
                deadline: formData.deadline,
                status: 'open',
            });

            onCreated();
        } catch (err: any) {
            toast.error(err.shortMessage || 'Failed to create offer');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="card p-6 max-w-xl">
            <h2 className="text-xl font-semibold text-white mb-6">Create OTC Offer</h2>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">You're Selling</label>
                        <select
                            value={formData.sellToken}
                            onChange={e => setFormData({ ...formData, sellToken: e.target.value })}
                            className="input w-full"
                        >
                            {Object.keys(TOKENS).map(token => (
                                <option key={token} value={token}>{token}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Amount</label>
                        <input
                            type="number"
                            placeholder="1.0"
                            value={formData.sellAmount}
                            onChange={e => setFormData({ ...formData, sellAmount: e.target.value })}
                            className="input w-full"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">You Want</label>
                        <select
                            value={formData.buyToken}
                            onChange={e => setFormData({ ...formData, buyToken: e.target.value })}
                            className="input w-full"
                        >
                            {Object.keys(TOKENS).map(token => (
                                <option key={token} value={token}>{token}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Amount</label>
                        <input
                            type="number"
                            placeholder="2500"
                            value={formData.buyAmount}
                            onChange={e => setFormData({ ...formData, buyAmount: e.target.value })}
                            className="input w-full"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Price Tolerance %</label>
                        <input
                            type="number"
                            placeholder="5"
                            value={formData.tolerancePercent}
                            onChange={e => setFormData({ ...formData, tolerancePercent: e.target.value })}
                            className="input w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Deadline</label>
                        <input
                            type="datetime-local"
                            value={formData.deadline}
                            onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                            className="input w-full"
                        />
                    </div>
                </div>
                <button
                    onClick={handleCreate}
                    disabled={isSubmitting}
                    className="btn-primary w-full mt-4"
                >
                    {isSubmitting ? 'Creating...' : 'Create Offer'}
                </button>
            </div>
        </div>
    );
}
