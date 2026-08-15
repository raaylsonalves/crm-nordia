/**
 * Catálogo da RISE — moda fitness com propósito (Fortaleza/CE).
 *
 * PRODUTOS: nomes e preços reais, extraídos do catálogo público de
 * https://userisefit.com.br em 15/08/2026.
 *
 * VARIAÇÕES (tamanho, cor, estoque): NÃO são reais. O site não expõe a grade
 * por peça e ainda não há integração de catálogo. São dados de desenvolvimento,
 * marcados com `variacoesReais: false`, para as telas terem o que exibir.
 * A base de conhecimento registra isso como lacuna e proíbe a IA de responder
 * tamanho, cor ou disponibilidade a partir daqui.
 *
 * CONTATOS: totalmente fictícios. Nenhum cliente real da loja.
 */

/** Grade provisória de desenvolvimento — confirmar com a loja. */
export const GRADE_PROVISORIA = ["P", "M", "G", "GG"];
export const VARIACOES_SAO_REAIS = false;

export interface ProdutoSeed {
  nome: string;
  categoria: string;
  genero: "masculino" | "feminino" | "unissex";
  colecao?: string;
  preco: number;
  esgotado: boolean;
  /** Cores provisórias de desenvolvimento. */
  cores: string[];
}

export const PRODUTOS: ProdutoSeed[] = [
  // ── Masculino ──
  { nome: "T-SHIRT MARANATA BRASIL", categoria: "Camisetas", genero: "unissex", preco: 139.99, esgotado: false, cores: ["Branco", "Preto"] },
  { nome: "REGATA Move By The Spirit", categoria: "Regatas", genero: "masculino", colecao: "Move By The Spirit", preco: 110.0, esgotado: false, cores: ["Preto", "Off-white"] },
  { nome: "CAMISETA BOXY - COLEÇÃO MOVE BY THE SPIRIT", categoria: "Camisetas", genero: "masculino", colecao: "Move By The Spirit", preco: 140.0, esgotado: true, cores: ["Preto"] },
  { nome: "Camiseta OVER RISE - COLEÇÃO MOVE BY THE SPIRIT", categoria: "Camisetas", genero: "masculino", colecao: "Move By The Spirit", preco: 126.0, esgotado: true, cores: ["Preto", "Cinza"] },
  { nome: "Camiseta Move By The Spirit - PRETA", categoria: "Camisetas", genero: "masculino", colecao: "Move By The Spirit", preco: 110.0, esgotado: true, cores: ["Preto"] },

  // ── Feminino — conjuntos ──
  { nome: "CONJUNTO RAPHA", categoria: "Conjuntos", genero: "feminino", preco: 190.0, esgotado: false, cores: ["Preto", "Vinho"] },
  { nome: "CONJUNTO LUME", categoria: "Conjuntos", genero: "feminino", preco: 165.0, esgotado: false, cores: ["Bege", "Preto"] },
  { nome: "CONJUNTO EVA", categoria: "Conjuntos", genero: "feminino", preco: 165.0, esgotado: false, cores: ["Verde-oliva", "Preto"] },
  { nome: "CONJUNTO SERENA", categoria: "Conjuntos", genero: "feminino", preco: 160.0, esgotado: false, cores: ["Rosa-antigo", "Preto"] },
  { nome: "CONJUNTO ZOE", categoria: "Conjuntos", genero: "feminino", preco: 160.0, esgotado: false, cores: ["Cinza", "Preto"] },
  { nome: "CONJUNTO OREN", categoria: "Conjuntos", genero: "feminino", preco: 210.0, esgotado: true, cores: ["Preto"] },
  { nome: "CONJUNTO ESSENCE", categoria: "Conjuntos", genero: "feminino", preco: 160.0, esgotado: true, cores: ["Off-white"] },
  { nome: "CONJUNTO AURY", categoria: "Conjuntos", genero: "feminino", preco: 165.0, esgotado: true, cores: ["Marrom"] },
  // Única peça com informação real de cor no site: "3 cores".
  { nome: "CONJUNTO LOREN", categoria: "Conjuntos", genero: "feminino", preco: 160.0, esgotado: true, cores: ["Preto", "Bege", "Verde-oliva"] },

  // ── Feminino — macacões ──
  { nome: "MACACÃO PILAR", categoria: "Macacões", genero: "feminino", preco: 160.0, esgotado: false, cores: ["Preto", "Marrom"] },
  { nome: "MACAQUINHO HELENA", categoria: "Macacões", genero: "feminino", preco: 130.0, esgotado: false, cores: ["Preto", "Cinza"] },
];

export const CATEGORIAS = ["Camisetas", "Regatas", "Blusas", "Conjuntos", "Macacões"];

/**
 * Contatos fictícios para desenvolvimento. DDD 85 (Fortaleza) predominante,
 * já que a loja tem entrega própria na região metropolitana.
 */
