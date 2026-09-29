// Quem pode disparar a geração de retomadas sem sessão de equipe. Puro, testável.

import { timingSafeEqual } from "node:crypto";

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type OrigemAutorizada = "cron" | "interno";

/**
 * Confere os cabeçalhos de uma chamada de máquina:
 *   - Authorization: Bearer <CRON_SECRET>  (cron da Vercel)
 *   - x-internal-secret: <WEBHOOK_SECRET>  (chamada interna)
 * Segredo vazio ou ausente no ambiente nunca autoriza.
 */
export function origemAutorizada(
  cabecalhos: Pick<Headers, "get">,
  segredos: { cron?: string | null; interno?: string | null },
): OrigemAutorizada | null {
  const cron = (segredos.cron ?? "").trim();
  const autorizacao = cabecalhos.get("authorization") ?? "";
  if (cron && iguais(autorizacao, `Bearer ${cron}`)) return "cron";

  const interno = (segredos.interno ?? "").trim();
  const recebido = cabecalhos.get("x-internal-secret") ?? "";
  if (interno && recebido && iguais(recebido, interno)) return "interno";

  return null;
}
