import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { linkParaOCliente } from "@/lib/propostas/premium/servidor";
import { respostaDeErro } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/propostas/[id]/link — o link para o cliente e o texto sugerido da
 * mensagem. Proposta premium: a página pública /p/<token> (o token vencido é
 * renovado). Proposta em PDF antiga: link assinado de 7 dias. Não envia nada.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  try {
    return NextResponse.json({ ok: true, ...(await linkParaOCliente(id)) });
  } catch (e) {
    return respostaDeErro(e, "propostas/link");
  }
}
