/**
 * Landing Page - Complete Redesign
 * 7 Sections: Hero, Principles, SDK Carousel, Use Cases, CTA, Footer
 */

import { Link } from 'react-router-dom';
import { Shield, Puzzle, Link2, Percent, ArrowRight, ExternalLink } from 'lucide-react';
import { SDKCarousel } from '../components/landing/SDKCarousel';

// ============================================
// SECTION 1: HERO
// ============================================
function HeroSection() {
    return (
        <section className="relative py-24 md:py-32 overflow-hidden">
            {/* Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary-900/20 via-transparent to-purple-900/10 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative max-w-5xl mx-auto px-4 text-center">
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500/10 border border-primary-500/20 rounded-full mb-8">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm text-primary-300">Live on Ethereum Sepolia</span>
                </div>

                {/* Main Headline */}
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
                    Trustless Coordination,{' '}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-blue-400">
                        Powered by Escrow
                    </span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
                    A trust-minimized protocol that lets people coordinate access rights with capital holders
                    through programmable escrow contracts. Deploy specialized instances. Split proceeds automatically.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a href="#use-cases" className="btn-primary text-lg px-8 py-4 flex items-center justify-center gap-2">
                        Explore Use Cases
                        <ArrowRight className="w-5 h-5" />
                    </a>
                    <a
                        href="https://github.com/CoordiFi/CoordiFi"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-lg px-8 py-4 flex items-center justify-center gap-2"
                    >
                        Read Documentation
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </section>
    );
}

// ============================================
// SECTION 2: PRINCIPLES (4 Cards)
// ============================================
const PRINCIPLES = [
    {
        icon: Shield,
        title: 'Trust-Minimized',
        description: 'Capital locked in smart contracts. Deterministic execution. No central authority needed.',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20',
    },
    {
        icon: Puzzle,
        title: 'Programmable Escrow',
        description: 'Factory pattern deploys specialized escrow instances. Each use case gets custom logic and state machine.',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
    },
    {
        icon: Link2,
        title: 'Any Chain, Any Asset',
        description: 'Built for multi-chain future. Integrated with LI.FI for cross-chain routing. Start on any chain, settle anywhere.',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20',
    },
    {
        icon: Percent,
        title: '2-5% Fees, Not 15-20%',
        description: 'Platform takes minimal fees. Most value goes to participants. Compare to traditional platforms charging 15-20%.',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
    },
];

