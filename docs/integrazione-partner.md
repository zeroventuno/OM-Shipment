# OM Gestionale ↔ sistema degli ordini di vendita — guida per progettare l'integrazione

> **Per l'assistente di IA (Codex, Claude ecc.) che riceve questo file:**
> questo documento presenta l'**OM Gestionale** (spedizioni, assistenze e
> garanzie di Officine Mattio) a te, che conosci il **sistema degli ordini di
> vendita**. L'obiettivo **non** è seguire una ricetta già pronta. Il sistema
> di vendita è il più complesso dei due, per questo **la decisione è tua**:
> come comunicano i sistemi, quali dati vede ciascuno, chi può modificare cosa,
> i limiti di accesso e come restano sincronizzati. L'OM Gestionale si adatta
> alla tua proposta.
>
> - Le sezioni 1–4 spiegano l'OM Gestionale e dove i due sistemi si incontrano.
> - La sezione 5 elenca le domande a cui rispondere sul sistema di vendita.
> - La sezione 6 dice cosa restituire: una **descrizione del sistema di
>   vendita** (perché l'OM Gestionale possa adattare il flusso delle garanzie
>   al vostro) e la **proposta di integrazione**, che lato OM Gestionale verrà
>   implementata a partire da essa.
> - L'**Allegato** documenta l'API che esiste già ed è in produzione (v1). È un
>   punto di partenza, non un limite: può essere ampliata secondo la proposta.

---

## 1. I due sistemi e dove si incontrano

| | **Sistema degli ordini di vendita** | **OM Gestionale** |
|---|---|---|
| Chi lo usa | vendite | logistica e post-vendita |
| Cosa segue | l'ordine di vendita: dalla richiesta del cliente alla chiusura | ciò che succede **fisicamente** dopo: richiesta di spedizione, preventivo, spedizione, tracking; riparazioni con i produttori; pratiche di garanzia |
| Domanda a cui risponde | "cosa è stato venduto, a chi, a quanto, in che fase è l'ordine?" | "è già partito? con quale corriere? quanto è costato? dov'è? la garanzia in che fase è?" |

I due si incontrano in **due punti**:

1. **Ordine di vendita → spedizione.** Ogni ordine che esce fisicamente dalla
   fabbrica diventa una spedizione nell'OM Gestionale. Il sistema di vendita
   deve sapere se e quando l'ordine è partito, come e dove si trova. L'OM
   Gestionale ha bisogno dei dati dell'ordine per spedire (cliente, indirizzo,
   cosa parte, valore).
2. **Garanzia → ordine di accompagnamento.** Ogni pratica di garanzia ha un
   protocollo nell'OM Gestionale (`OMW-26-012`) **e** un ordine di vendita
   creato nel sistema di vendita per seguirla. I due record parlano dello
   stesso caso e dovrebbero restare sincronizzati: avanzamento, soluzione,
   spedizione, fattura e importo.

C'è un terzo punto, minore: i **clienti**. Entrambi i sistemi hanno
un'anagrafica clienti (vedi 2.3); va deciso se uno dei due è la fonte.

Oggi il collegamento tra i due avviene **tramite il numero dell'ordine di
vendita**, digitato a mano nell'OM Gestionale. Non c'è ancora alcuna
sincronizzazione automatica.

---

## 2. L'OM Gestionale, area per area

Applicazione web (React + Supabase/Postgres), in italiano e portoghese.
Database protetto: solo gli utenti autenticati accedono alle tabelle; i
sistemi esterni entrano soltanto tramite funzioni specifiche (vedi Allegato).

### 2.1 Richieste di spedizione

Porta d'ingresso delle spedizioni. Chiunque nel team apre un **link al modulo**
(senza login) e chiede una spedizione:

