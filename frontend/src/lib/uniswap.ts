/**
 * Uniswap v3 Price Oracle Integration - REAL IMPLEMENTATION
 * 
 * This module provides real price data from Uniswap V3 pools on Ethereum Mainnet.
 * Uses the slot0() function to get current sqrtPriceX96 and converts to actual prices.
 */

import { createPublicClient, http } from 'viem';

// ============ Uniswap V3 Pool ABI (minimal) ============
const UNISWAP_V3_POOL_ABI = [
    {
        inputs: [],
        name: 'slot0',
        outputs: [
            { name: 'sqrtPriceX96', type: 'uint160' },
            { name: 'tick', type: 'int24' },
            { name: 'observationIndex', type: 'uint16' },
            { name: 'observationCardinality', type: 'uint16' },
            { name: 'observationCardinalityNext', type: 'uint16' },
            { name: 'feeProtocol', type: 'uint8' },
            { name: 'unlocked', type: 'bool' }
        ],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'token0',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'token1',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    }
] as const;

// ============ Known Pool Addresses (Sepolia) ============
// Note: Sepolia has limited Uniswap pools, using mainnet-like addresses for demo
export const UNISWAP_POOLS = {
    // Mainnet pools (for reference when deploying to mainnet)
    'ETH-USDC': '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' as `0x${string}`, // 0.05% fee tier
    'WBTC-USDC': '0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35' as `0x${string}`,
    'LINK-USDC': '0xFAD57d2039C21811C8F2B5D5B65308aa99D31559' as `0x${string}`,

    // Sepolia test pools (if available)
    // These would be actual Sepolia pool addresses
};


// ============ Create Mainnet Client for Real Prices ============
// Mainnet client for fetching real ETH prices from Uniswap
import { mainnet } from 'viem/chains';
const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http('https://eth-mainnet.g.alchemy.com/v2/37kP_zRtidZ8eO-Q1-Oig'),
});

// ============ Price Conversion ============

/**
 * Convert Uniswap V3 sqrtPriceX96 to human-readable price
 * @param sqrtPriceX96 - The sqrt price from slot0
 * @param token0Decimals - Decimals of token0
 * @param token1Decimals - Decimals of token1
 * @returns Price of token0 in terms of token1
 */
export function sqrtPriceX96ToPrice(
    sqrtPriceX96: bigint,
    token0Decimals: number = 18,
    token1Decimals: number = 6
): number {
    // price = (sqrtPriceX96 / 2^96)^2 * (10^decimals0 / 10^decimals1)
    const Q96 = 2n ** 96n;

    // Calculate price with high precision
    const priceX192 = sqrtPriceX96 * sqrtPriceX96;
    const Q192 = Q96 * Q96;

    // Adjust for decimal differences
    const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);

    // Convert to number (lose some precision but acceptable for display)
    const price = Number(priceX192) / Number(Q192) * decimalAdjustment;

    return price;
}

/**
 * Get spot price from a Uniswap V3 pool (always queries mainnet for real prices)
 * @param poolAddress - The Uniswap V3 pool address (mainnet)
 * @returns The current price from the pool
 */
export async function getPoolPrice(poolAddress: `0x${string}`): Promise<{
    price: number;
    sqrtPriceX96: bigint;
    tick: number;
    timestamp: number;
}> {
    // Always use mainnet client to fetch real ETH prices
    // This works because ETH price is the same on Sepolia as mainnet
    const slot0 = await mainnetClient.readContract({
        address: poolAddress,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: 'slot0',
    });

    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];

    // Mainnet ETH/USDC pool (0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640):
    // token0 = USDC (6 decimals), token1 = WETH (18 decimals)
    // sqrtPriceX96 gives price of token0 in terms of token1 (USDC per WETH)
    // We need ETH price in USD, so we calculate and then invert

    const Q96 = 2n ** 96n;
    const priceX192 = sqrtPriceX96 * sqrtPriceX96;
    const Q192 = Q96 * Q96;

    // Raw price is (USDC/WETH) with decimal adjustment
    // token0=USDC(6), token1=WETH(18) -> adjustment = 10^(6-18) = 10^-12
    const rawPrice = Number(priceX192) / Number(Q192);

    // Price represents: how many token1 units per token0 unit
    // = WETH per USDC (tiny number like 0.0003)
    // Invert to get USDC per WETH (ETH price in USD)
    const ethPriceUsd = (1 / rawPrice) * (10 ** (18 - 6));

    return {
        price: ethPriceUsd,
        sqrtPriceX96,
        tick,
        timestamp: Date.now(),
    };
}

/**
 * Get spot price from Uniswap V3 for a trading pair
 * Fetches real prices from mainnet Uniswap pools
 */
export async function getSpotPrice(
    tokenIn: string,
    tokenOut: string
): Promise<number> {
    const pair = `${tokenIn}-${tokenOut}`;
    const poolAddress = UNISWAP_POOLS[pair as keyof typeof UNISWAP_POOLS];

    if (!poolAddress) {
        return getMockPrice(pair).price;
    }

    try {
        const { price } = await getPoolPrice(poolAddress);
        console.log(`[Uniswap] Real ETH price from mainnet: $${price.toFixed(2)}`);
        return price;
    } catch (error) {
        console.warn(`[Uniswap] Failed to fetch mainnet price, using fallback`);
        return getMockPrice(pair).price;
    }
}

