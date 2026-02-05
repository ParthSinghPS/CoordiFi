import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { useEscrow } from '@/hooks/useEscrow';
import { useFormattedAddress } from '@/hooks/useENS';
import { formatAmount, formatDeadline, CoordinationStatus, LINKS, isDeadlinePassed } from '@/utils/constants';
import { type Coordination } from '@/lib/contracts';

export function CoordinationDetails() {
    const { id } = useParams<{ id: string }>();
    const { fetchCoordination, verifyAccess, settle, refund, isLoading } = useEscrow();

    const [coordination, setCoordination] = useState<Coordination | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const investorDisplay = useFormattedAddress(coordination?.investor);
    const accessHolderDisplay = useFormattedAddress(coordination?.accessHolder);

    useEffect(() => {
        const load = async () => {
            if (!id) return;

            try {
                const coord = await fetchCoordination(BigInt(id));
                setCoordination(coord);
            } catch (err: any) {
                setError(err.message || 'Failed to load coordination');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [id, fetchCoordination]);

    // For demo, generate mock data if not found
    useEffect(() => {
        if (!loading && !coordination && !error) {
            // Mock coordination for demo
            setCoordination({
                id: BigInt(id || 1),
                investor: '0x1234567890123456789012345678901234567890' as `0x${string}`,
                accessHolder: '0x2345678901234567890123456789012345678901' as `0x${string}`,
                amount: BigInt(100 * 10 ** 6),
                accessHash: '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
                status: CoordinationStatus.VERIFIED,
                deadline: BigInt(Math.floor(Date.now() / 1000) + 12 * 60 * 60),
                assetContract: '0x3456789012345678901234567890123456789012' as `0x${string}`,
                assetId: BigInt(42),
                createdAt: BigInt(Math.floor(Date.now() / 1000) - 3600),
            });
        }
    }, [loading, coordination, error, id]);

    const handleVerify = async () => {
        if (!coordination) return;
        const success = await verifyAccess(coordination.id, []);
        if (success) {
            setCoordination({ ...coordination, status: CoordinationStatus.VERIFIED });
        }
    };

    const handleSettle = async () => {
        if (!coordination) return;
        const success = await settle(coordination.id);
        if (success) {
            setCoordination({ ...coordination, status: CoordinationStatus.SETTLED });
        }
    };

    const handleRefund = async () => {
        if (!coordination) return;
        const success = await refund(coordination.id);
        if (success) {
            setCoordination({ ...coordination, status: CoordinationStatus.REFUNDED });
        }
    };

    if (loading) {
        return (
            <div className="container-custom section-padding flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="container-custom section-padding">
                <Card className="text-center py-12">
                    <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-white mb-2">Error Loading Coordination</h2>
                    <p className="text-gray-400 mb-6">{error}</p>
                    <Link to="/">
                        <Button variant="secondary">Go Home</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    if (!coordination) {
        return (
            <div className="container-custom section-padding">
                <Card className="text-center py-12">
                    <h2 className="text-xl font-semibold text-white mb-4">Coordination Not Found</h2>
                    <Link to="/">
                        <Button variant="secondary">Go Home</Button>
                    </Link>
                </Card>
            </div>
        );
    }

    const deadlinePassed = isDeadlinePassed(Number(coordination.deadline));
    const canVerify = coordination.status === CoordinationStatus.LOCKED && !deadlinePassed;
    const canSettle = coordination.status === CoordinationStatus.VERIFIED && !deadlinePassed;
    const canRefund = (coordination.status === CoordinationStatus.LOCKED ||
        coordination.status === CoordinationStatus.VERIFIED) && deadlinePassed;

    return (
        <div className="container-custom section-padding">
            {/* Back Link */}
            <Link
                to="/"
                className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Details */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h1 className="text-2xl font-bold text-white mb-1">
                                    Coordination #{coordination.id.toString()}
                                </h1>
                                <p className="text-gray-400">
                                    Created {new Date(Number(coordination.createdAt) * 1000).toLocaleDateString()}
                                </p>
                            </div>
                            <StatusBadge status={coordination.status} size="md" />
                        </div>

                        {/* Progress Steps */}
                        <div className="flex items-center justify-between mb-8 px-4">
                            <Step
                                number={1}
                                label="Locked"
                                active={coordination.status >= CoordinationStatus.LOCKED}
                                completed={coordination.status > CoordinationStatus.LOCKED || coordination.status === CoordinationStatus.REFUNDED}
                            />
                            <StepConnector active={coordination.status >= CoordinationStatus.VERIFIED} />
                            <Step
                                number={2}
                                label="Verified"
                                active={coordination.status >= CoordinationStatus.VERIFIED}
                                completed={coordination.status > CoordinationStatus.VERIFIED}
                            />
                            <StepConnector active={coordination.status === CoordinationStatus.SETTLED} />
                            <Step
                                number={3}
                                label="Settled"
                                active={coordination.status === CoordinationStatus.SETTLED}
                                completed={coordination.status === CoordinationStatus.SETTLED}
                            />
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Investor" value={investorDisplay} mono />
                            <DetailRow label="Access Holder" value={accessHolderDisplay} mono />
                            <DetailRow label="Amount" value={`${formatAmount(coordination.amount)} USDC`} />
                            <DetailRow
                                label="Deadline"
                                value={formatDeadline(Number(coordination.deadline))}
                                warning={deadlinePassed}
                            />
                            {coordination.assetContract !== '0x0000000000000000000000000000000000000000' && (
                                <>
                                    <DetailRow
                                        label="Asset Contract"
                                        value={`${coordination.assetContract.slice(0, 10)}...`}
                                        mono
                                    />
                                    <DetailRow label="Asset ID" value={`#${coordination.assetId.toString()}`} />
                                </>
                            )}
                        </div>
                    </Card>

                    {/* Actions Card */}
                    <Card>
                        <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>

                        {coordination.status === CoordinationStatus.SETTLED && (
                            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <span className="text-green-400">This coordination has been successfully settled.</span>
                            </div>
                        )}

                        {coordination.status === CoordinationStatus.REFUNDED && (
                            <div className="flex items-center gap-3 p-4 bg-gray-500/10 border border-gray-500/30 rounded-lg">
                                <XCircle className="w-5 h-5 text-gray-400" />
                                <span className="text-gray-400">This coordination has been refunded.</span>
                            </div>
                        )}

                        {(canVerify || canSettle || canRefund) && (
                            <div className="flex flex-wrap gap-3">
                                {canVerify && (
                                    <Button onClick={handleVerify} isLoading={isLoading}>
                                        Verify Access
                                    </Button>
                                )}
                                {canSettle && (
                                    <Button onClick={handleSettle} isLoading={isLoading}>
                                        Settle Now
                                    </Button>
                                )}
                                {canRefund && (
                                    <Button onClick={handleRefund} variant="secondary" isLoading={isLoading}>
                                        Request Refund
                                    </Button>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <h3 className="font-semibold text-white mb-4">Quick Links</h3>
                        <div className="space-y-2">
                            <a
                                href={`${LINKS.BLOCK_EXPLORER}/address/${coordination.investor}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 bg-bg-dark rounded-lg hover:bg-bg-hover transition-colors"
                            >
                                <span className="text-sm text-gray-300">View Investor</span>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                            </a>
                            <a
                                href={`${LINKS.BLOCK_EXPLORER}/address/${coordination.accessHolder}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 bg-bg-dark rounded-lg hover:bg-bg-hover transition-colors"
                            >
                                <span className="text-sm text-gray-300">View Access Holder</span>
                                <ExternalLink className="w-4 h-4 text-gray-400" />
                            </a>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-semibold text-white mb-4">Need Help?</h3>
                        <p className="text-sm text-gray-400 mb-4">
                            If you're having issues with this coordination, check the documentation
                            or reach out to the community.
                        </p>
                        <Button variant="secondary" className="w-full">
                            View Documentation
                        </Button>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// Helper Components
function Step({ number, label, active, completed }: {
    number: number;
    label: string;
    active: boolean;
    completed: boolean;
}) {
    return (
        <div className="flex flex-col items-center">
            <div className={`
        w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
        ${completed ? 'bg-green-500 text-white' :
                    active ? 'bg-primary-500 text-white' :
                        'bg-gray-700 text-gray-400'}
      `}>
                {completed ? '✓' : number}
            </div>
            <span className={`mt-2 text-sm ${active ? 'text-white' : 'text-gray-500'}`}>
                {label}
            </span>
        </div>
    );
}

function StepConnector({ active }: { active: boolean }) {
    return (
        <div className={`flex-1 h-0.5 mx-2 ${active ? 'bg-primary-500' : 'bg-gray-700'}`} />
    );
}

function DetailRow({ label, value, mono, warning }: {
    label: string;
    value: string;
    mono?: boolean;
    warning?: boolean;
}) {
    return (
        <div className="p-3 bg-bg-dark rounded-lg">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`
        ${mono ? 'font-mono' : ''} 
        ${warning ? 'text-amber-400' : 'text-white'}
      `}>
                {value}
            </p>
        </div>
    );
}
