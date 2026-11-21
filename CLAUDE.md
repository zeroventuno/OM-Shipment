# OM-Service (Gestionale da Officine Mattio)

Sistema único da Officine Mattio: envios, assistência/tickets, garantias, clientes, referentes, documentos de exportação/importação e relatório anual. Vite + React 18 + Tailwind + Supabase.

O usuário é o Cristiano. Ele escreve em português do Brasil e muitas vezes acompanha pelo iPhone (Remote Control). O estado atual e os próximos passos estão em `docs/PASSAGEM.md`.

## Onde fica cada coisa

- Repositório certo: **zeroventuno/OM-Shipment**. O antigo OM-Assist não é mais usado.
- Branch de trabalho: `melhorias`, que gera só prévia: `om-shipment-git-melhorias-zeroventunos-projects.vercel.app`.
- Produção: `main` → projeto Vercel `om-shipment` (https://om-shipment.vercel.app). A CI (lint, tsc, testes, build, audit) roda só na `main`.
- Banco: Supabase "shipping-system" (`alavoontnhooxttuvqky`), numa conta que não está ligada ao conector do Claude. Migrations em `supabase/migrations`, aplicadas com node + `postgres` + `TARGET_DATABASE_URL` do `.env`, sem nunca mostrar o valor.

## Regras combinadas

- **Prévia antes, produção só com OK.** Push na `melhorias`, mostrar a prévia, esperar o "pode publicar", conferir `git rev-list --count HEAD..<remoto>/main` = 0 e só então `git push <remoto> melhorias:main`.
- **Banco:** escrever a migration, testar numa transação com ROLLBACK (simulando usuários com `set_config('request.jwt.claims', ...)`) e aplicar direto. Perguntar antes de alterar ou apagar dados que já existem. Nunca mexer em dados reais para testar e limpar o que for de teste.
- A interface abre em **italiano** (o português é só para o Cristiano). O app se chama "Gestionale"; "OM Service" é o nome só nas apresentações. Nunca dizer "gestionale unico".
- Nunca mostrar chaves nem abrir `.env` para ler. Nunca digitar senhas do usuário.
- Commit só quando ele pedir. Não mexer nos arquivos soltos da raiz que são dele.
- Quando precisar de uma decisão, terminar a mensagem com **uma pergunta clara, escrita**.
- **NFC:** é produto próprio do Cristiano (Ventuno ID, repositório `zeroventuno/ventuno-id`). Aqui o NFC fica só escondido, visível ao login dele (tabela `nfc_admins`), para demonstrar. Não evoluir o NFC neste projeto.

## Comandos

```
npm install
npm run dev        # http://localhost:5173
npx tsc --noEmit -p .
npm run lint
npm test
npm run build
node scripts/audit.mjs
```
