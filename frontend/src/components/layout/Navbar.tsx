import { Link, useLocation } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Wallet, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { WalletDisplay } from '@/components/ui/AddressDisplay';

const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/nft-whitelist', label: 'NFT Whitelist' },
    { href: '/otc-trade', label: 'OTC Trade' },
    { href: '/freelance', label: 'Freelance' },
];

export function Navbar() {
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const { address, isConnected } = useAccount();
    const { connect, isPending } = useConnect();
    const { disconnect } = useDisconnect();

    const handleConnect = () => {
        connect({ connector: injected() });
    };

    return (
        <nav className="sticky top-0 z-50 border-b border-gray-800 bg-bg-dark/80 backdrop-blur-xl">
            <div className="container-custom">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">CP</span>
                        </div>
                        <span className="font-semibold text-lg hidden sm:block">
                            Coordination Protocol
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-1">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                to={link.href}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === link.href
                                    ? 'bg-bg-elevated text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-bg-hover'
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    {/* Wallet Button */}
                    <div className="flex items-center gap-4">
                        {isConnected && address ? (
                            <div className="flex items-center gap-3">
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-bg-elevated rounded-lg border border-gray-800">
                                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                    <WalletDisplay address={address} truncateChars={4} />
                                </div>
                                <button
                                    onClick={() => disconnect()}
                                    className="btn-secondary text-sm"
                                >
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleConnect}
                                disabled={isPending}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Wallet className="w-4 h-4" />
                                {isPending ? 'Connecting...' : 'Connect Wallet'}
                            </button>
                        )}

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 text-gray-400 hover:text-white"
                        >
                            {mobileMenuOpen ? (
                                <X className="w-6 h-6" />
                            ) : (
                                <Menu className="w-6 h-6" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <div className="md:hidden py-4 border-t border-gray-800">
                        <div className="flex flex-col gap-2">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    to={link.href}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${location.pathname === link.href
                                        ? 'bg-bg-elevated text-white'
                                        : 'text-gray-400 hover:text-white hover:bg-bg-hover'
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
