import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { Plus, Filter, ArrowRight, Clock, ExternalLink, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatusLegend } from '@/components/ui/StatusLegend';

import { useSupreme } from '@/hooks/useSupreme';

import { formatDeadline, CoordinationStatus, PLATFORM, calculateDeadline, LINKS } from '@/utils/constants';
import { NFT_ESCROW_ABI, TEST_NFT_ABI, CONTRACTS } from '@/lib/contracts';
import { nftListings as supabaseNFT, NFTListingDB } from '@/lib/supabase';

// NFT Escrow uses 8-phase status (see NFT_ESCROW_STATUS in contracts.ts)

interface Listing {
    id: number;
    escrowAddress?: `0x${string}`;
    nftContract: `0x${string}`;
    nftName: string;
    slotId: number;
    slotOwner: string;
    mintPrice: string; // ETH
    splitBPS: number;
    deadline: number;
    status: number;
    // TX history for each step
    txHistory?: {
        deployTx?: string;
        depositTx?: string;
        mintTx?: string;
        buyTx?: string;
        settleTx?: string;
    };
}

// Demo listings
const mockListings: Listing[] = [
    {
        id: 1,
        nftContract: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        nftName: 'Azuki',
        slotId: 42,
        slotOwner: '0xAlice...',
        mintPrice: '0.1',
        splitBPS: 7000,
        deadline: Date.now() / 1000 + 24 * 60 * 60,
        status: CoordinationStatus.NONE,
    },
    {
        id: 2,
        nftContract: '0x2345678901234567890123456789012345678901' as `0x${string}`,
        nftName: 'BAYC',
        slotId: 137,
        slotOwner: '0xBob...',
        mintPrice: '0.5',
        splitBPS: 6000,
        deadline: Date.now() / 1000 + 12 * 60 * 60,
        status: CoordinationStatus.NONE,
    },
];

