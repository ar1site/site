import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { COLUNAS_DOCUMENTO, resumirDocumento } from "@/lib/contexto/resumo";
import {
  apagarArquivo,
  erro,
  lerDocumento,
  lerJson,
  mensagemDoBanco,
} from "@/lib/contexto/servidor";
import { validarAlteracao } from "@/lib/contexto/validar";
import { supabaseServico } from "@/lib/supabase/service";
import type { DocContexto } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

/** GET /api/contexto/[id] — documento com o conteúdo completo. */
export async function GET(_request: Request, ctx: Contexto) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  const lido = await lerDocumento(id);
  if (!lido.ok) return lido.resposta;
  return NextResponse.json({ ok: true, documento: lido.doc });
}

/** PATCH /api/contexto/[id] — título, "usar na IA" e, só em texto digitado, o conteúdo. */
export async function PATCH(request: Request, ctx: Contexto) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  const lido = await lerDocumento(id);
  if (!lido.ok) return lido.resposta;

  const alteracao = validarAlteracao(await lerJson(request), lido.doc.kind);
  if (!alteracao.ok) return erro(alteracao.erro, 400);

  const { data, error } = await supabaseServico()
    .from("ar1_context_docs")
    .update(alteracao.dados)
    .eq("id", lido.doc.id)
    .select(COLUNAS_DOCUMENTO)
    .single();
  if (error || !data) return erro(mensagemDoBanco(error ?? { message: "sem resposta" }), 500);

  return NextResponse.json({ ok: true, documento: resumirDocumento(data as DocContexto) });
}

/** DELETE /api/contexto/[id] — apaga a linha e o arquivo original. */
export async function DELETE(_request: Request, ctx: Contexto) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  const lido = await lerDocumento(id);
  if (!lido.ok) return lido.resposta;

  const { error } = await supabaseServico().from("ar1_context_docs").delete().eq("id", lido.doc.id);
  if (error) return erro(mensagemDoBanco(error), 500);

  // Linha primeiro: se o arquivo não sair, sobra só um arquivo solto no bucket.
  if (lido.doc.file_path) await apagarArquivo(lido.doc.file_path);

  return NextResponse.json({ ok: true });
}
