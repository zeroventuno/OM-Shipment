// Testi del pannello Accessi (acc.*). Il genitore li unisce alle risorse i18n.

const it = {
  "nav.access": "Accessi",
  "acc.eyebrow": "Amministrazione",
  "acc.title": "Accessi",
  "acc.intro": "Chi ha il login vede tutto il Gestionale, tranne le aree riservate. Qui scegli, per ogni login, che accesso ha a Ferie. Vale anche per te: puoi toglierti l'approvazione e restare solo con la visione.",
  "acc.level.none": "Nessuno",
  "acc.level.view": "Solo visione",
  "acc.level.approve": "Approva",
  "acc.levelHint.none": "non vede il menu Ferie",
  "acc.levelHint.view": "vede mappa, richieste, agenda, persone e furgoni, ma non approva né modifica",
  "acc.levelHint.approve": "accesso completo a Ferie: approva, rifiuta, inserisce e modifica",
  "acc.admin": "Amministratore",
  "acc.lastSignIn": "ultimo accesso {{date}}",
  "acc.neverSignedIn": "non è mai entrato",
  "acc.nfc": "I chip NFC restano visibili solo all'amministratore. I link personali delle ferie funzionano senza login e non cambiano.",
  "fe.readOnly": "Solo visione: puoi vedere tutto, ma approvare e modificare spetta a chi ha l'accesso completo.",
  "fe.noAccess": "Non hai accesso alle ferie. Chiedi all'amministratore.",
};

const pt: typeof it = {
  "nav.access": "Acessos",
  "acc.eyebrow": "Administração",
  "acc.title": "Acessos",
  "acc.intro": "Quem tem login vê todo o Gestionale, menos as áreas restritas. Aqui você escolhe, para cada login, o acesso a Férias. Vale também para você: dá para tirar a aprovação de si e ficar só com a visão.",
  "acc.level.none": "Nenhum",
  "acc.level.view": "Só ver",
  "acc.level.approve": "Aprova",
  "acc.levelHint.none": "não vê o menu Férias",
  "acc.levelHint.view": "vê mapa, pedidos, agenda, pessoas e furgões, mas não aprova nem muda nada",
  "acc.levelHint.approve": "acesso total a Férias: aprova, nega, cadastra e edita",
  "acc.admin": "Administrador",
  "acc.lastSignIn": "último acesso {{date}}",
  "acc.neverSignedIn": "nunca entrou",
  "acc.nfc": "Os chips NFC continuam visíveis só para o administrador. Os links pessoais de férias funcionam sem login e não mudam.",
  "fe.readOnly": "Só ver: você vê tudo, mas aprovar e editar fica com quem tem acesso total.",
  "fe.noAccess": "Você não tem acesso às férias. Peça ao administrador.",
};

export const accessResources = { it, pt };
