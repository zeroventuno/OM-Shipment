# OM Gestionale — Envios, Assistências e Garantias

Sistema interno da Officine Mattio. Junta num app só (e num banco só) os
antigos **OM-Shipment** (envios) e **OM-Assist** (assistências e garantias).

| Área | Rota | O que faz |
|---|---|---|
| Envios | `/shipments`, `/shipments/new`, `/shipments/reports` | registro de envios, comparação de cotações, rastreio, comprovantes e relatórios |
| Assistências | `/assistance` | tickets de componentes enviados ao fabricante |
| Garantias | `/warranties` | processos de garantia, com fotos e protocolo OMW-AA-NNN |

Os endereços antigos do OM-Shipment (`/dashboard`, `/new-shipment`, `/reports`)
redirecionam para os novos.

## Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite 8 |
| UI | React 18, React Router 7, Tailwind 3, componentes shadcn/Radix |
| Dados / Auth / Storage | Supabase (projeto único, o antigo do OM-Shipment) |
| Formulários | react-hook-form + zod (schema em `src/modules/schema.ts`) |
| Idiomas | i18next — português e italiano, com seletor no menu |
| Envios | Recharts, SheetJS, pdf-lib, 17TRACK |

Não há mais servidor: o navegador fala direto com o Supabase, protegido por
login e Row Level Security.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

```bash
npm run check   # TypeScript
npm run lint    # ESLint (arquivos .js/.jsx)
npm test        # Vitest
npm run build
```

## Estrutura

```
src/
  App.tsx, main.tsx             rotas e providers
  contexts/AuthContext.tsx      sessão do Supabase Auth
  components/
    auth/ProtectedRoute.tsx     bloqueio das rotas privadas
    layout/                     Sidebar (três áreas + idioma) e Layout
    ui/                         componentes shadcn (Assistências e Garantias)
  pages/                        Login e ResetPassword
  lib/supabase.ts               cliente único do Supabase
  i18n/                         configuração e textos do menu/assistências/garantias
  modules/
    shipments/                  módulo de envios (código do OM-Shipment, em JS)
    assistance/                 tickets de assistência
    warranties/                 garantias
    schema.ts                   colunas e validação de tickets/garantias
    records.ts                  conversão banco ↔ app e histórico de alterações
    labels.ts                   valores gravados → textos traduzidos
supabase/migrations/            SQL aplicado no Supabase (SQL Editor)
scripts/migrate-assist-data.mjs cópia única dos dados do OM-Assist
```

O módulo de envios continua em JavaScript, como veio do OM-Shipment; o resto é
TypeScript. A ideia é converter os envios aos poucos, à medida que a tela for
sendo melhorada.

## Banco de dados

Tabelas (todas com RLS: só usuário autenticado; dados compartilhados):

| Tabela | Origem |
|---|---|
| `shipments` | OM-Shipment |
| `tickets` | OM-Assist (assistências) |
| `warranties` | OM-Assist (garantias) |

Buckets no Storage:

| Bucket | Leitura | Conteúdo |
|---|---|---|
| `shipment-photos` | pública | fotos do envio |
| `shipment-pods` | **só autenticado** | comprovantes de entrega |
| `warranty-images` | pública | fotos das garantias |

As migrations ficam em `supabase/migrations/`, em ordem cronológica, e são
aplicadas à mão pelo **SQL Editor** do Supabase.

O número de protocolo das garantias é gerado pelo banco
(`set_warranty_protocol`), continuando a partir do maior número já usado.

## Migração dos dados do OM-Assist (uma vez só)

1. Aplique `supabase/migrations/20261115000000_add_assistance_and_warranties.sql`
   no projeto do OM-Shipment.
2. Preencha no `.env` as variáveis da seção "cópia única" do `.env.example`
   (conexão do banco antigo, URL e chave `service_role` do projeto novo).
3. `npm run migrate:assist` — simulação: mostra quantos registros e fotos
   seriam copiados, sem gravar nada.
4. `npm run migrate:assist -- --apply` — copia de verdade (registros numa
   transação; fotos para o bucket novo, com as URLs atualizadas).
5. Apague do `.env` a `TARGET_SUPABASE_SERVICE_ROLE_KEY`.

## Autenticação

Login por e-mail e senha via Supabase Auth; todas as rotas são protegidas. O
cadastro público fica desligado — usuários são criados em
**Supabase → Authentication → Users → Add user** (marque *Auto Confirm User*).
"Esqueceu sua senha?" envia um link que leva a `/reset-password`.

## Comprovante de entrega (POD)

O comprovante assinado é anexado à mão (baixado do portal da transportadora):
até 3 arquivos por envio, PDF ou imagem, 10 MB cada. Nos Relatórios, o botão
**Comprovante de entrega** gera um PDF único para arquivamento físico.

## API de parceiros e MCP

Outros sistemas da Officine Mattio (ex.: o de ordens de venda) podem ler
garantias, assistências e envios, e gravar notas e dados administrativos, por
funções do Supabase protegidas por chave. Tudo está descrito em
[docs/integracao-parceiros.md](docs/integracao-parceiros.md), escrito para ser
entregue ao parceiro (ou ao assistente de IA dele).

- Migration: `supabase/migrations/20261116010000_partner_api.sql`
- Chaves: `npm run partner-key -- create "<nome>" read,write` · `list` · `revoke <id>`
- Servidor MCP (as mesmas funções como ferramentas de IA): `mcp/server.mjs`

## Pedidos de envio (formulário aberto)

A equipe da oficina pede envios por um link sem login (`/pedido/<token>`):
escolhe ou cadastra o cliente, informa as caixas (medidas e peso) e o serviço.
Quem tem o link vê só o formulário e os pedidos feitos com ele. Os pedidos
chegam em **Envios → Pedidos de envio**, de onde "Criar envio" abre o envio já
preenchido; salvar o envio marca o pedido como enviado e a equipe vê o rastreio.

- Migration: `supabase/migrations/20261116020000_customers_and_requests.sql`
  (também cria o cadastro de clientes, começando com os nomes dos envios)
- Links: `npm run request-link -- create "<nome>"` · `list` · `disable <id>`
