// GERADO A PARTIR DA LISTA ORIGINAL — ver README.
// O banco guarda o NOME em português (`value`), não o código ISO, para não
// quebrar os registros que já existem. O código serve para exibir o nome no
// idioma do usuário e para unificar grafias diferentes do mesmo país.

// Toda grafia já vista no banco -> código ISO. Inclui variantes duplicadas
// (Cingapura/Singapura, Fiji/Ilhas Fiji, Ilhas Maurício/Maurícia) para que
// registros antigos continuem agrupando junto com os novos.
const LEGACY_TO_CODE = {
    'Alemanha': 'DE',
    'Andorra': 'AD',
    'Angola': 'AO',
    'Argentina': 'AR',
    'Argélia': 'DZ',
    'Armênia': 'AM',
    'Arábia Saudita': 'SA',
    'Austrália': 'AU',
    'Azerbaijão': 'AZ',
    'Bahamas': 'BS',
    'Bangladesh': 'BD',
    'Barbados': 'BB',
    'Barein': 'BH',
    'Belize': 'BZ',
    'Bielorrússia': 'BY',
    'Bolívia': 'BO',
    'Brasil': 'BR',
    'Brunei': 'BN',
    'Bulgária': 'BG',
    'Bélgica': 'BE',
    'Bósnia e Herzegovina': 'BA',
    'Cabo Verde': 'CV',
    'Camarões': 'CM',
    'Camboja': 'KH',
    'Canadá': 'CA',
    'Catar': 'QA',
    'Cazaquistão': 'KZ',
    'Chile': 'CL',
    'China': 'CN',
    'Chipre': 'CY',
    'Cingapura': 'SG',
    'Colômbia': 'CO',
    'Coreia do Norte': 'KP',
    'Coreia do Sul': 'KR',
    'Costa Rica': 'CR',
    'Costa do Marfim': 'CI',
    'Croácia': 'HR',
    'Cuba': 'CU',
    'Dinamarca': 'DK',
    'Dominica': 'DM',
    'Egito': 'EG',
    'El Salvador': 'SV',
    'Emirados Árabes Unidos': 'AE',
    'Equador': 'EC',
    'Eslováquia': 'SK',
    'Eslovênia': 'SI',
    'Espanha': 'ES',
    'Estados Unidos': 'US',
    'Estônia': 'EE',
    'Etiópia': 'ET',
    'Fiji': 'FJ',
    'Filipinas': 'PH',
    'Finlândia': 'FI',
    'França': 'FX',
    'Gabão': 'GA',
    'Gana': 'GH',
    'Geórgia': 'GE',
    'Gibraltar': 'GI',
    'Groenlândia': 'GL',
    'Grécia': 'GR',
    'Guadalupe': 'GP',
    'Guam': 'GU',
    'Guatemala': 'GT',
    'Guiana Francesa': 'GF',
    'Guiana': 'GY',
    'Haiti': 'HT',
    'Holanda': 'NL',
    'Honduras': 'HN',
    'Hong Kong': 'HK',
    'Hungria': 'HU',
    'Ilhas Cayman': 'KY',
    'Ilhas Fiji': 'FJ',
    'Ilhas Maurício': 'MU',
    'Indonésia': 'ID',
    'Iraque': 'IQ',
    'Irlanda': 'IE',
    'Irã': 'IR',
    'Islândia': 'IS',
    'Israel': 'IL',
    'Itália': 'IT',
    'Iêmen': 'YE',
    'Jamaica': 'JM',
    'Japão': 'JP',
    'Jordânia': 'JO',
    'Kosovo': 'XK',
    'Kuwait': 'KW',
    'Laos': 'LA',
    'Letônia': 'LV',
    'Liechtenstein': 'LI',
    'Lituânia': 'LT',
    'Luxemburgo': 'LU',
    'Líbano': 'LB',
    'Líbia': 'LY',
    'Macau': 'MO',
    'Macedônia do Norte': 'MK',
    'Madagascar': 'MG',
    'Malawi': 'MW',
    'Maldivas': 'MV',
    'Mali': 'ML',
    'Malta': 'MT',
    'Malásia': 'MY',
    'Marrocos': 'MA',
    'Martinica': 'MQ',
    'Maurícia': 'MU',
    'Mianmar': 'MM',
    'Mongólia': 'MN',
    'Montenegro': 'ME',
    'Moçambique': 'MZ',
    'México': 'MX',
    'Mônaco': 'MC',
    'Namíbia': 'NA',
    'Nepal': 'NP',
    'Nicarágua': 'NI',
    'Nigéria': 'NG',
    'Noruega': 'NO',
    'Nova Caledônia': 'NC',
    'Nova Zelândia': 'NZ',
    'Omã': 'OM',
    'Panamá': 'PA',
    'Paquistão': 'PK',
    'Paraguai': 'PY',
    'Peru': 'PE',
    'Polinésia Francesa': 'PF',
    'Polônia': 'PL',
    'Porto Rico': 'PR',
    'Portugal': 'PT',
    'Quirguistão': 'KG',
    'Quênia': 'KE',
    'Reino Unido': 'UK',
    'República Checa': 'CZ',
    'República Democrática do Congo': 'CD',
    'República Dominicana': 'DO',
    'Reunião': 'RE',
    'Romênia': 'RO',
    'Ruanda': 'RW',
    'Rússia': 'SU',
    'Samoa': 'WS',
    'San Marino': 'SM',
    'Senegal': 'SN',
    'Seychelles': 'SC',
    'Singapura': 'SG',
    'Sri Lanka': 'LK',
    'Suazilândia': 'SZ',
    'Sudão': 'SD',
    'Suriname': 'SR',
    'Suécia': 'SE',
    'Suíça': 'CH',
    'Sérvia': 'YU',
    'Síria': 'SY',
    'Tailândia': 'TH',
    'Taiwan': 'TW',
    'Tanzânia': 'TZ',
    'Timor-Leste': 'TP',
    'Togo': 'TG',
    'Trinidad e Tobago': 'TT',
    'Tunísia': 'TN',
    'Turcomenistão': 'TM',
    'Turquia': 'TR',
    'Ucrânia': 'UA',
    'Uganda': 'UG',
    'Uruguai': 'UY',
    'Uzbequistão': 'UZ',
    'Vaticano': 'VA',
    'Venezuela': 'VE',
    'Vietnã': 'VN',
    'Zimbábue': 'ZW',
    'Zâmbia': 'ZM',
    'África do Sul': 'ZA',
    'Áustria': 'AT',
    'Índia': 'IN',
};

