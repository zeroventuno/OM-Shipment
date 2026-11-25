import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, X, Truck, Wrench, ShieldCheck, Inbox, Users, Contact, FileBarChart, Nfc, Link2, Palmtree, KeyRound, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { ticketsQuery, ticketAge } from '@/modules/assistance/api';
import { warrantiesQuery, warrantyAge } from '@/modules/warranties/api';
import { listRequests, REQUESTS_QUERY_KEY } from '@/modules/requests/api';
import { listServiceRequests, SERVICE_REQUESTS_QUERY_KEY } from '@/modules/service/api';
import { listPickupRequests, PICKUP_REQUESTS_QUERY_KEY } from '@/modules/pickups/api';
import { nfcCanAdminQuery } from '@/modules/nfc/api';
import { FERIE_KEY, listLeaves } from '@/modules/ferie/api';
import { myAccessQuery } from '@/modules/access/api';
import { isAreaOn, type AreaKey } from '@/modules/access/areas';
import { useState } from 'react';
import { LinksDialog } from './LinksDialog';

export interface Area {
    icon: LucideIcon;
    label: string;
    to: string;
    sub?: { label: string; to: string; end?: boolean; countKey?: string }[];
    /** Fora da barra de baixo do celular (cabem 6): fica só no menu lateral. */
    menuOnly?: boolean;
    /** Só para quem administra os chips NFC (produto à parte do Gestionale). */
    nfcAdminOnly?: boolean;
    /** Só para quem tem acesso a Ferie (painel Accessi). */
    ferieOnly?: boolean;
    /** Só para o administrador do Gestionale. */
    adminOnly?: boolean;
    /** Área que o painel Accessi liga e desliga por login. */
    areaKey?: AreaKey;
}

// As áreas do sistema. Envios tem subpáginas.
export const AREAS: Area[] = [
    {
        icon: Truck,
        label: 'nav.shipments',
        to: '/shipments',
        areaKey: 'spedizioni',
        sub: [
            { label: 'Dashboard', to: '/shipments', end: true },
            { label: 'New Shipment', to: '/shipments/new' },
            { label: 'Reports', to: '/shipments/reports' },
            { label: 'Shipment requests', to: '/shipments/requests', countKey: 'requests' },
            { label: 'pk.nav', to: '/shipments/pickups', countKey: 'pickups' },
            { label: 'imp.nav', to: '/shipments/import-docs' },
        ],
    },
    { icon: Wrench, label: 'nav.assistance', to: '/assistance', areaKey: 'assistenza' },
    { icon: ShieldCheck, label: 'nav.warranties', to: '/warranties', areaKey: 'garanzie' },
    { icon: Inbox, label: 'nav.serviceRequests', to: '/service-requests', areaKey: 'richieste' },
    { icon: Users, label: 'nav.customers', to: '/customers', areaKey: 'clienti' },
    { icon: Contact, label: 'nav.contacts', to: '/contacts', areaKey: 'referenti' },
    { icon: Palmtree, label: 'nav.ferie', to: '/ferie', menuOnly: true, ferieOnly: true },
    { icon: KeyRound, label: 'nav.access', to: '/access', menuOnly: true, adminOnly: true },
    { icon: Nfc, label: 'nav.nfc', to: '/nfc', menuOnly: true, nfcAdminOnly: true },
];

/** Quantos processos estão parados há mais de 30 dias em cada área. */
export function useStaleCounts() {
    const { session } = useAuth();
    const tickets = useQuery({ ...ticketsQuery, enabled: !!session });
    const warranties = useQuery({ ...warrantiesQuery, enabled: !!session });
    // Pedidos de envio aguardando: atualiza a cada 2 minutos.
    const requests = useQuery({ queryKey: REQUESTS_QUERY_KEY, queryFn: listRequests, enabled: !!session, refetchInterval: 120_000 });
    const pendingRequests = (requests.data ?? []).filter((r) => r.status === 'pending').length;
    const service = useQuery({ queryKey: SERVICE_REQUESTS_QUERY_KEY, queryFn: listServiceRequests, enabled: !!session, refetchInterval: 120_000 });
    // Pedidos de retirada de parceiros externos aguardando a equipe.
    const pickups = useQuery({ queryKey: PICKUP_REQUESTS_QUERY_KEY, queryFn: listPickupRequests, enabled: !!session, refetchInterval: 120_000 });
    const pendingPickups = (pickups.data ?? []).filter((r) => r.status === 'new').length;
    // Pedidos de férias esperando resposta.
    const leaves = useQuery({ queryKey: [...FERIE_KEY, 'leaves'], queryFn: listLeaves, enabled: !!session, refetchInterval: 120_000 });
    return {
        '/ferie': (leaves.data ?? []).filter((l) => l.status === 'pending').length,
        '/assistance': (tickets.data ?? []).filter((t) => ticketAge(t).stale).length,
        '/warranties': (warranties.data ?? []).filter((w) => warrantyAge(w).stale).length,
        '/shipments': pendingRequests + pendingPickups,
        '/service-requests': (service.data ?? []).filter((r) => r.status === 'new').length,
        requests: pendingRequests,
        pickups: pendingPickups,
    } as Record<string, number>;
}

interface SidebarProps {
    open?: boolean;
    onClose?: () => void;
}

