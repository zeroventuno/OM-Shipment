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
                    <div className="absolute top-8 right-8 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300">
                        {connStatus.status === 'connected' ? (
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                                <Wifi className="h-3 w-3" />
                                <span>Supabase Online</span>
                            </div>
                        ) : connStatus.status === 'checking' ? (
                            <div className="flex items-center gap-2 text-gray-500 border-gray-200 animate-pulse">
                                <Activity className="h-3 w-3" />
                                <span>Checking connection...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800" title={connStatus.message || connStatus.reason}>
                                <WifiOff className="h-3 w-3" />
                                <span>Offline (Local Mode)</span>
                            </div>
                        )}
                    </div>
                    <Outlet />
                </div>
            </main>
            <footer className="pl-64 py-4 bg-gray-100 border-t border-gray-200">
                <div className="container mx-auto px-8">
                    <p className="text-center text-sm text-gray-600">
                        Copyright © 2025 Ventuno. Tutti i diritti riservati.
                    </p>
                </div>
            </footer>
        </div>
    );
}
