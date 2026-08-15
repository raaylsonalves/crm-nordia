/**
 * Base de conhecimento da RISE.
 *
 * PROCEDÊNCIA: extraído do site público https://userisefit.com.br em 15/08/2026
 * (páginas Quem Somos, Política de Troca, Política de Entrega e Contato).
 *
 * REGRA: nada aqui é inventado. O que o site não informa está listado no
 * documento "Lacunas" com status EXIGE_CONFIRMACAO — a IA não pode responder
 * sobre esses pontos e deve transferir para a equipe. É essa lista que separa
 * "a IA não sabe" de "a IA chutou".
 */

export interface DocumentoSeed {
  titulo: string;
  categoria: string;
  conteudo: string;
  /** Origem da informação, exibida na UI junto ao trecho recuperado. */
  fonte: string;
  /** true = conteúdo não confirmado pela loja; a IA não deve usar como verdade. */
  exigeConfirmacao?: boolean;
}

export const DOCUMENTOS: DocumentoSeed[] = [
  {
    titulo: "Quem somos — RISE",
    categoria: "historia",
    fonte: "https://userisefit.com.br/quem-somos/",
    conteudo: `A RISE nasceu em 2025 com um propósito maior: elevar não apenas o desempenho, mas o espírito.

Acreditamos que a forma de se vestir pode honrar valores superiores, e que propósito sempre vence performance. A marca começou como um movimento dedicado a vestir homens e mulheres que desejam viver seus esportes com intenção, identidade e fé.

Fabricamos regatas, camisetas, shorts, macacões e blusas para diferentes modalidades e estilos.

Nossos valores são integridade, excelência e uma inspiração que vem do Alto.

Entendemos que roupa comunica valores: carrega mensagem, postura e presença. Cada peça transmite força, leveza e propósito.

Entendemos que o corpo é instrumento, que o movimento é expressão, e que até o suor pode ser oferta. Buscamos inspirar constância, disciplina e devoção.

Somos uma marca feita para quem entende que fé não é só palavra: é prática, é atitude, é vida.`,
  },
  {
    titulo: "Tom de voz no atendimento RISE",
    categoria: "tom_de_voz",
    fonte: "Definido a partir do posicionamento da marca no site (Quem Somos)",
    conteudo: `A RISE fala com quem treina com propósito. O tom é encorajador, direto e respeitoso — nunca pregador, nunca forçado.

Fazemos:
- Tratar por "você", com naturalidade.
- Frases curtas e objetivas. Quem está com o celular na mão entre uma série e outra não lê parágrafo longo.
- Chamar a pessoa pelo nome.
- Falar de propósito e constância quando a conversa abrir espaço — não em toda mensagem.
- No máximo um emoji por mensagem.

Não fazemos:
- Linguagem corporativa ("prezado cliente", "informamos que", "conforme solicitado").
- Versículo ou mensagem de fé sem que a pessoa tenha puxado o assunto. A marca tem identidade cristã, mas o atendimento não evangeliza: acolhe.
- Insistir depois de um "não".
- Prometer prazo, preço, desconto ou disponibilidade que não esteja confirmado.
- Julgar corpo, peso ou desempenho de ninguém.

Quando não sabemos algo, dizemos que não sabemos e encaminhamos para a equipe. Essa é a regra que não se quebra.`,
  },
  {
    titulo: "Política de troca e devolução",
    categoria: "trocas",
    fonte: "https://userisefit.com.br/politica-de-troca/",
    conteudo: `Prazo: você tem até 7 dias corridos após o recebimento do produto para solicitar a troca. A contagem começa quando a transportadora confirma a entrega.

Condições do produto:
- Precisa estar em perfeitas condições, sem sinais de uso ou lavagem.
- A etiqueta precisa estar fixada.
- Não aceitamos produtos com odor, manchas ou etiqueta removida.
- A mercadoria deverá retornar nas mesmas condições em que foi entregue.
- Lacres intactos e embalagem original com todos os acessórios.
- O produto NÃO PODE TER SIDO USADO.

Exclusões: produtos de saldão, bazar ou queima de estoque não são trocáveis.

Como solicitar: envie um e-mail para userisefit@outlook.com informando nome completo, número do pedido e motivo da troca. Respondemos com as instruções necessárias.

Reembolso: processado em até 30 dias após o recebimento do produto devolvido, pelo mesmo método de pagamento usado na compra. Não há custos adicionais para o cliente.`,
  },
  {
    titulo: "Política de entrega e prazos",
    categoria: "envio",
    fonte: "https://userisefit.com.br/politica-de-entrega/",
    conteudo: `Prazo de envio: o tempo médio para o envio do produto é de 72 horas úteis após a confirmação do pagamento. Pedidos feitos em fins de semana e feriados têm as 72 horas contadas a partir do próximo dia útil.

Fortaleza e região metropolitana: entrega por motoboy próprio ou Uber Flash, mediante contato prévio.

Demais estados: envio por transportadora ou Correios. O prazo de entrega é contado a partir da data de envio e pode variar de acordo com cada transportadora.

Rastreamento: no e-mail cadastrado você recebe um código de rastreamento após a postagem do produto.

Retirada no local:
- Endereço: Rua Odorico de Morais, 250 — Jacarecanga, Fortaleza/CE.
- Horário para retirada: segunda a sexta, das 13h às 18h.
- Disponível 30 minutos após o pagamento e o status "embalado".
- Prazo máximo para retirada: 2 dias úteis após a confirmação do pagamento.`,
  },
  {
    titulo: "Contato e horário de atendimento",
    categoria: "faq",
    fonte: "https://userisefit.com.br/contato/",
    conteudo: `WhatsApp e telefone: (85) 98816-3043
E-mail: userisefit@outlook.com
Endereço: Rua Odorico de Morais, 250 — Jacarecanga, Fortaleza/CE
Horário de atendimento: segunda a sexta, das 08h às 18h (exceto feriados).

Atenção: o horário de atendimento (08h às 18h) é diferente do horário de retirada de pedidos no local (13h às 18h).`,
  },
  {
    titulo: "Linha de produtos e coleções",
    categoria: "colecoes",
    fonte: "https://userisefit.com.br — catálogo público em 15/08/2026",
    conteudo: `A RISE trabalha com moda fitness masculina e feminina, dividida assim:

Masculino: camisetas, regatas.
Feminino: blusas e regatas, macacões, conjuntos.

Coleção Move By The Spirit — linha atual, presente em várias peças masculinas:
- REGATA Move By The Spirit — R$ 110,00
- CAMISETA BOXY (Move By The Spirit) — R$ 140,00
- Camiseta OVER RISE (Move By The Spirit) — R$ 126,00
- Camiseta Move By The Spirit PRETA — R$ 110,00

Outras peças masculinas:
- T-SHIRT MARANATA BRASIL — R$ 139,99 (também disponível no feminino)

Conjuntos femininos, todos com nome próprio:
- CONJUNTO RAPHA — R$ 190,00
- CONJUNTO LUME — R$ 165,00
- CONJUNTO EVA — R$ 165,00
- CONJUNTO SERENA — R$ 160,00
- CONJUNTO ZOE — R$ 160,00
- CONJUNTO OREN — R$ 210,00
- CONJUNTO ESSENCE — R$ 160,00
- CONJUNTO AURY — R$ 165,00
- CONJUNTO LOREN — R$ 160,00 (disponível em 3 cores)

Macacões e macaquinhos:
- MACACÃO PILAR — R$ 160,00
- MACAQUINHO HELENA — R$ 130,00

IMPORTANTE PARA O ATENDIMENTO: esta lista é um retrato do catálogo em 15/08/2026 e serve apenas para reconhecer nomes de peça na conversa. Preço, disponibilidade, cor e tamanho NÃO devem ser respondidos a partir daqui — várias peças aparecem como esgotadas e o catálogo muda. Sempre confirmar com a equipe ou com a loja antes de informar.`,
  },
  {
    titulo: "Lacunas — o que a IA NÃO pode responder",
    categoria: "regras",
    fonte: "Auditoria do site público em 15/08/2026",
    exigeConfirmacao: true,
    conteudo: `Os pontos abaixo NÃO estão publicados no site da RISE e ainda não foram confirmados pela loja. A IA não tem base para responder nenhum deles. Ao receber uma pergunta sobre qualquer um destes temas, deve usar a frase padrão e transferir para a equipe:

"Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar."

1. FORMAS DE PAGAMENTO E PARCELAMENTO
   Quais bandeiras, se há Pix, se há desconto no Pix, em quantas vezes parcela, parcela mínima, se aceita boleto.

2. TABELA DE MEDIDAS
   Não há tabela publicada. A IA não pode indicar tamanho, nem dizer se a peça veste grande ou pequena, nem converter medidas. Dúvida de tamanho vai direto para a equipe.

3. FRETE
   Se existe frete grátis e a partir de qual valor. Prazo estimado por região (o site diz apenas que "varia conforme a transportadora"). Valor do frete.

4. FRETE DA TROCA
   Quem paga o envio de volta na troca por tamanho ou cor. A política de troca não define isso.

5. TROCA POR OUTRO MODELO OU VALE-COMPRA
   A política prevê apenas devolução com reembolso. Não há regra publicada sobre troca por outro produto nem sobre vale-compra.

6. GRADE DE TAMANHOS E CORES POR PEÇA
   Quais tamanhos e cores existem em cada produto, e o que está em estoque.

7. REPOSIÇÃO DE PEÇAS ESGOTADAS
   Se peças esgotadas voltam, e em quanto tempo.

8. DADOS INSTITUCIONAIS
   CNPJ, razão social e redes sociais oficiais.

9. DESCONTOS E CUPONS
   Não existe regra comercial cadastrada. A IA não pode oferecer nenhum desconto, em nenhuma circunstância.

10. PRODUTO COM DEFEITO
    Não há política publicada para defeito de fabricação (diferente de arrependimento). Caso vai para a equipe.

Conforme a loja confirmar cada item, ele sai desta lista e vira documento próprio na base.`,
  },
  {
    titulo: "Divergência de e-mail — pendente de correção",
    categoria: "regras",
    fonte: "Comparação entre /politica-de-troca/ e /contato/ em 15/08/2026",
    exigeConfirmacao: true,
    conteudo: `O site publica dois endereços de e-mail diferentes:

- Página de Contato: userisefit@outlook.com
- Política de Troca: userisefiti@outlook.com (com um "i" a mais antes do @)

Um dos dois está incorreto. Enquanto a loja não confirmar qual é o válido, o atendimento deve usar o da página de Contato (userisefit@outlook.com), que é a página institucional de contato, e evitar dar o endereço por escrito quando puder resolver pelo próprio WhatsApp.

Ação pendente: confirmar o endereço correto e corrigir a página divergente.`,
  },
];
