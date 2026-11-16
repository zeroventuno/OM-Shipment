# OM Gestionale ↔ sistema de ordens de venda — guia para desenhar a integração

> **Para o assistente de IA (Codex, Claude etc.) que receber este arquivo:**
> este documento apresenta o **OM Gestionale** (envios, assistências e garantias
> da Officine Mattio) para você, que conhece o **sistema de ordens de venda**.
> O objetivo **não** é seguir uma receita pronta. O sistema de vendas é o mais
> complexo dos dois, por isso **a decisão é sua**: como os sistemas se
> comunicam, que dados cada lado vê, quem pode alterar o quê, os limites de
> acesso e como ficam sincronizados. O OM Gestionale se adapta à sua proposta.
>
> - As seções 1 a 4 explicam o OM Gestionale e onde os dois sistemas se encontram.
> - A seção 5 lista as perguntas que você precisa responder sobre o sistema de vendas.
> - A seção 6 diz o que devolver: uma **visão do sistema de vendas** (para o
>   OM Gestionale ajustar o fluxo de garantias ao de vocês) e a **proposta de
>   integração**, que do lado do OM Gestionale será implementada a partir dela.
> - O **Anexo** documenta a API que já existe e está no ar (v1). Ela é um
>   ponto de partida, não um limite: pode ser ampliada conforme a proposta.

---

## 1. Os dois sistemas e onde eles se encontram

| | **Sistema de ordens de venda** | **OM Gestionale** |
|---|---|---|
| Quem usa | vendas | logística e pós-venda |
| O que acompanha | a ordem de venda: do pedido do cliente até a conclusão | o que acontece **fisicamente** depois: pedido de envio, cotação, despacho, rastreio; consertos com fabricantes; processos de garantia |
| Pergunta que responde | "o que foi vendido, a quem, por quanto, em que etapa está a ordem?" | "já foi enviado? por qual transportadora? quanto custou? onde está? a garantia está em que fase?" |

Os dois se encontram em **dois lugares**:

1. **Ordem de venda → envio.** Toda ordem que sai fisicamente da fábrica vira
   um envio no OM Gestionale. O sistema de vendas precisa saber se e quando a
   ordem foi enviada, como e onde está. O OM Gestionale precisa dos dados da
   ordem para enviar (cliente, endereço, o que vai, valor).
2. **Garantia → ordem de acompanhamento.** Cada processo de garantia tem um
   protocolo no OM Gestionale (`OMW-26-012`) **e** uma ordem de venda criada
   no sistema de vendas para acompanhá-lo. Os dois registros falam do mesmo
   caso e deveriam ficar sincronizados: andamento, solução, envio, fatura e valor.

Há um terceiro ponto, menor: **clientes**. Os dois sistemas têm cadastro de
clientes (ver 2.3); vale decidir se um deles é a fonte.

Hoje a ligação entre os dois é feita **pelo número da ordem de venda**,
digitado à mão no OM Gestionale. Não há sincronização automática ainda.

---

## 2. O OM Gestionale, área por área

Aplicação web (React + Supabase/Postgres), em italiano e português. Banco
protegido: só usuários logados acessam as tabelas; sistemas externos entram
apenas por funções específicas (ver Anexo).

### 2.1 Pedidos de envio (*Richieste di spedizione*)

Porta de entrada dos envios. Qualquer pessoa da equipe abre um **link de
formulário** (sem login) e pede um envio:

- cliente (escolhido do cadastro ou cadastrado na hora) e **endereço de
  entrega** (um cliente pode ter vários);
- caixas: medidas (cm) e peso (kg), com caixas padrão (bici completa,
  frameset, caixas de uso geral);
- serviço: `standard` ou `express`;
- **número da ordem de venda** (opcional hoje);
- **valor faturado** (€, obrigatório) e **valor para seguro** (€; 0 = sem seguro);
- observações e o nome de quem pediu.

Etapas: `pending` (aguardando) → `shipped` (virou envio) ou `cancelled`.
Na logística, o botão "Criar envio" abre o envio já preenchido com esses dados;
ao salvar, o pedido passa a `shipped` e quem pediu vê transportadora e rastreio
na lista do link.

### 2.2 Envios (*Spedizioni*)

Cada despacho real. Guarda:

- número da ordem (`order_id`) e tipo (`Bicycle`, `Frame Kit`, `Components`,
  `Warranty`, `Clothing/Accessories`, `Gift`, `Rental`, `Other`);
- cliente, país de destino, quantidade, agente comercial;
- **cotações** de vários portais (MBE, MyParcel, DHL, BRT, caminhão/pallet,
  spot) e a escolhida: portal, transportadora, **custo**;