// Um item por país, já sem duplicatas. `value` é o que vai para o banco.
export const COUNTRIES = [
    { code: 'ZA', value: 'África do Sul' },
    { code: 'DE', value: 'Alemanha' },
    { code: 'AD', value: 'Andorra' },
    { code: 'AO', value: 'Angola' },
    { code: 'SA', value: 'Arábia Saudita' },
    { code: 'DZ', value: 'Argélia' },
    { code: 'AR', value: 'Argentina' },
    { code: 'AM', value: 'Armênia' },
    { code: 'AU', value: 'Austrália' },
    { code: 'AT', value: 'Áustria' },
    { code: 'AZ', value: 'Azerbaijão' },
    { code: 'BS', value: 'Bahamas' },
    { code: 'BD', value: 'Bangladesh' },
    { code: 'BB', value: 'Barbados' },
    { code: 'BH', value: 'Barein' },
    { code: 'BE', value: 'Bélgica' },
    { code: 'BZ', value: 'Belize' },
    { code: 'BY', value: 'Bielorrússia' },
    { code: 'BO', value: 'Bolívia' },
    { code: 'BA', value: 'Bósnia e Herzegovina' },
    { code: 'BR', value: 'Brasil' },
    { code: 'BN', value: 'Brunei' },
    { code: 'BG', value: 'Bulgária' },
    { code: 'CV', value: 'Cabo Verde' },
    { code: 'CM', value: 'Camarões' },
    { code: 'KH', value: 'Camboja' },
    { code: 'CA', value: 'Canadá' },
    { code: 'QA', value: 'Catar' },
    { code: 'KZ', value: 'Cazaquistão' },
    { code: 'CL', value: 'Chile' },
    { code: 'CN', value: 'China' },
    { code: 'CY', value: 'Chipre' },
    { code: 'CO', value: 'Colômbia' },
    { code: 'KP', value: 'Coreia do Norte' },
    { code: 'KR', value: 'Coreia do Sul' },
    { code: 'CI', value: 'Costa do Marfim' },
    { code: 'CR', value: 'Costa Rica' },
    { code: 'HR', value: 'Croácia' },
    { code: 'CU', value: 'Cuba' },
    { code: 'DK', value: 'Dinamarca' },
    { code: 'DM', value: 'Dominica' },
    { code: 'EG', value: 'Egito' },
    { code: 'SV', value: 'El Salvador' },
    { code: 'AE', value: 'Emirados Árabes Unidos' },
    { code: 'EC', value: 'Equador' },
    { code: 'SK', value: 'Eslováquia' },
    { code: 'SI', value: 'Eslovênia' },
    { code: 'ES', value: 'Espanha' },
    { code: 'US', value: 'Estados Unidos' },
    { code: 'EE', value: 'Estônia' },
    { code: 'ET', value: 'Etiópia' },
    { code: 'FJ', value: 'Fiji' },
    { code: 'PH', value: 'Filipinas' },
    { code: 'FI', value: 'Finlândia' },
    { code: 'FX', value: 'França' },
    { code: 'GA', value: 'Gabão' },
    { code: 'GH', value: 'Gana' },
    { code: 'GE', value: 'Geórgia' },
    { code: 'GI', value: 'Gibraltar' },
    { code: 'GR', value: 'Grécia' },
    { code: 'GL', value: 'Groenlândia' },
    { code: 'GP', value: 'Guadalupe' },
    { code: 'GU', value: 'Guam' },
    { code: 'GT', value: 'Guatemala' },
    { code: 'GY', value: 'Guiana' },
    { code: 'GF', value: 'Guiana Francesa' },
    { code: 'HT', value: 'Haiti' },
    { code: 'NL', value: 'Holanda' },
    { code: 'HN', value: 'Honduras' },
    { code: 'HK', value: 'Hong Kong' },
    { code: 'HU', value: 'Hungria' },
    { code: 'YE', value: 'Iêmen' },
    { code: 'KY', value: 'Ilhas Cayman' },
    { code: 'MU', value: 'Ilhas Maurício' },
    { code: 'IN', value: 'Índia' },
    { code: 'ID', value: 'Indonésia' },
    { code: 'IR', value: 'Irã' },
    { code: 'IQ', value: 'Iraque' },
    { code: 'IE', value: 'Irlanda' },
    { code: 'IS', value: 'Islândia' },
    { code: 'IL', value: 'Israel' },
    { code: 'IT', value: 'Itália' },
    { code: 'JM', value: 'Jamaica' },
    { code: 'JP', value: 'Japão' },
    { code: 'JO', value: 'Jordânia' },
    { code: 'XK', value: 'Kosovo' },
    { code: 'KW', value: 'Kuwait' },
    { code: 'LA', value: 'Laos' },
    { code: 'LV', value: 'Letônia' },
    { code: 'LB', value: 'Líbano' },
    { code: 'LY', value: 'Líbia' },
    { code: 'LI', value: 'Liechtenstein' },
    { code: 'LT', value: 'Lituânia' },
    { code: 'LU', value: 'Luxemburgo' },
    { code: 'MO', value: 'Macau' },
    { code: 'MK', value: 'Macedônia do Norte' },
    { code: 'MG', value: 'Madagascar' },
    { code: 'MY', value: 'Malásia' },
    { code: 'MW', value: 'Malawi' },
    { code: 'MV', value: 'Maldivas' },
    { code: 'ML', value: 'Mali' },
    { code: 'MT', value: 'Malta' },
    { code: 'MA', value: 'Marrocos' },
    { code: 'MQ', value: 'Martinica' },
    { code: 'MX', value: 'México' },
    { code: 'MM', value: 'Mianmar' },
    { code: 'MZ', value: 'Moçambique' },
    { code: 'MC', value: 'Mônaco' },
    { code: 'MN', value: 'Mongólia' },
    { code: 'ME', value: 'Montenegro' },
    { code: 'NA', value: 'Namíbia' },
    { code: 'NP', value: 'Nepal' },
    { code: 'NI', value: 'Nicarágua' },
    { code: 'NG', value: 'Nigéria' },
    { code: 'NO', value: 'Noruega' },
    { code: 'NC', value: 'Nova Caledônia' },
    { code: 'NZ', value: 'Nova Zelândia' },
    { code: 'OM', value: 'Omã' },
    { code: 'PA', value: 'Panamá' },
    { code: 'PK', value: 'Paquistão' },
    { code: 'PY', value: 'Paraguai' },
    { code: 'PE', value: 'Peru' },
    { code: 'PF', value: 'Polinésia Francesa' },
    { code: 'PL', value: 'Polônia' },
    { code: 'PR', value: 'Porto Rico' },
    { code: 'PT', value: 'Portugal' },
    { code: 'KE', value: 'Quênia' },
    { code: 'KG', value: 'Quirguistão' },
    { code: 'UK', value: 'Reino Unido' },
    { code: 'CZ', value: 'República Checa' },
    { code: 'CD', value: 'República Democrática do Congo' },
    { code: 'DO', value: 'República Dominicana' },
    { code: 'RE', value: 'Reunião' },
    { code: 'RO', value: 'Romênia' },
    { code: 'RW', value: 'Ruanda' },
    { code: 'SU', value: 'Rússia' },
    { code: 'WS', value: 'Samoa' },
    { code: 'SM', value: 'San Marino' },
    { code: 'SN', value: 'Senegal' },
    { code: 'YU', value: 'Sérvia' },
    { code: 'SC', value: 'Seychelles' },
    { code: 'SG', value: 'Singapura' },
    { code: 'SY', value: 'Síria' },
    { code: 'LK', value: 'Sri Lanka' },
    { code: 'SZ', value: 'Suazilândia' },
    { code: 'SD', value: 'Sudão' },
    { code: 'SE', value: 'Suécia' },
    { code: 'CH', value: 'Suíça' },
    { code: 'SR', value: 'Suriname' },
    { code: 'TH', value: 'Tailândia' },
    { code: 'TW', value: 'Taiwan' },
    { code: 'TZ', value: 'Tanzânia' },
    { code: 'TP', value: 'Timor-Leste' },
    { code: 'TG', value: 'Togo' },
    { code: 'TT', value: 'Trinidad e Tobago' },
    { code: 'TN', value: 'Tunísia' },
    { code: 'TM', value: 'Turcomenistão' },
    { code: 'TR', value: 'Turquia' },
    { code: 'UA', value: 'Ucrânia' },
    { code: 'UG', value: 'Uganda' },
    { code: 'UY', value: 'Uruguai' },
    { code: 'UZ', value: 'Uzbequistão' },
    { code: 'VA', value: 'Vaticano' },
    { code: 'VE', value: 'Venezuela' },
    { code: 'VN', value: 'Vietnã' },
    { code: 'ZM', value: 'Zâmbia' },
    { code: 'ZW', value: 'Zimbábue' },
];

