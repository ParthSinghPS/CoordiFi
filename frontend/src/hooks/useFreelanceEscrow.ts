import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useState, useCallback } from "react";
import { FREELANCE_ESCROW_ABI } from "../lib/contracts";

// Enums matching the contract
export const FREELANCE_PHASE = {
    0: "Created",
    1: "Funded",
    2: "InProgress",
    3: "Completed",
    4: "Disputed",
    5: "Refunded",
} as const;

export const MILESTONE_STATUS = {
    0: "Pending",
    1: "Submitted",
    2: "UnderRevision",
    3: "Approved",
    4: "Completed",
    5: "Disputed",
    6: "Cancelled",
} as const;

export const DISPUTE_TYPE = {
    0: "None",
    1: "QualityIssue",
    2: "MissedDeadline",
    3: "ScopeChange",
    4: "NonPayment",
    5: "Abandonment",
} as const;

// Types
export interface ProjectInfo {
    client: `0x${string}`;
    paymentToken: `0x${string}`;
    totalAmount: bigint;
    totalPaid: bigint;
    platformFeeCollected: bigint;
    currentPhase: number;
    fundedAt: bigint;
    milestoneCount: bigint;
    completedMilestones: bigint;
    allMilestonesCreated: boolean;
}

export interface Milestone {
    milestoneId: bigint;
    worker: `0x${string}`;
    amount: bigint;
    deadline: bigint;
    revisionLimit: bigint;
    revisionCount: bigint;
    status: number;
    description: string;
    createdAt: bigint;
    exists: boolean;
}

export interface AddMilestoneParams {
    worker: `0x${string}`;
    amount: bigint;
    deadline: number; // Unix timestamp
    revisionLimit: number;
    description: string;
}

/**
 * Hook for interacting with a FreelanceEscrow contract instance
 */
