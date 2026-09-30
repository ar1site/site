// Página pública da proposta (/p/[token]): token, validade, visualizações,
// aceite, situações e a mensagem do WhatsApp. Puro (o gerador de bytes é
// injetável), testável; serve ao navegador e ao servidor.

import { FUSO_BRASILIA_MS } from "../../funil/datas";
import { primeiroNome } from "../mensagem";
import { diaPorExtenso } from "../proposta";
import { DIAS_LINK_MAXIMO, DIAS_LINK_PADRAO } from "./pedido";

/** Tamanho do token em bytes (vira 43 caracteres em base64url; o mínimo é 32). */
export const BYTES_DO_TOKEN = 32;
export const TOKEN_VALIDO = /^[A-Za-z0-9_-]{32,128}$/;

/** WhatsApp comercial da AR1 (só dígitos, com DDI) e como aparece na tela. */
export const WHATSAPP_COMERCIAL = "5562981252338";
export const WHATSAPP_COMERCIAL_LEGIVEL = "(62) 98125-2338";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Gera o token a partir de bytes aleatórios (crypto no servidor; injetável nos testes). */
export function tokenDeBytes(bytes: Uint8Array): string {
  if (bytes.length < 24) throw new Error("Token curto demais.");
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binario) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function ehToken(valor: unknown): valor is string {
  return typeof valor === "string" && TOKEN_VALIDO.test(valor);
}

/** Dias de validade dentro dos limites (padrão 30). */
export function lerDiasDoLink(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > DIAS_LINK_MAXIMO) return DIAS_LINK_PADRAO;
  return n;
}

/** Quando o link expira (ISO), a partir de agora. */
export function expiraEm(agora: Date, dias: number): string {
  return new Date(agora.getTime() + lerDiasDoLink(dias) * DIA_MS).toISOString();
}

export type EstadoDoLink = "ativo" | "expirado" | "sem_link";

/**
 * Estado do link público. Sem data de vencimento (ou com data inválida), o
 * vencimento é calculado pela criação + dias do link; sem nenhuma das duas,
 * o link é tratado como vencido (nunca fica aberto para sempre).
 */
export function estadoDoLink(
  p: {
    public_token: string | null;
    public_expires_at: string | null;
    created_at?: string | null;
    public_days?: number | null;
  },
  agora: number = Date.now(),
): EstadoDoLink {
  if (!p.public_token) return "sem_link";
  let fim = p.public_expires_at ? new Date(p.public_expires_at).getTime() : Number.NaN;
  if (Number.isNaN(fim) && p.created_at) {
    const criada = new Date(p.created_at).getTime();
    if (!Number.isNaN(criada)) fim = criada + lerDiasDoLink(p.public_days ?? DIAS_LINK_PADRAO) * DIA_MS;
  }
  if (Number.isNaN(fim)) return "expirado";
  return fim > agora ? "ativo" : "expirado";
}

