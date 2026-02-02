import { useState } from 'react';
import { useAccount } from 'wagmi';

export function NFTWhitelist() {
    const { isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<'create' | 'browse'>('browse');

    if (!isConnected) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h1 className="text-3xl font-bold text-white mb-4">NFT Whitelist Coordination</h1>
                <p className="text-gray-400 mb-8">Connect your wallet to create or join NFT whitelist pools</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">NFT Whitelist</h1>
                <p className="text-gray-400">Pool funds to coordinate whitelist spots for NFT mints</p>
            </div>

            <div className="flex gap-2 mb-8">
                <button
                    onClick={() => setActiveTab('browse')}
                    className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'browse' ? 'bg-primary-600 text-white' : 'bg-bg-elevated text-gray-400'}`}
                >
                    Browse Pools
                </button>
                <button
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'create' ? 'bg-primary-600 text-white' : 'bg-bg-elevated text-gray-400'}`}
                >
                    Create Pool
                </button>
            </div>

            {activeTab === 'browse' ? <BrowsePools /> : <CreatePool />}
        </div>
    );
}

function BrowsePools() {
    return (
        <div className="card p-8 text-center">
            <p className="text-gray-400">No active pools found. Create one to get started!</p>
        </div>
    );
}

function CreatePool() {
    const [formData, setFormData] = useState({
        nftContract: '',
        pricePerSlot: '',
        totalSlots: '',
        deadline: '',
    });

    return (
        <div className="card p-6 max-w-xl">
            <h2 className="text-xl font-semibold text-white mb-6">Create NFT Whitelist Pool</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-2">NFT Contract Address</label>
                    <input
                        type="text"
                        placeholder="0x..."
                        value={formData.nftContract}
                        onChange={e => setFormData({ ...formData, nftContract: e.target.value })}
                        className="input w-full"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Price per Slot (USDC)</label>
                        <input
                            type="number"
                            placeholder="100"
                            value={formData.pricePerSlot}
                            onChange={e => setFormData({ ...formData, pricePerSlot: e.target.value })}
                            className="input w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Total Slots</label>
                        <input
                            type="number"
                            placeholder="10"
                            value={formData.totalSlots}
                            onChange={e => setFormData({ ...formData, totalSlots: e.target.value })}
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
                <button className="btn-primary w-full mt-4">Create Pool</button>
            </div>
        </div>
    );
}
