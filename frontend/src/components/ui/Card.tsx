import { ReactNode } from 'react';

interface CardProps {
    children: ReactNode;
    className?: string;
    variant?: 'default' | 'elevated' | 'interactive';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
    children,
    className = '',
    variant = 'default',
    padding = 'md',
}: CardProps) {
    const baseStyles = 'rounded-xl border transition-all duration-200';

    const variantStyles = {
        default: 'bg-bg-card border-gray-800',
        elevated: 'bg-bg-elevated border-gray-800 shadow-lg',
        interactive: 'bg-bg-card border-gray-800 hover:border-gray-700 hover:bg-bg-elevated cursor-pointer',
    };

    const paddingStyles = {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
    };

    return (
        <div className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}>
            {children}
        </div>
    );
}

// Card Header
interface CardHeaderProps {
    title: string;
    description?: string;
    action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
    return (
        <div className="flex items-start justify-between mb-6">
            <div>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {description && (
                    <p className="text-sm text-gray-400 mt-1">{description}</p>
                )}
            </div>
            {action}
        </div>
    );
}

// Card Divider
export function CardDivider() {
    return <hr className="border-gray-800 my-6" />;
}
