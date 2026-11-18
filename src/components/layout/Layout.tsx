import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar, AREAS, useStaleCounts } from './Sidebar';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type ConnStatus = { status: 'checking' | 'connected' | 'disconnected' | 'error'; message?: string };

async function checkConnection(): Promise<ConnStatus> {
    if (!supabase) return { status: 'disconnected', message: 'Not configured' };
    try {
        const { error } = await supabase.from('shipments').select('id').limit(1);
        if (error) return { status: 'error', message: error.message };
        return { status: 'connected' };
    } catch (err) {
        return { status: 'error', message: (err as Error).message };
    }
}

/** Barra de navegação de baixo, só no celular. */
function BottomNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const stale = useStaleCounts();
    return (
        <nav
            aria-label={t('Main menu')}
            className="lg:hidden fixed bottom-0 inset-x-0 z-20 grid grid-cols-5 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
        >
            {AREAS.map((area) => {
                const active = pathname.startsWith(area.to);
                const count = stale[area.to] ?? 0;
                return (
                    <NavLink
                        key={area.to}
                        to={area.to}
                        className={cn(
                            'relative min-w-0 flex flex-col items-center gap-1 py-2.5 text-[clamp(8.5px,2.6vw,10px)] uppercase tracking-normal',
                            active ? 'text-foreground font-bold' : 'text-muted-foreground font-semibold'
                        )}
                    >
                        <area.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                        {t(area.label)}
                        {count > 0 && (
                            <span className="absolute top-1.5 left-1/2 ml-2 min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                                {count}
                            </span>
                        )}
                    </NavLink>
                );
            })}
        </nav>
    );
}

export default function Layout() {
    const { t } = useTranslation();
    const [connStatus, setConnStatus] = useState<ConnStatus>({ status: 'checking' });
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const run = async () => setConnStatus(await checkConnection());
        run();
        const interval = setInterval(run, 30000);
        return () => clearInterval(interval);
    }, []);

    const offline = connStatus.status === 'error' || connStatus.status === 'disconnected';

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Barra superior — só no celular/tablet */}
            <header className="lg:hidden sticky top-0 z-20 h-14 flex items-center justify-between px-4 bg-primary text-primary-foreground">
                <img src="/logo.png" alt="Officine Mattio" className="h-5 w-auto invert" />
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="h-10 w-10 -mr-2 flex items-center justify-center rounded-full text-white/80 hover:text-white"
                    aria-label={t('Open menu')}
                >
                    <Menu className="h-6 w-6" />
                </button>
            </header>

            {offline && (
                <div role="alert" className="lg:pl-64 bg-destructive text-destructive-foreground text-sm">
                    <p className="px-6 py-2">{t('No connection to the database.')} <span className="opacity-80">{connStatus.message}</span></p>
                </div>
            )}

            <main className="lg:pl-64 flex-1 pb-20 lg:pb-0">
                <div className="w-full max-w-[1600px] px-4 py-6 md:px-8 lg:px-12 lg:py-10">
                    <Outlet />
                </div>
            </main>

            <footer className="hidden lg:block lg:pl-64">
                <p className="px-12 py-6 text-xs text-muted-foreground">
                    © {new Date().getFullYear()} Officine Mattio · Ventuno
                </p>
            </footer>

            <BottomNav />
        </div>
    );
}
