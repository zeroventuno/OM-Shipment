---
padrao: 1
titulo: OM Service
slug: sistemas-officine-mattio
resumo: Envios, assistência e garantias da Officine Mattio num sistema só, com formulários públicos e um chip NFC de emergência.
etiqueta: Cliente · Sistema interno e produto NFC
tipo: cliente
categoria: Sistema interno
ano: 2025-2026
status: no-ar
papel: [Produto, UX/UI, Desenvolvimento]
capa: imagens/00-capa.jpg
estado: rascunho
atualizado: 2026-11-24

cliente: Officine Mattio
mostrar_cliente: true
setor: Bicicletas e componentes de ciclismo
local: Cuneo, Itália
servicos: [Sistema web, Formulários públicos, Documentos de exportação, Produto NFC]
tecnologias: [React 18, TypeScript, Vite 8, Supabase, Tailwind CSS 3, TanStack Query 5, pdf-lib, Web NFC, Vitest 4, Vercel]
ferramentas: [Claude Code]
numeros:
  - valor: "679"
    rotulo: envios registrados em 2026, até 19/11
  - valor: "40.928 €"
    rotulo: economizados escolhendo o orçamento mais barato
  - valor: "5"
    rotulo: idiomas nos formulários públicos
  - valor: "189"
    rotulo: testes automatizados
galeria:
  - arquivo: imagens/01-cartao-de-emergencia.jpg
    legenda: O cartão de emergência que abre ao encostar o celular no chip da peça
  - arquivo: imagens/02-cadastro-do-ciclista.jpg
    legenda: O ciclista escolhe, campo por campo, o que fica visível no cartão
  - arquivo: imagens/03-pedido-de-retirada.jpg
    legenda: Pedido de retirada para lojas de fora, com a Officine Mattio como destino fixo
  - arquivo: imagens/04-pedido-de-envio.jpg
    legenda: Pedido de envio da equipe, com caixas padrão e serviço standard ou express
  - arquivo: imagens/05-conceito-jaqueta-nfc.jpg
    legenda: Conceito gerado com IA, o selo discreto que indica o chip na jaqueta
  - arquivo: imagens/06-conceito-ciclista.jpg
    legenda: Conceito gerado com IA, o cartão de emergência no celular de quem socorre
destaque: true
mostrar_em: [projetos]
---

A Officine Mattio, fabricante de bicicletas em Cuneo, tinha uma aplicação para os envios e outra para assistência e garantias, cada uma com o próprio cadastro de clientes. O OM Service junta as duas num sistema só, usado todos os dias pela equipe, e abre formulários para quem está fora da empresa: lojas, agentes e clientes finais.

O projeto também trouxe um produto que a marca não tinha: um chip NFC na roupa que abre o cartão de emergência do ciclista.

## Problema

Os mesmos clientes estavam cadastrados duas vezes, com dados diferentes. Pedidos de envio, garantia e assistência chegavam por e-mail e WhatsApp e eram copiados à mão. Os documentos de alfândega eram montados um a um.

## Solução

Um arquivo de clientes compartilhado, com envios, assistências e garantias na mesma ficha. A Commercial Invoice e o packing list saem do PDF da fatura, com descrições em inglês e códigos HS do catálogo. Processos parados há mais de 30 dias aparecem no menu.

## Formulários

A equipe e os agentes pedem envios por um link reservado. Lojas de fora pedem retiradas, e clientes finais abrem garantia ou assistência em cinco idiomas, com fotos. Os formulários externos só enviam: não mostram clientes nem endereços. Cada pedido entra numa fila e vira envio ou processo com um clique.

## Produto NFC

Um chip de menos de um euro, costurado na peça. Quem encosta o celular vê nome, tipo sanguíneo e um botão para ligar aos contatos de emergência, sem instalar nada. O ciclista escolhe o que mostrar, e os dados de saúde ficam fora do alcance da própria equipe.

## Status

No ar e em uso diário pela equipe. O NFC está em piloto, testado com chips próprios, e a proposta foi apresentada à direção. O sistema ainda roda num endereço provisório; o subdomínio oficial depende de quem administra o domínio da empresa.

## Destaque: Da fatura ao documento da alfândega

*Documentos de exportação*

A Commercial Invoice é montada a partir do PDF da fatura do sistema contábil: o OM Service lê os artigos, liga cada código ao produto do catálogo e preenche descrição em inglês, código HS e origem. Depois que a FedEx reteve um envio porque uma camisa de manga longa saiu como manga curta, a ferramenta passou a pedir confirmação sempre que reconhece um produto só pelo nome, e avisa quando o HS da fatura diverge do catálogo ou quando falta o gênero que a alfândega americana exige. Cada linha da fatura pode ser trocada por qualquer artigo do catálogo ou por texto livre, e o packing list cita o número do DDT lido do PDF da bolla.
