import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/*
 * Legenda dos códigos que o Gestionale cria (menu lateral › Legenda).
 * Para acrescentar um código: uma linha em CODES e os textos legend.<code>.* em links.i18n.ts.
 */

const CODES = ['omw', 'oma', 'omr', 'omp', 'ome', 'imp'] as const;
const PREFIX: Record<(typeof CODES)[number], string> = { omw: 'OMW', oma: 'OMA', omr: 'OMR', omp: 'OMP', ome: 'OME', imp: 'IMP' };
const EXAMPLE: Record<(typeof CODES)[number], string> = { omw: 'OMW-26-014', oma: 'OMA-26-031', omr: 'OMR-26-007', omp: 'OMP-26-001', ome: 'OME-26-001', imp: 'IMP-003' };

export function LegendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('legend.title')}</DialogTitle>
                    <DialogDescription>{t('legend.intro')}</DialogDescription>
                </DialogHeader>
                <ul className="flex flex-col divide-y divide-border">
                    {CODES.map((c) => (
                        <li key={c} className="flex gap-4 py-3">
                            <span className="shrink-0 w-14 h-7 rounded-full bg-primary text-primary-foreground text-[11px] font-bold tracking-[0.08em] flex items-center justify-center">{PREFIX[c]}</span>
                            <div className="min-w-0 text-sm">
                                <p className="font-semibold">{t(`legend.${c}.name`)}</p>
                                <p className="text-muted-foreground">{t(`legend.${c}.what`)}</p>
                                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{EXAMPLE[c]}</p>
                            </div>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t('legend.format')}</p>
            </DialogContent>
        </Dialog>
    );
}
