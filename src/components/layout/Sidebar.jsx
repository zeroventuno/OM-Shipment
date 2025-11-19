import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, FileBarChart, Bike } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTranslation } from 'react-i18next';

// Officine Mattio Shipment System v1.0

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
    { icon: PlusCircle, label: 'New Shipment', to: '/new-shipment' },
    { icon: FileBarChart, label: 'Reports', to: '/reports' },
];

export function Sidebar() {
    const { t, i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    return (
        <aside className="fixed inset-y-0 left-0 z-10 w-64 bg-surface border-r border-gray-200 flex flex-col transition-colors duration-200">
            <div className="h-16 flex items-center px-6 border-b border-gray-200">
                <img src="/logo.png" alt="Officine Mattio" className="h-10 w-auto" />
            </div>

            <nav className="flex-1 px-4 py-6 space-y-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            cn(
                                "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                            )
                        }
                    >
                        <item.icon className="h-5 w-5 mr-3" />
                        {t(item.label)}
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-gray-200 space-y-4">
                {/* Language Toggle */}
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={() => changeLanguage('pt')}
                        className={`text-2xl hover:scale-110 transition-transform ${i18n.language === 'pt' ? 'opacity-100' : 'opacity-50'}`}
                        title="Português"
                    >
                        🇧🇷
                    </button>
                    <div className="h-4 w-[1px] bg-gray-300"></div>
                    <button
                        onClick={() => changeLanguage('it')}
                        className={`text-2xl hover:scale-110 transition-transform ${i18n.language === 'it' ? 'opacity-100' : 'opacity-50'}`}
                        title="Italiano"
                    >
                        🇮🇹
                    </button>
                </div>

                <div className="flex items-center pt-2">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        U
                    </div>
                    <div className="ml-3">
                        <p className="text-sm font-medium text-gray-700">{t('User')}</p>
                        <p className="text-xs text-gray-500">{t('Logistics')}</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
