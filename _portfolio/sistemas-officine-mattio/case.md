## Ponto de partida

A Officine Mattio é uma fabricante de bicicletas e componentes de Cuneo, na Itália. Até 2025 o pós-venda e a logística usavam duas aplicações separadas: uma para os envios (OM-Shipment) e outra para assistência e garantias. Os mesmos clientes existiam nas duas, com grafias e endereços diferentes, e os pedidos chegavam por e-mail e mensagem para serem copiados à mão.

## Um sistema só

As duas aplicações viraram uma, num repositório e num banco de dados únicos (Supabase, Postgres na Europa):

- Envios: cotação entre portais e transportadoras, rastreio, comprovante de entrega, retiradas, Commercial Invoice e proforma de importação.
- Assistência e garantias: processos com etapas, fotos, prazos e aviso no menu quando algo fica parado mais de 30 dias.
- Clientes: ficha única com envios, assistências, garantias e contatos. Cadastros duplicados são encontrados por CNPJ/P.IVA, e-mail, telefone ou nome e unidos, e os nomes antigos continuam como apelidos para o histórico não se perder.
- Relatório anual: custo de transporte, economia nos orçamentos, transportadoras, destinos e clientes, pronto para imprimir.

A interface é em italiano, com português como opção, e funciona no celular, com uma barra de navegação própria.

## Formulários para quem está fora

Cada formulário tem um papel e um nível de acesso:

| Formulário | Para quem | O que vê |
|---|---|---|
| Pedido de envio | Equipe e agentes | Lista de clientes e endereços, para escolher o destinatário |
| Pedido de retirada | Lojas e parceiros externos | Nada do sistema; só envia, com a Officine Mattio como destino fixo |
| Garantia e assistência | Clientes finais | Nada do sistema; só envia, com fotos e comprovante, em 5 idiomas |

Os formulários externos falam apenas com funções do banco que recebem dados e devolvem um código de referência. Têm limite de pedidos por hora, campo invisível contra robôs e links que podem ser desativados. Na equipe, um botão "Link" no menu copia o link certo de cada formulário.

## Documentos de exportação

A Commercial Invoice sai do PDF da fatura emitida no sistema contábil. O OM Service extrai os artigos, liga cada código ao produto do catálogo e preenche descrição em inglês, código HS e origem, com a declaração de origem para o Reino Unido quando é o caso.

Em novembro de 2026 a FedEx reteve um envio para os Estados Unidos: a ferramenta tinha trocado uma camisa de manga longa por uma de manga curta, reconhecendo só a palavra "jersey". A correção:

- "ML" e "MC" passaram a ser lidos como manga longa e manga curta, e um nunca substitui o outro;
- produto reconhecido só pelo nome vira sugestão, e o documento só é gerado depois que alguém confirma;
- a tela avisa quando o HS da fatura diverge do catálogo e quando falta o gênero (men's, women's, unisex) que a alfândega americana pede para roupa.

## O produto NFC

Uma proposta de produto de baixo custo e alto valor para a marca: um chip NFC costurado ou termocolado na roupa. O chip guarda só um link; todo o conteúdo fica no sistema e pode mudar sem regravar o chip.

- Quem encosta o celular (iPhone ou Android, sem app) abre o cartão de emergência: nome, tipo sanguíneo em destaque, botões para ligar aos contatos, alergias e remédios se o ciclista quiser mostrar.
- O ciclista registra a peça e escolhe, campo por campo, o que fica visível. Recebe um link pessoal para editar, bloquear a peça perdida ou apagar tudo.
- A equipe gera os códigos, grava os chips pelo Chrome no Android (Web NFC) e vê só nome e e-mail do dono, nunca os dados de saúde.
- A página do chip é separada do resto do sistema e carrega com poucos kilobytes de script, para abrir rápido com sinal fraco.
- Cinco idiomas, escolhidos pelo idioma do celular de quem lê.

Custo estimado: etiquetas NFC laváveis de 0,40 a 0,80 € por peça em lotes de 1.000, preço de catálogo de fornecedores. O mesmo chip pode servir ao passaporte digital de produto que o regulamento europeu ESPR vai exigir para o têxtil.

## Decisões técnicas

- Tabelas com dado sensível ficam fechadas: tudo passa por funções do banco com permissões explícitas, e o que é público só recebe ou devolve o mínimo.
- Migrations testadas dentro de uma transação desfeita antes de aplicar.
- Cada mudança passa por lint, checagem de tipos, 178 testes automatizados e build no CI antes de ir para produção, sempre por uma prévia na Vercel aprovada antes.
- Prévias de link próprias para cada formulário, para o WhatsApp mostrar o título e a imagem certos.

## Números

Dados do relatório anual do próprio sistema, de 1º de janeiro a 19 de novembro de 2026: 679 envios, 295 clientes atendidos, 40.928 € economizados escolhendo o orçamento mais barato (43% em relação ao mais caro), 66 assistências e 26 garantias. O código tem cerca de 27 mil linhas (TypeScript, JavaScript e SQL, sem contar testes) e 29 migrations.
