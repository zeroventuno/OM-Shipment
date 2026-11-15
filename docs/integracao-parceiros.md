# Integração com o OM Gestionale — guia para sistemas parceiros

> **Para o assistente de IA (Codex, Claude etc.) que receber este arquivo:**
> você está ajudando a integrar um sistema da Officine Mattio (o "sistema
> parceiro", que acompanha ordens de venda) com o **OM Gestionale** (envios,
> assistências e garantias). A parte do OM Gestionale **já está pronta e no ar**
> (seções 2 a 5). A seção 6 descreve **o que deve ser construído no sistema
> parceiro**. Siga os nomes de campos, formatos e regras exatamente como estão
> aqui. Na dúvida, pergunte em vez de inventar um campo.

---

## 1. Contexto

A Officine Mattio (fábrica de bicicletas, Itália) tem vários sistemas internos.
Dois deles passam a conversar:

| Sistema | Responsável | O que guarda |
|---|---|---|
| **OM Gestionale** | logística / pós-venda | envios (cotações, transportadora, rastreio, custo), assistências (componentes enviados ao fabricante) e garantias (processos de garantia de quadros/bicicletas) |
| **Sistema parceiro** | vendas | ordens de venda e o andamento delas |

O que a integração resolve:

1. **Garantias:** o sistema de vendas acompanha o andamento das ordens de
   garantia (status, solução, fabricante, envio) e devolve ao OM Gestionale o
   número da ordem de venda, a fatura e o valor.
2. **Envios:** o sistema de vendas sabe quando e como cada ordem foi enviada
   (transportadora, rastreio, custo, standard/express), sem digitar de novo.
3. **Notas:** cada lado pode deixar observações no histórico de uma garantia
   ou assistência.

A ligação entre os dois sistemas é feita pelo **número da ordem de venda**:
- no envio, campo `order_id`;
- na garantia, campo `order_number`.

---

## 2. Como acessar a API

O OM Gestionale roda sobre o **Supabase** (Postgres). A API de parceiros é um
conjunto de funções chamadas por HTTP:

```
POST https://alavoontnhooxttuvqky.supabase.co/rest/v1/rpc/<nome_da_função>
```

Cabeçalhos obrigatórios em **toda** chamada:

| Cabeçalho | Valor |
|---|---|
| `apikey` | a *anon key* do projeto (pública, enviada junto com a chave do parceiro) |
| `x-partner-key` | a chave secreta do parceiro, começa com `omp_` |
| `Content-Type` | `application/json` |

O corpo é um JSON com os parâmetros da função. Os parâmetros opcionais podem
ser omitidos. A resposta é sempre JSON.

**Permissões da chave** (definidas na criação):
- `read`: só as funções de leitura;
- `write`: as funções de escrita (`partner_add_note`, `partner_update_warranty_admin`).

Uma chave pode ter as duas.

**Segurança:**
- A chave do parceiro é secreta: fica só no servidor do sistema parceiro, em
  variável de ambiente. Nunca no navegador, no aplicativo ou no repositório.
- A chave pode ser revogada e trocada a qualquer momento pelo OM Gestionale.
- A API não dá acesso direto às tabelas. Só estas funções, e só aos campos
  listados aqui.

### Exemplo (curl)

```bash
curl -X POST "https://alavoontnhooxttuvqky.supabase.co/rest/v1/rpc/partner_get_warranty" \
  -H "apikey: $OM_ANON_KEY" \
  -H "x-partner-key: $OM_PARTNER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"protocol": "OMW-26-012"}'
```

### Exemplo (JavaScript/TypeScript)

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

### Erros

| HTTP | `code` | Quando |
|---|---|---|
| 403 | `28000` | falta o cabeçalho `x-partner-key` ou a chave é inválida/revogada |
| 401 | `42501` | a chave não tem a permissão pedida (ex.: escrita com chave só `read`) |
| 400 | `22023` | parâmetro inválido (a mensagem diz qual) |
| 400 | `P0002` | registro não encontrado |

O corpo do erro é `{ "code": "...", "message": "...", "details": null, "hint": null }`.

---

## 3. Funções de leitura (permissão `read`)

Todas as listas vêm **ordenadas por `updated_at` crescente**. Para sincronizar,
guarde o maior `updated_at` recebido e passe-o como `updated_since` na próxima
chamada. Repita até a lista vir vazia ou menor que `max_rows`.
- `max_rows`: padrão 100, máximo 500.
- Datas: ISO 8601 com fuso (ex.: `2026-11-15T17:22:35.439Z`).

### `partner_list_warranties`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `updated_since` | timestamp ISO | não |
| `status` | `"In attesa"` \| `"In lavorazione"` \| `"Completato"` | não |
| `max_rows` | inteiro | não |