export function useFreelanceEscrow(escrowAddress: `0x${string}` | undefined) {
    const { address: userAddress } = useAccount();
    const publicClient = usePublicClient();
    const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);

    // Write contract instance
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    // Wait for transaction
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: pendingTx ?? undefined,
    });

    // Read project info
    const { data: projectInfoRaw, refetch: refetchProjectInfo, isLoading: isProjectInfoLoading, isError: isProjectInfoError } = useReadContract({
        address: escrowAddress,
        abi: FREELANCE_ESCROW_ABI,
        functionName: "getProjectInfo",
    });

    // Read all milestones
    const { data: milestonesRaw, refetch: refetchMilestones, isLoading: isMilestonesLoading } = useReadContract({
        address: escrowAddress,
        abi: FREELANCE_ESCROW_ABI,
        functionName: "getAllMilestones",
    });

    // Read project progress
    const { data: progressRaw, refetch: refetchProgress } = useReadContract({
        address: escrowAddress,
        abi: FREELANCE_ESCROW_ABI,
        functionName: "getProjectProgress",
    });

    // Parse project info - contract returns 10 fields in order:
    // client, paymentToken, totalAmount, totalPaid, platformFeeCollected, currentPhase, fundedAt, milestoneCount, completedMilestones, allMilestonesCreated
    const projectInfo: ProjectInfo | null = projectInfoRaw ? {
        client: projectInfoRaw[0],
        paymentToken: projectInfoRaw[1],
        totalAmount: projectInfoRaw[2],
        totalPaid: projectInfoRaw[3],
        platformFeeCollected: projectInfoRaw[4],
        currentPhase: projectInfoRaw[5],
        fundedAt: projectInfoRaw[6],
        milestoneCount: projectInfoRaw[7],
        completedMilestones: projectInfoRaw[8],
        allMilestonesCreated: projectInfoRaw[9],
    } : null;

    // Parse milestones
    const milestones: Milestone[] = milestonesRaw ? (milestonesRaw as any[]).map((m) => ({
        milestoneId: m.milestoneId,
        worker: m.worker,
        amount: m.amount,
        deadline: m.deadline,
        revisionLimit: m.revisionLimit,
        revisionCount: m.revisionCount,
        status: m.status,
        description: m.description,
        createdAt: m.createdAt,
        exists: m.exists,
    })) : [];

    // Parse progress
    const progress = progressRaw ? {
        totalMilestones: Number(progressRaw[0]),
        completedMilestones: Number(progressRaw[1]),
        totalPaid: progressRaw[2],
        remainingAmount: progressRaw[3],
    } : null;

    // Check role - use toLowerCase() for case-insensitive address comparison
    // Contract returns lowercase, wagmi may return mixed case (checksum)
    const isClient = projectInfo?.client?.toLowerCase() === userAddress?.toLowerCase();
    const isWorker = milestones.some((m) => m.worker?.toLowerCase() === userAddress?.toLowerCase());
    const isParticipant = isClient || isWorker;

    // Get user's milestones (for workers)
    const userMilestones = milestones.filter((m) => m.worker?.toLowerCase() === userAddress?.toLowerCase());

    // Refetch all data
    const refetchAll = useCallback(async () => {
        await Promise.all([
            refetchProjectInfo(),
            refetchMilestones(),
            refetchProgress(),
        ]);
    }, [refetchProjectInfo, refetchMilestones, refetchProgress]);

    /**
     * Add a new milestone (client only)
     */
    const addMilestone = useCallback(async (params: AddMilestoneParams) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "addMilestone",
            args: [
                params.worker,
                params.amount,
                BigInt(params.deadline),
                BigInt(params.revisionLimit),
                params.description,
            ],
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Add milestone TX:", hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Finalize all milestones (client only)
     */
    const finalizeMilestones = useCallback(async () => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "finalizeMilestones",
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Finalize milestones TX:", hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Deposit funds (client only, payable)
     */
    const depositFunds = useCallback(async (ethValue?: bigint) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "depositFunds",
            value: ethValue,
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Deposit funds TX:", hash);

        // Wait for transaction confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] Deposit confirmed:", receipt.status);

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient]);

    /**
     * Submit work (worker only)
     */
    const submitWork = useCallback(async (milestoneId: bigint, ipfsHash: string, description: string) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "submitWork",
            args: [milestoneId, ipfsHash, description],
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Submit work TX:", hash);

        // Wait for confirmation and refetch to update UI
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] Submit work confirmed:", receipt.status);
        await refetchAll();

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient, refetchAll]);

    /**
     * Request revision (client only)
     */
    const requestRevision = useCallback(async (milestoneId: bigint, feedback: string) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "requestRevision",
            args: [milestoneId, feedback],
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Request revision TX:", hash);

        // Wait for confirmation and refetch to update UI
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] Request revision confirmed:", receipt.status);
        await refetchAll();

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient, refetchAll]);

    /**
     * Approve milestone (client only)
     * Client pays 2.5% approval fee on top of milestone amount
     * @param milestoneId The milestone to approve
     * @param milestoneAmount The milestone amount (for calculating 2.5% fee)
     */
    const approveMilestone = useCallback(async (milestoneId: bigint, milestoneAmount: bigint) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        // Calculate 2.5% approval fee
        const approvalFeeBPS = BigInt(250); // 2.5%
        const BPS_DENOMINATOR = BigInt(10000);
        const approvalFee = (milestoneAmount * approvalFeeBPS) / BPS_DENOMINATOR;

        console.log("[useFreelanceEscrow] Milestone amount:", milestoneAmount.toString());
        console.log("[useFreelanceEscrow] Approval fee (2.5%):", approvalFee.toString(), "wei");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "approveMilestone",
            args: [milestoneId],
            value: approvalFee, // 2.5% approval fee sent to platform
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Approve milestone TX:", hash);

        // Wait for confirmation and refetch to update UI
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] Approve confirmed:", receipt.status);
        await refetchAll();

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient, refetchAll]);

    /**
     * Raise dispute
     */
    const raiseDispute = useCallback(async (milestoneId: bigint, disputeType: number, reason: string) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "raiseDispute",
            args: [milestoneId, disputeType, reason],
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Raise dispute TX:", hash);

        // Wait for confirmation and refetch to update UI
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] Raise dispute confirmed:", receipt.status);
        await refetchAll();

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient, refetchAll]);

    // Helper to get phase label
    const getPhaseLabel = (phase: number) => FREELANCE_PHASE[phase as keyof typeof FREELANCE_PHASE] || "Unknown";

    // Helper to get milestone status label
    const getMilestoneStatusLabel = (status: number) => MILESTONE_STATUS[status as keyof typeof MILESTONE_STATUS] || "Unknown";

    // Helper to get milestone dependencies
    const getMilestoneDependencies = useCallback(async (milestoneId: bigint): Promise<number[]> => {
        if (!escrowAddress || !publicClient) return [];
        try {
            const deps = await publicClient.readContract({
                address: escrowAddress,
                abi: FREELANCE_ESCROW_ABI,
                functionName: "getMilestoneDependencies",
                args: [milestoneId],
            }) as bigint[];
            return deps.map(d => Number(d));
        } catch (e) {
            console.error("Error fetching dependencies:", e);
            return [];
        }
    }, [escrowAddress, publicClient]);

    // Helper to check if dependencies are completed
    const checkDependenciesCompleted = useCallback(async (milestoneId: bigint): Promise<boolean> => {
        if (!escrowAddress || !publicClient) return true;
        try {
            const completed = await publicClient.readContract({
                address: escrowAddress,
                abi: FREELANCE_ESCROW_ABI,
                functionName: "areDependenciesCompleted",
                args: [milestoneId],
            }) as boolean;
            return completed;
        } catch (e) {
            console.error("Error checking dependencies:", e);
            return true; // Default to true to not block if error
        }
    }, [escrowAddress, publicClient]);

    /**
     * Resolve dispute (platform only)
     * @param milestoneId The milestone with active dispute
     * @param winner Address of winner (client or worker)
     */
    const resolveDispute = useCallback(async (milestoneId: bigint, winner: `0x${string}`) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "resolveDispute",
            args: [milestoneId, winner],
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Resolve dispute TX:", hash);

        // Wait for confirmation and refetch to update UI with new milestone status
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] Resolve dispute confirmed:", receipt.status);
        await refetchAll();

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient, refetchAll]);

    /**
     * Get dispute info for a milestone
     */
    const getDispute = useCallback(async (milestoneId: bigint) => {
        if (!escrowAddress || !publicClient) return null;
        try {
            const dispute = await publicClient.readContract({
                address: escrowAddress,
                abi: FREELANCE_ESCROW_ABI,
                functionName: "getDispute",
                args: [milestoneId],
            }) as {
                milestoneId: bigint;
                disputeType: number;
                initiator: `0x${string}`;
                reason: string;
                raisedAt: bigint;
                resolved: boolean;
                winner: `0x${string}`;
                exists: boolean;
                previousStatus: number;
            };
            console.log("[getDispute] Raw response:", dispute);
            return {
                milestoneId: dispute.milestoneId,
                disputeType: dispute.disputeType,
                initiator: dispute.initiator,
                reason: dispute.reason,
                raisedAt: dispute.raisedAt,
                resolved: dispute.resolved,
                winner: dispute.winner,
                exists: dispute.exists,
                previousStatus: dispute.previousStatus,
            };
        } catch (e) {
            console.error("Error fetching dispute:", e);
            return null;
        }
    }, [escrowAddress, publicClient]);

    /**
     * Cancel dispute and restore milestone to pre-dispute state (platform only)
     * @param milestoneId The milestone with active dispute
     */
    const cancelDispute = useCallback(async (milestoneId: bigint) => {
        if (!escrowAddress) throw new Error("No escrow address");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "cancelDispute",
            args: [milestoneId],
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] Cancel dispute TX:", hash);
        return { hash };
    }, [escrowAddress, writeContractAsync]);

    /**
     * Settle project using Yellow Network state (ONE transaction for all payments)
     * This is the FINAL on-chain transaction after all Yellow operations
     * @param approvedMilestoneIds Milestones approved via Yellow (workers get paid)
     * @param cancelledMilestoneIds Milestones cancelled/disputed (client gets refund)
     * @param yellowSessionId The Yellow session ID for audit trail
     */
    const settleWithYellowProof = useCallback(async (
        approvedMilestoneIds: bigint[],
        cancelledMilestoneIds: bigint[],
        yellowSessionId: string
    ) => {
        if (!escrowAddress) throw new Error("No escrow address");
        if (!publicClient) throw new Error("No public client");

        // Calculate total approval fees (2.5% per approved milestone)
        const approvalFeeBPS = BigInt(250); // 2.5%
        const BPS_DENOMINATOR = BigInt(10000);
        
        let totalApprovalFees = BigInt(0);
        for (const milestoneId of approvedMilestoneIds) {
            const milestone = milestones.find(m => m.milestoneId === milestoneId);
            if (milestone) {
                totalApprovalFees += (milestone.amount * approvalFeeBPS) / BPS_DENOMINATOR;
            }
        }

        console.log("[useFreelanceEscrow] 🟡 Yellow Settlement:");
        console.log("  → Approved milestones:", approvedMilestoneIds.map(id => id.toString()));
        console.log("  → Cancelled milestones:", cancelledMilestoneIds.map(id => id.toString()));
        console.log("  → Session ID:", yellowSessionId);
        console.log("  → Total approval fees:", totalApprovalFees.toString(), "wei");

        const hash = await writeContractAsync({
            address: escrowAddress,
            abi: FREELANCE_ESCROW_ABI,
            functionName: "settleWithYellowProof",
            args: [approvedMilestoneIds, cancelledMilestoneIds, yellowSessionId],
            value: totalApprovalFees, // Client pays 2.5% approval fee per approved milestone
        });

        setPendingTx(hash);
        console.log("[useFreelanceEscrow] 🟡 Yellow Settlement TX:", hash);

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        console.log("[useFreelanceEscrow] 🟡 Yellow Settlement confirmed:", receipt.status);
        await refetchAll();

        return { hash, receipt };
    }, [escrowAddress, writeContractAsync, publicClient, milestones, refetchAll]);

    return {
        // State
        isLoading: isWritePending || isConfirming || isProjectInfoLoading || isMilestonesLoading,
        isDataLoading: isProjectInfoLoading || isMilestonesLoading,
        isError: isProjectInfoError,
        isConfirmed,
        pendingTx,

        // Data
        projectInfo,
        milestones,
        progress,
        phaseLabel: projectInfo ? getPhaseLabel(projectInfo.currentPhase) : null,

        // Role flags
        isClient,
        isWorker,
        isParticipant,
        userMilestones,

        // Actions
        addMilestone,
        finalizeMilestones,
        depositFunds,
        submitWork,
        requestRevision,
        approveMilestone,
        raiseDispute,
        resolveDispute, // Platform only
        cancelDispute, // Platform only - restores milestone to pre-dispute state
        settleWithYellowProof, // Yellow Network batch settlement
        refetchAll,
        getDispute,

        // Helpers
        getPhaseLabel,
        getMilestoneStatusLabel,
        getMilestoneDependencies,
        checkDependenciesCompleted,

        // Constants
        FREELANCE_PHASE,
        MILESTONE_STATUS,
        DISPUTE_TYPE,
    };
}
