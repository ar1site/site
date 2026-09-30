import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { respostaDeErro } from "@/lib/propostas/respostas";
import { lerProposta, linkDoPdf } from "@/lib/propostas/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/propostas/[id]/arquivo — redireciona para a URL assinada do PDF (10 min). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  try {
    const proposta = await lerProposta(id);
    return NextResponse.redirect(await linkDoPdf(proposta), { status: 302 });
  } catch (e) {
    return respostaDeErro(e, "propostas/arquivo");
  }
}
