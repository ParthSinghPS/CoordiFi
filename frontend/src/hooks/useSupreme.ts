import { useWriteContract, useReadContract, useAccount, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { parseEther } from "viem";
import { useState, useCallback } from "react";
import { CONTRACTS, SUPREME_FACTORY_ABI, INSTANCE_TYPE } from "../lib/contracts";

// Types
export interface DeployNFTEscrowParams {
    wlHolder: `0x${string}`;
    capitalHolder: `0x${string}`;
    nftContract: `0x${string}`;
    mintPrice: string; // ETH amount as string
    splitBPS: number; // e.g., 7000 = 70%
    deadline: number; // Unix timestamp
}

export interface DeployOTCEscrowParams {
    maker: `0x${string}`;
    assetA: `0x${string}`;
    assetB: `0x${string}`;
    amountA: bigint;
    amountB: bigint;
    toleranceBPS: number; // e.g., 500 = 5%
    deadline: number; // Unix timestamp
}

export interface MilestoneInput {
    worker: `0x${string}`;
    amount: bigint;
    deadline: bigint; // Unix timestamp
    revisionLimit: number;
    description: string;
    dependencies: number[]; // Array of milestone indices (0-based) that must complete first
}

export interface DeployFreelanceEscrowParams {
    client: `0x${string}`;
    paymentToken: `0x${string}`; // Use 0x0 for ETH
    totalAmount: bigint;
    milestones: MilestoneInput[];
}

export interface EscrowInstance {
    escrowAddress: `0x${string}`;
    creator: `0x${string}`;
    instanceType: number;
    createdAt: bigint;
    status: number;
}

/**
 * Hook for interacting with the Supreme Factory contract
 */
export function useSupreme() {
    const { address: userAddress } = useAccount();
    const publicClient = usePublicClient();
    const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);

    // Write contract instance
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    // Wait for transaction
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
        hash: pendingTx ?? undefined,
    });

    // Clear pending TX when confirmed
    const clearPendingTx = useCallback(() => {
        setPendingTx(null);
    }, []);


    // Helper: Extract escrow address from transaction logs
    const extractEscrowFromLogs = (logs: any[]): `0x${string}` | null => {
        // Event structures all have: event XXXEscrowDeployed(uint256 indexed instanceId, address indexed escrow, ...)
        // topic[0] = event signature, topic[1] = instanceId, topic[2] = escrow address
        const factoryAddress = CONTRACTS.SUPREME_FACTORY.toLowerCase();

        console.log('[useSupreme] Looking for logs from factory:', factoryAddress);
        console.log('[useSupreme] Total logs:', logs.length);

        for (const log of logs) {
            const logAddress = log.address?.toLowerCase();
            const topicsCount = log.topics?.length || 0;

            console.log('[useSupreme] Log from:', logAddress, 'topics:', topicsCount, 'isFactory:', logAddress === factoryAddress);

            // Check logs from the factory - FreelanceEscrowDeployed has 3 indexed params (instanceId, escrow, client)
            // So we need at least 3 topics (signature + 2 indexed values = 3, or signature + 3 indexed = 4)
            if (logAddress === factoryAddress && log.topics && topicsCount >= 3) {
                // topic[2] is the escrow address (second indexed parameter)
                const escrowTopic = log.topics[2];
                if (escrowTopic) {
                    // Extract the address from the padded bytes32 (last 40 hex chars = 20 bytes)
                    const escrowAddress = `0x${escrowTopic.slice(-40)}` as `0x${string}`;
                    console.log('[useSupreme] ✅ Extracted escrow address:', escrowAddress);
                    return escrowAddress;
                }
            }
        }

        // Fallback: Try to find any log with 3+ topics that looks like a deploy event
        console.log('[useSupreme] Trying fallback extraction...');
        for (const log of logs) {
            if (log.topics && log.topics.length >= 3) {
                // Check if topic[2] looks like an address (not zero)
                const potentialAddress = log.topics[2];
                if (potentialAddress && !potentialAddress.endsWith('0'.repeat(40))) {
                    const escrowAddress = `0x${potentialAddress.slice(-40)}` as `0x${string}`;
                    console.log('[useSupreme] ⚠️ Fallback extracted escrow address:', escrowAddress, 'from:', log.address);
                    return escrowAddress;
                }
            }
        }

        console.warn('[useSupreme] ❌ Could not find escrow address in any logs');
        return null;
    };

    const { data: platformFeeBPS } = useReadContract({
        address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
        abi: SUPREME_FACTORY_ABI,
        functionName: "platformFeeBPS",
    });

    // Read total instances
    const { data: totalInstances } = useReadContract({
        address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
        abi: SUPREME_FACTORY_ABI,
        functionName: "getTotalInstances",
    });

    // Read user instances
    const { data: userInstanceIds, refetch: refetchUserInstances } = useReadContract({
        address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
        abi: SUPREME_FACTORY_ABI,
        functionName: "getInstancesByUser",
        args: userAddress ? [userAddress] : undefined,
    });

    /**
     * Deploy a new NFT Escrow instance
     * Waits for confirmation and returns the escrow address
     */
    const deployNFTEscrow = useCallback(async (params: DeployNFTEscrowParams) => {
        if (!publicClient) throw new Error("No public client");

        try {
            const hash = await writeContractAsync({
                address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
                abi: SUPREME_FACTORY_ABI,
                functionName: "deployNFTEscrow",
                args: [
                    params.wlHolder,
                    params.capitalHolder,
                    params.nftContract,
                    parseEther(params.mintPrice),
                    BigInt(params.splitBPS),
                    BigInt(params.deadline),
                ],
            });

            setPendingTx(hash);
            console.log('[useSupreme] NFT Escrow deploy TX submitted:', hash);

            // Wait for transaction receipt
            console.log('[useSupreme] Waiting for confirmation...');
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log('[useSupreme] TX confirmed, extracting escrow address...');

            // Extract escrow address from logs
            const escrowAddress = extractEscrowFromLogs(receipt.logs);

            return { hash, escrowAddress };
        } catch (error) {
            console.error("Failed to deploy NFT Escrow:", error);
            throw error;
        }
    }, [writeContractAsync, publicClient]);

    /**
     * Deploy a new OTC Escrow instance
     * Waits for confirmation and returns the escrow address
     */
    const deployOTCEscrow = useCallback(async (params: DeployOTCEscrowParams) => {
        if (!publicClient) throw new Error("No public client");

        try {
            const hash = await writeContractAsync({
                address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
                abi: SUPREME_FACTORY_ABI,
                functionName: "deployOTCEscrow",
                args: [
                    params.maker,
                    params.assetA,
                    params.assetB,
                    params.amountA,
                    params.amountB,
                    BigInt(params.toleranceBPS),
                    BigInt(params.deadline),
                ],
            });

            setPendingTx(hash);
            console.log('[useSupreme] OTC Escrow deploy TX submitted:', hash);

            // Wait for transaction receipt
            console.log('[useSupreme] Waiting for confirmation...');
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log('[useSupreme] TX confirmed, extracting escrow address...');

            // Extract escrow address from logs
            const escrowAddress = extractEscrowFromLogs(receipt.logs);

            return { hash, escrowAddress };
        } catch (error) {
            console.error("Failed to deploy OTC Escrow:", error);
            throw error;
        }
    }, [writeContractAsync, publicClient]);

    /**
     * Deploy a new Freelance Escrow instance with milestones
     * Single atomic transaction - milestones baked in at deployment
     * Client pays 0.5% deployment fee at creation
     */
    const deployFreelanceEscrow = useCallback(async (params: DeployFreelanceEscrowParams) => {
        if (!publicClient) throw new Error("No public client");

        try {
            // Prepare milestone data for contract
            const milestonesForContract = params.milestones.map((m) => ({
                worker: m.worker,
                amount: m.amount,
                deadline: m.deadline,
                revisionLimit: BigInt(m.revisionLimit),
                description: m.description,
                dependencies: m.dependencies.map(d => BigInt(d)),
            }));

            // Calculate 0.5% deployment fee
            const deploymentFeeBPS = BigInt(50); // 0.5%
            const BPS_DENOMINATOR = BigInt(10000);
            const deploymentFee = (params.totalAmount * deploymentFeeBPS) / BPS_DENOMINATOR;

            console.log('[useSupreme] Deploying Freelance Escrow with', params.milestones.length, 'milestones');
            console.log('[useSupreme] Deployment fee (0.5%):', deploymentFee.toString(), 'wei');

            const hash = await writeContractAsync({
                address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
                abi: SUPREME_FACTORY_ABI,
                functionName: "deployFreelanceEscrowWithMilestones",
                args: [
                    params.client,
                    params.paymentToken,
                    params.totalAmount,
                    milestonesForContract,
                ],
                value: deploymentFee, // 0.5% deployment fee sent to platform
            });

            setPendingTx(hash);
            console.log('[useSupreme] Freelance Escrow deploy TX submitted:', hash);


            // Wait for transaction receipt
            console.log('[useSupreme] Waiting for confirmation...');
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            console.log('[useSupreme] TX confirmed, receipt status:', receipt.status, 'logs:', receipt.logs.length);

            // Try to extract escrow address from logs first
            let escrowAddress = extractEscrowFromLogs(receipt.logs);

            // FALLBACK: If logs are empty, use direct RPC call to alternative endpoint
            if (!escrowAddress && receipt.logs.length === 0) {
                console.log('[useSupreme] Logs empty, trying direct RPC fallback...');

                // Try multiple public Sepolia RPC endpoints
                const rpcEndpoints = [
                    'https://rpc.sepolia.org',
                    'https://ethereum-sepolia.publicnode.com',
                    'https://sepolia.drpc.org',
                ];

                for (const rpcUrl of rpcEndpoints) {
                    try {
                        console.log('[useSupreme] Trying RPC:', rpcUrl);
                        const rpcResponse = await fetch(rpcUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'eth_getTransactionReceipt',
                                params: [hash],
                            }),
                        });

                        const rpcData = await rpcResponse.json();

                        if (rpcData.result && rpcData.result.logs && rpcData.result.logs.length > 0) {
                            console.log('[useSupreme] RPC returned', rpcData.result.logs.length, 'logs');

                            // Parse logs - they come as hex strings
                            const logs = rpcData.result.logs;
                            const factoryAddress = CONTRACTS.SUPREME_FACTORY.toLowerCase();

                            for (const log of logs) {
                                const logAddress = log.address?.toLowerCase();
                                const topics = log.topics || [];

                                console.log('[useSupreme] RPC Log:', logAddress, 'topics:', topics.length);

                                if (logAddress === factoryAddress && topics.length >= 3) {
                                    // topic[2] is the escrow address
                                    const escrowTopic = topics[2];
                                    if (escrowTopic) {
                                        escrowAddress = `0x${escrowTopic.slice(-40)}` as `0x${string}`;
                                        console.log('[useSupreme] ✅ RPC Fallback: Got escrow:', escrowAddress);
                                        break;
                                    }
                                }
                            }

                            if (escrowAddress) break;
                        } else {
                            console.log('[useSupreme] RPC returned no logs or null result');
                        }
                    } catch (e) {
                        console.warn('[useSupreme] RPC', rpcUrl, 'failed:', e);
                    }
                }
            }

            return { hash, escrowAddress };
        } catch (error) {
            console.error("Failed to deploy Freelance Escrow:", error);
            throw error;
        }
    }, [writeContractAsync, publicClient]);

    /**
     * Get instance details by ID
     */
    const useInstanceDetails = (instanceId: number) => {
        return useReadContract({
            address: CONTRACTS.SUPREME_FACTORY as `0x${string}`,
            abi: SUPREME_FACTORY_ABI,
            functionName: "getInstanceDetails",
            args: [BigInt(instanceId)],
        });
    };

    return {
        // State
        isLoading: isWritePending || isConfirming,
        isConfirmed,
        pendingTx,
        clearPendingTx,

        // Data
        platformFeeBPS: platformFeeBPS ? Number(platformFeeBPS) / 100 : 5,
        totalInstances: totalInstances ? Number(totalInstances) : 0,
        userInstanceIds: userInstanceIds as bigint[] | undefined,

        // Actions
        deployNFTEscrow,
        deployOTCEscrow,
        deployFreelanceEscrow,
        refetchUserInstances,
        useInstanceDetails,

        // Constants
        INSTANCE_TYPE,
    };
}
