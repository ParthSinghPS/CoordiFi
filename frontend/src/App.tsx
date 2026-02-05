import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { NFTWhitelist } from './pages/NFTWhitelist';
import { OTCTrade } from './pages/OTCTrade';
import { FreelanceHub } from './pages/FreelanceHub';
import { LandingPage } from './pages/LandingPage';

function Layout({ children }: { children: React.ReactNode }) {
    const { address, isConnected } = useAccount();
    const { connect, isPending } = useConnect();
    const { disconnect } = useDisconnect();

    const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

    return (
        <div className="min-h-screen bg-bg-dark">
            <nav className="border-b border-gray-800 bg-bg-dark/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center gap-8">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">CP</span>
                                </div>
                                <span className="font-semibold text-lg text-white">CoordiFi</span>
                            </Link>
                            <div className="hidden md:flex items-center gap-1">
                                <NavLink href="/">Home</NavLink>
                                <NavLink href="/nft-whitelist">NFT Whitelist</NavLink>
                                <NavLink href="/otc-trade">OTC Trade</NavLink>
                                <NavLink href="/freelance">Freelance</NavLink>
                            </div>
                        </div>
                        <div>
                            {isConnected && address ? (
                                <div className="flex items-center gap-3">
                                    <div className="px-3 py-1.5 bg-bg-elevated rounded-lg border border-gray-800 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="text-sm font-mono text-gray-300">{shortAddr}</span>
                                    </div>
                                    <button onClick={() => disconnect()} className="btn-secondary text-sm">Disconnect</button>
                                </div>
                            ) : (
                                <button onClick={() => connect({ connector: injected() })} disabled={isPending} className="btn-primary">
                                    {isPending ? 'Connecting...' : 'Connect Wallet'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </nav>
            <main>{children}</main>
            <footer className="border-t border-gray-800 py-8 text-center text-gray-500 text-sm">
                <p>CoordiFi - Coordination Protocol | ETHGlobal HackMoney 2026</p>
            </footer>
        </div>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    const location = useLocation();
    const active = location.pathname === href;
    return (
        <Link to={href} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-bg-elevated text-white' : 'text-gray-400 hover:text-white hover:bg-bg-hover'}`}>
            {children}
        </Link>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout><LandingPage /></Layout>} />
            <Route path="/nft-whitelist" element={<Layout><NFTWhitelist /></Layout>} />
            <Route path="/otc-trade" element={<Layout><OTCTrade /></Layout>} />
            <Route path="/freelance" element={<Layout><FreelanceHub /></Layout>} />
        </Routes>
    );
}

export default App;
