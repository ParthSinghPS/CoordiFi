import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Globe, Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const features = [
    {
        icon: Lock,
        title: 'Trust-Minimized',
        description: 'Capital locked in smart contracts. No manual approvals, no disputes, no governance.',
    },
    {
        icon: Zap,
        title: 'Deterministic Execution',
        description: 'Conditions verified on-chain. Settlement happens automatically when rules are met.',
    },
    {
        icon: Globe,
        title: 'Any Chain, Any Token',
        description: 'Deposit from any chain. LI.FI routes to USDC on Base. Gasless via Circle Paymaster.',
    },
    {
        icon: Shield,
        title: 'Access + Capital',
        description: 'Coordinate whitelist slots, OTC trades, or any access right with capital providers.',
    },
];

const applications = [
    {
        title: 'NFT Whitelist',
        description: 'Turn whitelist slots into tradeable access rights. Lock capital, mint NFT, settle.',
        href: '/nft-whitelist',
        color: 'from-purple-500/20 to-pink-500/20',
        borderColor: 'border-purple-500/30 hover:border-purple-400/50',
    },
    {
        title: 'OTC Trade',
        description: 'Private trades at agreed prices. No pools, no slippage, no MEV. Atomic settlement.',
        href: '/otc-trade',
        color: 'from-blue-500/20 to-cyan-500/20',
        borderColor: 'border-blue-500/30 hover:border-blue-400/50',
    },
];

export function Home() {
    // Connection status available via useAccount() if needed

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-primary-600/10 via-transparent to-transparent" />
                <div className="container-custom section-padding relative">
                    <div className="max-w-3xl mx-auto text-center">
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                            Coordinate{' '}
                            <span className="gradient-text">Access Rights</span>
                            {' '}with{' '}
                            <span className="gradient-text">Capital</span>
                        </h1>
                        <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
                            A trust-minimized protocol that answers one question: When someone has access
                            and someone else has capital, how do we coordinate them without trust?
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link to="/nft-whitelist">
                                <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                                    Start Coordinating
                                </Button>
                            </Link>
                            <a
                                href="https://github.com"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button variant="secondary" size="lg">
                                    View Documentation
                                </Button>
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="container-custom section-padding">
                <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                        How It Works
                    </h2>
                    <p className="text-gray-400 max-w-xl mx-auto">
                        The protocol doesn't care what the access is or what the asset is.
                        It only enforces the rules you define.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {features.map((feature) => (
                        <Card key={feature.title} variant="elevated">
                            <div className="w-12 h-12 rounded-xl bg-primary-600/20 flex items-center justify-center mb-4">
                                <feature.icon className="w-6 h-6 text-primary-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">
                                {feature.title}
                            </h3>
                            <p className="text-sm text-gray-400">
                                {feature.description}
                            </p>
                        </Card>
                    ))}
                </div>
            </section>

            {/* Applications Section */}
            <section className="container-custom section-padding">
                <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                        Applications
                    </h2>
                    <p className="text-gray-400 max-w-xl mx-auto">
                        Two demonstrations of the core protocol. Each shows how access
                        and capital can coordinate without trust.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {applications.map((app) => (
                        <Link key={app.title} to={app.href}>
                            <Card
                                variant="interactive"
                                className={`bg-gradient-to-br ${app.color} ${app.borderColor} h-full`}
                            >
                                <h3 className="text-xl font-semibold text-white mb-3">
                                    {app.title}
                                </h3>
                                <p className="text-gray-300 mb-4">
                                    {app.description}
                                </p>
                                <div className="flex items-center text-primary-400 font-medium text-sm">
                                    Explore <ArrowRight className="w-4 h-4 ml-1" />
                                </div>
                            </Card>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Tech Stack Section */}
            <section className="container-custom section-padding border-t border-gray-800">
                <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                        Built With
                    </h2>
                </div>
                <div className="flex flex-wrap justify-center gap-8 text-gray-400">
                    <div className="text-center">
                        <div className="text-lg font-semibold text-white mb-1">Circle</div>
                        <div className="text-sm">Wallets, USDC, Paymaster</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-semibold text-white mb-1">LI.FI</div>
                        <div className="text-sm">Cross-chain Routing</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-semibold text-white mb-1">Uniswap</div>
                        <div className="text-sm">Price Oracle</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-semibold text-white mb-1">Base</div>
                        <div className="text-sm">L2 Chain</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-semibold text-white mb-1">ENS</div>
                        <div className="text-sm">Name Resolution</div>
                    </div>
                </div>
            </section>
        </div>
    );
}
