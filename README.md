# OM Shipment — Gestão de Envios

Sistema interno da Officine Mattio para registrar envios, comparar cotações
entre portais de transporte, acompanhar rastreio e gerar relatórios.

- **Produção:** projeto `om-shipment` na Vercel (deploy automático a cada push em `main`)
- **Repositório:** `zeroventuno/OM-Shipment`
- **Banco e autenticação:** Supabase

## Stack

| Camada | Tecnologia |
|---|---|
| Build | Vite 8 (Rolldown) |
| UI | React 18, React Router 7, Tailwind 3 |
| Gráficos | Recharts |
| Planilhas | SheetJS (`xlsx`, build oficial do CDN) |
| Dados / Auth / Storage | Supabase |
| Idiomas | i18next — português e italiano |
| Rastreio | 17TRACK (API + widget) |

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha as variáveis
npm run dev
```

Outros comandos:

```bash
npm run build     # build de produção em dist/
npm run preview   # serve o build local
npm run lint      # ESLint
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | sim | Chave anônima (pública) do Supabase |
| `VITE_17TRACK_KEY` | não | Chave da API do 17TRACK; sem ela o rastreio usa dados simulados |

As mesmas variáveis precisam estar configuradas em
**Vercel → Settings → Environment Variables**.

Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` o app cai para LocalStorage e
**não há login** — use isso apenas para testes locais, nunca em produção.

## Autenticação

Login por e-mail e senha via Supabase Auth. Todas as rotas da aplicação são
protegidas: sem sessão válida o usuário é mandado para `/login`.

**O cadastro público fica desligado.** Novos usuários são criados manualmente:

1. Supabase → **Authentication → Users → Add user**
2. Preencha e-mail e senha e marque *Auto Confirm User*

Para conferir que o cadastro aberto está desligado:
Supabase → **Authentication → Providers → Email** → *Allow new users to sign up* = **off**.

Quem esquecer a senha usa "Esqueceu sua senha?" na tela de login e recebe um
link que leva a `/reset-password`.

> O SMTP padrão do Supabase tem limite baixo de envios por hora. Se a
> recuperação de senha virar rotina, configure um SMTP próprio em
> **Authentication → Emails → SMTP Settings**.

## Banco de dados

Tabela única `shipments` (dados compartilhados: todo usuário autenticado vê e
edita tudo) e o bucket `shipment-photos` no Storage.

As migrations ficam em `supabase/migrations/`, em ordem cronológica. Elas são
aplicadas manualmente pelo **SQL Editor** do Supabase — o projeto não usa a CLI
do Supabase. Ao aplicar uma migration nova, rode o arquivo inteiro e confira o
resultado.

### Segurança (RLS)

A migration `20260903000000_enable_rls.sql` liga o Row Level Security. Sem ela,
qualquer pessoa com a chave anônima — que vai no bundle JavaScript público —
consegue ler e alterar todos os envios.

Para verificar que está ativo:

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'shipments';
-- relrowsecurity precisa ser true
```

## Estrutura

```
src/
  contexts/AuthContext.jsx      sessão do Supabase Auth
  components/
    auth/ProtectedRoute.jsx     bloqueio das rotas privadas
    layout/                     Sidebar (com menu mobile) e Layout
    shipments/PhotoUpload.jsx   upload com conversão HEIC e compressão
    ui/                         Button, Card, Input
  pages/
    Login.jsx, ResetPassword.jsx
    Dashboard.jsx               KPIs e gráficos
    NewShipment.jsx             cadastro e comparação de cotações
    Reports.jsx                 histórico, filtros, Excel e impressão
  services/
    supabaseClient.js
    storage.js                  CRUD e estatísticas
    trackingService.js          17TRACK, com fallback simulado
  i18n.js                       traduções pt/it
supabase/migrations/            SQL aplicado no Supabase
```

## Deploy

Push em `main` dispara o deploy na Vercel. O atalho `./deploy.sh "mensagem"`
faz `add`, `commit` e `push` de uma vez.
