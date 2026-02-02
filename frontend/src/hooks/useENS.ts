import { useState, useEffect, useCallback } from 'react';
import { resolveAddress } from '../lib/ens';

interface UseENSReturn {
    ensName: string | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useENS(address: `0x${string}` | undefined): UseENSReturn {
    const [ensName, setEnsName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchENS = useCallback(async () => {
        if (!address) {
            setEnsName(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const name = await resolveAddress(address);
            setEnsName(name);
        } catch (err: any) {
            setError(err.message || 'Failed to resolve ENS');
            setEnsName(null);
        } finally {
            setIsLoading(false);
        }
    }, [address]);

    useEffect(() => {
        fetchENS();
    }, [fetchENS]);

    return {
        ensName,
        isLoading,
        error,
        refresh: fetchENS,
    };
}

export function useFormattedAddress(
    address: `0x${string}` | undefined,
    truncateChars: number = 4
): string {
    const { ensName } = useENS(address);

    if (!address) return '';
    if (ensName) return ensName;

    return `${address.slice(0, truncateChars + 2)}...${address.slice(-truncateChars)}`;
}
