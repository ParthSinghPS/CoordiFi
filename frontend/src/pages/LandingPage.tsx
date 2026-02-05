import { Link } from 'react-router-dom';

export function LandingPage() {
    return (
        <div className="min-h-screen">
            <section className="relative py-24 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-900/20 via-transparent to-purple-900/20"></div>
                <div className="max-w-7xl mx-auto px-4 relative z-10">
                    <div className="text-center max-w-4xl mx-auto">
                        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                            Trustless <span className="text-primary-400">Coordination</span> for Web3
                        </h1>
                        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
                            Smart escrow contracts for NFT whitelist pools, OTC trading, and freelance payments.
                            Built on Ethereum with full transparency.
                        </p>
                        <div className="flex gap-4 justify-center">
                            <Link to="/nft-whitelist" className="btn-primary text-lg px-8 py-3">
                                Get Started
                            </Link>
                            <a
                                href="https://github.com/ParthSinghPS/CoordiFi"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary text-lg px-8 py-3"
                            >
                                View on GitHub
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-20 bg-bg-elevated/50">
                <div className="max-w-7xl mx-auto px-4">
                    <h2 className="text-3xl font-bold text-white text-center mb-12">
                        Three Powerful Escrow Types
                    </h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon="🎨"
                            title="NFT Whitelist"
                            description="Pool funds with other collectors to secure whitelist spots. Smart contracts handle coordination, minting, and distribution automatically."
                            href="/nft-whitelist"
                        />
                        <FeatureCard
                            icon="💱"
                            title="OTC Trading"
                            description="Execute large token swaps with price validation from Uniswap V3. Set tolerance ranges and trade without slippage concerns."
                            href="/otc-trade"
                        />
                        <FeatureCard
                            icon="💼"
                            title="Freelance Escrow"
                            description="Milestone-based payments for contractors. Funds are released as work is completed, with optional dispute resolution."
                            href="/freelance"
                        />
                    </div>
                </div>
            </section>

            <section className="py-20">
                <div className="max-w-7xl mx-auto px-4">
                    <h2 className="text-3xl font-bold text-white text-center mb-12">
                        How It Works
                    </h2>
                    <div className="grid md:grid-cols-4 gap-6">
                        <StepCard number={1} title="Connect" description="Connect your wallet to access the platform" />
                        <StepCard number={2} title="Create" description="Create an escrow for your use case" />
                        <StepCard number={3} title="Coordinate" description="Other parties join and lock their funds" />
                        <StepCard number={4} title="Execute" description="Smart contract executes the trade or release" />
                    </div>
                </div>
            </section>

            <section className="py-20 bg-bg-elevated/50">
                <div className="max-w-7xl mx-auto px-4">
                    <h2 className="text-3xl font-bold text-white text-center mb-12">
                        Built With
                    </h2>
                    <div className="flex flex-wrap justify-center gap-8 text-gray-400">
                        <TechBadge name="Solidity" />
                        <TechBadge name="Foundry" />
                        <TechBadge name="OpenZeppelin" />
                        <TechBadge name="React" />
                        <TechBadge name="Wagmi" />
                        <TechBadge name="Viem" />
                        <TechBadge name="Supabase" />
                        <TechBadge name="TailwindCSS" />
                    </div>
                </div>
            </section>

            <footer className="py-12 border-t border-gray-800">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-gray-500 mb-4">
                        Built for ETHGlobal HackMoney 2026
                    </p>
                    <div className="flex justify-center gap-6 text-sm">
                        <a href="https://sepolia.etherscan.io" target="_blank" className="text-primary-400 hover:underline">
                            Etherscan
                        </a>
                        <a href="https://faucet.circle.com" target="_blank" className="text-primary-400 hover:underline">
                            USDC Faucet
                        </a>
                        <a href="https://github.com/ParthSinghPS/CoordiFi" target="_blank" className="text-primary-400 hover:underline">
                            GitHub
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function FeatureCard({ icon, title, description, href }: { icon: string; title: string; description: string; href: string }) {
    return (
        <Link to={href} className="card p-8 hover:border-primary-500/50 transition-all group">
            <div className="text-4xl mb-4">{icon}</div>
            <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-primary-400 transition-colors">
                {title}
            </h3>
            <p className="text-gray-400">{description}</p>
        </Link>
    );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
    return (
        <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-primary-600 flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-bold">{number}</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-gray-400 text-sm">{description}</p>
        </div>
    );
}

function TechBadge({ name }: { name: string }) {
    return (
        <span className="px-4 py-2 bg-bg-dark rounded-lg border border-gray-800">
            {name}
        </span>
    );
}