- cliente (scelto dall'anagrafica o registrato al momento) e **indirizzo di
  consegna** (un cliente può averne diversi);
- scatole: misure (cm) e peso (kg), con scatole standard (bici completa,
  frameset, scatole uso generale);
- servizio: `standard` o `express`;
- **numero dell'ordine di vendita** (oggi facoltativo);
- **valore fatturato** (€, obbligatorio) e **valore da assicurare** (€; 0 =
  senza assicurazione);
- note e il nome di chi ha fatto la richiesta.

Fasi: `pending` (in attesa) → `shipped` (diventata spedizione) o `cancelled`.
In logistica, il pulsante "Crea spedizione" apre la spedizione già compilata
con questi dati; al salvataggio la richiesta passa a `shipped` e chi l'ha fatta
vede corriere e tracking nell'elenco del link.

### 2.2 Spedizioni

Ogni spedizione reale. Contiene:

- numero d'ordine (`order_id`) e tipo (`Bicycle`, `Frame Kit`, `Components`,
  `Warranty`, `Clothing/Accessories`, `Gift`, `Rental`, `Other`);
- cliente, paese di destinazione, quantità, agente commerciale;
- **preventivi** da diversi portali (MBE, MyParcel, DHL, BRT, camion/pallet,
  spot) e quello scelto: portale, corriere, **costo**;
- servizio `standard`/`express`, **codice di tracking**;
- se il cliente ritira/paga il trasporto (in quel caso niente preventivo né costo);
- collegamento facoltativo a un'assistenza o a una garanzia (vedi 2.4 e 2.5).

Fasi: `Pending` (creata, non ancora partita) → `In Transit` (partita) →
`Delivered` (consegnata). La fase viene aggiornata dal team.

Quando una spedizione viene collegata a una garanzia o a un'assistenza, data,
corriere, tracking e costo vengono registrati automaticamente nella pratica e
nel suo storico.

### 2.3 Clienti

Anagrafica unica usata dalle richieste di spedizione: ragione sociale,
referente, telefono, e-mail, codice fiscale/partita IVA, indirizzo principale
(fatturazione) e **più indirizzi di consegna**, uno predefinito. Circa 1.450
clienti, per lo più importati dalle esportazioni dei portali di spedizione
(MBE). Non esiste un codice cliente condiviso con altri sistemi: il cliente
viene riconosciuto dal nome.

### 2.4 Assistenze

Componenti dei clienti inviati ai produttori per riparazione/garanzia del
produttore (freni, cambi, ruote…): cliente, componente, marca, numero di
serie, problema, protocollo del produttore, esito (`Approvato`/`Rifiutato`).

Fasi: `Ingresso` (ricevuto) → `Spedito` (inviato al produttore) →
`In lavorazione` → `Completato`. Storico completo delle modifiche.

### 2.5 Garanzie

Pratiche di garanzia di telai e biciclette Officine Mattio. Contiene:

- **protocollo** generato automaticamente (`OMW-AA-NNN`);
- tipo: `Garantia` (coperta) o `A pagamento` (a carico del cliente);
- cliente, agente, modello, taglia, numero di serie (e quello nuovo, in caso
  di sostituzione);
- problema, foto, **soluzione** (`Pintura` = verniciatura, `Reparação + Pintura`
  = riparazione + verniciatura, `Substituição` = sostituzione) e
  produttore/fornitore coinvolto;
- **numero dell'ordine di vendita di accompagnamento**, **fattura** e **importo**;
- spedizione di ritorno (data, corriere, tracking, costo).

Fasi: `In attesa` → `In lavorazione` → `Completato`. Storico completo; avvisi
per le pratiche ferme da più di 30 giorni.

---

## 3. I punti d'incontro nel dettaglio

### 3.1 Ordine di vendita ↔ richiesta di spedizione ↔ spedizione

Flusso attuale:

```
[vendite] ordine creato → … → pronto da spedire
                                   │  (qualcuno compila il modulo a mano)
[OM]                     richiesta di spedizione (pending)
                                   │  la logistica fa il preventivo e la crea
[OM]                     spedizione Pending → In Transit → Delivered
                                   │
[vendite] (non lo viene a sapere automaticamente)
```

Cosa potrebbe iniziare a passare:

| Direzione | Dato | A cosa serve |
|---|---|---|
| vendite → OM | ordine "pronto da spedire" con cliente, indirizzo, articoli, valore fatturato | creare la **richiesta di spedizione** da sola, senza ridigitare |
| vendite → OM | consultazione di un ordine tramite il numero | compilare/verificare la spedizione partendo dall'ordine |
| OM → vendite | richiesta ricevuta / annullata | l'ordine mostra "spedizione richiesta" |
| OM → vendite | spedizione creata: data, portale/corriere, servizio, costo, tracking | l'ordine mostra "spedito" con tracking |
| OM → vendite | cambio di fase della spedizione (`In Transit`, `Delivered`) | l'ordine avanza di fase da solo |

