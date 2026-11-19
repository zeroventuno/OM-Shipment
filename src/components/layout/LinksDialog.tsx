import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { requireSupabase } from '@/lib/supabase';
import { publicOrigin } from '@/modules/nfc/text';

/*
 * Links gerais dos formulários, para copiar e mandar: pedido de envio (interno),
 * retirada e garantia/assistência (externos). Ficam no banco (public_links) e
 * só quem tem login lê.
 */

type Kind = 'request' | 'pickup' | 'service';
const KINDS: { kind: Kind; path: string }[] = [
    { kind: 'request', path: 'spedizione' },
    { kind: 'pickup', path: 'ritiro' },
    { kind: 'service', path: 'assistenza' },
];
const QUERY_KEY = ['public_links'];

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await requireSupabase().rpc(fn, args);
    if (error) throw error;
    return data as T;
}

function LinkRow({ kind, path, token }: { kind: Kind; path: string; token: string | null }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [pasted, setPasted] = useState('');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const url = token ? `${publicOrigin(window.location.origin)}/${path}/${token}` : '';

    const done = () => { setEditing(false); setPasted(''); setError(''); queryClient.invalidateQueries({ queryKey: QUERY_KEY }); };
    const save = useMutation({ mutationFn: () => rpc('staff_save_public_link', { p_kind: kind, p_link: pasted }), onSuccess: done, onError: () => setError(t('links.invalid')) });
    const create = useMutation({ mutationFn: () => rpc('staff_new_public_link', { p_kind: kind }), onSuccess: done, onError: (e: Error) => setError(e.message) });

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt(t(`links.${kind}`), url);
        }
    };

    return (
        <div className="flex flex-col gap-2 py-4 border-t border-border first:border-t-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">{t(`links.${kind}`)}</p>
                <span className="eyebrow shrink-0">{t(kind === 'request' ? 'links.internal' : 'links.external')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{t(`links.${kind}Hint`)}</p>
            {url ? (
                <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded-md bg-secondary px-3 py-2 text-xs" title={url}>{url}</code>
                    <Button type="button" size="sm" onClick={copy} aria-label={`${t('links.copy')} — ${t(`links.${kind}`)}`}>
                        {copied ? <Check /> : <Copy />} {copied ? t('links.copied') : t('links.copy')}
                    </Button>
                </div>
            ) : (
                <p className="text-sm">{t('links.none')}</p>
            )}
            {editing ? (
                <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                    <Input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={`https://…/${path}/…`} aria-label={t('links.paste')} autoFocus />
                    <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm" disabled={!pasted.trim() || save.isPending}>{t('links.save')}</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setError(''); }}>{t('Cancel')}</Button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>{t('links.paste')}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={create.isPending}
                        onClick={() => window.confirm(t('links.newConfirm')) && create.mutate()}>
                        {t('links.new')}
                    </Button>
                </div>
            )}
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
    );
}

export function LinksDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const links = useQuery({ queryKey: QUERY_KEY, queryFn: () => rpc<Record<Kind, string | null>>('staff_public_links'), enabled: open });

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            {/* Coluna minmax(0,1fr): sem ela o link comprido alarga a grade e aparece uma rolagem lateral. */}
            <DialogContent className="max-w-2xl grid-cols-[minmax(0,1fr)]">
                <DialogHeader>
                    <DialogTitle>{t('links.title')}</DialogTitle>
                    <DialogDescription>{t('links.intro')}</DialogDescription>
                </DialogHeader>
                {links.isLoading ? (
                    <p className="py-6 text-center text-muted-foreground">…</p>
                ) : links.isError ? (
                    <p className="text-sm text-destructive">{(links.error as Error).message}</p>
                ) : (
                    <div className="flex flex-col">
                        {KINDS.map(({ kind, path }) => <LinkRow key={kind} kind={kind} path={path} token={links.data?.[kind] ?? null} />)}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
