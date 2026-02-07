/**
 * Supabase Client
 * 
 * Database client for storing offers, listings, projects, and tx history.
 * Replaces localStorage with persistent, shared database.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface OTCOfferDB {
    id?: string;
    escrow_address?: string;
    maker_address: string;
    taker_address?: string;
    sell_token: string;
    sell_amount: string;
    buy_token: string;
    buy_amount: string;
    tolerance_percent?: number;
    deadline?: string;
    status: string;
    deploy_tx?: string;
    maker_lock_tx?: string;
    taker_lock_tx?: string;
    settle_tx?: string;
    created_at?: string;
    updated_at?: string;
}

export interface NFTListingDB {
    id?: string;
    escrow_address?: string;
    nft_contract: string;
    collection_name?: string;
    slot_id?: string;
    wl_holder: string;
    investor?: string;
    mint_price: string;
    wl_holder_split_percent?: number;
    deadline?: string;
    status: string;
    token_id?: string;
    sale_price?: string;
    created_at?: string;
    updated_at?: string;
}

export interface FreelanceProjectDB {
    id?: string;
    escrow_address: string;
    title: string;
    description?: string;
    client_address: string;
    total_amount: string;
    status: string;
    created_at?: string;
    updated_at?: string;
}

export interface FreelanceMilestoneDB {
    id?: string;
    project_id: string;
    milestone_index: number;
    description?: string;
    worker_address: string;
    amount: string;
    deadline?: string;
    status: string;
    proof_url?: string;
    proof_description?: string;
    revisions_used?: number;
    max_revisions?: number;
    created_at?: string;
    updated_at?: string;
}

export interface TxHistoryDB {
    id?: string;
    escrow_address: string;
    escrow_type: 'nft' | 'otc' | 'freelance';
    tx_type: string;
    tx_hash: string;
    from_address?: string;
    // Note: metadata field removed - Supabase tx_history table doesn't have this column
    // For structured data, use milestone_communications table instead
    created_at?: string;
}

export interface DisputeDB {
    id?: string;
    escrow_address: string;
    milestone_index?: number;
    dispute_type?: string;
    reason?: string;
    raised_by: string;
    status: string;
    resolved_at?: string;
    created_at?: string;
}

// Message types for milestone communications
export type MilestoneCommType = 'submission' | 'revision_request' | 'resubmission' | 'approval' | 'dispute_raised' | 'dispute_resolved';

export interface MilestoneCommDB {
    id?: string;
    milestone_id?: string;  // FK to freelance_milestones (optional, can work with escrow+index)
    escrow_address: string;
    milestone_index: number;
    sender_address: string;
    message_type: MilestoneCommType;
    message?: string;       // feedback, description, reason
    proof_url?: string;     // for submissions
    tx_hash?: string;
    created_at?: string;
}

// ========================================
// OTC OFFERS
// ========================================

export const otcOffers = {
    // Get all offers
    async getAll(): Promise<OTCOfferDB[]> {
        const { data, error } = await supabase
            .from('otc_offers')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Supabase] Error fetching OTC offers:', error);
            return [];
        }
        return data || [];
    },

    // Get offer by escrow address
    async getByEscrow(escrowAddress: string): Promise<OTCOfferDB | null> {
        const { data, error } = await supabase
            .from('otc_offers')
            .select('*')
            .eq('escrow_address', escrowAddress)
            .single();

        if (error) {
            console.error('[Supabase] Error fetching OTC offer:', error);
            return null;
        }
        return data;
    },

    // Get offers by maker
    async getByMaker(makerAddress: string): Promise<OTCOfferDB[]> {
        const { data, error } = await supabase
            .from('otc_offers')
            .select('*')
            .ilike('maker_address', makerAddress)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Supabase] Error fetching maker offers:', error);
            return [];
        }
        return data || [];
    },

    // Create new offer
    async create(offer: OTCOfferDB): Promise<OTCOfferDB | null> {
        const { data, error } = await supabase
            .from('otc_offers')
            .insert([offer])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating OTC offer:', error);
            return null;
        }
        console.log('[Supabase] Created OTC offer:', data);
        return data;
    },

    // Create or update offer (upsert by maker + sell_amount to prevent duplicates)
    async createOrUpdate(offer: OTCOfferDB): Promise<OTCOfferDB | null> {
        // First check if offer already exists with same maker + sell_amount
        const { data: existing } = await supabase
            .from('otc_offers')
            .select('id')
            .eq('maker_address', offer.maker_address)
            .eq('sell_amount', offer.sell_amount)
            .is('escrow_address', null) // Only match undeployed offers
            .maybeSingle();

        if (existing) {
            // Already exists - update instead
            console.log('[Supabase] OTC offer already exists, updating');
            const { data, error } = await supabase
                .from('otc_offers')
                .update({ ...offer, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) {
                console.error('[Supabase] Error updating OTC offer:', error);
                return null;
            }
            return data;
        }

        // Doesn't exist - create new
        const { data, error } = await supabase
            .from('otc_offers')
            .insert([offer])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating OTC offer:', error);
            return null;
        }
        console.log('[Supabase] Created OTC offer:', data);
        return data;
    },

    // Update offer
    async update(id: string, updates: Partial<OTCOfferDB>): Promise<boolean> {
        const { error } = await supabase
            .from('otc_offers')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('[Supabase] Error updating OTC offer:', error);
            return false;
        }
        return true;
    },

    // Update by escrow address (more common)
    async updateByEscrow(escrowAddress: string, updates: Partial<OTCOfferDB>): Promise<boolean> {
        const { error } = await supabase
            .from('otc_offers')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('escrow_address', escrowAddress);

        if (error) {
            console.error('[Supabase] Error updating OTC offer:', error);
            return false;
        }
        return true;
    },

    // Update by maker + sell_amount (for setting escrow address after deploy)
    async updateByMakerAndAmount(
        makerAddress: string,
        sellAmount: string,
        updates: Partial<OTCOfferDB>
    ): Promise<boolean> {
        const { error } = await supabase
            .from('otc_offers')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('maker_address', makerAddress)
            .eq('sell_amount', sellAmount)
            .is('escrow_address', null); // Only update undeployed offers

        if (error) {
            console.error('[Supabase] Error updating OTC offer by maker:', error);
            return false;
        }
        console.log('[Supabase] Updated OTC offer:', makerAddress.slice(0, 10), sellAmount);
        return true;
    },

    // Delete by escrow address (admin only - also cleans tx_history)
    async deleteByEscrow(escrowAddress: string): Promise<boolean> {
        // First delete associated tx_history
        await supabase.from('tx_history').delete().eq('escrow_address', escrowAddress);

        // Then delete the offer
        const { error } = await supabase
            .from('otc_offers')
            .delete()
            .eq('escrow_address', escrowAddress);

        if (error) {
            console.error('[Supabase] Error deleting OTC offer:', error);
            return false;
        }
        console.log('[Supabase] Deleted OTC offer and tx_history:', escrowAddress);
        return true;
    },

    // Delete by maker_address + sell_amount (for offers without escrow deployed)
    async deleteByMakerAndAmount(makerAddress: string, sellAmount: string): Promise<boolean> {
        const { error } = await supabase
            .from('otc_offers')
            .delete()
            .eq('maker_address', makerAddress)
            .eq('sell_amount', sellAmount)
            .is('escrow_address', null);

        if (error) {
            console.error('[Supabase] Error deleting OTC offer by maker:', error);
            return false;
        }
        console.log('[Supabase] Deleted undeployed OTC offer:', makerAddress, sellAmount);
        return true;
    },
};

// ========================================
// NFT LISTINGS
// ========================================

export const nftListings = {
    // Get all listings
    async getAll(): Promise<NFTListingDB[]> {
        const { data, error } = await supabase
            .from('nft_listings')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Supabase] Error fetching NFT listings:', error);
            return [];
        }
        return data || [];
    },

    // Get listing by escrow address
    async getByEscrow(escrowAddress: string): Promise<NFTListingDB | null> {
        const { data, error } = await supabase
            .from('nft_listings')
            .select('*')
            .eq('escrow_address', escrowAddress)
            .single();

        if (error) {
            console.error('[Supabase] Error fetching NFT listing:', error);
            return null;
        }
        return data;
    },

    // Create new listing
    async create(listing: NFTListingDB): Promise<NFTListingDB | null> {
        const { data, error } = await supabase
            .from('nft_listings')
            .insert([listing])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating NFT listing:', error);
            return null;
        }
        console.log('[Supabase] Created NFT listing:', data);
        return data;
    },

    // Create or update listing (upsert by contract + slot to prevent duplicates)
    async createOrUpdate(listing: NFTListingDB): Promise<NFTListingDB | null> {
        // First check if listing already exists with same contract + slot
        const { data: existing } = await supabase
            .from('nft_listings')
            .select('id')
            .eq('nft_contract', listing.nft_contract)
            .eq('slot_id', listing.slot_id)
            .maybeSingle();

        if (existing) {
            // Already exists - update instead
            console.log('[Supabase] Listing already exists, updating:', listing.collection_name);
            const { data, error } = await supabase
                .from('nft_listings')
                .update({ ...listing, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) {
                console.error('[Supabase] Error updating NFT listing:', error);
                return null;
            }
            return data;
        }

        // Doesn't exist - create new
        const { data, error } = await supabase
            .from('nft_listings')
            .insert([listing])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating NFT listing:', error);
            return null;
        }
        console.log('[Supabase] Created NFT listing:', data);
        return data;
    },

    // Update listing
    async updateByEscrow(escrowAddress: string, updates: Partial<NFTListingDB>): Promise<boolean> {
        // First try to update by escrow address
        const { data, error } = await supabase
            .from('nft_listings')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('escrow_address', escrowAddress)
            .select();

        if (error) {
            console.error('[Supabase] Error updating NFT listing:', error);
            return false;
        }

        // Check if any rows were updated
        if (!data || data.length === 0) {
            console.log('[Supabase] No listing found with escrow_address, checking if we need to set it...');

            // Maybe the listing exists but doesn't have escrow_address set yet
            // Try to find a listing without escrow_address and set it
            const { data: unlinked, error: findError } = await supabase
                .from('nft_listings')
                .select('*')
                .is('escrow_address', null)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!findError && unlinked && unlinked.length > 0) {
                // Found an unlinked listing - link it to this escrow
                const { error: linkError } = await supabase
                    .from('nft_listings')
                    .update({
                        escrow_address: escrowAddress,
                        ...updates,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', unlinked[0].id);

                if (!linkError) {
                    console.log('[Supabase] ✅ Linked escrow to existing listing:', unlinked[0].collection_name);
                    return true;
                }
            }

            console.log('[Supabase] No matching listing found to update');
            return false;
        }

        console.log('[Supabase] Updated NFT listing by escrow:', escrowAddress.slice(0, 10));
        return true;
    },

    // Update listing by contract + slot (for setting escrow address after deploy)
    async updateByContractAndSlot(
        nftContract: string,
        slotId: number,
        updates: Partial<NFTListingDB>
    ): Promise<boolean> {
        const { error } = await supabase
            .from('nft_listings')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('nft_contract', nftContract)
            .eq('slot_id', slotId.toString());

        if (error) {
            console.error('[Supabase] Error updating NFT listing by contract:', error);
            return false;
        }
        console.log('[Supabase] Updated NFT listing:', nftContract, slotId);
        return true;
    },

    // Delete by escrow address (admin only - also cleans tx_history)
    async deleteByEscrow(escrowAddress: string): Promise<boolean> {
        // First delete associated tx_history
        await supabase.from('tx_history').delete().eq('escrow_address', escrowAddress);

        // Then delete the listing
        const { error } = await supabase
            .from('nft_listings')
            .delete()
            .eq('escrow_address', escrowAddress);

        if (error) {
            console.error('[Supabase] Error deleting NFT listing:', error);
            return false;
        }
        console.log('[Supabase] Deleted NFT listing and tx_history:', escrowAddress);
        return true;
    },

    // Delete by nft_contract + slot_id (for listings without escrow deployed)
    async deleteByContractAndSlot(nftContract: string, slotId: number): Promise<boolean> {
        const { error } = await supabase
            .from('nft_listings')
            .delete()
            .eq('nft_contract', nftContract)
            .eq('slot_id', slotId)
            .is('escrow_address', null);

        if (error) {
            console.error('[Supabase] Error deleting NFT listing by contract:', error);
            return false;
        }
        console.log('[Supabase] Deleted undeployed NFT listing:', nftContract, slotId);
        return true;
    },
};

// ========================================
// FREELANCE PROJECTS
// ========================================

export const freelanceProjects = {
    // Get all projects
    async getAll(): Promise<FreelanceProjectDB[]> {
        const { data, error } = await supabase
            .from('freelance_projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Supabase] Error fetching projects:', error);
            return [];
        }
        return data || [];
    },

    // Get projects by client or worker
    async getByAddress(address: string): Promise<FreelanceProjectDB[]> {
        // Normalize address to lowercase for comparison
        const normalizedAddress = address.toLowerCase();

        console.log('[Supabase] getByAddress called with:', normalizedAddress);

        // First try: Get projects where user is client
        const { data: clientProjects, error: clientError } = await supabase
            .from('freelance_projects')
            .select('*')
            .ilike('client_address', normalizedAddress);

        if (clientError) {
            console.error('[Supabase] Error fetching client projects:', clientError);
        }
        console.log('[Supabase] Client projects found:', clientProjects?.length || 0);

        // Second try: Get projects where user is worker on any milestone
        const { data: workerMilestones, error: workerError } = await supabase
            .from('freelance_milestones')
            .select('project_id')
            .ilike('worker_address', normalizedAddress);

        if (workerError) {
            console.error('[Supabase] Error fetching worker milestones:', workerError);
        }
        console.log('[Supabase] Worker milestones found:', workerMilestones?.length || 0, 'project IDs:', workerMilestones?.map(m => m.project_id));

        // If user is a worker, get those projects too
        let workerProjects: FreelanceProjectDB[] = [];
        if (workerMilestones && workerMilestones.length > 0) {
            const projectIds = [...new Set(workerMilestones.map(m => m.project_id))];
            console.log('[Supabase] Looking up projects by IDs:', projectIds);
            const { data: projects, error: projectError } = await supabase
                .from('freelance_projects')
                .select('*')
                .in('id', projectIds);
            if (projectError) {
                console.error('[Supabase] Error fetching worker projects:', projectError);
            }
            workerProjects = projects || [];
            console.log('[Supabase] Worker projects found:', workerProjects.length);
        }

        // Merge and deduplicate
        const allProjects = [...(clientProjects || []), ...workerProjects];
        const uniqueProjects = allProjects.filter((project, index, self) =>
            index === self.findIndex(p => p.escrow_address === project.escrow_address)
        );

        console.log('[Supabase] Total unique projects:', uniqueProjects.length, 'escrow addresses:', uniqueProjects.map(p => p.escrow_address));
        return uniqueProjects;
    },

    // Get project by escrow
    async getByEscrow(escrowAddress: string): Promise<FreelanceProjectDB | null> {
        const normalizedAddress = escrowAddress.toLowerCase();
        console.log('[Supabase] getByEscrow:', normalizedAddress);

        const { data, error } = await supabase
            .from('freelance_projects')
            .select('*')
            .ilike('escrow_address', normalizedAddress)
            .single();

        if (error) {
            console.error('[Supabase] getByEscrow error:', error);
            return null;
        }
        return data;
    },

    // Create project
    async create(project: FreelanceProjectDB): Promise<FreelanceProjectDB | null> {
        // Normalize addresses to lowercase for consistent querying
        const normalizedProject = {
            ...project,
            escrow_address: project.escrow_address?.toLowerCase(),
            client_address: project.client_address?.toLowerCase(),
        };

        const { data, error } = await supabase
            .from('freelance_projects')
            .insert([normalizedProject])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating project:', error);
            return null;
        }
        console.log('[Supabase] ✅ Created project:', data?.escrow_address);
        return data;
    },

    // Update project
    async updateByEscrow(escrowAddress: string, updates: Partial<FreelanceProjectDB>): Promise<boolean> {
        const normalizedAddress = escrowAddress.toLowerCase();
        const { error } = await supabase
            .from('freelance_projects')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .ilike('escrow_address', normalizedAddress);

        if (error) {
            console.error('[Supabase] Error updating project:', error);
            return false;
        }
        return true;
    },

    // Delete by escrow address (admin only - cleans milestones, disputes, tx_history, and Pinata files)
    async deleteByEscrow(escrowAddress: string): Promise<boolean> {
        try {
            // Get project ID first
            const project = await this.getByEscrow(escrowAddress);

            // If project exists, get milestones to unpin Pinata files
            if (project?.id) {
                // Dynamically import unpinFromIPFS to avoid circular dependency
                const { unpinFromIPFS } = await import('./pinata');

                // Get milestones with proof URLs
                const { data: milestones } = await supabase
                    .from('freelance_milestones')
                    .select('proof_url')
                    .eq('project_id', project.id);

                // Unpin each proof file from Pinata
                if (milestones) {
                    for (const milestone of milestones) {
                        if (milestone.proof_url) {
                            // Extract CID from URL (format: https://gateway.pinata.cloud/ipfs/CID)
                            const cid = milestone.proof_url.split('/').pop();
                            if (cid) {
                                await unpinFromIPFS(cid);
                            }
                        }
                    }
                }

                // Delete milestone communications (by escrow address)
                await supabase.from('milestone_communications').delete().eq('escrow_address', escrowAddress.toLowerCase());
                console.log('[Supabase] Deleted milestone_communications for:', escrowAddress);

                // Delete milestones
                await supabase.from('freelance_milestones').delete().eq('project_id', project.id);
            }

            // Delete associated tx_history
            await supabase.from('tx_history').delete().eq('escrow_address', escrowAddress);

            // Delete associated disputes
            await supabase.from('disputes').delete().eq('escrow_address', escrowAddress);

            // Then delete the project
            const { error } = await supabase
                .from('freelance_projects')
                .delete()
                .eq('escrow_address', escrowAddress);

            if (error) {
                console.error('[Supabase] Error deleting freelance project:', error);
                return false;
            }
            console.log('[Supabase] Deleted freelance project, all associated data, and Pinata files:', escrowAddress);
            return true;
        } catch (err) {
            console.error('[Supabase] Error in deleteByEscrow:', err);
            return false;
        }
    },
};

// ========================================
// FREELANCE MILESTONES
// ========================================

export const freelanceMilestones = {
    // Get milestones for project by project ID
    async getByProjectId(projectId: string): Promise<FreelanceMilestoneDB[]> {
        const { data, error } = await supabase
            .from('freelance_milestones')
            .select('*')
            .eq('project_id', projectId)
            .order('milestone_index', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching milestones:', error);
            return [];
        }
        return data || [];
    },

    // Get milestones for project by escrow address
    async getByProject(escrowAddress: string): Promise<FreelanceMilestoneDB[]> {
        const normalizedAddress = escrowAddress.toLowerCase();

        // First find the project by escrow address
        const { data: project } = await supabase
            .from('freelance_projects')
            .select('id')
            .ilike('escrow_address', normalizedAddress)
            .single();

        if (!project) {
            console.log('[Supabase] Project not found for escrow:', normalizedAddress);
            return [];
        }

        // Then get all milestones
        const { data, error } = await supabase
            .from('freelance_milestones')
            .select('*')
            .eq('project_id', project.id)
            .order('milestone_index', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching milestones:', error);
            return [];
        }
        return data || [];
    },

    // Get single milestone by project (escrow address) and milestone ID
    // NOTE: milestoneId is 1-based (Milestone 1, 2, 3...)
    // Database also stores milestone_index as 1-based (1, 2, 3...)
    async getByProjectAndIndex(escrowAddress: string, milestoneId: number): Promise<FreelanceMilestoneDB | null> {
        const normalizedAddress = escrowAddress.toLowerCase();
        // DB stores 1-based index, same as milestoneId
        const milestoneIndex = milestoneId;

        // First find the project by escrow address
        const { data: project } = await supabase
            .from('freelance_projects')
            .select('id')
            .ilike('escrow_address', normalizedAddress)
            .single();

        if (!project) {
            console.log('[Supabase] Project not found for escrow:', normalizedAddress);
            return null;
        }

        console.log(`[Supabase] Looking for milestone: id=${milestoneId} -> index=${milestoneIndex}`);

        // Query with the 0-based index
        const { data, error } = await supabase
            .from('freelance_milestones')
            .select('*')
            .eq('project_id', project.id)
            .eq('milestone_index', milestoneIndex)
            .single();

        if (!error && data) {
            console.log(`[Supabase] Found milestone ${milestoneId} (index ${milestoneIndex}):`, data.status);
            return data;
        }

        console.error('[Supabase] Error fetching milestone:', error);
        return null;
    },

    // Create milestones (bulk)
    async createBulk(milestones: FreelanceMilestoneDB[]): Promise<boolean> {
        // Normalize worker addresses to lowercase
        const normalizedMilestones = milestones.map(m => ({
            ...m,
            worker_address: m.worker_address?.toLowerCase(),
        }));

        const { error } = await supabase
            .from('freelance_milestones')
            .insert(normalizedMilestones);

        if (error) {
            console.error('[Supabase] Error creating milestones:', error);
            return false;
        }
        console.log('[Supabase] ✅ Created', normalizedMilestones.length, 'milestones');
        return true;
    },

    // Update milestone
    async update(id: string, updates: Partial<FreelanceMilestoneDB>): Promise<boolean> {
        const { error } = await supabase
            .from('freelance_milestones')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('[Supabase] Error updating milestone:', error);
            return false;
        }
        return true;
    },

    // Update milestone by escrow address and milestone ID (for Yellow integration)
    // NOTE: milestoneId is 1-based (Milestone 1, 2, 3...)
    // Database also stores milestone_index as 1-based (1, 2, 3...)
    async updateByEscrowAndIndex(
        escrowAddress: string,
        milestoneId: number,
        updates: Partial<FreelanceMilestoneDB>
    ): Promise<boolean> {
        const normalizedAddress = escrowAddress.toLowerCase();
        // DB stores 1-based index, same as milestoneId
        const milestoneIndex = milestoneId;

        // First find the project by escrow address
        const { data: project } = await supabase
            .from('freelance_projects')
            .select('id')
            .ilike('escrow_address', normalizedAddress)
            .single();

        if (!project) {
            console.log('[Supabase] Project not found for escrow:', normalizedAddress);
            return false;
        }

        console.log(`[Supabase] Updating milestone: id=${milestoneId} -> index=${milestoneIndex} for project ${project.id}`);

        // Update and select to verify the update worked
        const { data, error } = await supabase
            .from('freelance_milestones')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('project_id', project.id)
            .eq('milestone_index', milestoneIndex)
            .select();

        if (error) {
            console.error('[Supabase] Error updating milestone:', error);
            return false;
        }

        if (!data || data.length === 0) {
            console.error(`[Supabase] No milestone found with index ${milestoneIndex} for project ${project.id}`);
            return false;
        }

        console.log(`[Supabase] ✅ Updated milestone ${milestoneId} (index ${milestoneIndex}):`, updates);
        return true;
    },
};

// ========================================
// TX HISTORY
// ========================================

export const txHistory = {
    // Get tx history for escrow
    async getByEscrow(escrowAddress: string): Promise<TxHistoryDB[]> {
        const normalizedAddress = escrowAddress.toLowerCase();
        const { data, error } = await supabase
            .from('tx_history')
            .select('*')
            .eq('escrow_address', normalizedAddress)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching tx history:', error);
            return [];
        }
        return data || [];
    },

    // Add tx to history
    async add(tx: TxHistoryDB): Promise<boolean> {
        // Normalize escrow_address to lowercase for consistent querying
        const normalizedTx = {
            ...tx,
            escrow_address: tx.escrow_address.toLowerCase(),
        };
        const { error } = await supabase
            .from('tx_history')
            .insert([normalizedTx]);

        if (error) {
            console.error('[Supabase] Error adding tx:', error);
            return false;
        }
        return true;
    },

    // Delete all tx history for escrow
    async deleteByEscrow(escrowAddress: string): Promise<boolean> {
        const normalizedAddress = escrowAddress.toLowerCase();
        const { error } = await supabase
            .from('tx_history')
            .delete()
            .eq('escrow_address', normalizedAddress);

        if (error) {
            console.error('[Supabase] Error deleting tx history:', error);
            return false;
        }
        return true;
    },
};

// ========================================
// DISPUTES
// ========================================

export const disputes = {
    // Get all disputes
    async getAll(): Promise<DisputeDB[]> {
        const { data, error } = await supabase
            .from('disputes')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[Supabase] Error fetching disputes:', error);
            return [];
        }
        return data || [];
    },

    // Get pending disputes
    async getPending(): Promise<DisputeDB[]> {
        const { data, error } = await supabase
            .from('disputes')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) return [];
        return data || [];
    },

    // Create dispute
    async create(dispute: DisputeDB): Promise<DisputeDB | null> {
        const { data, error } = await supabase
            .from('disputes')
            .insert([dispute])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating dispute:', error);
            return null;
        }
        return data;
    },

    // Resolve dispute
    async resolve(id: string, resolution: 'resolved_worker' | 'resolved_client' | 'cancelled'): Promise<boolean> {
        const { error } = await supabase
            .from('disputes')
            .update({
                status: resolution,
                resolved_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            console.error('[Supabase] Error resolving dispute:', error);
            return false;
        }
        return true;
    },
};

// ========================================
// MILESTONE COMMUNICATIONS
// ========================================

export const milestoneComms = {
    /**
     * Get all communications for a milestone (by escrow + index)
     * Returns chronologically ordered messages
     */
    async getByMilestone(escrowAddress: string, milestoneIndex: number): Promise<MilestoneCommDB[]> {
        const { data, error } = await supabase
            .from('milestone_communications')
            .select('*')
            .eq('escrow_address', escrowAddress.toLowerCase())
            .eq('milestone_index', milestoneIndex)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching milestone comms:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get all communications for an entire project/escrow
     */
    async getByEscrow(escrowAddress: string): Promise<MilestoneCommDB[]> {
        const { data, error } = await supabase
            .from('milestone_communications')
            .select('*')
            .eq('escrow_address', escrowAddress.toLowerCase())
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching project comms:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get the latest communication of a specific type for a milestone
     * Useful for: "get latest revision feedback for this milestone"
     */
    async getLatestByType(
        escrowAddress: string,
        milestoneIndex: number,
        messageType: MilestoneCommType
    ): Promise<MilestoneCommDB | null> {
        const { data, error } = await supabase
            .from('milestone_communications')
            .select('*')
            .eq('escrow_address', escrowAddress.toLowerCase())
            .eq('milestone_index', milestoneIndex)
            .eq('message_type', messageType)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            // Not found is not an error
            if (error.code === 'PGRST116') return null;
            console.error('[Supabase] Error fetching latest comm:', error);
            return null;
        }
        return data;
    },

    /**
     * Create a new communication entry
     */
    async create(comm: MilestoneCommDB): Promise<MilestoneCommDB | null> {
        // Normalize address to lowercase
        const normalizedComm = {
            ...comm,
            escrow_address: comm.escrow_address.toLowerCase(),
            sender_address: comm.sender_address.toLowerCase(),
        };

        const { data, error } = await supabase
            .from('milestone_communications')
            .insert([normalizedComm])
            .select()
            .single();

        if (error) {
            console.error('[Supabase] Error creating milestone comm:', error);
            return null;
        }
        console.log('[Supabase] ✅ Created milestone communication:', data.message_type);
        return data;
    },

    /**
     * Get submission history for a milestone (all submissions and resubmissions)
     */
    async getSubmissionHistory(escrowAddress: string, milestoneIndex: number): Promise<MilestoneCommDB[]> {
        const { data, error } = await supabase
            .from('milestone_communications')
            .select('*')
            .eq('escrow_address', escrowAddress.toLowerCase())
            .eq('milestone_index', milestoneIndex)
            .in('message_type', ['submission', 'resubmission'])
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching submission history:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Get revision request history for a milestone
     */
    async getRevisionHistory(escrowAddress: string, milestoneIndex: number): Promise<MilestoneCommDB[]> {
        const { data, error } = await supabase
            .from('milestone_communications')
            .select('*')
            .eq('escrow_address', escrowAddress.toLowerCase())
            .eq('milestone_index', milestoneIndex)
            .eq('message_type', 'revision_request')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[Supabase] Error fetching revision history:', error);
            return [];
        }
        return data || [];
    },
};

// ========================================
// HEALTH CHECK
// ========================================

export async function testConnection(): Promise<boolean> {
    try {
        const { error } = await supabase.from('otc_offers').select('id').limit(1);
        if (error) {
            console.error('[Supabase] Connection test failed:', error);
            return false;
        }
        console.log('[Supabase] ✅ Connected successfully');
        return true;
    } catch (err) {
        console.error('[Supabase] Connection error:', err);
        return false;
    }
}
