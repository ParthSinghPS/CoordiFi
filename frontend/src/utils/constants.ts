// Chain IDs
export const CHAIN_IDS = {
    ETHEREUM_SEPOLIA: 11155111,
    ETHEREUM_MAINNET: 1,
} as const;

// Contract Addresses (Ethereum Sepolia)
// Uses environment variables for dynamic updates after redeployment
export const CONTRACTS = {
    // Circle USDC on Ethereum Sepolia
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',

    // Supreme Factory (from .env)
    SUPREME_FACTORY: import.meta.env.VITE_SUPREME_FACTORY_ADDRESS || '0x07177887eebcc93724017958770eff111dafb61d',

    // Templates (from .env)
    NFT_ESCROW_TEMPLATE: import.meta.env.VITE_NFT_ESCROW_TEMPLATE || '0xdfa81bb447c25bcf67e0c7ecc54c21ddff78a72b',
    OTC_ESCROW_TEMPLATE: import.meta.env.VITE_OTC_ESCROW_TEMPLATE || '0x6046b4bb188ebb4ab58025dfb27b95f123a063c8',
    FREELANCE_ESCROW_TEMPLATE: import.meta.env.VITE_FREELANCE_ESCROW_TEMPLATE || '0x1c85efbf7742e83544e41f5d1ea4791c894381d5',

    // Legacy (to be deprecated)
    ACCESS_REGISTRY: '',
} as const;

export const TOKENS = {
    USDC: {
        address: CONTRACTS.USDC,
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
    },
} as const;

export const PLATFORM = {
    FEE_BPS: 500, // 5%
    PRICE_TOLERANCE_BPS: 500, // 5% price tolerance for OTC
    DEFAULT_DEADLINE_HOURS: 24,
    ADMIN_ADDRESS: '0xbdF838FFB4D8B356B69DD4CB6cDb2167d085Fc9A', // Platform deployer wallet (new)
} as const;

export const LINKS = {
    BLOCK_EXPLORER: 'https://sepolia.etherscan.io',
    CIRCLE_FAUCET: 'https://faucet.circle.com/',
} as const;

export function formatAddress(address: string, chars = 4): string {
    if (!address) return '';
    return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatAmount(amount: bigint, decimals = 6): string {
    const divisor = BigInt(10 ** decimals);
    const integerPart = amount / divisor;
    const fractionalPart = amount % divisor;
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '');
    return fractionalStr ? `${integerPart}.${fractionalStr}` : integerPart.toString();
}

export function parseAmount(amount: string, decimals = 6): bigint {
    const parts = amount.split('.');
    const integerPart = parts[0] || '0';
    const fractionalPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
    return BigInt(integerPart + fractionalPart);
}

export function calculateDeadline(hoursFromNow: number): number {
    return Math.floor(Date.now() / 1000) + hoursFromNow * 60 * 60;
}

export function isDeadlinePassed(deadline: number): boolean {
    return Date.now() / 1000 > deadline;
}

export function formatDeadline(deadline: number): string {
    const diff = deadline - Date.now() / 1000;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return `${hours}h ${minutes}m`;
}

// NFT Escrow Status
export enum NFTEscrowStatus {
    CREATED = 0,
    FUNDED = 1,
    MINTED = 2,
    APPROVED = 3,
    SOLD = 4,
    SPLIT = 5,
    REFUNDED = 6,
}

export const NFT_STATUS_LABELS: Record<NFTEscrowStatus, string> = {
    [NFTEscrowStatus.CREATED]: 'Created',
    [NFTEscrowStatus.FUNDED]: 'Funded',
    [NFTEscrowStatus.MINTED]: 'Minted',
    [NFTEscrowStatus.APPROVED]: 'Approved',
    [NFTEscrowStatus.SOLD]: 'Sold',
    [NFTEscrowStatus.SPLIT]: 'Split',
    [NFTEscrowStatus.REFUNDED]: 'Refunded',
};

// OTC Escrow Status
export enum OTCEscrowStatus {
    CREATED = 0,
    MAKER_LOCKED = 1,
    BOTH_LOCKED = 2,
    SETTLED = 3,
    REFUNDED = 4,
}

export const OTC_STATUS_LABELS: Record<OTCEscrowStatus, string> = {
    [OTCEscrowStatus.CREATED]: 'Created',
    [OTCEscrowStatus.MAKER_LOCKED]: 'Maker Locked',
    [OTCEscrowStatus.BOTH_LOCKED]: 'Both Locked',
    [OTCEscrowStatus.SETTLED]: 'Settled',
    [OTCEscrowStatus.REFUNDED]: 'Refunded',
};

// Legacy enum (for backwards compat) - extended for demo
export enum CoordinationStatus { NONE = 0, LOCKED = 1, FUNDED = 2, VERIFIED = 3, SETTLED = 4, REFUNDED = 5 }

export const STATUS_LABELS: Record<CoordinationStatus, string> = {
    [CoordinationStatus.NONE]: 'None',
    [CoordinationStatus.LOCKED]: 'Locked',
    [CoordinationStatus.FUNDED]: 'Funded',
    [CoordinationStatus.VERIFIED]: 'Verified',
    [CoordinationStatus.SETTLED]: 'Settled',
    [CoordinationStatus.REFUNDED]: 'Refunded',
};
