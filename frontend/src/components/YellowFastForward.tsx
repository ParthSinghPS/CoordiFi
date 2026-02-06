/**
 * YellowFastForward - Animated overlay showing Yellow Network operations
 * 
 * This component displays a "fast-forward" animation revealing what Yellow handles:
 * - Shows each operation (submit, approve, revision, dispute) as it happens
 * - Displays gas savings for each operation
 * - Shows cumulative savings at the end
 * 
 * Key UX: User sees the "behind the scenes" of Yellow's gasless operations
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Zap, 
    Check, 
    X, 
    Clock, 
    DollarSign,
    Loader2,
    Shield,
    FileCheck,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react';
import { YellowOperationLog, YellowOperation } from '../hooks/useYellowSession';

interface YellowFastForwardProps {
    operations: YellowOperationLog[];
    isVisible: boolean;
    onClose: () => void;
    autoClose?: boolean;
    autoCloseDelay?: number;
}

// Operation display config
const operationConfig: Record<YellowOperation, {
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    label: string;
}> = {
    session_create: {
        icon: <Zap className="w-5 h-5" />,
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-400/20',
        label: 'Session Created',
    },
    milestone_submit: {
        icon: <FileCheck className="w-5 h-5" />,
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/20',
        label: 'Work Submitted',
    },
    milestone_approve: {
        icon: <Check className="w-5 h-5" />,
        color: 'text-green-400',
        bgColor: 'bg-green-400/20',
        label: 'Milestone Approved',
    },
    milestone_revision: {
        icon: <RefreshCw className="w-5 h-5" />,
        color: 'text-orange-400',
        bgColor: 'bg-orange-400/20',
        label: 'Revision Requested',
    },
    milestone_dispute: {
        icon: <AlertTriangle className="w-5 h-5" />,
        color: 'text-red-400',
        bgColor: 'bg-red-400/20',
        label: 'Dispute Raised',
    },
    dispute_resolve: {
        icon: <Shield className="w-5 h-5" />,
        color: 'text-purple-400',
        bgColor: 'bg-purple-400/20',
        label: 'Dispute Resolved',
    },
    session_close: {
        icon: <X className="w-5 h-5" />,
        color: 'text-gray-400',
        bgColor: 'bg-gray-400/20',
        label: 'Session Closed',
    },
    session_settle: {
        icon: <DollarSign className="w-5 h-5" />,
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-400/20',
        label: 'Settlement Complete',
    },
};

export function YellowFastForward({
    operations,
    isVisible,
    onClose,
    autoClose = true,
    autoCloseDelay = 3000,
}: YellowFastForwardProps) {
    const [currentOpIndex, setCurrentOpIndex] = useState(0);
    const [showSummary, setShowSummary] = useState(false);
    
    // Calculate total savings
    const totalSavings = operations
        .filter(op => op.status === 'success')
        .reduce((sum, op) => {
            const amount = parseFloat(op.gasSaved?.replace(/[^0-9.]/g, '') || '0');
            return sum + amount;
        }, 0);
    
    // Animate through operations
    useEffect(() => {
        if (!isVisible || operations.length === 0) return;
        
        setCurrentOpIndex(0);
        setShowSummary(false);
        
        const timer = setInterval(() => {
            setCurrentOpIndex(prev => {
                if (prev >= operations.length - 1) {
                    clearInterval(timer);
                    setTimeout(() => setShowSummary(true), 500);
                    return prev;
                }
                return prev + 1;
            });
        }, 800); // Show each operation for 800ms
        
        return () => clearInterval(timer);
    }, [isVisible, operations]);
    
    // Auto-close after showing summary
    useEffect(() => {
        if (showSummary && autoClose) {
            const timer = setTimeout(onClose, autoCloseDelay);
            return () => clearTimeout(timer);
        }
    }, [showSummary, autoClose, autoCloseDelay, onClose]);
    
    if (!isVisible || operations.length === 0) return null;
    
    const currentOp = operations[currentOpIndex];
    const config = currentOp ? operationConfig[currentOp.type] : null;
    
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-zinc-900 border border-yellow-500/30 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl shadow-yellow-500/10"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Yellow Network Header */}
                    <div className="flex items-center justify-center gap-2 mb-6">
                        <Zap className="w-6 h-6 text-yellow-400" />
                        <span className="text-yellow-400 font-bold text-lg">Yellow Network</span>
                        <span className="text-zinc-500 text-sm">Processing...</span>
                    </div>
                    
                    {!showSummary ? (
                        <>
                            {/* Current Operation Display */}
                            {currentOp && config && (
                                <motion.div
                                    key={currentOp.id}
                                    initial={{ x: 50, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: -50, opacity: 0 }}
                                    className="mb-6"
                                >
                                    <div className={`flex items-center gap-4 p-4 rounded-xl ${config.bgColor}`}>
                                        <div className={`p-3 rounded-lg bg-zinc-900 ${config.color}`}>
                                            {config.icon}
                                        </div>
                                        <div className="flex-1">
                                            <div className={`font-semibold ${config.color}`}>
                                                {config.label}
                                            </div>
                                            <div className="text-zinc-400 text-sm">
                                                {currentOp.details || `Processing ${currentOp.type}...`}
                                            </div>
                                        </div>
                                        {currentOp.status === 'pending' && (
                                            <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                                        )}
                                        {currentOp.status === 'success' && (
                                            <Check className="w-5 h-5 text-green-400" />
                                        )}
                                        {currentOp.status === 'failed' && (
                                            <X className="w-5 h-5 text-red-400" />
                                        )}
                                    </div>
                                    
                                    {/* Gas Savings Indicator */}
                                    {currentOp.gasSaved && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-3 flex items-center justify-center gap-2 text-green-400"
                                        >
                                            <DollarSign className="w-4 h-4" />
                                            <span className="text-sm font-medium">
                                                Saved {currentOp.gasSaved} in gas fees
                                            </span>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                            
                            {/* Progress Indicator */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm text-zinc-500">
                                    <span>Processing operations...</span>
                                    <span>{currentOpIndex + 1} / {operations.length}</span>
                                </div>
                                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400"
                                        initial={{ width: 0 }}
                                        animate={{ 
                                            width: `${((currentOpIndex + 1) / operations.length) * 100}%` 
                                        }}
                                        transition={{ duration: 0.3 }}
                                    />
                                </div>
                            </div>
                            
                            {/* Operations Timeline */}
                            <div className="mt-6 space-y-2">
                                {operations.map((op, index) => {
                                    const opConfig = operationConfig[op.type];
                                    const isActive = index === currentOpIndex;
                                    const isComplete = index < currentOpIndex || op.status === 'success';
                                    
                                    return (
                                        <motion.div
                                            key={op.id}
                                            initial={{ opacity: 0.3 }}
                                            animate={{ 
                                                opacity: isComplete ? 1 : isActive ? 1 : 0.3,
                                                scale: isActive ? 1.02 : 1,
                                            }}
                                            className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                                                isActive ? 'bg-zinc-800' : ''
                                            }`}
                                        >
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                                isComplete 
                                                    ? 'bg-green-500/20 text-green-400' 
                                                    : isActive 
                                                        ? 'bg-yellow-500/20 text-yellow-400'
                                                        : 'bg-zinc-700 text-zinc-500'
                                            }`}>
                                                {isComplete ? (
                                                    <Check className="w-3 h-3" />
                                                ) : isActive ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Clock className="w-3 h-3" />
                                                )}
                                            </div>
                                            <span className={`text-sm flex-1 ${
                                                isComplete || isActive ? 'text-zinc-300' : 'text-zinc-600'
                                            }`}>
                                                {opConfig.label}
                                            </span>
                                            {isComplete && op.gasSaved && (
                                                <span className="text-xs text-green-400">
                                                    {op.gasSaved}
                                                </span>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        /* Summary View */
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center"
                        >
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                <Check className="w-8 h-8 text-green-400" />
                            </div>
                            
                            <h3 className="text-xl font-bold text-white mb-2">
                                All Operations Complete
                            </h3>
                            
                            <p className="text-zinc-400 mb-6">
                                Yellow Network processed {operations.length} operations off-chain
                            </p>
                            
                            {/* Savings Summary */}
                            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
                                <div className="text-green-400 text-sm mb-1">Total Gas Saved</div>
                                <div className="text-3xl font-bold text-green-400">
                                    ~${totalSavings.toFixed(2)}
                                </div>
                                <div className="text-zinc-500 text-xs mt-1">
                                    vs. {operations.length} on-chain transactions
                                </div>
                            </div>
                            
                            {/* What Yellow Handled */}
                            <div className="text-left mb-6">
                                <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                                    Yellow handled
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {Array.from(new Set(operations.map(op => op.type))).map(type => (
                                        <span
                                            key={type}
                                            className={`px-2 py-1 rounded text-xs ${operationConfig[type].bgColor} ${operationConfig[type].color}`}
                                        >
                                            {operationConfig[type].label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-xl transition-colors"
                            >
                                Continue
                            </button>
                        </motion.div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/**
 * YellowOperationToast - Small toast notification for individual operations
 */
interface YellowOperationToastProps {
    operation: YellowOperationLog | null;
    isVisible: boolean;
}

export function YellowOperationToast({ operation, isVisible }: YellowOperationToastProps) {
    if (!isVisible || !operation) return null;
    
    const config = operationConfig[operation.type];
    
    return (
        <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-50"
        >
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-lg`}>
                <div className={`p-2 rounded-lg ${config.bgColor} ${config.color}`}>
                    {config.icon}
                </div>
                <div>
                    <div className="text-white font-medium text-sm">
                        {config.label}
                    </div>
                    {operation.gasSaved && (
                        <div className="text-green-400 text-xs">
                            Saved {operation.gasSaved}
                        </div>
                    )}
                </div>
                <Zap className="w-4 h-4 text-yellow-400 ml-2" />
            </div>
        </motion.div>
    );
}

export default YellowFastForward;
