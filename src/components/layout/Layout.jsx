import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { storageService } from '../../services/storage';
import { Activity, Wifi, WifiOff } from 'lucide-react';

export default function Layout() {
    const [connStatus, setConnStatus] = useState({ status: 'checking' });

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
            <Sidebar />
            <main className="pl-64 flex-1">
                <div className="container mx-auto p-8 relative">
                    <Outlet />
                </div>
            </main>
            <footer className="pl-64 py-4 bg-gray-100 border-t border-gray-200">
                <div className="container mx-auto px-8 flex justify-between items-center">
                    <p className="text-sm text-gray-600">
                        Copyright © 2025 Ventuno. Tutti i diritti reservados.
                    </p>

                    <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300">
                        {connStatus.status === 'connected' ? (
                            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" title="Supabase Online">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] uppercase tracking-wider font-bold">Online</span>
                            </div>
                        ) : connStatus.status === 'checking' ? (
                            <div className="flex items-center gap-1.5 text-gray-500 animate-pulse">
                                <Activity className="h-3 w-3" />
                                <span className="text-[10px] uppercase tracking-wider font-bold">Checking...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400" title={connStatus.message || connStatus.reason || "Supabase Offline"}>
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
