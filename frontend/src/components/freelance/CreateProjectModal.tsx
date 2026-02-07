import { useState, useCallback } from 'react';
import { parseEther, zeroAddress } from 'viem';
import { useAccount } from 'wagmi';
import { Link } from 'react-router-dom';
import { useSupreme, DeployFreelanceEscrowParams } from '../../hooks/useSupreme';
import { freelanceProjects, freelanceMilestones, FreelanceProjectDB, FreelanceMilestoneDB } from '@/lib/supabase';

// Worker skill types (for milestones)
const WORKER_TYPES = [
    { value: 'frontend', label: 'Frontend Development', emoji: '🎨' },
    { value: 'backend', label: 'Backend Development', emoji: '⚙️' },
    { value: 'fullstack', label: 'Full Stack Development', emoji: '🔧' },
    { value: 'design', label: 'UI/UX Design', emoji: '✨' },
    { value: 'smart_contract', label: 'Smart Contract', emoji: '📜' },
    { value: 'marketing', label: 'Marketing', emoji: '📣' },
    { value: 'content', label: 'Content Writing', emoji: '✍️' },
    { value: 'qa', label: 'QA Testing', emoji: '🧪' },
    { value: 'devops', label: 'DevOps', emoji: '🚀' },
    { value: 'other', label: 'Other', emoji: '📦' },
] as const;

// Step types
type Step = 1 | 2 | 3;

// Milestone form type
interface MilestoneForm {
    id: string;
    worker: string;
    workerType: string; // Skill type (frontend, backend, etc.)
    amount: string;
    deadline: string; // Date string
    revisionLimit: number;
    description: string;
    dependencies: number[]; // Indices of milestones this depends on (0-based)
}

