export { useSupreme } from './useSupreme';
export { useNFTEscrow } from './useNFTEscrow';
export { useOTCEscrow } from './useOTCEscrow';

export function useEscrow() {
    console.warn('useEscrow is deprecated. Use useSupreme, useNFTEscrow, or useOTCEscrow instead.');

    return {
        createCoordination: async () => {
            throw new Error('Use useSupreme.deployNFTEscrow or useSupreme.deployOTCEscrow instead');
        },
        lockCapital: async () => null,
        fetchCoordination: async () => null,
        verifyAccess: async () => true,
        settle: async () => true,
        refund: async () => true,
        isLoading: false,
        error: null,
        coordinations: [],
    };
}
