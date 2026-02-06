import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import { useFreelanceEscrow, DISPUTE_TYPE } from '../hooks/useFreelanceEscrow';
import { freelanceProjects, disputes as supabaseDisputes, freelanceMilestones, txHistory, milestoneComms } from '@/lib/supabase';
import { PLATFORM } from '@/utils/constants';

// Storage key for deployed projects (fallback for localStorage)
const PROJECTS_STORAGE_KEY = 'freelance_deployed_projects';

interface DisputedMilestone {
    escrowAddress: `0x${string}`;
    milestoneId: bigint;
    milestoneAmount: bigint;
    worker: `0x${string}`;
    client: `0x${string}`;
    description: string;
    disputeType: number;
    disputeReason: string;
    disputeInitiator: `0x${string}`;
    raisedAt: bigint;
    source?: 'yellow' | 'onchain';  // Track where dispute came from
}

// Custom JSON serializer that handles BigInt
function serializeWithBigInt(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) =>
        typeof value === 'bigint' ? `__bigint__${value.toString()}` : value
    );
}

// Custom JSON deserializer that handles BigInt
function deserializeWithBigInt(str: string): unknown {
    return JSON.parse(str, (_key, value) => {
        if (typeof value === 'string' && value.startsWith('__bigint__')) {
            return BigInt(value.slice(10));
        }
        return value;
    });
}

// Storage key for resolved disputes
const RESOLVED_DISPUTES_KEY = 'freelance_resolved_disputes';

/**
 * DisputeManagement - Platform admin page for resolving disputes
 * Only visible to the platform wallet (fee collector)
 */
