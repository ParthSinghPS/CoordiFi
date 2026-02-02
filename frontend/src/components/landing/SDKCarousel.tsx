/**
 * SDK Carousel - Auto-sliding showcase of integration partners
 * Features: Infinite loop, smooth animation, pause on hover
 */

import { useState } from 'react';

// SDK/Sponsor logos and info
const SDKS = [
    {
        name: 'Uniswap',
        tagline: 'Decentralized price validation',
        logo: '🦄',
        color: 'text-pink-400',
    },
    {
        name: 'LI.FI',
        tagline: 'Any-token to any-chain routing',
        logo: '◈',
        color: 'text-purple-400',
    },
    {
        name: 'Ethereum',
        tagline: 'Deployed on Ethereum Sepolia',
        logo: '◆',
        color: 'text-blue-400',
    },
    {
        name: 'Base',
        tagline: 'Coming soon: Base Mainnet',
        logo: '◉',
        color: 'text-cyan-400',
    },
    {
        name: 'Supabase',
        tagline: 'Real-time database & auth',
        logo: '⚡',
        color: 'text-green-400',
    },
];

// Duplicate array for seamless infinite scroll
const CAROUSEL_ITEMS = [...SDKS, ...SDKS];

export function SDKCarousel() {
    const [isPaused, setIsPaused] = useState(false);

    return (
        <div
            className="relative overflow-hidden"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-bg-dark to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-bg-dark to-transparent z-10 pointer-events-none" />

            {/* Scrolling track */}
            <div
                className={`flex gap-12 ${isPaused ? 'animation-paused' : ''}`}
                style={{
                    animation: 'scroll 30s linear infinite',
                    width: 'max-content',
                }}
            >
                {CAROUSEL_ITEMS.map((sdk, index) => (
                    <div
                        key={`${sdk.name}-${index}`}
                        className="flex items-center gap-4 px-6 py-4 bg-bg-elevated/50 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors min-w-[280px]"
                    >
                        <div className={`text-3xl ${sdk.color}`}>
                            {sdk.logo}
                        </div>
                        <div>
                            <div className="font-semibold text-white">{sdk.name}</div>
                            <div className="text-xs text-gray-500">{sdk.tagline}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* CSS Animation */}
            <style>{`
                @keyframes scroll {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-50%);
                    }
                }
                .animation-paused {
                    animation-play-state: paused !important;
                }
            `}</style>
        </div>
    );
}
