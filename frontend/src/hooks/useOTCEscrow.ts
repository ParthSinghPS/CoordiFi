import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt } from "wagmi";
import { useState, useCallback } from "react";
import { OTC_ESCROW_ABI, OTC_ESCROW_STATUS } from "../lib/contracts";

// Types
export interface OTCEscrowDetails {
    maker: `0x${string}`;
    taker: `0x${string}`;
    assetA: `0x${string}`;
    assetB: `0x${string}`;
    amountA: bigint;
    amountB: bigint;
    deadline: bigint;
    status: number;
}

/**
 * Hook for interacting with an OTC Escrow instance
 */
export function useOTCEscrow(escrowAddress: `0x${string}` | undefined) {
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
        abi: OTC_ESCROW_ABI,
        functionName: "getDetails",
    });

    // Read price validity
    const { data: isPriceValid } = useReadContract({
        address: escrowAddress,
        abi: OTC_ESCROW_ABI,
        functionName: "isPriceValid",
    });

    // Parse details
    const details: OTCEscrowDetails | null = detailsRaw ? {
        maker: detailsRaw[0],
        taker: detailsRaw[1],
        assetA: detailsRaw[2],
        assetB: detailsRaw[3],
        amountA: detailsRaw[4],
        amountB: detailsRaw[5],
        deadline: detailsRaw[6],
        status: detailsRaw[7],
    } : null;

    // Check if user is participant
    const isMaker = details?.maker === userAddress;
    // isTaker: Either already set as taker, OR (not maker AND taker not yet set AND status allows taking)
    const takerNotSet = details?.taker === '0x0000000000000000000000000000000000000000';
    const canBeTaker = takerNotSet && !isMaker && details?.status === 1; // status 1 = MAKER_LOCKED
    const isTaker = (details?.taker === userAddress) || canBeTaker;
    const isParticipant = isMaker || isTaker;

    /**
     * Set Uniswap V3 pool for price validation
     */
    const setUniswapPool = useCallback(async (poolAddress: `0x${string}`) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: OTC_ESCROW_ABI,
            functionName: "setUniswapPool",
            args: [poolAddress],
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Maker locks Asset A
     */
    const makerLock = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: OTC_ESCROW_ABI,
            functionName: "makerLock",
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Taker locks Asset B
     */
    const takerLock = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: OTC_ESCROW_ABI,
            functionName: "takerLock",
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Validate price and settle trade
     */
    const validateAndSettle = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: OTC_ESCROW_ABI,
            functionName: "validateAndSettle",
        });

        setPendingTx(hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Refund all parties
     */
    const refund = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: OTC_ESCROW_ABI,
            functionName: "refund",
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
        statusLabel: details ? OTC_ESCROW_STATUS[details.status as keyof typeof OTC_ESCROW_STATUS] : null,
        isPriceValid: isPriceValid ?? true,
        isMaker,
        isTaker,
        isParticipant,
        isExpired: details ? Number(details.deadline) < Date.now() / 1000 : false,

        // Actions
        setUniswapPool,
        makerLock,
        takerLock,
        validateAndSettle,
        refund,
        refetchDetails,

        // Constants
        OTC_ESCROW_STATUS,
    };
}