// Project form type
interface ProjectForm {
    name: string;
    description: string;
    totalBudget: string;
}

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (escrowAddress: `0x${string}`) => void;
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
    const { address } = useAccount();
    const { deployFreelanceEscrow, isLoading: isDeploying } = useSupreme();

    // Form state
    const [step, setStep] = useState<Step>(1);
    const [projectForm, setProjectForm] = useState<ProjectForm>({
        name: '',
        description: '',
        totalBudget: '0.1',
    });
    const [milestones, setMilestones] = useState<MilestoneForm[]>([
        {
            id: crypto.randomUUID(),
            worker: '',
            workerType: 'frontend',
            amount: '0.05',
            deadline: getDefaultDeadline(7),
            revisionLimit: 2,
            description: '',
            dependencies: [],
        },
    ]);
    const [deployedAddress, setDeployedAddress] = useState<`0x${string}` | null>(null);
    const [deployTxHash, setDeployTxHash] = useState<`0x${string}` | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Helper: Get default deadline X days from now
    function getDefaultDeadline(days: number): string {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }

    // Calculate total milestone amount
    const totalMilestoneAmount = milestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);

    // Add milestone
    const addMilestone = useCallback(() => {
        if (milestones.length >= 50) return;
        setMilestones([
            ...milestones,
            {
                id: crypto.randomUUID(),
                worker: '',
                workerType: 'frontend',
                amount: '0.05',
                deadline: getDefaultDeadline(14),
                revisionLimit: 2,
                description: '',
                dependencies: [],
            },
        ]);
    }, [milestones]);

    // Remove milestone and update dependencies
    const removeMilestone = useCallback((id: string) => {
        if (milestones.length <= 1) return;

        // Find the index of the milestone being removed
        const removedIndex = milestones.findIndex(m => m.id === id);

        // Filter out the removed milestone and update dependencies
        const updated = milestones
            .filter((m) => m.id !== id)
            .map((m) => ({
                ...m,
                // Remove the deleted index and decrement indices greater than removed index
                dependencies: m.dependencies
                    .filter(d => d !== removedIndex)
                    .map(d => d > removedIndex ? d - 1 : d)
            }));

        setMilestones(updated);
    }, [milestones]);

    // Update milestone
    const updateMilestone = useCallback((id: string, field: keyof MilestoneForm, value: string | number | number[]) => {
        setMilestones(milestones.map((m) =>
            m.id === id ? { ...m, [field]: value } : m
        ));
    }, [milestones]);

    // Toggle dependency for a milestone
    const toggleDependency = useCallback((milestoneId: string, depIndex: number) => {
        setMilestones(milestones.map((m) => {
            if (m.id !== milestoneId) return m;
            const deps = m.dependencies.includes(depIndex)
                ? m.dependencies.filter(d => d !== depIndex)
                : [...m.dependencies, depIndex];
            return { ...m, dependencies: deps };
        }));
    }, [milestones]);

    // Validate Step 1
    const isStep1Valid = projectForm.name.trim().length >= 3 && parseFloat(projectForm.totalBudget) > 0;

    // Validate Step 2 - all milestones must have worker address and amount
    const isStep2Valid = milestones.every(
        (m) => m.worker.startsWith('0x') && m.worker.length === 42 && parseFloat(m.amount) > 0
    ) && Math.abs(totalMilestoneAmount - parseFloat(projectForm.totalBudget)) < 0.0001;

    // Deploy the escrow with milestones in a single transaction
    const handleDeploy = async () => {
        if (!address) return;
        setError(null);

        try {
            // Convert milestone forms to contract format
            const milestonesForContract = milestones.map((m) => ({
                worker: m.worker as `0x${string}`,
                amount: parseEther(m.amount),
                deadline: BigInt(Math.floor(new Date(m.deadline).getTime() / 1000)), // Convert to unix timestamp
                revisionLimit: m.revisionLimit,
                description: m.description || `Milestone: ${m.workerType}`, // Use workerType as fallback
                dependencies: m.dependencies, // Pass dependencies to contract
            }));

            const params: DeployFreelanceEscrowParams = {
                client: address,
                paymentToken: zeroAddress, // ETH
                totalAmount: parseEther(projectForm.totalBudget),
                milestones: milestonesForContract,
            };

            console.log('[CreateProjectModal] Deploying with', milestones.length, 'milestones:', params);
            const result = await deployFreelanceEscrow(params);

            if (result.escrowAddress) {
                setDeployedAddress(result.escrowAddress);
                setDeployTxHash(result.hash);
                console.log('[CreateProjectModal] ✅ Deployed to:', result.escrowAddress);

                // Save to Supabase
                try {
                    // Save project
                    const projectData: FreelanceProjectDB = {
                        escrow_address: result.escrowAddress,
                        title: projectForm.name,
                        description: projectForm.description || undefined,
                        client_address: address!,
                        total_amount: projectForm.totalBudget,
                        status: 'created',
                    };
                    const savedProject = await freelanceProjects.create(projectData);

                    if (savedProject?.id) {
                        // Save milestones
                        const milestonesData: FreelanceMilestoneDB[] = milestones.map((m, idx) => ({
                            project_id: savedProject.id!,
                            milestone_index: idx + 1, // Use 1-based index to match on-chain milestoneId
                            description: m.description || `Milestone ${idx + 1}: ${m.workerType}`,
                            worker_address: m.worker,
                            amount: m.amount,
                            deadline: new Date(m.deadline).toISOString(),
                            status: 'pending',
                            max_revisions: m.revisionLimit,
                        }));
                        await freelanceMilestones.createBulk(milestonesData);
                        console.log('[CreateProjectModal] ✅ Saved to Supabase');
                    }
                } catch (dbErr) {
                    console.error('[CreateProjectModal] Failed to save to Supabase:', dbErr);
                    // Don't fail - blockchain is source of truth
                }

                onSuccess?.(result.escrowAddress);
            } else {
                // Transaction succeeded but couldn't extract address from logs
                console.error('[CreateProjectModal] ❌ Transaction succeeded but could not extract escrow address');
                setError('Deployment succeeded but could not retrieve contract address. Check browser console for transaction hash and look up on Sepolia Etherscan.');
            }
        } catch (err: any) {
            console.error('[CreateProjectModal] Deploy failed:', err);
            setError(err.message || 'Deployment failed');
        }
    };

    // Handle close and reset
    const handleClose = () => {
        setStep(1);
        setProjectForm({ name: '', description: '', totalBudget: '0.1' });
        setMilestones([{
            id: crypto.randomUUID(),
            worker: '',
            workerType: 'frontend',
            amount: '0.05',
            deadline: getDefaultDeadline(7),
            revisionLimit: 2,
            description: '',
            dependencies: [],
        }]);
        setDeployedAddress(null);
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-white">Create Freelance Project</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Step {step} of 3: {step === 1 ? 'Project Details' : step === 2 ? 'Add Milestones' : 'Review & Deploy'}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-bg-hover"
                    >
                        ✕
                    </button>
                </div>

                {/* Step Indicator */}
                <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-800">
                    {[1, 2, 3].map((s) => (
                        <div key={s} className="flex-1 flex items-center">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-primary-600 text-white' : 'bg-gray-700 text-gray-400'
                                    }`}
                            >
                                {step > s ? '✓' : s}
                            </div>
                            {s < 3 && (
                                <div className={`flex-1 h-0.5 mx-2 ${step > s ? 'bg-primary-600' : 'bg-gray-700'}`} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[50vh]">
                    {/* Step 1: Project Details */}
                    {step === 1 && (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Project Name *
                                </label>
                                <input
                                    type="text"
                                    value={projectForm.name}
                                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                                    placeholder="e.g., DeFi Dashboard Frontend"
                                    className="w-full px-4 py-3 bg-bg-elevated border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Description (optional)
                                </label>
                                <textarea
                                    value={projectForm.description}
                                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                                    placeholder="Brief description of the project..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-bg-elevated border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Total Budget (ETH) *
                                </label>
                                <input
                                    type="number"
                                    value={projectForm.totalBudget}
                                    onChange={(e) => setProjectForm({ ...projectForm, totalBudget: e.target.value })}
                                    placeholder="0.5"
                                    step="0.01"
                                    min="0.001"
                                    className="w-full px-4 py-3 bg-bg-elevated border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This will be split across milestones in the next step
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Add Milestones */}
                    {step === 2 && (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="flex justify-between items-center p-3 bg-bg-elevated rounded-lg">
                                <div>
                                    <span className="text-gray-400">Total Budget:</span>
                                    <span className="ml-2 text-white font-mono">{projectForm.totalBudget} ETH</span>
                                </div>
                                <div>
                                    <span className="text-gray-400">Allocated:</span>
                                    <span className={`ml-2 font-mono ${Math.abs(totalMilestoneAmount - parseFloat(projectForm.totalBudget)) < 0.0001
                                        ? 'text-green-400'
                                        : 'text-yellow-400'
                                        }`}>
                                        {totalMilestoneAmount.toFixed(4)} ETH
                                    </span>
                                </div>
                            </div>

                            {/* Milestones */}
                            {milestones.map((m, index) => (
                                <div key={m.id} className="border border-gray-700 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-primary-400">
                                            Milestone {index + 1}
                                        </span>
                                        {milestones.length > 1 && (
                                            <button
                                                onClick={() => removeMilestone(m.id)}
                                                className="text-red-400 hover:text-red-300 text-sm"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Worker Address *</label>
                                            <input
                                                type="text"
                                                value={m.worker}
                                                onChange={(e) => updateMilestone(m.id, 'worker', e.target.value)}
                                                placeholder="0x..."
                                                className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Worker Type</label>
                                            <select
                                                value={m.workerType}
                                                onChange={(e) => updateMilestone(m.id, 'workerType', e.target.value)}
                                                className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                                            >
                                                {WORKER_TYPES.map((wt) => (
                                                    <option key={wt.value} value={wt.value}>
                                                        {wt.emoji} {wt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Amount (ETH) *</label>
                                            <input
                                                type="number"
                                                value={m.amount}
                                                onChange={(e) => updateMilestone(m.id, 'amount', e.target.value)}
                                                step="0.01"
                                                min="0.001"
                                                className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-primary-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Deadline</label>
                                            <input
                                                type="date"
                                                value={m.deadline}
                                                onChange={(e) => updateMilestone(m.id, 'deadline', e.target.value)}
                                                className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Revisions (max 2)</label>
                                            <input
                                                type="number"
                                                value={m.revisionLimit}
                                                onChange={(e) => updateMilestone(m.id, 'revisionLimit', Math.min(parseInt(e.target.value) || 2, 2))}
                                                min="0"
                                                max="2"
                                                className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">⚠️ Max 2 to avoid gas issues</p>
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-xs text-gray-400 mb-1">Description</label>
                                            <input
                                                type="text"
                                                value={m.description}
                                                onChange={(e) => updateMilestone(m.id, 'description', e.target.value)}
                                                placeholder="What needs to be delivered..."
                                                className="w-full px-3 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500"
                                            />
                                        </div>

                                        {/* Dependencies - only show if there are earlier milestones */}
                                        {index > 0 && (
                                            <div className="col-span-2">
                                                <label className="block text-xs text-gray-400 mb-2">
                                                    Dependencies (must complete first)
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {milestones.slice(0, index).map((prev, prevIndex) => (
                                                        <label
                                                            key={prev.id}
                                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${m.dependencies.includes(prevIndex)
                                                                ? 'bg-primary-500/20 border-primary-500 text-primary-400'
                                                                : 'bg-bg-elevated border-gray-700 text-gray-400 hover:border-gray-600'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={m.dependencies.includes(prevIndex)}
                                                                onChange={() => toggleDependency(m.id, prevIndex)}
                                                                className="hidden"
                                                            />
                                                            <span className="text-sm">
                                                                #{prevIndex + 1} {prev.description || WORKER_TYPES.find(w => w.value === prev.workerType)?.label || 'Milestone'}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Add Milestone Button */}
                            {milestones.length < 50 && (
                                <button
                                    onClick={addMilestone}
                                    className="w-full py-3 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-primary-500 transition-colors"
                                >
                                    + Add Milestone
                                </button>
                            )}

                            {/* Warning if amounts don't match */}
                            {Math.abs(totalMilestoneAmount - parseFloat(projectForm.totalBudget)) >= 0.0001 && (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                                    <p className="text-yellow-400 text-sm">
                                        ⚠️ Milestone amounts ({totalMilestoneAmount.toFixed(4)} ETH) must equal total budget ({projectForm.totalBudget} ETH)
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Review & Deploy */}
                    {step === 3 && (
                        <div className="space-y-6">
                            {deployedAddress ? (
                                <div className="text-center py-6">
                                    <div className="text-6xl mb-4">🎉</div>
                                    <h3 className="text-2xl font-bold text-white mb-2">Project Created!</h3>
                                    <p className="text-gray-400 mb-4">Your freelance escrow is deployed</p>
                                    <div className="bg-bg-elevated rounded-lg p-3 mb-4">
                                        <p className="text-xs text-gray-400 mb-1">Escrow Address</p>
                                        <a
                                            href={`https://sepolia.etherscan.io/address/${deployedAddress}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-primary-400 break-all text-sm hover:underline"
                                        >
                                            {deployedAddress} ↗
                                        </a>
                                    </div>
                                    {deployTxHash && (
                                        <div className="bg-bg-elevated rounded-lg p-3 mb-4">
                                            <p className="text-xs text-gray-400 mb-1">Deployment Transaction</p>
                                            <a
                                                href={`https://sepolia.etherscan.io/tx/${deployTxHash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-mono text-green-400 break-all text-sm hover:underline"
                                            >
                                                {deployTxHash.slice(0, 20)}...{deployTxHash.slice(-8)} ↗
                                            </a>
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-400 mb-6">
                                        ⚡ Next: Deposit {projectForm.totalBudget} ETH to fund the escrow and start the project
                                    </p>
                                    <Link
                                        to={`/freelance/${deployedAddress}`}
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                        onClick={handleClose}
                                    >
                                        View Project →
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    {/* Project Summary */}
                                    <div className="bg-bg-elevated rounded-lg p-4">
                                        <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                                            📋 {projectForm.name}
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <span className="text-gray-400">Total Budget:</span>
                                                <span className="ml-2 text-white font-mono">{projectForm.totalBudget} ETH</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-400">Milestones:</span>
                                                <span className="ml-2 text-white">{milestones.length}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Milestones Summary */}
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-300 mb-3">Milestones</h4>
                                        <div className="space-y-2">
                                            {milestones.map((m, index) => (
                                                <div key={m.id} className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg text-sm">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-6 h-6 rounded-full bg-primary-600/20 text-primary-400 flex items-center justify-center text-xs">
                                                            {index + 1}
                                                        </div>
                                                        <div>
                                                            <p className="text-white">{m.description || `Milestone ${index + 1}`}</p>
                                                            <p className="text-gray-500 font-mono text-xs">{m.worker.slice(0, 10)}...{m.worker.slice(-8)}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-white font-mono">{m.amount} ETH</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Platform Fee Notice */}
                                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-2">
                                        <p className="text-yellow-400 text-sm font-medium">💰 Fee Structure:</p>
                                        <div className="space-y-1 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Deployment Fee (0.5%):</span>
                                                <span className="text-yellow-400 font-mono">
                                                    {(parseFloat(projectForm.totalBudget) * 0.005).toFixed(6)} ETH
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500">→ Paid now when creating escrow</p>
                                            <div className="flex justify-between pt-2 border-t border-yellow-500/20">
                                                <span className="text-gray-400">Approval Fees (2.5% each):</span>
                                                <span className="text-gray-400 font-mono">
                                                    ~{(parseFloat(projectForm.totalBudget) * 0.025).toFixed(6)} ETH
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500">→ Paid when you approve each milestone (worker gets 100%)</p>
                                        </div>
                                    </div>

                                    {/* Error */}
                                    {error && (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                            <p className="text-red-400 text-sm">❌ {error}</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-800">
                    <button
                        onClick={step === 1 ? handleClose : () => setStep((step - 1) as Step)}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        disabled={isDeploying}
                    >
                        {step === 1 ? 'Cancel' : '← Back'}
                    </button>

                    {step < 3 ? (
                        <button
                            onClick={() => setStep((step + 1) as Step)}
                            disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
                        >
                            Continue →
                        </button>
                    ) : deployedAddress ? (
                        <button
                            onClick={handleClose}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                        >
                            Done ✓
                        </button>
                    ) : (
                        <button
                            onClick={handleDeploy}
                            disabled={isDeploying}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-primary-700 transition-colors flex items-center gap-2"
                        >
                            {isDeploying ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Deploying...
                                </>
                            ) : (
                                '🚀 Deploy Project'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}
