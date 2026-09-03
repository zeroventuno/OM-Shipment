import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { storageService } from '../../services/storage';
import { Activity, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Layout() {
    const { t } = useTranslation();
    const [connStatus, setConnStatus] = useState({ status: 'checking' });
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const checkConnection = async () => {
            const status = await storageService.getConnectionStatus();
            setConnStatus(status);
        };
        checkConnection();
        // Check every 30 seconds
        const interval = setInterval(checkConnection, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Barra superior — só aparece no mobile/tablet */}
            <header className="lg:hidden sticky top-0 z-10 h-14 flex items-center gap-3 px-4 bg-surface border-b border-gray-200">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
                    aria-label={t('Open menu')}
                >
                    <Menu className="h-6 w-6" />
                </button>
                <img src="/logo.png" alt="Officine Mattio" className="h-7 w-auto" />
            </header>

            <main className="lg:pl-64 flex-1">
                <div className="w-full p-4 relative">
                    <Outlet />
                </div>
            </main>

            <footer className="lg:pl-64 py-4 bg-gray-100 border-t border-gray-200">
                <div className="w-full px-4 flex flex-wrap gap-2 justify-between items-center">
                    <p className="text-sm text-gray-600">
                        Copyright © {new Date().getFullYear()} Ventuno. {t('All rights reserved.')}
                    </p>

                    <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300">
                        {connStatus.status === 'connected' ? (
                            <div className="flex items-center gap-1.5 text-green-600" title="Supabase Online">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] uppercase tracking-wider font-bold">Online</span>
                            </div>
                        ) : connStatus.status === 'checking' ? (
                            <div className="flex items-center gap-1.5 text-gray-500 animate-pulse">
                                <Activity className="h-3 w-3" />
                                <span className="text-[10px] uppercase tracking-wider font-bold">Checking...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-red-600" title={connStatus.message || connStatus.reason || "Supabase Offline"}>
                                <div className="h-2 w-2 rounded-full bg-red-500" />
                                <span className="text-[10px] uppercase tracking-wider font-bold">Offline</span>
                            </div>
                        )}
                    </div>
                </div>
            </footer>
        </div>
    );
}
