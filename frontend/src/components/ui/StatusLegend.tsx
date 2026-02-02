import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface StatusItem {
    status: string;
    label: string;
    color: string;
    description: string;
}

interface StatusLegendProps {
    type: 'nft' | 'otc';
    className?: string;
}

const NFT_STATUSES: StatusItem[] = [
    { status: 'none', label: 'None', color: 'bg-gray-500', description: 'Available - no investor yet' },
    { status: 'locked', label: 'Locked', color: 'bg-yellow-500', description: 'Capital deposited, waiting for mint' },
    { status: 'minted', label: 'Minted', color: 'bg-blue-500', description: 'NFT minted successfully' },
    { status: 'approved', label: 'Approved', color: 'bg-cyan-500', description: 'Both parties approved sale terms' },
    { status: 'sold', label: 'Sold', color: 'bg-purple-500', description: 'NFT sold, awaiting distribution' },
    { status: 'settled', label: 'Settled', color: 'bg-green-500', description: 'Complete - proceeds distributed' },
    { status: 'refunded', label: 'Refunded', color: 'bg-red-500', description: 'Failed - capital returned' },
];

const OTC_STATUSES: StatusItem[] = [
    { status: 'none', label: 'Open', color: 'bg-gray-500', description: 'Offer available to take' },
    { status: 'maker_locked', label: 'Maker Locked', color: 'bg-yellow-500', description: 'Maker deposited, waiting for taker' },
    { status: 'both_locked', label: 'Both Locked', color: 'bg-blue-500', description: 'Both assets locked, validating price' },
    { status: 'settled', label: 'Settled', color: 'bg-green-500', description: 'Complete - assets swapped' },
    { status: 'refunded', label: 'Refunded', color: 'bg-red-500', description: 'Cancelled - assets returned' },
];

/**
 * StatusLegend - Explains what each status means
 */
export function StatusLegend({ type, className = '' }: StatusLegendProps) {
    const [isOpen, setIsOpen] = useState(false);

    const statuses = type === 'nft' ? NFT_STATUSES : OTC_STATUSES;
    const title = type === 'nft' ? 'NFT Status Guide' : 'OTC Status Guide';

    return (
        <div className={`bg-bg-secondary border border-border rounded-lg ${className}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-tertiary transition-colors rounded-lg"
            >
                <div className="flex items-center gap-2">
                    <HelpCircle size={16} className="text-gray-400" />
                    <span className="font-medium text-sm">{title}</span>
                </div>
                {isOpen ? (
                    <ChevronUp size={16} className="text-gray-400" />
                ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                )}
            </button>

            {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-border">
                    <div className="grid gap-2 mt-2">
                        {statuses.map((item) => (
                            <div key={item.status} className="flex items-start gap-3">
                                <div className={`w-3 h-3 rounded-full ${item.color} mt-1 flex-shrink-0`} />
                                <div>
                                    <span className="font-medium text-sm text-white">
                                        {item.label}:
                                    </span>
                                    <span className="text-sm text-gray-400 ml-1">
                                        {item.description}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Get status tooltip description
 */

export function getStatusTooltip(status: string, type: 'nft' | 'otc'): string {
    const statuses = type === 'nft' ? NFT_STATUSES : OTC_STATUSES;
    const found = statuses.find(s => s.status === status.toLowerCase());
    return found?.description || 'Unknown status';
}

/**
 * Get status color class
 */
export function getStatusColor(status: string, type: 'nft' | 'otc'): string {
    const statuses = type === 'nft' ? NFT_STATUSES : OTC_STATUSES;
    const found = statuses.find(s => s.status === status.toLowerCase());
    return found?.color || 'bg-gray-500';
}

export default StatusLegend;
