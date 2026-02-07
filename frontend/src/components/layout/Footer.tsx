import { ExternalLink, Github, Twitter } from 'lucide-react';
import { LINKS } from '@/utils/constants';

export function Footer() {
    return (
        <footer className="border-t border-gray-800 bg-bg-dark">
            <div className="container-custom py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="md:col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="h-10 w-10 rounded-lg overflow-hidden bg-bg-elevated">
                                <img src="/CoordiFi.png" alt="CoordiFi" className="h-full w-full object-cover object-center scale-150" />
                            </div>
                            <span className="font-semibold text-lg">CoordiFi</span>
                        </div>
                        <p className="text-gray-400 text-sm max-w-md">
                            Trust-minimized coordination between access rights and capital.
                            Built for HackMoney 2026.
                        </p>
                    </div>

                    {/* Resources */}
                    <div>
                        <h4 className="font-semibold text-white mb-4">Resources</h4>
                        <ul className="space-y-2">
                            <li>
                                <a
                                    href={LINKS.BLOCK_EXPLORER}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    Block Explorer
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </li>
                            <li>
                                <a
                                    href={LINKS.CIRCLE_FAUCET}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    USDC Faucet
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://www.alchemy.com/faucets/ethereum-sepolia"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                                >
                                    ETH Faucet
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Sponsors */}
                    <div>
                        <h4 className="font-semibold text-white mb-4">Built With</h4>
                        <ul className="space-y-2 text-sm text-gray-400">
                            <li>Circle (Wallets, USDC, Paymaster)</li>
                            <li>LI.FI (Cross-chain Routing)</li>
                            <li>Uniswap (Price Oracle)</li>
                            <li>Base (L2 Chain)</li>
                        </ul>
                    </div>
                </div>

                {/* Bottom */}
                <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-gray-500">
                        © 2026 CoordiFi. MIT License.
                    </p>
                    <div className="flex items-center gap-4">
                        <a
                            href="#"
                            className="text-gray-400 hover:text-white transition-colors"
                            aria-label="GitHub"
                        >
                            <Github className="w-5 h-5" />
                        </a>
                        <a
                            href="#"
                            className="text-gray-400 hover:text-white transition-colors"
                            aria-label="Twitter"
                        >
                            <Twitter className="w-5 h-5" />
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
