import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftAddon?: string;
    rightAddon?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, hint, leftAddon, rightAddon, className = '', ...props }, ref) => {
        const inputStyles = `
      w-full px-4 py-3 bg-bg-dark border rounded-lg
      text-white placeholder:text-gray-500
      focus:outline-none focus:ring-1 transition-all duration-200
      ${error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-700 focus:border-primary-500 focus:ring-primary-500'
            }
      ${leftAddon ? 'pl-12' : ''}
      ${rightAddon ? 'pr-12' : ''}
      disabled:opacity-50 disabled:cursor-not-allowed
    `;

        return (
            <div className={className}>
                {label && (
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {leftAddon && (
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            {leftAddon}
                        </span>
                    )}
                    <input ref={ref} className={inputStyles} {...props} />
                    {rightAddon && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            {rightAddon}
                        </span>
                    )}
                </div>
                {error && (
                    <p className="mt-1.5 text-sm text-red-400">{error}</p>
                )}
                {hint && !error && (
                    <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
