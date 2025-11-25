import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export default function Layout() {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Sidebar />
            <main className="pl-64 flex-1">
                <div className="container mx-auto p-8">
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
