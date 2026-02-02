import { http, createConfig } from 'wagmi';
import { sepolia, mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const SEPOLIA_RPC = import.meta.env.VITE_ETHEREUM_SEPOLIA_RPC || 'https://eth-sepolia.g.alchemy.com/v2/demo';
const MAINNET_RPC = import.meta.env.VITE_ETHEREUM_MAINNET_RPC || 'https://eth-mainnet.g.alchemy.com/v2/demo';

export const wagmiConfig = createConfig({
    chains: [sepolia, mainnet],
    connectors: [injected()],
    transports: {
        [sepolia.id]: http(SEPOLIA_RPC),
        [mainnet.id]: http(MAINNET_RPC),
    },
});

export const defaultChain = sepolia;

export const CONTRACT_ADDRESSES = {
    SUPREME_FACTORY: import.meta.env.VITE_SUPREME_FACTORY_ADDRESS || '',
    NFT_ESCROW_TEMPLATE: import.meta.env.VITE_NFT_ESCROW_TEMPLATE || '',
    OTC_ESCROW_TEMPLATE: import.meta.env.VITE_OTC_ESCROW_TEMPLATE || '',
    FREELANCE_ESCROW_TEMPLATE: import.meta.env.VITE_FREELANCE_ESCROW_TEMPLATE || '',
    USDC: import.meta.env.VITE_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
} as const;

declare module 'wagmi' {
    interface Register {
        config: typeof wagmiConfig;
    }
}