- serviço `standard`/`express`, **código de rastreio**;
- se o cliente retira/paga o frete (aí não há cotação nem custo);
- ligação opcional com uma assistência ou garantia (ver 2.4 e 2.5).

Etapas: `Pending` (criado, ainda não saiu) → `In Transit` (despachado) →
`Delivered` (entregue). A etapa é atualizada pela equipe.

Ao ligar um envio a uma garantia ou assistência, data, transportadora, rastreio
e custo são gravados automaticamente no processo e no histórico dele.

### 2.3 Clientes

Cadastro único usado pelos pedidos de envio: razão social, contato, telefone,
e-mail, código fiscal/partita IVA, endereço principal (faturação) e **vários
endereços de entrega**, um padrão. Cerca de 1.450 clientes, a maior parte
importada das exportações dos portais de envio (MBE). Não há código de cliente
compartilhado com outros sistemas: o cliente é reconhecido pelo nome.

### 2.4 Assistências (*Assistenze*)

Componentes de clientes enviados aos fabricantes para conserto/garantia do
fabricante (freios, câmbios, rodas…): cliente, componente, marca, número de
série, problema, protocolo do fabricante, aprovação (`Approvato`/`Rifiutato`).

Etapas: `Ingresso` (recebido) → `Spedito` (enviado ao fabricante) →
`In lavorazione` → `Completato`. Histórico completo de alterações.

### 2.5 Garantias (*Garanzie*)

Processos de garantia de quadros e bicicletas Officine Mattio. Guarda:

- **protocolo** gerado automaticamente (`OMW-AA-NNN`);
- tipo: `Garantia` (coberto) ou `A pagamento` (pago pelo cliente);
- cliente, agente, modelo, tamanho, número de série (e o novo, se trocar);
- problema, fotos, **solução** (`Pintura`, `Reparação + Pintura`,
  `Substituição`) e fabricante/fornecedor envolvido;
- **número da ordem de venda de acompanhamento**, **fatura** e **valor**;
- envio de retorno (data, transportadora, rastreio, custo).

Etapas: `In attesa` (aguardando) → `In lavorazione` (em andamento) →
`Completato`. Histórico completo; alertas para processos parados há mais de
30 dias.

---

## 3. Pontos de encontro em detalhe

### 3.1 Ordem de venda ↔ pedido de envio ↔ envio

Fluxo hoje:

```
[vendas]  ordem criada → … → pronta para enviar
                                   │  (alguém preenche o formulário à mão)
[OM]                     pedido de envio (pending)
                                   │  logística cota e cria
[OM]                     envio Pending → In Transit → Delivered
                                   │
[vendas]  (não fica sabendo automaticamente)
```

O que poderia passar a fluir:

| Direção | Dado | Para quê |
|---|---|---|
| vendas → OM | ordem "pronta para enviar" com cliente, endereço, itens, valor faturado | criar o **pedido de envio** sozinho, sem digitar de novo |
| vendas → OM | consulta de uma ordem pelo número | preencher/conferir o envio a partir da ordem |
| OM → vendas | pedido recebido / cancelado | a ordem mostra "envio pedido" |
| OM → vendas | envio criado: data, portal/transportadora, serviço, custo, rastreio | a ordem mostra "enviada" com rastreio |
| OM → vendas | mudança de etapa do envio (`In Transit`, `Delivered`) | a ordem avança de etapa sozinha |

### 3.2 Garantia ↔ ordem de acompanhamento

Fluxo hoje: o processo de garantia nasce no OM Gestionale; a ordem de
acompanhamento é criada no sistema de vendas; o número dela é digitado no
campo `order_number` da garantia.

| Direção | Dado | Para quê |
|---|---|---|
| OM → vendas | etapa, tipo, solução, fabricante, envio de retorno | a ordem de acompanhamento reflete o andamento |
| vendas → OM | número da ordem, fatura, valor (sobretudo `A pagamento`) | a garantia fica completa sem digitar |
| os dois | notas | comunicação no histórico do caso |
| a decidir | quem cria o quê | ex.: abrir a garantia no OM cria a ordem no sistema de vendas, ou o contrário |

### 3.3 Clientes

Os dois sistemas têm cadastro. Cabe à proposta decidir se cada um mantém o
seu, se o sistema de vendas passa a ser a fonte (o OM recebe clientes e
endereços dele, com um código de cliente comum) ou se sincronizam nos dois
sentidos.

---

## 4. Tudo o que o OM Gestionale tem e pode ser aberto

A tabela mostra o que **já existe** na API v1 (Anexo). Todo o resto **pode
ser aberto** — para leitura, escrita ou as duas — se a proposta pedir. Os
limites (o que cada lado vê e altera, e para quais usuários) são definidos
pela proposta, não por este documento.