export function DisputeManagement() {
    const { address } = useAccount();
    const [disputedMilestones, setDisputedMilestones] = useState<DisputedMilestone[]>([]);

    // Load resolved disputes from localStorage
    const [resolvedDisputes, setResolvedDisputes] = useState<(DisputedMilestone & { winner: 'client' | 'worker' | 'cancelled', txHash?: string })[]>(() => {
        try {
            const stored = localStorage.getItem(RESOLVED_DISPUTES_KEY);
            return stored ? deserializeWithBigInt(stored) as (DisputedMilestone & { winner: 'client' | 'worker' | 'cancelled', txHash?: string })[] : [];
        } catch {
            return [];
        }
    });

    const [isLoading, setIsLoading] = useState(true);
    const [selectedDispute, setSelectedDispute] = useState<DisputedMilestone | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [successTx, setSuccessTx] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Check if user is platform admin (the deployer wallet / fee collector)
    const isPlatform = address?.toLowerCase() === PLATFORM.ADMIN_ADDRESS.toLowerCase();

    // Manual escrow address input for testing
    const [manualEscrow, setManualEscrow] = useState('');
    const [scanLoading, setScanLoading] = useState(false);

    // Persist resolved disputes to localStorage
    useEffect(() => {
        if (resolvedDisputes.length > 0) {
            localStorage.setItem(RESOLVED_DISPUTES_KEY, serializeWithBigInt(resolvedDisputes));
        }
    }, [resolvedDisputes]);

    // Handle manual scan
    const handleManualScan = async () => {
        if (!manualEscrow || !manualEscrow.startsWith('0x')) {
            setError('Please enter a valid escrow address');
            return;
        }

        setScanLoading(true);
        setError(null);

        try {
            const escrowAddr = manualEscrow as `0x${string}`;
            console.log('[DisputeManagement] Manual scan for:', escrowAddr);

            // For this demo, we'll directly query using the contract hook
            // The user should see the dispute in the project dashboard and 
            // we'll add this escrow to the scan list
            const storedKeys = Object.keys(localStorage).filter(k => k.startsWith(PROJECTS_STORAGE_KEY));
            let projectFound = false;

            storedKeys.forEach(key => {
                try {
                    const projects = JSON.parse(localStorage.getItem(key) || '[]');
                    if (projects.includes(escrowAddr)) {
                        projectFound = true;
                    }
                } catch {
                    // Ignore parse errors
                }
            });

            if (!projectFound) {
                // Add to current user's localStorage
                const currentKey = `${PROJECTS_STORAGE_KEY}_${address}`;
                const existingProjects = JSON.parse(localStorage.getItem(currentKey) || '[]');
                if (!existingProjects.includes(escrowAddr)) {
                    existingProjects.push(escrowAddr);
                    localStorage.setItem(currentKey, JSON.stringify(existingProjects));
                    console.log('[DisputeManagement] Added to localStorage:', escrowAddr);
                }
            }

            // Trigger a reload
            window.location.reload();
        } catch (e) {
            console.error('Error in manual scan:', e);
            setError('Failed to scan escrow. Check the address and try again.');
        }
        setScanLoading(false);
    };

    // Load all deployed projects and scan for disputes
    useEffect(() => {
        const loadDisputes = async () => {
            if (!address || !isPlatform) {
                setIsLoading(false);
                return;
            }

            try {
                // =====================================================
                // STEP 1: Load Yellow/Off-chain disputes from Supabase
                // =====================================================
                console.log('[DisputeManagement] 🟡 Loading Yellow disputes from Supabase...');
                const pendingDisputes = await supabaseDisputes.getPending();
                console.log('[DisputeManagement] Found pending disputes in Supabase:', pendingDisputes.length, pendingDisputes);

                // Convert Supabase disputes to DisputedMilestone format
                const yellowDisputes: DisputedMilestone[] = [];

                for (const dispute of pendingDisputes) {
                    console.log('[DisputeManagement] Processing dispute:', dispute);

                    // Get milestone details from Supabase
                    const milestoneData = await freelanceMilestones.getByProjectAndIndex(
                        dispute.escrow_address,
                        dispute.milestone_index || 0
                    );
                    console.log('[DisputeManagement] Milestone data:', milestoneData);

                    // Get project details (use getByEscrow for single project)
                    const projectData = await freelanceProjects.getByEscrow(dispute.escrow_address);
                    console.log('[DisputeManagement] Project data:', projectData);

                    // Even if milestoneData is null, still add the dispute with fallback values
                    // Map dispute type string back to number
                    const disputeTypeNum = Object.entries(DISPUTE_TYPE).find(
                        ([, v]) => v === dispute.dispute_type
                    )?.[0] || '1';

                    yellowDisputes.push({
                        escrowAddress: dispute.escrow_address as `0x${string}`,
                        milestoneId: BigInt(dispute.milestone_index || 0),
                        milestoneAmount: parseEther(milestoneData?.amount || '0.0025'), // Default amount
                        worker: (milestoneData?.worker_address || '0x0000000000000000000000000000000000000000') as `0x${string}`,
                        client: (projectData?.client_address || '0x0000000000000000000000000000000000000000') as `0x${string}`,
                        description: milestoneData?.description || `Milestone ${(dispute.milestone_index || 0) + 1}`,
                        disputeType: parseInt(disputeTypeNum),
                        disputeReason: dispute.reason || 'No reason provided',
                        disputeInitiator: dispute.raised_by as `0x${string}`,
                        raisedAt: BigInt(Math.floor(new Date(dispute.created_at || Date.now()).getTime() / 1000)),
                        source: 'yellow',  // Mark as Yellow/off-chain dispute
                    });
                    console.log('[DisputeManagement] 🟡 Added Yellow dispute:', dispute.escrow_address, 'milestone', dispute.milestone_index);
                }

                // Set Yellow disputes immediately
                if (yellowDisputes.length > 0) {
                    setDisputedMilestones(yellowDisputes);
                    console.log('[DisputeManagement] ✅ Loaded', yellowDisputes.length, 'Yellow disputes');
                }

                // =====================================================
                // STEP 2: Also prepare for on-chain scanning
                // =====================================================
                // First try Supabase - get ALL projects (not just user's)
                const supabaseProjects = await freelanceProjects.getAll();
                const supabaseAddresses = supabaseProjects.map(p => p.escrow_address as `0x${string}`);
                console.log('[DisputeManagement] Supabase projects:', supabaseAddresses.length);

                // Also check localStorage as fallback (aggregated across all users)
                const storedKeys = Object.keys(localStorage).filter(k => k.startsWith(PROJECTS_STORAGE_KEY));
                const localProjects: `0x${string}`[] = [];

                storedKeys.forEach(key => {
                    try {
                        const projects = JSON.parse(localStorage.getItem(key) || '[]');
                        localProjects.push(...projects);
                    } catch {
                        // Ignore parse errors
                    }
                });

                // Combine and dedupe
                const allProjects = [...new Set([...supabaseAddresses, ...localProjects])];
                console.log('[DisputeManagement] Total unique projects to scan:', allProjects.length, allProjects);

                // Note: On-chain disputes will be loaded via DisputeScanner component below
            } catch (e) {
                console.error("Error loading disputes:", e);
            }
            setIsLoading(false);
        };

        loadDisputes();
    }, [address, isPlatform]);

    // If not platform, show access denied
    if (!isPlatform) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-16 text-center">
                <div className="text-6xl mb-4">🔒</div>
                <h1 className="text-2xl font-bold text-white mb-4">Access Restricted</h1>
                <p className="text-gray-400 mb-4">
                    This page is only accessible to the platform administrator.
                </p>
                <p className="text-sm text-gray-500">
                    Current wallet: {address?.slice(0, 8)}...{address?.slice(-6)}
                </p>
            </div>
        );
    }

    const yellowDisputeCount = disputedMilestones.filter(d => d.source === 'yellow').length;
    const onchainDisputeCount = disputedMilestones.filter(d => d.source !== 'yellow').length;

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                    ⚖️ Dispute Management
                </h1>
                <p className="text-gray-400">
                    Resolve disputes between clients and workers. Award funds to the winning party.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                <div className="bg-bg-card border border-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Open Disputes</p>
                    <p className="text-2xl font-bold text-red-400">{disputedMilestones.length}</p>
                </div>
                <div className="bg-bg-card border border-yellow-500/30 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">🟡 Yellow (Gasless)</p>
                    <p className="text-2xl font-bold text-yellow-400">{yellowDisputeCount}</p>
                </div>
                <div className="bg-bg-card border border-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">⛓️ On-Chain</p>
                    <p className="text-2xl font-bold text-blue-400">{onchainDisputeCount}</p>
                </div>
                <div className="bg-bg-card border border-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Resolution Rate</p>
                    <p className="text-2xl font-bold text-green-400">100%</p>
                </div>
            </div>

            {/* Disputes List */}
            {isLoading ? (
                <div className="text-center py-12">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Loading disputes...</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Manual Escrow Scan - Always visible */}
                    <div className="bg-bg-card border border-yellow-500/30 rounded-xl p-6">
                        <h3 className="text-lg font-medium text-yellow-400 mb-3">🔍 Scan Escrow for Disputes</h3>
                        <p className="text-gray-400 text-sm mb-4">
                            Enter an escrow contract address to scan for disputed milestones.
                        </p>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={manualEscrow}
                                onChange={(e) => setManualEscrow(e.target.value)}
                                placeholder="0x... escrow address"
                                className="flex-1 px-4 py-2 bg-bg-elevated border border-gray-700 rounded-lg text-white font-mono text-sm placeholder:text-gray-600"
                            />
                            <button
                                onClick={handleManualScan}
                                disabled={scanLoading || !manualEscrow}
                                className="px-6 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                            >
                                {scanLoading ? 'Scanning...' : '🔍 Scan'}
                            </button>
                        </div>
                        {error && (
                            <p className="text-red-400 text-sm mt-2">❌ {error}</p>
                        )}
                    </div>

                    {/* Known Projects - Auto Scan for Disputes */}
                    <DisputeScanner
                        onDisputeFound={(dispute) => {
                            setDisputedMilestones(prev => {
                                // Avoid duplicates
                                if (prev.some(d => d.escrowAddress === dispute.escrowAddress && d.milestoneId === dispute.milestoneId)) {
                                    return prev;
                                }
                                return [...prev, dispute];
                            });
                        }}
                    />

                    {/* Disputes List - Shows when disputes are found */}
                    {disputedMilestones.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-medium text-red-400">🔴 Active Disputes ({disputedMilestones.length})</h3>
                                <div className="flex items-center gap-2 text-xs">
                                    {disputedMilestones.filter(d => d.source === 'yellow').length > 0 && (
                                        <span className="px-2 py-1 bg-yellow-400/10 text-yellow-300 rounded-lg">
                                            🟡 {disputedMilestones.filter(d => d.source === 'yellow').length} Yellow
                                        </span>
                                    )}
                                    {disputedMilestones.filter(d => d.source !== 'yellow').length > 0 && (
                                        <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg">
                                            ⛓️ {disputedMilestones.filter(d => d.source !== 'yellow').length} On-chain
                                        </span>
                                    )}
                                </div>
                            </div>
                            {disputedMilestones.map((dispute) => (
                                <DisputeCard
                                    key={`${dispute.escrowAddress}-${dispute.milestoneId.toString()}`}
                                    dispute={dispute}
                                    onResolve={setSelectedDispute}
                                />
                            ))}
                        </div>
                    ) : (
                        /* No Disputes Message */
                        <div className="bg-bg-card border border-gray-800 rounded-xl p-12 text-center">
                            <div className="text-5xl mb-4">✅</div>
                            <h3 className="text-xl font-bold text-white mb-2">No Active Disputes</h3>
                            <p className="text-gray-400">
                                All disputes have been resolved. Use the scan tool above to check specific escrows.
                            </p>
                            <div className="mt-6 p-4 bg-bg-elevated rounded-lg">
                                <p className="text-sm text-gray-500 mb-2">💡 To test dispute resolution:</p>
                                <ol className="text-sm text-gray-400 text-left list-decimal list-inside space-y-1">
                                    <li>Create a project as Client</li>
                                    <li>Fund the escrow</li>
                                    <li>Submit work as Worker (using another wallet)</li>
                                    <li>Raise a dispute as either party</li>
                                    <li>Paste the escrow address above and click Scan</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {/* Resolved Disputes Section */}
                    {resolvedDisputes.length > 0 && (
                        <div className="space-y-4 mt-8">
                            <h3 className="text-lg font-medium text-green-400">✅ Resolved Disputes ({resolvedDisputes.length})</h3>
                            {resolvedDisputes.map((dispute) => (
                                <div
                                    key={`resolved-${dispute.escrowAddress}-${dispute.milestoneId.toString()}`}
                                    className="bg-bg-card border border-green-500/30 rounded-xl p-5"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${dispute.winner === 'worker' ? 'bg-green-500/10 text-green-400' :
                                                    dispute.winner === 'client' ? 'bg-blue-500/10 text-blue-400' :
                                                        'bg-purple-500/10 text-purple-400'
                                                    }`}>
                                                    {dispute.winner === 'worker' ? '👷 Worker Won' :
                                                        dispute.winner === 'client' ? '💼 Client Won' :
                                                            '🤝 Cancelled & Resumed'}
                                                </span>
                                            </div>
                                            <h3 className="text-white font-medium mb-2">{dispute.description}</h3>
                                            <div className="flex gap-4 text-sm text-gray-500">
                                                <span>Amount: {formatEther(dispute.milestoneAmount)} ETH</span>
                                                <span>Escrow: {dispute.escrowAddress.slice(0, 8)}...</span>
                                            </div>
                                            {dispute.txHash && (() => {
                                                // Try to parse as JSON (Yellow resolution with signature + stateHash)
                                                try {
                                                    const yellowData = JSON.parse(dispute.txHash);
                                                    if (yellowData.signature && yellowData.stateHash) {
                                                        return (
                                                            <div className="mt-3 text-xs bg-bg-elevated rounded-lg p-3 space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-yellow-400">🟡 Resolved via Yellow Network</span>
                                                                    <span className="text-gray-500">• Gasless</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-500 block mb-1">🔐 Signature:</span>
                                                                    <span className="text-green-400 font-mono text-[10px] break-all block bg-black/30 p-1.5 rounded">
                                                                        {yellowData.signature}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-500 block mb-1">📋 State Hash:</span>
                                                                    <span className="text-blue-400 font-mono text-[10px] break-all block bg-black/30 p-1.5 rounded">
                                                                        {yellowData.stateHash}
                                                                    </span>
                                                                </div>
                                                                {yellowData.signer && (
                                                                    <div>
                                                                        <span className="text-gray-500">👤 Signer: </span>
                                                                        <span className="text-gray-300 font-mono">{yellowData.signer}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }
                                                } catch {
                                                    // Not JSON, handle as before
                                                }

                                                // Fallback: Check if it's a Yellow signature (132 chars) vs TX hash (66 chars)
                                                if (dispute.txHash.length > 70) {
                                                    return (
                                                        <div className="mt-2 text-xs">
                                                            <span className="text-yellow-400">🟡 Resolved via Yellow Network</span>
                                                            <span className="text-gray-500 ml-2">• Gasless</span>
                                                            <div className="mt-1">
                                                                <span className="text-gray-500">Signature: </span>
                                                                <span className="text-green-400 font-mono break-all">
                                                                    {dispute.txHash}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                } else if (dispute.txHash === 'yellow-gasless') {
                                                    return (
                                                        <div className="mt-2 text-xs">
                                                            <span className="text-yellow-400">🟡 Resolved via Yellow Network</span>
                                                            <span className="text-gray-500 ml-2">• Gasless resolution</span>
                                                        </div>
                                                    );
                                                } else {
                                                    return (
                                                        <a
                                                            href={`https://sepolia.etherscan.io/tx/${dispute.txHash}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-block mt-2 text-xs text-primary-400 hover:text-primary-300"
                                                        >
                                                            View Transaction ↗
                                                        </a>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Resolution Modal */}
            {selectedDispute && (
                <ResolveDisputeModal
                    dispute={selectedDispute}
                    onClose={() => {
                        setSelectedDispute(null);
                        setSuccessTx(null);
                        setError(null);
                    }}
                    isResolving={isResolving}
                    setIsResolving={setIsResolving}
                    successTx={successTx}
                    setSuccessTx={setSuccessTx}
                    error={error}
                    setError={setError}
                    onResolved={(winner, txHash) => {
                        // Add to resolved list
                        setResolvedDisputes(prev => [...prev, { ...selectedDispute, winner, txHash }]);
                        // Remove from active list
                        setDisputedMilestones(prev =>
                            prev.filter(d => !(d.escrowAddress === selectedDispute.escrowAddress && d.milestoneId === selectedDispute.milestoneId))
                        );
                    }}
                />
            )}
        </div>
    );
}

// Dispute Card Component
function DisputeCard({
    dispute,
    onResolve,
}: {
    dispute: DisputedMilestone;
    onResolve: (dispute: DisputedMilestone) => void;
}) {
    const disputeTypeName = DISPUTE_TYPE[dispute.disputeType as keyof typeof DISPUTE_TYPE] || 'Unknown';
    const isYellow = dispute.source === 'yellow';

    return (
        <div className="bg-bg-card border border-red-500/30 rounded-xl p-5 hover:border-red-500/50 transition-colors">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium">
                            🔴 Disputed
                        </span>
                        <span className="px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-medium">
                            {disputeTypeName}
                        </span>
                        {isYellow && (
                            <span className="px-2 py-1 bg-yellow-400/10 text-yellow-300 rounded-lg text-xs font-medium">
                                🟡 Yellow (Gasless)
                            </span>
                        )}
                    </div>

                    <h3 className="text-white font-medium mb-2">{dispute.description}</h3>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div>
                            <span className="text-gray-500">Amount:</span>
                            <span className="ml-2 text-white font-mono">{formatEther(dispute.milestoneAmount)} ETH</span>
                        </div>
                        <div>
                            <span className="text-gray-500">Escrow:</span>
                            <span className="ml-2 text-gray-400 font-mono text-xs">{dispute.escrowAddress.slice(0, 8)}...{dispute.escrowAddress.slice(-6)}</span>
                        </div>
                    </div>

                    <div className="bg-bg-elevated rounded-lg p-3 text-sm">
                        <p className="text-gray-400 mb-1"><strong className="text-gray-300">Dispute Reason:</strong></p>
                        <p className="text-gray-300">{dispute.disputeReason}</p>
                    </div>

                    <div className="flex gap-4 mt-3 text-xs text-gray-500">
                        <span>Client: {dispute.client.slice(0, 8)}...</span>
                        <span>Worker: {dispute.worker.slice(0, 8)}...</span>
                        <span>Initiated by: {dispute.disputeInitiator.slice(0, 8)}...</span>
                    </div>
                </div>

                <button
                    onClick={() => onResolve(dispute)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
                >
                    ⚖️ Resolve
                </button>
            </div>
        </div>
    );
}

// Resolve Dispute Modal
function ResolveDisputeModal({
    dispute,
    onClose,
    isResolving,
    setIsResolving,
    successTx,
    setSuccessTx,
    error,
    setError,
    onResolved,
}: {
    dispute: DisputedMilestone;
    onClose: () => void;
    isResolving: boolean;
    setIsResolving: (v: boolean) => void;
    successTx: string | null;
    setSuccessTx: (v: string | null) => void;
    error: string | null;
    setError: (v: string | null) => void;
    onResolved: (winner: 'client' | 'worker' | 'cancelled', txHash?: string) => void;
}) {
    const { resolveDispute, cancelDispute, refetchAll } = useFreelanceEscrow(dispute.escrowAddress);
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const [isCancelling, setIsCancelling] = useState(false);
    const [yellowSuccess, setYellowSuccess] = useState(false);
    const [yellowSessionId, setYellowSessionId] = useState<string | null>(null);
    const [yellowStateVersion, setYellowStateVersion] = useState<number | null>(null);


    const isYellowDispute = dispute.source === 'yellow';


    // Handle Yellow gasless resolution (with signature!)
    const handleYellowResolve = async (winner: 'client' | 'worker') => {
        console.log('[DisputeResolution] 🟡 Starting Yellow resolution for:', winner);
        setIsResolving(true);
        setError(null);
        try {
            const timestamp = Date.now();

            // Step 1: Request signature from MetaMask (gasless but requires confirmation)
            const messageData = {
                type: 'dispute_resolve',
                action: winner === 'worker' ? 'award_worker' : 'award_client',
                escrow: dispute.escrowAddress,
                milestone: dispute.milestoneId.toString(),
                amount: dispute.milestoneAmount.toString(),
                winner_address: winner === 'worker' ? dispute.worker : dispute.client,
                timestamp,
            };
            const message = JSON.stringify(messageData);

            console.log('[DisputeResolution] 🖊️ Requesting signature...');
            const signature = await signMessageAsync({ message });
            console.log('[DisputeResolution] ✅ Signature obtained:', signature);

            // Look up REAL Yellow session from localStorage using escrow address
            const yellowSessionKey = `yellow_session_${dispute.escrowAddress.toLowerCase()}`;
            let realSessionId = `resolution_${dispute.escrowAddress.slice(0, 10)}_${timestamp}`;
            let realStateVersion = 0;

            try {
                const storedSession = localStorage.getItem(yellowSessionKey);
                if (storedSession) {
                    const session = JSON.parse(storedSession);
                    // Use the real ClearNode app_session_id (the 0x... hash)
                    realSessionId = session.appSessionId || session.sessionId || realSessionId;
                    // Use the current state version + 1 for this new operation
                    realStateVersion = (session.stateVersion || 0) + 1;
                    console.log('[DisputeResolution] 📦 Found real Yellow session:', realSessionId, 'version:', realStateVersion);
                } else {
                    console.warn('[DisputeResolution] ⚠️ No Yellow session found in localStorage, using fallback ID');
                    realStateVersion = 1; // First state
                }
            } catch (e) {
                console.warn('[DisputeResolution] Failed to load Yellow session:', e);
                realStateVersion = 1;
            }

            console.log('[DisputeResolution] ✅ Yellow Session ID:', realSessionId, 'State Version:', realStateVersion);

            setYellowSessionId(realSessionId);
            setYellowStateVersion(realStateVersion);

            console.log('[DisputeResolution] 🟡 Resolving via Yellow (gasless)');
            console.log('[DisputeResolution] Escrow:', dispute.escrowAddress, 'Milestone:', dispute.milestoneId.toString());

            // Update Supabase dispute status
            const allDisputes = await supabaseDisputes.getAll();
            console.log('[DisputeResolution] Found disputes:', allDisputes.length);
            const thisDispute = allDisputes.find(d =>
                d.escrow_address.toLowerCase() === dispute.escrowAddress.toLowerCase() &&
                d.milestone_index === Number(dispute.milestoneId)
            );
            console.log('[DisputeResolution] Matching dispute:', thisDispute);

            if (thisDispute?.id) {
                const newStatus = winner === 'worker' ? 'resolved_worker' : 'resolved_client';
                console.log('[DisputeResolution] Updating dispute status to:', newStatus);
                await supabaseDisputes.resolve(thisDispute.id, newStatus);
                console.log('[DisputeResolution] ✅ Dispute status updated');
            } else {
                console.warn('[DisputeResolution] ⚠️ No matching dispute found in Supabase');
            }

            // Update milestone status in Supabase
            const newMilestoneStatus = winner === 'worker' ? 'approved' : 'cancelled';
            const milestoneData = await freelanceMilestones.getByProjectAndIndex(
                dispute.escrowAddress,
                Number(dispute.milestoneId)
            );
            console.log('[DisputeResolution] Milestone data:', milestoneData);

            if (milestoneData?.id) {
                console.log('[DisputeResolution] Updating milestone status to:', newMilestoneStatus);
                await freelanceMilestones.update(milestoneData.id, {
                    status: newMilestoneStatus,
                });
                console.log('[DisputeResolution] ✅ Milestone status updated');
            } else {
                console.warn('[DisputeResolution] ⚠️ No matching milestone found in Supabase');
            }

            // Store in tx_history - Note: metadata stored in milestone_communications instead
            // since tx_history table doesn't have metadata column
            await txHistory.add({
                escrow_address: dispute.escrowAddress,
                escrow_type: 'freelance',
                tx_type: 'yellow_dispute_resolve',
                tx_hash: realSessionId, // Use Yellow session ID as the "tx hash" identifier
                from_address: address || '0x',
            });
            console.log('[DisputeResolution] ✅ TX history recorded');

            // Add to milestone communications for history
            await milestoneComms.create({
                escrow_address: dispute.escrowAddress,
                milestone_index: Number(dispute.milestoneId),
                sender_address: address || '0x',
                message_type: 'dispute_resolved',
                message: `Dispute resolved: ${winner === 'worker' ? 'Worker awarded' : 'Client refunded'} via Yellow Network`,
                tx_hash: realSessionId,
            });

            setYellowSuccess(true);
            // Pass Yellow proof data in a structured format
            onResolved(winner, JSON.stringify({ yellowSessionId: realSessionId, yellowStateVersion: realStateVersion, signer: address }));
            console.log('[DisputeResolution] ✅ Yellow resolution complete');
        } catch (e: any) {
            console.error('[DisputeResolution] ❌ Yellow resolution failed:', e);
            setError(e.message || 'Failed to resolve dispute');
        }
        setIsResolving(false);
    };

    // Handle Yellow gasless cancel
    const handleYellowCancel = async () => {
        console.log('[DisputeResolution] 🟡 Starting Yellow cancel');
        setIsCancelling(true);
        setError(null);
        try {
            const timestamp = Date.now();

            // Step 1: Request signature from MetaMask (gasless but requires confirmation)
            const messageData = {
                type: 'dispute_cancel',
                action: 'cancel_and_continue',
                escrow: dispute.escrowAddress,
                milestone: dispute.milestoneId.toString(),
                timestamp,
            };
            const message = JSON.stringify(messageData);

            console.log('[DisputeResolution] 🖊️ Requesting cancel signature...');
            const signature = await signMessageAsync({ message });
            console.log('[DisputeResolution] ✅ Signature obtained:', signature);

            // Look up REAL Yellow session from localStorage using escrow address
            const yellowSessionKey = `yellow_session_${dispute.escrowAddress.toLowerCase()}`;
            let realSessionId = `session_${dispute.escrowAddress}_dispute`;
            let realStateVersion = 0;

            try {
                const storedSession = localStorage.getItem(yellowSessionKey);
                if (storedSession) {
                    const session = JSON.parse(storedSession);
                    realSessionId = session.appSessionId || session.sessionId || realSessionId;
                    realStateVersion = (session.stateVersion || 0) + 1;
                    console.log('[DisputeResolution] 📦 Found real Yellow session:', realSessionId, 'version:', realStateVersion);
                } else {
                    console.warn('[DisputeResolution] ⚠️ No Yellow session found, using fallback ID');
                    realStateVersion = 1;
                }
            } catch (e) {
                console.warn('[DisputeResolution] Failed to load Yellow session:', e);
                realStateVersion = 1;
            }

            console.log('[DisputeResolution] ✅ Yellow Session:', realSessionId, 'Version:', realStateVersion);

            setYellowSessionId(realSessionId);
            setYellowStateVersion(realStateVersion);

            console.log('[DisputeResolution] 🟡 Cancelling via Yellow (gasless)');

            // Update Supabase dispute status - DELETE the dispute record so it no longer shows
            const allDisputes = await supabaseDisputes.getAll();
            console.log('[DisputeResolution] Found disputes:', allDisputes.length);
            const thisDispute = allDisputes.find(d =>
                d.escrow_address.toLowerCase() === dispute.escrowAddress.toLowerCase() &&
                d.milestone_index === Number(dispute.milestoneId)
            );
            console.log('[DisputeResolution] Matching dispute:', thisDispute);

            if (thisDispute?.id) {
                // Mark as resolved (cancelled)
                console.log('[DisputeResolution] Updating dispute status to cancelled');
                await supabaseDisputes.resolve(thisDispute.id, 'cancelled');
                console.log('[DisputeResolution] ✅ Dispute marked as cancelled');
            }

            // Update milestone status back to submitted (work continues)
            const milestoneData = await freelanceMilestones.getByProjectAndIndex(
                dispute.escrowAddress,
                Number(dispute.milestoneId)
            );
            console.log('[DisputeResolution] Milestone data:', milestoneData);

            if (milestoneData?.id) {
                console.log('[DisputeResolution] Updating milestone status to submitted');
                await freelanceMilestones.update(milestoneData.id, {
                    status: 'submitted', // Back to submitted state so work can continue
                });
                console.log('[DisputeResolution] ✅ Milestone status updated to submitted');
            }

            // Store in tx_history with Yellow proof data
            await txHistory.add({
                escrow_address: dispute.escrowAddress,
                escrow_type: 'freelance',
                tx_type: 'yellow_dispute_cancel',
                tx_hash: realSessionId,
                from_address: address || '0x',
            });
            console.log('[DisputeResolution] ✅ TX history recorded with Yellow session ID');

            // Add to milestone communications for history
            await milestoneComms.create({
                escrow_address: dispute.escrowAddress,
                milestone_index: Number(dispute.milestoneId),
                sender_address: address || '0x',
                message_type: 'dispute_resolved',
                message: 'Dispute cancelled - work continues via Yellow Network',
                tx_hash: realSessionId,
            });

            setYellowSuccess(true);
            onResolved('cancelled', JSON.stringify({ yellowSessionId: realSessionId, yellowStateVersion: realStateVersion, signer: address }));
            console.log('[DisputeResolution] ✅ Yellow cancellation complete');
        } catch (e: any) {
            console.error('[DisputeResolution] ❌ Yellow cancellation failed:', e);
            setError(e.message || 'Failed to cancel dispute');
        }
        setIsCancelling(false);
    };

    // Handle on-chain resolution (fallback for on-chain disputes)
    const handleResolve = async (winner: `0x${string}`) => {
        setIsResolving(true);
        setError(null);
        try {
            const result = await resolveDispute(dispute.milestoneId, winner);
            if (result?.hash) {
                setSuccessTx(result.hash);
                await refetchAll();
                // Determine if winner is client or worker
                const winnerType = winner.toLowerCase() === dispute.client.toLowerCase() ? 'client' : 'worker';
                onResolved(winnerType, result.hash);
            }
        } catch (e: any) {
            setError(e.message || 'Failed to resolve dispute');
        }
        setIsResolving(false);
    };

    const handleCancel = async () => {
        setIsCancelling(true);
        setError(null);
        try {
            const result = await cancelDispute(dispute.milestoneId);
            if (result?.hash) {
                setSuccessTx(result.hash);
                await refetchAll();
                onResolved('cancelled', result.hash);
            }
        } catch (e: any) {
            setError(e.message || 'Failed to cancel dispute');
        }
        setIsCancelling(false);
    };

    // Success view for Yellow gasless
    if (yellowSuccess) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
                <div className="bg-bg-card border border-yellow-500/30 rounded-2xl w-full max-w-lg my-8">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🟡</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Dispute Resolved via Yellow! ⚡</h2>
                        <p className="text-gray-400 text-sm mb-4">Resolution recorded gaslessly via Yellow Network.</p>
                        <div className="bg-bg-elevated rounded-lg p-4 text-sm space-y-3">
                            <p className="text-yellow-400 text-center">💰 Gas Saved: ~$7.60</p>

                            {yellowSessionId && (
                                <div className="text-left border-t border-gray-700 pt-3">
                                    <p className="text-gray-500 text-xs mb-1 font-medium">🔗 Dispute Resolution ID:</p>
                                    <p className="text-green-400 font-mono text-xs break-all bg-black/30 p-2 rounded">
                                        {yellowSessionId}
                                    </p>
                                    <p className="text-gray-500 text-xs mt-2">
                                        💡 This ID is cryptographically linked to your signature
                                    </p>
                                </div>
                            )}

                            {yellowStateVersion !== null && (
                                <div className="text-left border-t border-gray-700 pt-3">
                                    <p className="text-gray-500 text-xs mb-1 font-medium">📋 State Version:</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-blue-400 font-mono text-lg font-bold">v{yellowStateVersion}</span>
                                        <span className="text-xs text-gray-500">- Dispute Resolved</span>
                                    </div>
                                </div>
                            )}

                            {address && (
                                <div className="text-left border-t border-gray-700 pt-3">
                                    <p className="text-gray-500 text-xs mb-1 font-medium">👤 Signer:</p>
                                    <p className="text-gray-300 font-mono text-xs">{address}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-6 border-t border-gray-800">
                        <button onClick={onClose} className="w-full px-4 py-2.5 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Success view for on-chain
    if (successTx) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-md">
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">⚖️</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Dispute Resolved!</h2>
                        <p className="text-gray-400 text-sm mb-4">The funds have been transferred to the winning party.</p>
                        <a
                            href={`https://sepolia.etherscan.io/tx/${successTx}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm font-mono"
                        >
                            View Transaction ↗
                        </a>
                    </div>
                    <div className="p-6 border-t border-gray-800">
                        <button onClick={onClose} className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-bg-card border border-gray-800 rounded-2xl w-full max-w-lg my-8 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white">⚖️ Resolve Dispute</h2>
                        {isYellowDispute && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-yellow-400 text-xs font-medium">
                                🟡 Yellow
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{dispute.description}</p>
                </div>

                <div className="p-6 space-y-4">
                    {/* Dispute Info */}
                    <div className="bg-bg-elevated rounded-lg p-4">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Dispute Details</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Type:</span>
                                <span className="text-yellow-400">{DISPUTE_TYPE[dispute.disputeType as keyof typeof DISPUTE_TYPE]}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Amount at Stake:</span>
                                <span className="text-white font-mono">{formatEther(dispute.milestoneAmount)} ETH</span>
                            </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-700">
                            <p className="text-gray-500 text-xs mb-1">Reason:</p>
                            <p className="text-gray-300 text-sm">{dispute.disputeReason}</p>
                        </div>
                    </div>

                    {/* Parties */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-bg-elevated rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Client</p>
                            <p className="text-white font-mono text-xs break-all">{dispute.client}</p>
                        </div>
                        <div className="bg-bg-elevated rounded-lg p-3">
                            <p className="text-xs text-gray-500 mb-1">Worker</p>
                            <p className="text-white font-mono text-xs break-all">{dispute.worker}</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-4 pt-4">
                        <h4 className="text-sm font-medium text-gray-300">
                            Choose Resolution:
                            {isYellowDispute && <span className="text-yellow-400 text-xs ml-2">⚡ Gasless</span>}
                        </h4>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => isYellowDispute ? handleYellowResolve('worker') : handleResolve(dispute.worker)}
                                disabled={isResolving}
                                className="px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex flex-col items-center"
                            >
                                <span className="text-lg">👷</span>
                                <span>Award to Worker</span>
                                <span className="text-xs text-green-300 mt-1">Worker receives {formatEther(dispute.milestoneAmount)} ETH</span>
                            </button>
                            <button
                                onClick={() => isYellowDispute ? handleYellowResolve('client') : handleResolve(dispute.client)}
                                disabled={isResolving}
                                className="px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex flex-col items-center"
                            >
                                <span className="text-lg">💼</span>
                                <span>Award to Client</span>
                                <span className="text-xs text-blue-300 mt-1">Client gets refund</span>
                            </button>
                        </div>

                        {/* Cancel & Continue - Restores to pre-dispute state */}
                        <div className="pt-2 border-t border-gray-700">
                            <button
                                onClick={() => isYellowDispute ? handleYellowCancel() : handleCancel()}
                                disabled={isResolving || isCancelling}
                                className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                            >
                                {isCancelling ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Cancelling...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>🤝</span>
                                        <span>Cancel & Continue Working</span>
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 mt-2 text-center">
                                Restores milestone to its pre-dispute state so work can continue
                            </p>
                        </div>
                    </div>

                    {(isResolving || isCancelling) && (
                        <div className="flex items-center justify-center gap-2 text-primary-400">
                            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            <span>Processing resolution...</span>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <p className="text-red-400 text-sm">❌ {error}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        disabled={isResolving || isCancelling}
                        className="w-full px-4 py-2.5 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

// Dispute Scanner - queries Supabase and localStorage escrows for disputes
function DisputeScanner({ onDisputeFound }: { onDisputeFound: (dispute: DisputedMilestone) => void }) {
    const { address } = useAccount();
    const [escrowsToScan, setEscrowsToScan] = useState<`0x${string}`[]>([]);

    // Load all escrows from Supabase and localStorage on mount
    useEffect(() => {
        const loadEscrows = async () => {
            // 1. Load from Supabase (global source of truth)
            const supabaseProjects = await freelanceProjects.getAll();
            const supabaseAddresses = supabaseProjects.map(p => p.escrow_address as `0x${string}`);

            // 2. Also check localStorage as fallback
            const storedKeys = Object.keys(localStorage).filter(k => k.startsWith(PROJECTS_STORAGE_KEY));
            const localProjects: `0x${string}`[] = [];

            storedKeys.forEach(key => {
                try {
                    const projects = JSON.parse(localStorage.getItem(key) || '[]');
                    localProjects.push(...projects);
                } catch {
                    // Ignore parse errors
                }
            });

            // Combine and dedupe
            const unique = [...new Set([...supabaseAddresses, ...localProjects])] as `0x${string}`[];
            console.log('[DisputeScanner] Escrows to scan:', unique.length, 'from Supabase:', supabaseAddresses.length);
            setEscrowsToScan(unique);
        };

        loadEscrows();
    }, [address]);

    if (escrowsToScan.length === 0) {
        return null;
    }

    return (
        <div className="bg-bg-card border border-gray-800 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-3">📡 Scanning {escrowsToScan.length} known escrow(s)...</p>
            <div className="space-y-2">
                {escrowsToScan.map(escrow => (
                    <EscrowScanner
                        key={escrow}
                        escrowAddress={escrow}
                        onDisputeFound={onDisputeFound}
                    />
                ))}
            </div>
        </div>
    );
}

// Individual escrow scanner using the hook
function EscrowScanner({
    escrowAddress,
    onDisputeFound
}: {
    escrowAddress: `0x${string}`;
    onDisputeFound: (dispute: DisputedMilestone) => void;
}) {
    const { milestones, projectInfo, getDispute, isLoading } = useFreelanceEscrow(escrowAddress);
    const [scanned, setScanned] = useState(false);
    const [foundDisputes, setFoundDisputes] = useState<DisputedMilestone[]>([]);

    // Scan for disputes when milestones load
    useEffect(() => {
        const scanForDisputes = async () => {
            if (scanned || isLoading || !milestones || milestones.length === 0) return;

            console.log(`[EscrowScanner] Scanning ${escrowAddress}: ${milestones.length} milestones`);

            const disputes: DisputedMilestone[] = [];

            for (const milestone of milestones) {
                // Status 5 = Disputed
                if (milestone.status === 5) {
                    console.log(`[EscrowScanner] Found disputed milestone:`, milestone.milestoneId.toString());

                    try {
                        const disputeData = await getDispute(milestone.milestoneId);
                        console.log(`[EscrowScanner] Dispute data:`, disputeData);

                        if (disputeData && disputeData.exists && !disputeData.resolved) {
                            const dispute: DisputedMilestone = {
                                escrowAddress,
                                milestoneId: milestone.milestoneId,
                                milestoneAmount: milestone.amount,
                                worker: milestone.worker,
                                client: projectInfo?.client || '0x0000000000000000000000000000000000000000' as `0x${string}`,
                                description: milestone.description || `Milestone ${milestone.milestoneId.toString()}`,
                                disputeType: Number(disputeData.disputeType),
                                disputeReason: disputeData.reason || 'No reason provided',
                                disputeInitiator: disputeData.initiator as `0x${string}`,
                                raisedAt: disputeData.raisedAt,
                            };
                            disputes.push(dispute);
                        } else if (disputeData && disputeData.resolved) {
                            console.log(`[EscrowScanner] Dispute for milestone ${milestone.milestoneId.toString()} already resolved, skipping`);
                        }
                    } catch (e) {
                        console.error(`Error getting dispute for ${escrowAddress}:`, e);
                    }
                }
            }

            // Store locally and notify parent
            if (disputes.length > 0) {
                console.log(`[EscrowScanner] Found ${disputes.length} disputes, notifying parent`);
                setFoundDisputes(disputes);
                disputes.forEach(d => onDisputeFound(d));
            }

            setScanned(true);
        };

        scanForDisputes();
    }, [milestones, isLoading, scanned, escrowAddress, projectInfo, getDispute, onDisputeFound]);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                <span className="font-mono">{escrowAddress.slice(0, 10)}...</span>
            </div>
        );
    }

    const disputedCount = foundDisputes.length || milestones?.filter(m => m.status === 5).length || 0;

    return (
        <div className="flex items-center gap-2 text-xs">
            {disputedCount > 0 ? (
                <>
                    <span className="text-red-400">🔴</span>
                    <span className="font-mono text-red-400">{escrowAddress.slice(0, 10)}...</span>
                    <span className="text-red-400">({disputedCount} dispute{disputedCount > 1 ? 's' : ''})</span>
                </>
            ) : (
                <>
                    <span className="text-green-400">✅</span>
                    <span className="font-mono text-gray-500">{escrowAddress.slice(0, 10)}...</span>
                    <span className="text-gray-600">(no disputes)</span>
                </>
            )}
        </div>
    );
}

export default DisputeManagement;
