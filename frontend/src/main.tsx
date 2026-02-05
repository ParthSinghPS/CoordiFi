import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { Toaster } from 'react-hot-toast';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import App from './App';
import { wagmiConfig } from './lib/wagmi';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 60000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <WagmiProvider config={wagmiConfig}>
                <QueryClientProvider client={queryClient}>
                    <BrowserRouter>
                        <App />
                        <Toaster position="bottom-right" toastOptions={{
                            duration: 4000,
                            style: { background: '#141414', color: '#fff', border: '1px solid #262626' },
                        }} />
                        <ToastContainer
                            position="top-right"
                            autoClose={5000}
                            hideProgressBar={false}
                            newestOnTop
                            closeOnClick
                            rtl={false}
                            pauseOnFocusLoss
                            draggable
                            pauseOnHover
                            theme="dark"
                        />
                    </BrowserRouter>
                </QueryClientProvider>
            </WagmiProvider>
        </ErrorBoundary>
    </React.StrictMode>
);
