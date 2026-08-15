/** Menu de boas-vindas e triagem — textos e mapeamento das opções. */

export interface MenuOption {
  numero: string;
  rotulo: string;
  intencao: Intencao;
}

export type Intencao =
  | "compra"
  | "tamanho"
  | "pedido"
  | "troca"
  | "humano"
  | "desconhecida";

export const OPCOES: MenuOption[] = [
  { numero: "1", rotulo: "Quero comprar", intencao: "compra" },
  { numero: "2", rotulo: "Preciso de ajuda com tamanho", intencao: "tamanho" },
  { numero: "3", rotulo: "Acompanhar meu pedido", intencao: "pedido" },
  { numero: "4", rotulo: "Troca ou devolução", intencao: "troca" },
  { numero: "5", rotulo: "Falar com um atendente", intencao: "humano" },
];

export function montarMenu(params: { nomeCliente: string; nomeLoja: string }): string {
  const linhas = OPCOES.map(
    (o, i) => `${["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][i]} ${o.rotulo}`,
  ).join("\n");

  return (
    `Olá, ${params.nomeCliente}! 👋\n` +
    `Bem-vindo à ${params.nomeLoja}.\n` +
    `Para agilizar seu atendimento, escolha uma opção:\n` +
    `${linhas}\n` +
    `Digite o número da opção desejada.`
  );
}

export function montarTransferencia(protocolo: string): string {
  return (
    `Perfeito! Já encaminhei sua solicitação para nossa equipe.\n` +
    `Protocolo: #${protocolo}\n` +
    `Enquanto aguarda, você pode enviar fotos, referências ou outras informações ` +
    `que possam ajudar no atendimento.`
  );
}

/** Frase única para quando não há informação confiável. Não variar o texto. */
export const FRASE_SEM_INFORMACAO =
  "Não quero passar uma informação incorreta. Vou encaminhar sua dúvida para nossa equipe confirmar.";

/**
 * Interpreta a resposta ao menu. Só reconhece o número digitado — a
 * classificação de texto livre é trabalho da IA (Etapa 8), não de regex,
 * justamente para não errar intenção com heurística frágil.
 */
export function interpretarOpcao(texto: string): Intencao {
  const limpo = texto.trim().replace(/[^\d]/g, "");
  const opcao = OPCOES.find((o) => o.numero === limpo);
  return opcao?.intencao ?? "desconhecida";
}

/** Protocolo exibido ao cliente: #A7K2-4821 */
export function gerarProtocolo(aleatorio: () => number = Math.random): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "0123456789";
  const pick = (fonte: string) => fonte[Math.floor(aleatorio() * fonte.length)]!;
  return `${pick(letras)}${pick(digitos)}${pick(letras)}${pick(digitos)}-${pick(digitos)}${pick(digitos)}${pick(digitos)}${pick(digitos)}`;
}