| Dado no OM Gestionale | Já disponível na v1 | Pode ser aberto |
|---|---|---|
| Envios: etapa, cotações, transportadora, rastreio, custo, serviço | leitura | escrita (ex.: atualizar etapa), criação |
| Pedidos de envio | — | leitura, criação, cancelamento |
| Garantias: andamento, tipo, solução, fabricante, envio, histórico | leitura | escrita de qualquer campo, criação |
| Garantias: ordem de venda, fatura, valor | leitura e escrita | — |
| Notas no histórico de garantias e assistências | leitura e acréscimo | — |
| Assistências | leitura | escrita, criação |
| Clientes e endereços de entrega | — | leitura, escrita, criação |
| Fotos das garantias | — | leitura (links temporários), envio de fotos |
| Avisos de mudança (webhooks) | — | o OM avisa o sistema de vendas a cada mudança |

E o inverso — o que o OM Gestionale gostaria de ver no sistema de vendas
(sugestões; a proposta decide o que e como expor):

| Dado | Para quê |
|---|---|
| Ordem pelo número: cliente, endereço de entrega, itens, valor, agente, etapa | preencher pedido de envio e envio |
| Lista de ordens alteradas desde uma data | sincronizar |
| Ordens prontas para enviar | fila de trabalho da logística |
| Ordem de acompanhamento de uma garantia | conferir fatura e valor |

Formas de conexão possíveis (escolher na proposta):

- **Consulta periódica** (a cada 5–15 min, pelo `updated_at`): já suportada
  pelo OM Gestionale; mais simples.
- **Avisos imediatos (webhooks)**: um lado avisa o outro quando algo muda; o
  OM Gestionale pode passar a enviar, se a proposta pedir.
- **MCP**: o OM Gestionale já tem um servidor MCP com as funções v1 (Anexo A.6),
  útil para assistentes de IA consultarem os dois sistemas.

---

## 5. Perguntas sobre o sistema de vendas

Responda (com o dono do sistema) antes de propor:

1. **Etapas da ordem:** quais são, e qual delas significa "pronta para enviar"?
2. **Número da ordem:** formato (ex.: `SO-2026-0456`)? É único e nunca muda?
3. **Uma ordem, vários envios?** Ordens enviadas em partes acontecem? E um
   envio com várias ordens?
4. **Clientes:** tem código de cliente? Guarda endereço de entrega, contato,
   partita IVA? Um cliente pode ter vários endereços?
5. **Valores:** onde ficam o valor faturado e a fatura? O valor do seguro faz
   sentido vir de lá?
6. **Garantias:** como a ordem de acompanhamento é criada hoje, e que campos
   ela tem? Teria um campo para o protocolo `OMW-…`?
7. **Tecnologia:** linguagem, banco, onde roda. Já expõe alguma API? Pode
   chamar APIs externas e receber webhooks?
8. **Quem pode ver o quê:** que perfis de usuário existem no sistema de
   vendas, e quais deles deveriam ver ou alterar dados do OM Gestionale
   (ex.: custo de frete, fotos das garantias)?

---

## 6. O que devolver

Dois documentos em Markdown.

### 6.1 Visão do sistema de vendas

Do mesmo jeito que a seção 2 apresenta o OM Gestionale, apresente o sistema
de vendas para quem não o conhece. O objetivo é que o OM Gestionale possa
**ajustar o próprio fluxo** (sobretudo o das garantias) ao de vocês, e não só
trocar dados.

1. **Visão geral:** para que serve, quem usa, os principais módulos.
2. **Ciclo de vida da ordem de venda:** todas as etapas, quem muda cada uma e
   o que dispara a mudança. Marque onde entram envio, fatura e pagamento.
3. **Garantias, em detalhe:**
   - como a ordem de acompanhamento de uma garantia é criada, por quem e quando;
   - que campos ela tem e que etapas percorre (são as mesmas de uma ordem
     comum ou há um fluxo próprio?);
   - como vocês tratam garantia coberta e garantia paga (`A pagamento`):
     orçamento, aprovação do cliente, fatura;
   - troca de peça ou quadro: como aparece na ordem (itens, número de série novo);
   - em que momento a garantia é considerada encerrada para vocês.
4. **Comparação com o fluxo de garantias do OM Gestionale** (seção 2.5):
   etapas que se correspondem, etapas que faltam de um lado ou de outro, dados
   digitados duas vezes e o que você mudaria no fluxo do OM Gestionale para os
   dois andarem juntos.
5. **Clientes e envios:** como aparecem no sistema de vendas (cadastro,
   endereços, quem decide enviar e quando).

