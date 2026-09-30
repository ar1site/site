import { NextResponse } from "next/server";
import { sessaoDaEquipe } from "@/lib/auth";
import { contarVisita } from "@/lib/propostas/premium/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/p/[token]/visita — a página pública avisa que abriu no navegador
 * (sem login). Conta a visita do cliente; robôs de prévia (não rodam o script
 * ou se identificam no user-agent) e a equipe logada no painel não contam.
 * Responde sempre 200 {ok, contada} para não expor nada da proposta.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let daEquipe = false;
  try {
    daEquipe = Boolean(await sessaoDaEquipe());
  } catch {
    daEquipe = false;
  }
  const r = await contarVisita(token, { userAgent: request.headers.get("user-agent"), daEquipe });
  return NextResponse.json({ ok: true, contada: r.contada }, { headers: { "Cache-Control": "no-store" } });
}
