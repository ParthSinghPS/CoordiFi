import { useState, useEffect } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import toast from 'react-hot-toast';
import { freelanceProjects, FreelanceProjectDB } from '../lib/supabase';
import { resolveENSName, formatAddress } from '../lib/ens';
import { CONTRACTS, SUPREME_FACTORY_ABI, ERC20_ABI, FREELANCE_ESCROW_ABI } from '../lib/contracts';

interface Project {
    id: string;
    escrowAddress: string;
    title: string;
    description?: string;
    clientAddress: string;
    contractorAddress: string;
    totalAmount: string;
    status: string;
}

export function FreelanceHub() {
    const { address, isConnected } = useAccount();
    const [activeTab, setActiveTab] = useState<'create' | 'browse'>('browse');
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    const loadProjects = async () => {
        try {
            setLoading(true);
            const dbProjects = await freelanceProjects.getAll();
            const converted: Project[] = dbProjects.map(p => ({
                id: p.id || '',
                escrowAddress: p.escrow_address,
                title: p.title,
                description: p.description,
                clientAddress: p.client_address,
                contractorAddress: p.contractor_address,
                totalAmount: p.total_amount,
                status: p.status,
            }));
            setProjects(converted);
        } catch (err) {
            console.error('Failed to load projects:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

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

            {activeTab === 'browse' ? (
                <MyProjects projects={projects} loading={loading} onRefresh={loadProjects} />
            ) : (
                <CreateProject onCreated={() => { loadProjects(); setActiveTab('browse'); }} />
            )}
        </div>
    );
}

function MyProjects({ projects, loading, onRefresh }: { projects: Project[]; loading: boolean; onRefresh: () => void }) {
    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const [releasingMilestone, setReleasingMilestone] = useState<string | null>(null);

    const myProjects = projects.filter(p =>
        p.clientAddress.toLowerCase() === address?.toLowerCase() ||
        p.contractorAddress.toLowerCase() === address?.toLowerCase()
    );

    const handleReleaseMilestone = async (project: Project, milestoneIndex: number) => {
        try {
            setReleasingMilestone(`${project.id}-${milestoneIndex}`);

            await writeContractAsync({
                address: project.escrowAddress as `0x${string}`,
                abi: FREELANCE_ESCROW_ABI,
                functionName: 'releaseMilestone',
                args: [BigInt(milestoneIndex)],
            });

            toast.success('Milestone released!');
            onRefresh();
        } catch (err: any) {
            toast.error(err.shortMessage || 'Failed to release milestone');
        } finally {
            setReleasingMilestone(null);
        }
    };

    if (loading) {
        return <div className="card p-8 text-center"><p className="text-gray-400">Loading...</p></div>;
    }

    if (myProjects.length === 0) {
        return <div className="card p-8 text-center"><p className="text-gray-400">No projects found. Create one!</p></div>;
    }

    return (
        <div className="grid gap-4">
            {myProjects.map(project => (
                <div key={project.id} className="card p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-lg font-semibold text-white">{project.title}</h3>
                            {project.description && (
                                <p className="text-sm text-gray-400 mt-1">{project.description}</p>
                            )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${
                            project.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            project.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-400'
                        }`}>
                            {project.status}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                            <span className="text-gray-500">Client:</span>
                            <span className="text-gray-300 ml-2">
                                {formatAddress(project.clientAddress)}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-500">Contractor:</span>
                            <span className="text-gray-300 ml-2">
                                {formatAddress(project.contractorAddress)}
                            </span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-primary-400">
                            {project.totalAmount} USDC
                        </span>
                        {project.status === 'active' && project.clientAddress.toLowerCase() === address?.toLowerCase() && (
                            <button
                                onClick={() => handleReleaseMilestone(project, 0)}
                                disabled={releasingMilestone === `${project.id}-0`}
                                className="btn-primary text-sm"
                            >
                                {releasingMilestone === `${project.id}-0` ? 'Releasing...' : 'Release Next Milestone'}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function CreateProject({ onCreated }: { onCreated: () => void }) {
    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResolvingENS, setIsResolvingENS] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
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

    const resolveContractorAddress = async () => {
        const input = formData.contractorAddress.trim();
        if (!input.endsWith('.eth')) return input;

        setIsResolvingENS(true);
        try {
            const resolved = await resolveENSName(input);
            if (resolved) {
                toast.success(`Resolved ${input} to ${resolved.slice(0, 10)}...`);
                return resolved;
            } else {
                toast.error('Could not resolve ENS name');
                return null;
            }
        } finally {
            setIsResolvingENS(false);
        }
    };

    const handleCreate = async () => {
        if (!address) return;

        try {
            setIsSubmitting(true);

            const contractorAddr = await resolveContractorAddress();
            if (!contractorAddr) return;

            const milestoneAmounts = formData.milestones.map(m =>
                parseUnits(m.amount || '0', 6)
            );
            const milestoneDeadlines = formData.milestones.map(m =>
                BigInt(Math.floor(new Date(m.deadline).getTime() / 1000))
            );

            const totalAmount = milestoneAmounts.reduce((a, b) => a + b, 0n);

            await writeContractAsync({
                address: CONTRACTS.USDC as `0x${string}`,
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [CONTRACTS.SUPREME_FACTORY as `0x${string}`, totalAmount],
            });

            const arbitrator = formData.arbitratorAddress || address;

            const tx = await writeContractAsync({
                address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
                abi: SUPREME_FACTORY_ABI,
                functionName: 'createFreelanceEscrow',
                args: [
                    CONTRACTS.USDC as `0x${string}`,
                    contractorAddr as `0x${string}`,
                    arbitrator as `0x${string}`,
                    milestoneAmounts,
                    milestoneDeadlines,
                    true,
                ],
            });

            toast.success('Freelance project created!');

            const totalStr = formData.milestones.reduce((sum, m) => sum + parseFloat(m.amount || '0'), 0).toString();

            await freelanceProjects.create({
                escrow_address: 'pending',
                title: formData.title,
                description: formData.description,
                client_address: address,
                contractor_address: contractorAddr,
                total_amount: totalStr,
                status: 'active',
            });

            onCreated();
        } catch (err: any) {
            toast.error(err.shortMessage || 'Failed to create project');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="card p-6 max-w-xl">
            <h2 className="text-xl font-semibold text-white mb-6">Create Freelance Project</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Project Title</label>
                    <input
                        type="text"
                        placeholder="Website Redesign"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        className="input w-full"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Description (optional)</label>
                    <textarea
                        placeholder="Project details..."
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        className="input w-full h-20"
                    />
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Contractor Address or ENS</label>
                    <input
                        type="text"
                        placeholder="0x... or vitalik.eth"
                        value={formData.contractorAddress}
                        onChange={e => setFormData({ ...formData, contractorAddress: e.target.value })}
                        className="input w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Supports ENS names like vitalik.eth</p>
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-2">Arbitrator Address (optional)</label>
                    <input
                        type="text"
                        placeholder="0x... (defaults to you)"
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

                <button
                    onClick={handleCreate}
                    disabled={isSubmitting || isResolvingENS}
                    className="btn-primary w-full mt-4"
                >
                    {isSubmitting ? 'Creating...' : isResolvingENS ? 'Resolving ENS...' : 'Create Project'}
                </button>
            </div>
        </div>
    );
}