export function Sidebar({ open = false, onClose = () => { } }: SidebarProps) {
    const { t, i18n } = useTranslation();
    const { user, signOut } = useAuth();
    const { pathname } = useLocation();
    const stale = useStaleCounts();
    const [linksOpen, setLinksOpen] = useState(false);
    const nfcAdmin = useQuery({ ...nfcCanAdminQuery, enabled: !!user }).data === true;
    const access = useQuery({ ...myAccessQuery, enabled: !!user }).data;

    const handleSignOut = async () => {
        if (window.confirm(t('Sign out of the system?'))) {
            await signOut();
        }
    };

    const initial = (user?.email?.[0] || 'U').toUpperCase();

    return (
        <>
            {open && (
                <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-40 w-64 bg-primary text-primary-foreground flex flex-col transition-transform duration-200',
                    'lg:translate-x-0',
                    open ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <div className="px-6 pt-7 pb-6 flex items-start justify-between">
                    <div className="flex flex-col gap-3">
                        <img src="/logo.png" alt="Officine Mattio" className="h-7 w-auto invert" />
                        <div className="flex items-center gap-3">
                            <span className="tricolor h-0.5 w-12" aria-hidden="true" />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">{t('app.title')}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="lg:hidden p-2 -mr-2 text-white/70 hover:text-white" aria-label={t('Close')}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto" aria-label={t('Main menu')}>
                    {AREAS.filter((area) => (!area.nfcAdminOnly || nfcAdmin) && (!area.ferieOnly || (access && access.ferie !== 'none')) && (!area.adminOnly || access?.admin) && (!area.areaKey || isAreaOn(access, area.areaKey))).map((area) => {
                        const inArea = pathname.startsWith(area.to);
                        const count = stale[area.to] ?? 0;
                        return (
                            <div key={area.to}>
                                <NavLink
                                    to={area.to}
                                    onClick={onClose}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-3 rounded-full text-sm transition-colors',
                                        inArea ? 'bg-white text-primary font-semibold' : 'text-white/70 font-medium hover:bg-white/10 hover:text-white'
                                    )}
                                >
                                    <area.icon className="h-[18px] w-[18px]" />
                                    <span className="flex-1">{t(area.label)}</span>
                                    {count > 0 && (
                                        <span
                                            className={cn(
                                                'min-w-6 h-5 px-2 rounded-full text-[11px] font-bold flex items-center justify-center',
                                                area.to === '/shipments' || area.to === '/service-requests' ? (inArea ? 'bg-primary text-primary-foreground' : 'bg-white text-primary') : 'bg-destructive text-destructive-foreground'
                                            )}
                                            title={area.to === '/shipments' ? t('{{count}} shipment requests waiting', { count }) : area.to === '/service-requests' ? t('svc.waiting', { count }) : area.to === '/ferie' ? t('fe.waiting', { count }) : t('{{count}} stalled for more than 30 days', { count })}
                                        >
                                            {count}
                                        </span>
                                    )}
                                </NavLink>
                                {area.sub && inArea && (
                                    <div className="flex flex-col py-1 pl-11">
                                        {area.sub.map((item) => (
                                            <NavLink
                                                key={item.to}
                                                to={item.to}
                                                end={item.end}
                                                onClick={onClose}
                                                className={({ isActive }) =>
                                                    cn('py-2 text-[13px] transition-colors', isActive ? 'text-white font-semibold' : 'text-white/60 hover:text-white')
                                                }
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    {t(item.label)}
                                                    {item.countKey && (stale[item.countKey] ?? 0) > 0 && (
                                                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-white text-primary text-[11px] font-bold flex items-center justify-center">
                                                            {stale[item.countKey]}
                                                        </span>
                                                    )}
                                                </span>
                                            </NavLink>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <div className="p-4 space-y-4">
                    {/* Links dos formulários para copiar e mandar */}
                    <button
                        type="button"
                        onClick={() => setLinksOpen(true)}
                        className="w-full flex items-center justify-center gap-2 h-10 rounded-full border border-white/25 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 hover:text-white hover:border-white"
                    >
                        <Link2 className="h-4 w-4" />
                        {t('links.menu')}
                    </button>
                    {isAreaOn(access, 'report') && <NavLink
                        to="/report"
                        onClick={onClose}
                        className="flex items-center justify-center gap-2 h-10 rounded-full border border-white/25 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 hover:text-white hover:border-white"
                    >
                        <FileBarChart className="h-4 w-4" />
                        {t('rep.menu')}
                    </NavLink>}
                    <div className="flex gap-1.5" role="group" aria-label={t('Language')}>
                        {(['pt', 'it'] as const).map((lng) => (
                            <button
                                key={lng}
                                type="button"
                                onClick={() => i18n.changeLanguage(lng)}
                                aria-pressed={i18n.language === lng}
                                className={cn(
                                    'flex-1 h-9 rounded-full border text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors',
                                    i18n.language === lng ? 'bg-white text-primary border-white' : 'border-white/25 text-white/70 hover:text-white'
                                )}
                            >
                                {lng}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-sm font-bold">
                            {initial}
                        </div>
                        <p className="min-w-0 flex-1 text-[13px] text-white/70 truncate" title={user?.email}>
                            {user?.email || t('User')}
                        </p>
                        <button
                            onClick={handleSignOut}
                            className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title={t('Sign Out')}
                            aria-label={t('Sign Out')}
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </aside>
            <LinksDialog open={linksOpen} onClose={() => setLinksOpen(false)} />
        </>
    );
}
