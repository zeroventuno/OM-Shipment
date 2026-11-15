import { useTranslation } from 'react-i18next';
import { it, ptBR } from 'date-fns/locale';

/** Locale do date-fns que acompanha o idioma escolhido. */
export function useDateLocale() {
    const { i18n } = useTranslation();
    return i18n.language === 'pt' ? ptBR : it;
}
