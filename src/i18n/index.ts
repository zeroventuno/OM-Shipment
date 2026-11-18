import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { shipmentResources } from '@/modules/shipments/i18n';
import { appResources } from './app';
import { reportResources } from '@/modules/report/i18n';
import { contactsResources } from '@/modules/contacts/i18n';
import { duplicatesResources } from '@/modules/customers/duplicates.i18n';
import { serviceResources } from '@/modules/service/i18n';

const STORAGE_KEY = 'om-language';
const SUPPORTED = ['it', 'pt'] as const;

function savedLanguage(): string {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        if (value && (SUPPORTED as readonly string[]).includes(value)) return value;
    } catch {
        // localStorage indisponível (aba privada etc.): fica no padrão.
    }
    return 'it';
}

i18n
    .use(initReactI18next)
    .init({
        resources: {
            pt: { translation: { ...shipmentResources.pt.translation, ...appResources.pt, ...reportResources.pt, ...contactsResources.pt, ...duplicatesResources.pt, ...serviceResources.pt } },
            it: { translation: { ...shipmentResources.it.translation, ...appResources.it, ...reportResources.it, ...contactsResources.it, ...duplicatesResources.it, ...serviceResources.it } },
        },
        lng: savedLanguage(),
        fallbackLng: 'it',
        interpolation: { escapeValue: false },
    });

// Lembra o idioma escolhido no seletor do menu.
i18n.on('languageChanged', (lng) => {
    try {
        localStorage.setItem(STORAGE_KEY, lng);
    } catch {
        // ignora
    }
    document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