### 6.2 Proposta de integração

1. **Mapa dos pontos de encontro** escolhidos (3.1, 3.2, 3.3) e os campos de
   cada lado que se correspondem.
2. **Quem é o dono de cada dado** e os **limites**: o que cada lado vê e
   altera no outro, e para quais usuários.
3. **Forma de comunicação**, direção e frequência de cada fluxo (consulta
   periódica, webhook, MCP, ação do usuário — o que você julgar melhor).
4. **O que o sistema de vendas vai expor** (endpoints, formato, autenticação).
5. **O que o OM Gestionale precisa acrescentar ou mudar** além da v1 (inclusive
   mudar a v1, se ela não servir).
6. Dúvidas em aberto.

Com esses documentos, o fluxo de garantias do OM Gestionale é ajustado e o lado
do OM Gestionale da integração é implementado do jeito proposto
e a v2 da API é publicada aqui. A rota sugerida na v1 para o sistema de vendas
(`GET /api/om/orders/{order_number}`, Anexo A.5) é só uma sugestão de formato.

---

# Anexo — API v1 (já no ar)

## A.1 Como acessar a API

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

## A.2 Funções de leitura (permissão `read`)

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

Devolve: lista de **Garantia** (A.4.1), sem histórico.

### `partner_get_warranty`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `protocol` | texto, ex.: `"OMW-26-012"` | um dos dois |
| `order_number` | texto (nº da ordem de venda) | um dos dois |

Devolve: **Garantia** com `history` (A.4.4) e `shipments` (lista de **Envio**, A.4.3).

### `partner_list_tickets`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `updated_since` | timestamp ISO | não |
| `max_rows` | inteiro | não |

Devolve: lista de **Assistência** (A.4.2).

### `partner_list_shipments`
| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `updated_since` | timestamp ISO | não |
| `order_id` | texto (nº da ordem / referência) | não |
| `max_rows` | inteiro | não |

Devolve: lista de **Envio** (A.4.3). Para achar o envio de uma ordem de venda,
passe `order_id`.

---

## A.3 Funções de escrita (permissão `write`)

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

## A.4 Formato dos dados

### A.4.1 Garantia
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

### A.4.2 Assistência
```json
{
  "id": "a1b2c3d4-…",
  "code": "OMA-26-045",
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
| `code` | protocolo interno da assistência (`OMA-AA-NNN`), usado como referência nos envios |
| `producer_protocol` | protocolo informado pelo fabricante |

### A.4.3 Envio
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
| Campo | Valores |
|---|---|
| `status` | `"Pending"`, `"In Transit"`, `"Delivered"` |
| `service_level` | `"standard"`, `"express"` |
| `order_type` | `"Bicycle"`, `"Frame Kit"`, `"Components"`, `"Warranty"`, `"Clothing/Accessories"`, `"Gift"`, `"Rental"`, `"Other"` |
| `portal` | `"MBE"`, `"My Parcel"`, `"My DHL"`, `"BRT"`, `"Pallet / Truck"`, `"Spot / Last minute"` |
| `customer_pickup` | `true` quando o cliente retira ou paga o frete; aí não há cotação nem custo |
| `warranty_protocol` / `ticket_id` | preenchidos quando o envio leva uma garantia/assistência |

> Nota: `destination_country` é gravado com o nome do país em português
> (ex.: `"Itália"`, `"Holanda"`), como no resto do sistema.

### A.4.4 Histórico
Lista de alterações, da mais antiga para a mais recente:
```json
{ "date": "2026-04-02T09:15:00.000Z", "action": "updated", "field": "status", "oldValue": "In attesa", "newValue": "In lavorazione" }
```
- `action`: `"created"` ou `"updated"`.
- `field`: nome do campo alterado. Casos especiais:
  - `"shipment"`: envio registrado;
  - `"partnerNote"`: nota de um parceiro.
- Registros antigos podem ter `field` com o rótulo em italiano (ex.: `"Stato"`).

## A.5 Sugestão de formato: consulta de ordem no sistema de vendas

Sugestão feita na v1, mantida como referência. A proposta pode trocar por
outro formato ou outra forma de comunicação.
O OM Gestionale também vai consultar o sistema parceiro, para preencher o
envio a partir da ordem de venda. Uma forma possível de expor a ordem:

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

---

## A.6 Servidor MCP (opcional, para assistentes de IA)

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
que espelham a API HTTP dele.

---

## Versões
- **v1 (16/11/2026):** leitura de garantias, assistências e envios; notas;
  dados administrativos da garantia (Anexo).
- **v2:** a definir a partir da proposta da seção 6.
