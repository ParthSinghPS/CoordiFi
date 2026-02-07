/// <reference types="vite/client" />
import { http, createConfig } from 'wagmi';
import { sepolia, mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Get RPC from env
const SEPOLIA_RPC = import.meta.env.VITE_ETHEREUM_SEPOLIA_RPC || 'https://eth-sepolia.g.alchemy.com/v2/37kP_zRtidZ8eO-Q1-Oig';
const MAINNET_RPC = import.meta.env.VITE_ETHEREUM_MAINNET_RPC || 'https://eth-mainnet.g.alchemy.com/v2/37kP_zRtidZ8eO-Q1-Oig';

export const wagmiConfig = createConfig({
    chains: [sepolia, mainnet],
    connectors: [injected()],
    transports: {
        [sepolia.id]: http(SEPOLIA_RPC),
        [mainnet.id]: http(MAINNET_RPC), // Needed for ENS resolution
    },
});

export const defaultChain = sepolia;

// Contract addresses from env
export const CONTRACT_ADDRESSES = {
    SUPREME_FACTORY: import.meta.env.VITE_SUPREME_FACTORY_ADDRESS || '0x2561b0d0877fe3db942f5b7f1c48d5bf548a740c',
    NFT_ESCROW_TEMPLATE: import.meta.env.VITE_NFT_ESCROW_TEMPLATE || '0x9bb7262665c5a60255757d86f07da8edb5fed795',
    OTC_ESCROW_TEMPLATE: import.meta.env.VITE_OTC_ESCROW_TEMPLATE || '0x807ff875f6197e7ac6ed16c13b22bf992d61996a',
    USDC: import.meta.env.VITE_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
} as const;

declare module 'wagmi' {
    interface Register {
        config: typeof wagmiConfig;
    }
}