function PrinciplesSection() {
    return (
        <section className="py-20 bg-bg-elevated/30">
            <div className="max-w-7xl mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                        Why CoordiFi?
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        Built on principles that put users first
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {PRINCIPLES.map((principle) => (
                        <div
                            key={principle.title}
                            className={`${principle.bgColor} ${principle.borderColor} border rounded-2xl p-6 hover:scale-[1.02] transition-transform duration-300`}
                        >
                            <div className={`w-12 h-12 ${principle.bgColor} rounded-xl flex items-center justify-center mb-4`}>
                                <principle.icon className={`w-6 h-6 ${principle.color}`} />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">{principle.title}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">{principle.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ============================================
// SECTION 3: SDK CAROUSEL
// ============================================
function SDKSection() {
    return (
        <section className="py-16 border-y border-gray-800">
            <div className="max-w-7xl mx-auto px-4">
                <p className="text-center text-gray-500 text-sm uppercase tracking-wider mb-8">
                    Powered by Industry Leaders
                </p>
                <SDKCarousel />
            </div>
        </section>
    );
}

// ============================================
// SECTION 4: USE CASES (3 Large Cards)
// ============================================
const USE_CASES = [
    {
        title: 'NFT Whitelist Trading',
        description: 'Whitelist holder meets capital investor. Mint together, split profits. All trustless.',
        features: ['70/30 profit splits', 'Automatic settlement', 'Timeout protection'],
        link: '/nft-whitelist',
        cta: 'Try NFT Coordination',
        gradient: 'from-pink-500/20 to-purple-500/20',
        iconBg: 'bg-pink-500/20',
        iconColor: 'text-pink-400',
    },
    {
        title: 'Private OTC Trades',
        description: 'Trade at custom prices with oracle validation. Atomic swaps ensure fairness.',
        features: ['Uniswap price validation', 'Custom tolerance levels', '5% platform fee'],
        link: '/otc-trade',
        cta: 'Start OTC Trade',
        gradient: 'from-blue-500/20 to-cyan-500/20',
        iconBg: 'bg-blue-500/20',
        iconColor: 'text-blue-400',
    },
    {
        title: 'Freelance Payments',
        description: 'Milestone-based escrow for freelance work. Release funds on proof submission.',
        features: ['Milestone-based releases', 'Proof of work required', '2% platform fee'],
        link: '/freelance',
        cta: 'Launch Freelance',
        gradient: 'from-green-500/20 to-emerald-500/20',
        iconBg: 'bg-green-500/20',
        iconColor: 'text-green-400',
        poweredBy: 'Yellow',
    },
];

function UseCasesSection() {
    return (
        <section id="use-cases" className="py-20">
            <div className="max-w-7xl mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                        See It In Action
                    </h2>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                        Real use cases, real impact. Choose your coordination type.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {USE_CASES.map((useCase) => (
                        <Link
                            key={useCase.title}
                            to={useCase.link}
                            className={`group relative bg-gradient-to-br ${useCase.gradient} border border-gray-800 rounded-2xl p-8 hover:border-gray-700 transition-all duration-300 hover:scale-[1.02]`}
                        >
                            {/* Icon */}
                            <div className={`w-14 h-14 ${useCase.iconBg} rounded-xl flex items-center justify-center mb-6`}>
                                <div className={`w-6 h-6 ${useCase.iconColor} rounded-full bg-current`} />
                            </div>

                            {/* Content */}
                            <h3 className="text-xl font-bold text-white mb-3">{useCase.title}</h3>
                            <p className="text-gray-400 text-sm mb-6 leading-relaxed">{useCase.description}</p>

                            {/* Features */}
                            <ul className="space-y-2 mb-4">
                                {useCase.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            {/* Powered by Yellow badge for Freelance */}
                            {'poweredBy' in useCase && useCase.poweredBy && (
                                <div className="mb-4 inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                                    <span className="text-xs text-yellow-400">Powered by {useCase.poweredBy}</span>
                                </div>
                            )}

                            {/* CTA */}
                            <div className="flex items-center gap-2 text-primary-400 font-medium group-hover:gap-3 transition-all">
                                {useCase.cta}
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ============================================
// SECTION 5: FINAL CTA
// ============================================
function CTASection() {
    return (
        <section className="py-20">
            <div className="max-w-4xl mx-auto px-4">
                <div className="relative overflow-hidden bg-gradient-to-r from-primary-600 to-blue-600 rounded-3xl p-12 text-center">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-3xl" />
                        <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full blur-3xl" />
                    </div>

                    <div className="relative">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            Ready to Coordinate?
                        </h2>
                        <p className="text-blue-100 max-w-xl mx-auto mb-8">
                            Deploy escrow contracts in seconds. Coordinate trustlessly. Pay 95% less in fees than traditional platforms.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/nft-whitelist"
                                className="bg-white text-primary-600 px-8 py-4 rounded-xl font-semibold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                            >
                                Launch App
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ============================================
// SECTION 6: FOOTER
// ============================================
function Footer() {
    return (
        <footer className="bg-bg-elevated border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 py-12">
                <div className="grid md:grid-cols-4 gap-8 mb-12">
                    {/* Brand Column */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-10 w-10 rounded-lg overflow-hidden bg-bg-elevated">
                                <img src="/CoordiFi.png" alt="CoordiFi" className="h-full w-full object-cover object-center scale-150" />
                            </div>
                            <span className="font-semibold text-lg text-white">CoordiFi</span>
                        </div>
                        <p className="text-gray-500 text-sm">
                            Trustless coordination through programmable escrow.
                        </p>
                    </div>

                    {/* Product Column */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Product</h4>
                        <ul className="space-y-2">
                            <li><Link to="/nft-whitelist" className="text-gray-400 hover:text-white text-sm">NFT Whitelist</Link></li>
                            <li><Link to="/otc-trade" className="text-gray-400 hover:text-white text-sm">OTC Trade</Link></li>
                            <li><Link to="/freelance" className="text-gray-400 hover:text-white text-sm">Freelance Hub</Link></li>
                        </ul>
                    </div>

                    {/* Resources Column */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Resources</h4>
                        <ul className="space-y-2">
                            <li><a href="https://github.com/CoordiFi/CoordiFi" target="_blank" className="text-gray-400 hover:text-white text-sm">GitHub</a></li>
                        </ul>
                    </div>

                    {/* Network Column */}
                    <div>
                        <h4 className="text-white font-semibold mb-4">Network</h4>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <span className="text-gray-400 text-sm">Ethereum Sepolia</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                                <span className="text-gray-400 text-sm">Yellow Network</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-gray-500 text-sm">© 2026 CoordiFi</p>
                    <p className="text-gray-500 text-sm">Built for HackMoney 2026</p>
                </div>
            </div>
        </footer>
    );
}

// ============================================
// MAIN LANDING PAGE EXPORT
// ============================================
export function LandingPage() {
    return (
        <div className="min-h-screen bg-bg-dark">
            <HeroSection />
            <PrinciplesSection />
            <SDKSection />
            <UseCasesSection />
            <CTASection />
            <Footer />
        </div>
    );
}
