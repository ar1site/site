// Mensagem do WhatsApp que leva o link da proposta. Puro, testável.
// A ponte só envia texto: o PDF vai como link assinado, e a pessoa pode editar
// o texto antes de enviar.

import { diaPorExtenso } from "./proposta";

/** Validade do link enviado ao cliente. */
export const DIAS_DO_LINK = 7;
export const SEGUNDOS_DO_LINK = DIAS_DO_LINK * 24 * 60 * 60;
/** Validade do link de quem baixa pelo painel. */
export const SEGUNDOS_DO_LINK_INTERNO = 10 * 60;

export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").replace(/\s+/g, " ").trim();
  // Telefone no lugar do nome não serve de cumprimento.
  if (!limpo || /\d{4,}/.test(limpo)) return "";
  const primeiro = limpo.split(" ")[0];
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1);
}

export function textoDaMensagem(entrada: {
  nomeDoCliente: string | null | undefined;
  titulo: string;
  numero: string;
  /** AAAA-MM-DD */
  validaAte: string;
  link: string;
}): string {
  const nome = primeiroNome(entrada.nomeDoCliente);
  return [
    `${nome ? `Oi, ${nome}!` : "Olá!"} Segue a proposta da AR1 Films: ${entrada.titulo.trim()} (${entrada.numero}).`,
    "",
    entrada.link,
    "",
    `O link abre o PDF e fica disponível por ${DIAS_DO_LINK} dias. A proposta vale até ${diaPorExtenso(entrada.validaAte)}.`,
    "Qualquer dúvida, é só chamar.",
    "Equipe AR1 Films",
  ].join("\n");
}

/** O texto editado ainda leva o link? Sem ele, a mensagem não entrega a proposta. */
export function textoTemLink(texto: string, link: string): boolean {
  return Boolean(link) && texto.includes(link);
}
