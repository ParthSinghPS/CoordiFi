import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useFormattedAddress } from './hooks/useENS';

// Import REAL page components with working handlers
import { NFTWhitelist } from './pages/NFTWhitelist';
import { NFTOfferProcess } from './pages/NFTOfferProcess';
import { OTCTrade } from './pages/OTCTrade';
import { OTCOfferProcess } from './pages/OTCOfferProcess';
import { FreelanceHub } from './pages/FreelanceHub';
// import { ProjectDashboard } from './pages/ProjectDashboard'; // Original version
import { ProjectDashboardWithYellow } from './pages/ProjectDashboardWithYellow'; // Yellow Network enhanced
import { DisputeManagement } from './pages/DisputeManagement';
import { LandingPage } from './pages/LandingPage';

// Simple Layout
function Layout({ children }: { children: React.ReactNode }) {
    const { address, isConnected } = useAccount();
    const { connect, isPending } = useConnect();
    const { disconnect } = useDisconnect();
    const displayName = useFormattedAddress(address);

    return (
        <div className="min-h-screen bg-bg-dark">
            <nav className="border-b border-gray-800 bg-bg-dark/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center gap-8">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded-lg overflow-hidden bg-bg-elevated">
                                    <img src="/CoordiFi.png" alt="CoordiFi" className="h-full w-full object-cover object-center scale-150" />
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
                                        <span className="text-sm font-mono text-gray-300">{displayName}</span>
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
                <p>CoordiFi - HackMoney 2026 | Built on Ethereum Sepolia</p>
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


// Header-only layout for landing page (landing has its own footer)
function HeaderOnly({ children }: { children: React.ReactNode }) {
    const { address, isConnected } = useAccount();
    const { connect, isPending } = useConnect();
    const { disconnect } = useDisconnect();
    const displayName = useFormattedAddress(address);

    return (
        <div className="min-h-screen bg-bg-dark">
            <nav className="border-b border-gray-800 bg-bg-dark/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center gap-8">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="h-10 w-10 rounded-lg overflow-hidden bg-bg-elevated">
                                    <img src="/CoordiFi.png" alt="CoordiFi" className="h-full w-full object-cover object-center scale-150" />
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
                        <div className="flex items-center gap-3">
                            <div className="hidden sm:flex px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full">
                                <span className="text-xs text-purple-300">Sepolia</span>
                            </div>
                            {isConnected && address ? (
                                <div className="flex items-center gap-3">
                                    <div className="px-3 py-1.5 bg-bg-elevated rounded-lg border border-gray-800 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <span className="text-sm font-mono text-gray-300">{displayName}</span>
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
        </div>
    );
}

function App() {
    return (
        <Routes>
            {/* Landing page - has its own footer */}
            <Route path="/" element={<HeaderOnly><LandingPage /></HeaderOnly>} />
            {/* Other pages use standard Layout with footer */}
            <Route path="/nft-whitelist" element={<Layout><NFTWhitelist /></Layout>} />
            <Route path="/nft/offer/:escrowAddress" element={<Layout><NFTOfferProcess /></Layout>} />
            <Route path="/otc-trade" element={<Layout><OTCTrade /></Layout>} />
            <Route path="/otc/offer/:escrowAddress" element={<Layout><OTCOfferProcess /></Layout>} />
            <Route path="/freelance" element={<Layout><FreelanceHub /></Layout>} />
            {/* Yellow Network enhanced Freelance Project Dashboard */}
            <Route path="/freelance/:address" element={<Layout><ProjectDashboardWithYellow /></Layout>} />
            <Route path="/admin/disputes" element={<Layout><DisputeManagement /></Layout>} />
        </Routes>
    );
}

export default App;

