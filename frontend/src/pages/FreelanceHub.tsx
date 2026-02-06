import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { CreateProjectModal } from '../components/freelance/CreateProjectModal';
import { freelanceProjects as supabaseFreelance, FreelanceProjectDB } from '@/lib/supabase';
import { PLATFORM } from '@/utils/constants';

/**
 * FreelanceHub - Main page for milestone-based freelance escrow
 * Features:
 * - Project creation with multi-step modal
 * - Project list view with Active/Completed tabs
 * - Status badges on project cards
 */
export function FreelanceHub() {
    const { isConnected, address } = useAccount();
    const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Full project data from Supabase (not just addresses)
    const [projects, setProjects] = useState<FreelanceProjectDB[]>([]);

    // Load projects from Supabase
    const loadProjects = useCallback(async () => {
        if (!address) {
            console.log('[FreelanceHub] No address connected, skipping load');
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            console.log('[FreelanceHub] Loading projects for:', address);
            const projectData = await supabaseFreelance.getByAddress(address);
            setProjects(projectData);
            console.log('[FreelanceHub] Loaded', projectData.length, 'projects from Supabase:', projectData.map(p => p.escrow_address));
        } catch (err) {
            console.error('[FreelanceHub] Failed to load projects:', err);
        } finally {
            setIsLoading(false);
        }
    }, [address]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    const handleProjectCreated = async (escrowAddress: `0x${string}`) => {
        // Reload from Supabase to get full data
        await loadProjects();
        console.log('[FreelanceHub] Project added:', escrowAddress);
        setActiveTab('active');
    };

    // Check if current user is platform admin
    const isPlatformAdmin = address?.toLowerCase() === PLATFORM.ADMIN_ADDRESS.toLowerCase();

    // Remove a project - deletes from Supabase (admin only can delete completely)
    const removeProject = async (escrowAddress: `0x${string}`) => {
        if (isPlatformAdmin) {
            // Admin can delete from database
            const success = await supabaseFreelance.deleteByEscrow(escrowAddress);
            if (success) {
                console.log('[FreelanceHub] Project deleted from Supabase:', escrowAddress);
            }
        }
        // Also remove from local state
        const newProjects = projects.filter((p) => p.escrow_address !== escrowAddress);
        setProjects(newProjects);
    };

    // Refresh projects from Supabase
    const refreshProjects = () => {
        loadProjects();
    };

    // Filter projects by status
    const completedStatuses = ['completed', 'cancelled'];
    const activeProjects = projects.filter(p => !completedStatuses.includes(p.status || ''));
    const completedProjects = projects.filter(p => completedStatuses.includes(p.status || ''));

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-500/10 rounded-full text-primary-400 text-sm mb-4">
                    <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse"></span>
                    Milestone-Based Escrow
                </div>
                <h1 className="text-4xl font-bold text-white mb-4">
                    Freelance <span className="text-primary-400">Hub</span>
                </h1>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                    Create projects with multiple milestones, assign workers, and pay on completion.
                    Built with trust-minimized smart contracts.
                </p>
            </div>

            {/* Tab Navigation with Create Button */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex items-center gap-4">
                    <div className="inline-flex bg-bg-card rounded-lg p-1 border border-gray-800">
                        <button
                            onClick={() => setActiveTab('active')}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'active'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            🔵 Active ({activeProjects.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('completed')}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'completed'
                                ? 'bg-green-600 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            ✅ Completed ({completedProjects.length})
                        </button>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                    >
                        + Create Project
                    </button>
                    {/* Platform Admin Only - Manage Disputes Link */}
                    {address?.toLowerCase() === PLATFORM.ADMIN_ADDRESS.toLowerCase() && (
                        <Link
                            to="/admin/disputes"
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 border border-yellow-600/30"
                        >
                            ⚖️ Disputes
                        </Link>
                    )}
                </div>
            </div>

            {/* Content */}
            {!isConnected ? (
                <div className="text-center py-16 bg-bg-card rounded-xl border border-gray-800">
                    <div className="text-6xl mb-4">🔗</div>
                    <h2 className="text-xl font-semibold text-white mb-2">Connect Wallet</h2>
                    <p className="text-gray-400">Connect your wallet to view or create freelance projects</p>
                </div>
            ) : (
                <ProjectsView
                    projects={activeTab === 'active' ? activeProjects : completedProjects}
                    onCreateClick={() => setIsCreateModalOpen(true)}
                    onRemoveProject={removeProject}
                    onRefresh={refreshProjects}
                    isLoading={isLoading}
                    isAdmin={isPlatformAdmin}
                    tabType={activeTab}
                />
            )}

            {/* Feature Cards */}
            <div className="grid md:grid-cols-3 gap-6 mt-16">
                <FeatureCard
                    icon="📋"
                    title="Multi-Milestone"
                    description="Break projects into up to 50 milestones with independent deadlines and payments"
                />
                <FeatureCard
                    icon="👥"
                    title="Multiple Workers"
                    description="Assign different workers to each milestone for specialized work"
                />
                <FeatureCard
                    icon="🔒"
                    title="Secure Escrow"
                    description="Funds locked in smart contracts released only on approval or auto-approval after 7 days"
                />
            </div>

            {/* Create Project Modal */}
            <CreateProjectModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={handleProjectCreated}
            />
        </div>
    );
}

// Projects View - Shows active or completed projects
function ProjectsView({
    projects,
    onCreateClick,
    onRemoveProject,
    onRefresh,
    isLoading,
    isAdmin,
    tabType,
}: {
    projects: FreelanceProjectDB[];
    onCreateClick: () => void;
    onRemoveProject: (address: `0x${string}`) => void;
    onRefresh: () => void;
    isLoading: boolean;
    isAdmin: boolean;
    tabType: 'active' | 'completed';
}) {
    if (isLoading) {
        return (
            <div className="bg-bg-card rounded-xl border border-gray-800 p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-400">Loading projects...</p>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="bg-bg-card rounded-xl border border-gray-800 p-8">
                <div className="text-center py-8">
                    <div className="text-5xl mb-4">{tabType === 'active' ? '📁' : '✅'}</div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                        {tabType === 'active' ? 'No Active Projects' : 'No Completed Projects'}
                    </h3>
                    <p className="text-gray-400 mb-6">
                        {tabType === 'active'
                            ? "You don't have any active freelance projects. Create your first project to get started!"
                            : "Completed and cancelled projects will appear here."}
                    </p>
                    {tabType === 'active' && (
                        <button
                            onClick={onCreateClick}
                            className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                        >
                            ✨ Create Your First Project
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">
                    {tabType === 'active' ? 'Active' : 'Completed'} Projects ({projects.length})
                </h3>
                <button
                    onClick={onRefresh}
                    className="px-3 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-600/30 transition-colors"
                    title="Refresh projects from database"
                >
                    🔄 Refresh
                </button>
            </div>

            <div className="grid gap-4">
                {projects.map((project, index) => (
                    <ProjectCard
                        key={project.escrow_address}
                        project={project}
                        index={index}
                        onRemove={() => onRemoveProject(project.escrow_address as `0x${string}`)}
                        isAdmin={isAdmin}
                    />
                ))}
            </div>
        </div>
    );
}

// Project Card with status badge and details
function ProjectCard({
    project,
    index,
    onRemove,
    isAdmin,
}: {
    project: FreelanceProjectDB;
    index: number;
    onRemove: () => void;
    isAdmin: boolean;
}) {
    const handleRemove = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const message = isAdmin
            ? 'Delete this project?\n\n⚠️ This will permanently remove it from the database (not blockchain).'
            : 'Remove this project from your list?';
        if (window.confirm(message)) {
            onRemove();
        }
    };

    // Status badge styling
    const getStatusBadge = (status: string | undefined) => {
        const s = (status || 'created').toLowerCase();
        const styles: Record<string, { bg: string; text: string; label: string }> = {
            created: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'Created' },
            funded: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Funded' },
            in_progress: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'In Progress' },
            completed: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Completed' },
            disputed: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Disputed' },
            cancelled: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Cancelled' },
        };
        return styles[s] || styles.created;
    };

    const badge = getStatusBadge(project.status);

    return (
        <Link
            to={`/freelance/${project.escrow_address}`}
            className="bg-bg-card border border-gray-800 rounded-xl p-6 hover:border-primary-500/50 transition-colors block"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary-600/20 flex items-center justify-center">
                        <span className="text-primary-400 text-xl">📋</span>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white">{project.title || `Project #${index + 1}`}</h4>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400 font-mono">{project.escrow_address?.slice(0, 10)}...{project.escrow_address?.slice(-8)}</span>
                            {project.total_amount && (
                                <span className="text-primary-400">{project.total_amount} ETH</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <button
                            onClick={handleRemove}
                            className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded-full hover:bg-red-500/20 transition-colors"
                            title="Delete from database (Admin only)"
                        >
                            🗑️
                        </button>
                    )}
                    <span className={`px-2 py-1 ${badge.bg} ${badge.text} text-xs rounded-full`}>{badge.label}</span>
                    <span className="text-primary-400 text-sm">View Dashboard →</span>
                </div>
            </div>
        </Link>
    );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
    return (
        <div className="bg-bg-card border border-gray-800 rounded-xl p-6 hover:border-primary-500/50 transition-colors">
            <div className="text-3xl mb-3">{icon}</div>
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-gray-400 text-sm">{description}</p>
        </div>
    );
}