Devolve: lista de **Garantia** (seção 5.1), sem histórico.

### `partner_get_warranty`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `protocol` | texto, ex.: `"OMW-26-012"` | um dos dois |
| `order_number` | texto (nº da ordem de venda) | um dos dois |

Devolve: **Garantia** com `history` (5.4) e `shipments` (lista de **Envio**, 5.3).

### `partner_list_tickets`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `updated_since` | timestamp ISO | não |
| `max_rows` | inteiro | não |

Devolve: lista de **Assistência** (5.2).

### `partner_list_shipments`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `updated_since` | timestamp ISO | não |
| `order_id` | texto (nº da ordem / referência) | não |
| `max_rows` | inteiro | não |

Devolve: lista de **Envio** (5.3). Para achar o envio de uma ordem de venda,
passe `order_id`.

---

## 4. Funções de escrita (permissão `write`)

### `partner_add_note`
Registra uma nota no histórico de uma garantia ou assistência. Na tela, ela
aparece como `<nome do parceiro>: <nota>`.

| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `kind` | `"warranty"` \| `"ticket"` | sim |
| `reference` | protocolo da garantia (ou o `id`) / `id` da assistência | sim |
| `note` | texto, 1 a 2000 caracteres | sim |

Devolve: `{ "ok": true }`.

### `partner_update_warranty_admin`
Grava os dados que vêm do sistema de vendas. Só altera os campos enviados, e
cada mudança vai para o histórico.

| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `protocol` | texto | sim |
| `order_number` | texto | não |
| `invoice` | texto | não |
| `value` | texto (ex.: `"350.00"`) | não |

Devolve: a **Garantia** atualizada.

---

## 5. Formato dos dados

### 5.1 Garantia
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

| Campo | Valores |
|---|---|
| `status` | `"In attesa"` (aguardando), `"In lavorazione"` (em andamento), `"Completato"` (concluída) |
| `process_type` | `"Garantia"` (em garantia), `"A pagamento"` (pago pelo cliente) |
| `solution` | `"Pintura"`, `"Reparação + Pintura"`, `"Substituição"` ou `null` |
| `shipping` | `null` enquanto não houver envio ligado |

Os valores de `status`, `process_type` e `solution` são códigos fixos (em
italiano/português, como o sistema grava). Traduza só na tela.

