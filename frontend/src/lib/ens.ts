import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const ensCache = new Map<string, string | null>();
const CACHE_DURATION = 5 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(
        import.meta.env.VITE_ETHEREUM_MAINNET_RPC || 'https://cloudflare-eth.com'
    ),
});

export async function resolveAddress(address: `0x${string}`): Promise<string | null> {
    const lowerAddress = address.toLowerCase();

    const cachedTimestamp = cacheTimestamps.get(lowerAddress);
    if (cachedTimestamp && Date.now() - cachedTimestamp < CACHE_DURATION) {
        const cached = ensCache.get(lowerAddress);
        if (cached !== undefined) return cached;
    }

    try {
        const name = await mainnetClient.getEnsName({ address });
        ensCache.set(lowerAddress, name);
        cacheTimestamps.set(lowerAddress, Date.now());
        return name;
    } catch (err) {
        ensCache.set(lowerAddress, null);
        cacheTimestamps.set(lowerAddress, Date.now());
        return null;
    }
}

export async function resolveENSName(name: string): Promise<`0x${string}` | null> {
    try {
        const address = await mainnetClient.getEnsAddress({ name });
        return address;
    } catch (err) {
        return null;
    }
}

export async function getENSAvatar(name: string): Promise<string | null> {
    try {
        const avatar = await mainnetClient.getEnsAvatar({ name });
        return avatar;
    } catch (err) {
        return null;
    }
}

export function formatAddress(address: string, ensName?: string | null): string {
    if (ensName) return ensName;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