/**
 * Get TWAP (Time Weighted Average Price) from Uniswap V3
 * Note: Full TWAP requires observation array queries, simplified here
 */
export async function getTWAP(
    tokenIn: string,
    tokenOut: string,
    _seconds: number = 300
): Promise<number> {
    // For simplicity, return spot price
    // Full TWAP would query observations and calculate weighted average
    return getSpotPrice(tokenIn, tokenOut);
}

// ============ Mock Data (Fallback) ============
// Updated: Jan 27, 2026 - current market prices for demo
const MOCK_PRICES: Record<string, { price: number; timestamp: number }> = {
    'ETH-USDC': { price: 3350, timestamp: Date.now() },   // ~$3,350 demo price
    'WBTC-USDC': { price: 105000, timestamp: Date.now() }, // ~$105,000 current
    'LINK-USDC': { price: 24.50, timestamp: Date.now() },  // ~$24.50 current
    'WETH-USDC': { price: 3350, timestamp: Date.now() },   // Same as ETH
};

/**
 * Get mock price for a trading pair (fallback when real pool unavailable)
 */
export function getMockPrice(pair: string): { price: number; timestamp: number } {
    return MOCK_PRICES[pair] || { price: 0, timestamp: Date.now() };
}

// ============ Price Validation ============

export interface PriceValidation {
    isValid: boolean;
    marketPrice: number;
    agreedPrice: number;
    deviationPercent: number;
    source: 'uniswap' | 'mock';
}

/**
 * Validate OTC price against market (Uniswap)
 */
export async function validateOTCPriceAsync(
    agreedPrice: number,
    tokenIn: string,
    tokenOut: string,
    tolerancePercent: number = 5
): Promise<PriceValidation> {
    const pair = `${tokenIn}-${tokenOut}`;
    const poolAddress = UNISWAP_POOLS[pair as keyof typeof UNISWAP_POOLS];

    let marketPrice: number;
    let source: 'uniswap' | 'mock';

    if (poolAddress) {
        try {
            const { price } = await getPoolPrice(poolAddress);
            marketPrice = price;
            source = 'uniswap';
        } catch {
            marketPrice = getMockPrice(pair).price;
            source = 'mock';
        }
    } else {
        marketPrice = getMockPrice(pair).price;
        source = 'mock';
    }

    const deviation = ((agreedPrice - marketPrice) / marketPrice) * 100;

    return {
        isValid: Math.abs(deviation) <= tolerancePercent,
        marketPrice,
        agreedPrice,
        deviationPercent: deviation,
        source,
    };
}

/**
 * Synchronous validation using cached/mock prices
 */
export function validateOTCPrice(
    agreedPrice: number,
    marketPrice: number,
    tolerancePercent: number = 5
): PriceValidation {
    const deviation = ((agreedPrice - marketPrice) / marketPrice) * 100;

    return {
        isValid: Math.abs(deviation) <= tolerancePercent,
        marketPrice,
        agreedPrice,
        deviationPercent: deviation,
        source: 'mock',
    };
}

// ============ Display Helpers ============

/**
 * Format price with deviation for display
 */
export function formatPriceWithDeviation(validation: PriceValidation): {
    display: string;
    color: string;
    sourceLabel: string;
} {
    const prefix = validation.deviationPercent >= 0 ? '+' : '';
    const display = `${prefix}${validation.deviationPercent.toFixed(2)}%`;

    let color = 'text-gray-400';
    if (validation.isValid) {
        color = validation.deviationPercent < 0 ? 'text-green-400' : 'text-amber-400';
    } else {
        color = 'text-red-400';
    }

    const sourceLabel = validation.source === 'uniswap' ? '🔷 Uniswap' : '📊 Mock';

    return { display, color, sourceLabel };
}

// ============ React Hook for Live Prices ============

import { useState, useEffect } from 'react';

export function useUniswapPrice(tokenIn: string, tokenOut: string, refreshInterval: number = 30000) {
    const [price, setPrice] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<'uniswap' | 'mock'>('mock');

    useEffect(() => {
        let mounted = true;

        const fetchPrice = async () => {
            try {
                const pair = `${tokenIn}-${tokenOut}`;
                const poolAddress = UNISWAP_POOLS[pair as keyof typeof UNISWAP_POOLS];

                if (poolAddress) {
                    const { price: fetchedPrice } = await getPoolPrice(poolAddress);
                    if (mounted) {
                        setPrice(fetchedPrice);
                        setSource('uniswap');
                        setError(null);
                    }
                } else {
                    const mockData = getMockPrice(pair);
                    if (mounted) {
                        setPrice(mockData.price);
                        setSource('mock');
                    }
                }
            } catch (err) {
                const mockData = getMockPrice(`${tokenIn}-${tokenOut}`);
                if (mounted) {
                    setPrice(mockData.price);
                    setSource('mock');
                    setError('Using fallback price');
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchPrice();
        const interval = setInterval(fetchPrice, refreshInterval);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [tokenIn, tokenOut, refreshInterval]);

    return { price, loading, error, source };
}
