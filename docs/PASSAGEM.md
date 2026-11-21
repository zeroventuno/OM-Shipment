# Passagem para o Mac (21/11/2026)

O PC com Windows foi desligado. A partir daqui o projeto continua no Mac mini, em `~/Dev/OM-Assistenza`. As regras fixas estão no `CLAUDE.md`.

## Onde parou

- Último trabalho: separar o NFC do Gestionale. Ele virou o Ventuno ID, produto próprio do Cristiano, com repositório `zeroventuno/ventuno-id`.
- No Gestionale o NFC continua no código e no banco, mas só aparece para o login do Cristiano: tabela `nfc_admins` e função `nfc_can_admin()`, e o `nfc_staff()` bloqueia os outros logins. A migration `20261121090000_nfc_admins.sql` **já está aplicada**.
- Já em produção: relação do contato de emergência como lista traduzida e texto melhor quando a página é aberta sem link pessoal.

## Pela metade ou não testado

- O commit **4c45b2f** (NFC só para logins autorizados) está na `melhorias`, em prévia, e **não** foi para a `main`. Falta o OK do Cristiano. Até lá a produção ainda mostra o menu NFC a outros logins, mas o banco já os bloqueia.
- O menu com login não foi testado no navegador, porque precisaria da senha. Foi testado só no banco, com rollback.

## Próximos passos

1. Pedir o OK para publicar o 4c45b2f na `main`.
2. Pendências antigas, quando chegarem os dados:
   - catálogo Gold 2026;
   - correção do HS 62031200 no Mexal;
   - subdomínio próprio;
   - proposta OpenBot;
   - comparação ano a ano no relatório;
   - tabelas de frete das transportadoras para cotar automaticamente;
   - onde começa a numeração IMP;
   - formulário de cadastro para clientes externos;
   - marcação "envio para endereço particular" no ParcelValue.
3. Tarefas do Cristiano: compartilhar os artifacts pelo menu Share e colar os links de pedido e de serviço na janela Link.

## Fora do Git

- `.env`: recriar no Mac a partir do `.env.example`. As variáveis são `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_17TRACK_KEY`, mais `TARGET_DATABASE_URL` para as migrations. Os valores estão nos painéis do Supabase e da Vercel.
- Ficaram no PC, sem ir para o Git, alguns arquivos de trabalho do Cristiano: a foto da entrega em Vila Alpina, `HS-da-verificare.xlsx`, os PDFs IMP da Alpha Velo e `mattio-nfc-proposta.md`.
- Branches antigas que ficaram só no PC: `main` do OM-Assist, `unificacao` e `replit-agent`. Não fazem falta.

## Preparar o Mac

```
git clone https://github.com/zeroventuno/OM-Shipment.git ~/Dev/OM-Assistenza
cd ~/Dev/OM-Assistenza
git remote rename origin shipment
git checkout melhorias
npm install
```

- Node 24.
- `.env` como acima.
- Login da Vercel (CLI ou conector) no time zeroventunos-projects, e git com acesso à conta zeroventuno.

## Links

- Produção: https://om-shipment.vercel.app
- Prévia: https://om-shipment-git-melhorias-zeroventunos-projects.vercel.app
- GitHub: https://github.com/zeroventuno/OM-Shipment
