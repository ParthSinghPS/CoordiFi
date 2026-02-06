/**
 * useYellowCustody - Hook for Yellow Network Custody Contract
 * 
 * Handles deposits to and withdrawals from the Yellow Custody contract.
 * This is the REAL fund custody layer for Yellow Network state channels.
 * 
 * @see https://github.com/erc7824/nitrolite/blob/main/contract/README.md
 */

import { useCallback, useState } from 'react';
import { useWriteContract, usePublicClient, useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { YELLOW_SDK_CONFIG } from '../lib/yellowSDK';

// IDeposit ABI from Nitrolite Custody.sol
// See: https://github.com/erc7824/nitrolite/blob/main/contract/src/Custody.sol
// CRITICAL: deposit takes 3 args: (account, token, amount)
const CUSTODY_ABI = [
    {
        name: 'deposit',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'account', type: 'address' },  // First param: recipient account
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: []
    },
    {
        name: 'withdraw',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: []
    },
    // Ledger balance check
    {
        name: 'getBalance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'user', type: 'address' },
            { name: 'token', type: 'address' }
        ],
        outputs: [
            { name: 'available', type: 'uint256' },
            { name: 'locked', type: 'uint256' }
        ]
    }
] as const;

// Native ETH is represented as address(0) in the Custody contract
const NATIVE_ETH = '0x0000000000000000000000000000000000000000' as const;

export interface YellowCustodyState {
    isDepositing: boolean;
    isWithdrawing: boolean;
    availableBalance: bigint;
    lockedBalance: bigint;
    error: string | null;
}

export interface DepositResult {
    success: boolean;
    hash?: `0x${string}`;
    error?: string;
}

export function useYellowCustody() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { writeContractAsync } = useWriteContract();

    const [state, setState] = useState<YellowCustodyState>({
        isDepositing: false,
        isWithdrawing: false,
        availableBalance: 0n,
        lockedBalance: 0n,
        error: null,
    });

    // Read balance from Custody contract
    const { data: balanceData, refetch: refetchBalance } = useReadContract({
        address: YELLOW_SDK_CONFIG.CUSTODY_ADDRESS,
        abi: CUSTODY_ABI,
        functionName: 'getBalance',
        args: address ? [address, NATIVE_ETH] : undefined,
        query: {
            enabled: !!address,
        }
    });

    // Deposit ETH to Yellow Custody
    const depositToYellow = useCallback(async (amount: bigint): Promise<DepositResult> => {
        if (!address) {
            return { success: false, error: 'Wallet not connected' };
        }

        console.log('[YellowCustody] 💰 Depositing to Yellow Custody:', {
            amount: formatEther(amount),
            custodyAddress: YELLOW_SDK_CONFIG.CUSTODY_ADDRESS,
        });

        setState(prev => ({ ...prev, isDepositing: true, error: null }));

        try {
            // Call deposit(account, token, amount) with value for native ETH
            // CRITICAL: First arg is recipient account (our own address)
            const hash = await writeContractAsync({
                address: YELLOW_SDK_CONFIG.CUSTODY_ADDRESS,
                abi: CUSTODY_ABI,
                functionName: 'deposit',
                args: [address, NATIVE_ETH, amount],  // 3 args: account, token, amount
                value: amount,
            });

            console.log('[YellowCustody] 📝 Deposit TX sent:', hash);

            // Wait for confirmation
            if (publicClient) {
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                console.log('[YellowCustody] ✅ Deposit confirmed:', {
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                });
            }

            // Refresh balance
            await refetchBalance();

            setState(prev => ({ ...prev, isDepositing: false }));
            return { success: true, hash };

        } catch (error: any) {
            console.error('[YellowCustody] ❌ Deposit failed:', error);
            const errorMessage = error.message || 'Unknown error';
            setState(prev => ({ ...prev, isDepositing: false, error: errorMessage }));
            return { success: false, error: errorMessage };
        }
    }, [address, writeContractAsync, publicClient, refetchBalance]);

    // Withdraw ETH from Yellow Custody
    const withdrawFromYellow = useCallback(async (amount: bigint): Promise<DepositResult> => {
        if (!address) {
            return { success: false, error: 'Wallet not connected' };
        }

        console.log('[YellowCustody] 💸 Withdrawing from Yellow Custody:', {
            amount: formatEther(amount),
        });

        setState(prev => ({ ...prev, isWithdrawing: true, error: null }));

        try {
            const hash = await writeContractAsync({
                address: YELLOW_SDK_CONFIG.CUSTODY_ADDRESS,
                abi: CUSTODY_ABI,
                functionName: 'withdraw',
                args: [NATIVE_ETH, amount],
            });

            console.log('[YellowCustody] 📝 Withdraw TX sent:', hash);

            // Wait for confirmation
            if (publicClient) {
                await publicClient.waitForTransactionReceipt({ hash });
                console.log('[YellowCustody] ✅ Withdraw confirmed');
            }

            // Refresh balance
            await refetchBalance();

            setState(prev => ({ ...prev, isWithdrawing: false }));
            return { success: true, hash };

        } catch (error: any) {
            console.error('[YellowCustody] ❌ Withdraw failed:', error);
            const errorMessage = error.message || 'Unknown error';
            setState(prev => ({ ...prev, isWithdrawing: false, error: errorMessage }));
            return { success: false, error: errorMessage };
        }
    }, [address, writeContractAsync, publicClient, refetchBalance]);

    // Parse balance data
    const availableBalance = balanceData ? balanceData[0] : 0n;
    const lockedBalance = balanceData ? balanceData[1] : 0n;

    return {
        // State
        isDepositing: state.isDepositing,
        isWithdrawing: state.isWithdrawing,
        availableBalance,
        lockedBalance,
        totalBalance: availableBalance + lockedBalance,
        error: state.error,

        // Actions
        depositToYellow,
        withdrawFromYellow,
        refetchBalance,

        // Config
        custodyAddress: YELLOW_SDK_CONFIG.CUSTODY_ADDRESS,
    };
}

export default useYellowCustody;
