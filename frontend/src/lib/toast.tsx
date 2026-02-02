/**
 * Toast Notification Helper
 * Centralized toast management with consistent styling and Etherscan integration
 */
import React from 'react';
import { toast, ToastOptions, Id } from 'react-toastify';

// Network config for Etherscan links
const ETHERSCAN_BASE = 'https://sepolia.etherscan.io';

/**
 * Create an Etherscan link element
 */
const EtherscanLink = ({ txHash, label = 'View on Etherscan' }: { txHash: string; label?: string }) => (
    <a
        href={`${ETHERSCAN_BASE}/tx/${txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline text-sm mt-1 block"
    >
        {label} →
    </a>
);

/**
 * Format error messages to be user-friendly
 */
const formatError = (error: unknown): string => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) {
        if (error.message.includes('user rejected')) {
            return 'Transaction cancelled by user';
        }
        if (error.message.includes('insufficient funds')) {
            return 'Insufficient balance for this transaction';
        }
        if (error.message.includes('execution reverted')) {
            const match = error.message.match(/reason="([^"]+)"/);
            return match ? match[1] : 'Transaction would fail - check your permissions';
        }
        if (error.message.includes('gas required exceeds')) {
            return 'Transaction would fail - you may not have permission for this action';
        }
        return error.message.slice(0, 100);
    }
    return 'An unexpected error occurred';
};

/**
 * Default toast options
 */
const defaultOptions: ToastOptions = {
    position: 'top-right',
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: 'dark',
};

/**
 * Toast helper object with all notification methods
 */
export const txToast = {
    /**
     * Show success toast with optional Etherscan link
     */
    success: (message: string, txHash?: string): Id => {
        return toast.success(
            <div>
                <div className="font-medium">{message}</div>
                {txHash && <EtherscanLink txHash={txHash} />}
            </div>,
            { ...defaultOptions, autoClose: 6000 }
        );
    },

    /**
     * Show error toast with details
     */
    error: (message: string, details?: string | unknown): Id => {
        const formattedDetails = details ? formatError(details) : null;
        return toast.error(
            <div>
                <div className="font-medium">{message}</div>
                {formattedDetails && (
                    <div className="text-sm opacity-80 mt-1">{formattedDetails}</div>
                )}
            </div>,
            { ...defaultOptions, autoClose: 8000 }
        );
    },

    /**
     * Show info toast
     */
    info: (message: string): Id => {
        return toast.info(message, defaultOptions);
    },

    /**
     * Show warning toast (for access control violations, price warnings, etc.)
     */
    warning: (message: string, details?: string): Id => {
        return toast.warning(
            <div>
                <div className="font-medium">{message}</div>
                {details && <div className="text-sm opacity-80 mt-1">{details}</div>}
            </div>,
            { ...defaultOptions, autoClose: 7000 }
        );
    },

    /**
     * Show pending transaction toast (returns ID for later update)
     */
    pending: (message: string): Id => {
        return toast.loading(message, {
            ...defaultOptions,
            autoClose: false,
        });
    },

    /**
     * Update a pending toast to success or error
     */
    update: (toastId: Id, success: boolean, message: string, txHash?: string): void => {
        toast.update(toastId, {
            render: (
                <div>
                    <div className="font-medium">{message}</div>
                    {success && txHash && <EtherscanLink txHash={txHash} />}
                </div>
            ),
            type: success ? 'success' : 'error',
            isLoading: false,
            autoClose: 6000,
        });
    },

    /**
     * Dismiss a specific toast
     */
    dismiss: (toastId?: Id): void => {
        if (toastId) {
            toast.dismiss(toastId);
        } else {
            toast.dismiss();
        }
    },

    // ========================================
    // NFT-SPECIFIC TOAST MESSAGES
    // ========================================
    nft: {
        deployPending: () => txToast.pending('Deploying NFT escrow...'),
        deploySuccess: (txHash: string) => txToast.success('Escrow deployed! Share this with your partner.', txHash),
        deployError: (error: unknown) => txToast.error('Deployment failed. Check wallet balance.', error),

        depositPending: () => txToast.pending('Locking capital...'),
        depositSuccess: (txHash: string) => txToast.success('Capital locked! Mint can now proceed.', txHash),
        depositError: (error: unknown) => txToast.error('Capital lock failed. Ensure exact amount.', error),

        mintPending: () => txToast.pending('Minting NFT...'),
        mintSuccess: (txHash: string) => txToast.success('NFT minted successfully! Now verify it.', txHash),
        mintError: (error: unknown) => txToast.error('Mint failed. Check contract address.', error),

        verifyPending: () => txToast.pending('Verifying NFT ownership...'),
        verifySuccess: (txHash: string) => txToast.success('NFT verified in escrow! Ready for approval.', txHash),
        verifyError: (error: unknown) => txToast.error('Verification failed. NFT not found.', error),

        approvePending: () => txToast.pending('Submitting approval...'),
        approveSuccess: (txHash: string) => txToast.success("Sale approved! Waiting for partner's approval.", txHash),
        approveError: (error: unknown) => txToast.error('Approval failed. Check price/address.', error),

        salePending: () => txToast.pending('Purchasing NFT...'),
        saleSuccess: (txHash: string) => txToast.success('NFT purchased! Funds ready for distribution.', txHash),
        saleError: (error: unknown) => txToast.error('Purchase failed. Check payment amount.', error),

        distributePending: () => txToast.pending('Distributing funds...'),
        distributeSuccess: (txHash: string) => txToast.success('Funds distributed! Check your wallet.', txHash),
        distributeError: (error: unknown) => txToast.error('Distribution failed. Try again.', error),
    },

    // ========================================
    // OTC-SPECIFIC TOAST MESSAGES
    // ========================================
    otc: {
        deployPending: () => txToast.pending('Deploying OTC escrow...'),
        deploySuccess: (txHash: string) => txToast.success('Escrow deployed! Share with trading partner.', txHash),
        deployError: (error: unknown) => txToast.error('Deployment failed. Check wallet balance.', error),

        wrapPending: () => txToast.pending('Wrapping ETH to WETH...'),
        wrapSuccess: (txHash: string) => txToast.success('Wrapped successfully! Now approve escrow.', txHash),
        wrapError: (error: unknown) => txToast.error('Wrap failed. Ensure sufficient ETH balance.', error),

        approvePending: () => txToast.pending('Approving token spending...'),
        approveSuccess: (txHash: string) => txToast.success('Approved! Proceed to lock funds.', txHash),
        approveError: (error: unknown) => txToast.error('Approval failed. Try again.', error),

        makerLockPending: () => txToast.pending('Locking your WETH in escrow...'),
        makerLockSuccess: (txHash: string) => txToast.success('Funds locked! Waiting for taker.', txHash),
        makerLockError: (error: unknown) => txToast.error('Lock failed. Check WETH balance.', error),

        takerLockPending: () => txToast.pending('Locking your USDC in escrow...'),
        takerLockSuccess: (txHash: string) => txToast.success('Both locked! Settlement starting...', txHash),
        takerLockError: (error: unknown) => txToast.error('Lock failed. Check USDC balance and approval.', error),

        settlePending: () => txToast.pending('Executing atomic swap...'),
        settleSuccess: (txHash: string) => txToast.success('Trade complete! Funds distributed.', txHash),
        settleError: (error: unknown) => txToast.error('Settlement failed. Contact support.', error),

        // Price warnings
        priceDeviation: (deviation: number) => {
            if (deviation > 50) {
                return txToast.error(`Your price is ${deviation}% away from market!`, 'This will likely be refunded.');
            } else if (deviation > 20) {
                return txToast.warning(`Your price is ${deviation}% away from market!`, 'High risk of refund.');
            }
            return null;
        },

        priceUpdate: (price: number) => txToast.info(`Market price updated: $${price.toLocaleString()} (via Uniswap V3)`),
    },

    // ========================================
    // ACCESS CONTROL WARNINGS
    // ========================================
    access: {
        notMaker: () => txToast.warning('This action is for the Maker only.', 'You are not the Maker of this trade.'),
        notTaker: () => txToast.warning('This action is for the Taker only.', 'You are not the Taker of this trade.'),
        notWLHolder: () => txToast.warning('This action is for the WL Holder only.', 'You are not the Whitelist Holder.'),
        notCapitalHolder: () => txToast.warning('This action is for the Capital Holder only.', 'You are not the Capital Holder.'),
        notParticipant: () => txToast.warning('You are not a participant in this escrow.', 'Connect with the correct wallet.'),
        wrongPhase: (currentPhase: string) => txToast.warning('This action is not available yet.', `Current phase: ${currentPhase}`),
        insufficientBalance: (need: string, have: string) => txToast.error('Insufficient balance.', `Need: ${need}, Have: ${have}`),
        deadlinePassed: () => txToast.error('This escrow has expired.', 'Deadline has passed.'),
    },
};

export default txToast;