export const CONTATOS = [
  { nome: "Juliana Prado", telefone: "5585988112233", email: "juliana.prado@gmail.com", tamanho: "M", estilo: "treino de força" },
  { nome: "Marcos Vieira", telefone: "5585988223344", email: "marcos.vieira@outlook.com", tamanho: "G", estilo: "crossfit" },
  { nome: "Renata Albuquerque", telefone: "5585988334455", email: "renata.alb@gmail.com", tamanho: "P", estilo: "pilates" },
  { nome: "Camila Nogueira", telefone: "5585988445566", email: "camila.nog@hotmail.com", tamanho: "M", estilo: "corrida" },
  { nome: "Bruno Tavares", telefone: "5585988556677", email: "bruno.tavares@gmail.com", tamanho: "GG", estilo: "musculação" },
  { nome: "Ana Beatriz Lopes", telefone: "5585988667788", email: "anabeatriz.lopes@gmail.com", tamanho: "M", estilo: "funcional" },
  { nome: "Patrícia Menezes", telefone: "5585988778899", email: "patricia.menezes@uol.com.br", tamanho: "G", estilo: "corrida" },
  { nome: "Larissa Fontes", telefone: "5585988889900", email: "larissa.fontes@gmail.com", tamanho: "P", estilo: "dança" },
  { nome: "Aline Barreto", telefone: "5585989001122", email: "aline.barreto@gmail.com", tamanho: "M", estilo: "musculação" },
  { nome: "Fernanda Quirino", telefone: "5585989112233", email: "fer.quirino@gmail.com", tamanho: "P", estilo: "pilates" },
  { nome: "Débora Sampaio", telefone: "5585989223344", email: "debora.sampaio@gmail.com", tamanho: "GG", estilo: "funcional" },
  { nome: "Carolina Estrela", telefone: "5562989334455", email: "carol.estrela@gmail.com", tamanho: "M", estilo: "corrida" },
  { nome: "Vanessa Duarte", telefone: "5585989445566", email: "vanessa.duarte@gmail.com", tamanho: "G", estilo: "crossfit" },
  { nome: "Isabela Rocha", telefone: "5585989556677", email: "isa.rocha@gmail.com", tamanho: "P", estilo: "yoga" },
  { nome: "Tatiane Moraes", telefone: "5585989667788", email: "tati.moraes@gmail.com", tamanho: "M", estilo: "musculação" },
  { nome: "Priscila Andrade", telefone: "5511989778899", email: "pri.andrade@gmail.com", tamanho: "P", estilo: "corrida" },
  { nome: "Gabriela Furtado", telefone: "5585989889900", email: "gabi.furtado@gmail.com", tamanho: "GG", estilo: "funcional" },
  { nome: "Sofia Bittencourt", telefone: "5581990001122", email: "sofia.bitt@gmail.com", tamanho: "P", estilo: "pilates" },
  { nome: "Helena Vasques", telefone: "5585990112233", email: "helena.vasques@gmail.com", tamanho: "M", estilo: "treino de força" },
  { nome: "Rafaela Pontes", telefone: "5571990223344", email: "rafa.pontes@gmail.com", tamanho: "G", estilo: "crossfit" },
  { nome: "Diego Nascimento", telefone: "5585990334455", email: "diego.nasc@gmail.com", tamanho: "G", estilo: "musculação" },
  { nome: "Mariana Cerqueira", telefone: "5585990445566", email: "mari.cerqueira@gmail.com", tamanho: "M", estilo: "corrida" },
  { nome: "Letícia Amorim", telefone: "5519990556677", email: "leticia.amorim@gmail.com", tamanho: "P", estilo: "dança" },
  { nome: "Bianca Salgueiro", telefone: "5585990667788", email: "bianca.salg@gmail.com", tamanho: "G", estilo: "funcional" },
  { nome: "Natália Ferraz", telefone: "5585990778899", email: "natalia.ferraz@gmail.com", tamanho: "M", estilo: "yoga" },
  { nome: "Rodrigo Bandeira", telefone: "5561990889900", email: "rodrigo.bandeira@gmail.com", tamanho: "GG", estilo: "crossfit" },
  { nome: "Elisa Monteiro", telefone: "5585991001122", email: "elisa.monteiro@gmail.com", tamanho: "P", estilo: "pilates" },
  { nome: "Adriana Peçanha", telefone: "5522991112233", email: "adriana.pecanha@gmail.com", tamanho: "M", estilo: "corrida" },
  { nome: "Luciana Braga", telefone: "5585991223344", email: "luciana.braga@gmail.com", tamanho: "G", estilo: "musculação" },
  { nome: "Beatriz Toledo", telefone: "5585991334455", email: "bia.toledo@gmail.com", tamanho: "GG", estilo: "funcional" },
  { nome: "Milena Rezende", telefone: "5534991445566", email: "milena.rezende@gmail.com", tamanho: "P", estilo: "dança" },
  { nome: "Yasmin Carvalho", telefone: "5585991556677", email: "yasmin.carvalho@gmail.com", tamanho: "M", estilo: "treino de força" },
  { nome: "Felipe Peixoto", telefone: "5585991667788", email: "felipe.peixoto@gmail.com", tamanho: "G", estilo: "corrida" },
  { nome: "Roberta Guimarães", telefone: "5585991778899", email: "roberta.gui@gmail.com", tamanho: "M", estilo: "yoga" },
  { nome: "Fabiana Coutinho", telefone: "5585991889900", email: "fabiana.cout@gmail.com", tamanho: "G", estilo: "funcional" },
  { nome: "Amanda Siqueira", telefone: "5585992001122", email: "amanda.siqueira@gmail.com", tamanho: "P", estilo: "pilates" },
  { nome: "Verônica Lins", telefone: "5585992112233", email: "veronica.lins@gmail.com", tamanho: "M", estilo: "musculação" },
  { nome: "Paula Aguiar", telefone: "5527992223344", email: "paula.aguiar@gmail.com", tamanho: "P", estilo: "corrida" },
  { nome: "Denise Vilela", telefone: "5585992334455", email: "denise.vilela@gmail.com", tamanho: "GG", estilo: "funcional" },
  { nome: "Karina Bastos", telefone: "5585992445566", email: "karina.bastos@gmail.com", tamanho: "M", estilo: "crossfit" },
];
