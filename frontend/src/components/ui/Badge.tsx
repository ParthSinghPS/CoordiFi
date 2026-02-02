import { CoordinationStatus, STATUS_LABELS } from '@/utils/constants';

interface StatusBadgeProps {
    status: CoordinationStatus;
    size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
    const sizeStyles = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
    };

    const statusStyles: Record<CoordinationStatus, string> = {
        [CoordinationStatus.NONE]: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        [CoordinationStatus.LOCKED]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        [CoordinationStatus.FUNDED]: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        [CoordinationStatus.VERIFIED]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        [CoordinationStatus.SETTLED]: 'bg-green-500/20 text-green-400 border-green-500/30',
        [CoordinationStatus.REFUNDED]: 'bg-red-500/20 text-red-400 border-red-500/30',
    };

    return (
        <span
            className={`
        inline-flex items-center rounded-full font-medium border
        ${sizeStyles[size]}
        ${statusStyles[status]}
      `}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
            {STATUS_LABELS[status]}
        </span>
    );
}

// Generic Badge
interface BadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
    size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'default', size = 'md' }: BadgeProps) {
    const sizeStyles = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-1 text-xs',
    };

    const variantStyles = {
        default: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        success: 'bg-green-500/20 text-green-400 border-green-500/30',
        warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        error: 'bg-red-500/20 text-red-400 border-red-500/30',
        info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };

    return (
        <span
            className={`
        inline-flex items-center rounded-full font-medium border
        ${sizeStyles[size]}
        ${variantStyles[variant]}
      `}
        >
            {children}
        </span>
    );
}
