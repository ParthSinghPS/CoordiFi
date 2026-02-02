import { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    children: ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-dark disabled:opacity-50 disabled:cursor-not-allowed';

    const variantStyles = {
        primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
        secondary: 'bg-bg-elevated text-white border border-gray-700 hover:bg-bg-hover hover:border-gray-600 focus:ring-gray-500',
        ghost: 'text-gray-300 hover:bg-bg-hover hover:text-white focus:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    };

    const sizeStyles = {
        sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
        md: 'px-4 py-2.5 text-sm rounded-lg gap-2',
        lg: 'px-6 py-3 text-base rounded-lg gap-2',
    };

    return (
        <button
            className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : leftIcon ? (
                leftIcon
            ) : null}
            {children}
            {!isLoading && rightIcon}
        </button>
    );
}
