/**
 * Legacy useEscrow hook - redirects to new factory pattern
 * @deprecated Use useSupreme, useNFTEscrow, or useOTCEscrow instead
 */
import { Coordination } from '@/lib/contracts';
export { useSupreme } from './useSupreme';
export { useNFTEscrow } from './useNFTEscrow';
export { useOTCEscrow } from './useOTCEscrow';

// Legacy exports for backwards compatibility
export function useEscrow() {
    console.warn('useEscrow is deprecated. Use useSupreme, useNFTEscrow, or useOTCEscrow instead.');

    return {
        // Factory functions (stubs)
        createCoordination: async () => {
            throw new Error('Use useSupreme.deployNFTEscrow or useSupreme.deployOTCEscrow instead');
        },

        lockCapital: async (_params: unknown) => {
            console.log('[Legacy] lockCapital called - use useNFTEscrow.deposit');
            return null;
        },

        fetchCoordination: async (id: bigint): Promise<Coordination | null> => {
            console.log('[Legacy] fetchCoordination called for id:', id.toString());
            // Return mock for demo
            return null;
        },

        verifyAccess: async (id: bigint, _proof: unknown[]) => {
            console.log('[Legacy] verifyAccess called for id:', id.toString());
            return true;
        },

        settle: async (id: bigint) => {
            console.log('[Legacy] settle called for id:', id.toString());
            return true;
        },

        refund: async (id: bigint) => {
            console.log('[Legacy] refund called for id:', id.toString());
            return true;
        },

        // Status
        isLoading: false,
        error: null,

        // Legacy compatibility
        coordinations: [],
    };
}
