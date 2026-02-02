import { Component, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: { componentStack: string };
}

/**
 * Error Boundary - Catches React errors and shows fallback UI
 * Prevents entire app from crashing on component errors
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
        console.error('[ErrorBoundary] Caught error:', error);
        console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
        this.setState({ errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleReset = () => {
        this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center bg-bg-dark">
                    <div className="text-center max-w-md p-8">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>

                        <h1 className="text-2xl font-bold text-white mb-3">
                            Something went wrong
                        </h1>

                        <p className="text-gray-400 mb-2">
                            {this.state.error?.message || 'An unexpected error occurred'}
                        </p>

                        <p className="text-sm text-gray-500 mb-6">
                            Don't worry, your funds are safe. This is just a UI error.
                        </p>

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={this.handleReload}
                                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
                            >
                                Reload App
                            </button>
                        </div>

                        {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                            <details className="mt-6 text-left">
                                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-400">
                                    Show technical details
                                </summary>
                                <pre className="mt-2 p-3 bg-gray-900 rounded text-xs text-red-400 overflow-auto max-h-40">
                                    {this.state.error?.stack}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
