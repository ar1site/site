import "server-only";

// Assinatura curta do modo de impressão da página pública (/p/<token>?impressao=…).
// O Chrome que gera o PDF abre a página com esta assinatura: ela vale só para
// aquele token e por poucos minutos, e faz a página ignorar a validade do link
// e mostrar o modo de impressão. Nenhum segredo sai do servidor (antes o
// segredo do webhook ia num cabeçalho para todos os endereços da página).

import { createHmac, timingSafeEqual } from "node:crypto";

/** Quanto tempo a assinatura vale (o PDF leva segundos). */
export const VALIDADE_DA_IMPRESSAO_MS = 5 * 60 * 1000;

function hmac(segredo: string, token: string, expira: number): string {
  return createHmac("sha256", `ar1-impressao:${segredo}`).update(`${token}.${expira}`).digest("base64url");
}

/** "<expira em ms>.<hmac>" para usar em ?impressao=. */
export function assinarImpressao(token: string, segredo: string, agora: number = Date.now()): string {
  if (!segredo) throw new Error("Sem segredo para assinar a impressão.");
  const expira = agora + VALIDADE_DA_IMPRESSAO_MS;
  return `${expira}.${hmac(segredo, token, expira)}`;
}

/** A assinatura é deste token, foi feita com o segredo e ainda vale? (comparação em tempo constante) */
export function conferirImpressao(
  token: string,
  assinatura: string | null | undefined,
  segredo: string | null | undefined,
  agora: number = Date.now(),
): boolean {
  if (!segredo || !assinatura) return false;
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{20,100})$/.exec(assinatura);
  if (!m) return false;
  const expira = Number(m[1]);
  if (!Number.isFinite(expira) || expira < agora || expira > agora + VALIDADE_DA_IMPRESSAO_MS + 60_000) return false;
  const esperado = Buffer.from(hmac(segredo, token, expira));
  const recebido = Buffer.from(m[2]);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}