export function NFTWhitelist() {
    const { address, isConnected } = useAccount();
    const { deployNFTEscrow, isLoading: deployLoading, pendingTx, clearPendingTx, isConfirmed } = useSupreme();

    // Note: We no longer use useTestNFT() - minting is done via escrow.executeMint()
    const { writeContractAsync } = useWriteContract();

    // LISTINGS STATE - now loaded from Supabase
    const [listings, setListings] = useState<Listing[]>(mockListings);
    const [isLoadingListings, setIsLoadingListings] = useState(true);

    // Load listings from Supabase on mount
    const loadListings = useCallback(async () => {
        try {
            setIsLoadingListings(true);
            const dbListings = await supabaseNFT.getAll();

            // Convert DB format to local format
            // Status mapping: created->NONE, deposited->LOCKED, minted->VERIFIED, sold->FUNDED, split->SETTLED
            const converted: Listing[] = dbListings.map((l, idx) => ({
                id: idx + 100,
                escrowAddress: l.escrow_address as `0x${string}` | undefined,
                nftContract: l.nft_contract as `0x${string}`,
                nftName: l.collection_name || 'Unknown',
                slotId: parseInt(l.slot_id || '0'),
                slotOwner: l.wl_holder ? `${l.wl_holder.slice(0, 6)}...${l.wl_holder.slice(-4)}` : '0x...',
                mintPrice: l.mint_price,
                splitBPS: (l.wl_holder_split_percent || 70) * 100,
                deadline: l.deadline ? new Date(l.deadline).getTime() / 1000 : Date.now() / 1000 + 86400,
                status: l.status === 'created' ? CoordinationStatus.NONE
                    : l.status === 'deposited' ? CoordinationStatus.LOCKED
                        : l.status === 'minted' ? CoordinationStatus.VERIFIED
                            : l.status === 'approved' ? CoordinationStatus.VERIFIED // Approved but not sold yet
                                : l.status === 'sold' ? CoordinationStatus.FUNDED
                                    : l.status === 'split' ? CoordinationStatus.SETTLED // SETTLED = 4
                                        : CoordinationStatus.NONE,
            }));

            // Deduplicate by escrow address (prefer ones with escrow address)
            const seen = new Set<string>();
            const dedupedConverted = converted.filter(l => {
                // Create unique key: escrow address if deployed, otherwise contract+slot combo
                const key = l.escrowAddress || `${l.nftContract}-${l.slotId}`;
                if (seen.has(key)) {
                    console.log('[NFTWhitelist] Skipping duplicate:', l.nftName, l.slotId);
                    return false;
                }
                seen.add(key);
                return true;
            });

            setListings([...mockListings, ...dedupedConverted]);
            console.log('[NFTWhitelist] Loaded', converted.length, 'listings from Supabase');
        } catch (err) {
            console.error('[NFTWhitelist] Failed to load listings:', err);
        } finally {
            setIsLoadingListings(false);
        }
    }, []);

    useEffect(() => {
        loadListings();
    }, [loadListings]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false); // Prevent double-submission
    const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
    const [, _setDeployedEscrow] = useState<`0x${string}` | null>(null);

    // Create listing form - defaults to TestNFT for demo
    const [newListing, setNewListing] = useState<{
        nftContract: string;
        nftName: string;
        slotId: string;
        mintPrice: string;
        splitBPS: string;
        deadlineHours: string;
    }>({
        nftContract: CONTRACTS.TEST_NFT_CONTRACT, // Default to TestNFT
        nftName: 'TestNFT',
        slotId: '',
        mintPrice: '0.002', // TestNFT requires 0.002 ETH
        splitBPS: '70', // 70%
        deadlineHours: '24',
    });

    // Capital holder address for deploy (Bob's address in demo)
    const [capitalHolderAddress, setCapitalHolderAddress] = useState<string>('');

    // Category filter: 'active' or 'completed'
    const [categoryFilter, setCategoryFilter] = useState<'active' | 'completed'>('active');

    // Filter listings by search AND category
    const filteredListings = listings.filter(l => {
        const matchesSearch = l.nftName.toLowerCase().includes(searchQuery.toLowerCase());
        // SETTLED = 4, REFUNDED = 5 - both are completed states
        const isCompleted = l.status >= CoordinationStatus.SETTLED; // >= 4
        const matchesCategory = categoryFilter === 'completed' ? isCompleted : !isCompleted;
        return matchesSearch && matchesCategory;
    });

    // Supabase sync: listings are saved directly when created/updated

    // Handle create listing
    const handleCreateListing = async () => {
        // Guard against double-submission (React StrictMode calls twice in dev)
        if (isCreating) {
            console.log('[NFTWhitelist] ⚠️ Already creating, skipping duplicate call');
            return;
        }
        setIsCreating(true);

        try {
            const listing: Listing = {
                id: listings.length + 1,
                nftContract: newListing.nftContract as `0x${string}`,
                nftName: newListing.nftName,
                slotId: parseInt(newListing.slotId),
                slotOwner: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '0x...',
                mintPrice: newListing.mintPrice,
                splitBPS: parseInt(newListing.splitBPS) * 100, // Convert % to BPS
                deadline: calculateDeadline(parseInt(newListing.deadlineHours)),
                status: CoordinationStatus.NONE,
            };

            // Save to Supabase using createOrUpdate to prevent duplicates
            const dbListing: NFTListingDB = {
                nft_contract: newListing.nftContract,
                collection_name: newListing.nftName,
                slot_id: newListing.slotId,
                wl_holder: address!,
                mint_price: newListing.mintPrice,
                wl_holder_split_percent: parseFloat(newListing.splitBPS),
                deadline: new Date(listing.deadline * 1000).toISOString(),
                status: 'created',
            };

            const saved = await supabaseNFT.createOrUpdate(dbListing);
            if (saved) {
                listing.id = listings.length + 100;
                console.log('[NFTWhitelist] ✅ Listing saved to Supabase');
            }

            // Reload from Supabase to get fresh data (instead of manually adding to avoid duplicates)
            await loadListings();
            setIsCreateModalOpen(false);
            setNewListing({ nftContract: CONTRACTS.TEST_NFT_CONTRACT, nftName: 'TestNFT', slotId: '', mintPrice: '0.002', splitBPS: '70', deadlineHours: '24' });
        } finally {
            setIsCreating(false);
        }
    };

    // Handle deploy escrow - REAL on-chain transaction!
    const handleDeployEscrow = async () => {
        if (!selectedListing || !address) return;

        try {
            console.log('[NFTWhitelist] Deploying NFT Escrow...');

            const result = await deployNFTEscrow({
                wlHolder: address, // Alice is WL holder
                capitalHolder: capitalHolderAddress ? capitalHolderAddress as `0x${string}` : address, // Bob's address if provided, else Alice
                nftContract: selectedListing.nftContract,
                mintPrice: selectedListing.mintPrice,
                splitBPS: selectedListing.splitBPS,
                deadline: Math.floor(selectedListing.deadline),
            });

            console.log('[NFTWhitelist] Deploy TX confirmed, escrow:', result.escrowAddress);

            // Update listing with status AND escrow address (now returned automatically!)
            setListings(prevListings => prevListings.map(l =>
                l.id === selectedListing.id
                    ? {
                        ...l,
                        status: CoordinationStatus.LOCKED,
                        escrowAddress: result.escrowAddress || undefined,
                        txHistory: { ...l.txHistory, deployTx: result.hash }
                    }
                    : l
            ));

            // Close modal and show success
            setIsDeployModalOpen(false);
            clearPendingTx();

            if (result.escrowAddress) {
                alert(`✅ Escrow Deployed!\n\nEscrow: ${result.escrowAddress.slice(0, 10)}...`);
            } else {
                alert(`✅ Escrow Deployed!\n\nTX: ${result.hash.slice(0, 10)}...\n\n⚠️ Could not auto-extract escrow address. Check Etherscan.`);
            }

        } catch (error) {
            console.error('[NFTWhitelist] Deploy failed:', error);
            alert('Failed to deploy escrow. Check console for details.');
        }
    };

    // When deployment TX confirms, extract escrow address from event logs
    const { data: receipt } = useTransactionReceipt({
        hash: pendingTx ?? undefined,
    });

    useEffect(() => {
        if (isConfirmed && receipt && selectedListing) {
            console.log('[NFTWhitelist] TX confirmed, extracting escrow address from logs...');
            console.log('[NFTWhitelist] Receipt logs:', receipt.logs);

            // Parse the NFTEscrowDeployed event to get the escrow address
            // Event: NFTEscrowDeployed(uint256 indexed instanceId, address indexed escrow, address indexed smartMintWallet, ...)
            let escrowAddress: `0x${string}` | null = null;

            if (receipt.logs && receipt.logs.length > 0) {
                // NFTEscrowDeployed event signature hash (first 4 bytes of keccak256)
                // We find any log with 4 indexed topics (event sig + 3 indexed params)
                for (const log of receipt.logs) {
                    console.log('[NFTWhitelist] Log:', log.address, 'topics:', log.topics.length);

                    // NFTEscrowDeployed has 4 topics: event sig + instanceId + escrow + smartMintWallet
                    if (log.topics.length >= 4) {
                        // topic[2] is the escrow address (32 bytes, address is in last 20 bytes)
                        const escrowTopic = log.topics[2];
                        if (escrowTopic) {
                            // Extract address from topic (remove 0x prefix, take last 40 chars = 20 bytes)
                            escrowAddress = `0x${escrowTopic.slice(-40)}` as `0x${string}`;
                            console.log('[NFTWhitelist] ✅ Found escrow address:', escrowAddress);
                            break;
                        }
                    }
                }
            }

            // NO FALLBACK - if we can't find the escrow address, don't save a wrong one
            if (!escrowAddress) {
                console.error('[NFTWhitelist] ❌ Could not extract escrow address from logs!');
                console.error('[NFTWhitelist] Please check the transaction on Etherscan for the escrow address.');
                alert('Escrow deployed but address extraction failed. Check Etherscan for the escrow address.');
                clearPendingTx();
                return;
            }

            // Store the escrow address for use after timeout
            const finalEscrowAddress = escrowAddress;
            const selectedId = selectedListing.id;

            // Close the deploy modal with animation
            setTimeout(() => {
                setIsDeployModalOpen(false);

                // Update listing with status, escrow address, and deploy TX using FUNCTIONAL UPDATE
                // CRITICAL: Set status here too in case page reloaded and lost optimistic update
                setListings(prevListings =>
                    prevListings.map(l =>
                        l.id === selectedId
                            ? {
                                ...l,
                                status: CoordinationStatus.LOCKED, // Ensure status is set
                                escrowAddress: finalEscrowAddress,
                                txHistory: { ...l.txHistory, deployTx: pendingTx || undefined }
                            }
                            : l
                    )
                );

                // Sync to Supabase - update listing with escrow address and status
                if (selectedListing && selectedListing.id >= 100) {
                    // This is a Supabase listing - update it
                    supabaseNFT.updateByContractAndSlot(
                        selectedListing.nftContract,
                        selectedListing.slotId,
                        {
                            escrow_address: finalEscrowAddress,
                            status: 'deposited',
                        }
                    ).then(success => {
                        if (success) {
                            console.log('[NFTWhitelist] ✅ Synced escrow to Supabase');
                        }
                    });
                }

                console.log('[NFTWhitelist] ✅ Escrow address saved to listing:', finalEscrowAddress);
            }, 500); // Small delay for animation
        }
    }, [isConfirmed, receipt, selectedListing, clearPendingTx, pendingTx]);

    // Check if current user is platform admin
    const isPlatformAdmin = address?.toLowerCase() === PLATFORM.ADMIN_ADDRESS.toLowerCase();

    // Handle delete listing (admin only)
    const handleDeleteListing = async (listing: Listing) => {
        if (!isPlatformAdmin) return;

        // Check if this is a Supabase listing (id >= 100) vs mock listing
        const isFromSupabase = listing.id >= 100;
        if (!isFromSupabase) {
            alert('Cannot delete mock listings. They are hardcoded demo data.');
            return;
        }

        if (window.confirm('Delete this listing?\n\n⚠️ This will permanently remove it from the database (not blockchain).')) {
            let success = false;

            if (listing.escrowAddress) {
                // Has escrow deployed - delete by escrow address
                success = await supabaseNFT.deleteByEscrow(listing.escrowAddress);
            } else {
                // No escrow deployed - delete by contract + slot
                success = await supabaseNFT.deleteByContractAndSlot(
                    listing.nftContract,
                    listing.slotId
                );
            }

            if (success) {
                // Remove from local state
                if (listing.escrowAddress) {
                    setListings(listings.filter(l => l.escrowAddress !== listing.escrowAddress));
                } else {
                    setListings(listings.filter(l =>
                        !(l.nftContract === listing.nftContract && l.slotId === listing.slotId)
                    ));
                }
                console.log('[NFTWhitelist] Listing deleted from Supabase');
            } else {
                alert('Failed to delete. Check console for details.');
            }
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header - Centered like FreelanceHub */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full text-blue-400 text-sm mb-4">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    NFT Whitelist Escrow
                </div>
                <h1 className="text-4xl font-bold text-white mb-4">
                    NFT <span className="text-blue-400">Coordination</span>
                </h1>
                <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-6">
                    Deploy on-chain escrows for NFT whitelist coordination. Lock capital, mint, settle.
                </p>
                <Button
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => setIsCreateModalOpen(true)}
                    disabled={!isConnected}
                >
                    Create Listing
                </Button>
            </div>

            {/* Status Legend */}
            <StatusLegend type="nft" className="mb-6" />



            {/* Pending Transaction Banner */}
            {pendingTx && (
                <Card className="mb-6 bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-amber-500/30">
                    <div className="flex items-center gap-4">
                        <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                        <div className="flex-1">
                            <p className="text-amber-400 font-medium">
                                {isConfirmed ? '✅ Transaction Confirmed!' : 'Transaction Pending...'}
                            </p>
                            <a
                                href={`${LINKS.BLOCK_EXPLORER}/tx/${pendingTx}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-amber-300/80 hover:text-amber-200 flex items-center gap-1"
                            >
                                View on Etherscan <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                        <Button variant="ghost" size="sm" onClick={clearPendingTx}>
                            Dismiss
                        </Button>
                    </div>
                </Card>
            )}

            {/* Category Tabs */}
            <div className="flex border-b border-gray-800 mb-6">
                <button
                    onClick={() => setCategoryFilter('active')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${categoryFilter === 'active'
                        ? 'text-primary-400 border-primary-400'
                        : 'text-gray-400 border-transparent hover:text-gray-300'
                        }`}
                >
                    Active Projects
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${categoryFilter === 'active' ? 'bg-primary-500/20' : 'bg-gray-800'
                        }`}>
                        {listings.filter(l => l.status < CoordinationStatus.SETTLED).length}
                    </span>
                </button>
                <button
                    onClick={() => setCategoryFilter('completed')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${categoryFilter === 'completed'
                        ? 'text-green-400 border-green-400'
                        : 'text-gray-400 border-transparent hover:text-gray-300'
                        }`}
                >
                    Completed Projects
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${categoryFilter === 'completed' ? 'bg-green-500/20' : 'bg-gray-800'
                        }`}>
                        {listings.filter(l => l.status >= CoordinationStatus.SETTLED).length}
                    </span>
                </button>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <Input
                        placeholder="Search by collection name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        leftAddon="🔍"
                    />
                </div>
                <Button variant="secondary" leftIcon={<Filter className="w-4 h-4" />}>
                    Filters
                </Button>
            </div>



            {/* Listings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings.map((listing) => (
                    <Card key={listing.id} variant="elevated">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="font-semibold text-white">{listing.nftName}</h3>
                                <p className="text-sm text-gray-500">Slot #{listing.slotId}</p>
                            </div>
                            <StatusBadge status={listing.status} />
                        </div>

                        {/* Details */}
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Mint Price</span>
                                <span className="font-medium text-white">
                                    {listing.mintPrice} ETH
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Capital Holder Profit</span>
                                <span className="font-mono text-green-400">{listing.splitBPS / 100}%</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Deadline</span>
                                <span className="flex items-center gap-1 text-gray-300">
                                    <Clock className="w-3 h-3" />
                                    {formatDeadline(listing.deadline)}
                                </span>
                            </div>
                            {listing.escrowAddress && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Escrow</span>
                                    <a
                                        href={`${LINKS.BLOCK_EXPLORER}/address/${listing.escrowAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                    >
                                        {listing.escrowAddress.slice(0, 8)}...
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                            {/* View Process Page Link */}
                            {listing.escrowAddress && (
                                <Link
                                    to={`/nft/offer/${listing.escrowAddress}`}
                                    className="mt-3 flex items-center justify-center gap-2 py-2 px-4 bg-primary-500/10 border border-primary-500/30 rounded-lg text-primary-400 hover:bg-primary-500/20 transition-colors text-sm"
                                >
                                    <Eye className="w-4 h-4" />
                                    View Process →
                                </Link>
                            )}

                        </div>

                        {/* Action - Only Deploy Escrow for new listings, View Process handles everything else */}
                        {listing.status === CoordinationStatus.NONE && !listing.escrowAddress && (
                            <Button
                                className="w-full"
                                rightIcon={<ArrowRight className="w-4 h-4" />}
                                onClick={() => {
                                    setSelectedListing(listing);
                                    setIsDeployModalOpen(true);
                                }}
                                disabled={!isConnected}
                            >
                                Deploy Escrow
                            </Button>
                        )}
                        {listing.status === CoordinationStatus.SETTLED && (
                            <div className="py-2 px-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                                <span className="text-green-400 font-medium">✅ Settled</span>
                            </div>
                        )}
                        {/* OLD BUTTONS REMOVED - Now all handled in View Process page */}
                        {false && listing.status === CoordinationStatus.FUNDED && (
                            <div className="space-y-2">
                                <Button
                                    className="w-full"
                                    variant="primary"
                                    onClick={async () => {
                                        try {
                                            if (!listing.escrowAddress) {
                                                alert('No escrow deployed for this listing!');
                                                return;
                                            }

                                            // Encode the mint call for SmartMintWallet
                                            const { encodeFunctionData } = await import('viem');
                                            const mintData = encodeFunctionData({
                                                abi: TEST_NFT_ABI,
                                                functionName: 'publicMint',
                                                args: [],
                                            });

                                            console.log('[NFTWhitelist] Calling escrow.executeMint...');
                                            const mintHash = await writeContractAsync({
                                                address: listing.escrowAddress,
                                                abi: NFT_ESCROW_ABI,
                                                functionName: 'executeMint',
                                                args: [mintData],
                                            });
                                            console.log('[NFTWhitelist] executeMint TX:', mintHash);

                                            alert(`🎉 Mint TX Sent: ${mintHash.slice(0, 10)}...\n\nNow click "Verify Mint" to confirm NFT received.`);

                                            // Update status to show verify button
                                            setListings(prevListings => prevListings.map(l =>
                                                l.id === listing.id
                                                    ? { ...l, txHistory: { ...l.txHistory, mintTx: mintHash } }
                                                    : l
                                            ));
                                        } catch (err: any) {
                                            console.error('[NFTWhitelist] executeMint failed:', err);
                                            alert(`Mint failed: ${err.message}`);
                                        }
                                    }}
                                    disabled={!isConnected}
                                >
                                    🪄 Execute Mint (via Escrow)
                                </Button>

                                {/* Step 2: Verify mint - tells escrow to take custody of NFT */}
                                <Button
                                    className="w-full"
                                    variant="secondary"
                                    onClick={async () => {
                                        try {
                                            if (!listing.escrowAddress) {
                                                alert('No escrow!');
                                                return;
                                            }

                                            // For demo, we use tokenId 1 (first mint)
                                            // In production, would query the NFT contract for minted tokenId
                                            const tokenIdStr = prompt('Enter the minted Token ID (check Etherscan for the mint TX):');
                                            if (!tokenIdStr) return;
                                            const tokenId = BigInt(tokenIdStr);

                                            console.log('[NFTWhitelist] Calling verifyMint with tokenId:', tokenId);
                                            const hash = await writeContractAsync({
                                                address: listing.escrowAddress,
                                                abi: NFT_ESCROW_ABI,
                                                functionName: 'verifyMint',
                                                args: [tokenId],
                                            });

                                            // Update to VERIFIED - NOW contract is at MINTED
                                            setListings(prevListings => prevListings.map(l =>
                                                l.id === listing.id
                                                    ? { ...l, status: CoordinationStatus.VERIFIED }
                                                    : l
                                            ));

                                            alert(`✅ NFT Verified! TX: ${hash.slice(0, 10)}...\n\nEscrow now has custody of NFT.\nProceed with Approve Sale.`);
                                        } catch (err: any) {
                                            console.error('[NFTWhitelist] verifyMint failed:', err);
                                            alert(`Verify failed: ${err.message}\n\nMake sure the NFT was actually minted and is in the SmartMintWallet.`);
                                        }
                                    }}
                                    disabled={!isConnected}
                                >
                                    ✅ Verify Mint (Confirm NFT in Escrow)
                                </Button>
                                <p className="text-xs text-gray-500 text-center">After mint succeeds, verify to move NFT to escrow custody</p>
                            </div>
                        )}
                        {/* VERIFIED BUTTONS REMOVED - Now handled in View Process */}
                        {false && listing.status === CoordinationStatus.VERIFIED && (
                            <div className="space-y-2">
                                {/* Step 1: Approve Sale (both parties need to do this) */}
                                <Button
                                    className="w-full"
                                    variant="secondary"
                                    onClick={async () => {
                                        try {
                                            if (!listing.escrowAddress) {
                                                alert('No escrow address!');
                                                return;
                                            }

                                            const salePrice = parseFloat(listing.mintPrice) * 1.5; // 150%
                                            const salePriceWei = parseEther(salePrice.toFixed(6));

                                            // Use deployer as the designated buyer (consistent for both approvals)
                                            const buyerAddress = '0xbdF838FFB4D8B356B69DD4CB6cDb2167d085Fc9A' as `0x${string}`;

                                            console.log('[NFT] Calling approveSale with price:', salePrice, 'ETH, buyer:', buyerAddress);

                                            const hash = await writeContractAsync({
                                                address: listing.escrowAddress,
                                                abi: NFT_ESCROW_ABI,
                                                functionName: 'approveSale',
                                                args: [salePriceWei, buyerAddress],
                                            });

                                            alert(`✅ Sale Approved!\n\nTX: ${hash.slice(0, 10)}...\n\nBoth WL holder AND capital holder need to approve.\nOnce both approve, Buy button will work!`);
                                        } catch (err: any) {
                                            console.error('[NFT] approveSale failed:', err);
                                            if (err.message.includes('Not participant')) {
                                                alert('⚠️ Only WL Holder or Capital Holder can approve.\n\nSwitch to Alice or Bob wallet!');
                                            } else {
                                                alert(`Approve failed: ${err.message}`);
                                            }
                                        }
                                    }}
                                    disabled={!isConnected}
                                >
                                    ✅ Approve Sale ({(parseFloat(listing.mintPrice) * 1.5).toFixed(4)} ETH)
                                </Button>
                                <p className="text-xs text-gray-500 text-center">Both WL Holder & Capital Holder must approve</p>

                                {/* Step 2: Buy (anyone can call after both approve) */}
                                <Button
                                    className="w-full"
                                    variant="primary"
                                    rightIcon={<ArrowRight className="w-4 h-4" />}
                                    onClick={async () => {
                                        const buyPrice = parseFloat(listing.mintPrice) * 1.5;
                                        const platformFee = buyPrice * 0.05;
                                        const remaining = buyPrice - platformFee;
                                        const wlHolderShare = remaining * (listing.splitBPS / 10000);
                                        const capitalHolderShare = remaining * (1 - listing.splitBPS / 10000);

                                        try {
                                            if (!listing.escrowAddress) {
                                                alert('No escrow address!');
                                                return;
                                            }

                                            console.log('[NFT] Calling executeSale with', buyPrice, 'ETH');
                                            const buyHash = await writeContractAsync({
                                                address: listing.escrowAddress,
                                                abi: NFT_ESCROW_ABI,
                                                functionName: 'executeSale',
                                                value: parseEther(buyPrice.toFixed(6)),
                                            });
                                            console.log('[NFT] executeSale TX:', buyHash);

                                            // NOTE: Don't call distributeSale immediately - Buy TX needs to confirm first!
                                            // Save buyTx to history and DON'T change status - keep Distribute button visible
                                            setListings(prevListings => prevListings.map(l =>
                                                l.id === listing.id
                                                    ? { ...l, txHistory: { ...l.txHistory, buyTx: buyHash } }
                                                    : l
                                            ));

                                            alert(
                                                `🎉 Buy TX Sent: ${buyHash.slice(0, 10)}...\n\n` +
                                                `⏳ Wait for TX to confirm on Etherscan.\n\n` +
                                                `Then click "💸 Distribute Settlement" to split funds!`
                                            );
                                            return; // Exit early

                                            // Update to SETTLED
                                            setListings(prevListings => prevListings.map(l =>
                                                l.id === listing.id
                                                    ? { ...l, status: CoordinationStatus.SETTLED }
                                                    : l
                                            ));

                                            alert(
                                                `🎉 NFT Purchased & Settled!\n\n` +
                                                `💰 Settlement Distribution:\n` +
                                                `- Platform Fee: ${platformFee.toFixed(4)} ETH (5%)\n` +
                                                `- WL Holder: ${wlHolderShare.toFixed(4)} ETH (${listing.splitBPS / 100}%)\n` +
                                                `- Capital Provider: ${capitalHolderShare.toFixed(4)} ETH (${100 - listing.splitBPS / 100}%)\n\n` +
                                                `✅ Funds distributed!`
                                            );
                                        } catch (err: any) {
                                            console.error('[NFT] Buy/Settle failed:', err);
                                            if (err.message.includes('Wrong status')) {
                                                alert('⚠️ Both parties must approve first!\n\nClick "Approve Sale" with both Alice and Bob wallets.');
                                            } else {
                                                alert(`Transaction failed: ${err.message}`);
                                            }
                                        }
                                    }}
                                    disabled={!isConnected}
                                >
                                    💰 Buy NFT at 150% ({(parseFloat(listing.mintPrice) * 1.5).toFixed(4)} ETH)
                                </Button>

                                {/* Distribute button - call after Buy TX confirms */}
                                <Button
                                    className="w-full"
                                    variant="secondary"
                                    onClick={async () => {
                                        try {
                                            if (!listing.escrowAddress) {
                                                alert('No escrow!');
                                                return;
                                            }

                                            const buyPrice = parseFloat(listing.mintPrice) * 1.5;
                                            const platformFee = buyPrice * 0.05;
                                            const remaining = buyPrice - platformFee;
                                            const wlShare = remaining * (listing.splitBPS / 10000);
                                            const capitalShare = remaining - wlShare;

                                            console.log('[NFT] Calling distributeSale...');
                                            const hash = await writeContractAsync({
                                                address: listing.escrowAddress,
                                                abi: NFT_ESCROW_ABI,
                                                functionName: 'distributeSale',
                                            });

                                            // Save settleTx to history AND update status
                                            setListings(prev => prev.map(l =>
                                                l.id === listing.id
                                                    ? { ...l, status: CoordinationStatus.SETTLED, txHistory: { ...l.txHistory, settleTx: hash } }
                                                    : l
                                            ));

                                            alert(
                                                `🎉 Funds Distributed!\n\n` +
                                                `TX: ${hash.slice(0, 10)}...\n\n` +
                                                `💰 Settlement:\n` +
                                                `- Platform: ${platformFee.toFixed(4)} ETH\n` +
                                                `- WL Holder: ${wlShare.toFixed(4)} ETH\n` +
                                                `- Capital: ${capitalShare.toFixed(4)} ETH`
                                            );
                                        } catch (err: any) {
                                            console.error('[NFT] Distribute failed:', err);
                                            alert(`Distribute failed: ${err.message}\n\nMake sure Buy TX confirmed first!`);
                                        }
                                    }}
                                    disabled={!isConnected}
                                >
                                    💸 Distribute Settlement
                                </Button>
                                <p className="text-xs text-gray-500 text-center">Click after Buy TX confirms on Etherscan</p>
                            </div>
                        )}

                        {/* Admin Delete Button - shows for any Supabase listing */}
                        {isPlatformAdmin && listing.id >= 100 && (
                            <button
                                onClick={() => handleDeleteListing(listing)}
                                className="mt-2 w-full py-2 bg-red-500/10 text-red-400 text-xs rounded-lg hover:bg-red-500/20 transition-colors"
                            >
                                🗑️ Delete from Database (Admin)
                            </button>
                        )}
                    </Card>
                ))}
            </div>

            {/* Empty State */}
            {
                filteredListings.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-400 mb-4">No listings found</p>
                        <Button onClick={() => setIsCreateModalOpen(true)}>
                            Create First Listing
                        </Button>
                    </div>
                )
            }

            {/* Create Listing Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create Whitelist Listing"
                description="Configure an NFT whitelist slot for escrow coordination"
            >
                <div className="space-y-4">
                    <Input
                        label="NFT Contract Address"
                        placeholder="0x..."
                        value={newListing.nftContract}
                        onChange={(e) => setNewListing({ ...newListing, nftContract: e.target.value })}
                    />
                    <Input
                        label="Collection Name"
                        placeholder="e.g., Azuki"
                        value={newListing.nftName}
                        onChange={(e) => setNewListing({ ...newListing, nftName: e.target.value })}
                    />
                    <Input
                        label="Slot ID"
                        type="number"
                        placeholder="42"
                        value={newListing.slotId}
                        onChange={(e) => setNewListing({ ...newListing, slotId: e.target.value })}
                        hint="Unique identifier for your whitelist position. Use any number to track your spot."
                    />
                    <Input
                        label="Mint Price (ETH)"
                        type="number"
                        placeholder="0.002"
                        value={newListing.mintPrice}
                        onChange={(e) => setNewListing({ ...newListing, mintPrice: e.target.value })}
                        rightAddon="ETH"
                        hint="Must match NFT contract mint price (TestNFT = 0.002 ETH)"
                    />
                    <Input
                        label="Capital Holder Profit (%)"
                        type="number"
                        placeholder="70"
                        value={newListing.splitBPS}
                        onChange={(e) => setNewListing({ ...newListing, splitBPS: e.target.value })}
                        rightAddon="%"
                        hint="Capital holder gets this % of sale profit (WL holder gets the rest)"
                    />
                    <Input
                        label="Deadline (hours)"
                        type="number"
                        placeholder="24"
                        value={newListing.deadlineHours}
                        onChange={(e) => setNewListing({ ...newListing, deadlineHours: e.target.value })}
                    />
                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsCreateModalOpen(false)} className="flex-1">
                            Cancel
                        </Button>
                        <Button onClick={handleCreateListing} className="flex-1">
                            Create Listing
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Deploy Escrow Modal */}
            <Modal
                isOpen={isDeployModalOpen}
                onClose={() => setIsDeployModalOpen(false)}
                title="Deploy NFT Escrow"
                description={selectedListing ? `Deploy escrow for ${selectedListing.nftName} Slot #${selectedListing.slotId}` : ''}
            >
                {selectedListing && (
                    <div className="space-y-4">
                        <div className="p-4 bg-bg-dark rounded-lg space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Mint Price</span>
                                <span className="font-semibold text-white">
                                    {selectedListing.mintPrice} ETH
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Capital Holder Profit</span>
                                <span className="text-green-400">
                                    {selectedListing.splitBPS / 100}% of profit
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">WL Holder Profit</span>
                                <span className="text-gray-300">
                                    {(10000 - selectedListing.splitBPS) / 100}% of profit
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Platform Fee</span>
                                <span className="text-gray-300">
                                    {PLATFORM.FEE_BPS / 100}%
                                </span>
                            </div>
                        </div>

                        {/* Capital Holder Address Input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">
                                Capital Holder Address (Investor)
                            </label>
                            <input
                                type="text"
                                placeholder="0xD68a44f47f541b1fE5CfB27307deE131954E0a14"
                                value={capitalHolderAddress}
                                onChange={(e) => setCapitalHolderAddress(e.target.value)}
                                className="w-full p-3 bg-bg-dark border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none"
                            />
                            <p className="text-xs text-gray-500">
                                Enter Bob's address. Only this address can call "Lock Capital".
                            </p>
                            {/* Validation: Capital holder must be different from WL holder */}
                            {capitalHolderAddress && address && capitalHolderAddress.toLowerCase() === address.toLowerCase() && (
                                <p className="text-red-400 text-xs mt-1">⚠️ Capital holder must be different from WL holder (your connected wallet)</p>
                            )}
                        </div>

                        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <p className="text-sm text-amber-300">
                                ⚠️ This will deploy a real smart contract on Ethereum Sepolia.
                                You'll need ETH for gas.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button variant="secondary" onClick={() => setIsDeployModalOpen(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeployEscrow}
                                isLoading={deployLoading}
                                disabled={Boolean(capitalHolderAddress && address && capitalHolderAddress.toLowerCase() === address.toLowerCase())}
                                className="flex-1"
                            >
                                Deploy Escrow
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div >
    );
}