/** URL pública da proposta. */
export function urlPublica(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/p/${token}`;
}

/** Hoje em Brasília, "AAAA-MM-DD". */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() + FUSO_BRASILIA_MS).toISOString().slice(0, 10);
}

/**
 * A proposta já passou da validade comercial (valid_until, dia em Brasília,
 * inclusive)? Vencida, a página mostra a apresentação mas não aceita.
 */
export function propostaVencida(validUntil: string | null | undefined, agora: Date = new Date()): boolean {
  if (!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return false;
  return hojeEmBrasilia(agora) > validUntil;
}

// ------------------------------------------------------------- visualizações

export interface Visualizacoes {
  views: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
}

/** Nova contagem depois de uma visita do cliente (a equipe, os robôs e o PDF não contam). */
export function registrarVisualizacao(atual: Visualizacoes, agora: Date): Visualizacoes {
  const quando = agora.toISOString();
  return {
    views: Math.max(0, atual.views) + 1,
    first_viewed_at: atual.first_viewed_at ?? quando,
    last_viewed_at: quando,
  };
}

/**
 * Robôs que abrem o link sozinhos (prévia do WhatsApp/Facebook/Telegram,
 * buscadores, antivírus de e-mail, ferramentas de linha de comando). Não
 * contam como visita do cliente. Sem user-agent também não conta.
 */
const ROBOS =
  /\bbot\b|bot\/|bot;|telegrambot|slackbot|linkedinbot|crawler|spider|preview|facebookexternalhit|facebookcatalog|whatsapp\/|embedly|pinterest|vkshare|google-inspectiontool|googleother|headlesschrome|lighthouse|pagespeed|curl\/|wget\/|python-requests|python-urllib|axios\/|node-fetch|undici|go-http-client|okhttp|java\/|libwww|httpclient|postman|insomnia|scanner|safelinks|proofpoint|mimecast|barracuda/i;

export function ehRobo(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return ROBOS.test(ua);
}

// ----------------------------------------------------------------- situações

export type StatusProposta = "rascunho" | "gerada" | "enviada" | "aceita" | "recusada";

export const ROTULO_STATUS_PROPOSTA: Record<StatusProposta, string> = {
  rascunho: "Rascunho",
  gerada: "Gerada",
  enviada: "Enviada",
  aceita: "Aceita",
  recusada: "Recusada",
};

export function ehStatusProposta(valor: unknown): valor is StatusProposta {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(ROTULO_STATUS_PROPOSTA, valor);
}

/** Aceita ou recusada: o conteúdo fica travado até alguém reabrir. */
export function propostaDecidida(status: StatusProposta): boolean {
  return status === "aceita" || status === "recusada";
}

/**
 * Transições que a equipe pode marcar no painel (PATCH `situacao`):
 *   - "aceita" / "recusada": de gerada ou enviada (e trocar uma pela outra);
 *   - "enviada": marcar à mão (link copiado ou mandado por outro número), de rascunho ou gerada;
 *   - "gerada": concluir o rascunho, desfazer um envio marcado à mão (sem item na
 *     fila do WhatsApp) ou reabrir uma aceita/recusada. Ao reabrir, a proposta
 *     volta para "enviada" se já tinha saído (ver `statusAoReabrir`).
 * O terceiro argumento é opcional; sem ele, desfazer o envio é permitido.
 */
export function podeMarcar(
  atual: StatusProposta,
  novo: StatusProposta,
  contexto: { enviadaPelaFila?: boolean } = {},
): boolean {
  if (atual === novo) return false;
  switch (novo) {
    case "aceita":
    case "recusada":
      return atual !== "rascunho";
    case "enviada":
      return atual === "rascunho" || atual === "gerada";
    case "gerada":
      if (atual === "rascunho" || atual === "aceita" || atual === "recusada") return true;
      if (atual === "enviada") return !contexto.enviadaPelaFila;
      return false;
    default:
      return false;
  }
}

/** Situação real ao reabrir (pedido "gerada" de uma aceita/recusada). */
export function statusAoReabrir(p: { sent_at: string | null }): StatusProposta {
  return p.sent_at ? "enviada" : "gerada";
}

// -------------------------------------------------------------------- aceite

export type ResultadoAceite =
  | { ok: true; campos: { status: "aceita"; accepted_at: string; accepted_name: string } }
  | { ok: false; erro: string; status: number };

/**
 * O cliente aceitou pela página. Vale só com link ativo, dentro da validade
 * comercial (valid_until), com a proposta pronta (não rascunho), ainda não
 * decidida e um nome digitado.
 */
export function aceitarPelaPagina(
  p: {
    status: StatusProposta;
    public_token: string | null;
    public_expires_at: string | null;
    valid_until: string;
    created_at?: string | null;
    public_days?: number | null;
  },
  nomeDigitado: unknown,
  agora: Date,
): ResultadoAceite {
  const nome = typeof nomeDigitado === "string" ? nomeDigitado.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (estadoDoLink(p, agora.getTime()) !== "ativo") return { ok: false, erro: "Este link não está mais ativo.", status: 410 };
  if (p.status === "aceita") return { ok: false, erro: "Esta proposta já foi aceita.", status: 409 };
  if (p.status === "recusada") return { ok: false, erro: "Esta proposta foi encerrada.", status: 409 };
  if (p.status === "rascunho") {
    return { ok: false, erro: "Esta proposta ainda está em preparação. Fale com a equipe da AR1.", status: 409 };
  }
  if (propostaVencida(p.valid_until, agora)) {
    return {
      ok: false,
      erro: `Esta proposta venceu em ${diaPorExtenso(p.valid_until)}. Fale com a equipe para receber uma versão atualizada.`,
      status: 410,
    };
  }
  if (nome.length < 2) return { ok: false, erro: "Digite seu nome para aceitar.", status: 400 };
  return { ok: true, campos: { status: "aceita", accepted_at: agora.toISOString(), accepted_name: nome } };
}

// ------------------------------------------------------------------ mensagem

/** Texto do WhatsApp que leva o link da proposta premium. */
export function mensagemDoLinkPremium(entrada: {
  nomeDoCliente: string | null | undefined;
  titulo: string;
  numero: string;
  /** AAAA-MM-DD */
  validaAte: string;
  link: string;
}): string {
  const nome = primeiroNome(entrada.nomeDoCliente);
  return [
    `${nome ? `Oi, ${nome}!` : "Olá!"} Preparamos a proposta da AR1 Films para você: ${entrada.titulo.trim()} (${entrada.numero}).`,
    "",
    entrada.link,
    "",
    `O link abre a apresentação completa, com o investimento, e a proposta vale até ${diaPorExtenso(entrada.validaAte)}. ` +
      "Lá mesmo dá para aceitar ou falar com a gente.",
    "Qualquer dúvida, é só chamar.",
    "Equipe AR1 Films",
  ].join("\n");
}

/** Link "Falar no WhatsApp" da página pública, com o texto pronto. */
export function linkDoWhatsapp(numero: string, titulo: string): string {
  const texto = `Olá! Vi a proposta "${titulo}" da AR1 Films (${numero}) e quero conversar.`;
  return `https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(texto)}`;
}