const CODE_TO_LEGACY = Object.entries(LEGACY_TO_CODE).reduce((acc, [name, code]) => {
    (acc[code] ||= []).push(name);
    return acc;
}, {});

const displayNamesCache = new Map();

function displayNames(locale) {
    if (!displayNamesCache.has(locale)) {
        displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
    }
    return displayNamesCache.get(locale);
}

/** Código ISO de um nome gravado no banco, ou null se desconhecido. */
export function countryCode(storedName) {
    if (!storedName) return null;
    return LEGACY_TO_CODE[storedName] ?? null;
}

const CODE_TO_PT = COUNTRIES.reduce((acc, c) => {
    acc[c.code] = c.value;
    return acc;
}, {});

// Casos em que o nome oficial do CLDR não é o que as pessoas procuram.
// 'RAS di Hong Kong' é correto, mas ninguém digita isso num formulário.
const LABEL_OVERRIDES = {
    it: {
        HK: 'Hong Kong',
        MO: 'Macao',
        CD: 'Rep. Dem. del Congo',
    },
};

/**
 * Nome do país no idioma pedido. Aceita código ISO ou o nome gravado no banco.
 * Cai para o próprio valor recebido quando o país não é reconhecido, para nunca
 * apagar da tela um dado que existe.
 *
 * Em português usamos os nomes da lista original, não os do Intl. O padrão CLDR
 * traz a forma oficial — 'Tchéquia', 'Macau, RAE da China', 'Congo - Kinshasa' —
 * e ninguém procura o país por esse nome. Para os outros idiomas o Intl é ótimo.
 */
