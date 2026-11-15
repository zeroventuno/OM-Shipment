import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, PlusCircle, FileBarChart, LogOut, X, Truck, Wrench, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
    icon: LucideIcon;
    label: string;
    to: string;
    end?: boolean;
}

interface NavSection {
    icon: LucideIcon;
    label: string;
    items: NavItem[];
}

// As três áreas do sistema. Envios tem subpáginas; as outras duas são uma página só.
const sections: NavSection[] = [
    {
        icon: Truck,
        label: 'nav.shipments',
        items: [
            { icon: LayoutDashboard, label: 'Dashboard', to: '/shipments', end: true },
            { icon: PlusCircle, label: 'New Shipment', to: '/shipments/new' },
            { icon: FileBarChart, label: 'Reports', to: '/shipments/reports' },
        ],
    },
    {
        icon: Wrench,
        label: 'nav.assistance',
        items: [{ icon: Wrench, label: 'Assistance tickets', to: '/assistance' }],
    },
    {
        icon: ShieldCheck,
        label: 'nav.warranties',
        items: [{ icon: ShieldCheck, label: 'Warranty processes', to: '/warranties' }],
    },
];

interface SidebarProps {
    open?: boolean;
    onClose?: () => void;
}

export function Sidebar({ open = false, onClose = () => { } }: SidebarProps) {
    const { t, i18n } = useTranslation();
    const { user, signOut } = useAuth();

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
                <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
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
                    <button onClick={onClose} className="lg:hidden p-1 text-gray-500 hover:text-gray-900" aria-label={t('Close')}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-5 overflow-y-auto">
                    {sections.map((section) => (
                        <div key={section.label}>
                            <p className="px-4 mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                                <section.icon className="h-3.5 w-3.5" />
                                {t(section.label)}
                            </p>
                            <div className="space-y-1">
                                {section.items.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={item.end}
                                        onClick={onClose}
                                        className={({ isActive }) =>
                                            cn(
                                                'flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                                                isActive
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                            )
                                        }
                                    >
                                        <item.icon className="h-5 w-5 mr-3" />
                                        {t(item.label)}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-200 space-y-4">
                    <div className="flex items-center justify-center gap-4">
                        <button
                            onClick={() => i18n.changeLanguage('pt')}
                            className={`text-2xl hover:scale-110 transition-transform ${i18n.language === 'pt' ? 'opacity-100' : 'opacity-50'}`}
                            title="Português"
                        >
                            🇧🇷
                        </button>
                        <div className="h-4 w-[1px] bg-gray-300"></div>
                        <button
                            onClick={() => i18n.changeLanguage('it')}
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
