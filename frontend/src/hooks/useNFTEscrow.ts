import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useState, useCallback } from "react";
import { NFT_ESCROW_ABI, NFT_ESCROW_STATUS } from "../lib/contracts";

// Types
export interface NFTEscrowDetails {
    wlHolder: `0x${string}`;
    capitalHolder: `0x${string}`;
    nftContract: `0x${string}`;
    nftTokenId: bigint;
    mintPrice: bigint;
    splitBPS: bigint;
    deadline: bigint;
    status: number;
}

/**
 * Hook for interacting with an NFT Escrow instance
 */
export function useNFTEscrow(escrowAddress: `0x${string}` | undefined) {
    const { address: userAddress } = useAccount();
    const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);

    // Write contract instance
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    // Wait for transaction
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: pendingTx ?? undefined,
    });

    // Read escrow details
    const { data: detailsRaw, refetch: refetchDetails } = useReadContract({
        address: escrowAddress,
        abi: NFT_ESCROW_ABI,
        functionName: "getDetails",
    });

    // Read approval status (for MINTED phase dual-approval tracking)
    const { data: wlApprovedRaw, refetch: refetchWlApproved } = useReadContract({
        address: escrowAddress,
        abi: NFT_ESCROW_ABI,
        functionName: "wlApproved",
    });

    const { data: capitalApprovedRaw, refetch: refetchCapitalApproved } = useReadContract({
        address: escrowAddress,
        abi: NFT_ESCROW_ABI,
        functionName: "capitalApproved",
    });

    const { data: approvedSalePriceRaw, refetch: refetchApprovedSalePrice } = useReadContract({
        address: escrowAddress,
        abi: NFT_ESCROW_ABI,
        functionName: "approvedSalePrice",
    });

    const { data: approvedMarketplaceRaw, refetch: refetchApprovedMarketplace } = useReadContract({
        address: escrowAddress,
        abi: NFT_ESCROW_ABI,
        functionName: "approvedMarketplace",
    });

    // Combined refetch function
    const refetchAll = useCallback(async () => {
        await Promise.all([
            refetchDetails(),
            refetchWlApproved(),
            refetchCapitalApproved(),
            refetchApprovedSalePrice(),
            refetchApprovedMarketplace(),
        ]);
    }, [refetchDetails, refetchWlApproved, refetchCapitalApproved, refetchApprovedSalePrice, refetchApprovedMarketplace]);

    // Parse details
    const details: NFTEscrowDetails | null = detailsRaw ? {
        wlHolder: detailsRaw[0],
        capitalHolder: detailsRaw[1],
        nftContract: detailsRaw[2],
        nftTokenId: detailsRaw[3],
        mintPrice: detailsRaw[4],
        splitBPS: detailsRaw[5],
        deadline: detailsRaw[6],
        status: detailsRaw[7],
    } : null;

    // Approval status
    const approvalStatus = {
        wlApproved: wlApprovedRaw as boolean ?? false,
        capitalApproved: capitalApprovedRaw as boolean ?? false,
        approvedSalePrice: approvedSalePriceRaw as bigint ?? 0n,
        approvedMarketplace: approvedMarketplaceRaw as `0x${string}` | undefined,
    };

    // Check if user is participant
    const isWLHolder = details?.wlHolder === userAddress;
    const isCapitalHolder = details?.capitalHolder === userAddress;
    const isParticipant = isWLHolder || isCapitalHolder;

    /**
     * Capital holder deposits ETH
     */
    const deposit = useCallback(async () => {
        if (!escrowAddress || !details) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "deposit",
            value: details.mintPrice,
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, details, writeContractAsync]);

    /**
     * Execute mint via Smart Mint Wallet
     */
    const executeMint = useCallback(async (mintData: `0x${string}`) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "executeMint",
            args: [mintData],
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Verify NFT was minted and received
     */
    const verifyMint = useCallback(async (tokenId: bigint) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "verifyMint",
            args: [tokenId],
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Approve sale terms
     */
    const approveSale = useCallback(async (price: string, marketplace: `0x${string}`) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "approveSale",
            args: [parseEther(price), marketplace],
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Execute sale (buyer calls this with ETH)
     */
    const executeSale = useCallback(async (price: bigint) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "executeSale",
            value: price,
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Distribute sale proceeds
     */
    const distributeSale = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "distributeSale",
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Timeout refund - capital holder gets NFT after deadline
     */
    const timeoutRefund = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "timeoutRefund",
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Refund capital if mint never happened
     */
    const refundCapital = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: NFT_ESCROW_ABI,
            functionName: "refundCapital",
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    return {
        // State
        isLoading: isWritePending || isConfirming,
        isConfirmed,
        pendingTx,

        // Data
        details,
        approvalStatus,
        statusLabel: details ? NFT_ESCROW_STATUS[details.status as keyof typeof NFT_ESCROW_STATUS] : null,
        isWLHolder,
        isCapitalHolder,
        isParticipant,
        isExpired: details ? Number(details.deadline) < Date.now() / 1000 : false,

        // Actions
        deposit,
        executeMint,
        verifyMint,
        approveSale,
        executeSale,
        distributeSale,
        timeoutRefund,
        refundCapital,
        refetchDetails,
        refetchAll,

        // Constants
        NFT_ESCROW_STATUS,
    };
}
