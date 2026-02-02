import { MILESTONE_STATUS } from '../../hooks/useFreelanceEscrow';

interface MilestoneStatusBadgeProps {
    status: number;
    size?: 'sm' | 'md' | 'lg';
}

const STATUS_STYLES: Record<number, { bg: string; text: string; icon: string }> = {
    0: { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: '⏳' }, // Pending
    1: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '📤' }, // Submitted
    2: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '🔄' }, // UnderRevision
    3: { bg: 'bg-green-500/10', text: 'text-green-400', icon: '✅' }, // Approved
    4: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '💰' }, // Paid
    5: { bg: 'bg-red-500/10', text: 'text-red-400', icon: '⚠️' }, // Disputed
    6: { bg: 'bg-gray-500/10', text: 'text-gray-500', icon: '❌' }, // Cancelled
};

/**
 * Badge component for displaying milestone status
 */
export function MilestoneStatusBadge({ status, size = 'md' }: MilestoneStatusBadgeProps) {
    const style = STATUS_STYLES[status] || STATUS_STYLES[0];
    const label = MILESTONE_STATUS[status as keyof typeof MILESTONE_STATUS] || 'Unknown';

    const sizeClasses = {
        sm: 'px-1.5 py-0.5 text-xs',
        md: 'px-2 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
    };

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses[size]}`}
        >
            <span>{style.icon}</span>
            <span>{label}</span>
        </span>
    );
}

/**
 * Progress bar component for milestone completion
 */
export function MilestoneProgressBar({
    completed,
    total
}: {
    completed: number;
    total: number;
}) {
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-gray-400">Progress</span>
                <span className="text-white font-medium">{completed}/{total} milestones</span>
            </div>
            <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

/**
 * Phase badge for project status
 */
export function ProjectPhaseBadge({ phase }: { phase: number }) {
    const phases: Record<number, { label: string; color: string; icon: string }> = {
        0: { label: 'Created', color: 'text-gray-400 bg-gray-500/10', icon: '📝' },
        1: { label: 'Funded', color: 'text-green-400 bg-green-500/10', icon: '💵' },
        2: { label: 'In Progress', color: 'text-blue-400 bg-blue-500/10', icon: '🔨' },
        3: { label: 'Completed', color: 'text-emerald-400 bg-emerald-500/10', icon: '🎉' },
        4: { label: 'Disputed', color: 'text-red-400 bg-red-500/10', icon: '⚠️' },
        5: { label: 'Refunded', color: 'text-gray-400 bg-gray-500/10', icon: '↩️' },
    };

    const phaseInfo = phases[phase] || phases[0];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${phaseInfo.color}`}>
            <span>{phaseInfo.icon}</span>
            <span>{phaseInfo.label}</span>
        </span>
    );
}
