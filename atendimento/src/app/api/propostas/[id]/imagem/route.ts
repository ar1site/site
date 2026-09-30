import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { guardarImagemDaProposta, urlDaImagemEnviada } from "@/lib/propostas/premium/servidor";
import { erro, respostaDeErro } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/propostas/[id]/imagem — recebe uma imagem (logo ou foto do cliente,
 * PNG/JPG/WebP até 4 MB, campo `arquivo` do formulário) e guarda no bucket
 * ar1-context em propostas/<id>/. Devolve o caminho e a URL assinada.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();
  const { id } = await ctx.params;
  let arquivo: File | null = null;
  try {
    const dados = await request.formData();
    const campo = dados.get("arquivo");
    arquivo = campo instanceof File ? campo : null;
  } catch {
    return erro("Envie a imagem como arquivo (multipart/form-data).", 400);
  }
  if (!arquivo) return erro("Nenhuma imagem recebida.", 400);
  try {
    const caminho = await guardarImagemDaProposta(id, arquivo);
    return NextResponse.json({ ok: true, caminho, url: await urlDaImagemEnviada(caminho) });
  } catch (e) {
    return respostaDeErro(e, "propostas/imagem");
  }
}
