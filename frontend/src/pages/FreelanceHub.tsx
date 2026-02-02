import { useState } from 'react';
import { useAccount } from 'wagmi';

export function FreelanceHub() {
    const { isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<'create' | 'browse'>('browse');

    if (!isConnected) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h1 className="text-3xl font-bold text-white mb-4">Freelance Escrow</h1>
                <p className="text-gray-400 mb-8">Connect your wallet to create or manage projects</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Freelance Hub</h1>
                <p className="text-gray-400">Milestone-based escrow for contractor payments</p>
            </div>

            <div className="flex gap-2 mb-8">
                <button
                    onClick={() => setActiveTab('browse')}
                    className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'browse' ? 'bg-primary-600 text-white' : 'bg-bg-elevated text-gray-400'}`}
                >
                    My Projects
                </button>
                <button
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'create' ? 'bg-primary-600 text-white' : 'bg-bg-elevated text-gray-400'}`}
                >
                    Create Project
                </button>
            </div>

            {activeTab === 'browse' ? <MyProjects /> : <CreateProject />}
        </div>
    );
}

function MyProjects() {
    return (
        <div className="card p-8 text-center">
            <p className="text-gray-400">No projects found. Create one to get started!</p>
        </div>
    );
}

function CreateProject() {
    const [formData, setFormData] = useState({
        contractorAddress: '',
        arbitratorAddress: '',
        milestones: [{ amount: '', deadline: '' }],
    });

    const addMilestone = () => {
        setFormData({
            ...formData,
            milestones: [...formData.milestones, { amount: '', deadline: '' }],
        });
    };

    const updateMilestone = (index: number, field: 'amount' | 'deadline', value: string) => {
        const newMilestones = [...formData.milestones];
        newMilestones[index][field] = value;
        setFormData({ ...formData, milestones: newMilestones });
    };

    return (
        <div className="card p-6 max-w-xl">
            <h2 className="text-xl font-semibold text-white mb-6">Create Freelance Project</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Contractor Address</label>
                    <input
                        type="text"
                        placeholder="0x... or ENS name"
                        value={formData.contractorAddress}
                        onChange={e => setFormData({ ...formData, contractorAddress: e.target.value })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Arbitrator Address (optional)</label>
                    <input
                        type="text"
                        placeholder="0x... or ENS name"
                        value={formData.arbitratorAddress}
                        onChange={e => setFormData({ ...formData, arbitratorAddress: e.target.value })}
                        className="input w-full"
                    />
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-2">Milestones</label>
                    {formData.milestones.map((milestone, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                            <input
                                type="number"
                                placeholder="Amount (USDC)"
                                value={milestone.amount}
                                onChange={e => updateMilestone(i, 'amount', e.target.value)}
                                className="input"
                            />
                            <input
                                type="datetime-local"
                                value={milestone.deadline}
                                onChange={e => updateMilestone(i, 'deadline', e.target.value)}
                                className="input"
                            />
                        </div>
                    ))}
                    <button type="button" onClick={addMilestone} className="text-primary-400 text-sm">
                        + Add Milestone
                    </button>
                </div>

                <button className="btn-primary w-full mt-4">Create Project</button>
            </div>
        </div>
    );
}
