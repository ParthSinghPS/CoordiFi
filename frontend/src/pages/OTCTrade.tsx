import { useState } from 'react';
import { useAccount } from 'wagmi';

export function OTCTrade() {
    const { isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<'create' | 'browse'>('browse');

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

            {activeTab === 'browse' ? <BrowseOffers /> : <CreateOffer />}
        </div>
    );
}

function BrowseOffers() {
    return (
        <div className="card p-8 text-center">
            <p className="text-gray-400">No active offers found. Create one to get started!</p>
        </div>
    );
}

function CreateOffer() {
    const [formData, setFormData] = useState({
        tokenOffered: '',
        tokenWanted: '',
        amountOffered: '',
        minAmountWanted: '',
        maxAmountWanted: '',
        deadline: '',
    });

    return (
        <div className="card p-6 max-w-xl">
            <h2 className="text-xl font-semibold text-white mb-6">Create OTC Offer</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Token You're Offering</label>
                    <select
                        value={formData.tokenOffered}
                        onChange={e => setFormData({ ...formData, tokenOffered: e.target.value })}
                        className="input w-full"
                    >
                        <option value="">Select token</option>
                        <option value="WETH">WETH</option>
                        <option value="USDC">USDC</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Amount Offered</label>
                    <input
                        type="number"
                        placeholder="1.0"
                        value={formData.amountOffered}
                        onChange={e => setFormData({ ...formData, amountOffered: e.target.value })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Token You Want</label>
                    <select
                        value={formData.tokenWanted}
                        onChange={e => setFormData({ ...formData, tokenWanted: e.target.value })}
                        className="input w-full"
                    >
                        <option value="">Select token</option>
                        <option value="WETH">WETH</option>
                        <option value="USDC">USDC</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Min Amount Wanted</label>
                        <input
                            type="number"
                            placeholder="2500"
                            value={formData.minAmountWanted}
                            onChange={e => setFormData({ ...formData, minAmountWanted: e.target.value })}
                            className="input w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Max Amount Wanted</label>
                        <input
                            type="number"
                            placeholder="3000"
                            value={formData.maxAmountWanted}
                            onChange={e => setFormData({ ...formData, maxAmountWanted: e.target.value })}
                            className="input w-full"
                        />
                    </div>
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
                <button className="btn-primary w-full mt-4">Create Offer</button>
            </div>
        </div>
    );
}