### 3.2 Garanzia ↔ ordine di accompagnamento

Flusso attuale: la pratica di garanzia nasce nell'OM Gestionale; l'ordine di
accompagnamento viene creato nel sistema di vendita; il suo numero viene
digitato nel campo `order_number` della garanzia.

| Direzione | Dato | A cosa serve |
|---|---|---|
| OM → vendite | fase, tipo, soluzione, produttore, spedizione di ritorno | l'ordine di accompagnamento riflette l'avanzamento |
| vendite → OM | numero d'ordine, fattura, importo (soprattutto `A pagamento`) | la garanzia è completa senza ridigitare |
| entrambi | note | comunicazione nello storico del caso |
| da decidere | chi crea cosa | es.: aprire la garanzia nell'OM crea l'ordine nel sistema di vendita, o viceversa |

### 3.3 Clienti

Entrambi i sistemi hanno un'anagrafica. Spetta alla proposta decidere se
ognuno mantiene la propria, se il sistema di vendita diventa la fonte (l'OM
riceve da lì clienti e indirizzi, con un codice cliente comune) o se si
sincronizzano in entrambe le direzioni.

---

## 4. Tutto ciò che l'OM Gestionale ha e può essere aperto

La tabella mostra cosa **esiste già** nell'API v1 (Allegato). Tutto il resto
**può essere aperto** — in lettura, in scrittura o entrambe — se la proposta lo
richiede. I limiti (cosa vede e modifica ciascuna parte, e per quali utenti)
sono definiti dalla proposta, non da questo documento.

| Dato nell'OM Gestionale | Già disponibile nella v1 | Può essere aperto |
|---|---|---|
| Spedizioni: fase, preventivi, corriere, tracking, costo, servizio | lettura | scrittura (es.: aggiornare la fase), creazione |
| Richieste di spedizione | — | lettura, creazione, annullamento |
| Garanzie: avanzamento, tipo, soluzione, produttore, spedizione, storico | lettura | scrittura di qualsiasi campo, creazione |
| Garanzie: ordine di vendita, fattura, importo | lettura e scrittura | — |
| Note nello storico di garanzie e assistenze | lettura e aggiunta | — |
| Assistenze | lettura | scrittura, creazione |
| Clienti e indirizzi di consegna | — | lettura, scrittura, creazione |
| Foto delle garanzie | — | lettura (link temporanei), invio di foto |
| Avvisi di modifica (webhook) | — | l'OM avvisa il sistema di vendita a ogni modifica |

E viceversa — cosa l'OM Gestionale vorrebbe vedere nel sistema di vendita
(suggerimenti; la proposta decide cosa esporre e come):

| Dato | A cosa serve |
|---|---|
| Ordine tramite il numero: cliente, indirizzo di consegna, articoli, importo, agente, fase | compilare richiesta di spedizione e spedizione |
| Elenco degli ordini modificati da una certa data | sincronizzare |
| Ordini pronti da spedire | coda di lavoro della logistica |
| Ordine di accompagnamento di una garanzia | verificare fattura e importo |

Modalità di collegamento possibili (da scegliere nella proposta):

- **Interrogazione periodica** (ogni 5–15 min, tramite `updated_at`): già
  supportata dall'OM Gestionale; la più semplice.
- **Avvisi immediati (webhook)**: una parte avvisa l'altra quando qualcosa
  cambia; l'OM Gestionale può iniziare a inviarli, se la proposta lo chiede.
- **MCP**: l'OM Gestionale ha già un server MCP con le funzioni v1 (Allegato
  A.6), utile perché gli assistenti di IA consultino entrambi i sistemi.

---

## 5. Domande sul sistema di vendita

Rispondi (con il responsabile del sistema) prima di proporre:

1. **Fasi dell'ordine:** quali sono, e quale significa "pronto da spedire"?
2. **Numero d'ordine:** formato (es.: `SO-2026-0456`)? È univoco e non cambia mai?
3. **Un ordine, più spedizioni?** Capita che un ordine parta in più volte? E
   una spedizione con più ordini?
