import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, FileBarChart, LogOut, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';

// Officine Mattio Shipment System v1.0

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/dashboard' },
    { icon: PlusCircle, label: 'New Shipment', to: '/new-shipment' },
    { icon: FileBarChart, label: 'Reports', to: '/reports' },
];

export function Sidebar({ open = false, onClose = () => { } }) {
    const { t, i18n } = useTranslation();
    const { user, signOut } = useAuth();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    const handleSignOut = async () => {
        if (window.confirm(t('Sign out of the system?'))) {
            await signOut();
        }
    };

    const initial = (user?.email?.[0] || 'U').toUpperCase();

    return (
        <>
            {/* Fundo escuro no mobile quando o menu está aberto */}
            {open && (
                <div
                    className="fixed inset-0 z-20 bg-black/40 lg:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-30 w-64 bg-surface border-r border-gray-200 flex flex-col transition-transform duration-200',
                    'lg:translate-x-0',
                    open ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
                    <img src="/logo.png" alt="Officine Mattio" className="h-10 w-auto" />
                    <button
                        onClick={onClose}
                        className="lg:hidden p-1 text-gray-500 hover:text-gray-900"
                        aria-label={t('Close')}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            onClick={onClose}
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

                    <div className="flex items-center gap-3 pt-2">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-700 truncate" title={user?.email}>
                                {user?.email || t('User')}
                            </p>
                            <p className="text-xs text-gray-500">{t('Logistics')}</p>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="p-2 rounded-md text-gray-400 hover:text-error hover:bg-error/10 transition-colors"
                            title={t('Sign Out')}
                            aria-label={t('Sign Out')}
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
