import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { BUCKET_CONTEXTO } from "@/lib/contexto/limites";
import { erro, lerDocumento } from "@/lib/contexto/servidor";
import { supabaseServico } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validade da URL assinada do arquivo original. */
const VALIDADE_SEGUNDOS = 10 * 60;

/** GET /api/contexto/[id]/arquivo — redireciona para a URL assinada (10 min). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  const lido = await lerDocumento(id);
  if (!lido.ok) return lido.resposta;
  if (!lido.doc.file_path) return erro("Este documento não tem arquivo (é um texto digitado).", 404);

  const { data, error } = await supabaseServico()
    .storage.from(BUCKET_CONTEXTO)
    .createSignedUrl(lido.doc.file_path, VALIDADE_SEGUNDOS);
  if (error || !data) return erro("Arquivo não encontrado no armazenamento.", 404);

  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