4. **Clienti:** c'è un codice cliente? Si salvano indirizzo di consegna,
   referente, partita IVA? Un cliente può avere più indirizzi?
5. **Importi:** dove si trovano il valore fatturato e la fattura? Ha senso che
   anche il valore da assicurare arrivi da lì?
6. **Garanzie:** come viene creato oggi l'ordine di accompagnamento, e quali
   campi ha? Potrebbe avere un campo per il protocollo `OMW-…`?
7. **Tecnologia:** linguaggio, database, dove gira. Espone già qualche API?
   Può chiamare API esterne e ricevere webhook?
8. **Chi vede cosa:** quali profili utente esistono nel sistema di vendita, e
   quali dovrebbero vedere o modificare dati dell'OM Gestionale (es.: costo
   di spedizione, foto delle garanzie)?

---

## 6. Cosa restituire

Due documenti in Markdown.

### 6.1 Descrizione del sistema di vendita

Così come la sezione 2 presenta l'OM Gestionale, presenta il sistema di vendita
a chi non lo conosce. L'obiettivo è che l'OM Gestionale possa **adattare il
proprio flusso** (soprattutto quello delle garanzie) al vostro, e non solo
scambiare dati.

1. **Panoramica:** a cosa serve, chi lo usa, i moduli principali.
2. **Ciclo di vita dell'ordine di vendita:** tutte le fasi, chi cambia
   ciascuna e cosa fa scattare il cambio. Indica dove entrano spedizione,
   fattura e pagamento.
3. **Garanzie, nel dettaglio:**
   - come viene creato l'ordine di accompagnamento di una garanzia, da chi e quando;
   - quali campi ha e quali fasi attraversa (sono le stesse di un ordine
     normale o c'è un flusso proprio?);
   - come trattate la garanzia coperta e quella a pagamento (`A pagamento`):
     preventivo, approvazione del cliente, fattura;
   - sostituzione di un componente o del telaio: come appare nell'ordine
     (articoli, nuovo numero di serie);
   - in quale momento per voi la garanzia è considerata chiusa.
4. **Confronto con il flusso delle garanzie dell'OM Gestionale** (sezione 2.5):
   fasi che corrispondono, fasi che mancano da una parte o dall'altra, dati
   digitati due volte e cosa cambieresti nel flusso dell'OM Gestionale perché
   i due procedano insieme.
5. **Clienti e spedizioni:** come compaiono nel sistema di vendita
   (anagrafica, indirizzi, chi decide di spedire e quando).

### 6.2 Proposta di integrazione

1. **Mappa dei punti d'incontro** scelti (3.1, 3.2, 3.3) e i campi
   corrispondenti di ciascuna parte.
2. **Chi è il proprietario di ogni dato** e i **limiti**: cosa vede e modifica
   ciascuna parte nell'altra, e per quali utenti.
3. **Modalità di comunicazione**, direzione e frequenza di ogni flusso
   (interrogazione periodica, webhook, MCP, azione dell'utente — ciò che
   ritieni migliore).
4. **Cosa esporrà il sistema di vendita** (endpoint, formato, autenticazione).
5. **Cosa deve aggiungere o cambiare l'OM Gestionale** oltre alla v1 (anche
   cambiare la v1, se non va bene).
6. Dubbi aperti.

Con questi documenti, il flusso delle garanzie dell'OM Gestionale verrà
adattato, il lato OM Gestionale dell'integrazione verrà implementato come
proposto e la v2 dell'API verrà pubblicata qui. La rotta suggerita nella v1
per il sistema di vendita (`GET /api/om/orders/{order_number}`, Allegato A.5)
è solo un suggerimento di formato.

---

# Allegato — API v1 (già in produzione)

## A.1 Come accedere all'API

L'OM Gestionale gira su **Supabase** (Postgres). L'API per i partner è un
insieme di funzioni chiamate via HTTP:

```
POST https://alavoontnhooxttuvqky.supabase.co/rest/v1/rpc/<nome_funzione>
```

Header obbligatori in **ogni** chiamata:

| Header | Valore |
|---|---|
| `apikey` | la *anon key* del progetto (pubblica, inviata insieme alla chiave del partner) |
| `x-partner-key` | la chiave segreta del partner, inizia con `omp_` |
| `Content-Type` | `application/json` |

Il corpo è un JSON con i parametri della funzione. I parametri facoltativi
possono essere omessi. La risposta è sempre JSON.

**Permessi della chiave** (definiti alla creazione):
- `read`: solo le funzioni di lettura;
- `write`: le funzioni di scrittura (`partner_add_note`, `partner_update_warranty_admin`).

Una chiave può averli entrambi.

**Sicurezza:**
- La chiave del partner è segreta: resta solo sul server del sistema partner,
  in una variabile d'ambiente. Mai nel browser, nell'app o nel repository.
- La chiave può essere revocata e sostituita in qualsiasi momento dall'OM Gestionale.
- L'API non dà accesso diretto alle tabelle. Solo a queste funzioni, e solo
  ai campi elencati qui.

### Esempio (curl)

```bash
curl -X POST "https://alavoontnhooxttuvqky.supabase.co/rest/v1/rpc/partner_get_warranty" \
  -H "apikey: $OM_ANON_KEY" \
  -H "x-partner-key: $OM_PARTNER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"protocol": "OMW-26-012"}'
```

### Esempio (JavaScript/TypeScript)