### 5.2 Assistência
```json
{
  "id": "a1b2c3d4-…",
  "phase": "Spedito",
  "approval_status": null,
  "customer_name": "Rossi Cicli",
  "component": "Freio hidráulico",
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
| Campo | Valores |
|---|---|
| `phase` | `"Ingresso"` (entrada), `"Spedito"` (enviado ao fabricante), `"In lavorazione"`, `"Completato"` |
| `approval_status` | `"Approvato"`, `"Rifiutato"` ou `null` |
| `producer_protocol` | protocolo informado pelo fabricante |

### 5.3 Envio
```json
{
  "id": "13bfd569-7852-4543-9c1d-1d5ceca155c6",
  "order_id": "SO-2026-0456",
  "order_type": "Bicycle",
  "customer_name": "Bike Point",
  "destination_country": "Germania",
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
| Campo | Valores |
|---|---|
| `status` | `"Pending"`, `"In Transit"`, `"Delivered"` |
| `service_level` | `"standard"`, `"express"` |
| `order_type` | `"Bicycle"`, `"Frame Kit"`, `"Components"`, `"Warranty"`, `"Clothing/Accessories"`, `"Gift"`, `"Rental"`, `"Other"` |
| `portal` | `"MBE"`, `"My Parcel"`, `"My DHL"`, `"BRT"`, `"Pallet / Truck"`, `"Spot / Last minute"` |
| `customer_pickup` | `true` quando o cliente retira ou paga o frete; aí não há cotação nem custo |
| `warranty_protocol` / `ticket_id` | preenchidos quando o envio leva uma garantia/assistência |

### 5.4 Histórico
Lista de alterações, da mais antiga para a mais recente:
```json
{ "date": "2026-04-02T09:15:00.000Z", "action": "updated", "field": "status", "oldValue": "In attesa", "newValue": "In lavorazione" }
```
- `action`: `"created"` ou `"updated"`.
- `field`: nome do campo alterado. Casos especiais:
  - `"shipment"`: envio registrado;
  - `"partnerNote"`: nota de um parceiro.
- Registros antigos podem ter `field` com o rótulo em italiano (ex.: `"Stato"`).

---

## 6. O que construir no sistema parceiro

### 6.1 Configuração
Variáveis de ambiente, **no servidor**:
```
OM_SUPABASE_URL=https://alavoontnhooxttuvqky.supabase.co
OM_ANON_KEY=<enviada pela Officine Mattio>
OM_PARTNER_KEY=<enviada pela Officine Mattio, começa com omp_>
```

### 6.2 Cliente da API
Um módulo com uma função por chamada da seção 3 e 4, usando `omRpc` (seção 2)
ou equivalente na linguagem do sistema.
- Tipar as respostas conforme a seção 5.
- Tratar os erros da tabela da seção 2.
- Tentar de novo só em falha de rede ou HTTP 5xx, com espera crescente.

### 6.3 Sincronização (a cada 5–15 minutos)
1. Chamar `partner_list_shipments` com `updated_since` = última sincronização.
   Para cada envio cujo `order_id` corresponda a uma ordem de venda do sistema
   parceiro, gravar na ordem: data, transportadora (`portal` / `carrier`),
   `tracking_code`, `cost`, `service_level` e `status` do envio.
2. Chamar `partner_list_warranties` da mesma forma. Para cada garantia com
   `order_number` conhecido, atualizar na ordem: o andamento (`status`,
   `solution`, `producer`) e o envio (`shipping`).
3. Guardar o maior `updated_at` recebido de cada lista como a nova "última
   sincronização" (separada para envios e garantias).

### 6.4 Ações do usuário no sistema parceiro
- Ao ligar uma ordem de venda a uma garantia, ou ao emitir a fatura, chamar
  `partner_update_warranty_admin` com `protocol` e o que mudou (`order_number`,
  `invoice`, `value`).
- Botão "Enviar nota ao OM Gestionale" na ordem: chama `partner_add_note`.

### 6.5 API do sistema parceiro (para o OM Gestionale chamar)
O OM Gestionale também vai consultar o sistema parceiro, para preencher o
envio a partir da ordem de venda. Por favor, exponha:

```
GET /api/om/orders/{order_number}
Header: x-api-key: <chave que vocês geram e enviam à Officine Mattio>
```
Resposta 200:
```json
{
  "order_number": "SO-2026-0456",
  "status": "<status da ordem no sistema de vocês>",
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

Regras:
- Resposta 404 se a ordem não existir; 401 se a chave estiver errada.
- `country_code`: ISO 3166-1 alfa-2.
- Datas: ISO 8601 em UTC.

E, se possível, uma lista para sincronização:
```
GET /api/om/orders?updated_since=<ISO>&limit=100
```
Mesma resposta, em lista, ordenada por `updated_at` crescente.

### 6.6 Critérios de aceite
- [ ] Com uma chave válida, `partner_get_warranty` de um protocolo real
      devolve a garantia e é exibida na ordem de venda correspondente.
- [ ] Um envio criado no OM Gestionale com `order_id` igual a uma ordem de
      venda aparece nessa ordem, com rastreio, em até 15 minutos.
- [ ] Ligar uma ordem a uma garantia grava `order_number` no OM Gestionale
      (aparece no histórico da garantia).
- [ ] Uma nota enviada aparece no histórico da garantia como `<nome>: <nota>`.
- [ ] Sem chave, ou com chave errada, as chamadas falham com 403 e o sistema
      mostra o erro sem travar.
- [ ] A chave não aparece em nenhum arquivo versionado nem no navegador.
- [ ] `GET /api/om/orders/{order_number}` responde no formato da seção 6.5.

---

## 7. Servidor MCP (opcional, para assistentes de IA)

O repositório do OM Gestionale tem um servidor MCP em `mcp/server.mjs`, com as
mesmas funções como ferramentas:
- `list_warranties`, `get_warranty`, `list_tickets`, `list_shipments`;
- `add_note`, `update_warranty_admin`.

Para usar num cliente MCP (Claude Desktop, Codex, Cursor):
```json
{
  "mcpServers": {
    "om-gestionale": {
      "command": "node",
      "args": ["<caminho>/mcp/server.mjs"],
      "env": {
        "OM_SUPABASE_URL": "https://alavoontnhooxttuvqky.supabase.co",
        "OM_ANON_KEY": "<anon key>",
        "OM_PARTNER_KEY": "<chave omp_…>"
      }
    }
  }
}
```
Antes de usar, rodar `npm install` dentro de `mcp/`. Se o sistema parceiro
também expuser um servidor MCP, o ideal é que siga a mesma ideia: ferramentas
que espelham a API HTTP da seção 6.5.

---

## 8. Versões
- **v1 (16/11/2026):** leitura de garantias, assistências e envios; notas;
  dados administrativos da garantia.
- Próximas (a combinar):
  - avisos automáticos (webhook) quando um envio ou garantia muda;
  - criação de envio a partir da ordem de venda.