export function countryLabel(codeOrName, locale = 'pt') {
    const code = codeOrName?.length === 2 ? codeOrName : countryCode(codeOrName);
    if (!code) return codeOrName || '';

    const lang = String(locale).toLowerCase().split('-')[0];

    if (lang === 'pt') return CODE_TO_PT[code] || codeOrName;

    const override = LABEL_OVERRIDES[lang]?.[code];
    if (override) return override;

    try {
        return displayNames(locale).of(code) || CODE_TO_PT[code] || codeOrName;
    } catch {
        return CODE_TO_PT[code] || codeOrName;
    }
}

/**
 * Unifica grafias diferentes do mesmo país num valor só, para agrupar e comparar.
 * 'Cingapura' e 'Singapura' devolvem ambos 'SG'.
 */
export function canonicalCountry(storedName) {
    return countryCode(storedName) ?? (storedName || '').trim().toLowerCase();
}

/**
 * Todas as grafias já usadas para um país. Serve para filtrar no banco sem
 * perder registros antigos: buscar por 'Singapura' também tem que trazer os
 * que foram gravados como 'Cingapura'.
 */
export function countrySpellings(codeOrName) {
    const code = codeOrName?.length === 2 ? codeOrName : countryCode(codeOrName);
    if (!code) return codeOrName ? [codeOrName] : [];
    return CODE_TO_LEGACY[code] ?? [codeOrName];
}