```ts
async function omRpc<T>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${process.env.OM_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: process.env.OM_ANON_KEY!,
      "x-partner-key": process.env.OM_PARTNER_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${data.message ?? ""}`);
  return data as T;
}
```

### Errori

| HTTP | `code` | Quando |
|---|---|---|
| 403 | `28000` | manca l'header `x-partner-key` o la chiave non è valida/è revocata |
| 401 | `42501` | la chiave non ha il permesso richiesto (es.: scrittura con chiave solo `read`) |
| 400 | `22023` | parametro non valido (il messaggio dice quale) |
| 400 | `P0002` | record non trovato |

Il corpo dell'errore è `{ "code": "...", "message": "...", "details": null, "hint": null }`.

---

## A.2 Funzioni di lettura (permesso `read`)

Tutti gli elenchi sono **ordinati per `updated_at` crescente**. Per
sincronizzare, salva il `updated_at` più alto ricevuto e passalo come
`updated_since` nella chiamata successiva. Ripeti finché l'elenco è vuoto o
più corto di `max_rows`.
- `max_rows`: predefinito 100, massimo 500.
- Date: ISO 8601 con fuso orario (es.: `2026-11-15T17:22:35.439Z`).

### `partner_list_warranties`
| Parametro | Tipo | Obbligatorio |
|---|---|---|
| `updated_since` | timestamp ISO | no |
| `status` | `"In attesa"` \| `"In lavorazione"` \| `"Completato"` | no |
| `max_rows` | intero | no |

Restituisce: elenco di **Garanzia** (A.4.1), senza storico.

### `partner_get_warranty`
| Parametro | Tipo | Obbligatorio |
|---|---|---|
| `protocol` | testo, es.: `"OMW-26-012"` | uno dei due |
| `order_number` | testo (n. dell'ordine di vendita) | uno dei due |

Restituisce: **Garanzia** con `history` (A.4.4) e `shipments` (elenco di **Spedizione**, A.4.3).

### `partner_list_tickets`
| Parametro | Tipo | Obbligatorio |
|---|---|---|
| `updated_since` | timestamp ISO | no |
| `max_rows` | intero | no |

Restituisce: elenco di **Assistenza** (A.4.2).

### `partner_list_shipments`
| Parametro | Tipo | Obbligatorio |
|---|---|---|
| `updated_since` | timestamp ISO | no |
| `order_id` | testo (n. d'ordine / riferimento) | no |
| `max_rows` | intero | no |

Restituisce: elenco di **Spedizione** (A.4.3). Per trovare la spedizione di un
ordine di vendita, passa `order_id`.

---

## A.3 Funzioni di scrittura (permesso `write`)

### `partner_add_note`
Registra una nota nello storico di una garanzia o di un'assistenza. A schermo
appare come `<nome del partner>: <nota>`.

| Parametro | Tipo | Obbligatorio |
|---|---|---|
| `kind` | `"warranty"` \| `"ticket"` | sì |
| `reference` | protocollo della garanzia (o l'`id`) / `id` dell'assistenza | sì |
| `note` | testo, da 1 a 2000 caratteri | sì |

Restituisce: `{ "ok": true }`.

### `partner_update_warranty_admin`
Registra i dati che arrivano dal sistema di vendita. Modifica solo i campi
inviati, e ogni modifica finisce nello storico.

| Parametro | Tipo | Obbligatorio |
|---|---|---|
| `protocol` | testo | sì |
| `order_number` | testo | no |
| `invoice` | testo | no |
| `value` | testo (es.: `"350.00"`) | no |

Restituisce: la **Garanzia** aggiornata.

---

## A.4 Formato dei dati

### A.4.1 Garanzia
```json
{
  "protocol": "OMW-26-012",
  "id": "24e6d77e-108b-4897-bea3-94ef08d2faca",
  "status": "In lavorazione",
  "process_type": "Garantia",
  "start_date": "2026-03-10T00:00:00+00:00",
  "customer_name": "Bike Point",
  "agent": "Michele",
  "bike_model": "Vento RT",
  "size": "54",
  "serial_number": "OM2103310",
  "new_serial_number": null,
  "problem": "…",
  "solution": "Substituição",
  "producer": "Barra",
  "order_number": "SO-2026-0456",
  "invoice": null,
  "value": null,
  "shipping": {
    "date": "2026-04-02T09:15:00+00:00",
    "carrier": "MBE / DHL",
    "tracking_code": "1234567890",
    "cost": 42.5,
    "shipment_id": "13bfd569-7852-4543-9c1d-1d5ceca155c6"
  },
  "created_at": "2026-03-10T08:00:00+00:00",
  "updated_at": "2026-04-02T09:15:01+00:00"
}
```

| Campo | Valori |
|---|---|
| `status` | `"In attesa"`, `"In lavorazione"`, `"Completato"` |
| `process_type` | `"Garantia"` (in garanzia), `"A pagamento"` (a carico del cliente) |
| `solution` | `"Pintura"` (verniciatura), `"Reparação + Pintura"` (riparazione + verniciatura), `"Substituição"` (sostituzione) o `null` |
| `shipping` | `null` finché non c'è una spedizione collegata |

I valori di `status`, `process_type` e `solution` sono codici fissi (in
italiano/portoghese, come li salva il sistema). Tradurli solo a schermo.

### A.4.2 Assistenza
```json
{
  "id": "a1b2c3d4-…",
  "code": "OMA-26-045",
  "phase": "Spedito",
  "approval_status": null,
  "customer_name": "Rossi Cicli",
  "component": "Freno idraulico",
  "brand": "Shimano",
  "serial_number": null,
  "producer_protocol": "6404",
  "problem": "…",
  "shipping": { "date": "…", "carrier": "BRT / BRT", "tracking_code": "…", "cost": 18, "shipment_id": "…" },
  "completion_date": null,
  "created_at": "…",
  "updated_at": "…"
}
```
| Campo | Valori |
|---|---|
| `phase` | `"Ingresso"`, `"Spedito"` (inviato al produttore), `"In lavorazione"`, `"Completato"` |
| `approval_status` | `"Approvato"`, `"Rifiutato"` o `null` |
| `code` | protocollo interno dell'assistenza (`OMA-AA-NNN`), usato come riferimento nelle spedizioni |
| `producer_protocol` | protocollo comunicato dal produttore |

### A.4.3 Spedizione
```json
{
  "id": "13bfd569-7852-4543-9c1d-1d5ceca155c6",
  "order_id": "SO-2026-0456",
  "order_type": "Bicycle",
  "customer_name": "Bike Point",
  "destination_country": "Alemanha",
  "quantity": 1,
  "status": "In Transit",
  "service_level": "express",
  "agent": "Michele",
  "portal": "MBE",
  "carrier": "DHL",
  "cost": 42.5,
  "tracking_code": "1234567890",
  "customer_pickup": false,
  "warranty_protocol": null,
  "ticket_id": null,
  "created_at": "…",
  "updated_at": "…"
}
```
| Campo | Valori |
|---|---|
| `status` | `"Pending"`, `"In Transit"`, `"Delivered"` |
| `service_level` | `"standard"`, `"express"` |
| `order_type` | `"Bicycle"`, `"Frame Kit"`, `"Components"`, `"Warranty"`, `"Clothing/Accessories"`, `"Gift"`, `"Rental"`, `"Other"` |
| `portal` | `"MBE"`, `"My Parcel"`, `"My DHL"`, `"BRT"`, `"Pallet / Truck"`, `"Spot / Last minute"` |
| `customer_pickup` | `true` quando il cliente ritira o paga il trasporto; in quel caso niente preventivo né costo |
| `warranty_protocol` / `ticket_id` | compilati quando la spedizione porta una garanzia/assistenza |

> Nota: `destination_country` è salvato con il nome del paese in portoghese
> (es.: `"Itália"`, `"Holanda"`), come nel resto del sistema.

### A.4.4 Storico
Elenco delle modifiche, dalla più vecchia alla più recente:
```json
{ "date": "2026-04-02T09:15:00.000Z", "action": "updated", "field": "status", "oldValue": "In attesa", "newValue": "In lavorazione" }
```
- `action`: `"created"` o `"updated"`.
- `field`: nome del campo modificato. Casi speciali:
  - `"shipment"`: spedizione registrata;
  - `"partnerNote"`: nota di un partner.
- I record più vecchi possono avere `field` con l'etichetta in italiano (es.: `"Stato"`).

## A.5 Suggerimento di formato: consultazione dell'ordine nel sistema di vendita

Suggerimento fatto nella v1, mantenuto come riferimento. La proposta può
sostituirlo con un altro formato o un'altra modalità di comunicazione.
L'OM Gestionale consulterà anche il sistema partner, per compilare la
spedizione partendo dall'ordine di vendita. Un modo possibile di esporre l'ordine:

```
GET /api/om/orders/{order_number}
Header: x-api-key: <chiave che generate voi e inviate a Officine Mattio>
```
Risposta 200:
```json
{
  "order_number": "SO-2026-0456",
  "status": "<stato dell'ordine nel vostro sistema>",
  "order_type": "Bicycle",
  "customer": {
    "name": "Bike Point",
    "email": "…",
    "phone": "…",
    "shipping_address": {
      "line1": "…", "line2": null, "postal_code": "…", "city": "…",
      "province": null, "country_code": "DE"
    }
  },
  "agent": "Michele",
  "items": [ { "description": "Vento RT 54", "quantity": 1 } ],
  "updated_at": "2026-11-15T17:22:35Z"
}
```

Regole:
- Risposta 404 se l'ordine non esiste; 401 se la chiave è sbagliata.
- `country_code`: ISO 3166-1 alpha-2.
- Date: ISO 8601 in UTC.

E, se possibile, un elenco per la sincronizzazione:
```
GET /api/om/orders?updated_since=<ISO>&limit=100
```
Stessa risposta, in elenco, ordinata per `updated_at` crescente.

---

## A.6 Server MCP (facoltativo, per assistenti di IA)

Il repository dell'OM Gestionale contiene un server MCP in `mcp/server.mjs`,
con le stesse funzioni come strumenti:
- `list_warranties`, `get_warranty`, `list_tickets`, `list_shipments`;
- `add_note`, `update_warranty_admin`.

Per usarlo in un client MCP (Claude Desktop, Codex, Cursor):
```json
{
  "mcpServers": {
    "om-gestionale": {
      "command": "node",
      "args": ["<percorso>/mcp/server.mjs"],
      "env": {
        "OM_SUPABASE_URL": "https://alavoontnhooxttuvqky.supabase.co",
        "OM_ANON_KEY": "<anon key>",
        "OM_PARTNER_KEY": "<chiave omp_…>"
      }
    }
  }
}
```
Prima dell'uso, eseguire `npm install` dentro `mcp/`. Se anche il sistema
partner esporrà un server MCP, l'ideale è che segua la stessa idea: strumenti
che rispecchiano la sua API HTTP.

---

## Versioni
- **v1 (16/11/2026):** lettura di garanzie, assistenze e spedizioni; note;
  dati amministrativi della garanzia (Allegato).
- **v2:** da definire a partire dalla proposta della sezione 6.
