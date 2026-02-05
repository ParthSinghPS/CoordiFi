/**
 * YellowStatusBar - Persistent status indicator for Yellow Network connection
 * 
 * Shows:
 * - Connection status (connected/disconnected/error)
 * - Authentication status
 * - Active session info
 * - Cumulative gas savings
 * 
 * Displays at the bottom of Freelance pages when Yellow is active.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Zap, 
    Wifi, 
    WifiOff, 
    Shield, 
    DollarSign,
    ChevronUp,
    ChevronDown,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
} from 'lucide-react';
import { YellowConnectionState } from '../lib/yellow';
import { YellowOperationLog } from '../hooks/useYellowSession';

interface YellowStatusBarProps {
    connectionState: YellowConnectionState;
    isAuthenticated: boolean;
    sessionId: string | null;
    operationLog: YellowOperationLog[];
    totalSaved: string;
    onReconnect?: () => void;
}

export function YellowStatusBar({
    connectionState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isAuthenticated: _isAuthenticated,
    sessionId,
    operationLog,
    totalSaved,
    onReconnect,
}: YellowStatusBarProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Connection status config
    const statusConfig: Record<YellowConnectionState, {
        icon: React.ReactNode;
        color: string;
        bgColor: string;
        label: string;
    }> = {
        disconnected: {
            icon: <WifiOff className="w-4 h-4" />,
            color: 'text-zinc-500',
            bgColor: 'bg-zinc-500/20',
            label: 'Disconnected',
        },
        connecting: {
            icon: <Loader2 className="w-4 h-4 animate-spin" />,
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-400/20',
            label: 'Connecting...',
        },
        connected: {
            icon: <Wifi className="w-4 h-4" />,
            color: 'text-blue-400',
            bgColor: 'bg-blue-400/20',
            label: 'Connected',
        },
        authenticated: {
            icon: <Shield className="w-4 h-4" />,
            color: 'text-green-400',
            bgColor: 'bg-green-400/20',
            label: 'Authenticated',
        },
        error: {
            icon: <XCircle className="w-4 h-4" />,
            color: 'text-red-400',
            bgColor: 'bg-red-400/20',
            label: 'Error',
        },
    };
    
    const currentStatus = statusConfig[connectionState];
    const recentOps = operationLog.slice(-5).reverse();
    const successCount = operationLog.filter(op => op.status === 'success').length;
    
    return (
        <div className="fixed bottom-0 left-0 right-0 z-40">
            {/* Expanded Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-zinc-900 border-t border-zinc-700 overflow-hidden"
                    >
                        <div className="max-w-4xl mx-auto p-4">
                            <div className="grid grid-cols-3 gap-6">
                                {/* Session Info */}
                                <div>
                                    <h4 className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                                        Session
                                    </h4>
                                    {sessionId ? (
                                        <div className="space-y-2">
                                            <div className="text-white font-mono text-sm truncate">
                                                {sessionId.slice(0, 20)}...
                                            </div>
                                            <div className="flex items-center gap-2 text-green-400 text-sm">
                                                <CheckCircle2 className="w-4 h-4" />
                                                Active
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-zinc-500 text-sm">
                                            No active session
                                        </div>
                                    )}
                                </div>
                                
                                {/* Gas Savings */}
                                <div>
                                    <h4 className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                                        Gas Savings
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-green-400" />
                                        <span className="text-2xl font-bold text-green-400">
                                            {totalSaved}
                                        </span>
                                    </div>
                                    <div className="text-zinc-500 text-xs mt-1">
                                        {successCount} operations processed off-chain
                                    </div>
                                </div>
                                
                                {/* Recent Operations */}
                                <div>
                                    <h4 className="text-zinc-500 text-xs uppercase tracking-wider mb-2">
                                        Recent Operations
                                    </h4>
                                    {recentOps.length > 0 ? (
                                        <div className="space-y-1">
                                            {recentOps.map(op => (
                                                <div
                                                    key={op.id}
                                                    className="flex items-center gap-2 text-sm"
                                                >
                                                    {op.status === 'success' && (
                                                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                                                    )}
                                                    {op.status === 'pending' && (
                                                        <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                                                    )}
                                                    {op.status === 'failed' && (
                                                        <XCircle className="w-3 h-3 text-red-400" />
                                                    )}
                                                    <span className="text-zinc-400 truncate">
                                                        {op.type.replace(/_/g, ' ')}
                                                    </span>
                                                    {op.gasSaved && (
                                                        <span className="text-green-400 text-xs ml-auto">
                                                            {op.gasSaved}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-zinc-500 text-sm">
                                            No operations yet
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {/* Main Status Bar */}
            <div 
                className="bg-zinc-900/95 backdrop-blur border-t border-zinc-800 px-4 py-2 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    {/* Left: Yellow Branding + Status */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-yellow-400" />
                            <span className="font-semibold text-yellow-400 text-sm">
                                Yellow Network
                            </span>
                            {/* PROOF BADGE: Show this is REAL connection */}
                            {connectionState === 'authenticated' && (
                                <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/50 rounded text-[10px] font-bold text-green-400 uppercase tracking-wider animate-pulse">
                                    REAL CONNECTION
                                </span>
                            )}
                        </div>
                        
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${currentStatus.bgColor}`}>
                            <span className={currentStatus.color}>
                                {currentStatus.icon}
                            </span>
                            <span className={`text-xs font-medium ${currentStatus.color}`}>
                                {currentStatus.label}
                            </span>
                        </div>
                        
                        {/* Show real endpoint */}
                        {connectionState === 'authenticated' && (
                            <span className="text-[10px] text-zinc-500 font-mono hidden lg:inline">
                                wss://clearnet-sandbox.yellow.com
                            </span>
                        )}
                        
                        {connectionState === 'error' && onReconnect && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReconnect();
                                }}
                                className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                            >
                                Reconnect
                            </button>
                        )}
                    </div>
                    
                    {/* Center: Quick Stats */}
                    <div className="flex items-center gap-6 text-sm">
                        {sessionId && (
                            <div className="flex items-center gap-2 text-zinc-400">
                                <Clock className="w-4 h-4" />
                                <span>Session Active</span>
                            </div>
                        )}
                        
                        {successCount > 0 && (
                            <div className="flex items-center gap-2 text-green-400">
                                <DollarSign className="w-4 h-4" />
                                <span>Saved {totalSaved}</span>
                            </div>
                        )}
                    </div>
                    
                    {/* Right: Expand/Collapse */}
                    <button 
                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-5 h-5" />
                        ) : (
                            <ChevronUp className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * YellowBadge - Small badge showing Yellow status (for use in headers/cards)
 */
interface YellowBadgeProps {
    isActive: boolean;
    className?: string;
}

export function YellowBadge({ isActive, className = '' }: YellowBadgeProps) {
    return (
        <div 
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                isActive 
                    ? 'bg-yellow-400/20 text-yellow-400' 
                    : 'bg-zinc-700 text-zinc-500'
            } ${className}`}
        >
            <Zap className="w-3 h-3" />
            {isActive ? 'Yellow Active' : 'Yellow'}
        </div>
    );
}

/**
 * YellowSavingsCounter - Animated counter showing gas savings
 */
interface YellowSavingsCounterProps {
    amount: string;
    className?: string;
}

export function YellowSavingsCounter({ amount, className = '' }: YellowSavingsCounterProps) {
    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg ${className}`}
        >
            <DollarSign className="w-4 h-4 text-green-400" />
            <div>
                <div className="text-xs text-green-400/70">Gas Saved</div>
                <div className="text-lg font-bold text-green-400">{amount}</div>
            </div>
        </motion.div>
    );
}

export default YellowStatusBar;
