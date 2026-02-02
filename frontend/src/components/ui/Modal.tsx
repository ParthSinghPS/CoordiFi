import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    size = 'md',
}: ModalProps) {
    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizeStyles = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
    };

    return createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className={`
            relative w-full ${sizeStyles[size]}
            bg-bg-card border border-gray-800 rounded-2xl shadow-xl
            animate-fade-in
          `}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    {(title || description) && (
                        <div className="px-6 py-4 border-b border-gray-800">
                            <div className="flex items-start justify-between">
                                <div>
                                    {title && (
                                        <h2 className="text-lg font-semibold text-white">{title}</h2>
                                    )}
                                    {description && (
                                        <p className="text-sm text-gray-400 mt-1">{description}</p>
                                    )}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-bg-hover"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    <div className="p-6">
                        {children}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

// Confirmation Modal
interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'primary' | 'danger';
    isLoading?: boolean;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'primary',
    isLoading = false,
}: ConfirmModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <p className="text-gray-300 mb-6">{message}</p>
            <div className="flex gap-3 justify-end">
                <button
                    onClick={onClose}
                    className="btn-secondary"
                    disabled={isLoading}
                >
                    {cancelText}
                </button>
                <button
                    onClick={onConfirm}
                    className={variant === 'danger' ? 'btn-primary bg-red-600 hover:bg-red-700' : 'btn-primary'}
                    disabled={isLoading}
                >
                    {isLoading ? 'Processing...' : confirmText}
                </button>
            </div>
        </Modal>
    );
}
