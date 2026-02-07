/// <reference types="vite/client" />
/**
 * ENS Integration
 * 
 * Real ENS resolution using viem.
 * ENS only exists on Ethereum Mainnet, so we use a mainnet client.
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Cache for ENS lookups (address -> name)
const ensCache = new Map<string, string | null>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

// Create mainnet client for ENS (ENS only exists on mainnet)
// Using Cloudflare's free Ethereum gateway or custom RPC from env
const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(
        import.meta.env.VITE_ETHEREUM_MAINNET_RPC || 'https://cloudflare-eth.com'
    ),
});

/**
 * Resolve address to ENS name
 */
export async function resolveAddress(address: `0x${string}`): Promise<string | null> {
    const lowerAddress = address.toLowerCase();

    // Check cache first
    const cachedTimestamp = cacheTimestamps.get(lowerAddress);
    if (cachedTimestamp && Date.now() - cachedTimestamp < CACHE_DURATION) {
        const cached = ensCache.get(lowerAddress);
        if (cached !== undefined) {
            console.log('[ENS] Cache hit:', address, '→', cached);
            return cached;
        }
    }

    try {
        console.log('[ENS] Resolving:', address);

        const name = await mainnetClient.getEnsName({ address });

        // Cache the result (even if null)
        ensCache.set(lowerAddress, name);
        cacheTimestamps.set(lowerAddress, Date.now());

        if (name) {
            console.log('[ENS] ✅ Resolved:', address, '→', name);
        } else {
            console.log('[ENS] No ENS name for:', address);
        }

        return name;
    } catch (err) {
        console.warn('[ENS] Resolution failed:', err);
        // Cache the failure too
        ensCache.set(lowerAddress, null);
        cacheTimestamps.set(lowerAddress, Date.now());
        return null;
    }
}

/**
 * Resolve ENS name to address
 */
export async function resolveENSName(name: string): Promise<`0x${string}` | null> {
    try {
        console.log('[ENS] Resolving name:', name);

        const address = await mainnetClient.getEnsAddress({ name });

        if (address) {
            console.log('[ENS] ✅ Resolved:', name, '→', address);
        }

        return address;
    } catch (err) {
        console.warn('[ENS] Name resolution failed:', err);
        return null;
    }
}

/**
 * Get ENS avatar URL
 */
export async function getENSAvatar(name: string): Promise<string | null> {
    try {
        console.log('[ENS] Getting avatar for:', name);

        const avatar = await mainnetClient.getEnsAvatar({ name });

        return avatar;
    } catch (err) {
        console.warn('[ENS] Avatar lookup failed:', err);
        return null;
    }
}

// Aliases for backwards compatibility
export const resolveENSAddress = resolveAddress;
