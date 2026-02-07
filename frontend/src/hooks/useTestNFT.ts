import { useCallback, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { CONTRACTS, TEST_NFT_ABI } from '@/lib/contracts';

/**
 * Hook for interacting with the TestNFTCollection contract
 * Allows minting real ERC721 tokens on Sepolia
 */
export function useTestNFT() {
    const { address } = useAccount();
    const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);

    // Write contract
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    // Wait for transaction
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: pendingTx ?? undefined,
    });

    // Read mint price (0.01 ETH)
    const { data: mintPrice } = useReadContract({
        address: CONTRACTS.TEST_NFT_CONTRACT as `0x${string}`,
        abi: TEST_NFT_ABI,
        functionName: 'MINT_PRICE',
    });

    // Read next token ID
    const { data: nextTokenId } = useReadContract({
        address: CONTRACTS.TEST_NFT_CONTRACT as `0x${string}`,
        abi: TEST_NFT_ABI,
        functionName: 'nextTokenId',
    });

    // Read user's NFT balance
    const { data: userBalance, refetch: refetchBalance } = useReadContract({
        address: CONTRACTS.TEST_NFT_CONTRACT as `0x${string}`,
        abi: TEST_NFT_ABI,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
    });

    // Clear pending TX
    const clearPendingTx = useCallback(() => {
        setPendingTx(null);
    }, []);

    /**
     * Mint an NFT using publicMint (0.01 ETH)
     */
    const publicMint = useCallback(async () => {
        try {
            console.log('[useTestNFT] Minting NFT...');

            const hash = await writeContractAsync({
                address: CONTRACTS.TEST_NFT_CONTRACT as `0x${string}`,
                abi: TEST_NFT_ABI,
                functionName: 'publicMint',
                value: parseEther('0.01'), // MINT_PRICE
            });

            setPendingTx(hash);
            console.log('[useTestNFT] Mint TX:', hash);

            // The token ID will be nextTokenId - 1 after confirmation
            return {
                hash,
                expectedTokenId: nextTokenId ? Number(nextTokenId) : 1
            };
        } catch (error) {
            console.error('[useTestNFT] Mint failed:', error);
            throw error;
        }
    }, [writeContractAsync, nextTokenId]);

    /**
     * Get token ID owned by user at index
     */
    const useTokenOfOwner = (index: number) => {
        return useReadContract({
            address: CONTRACTS.TEST_NFT_CONTRACT as `0x${string}`,
            abi: TEST_NFT_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: address ? [address, BigInt(index)] : undefined,
        });
    };

    return {
        // State
        isLoading: isWritePending || isConfirming,
        isConfirmed,
        pendingTx,
        clearPendingTx,

        // Data
        mintPrice: mintPrice ? mintPrice : parseEther('0.01'),
        nextTokenId: nextTokenId ? Number(nextTokenId) : 1,
        userBalance: userBalance ? Number(userBalance) : 0,

        // Actions
        publicMint,
        refetchBalance,
        useTokenOfOwner,

        // Contract address for reference
        contractAddress: CONTRACTS.TEST_NFT_CONTRACT,
    };
}
