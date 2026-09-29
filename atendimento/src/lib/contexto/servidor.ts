import "server-only";

// Apoio das rotas /api/contexto: respostas padronizadas e leituras comuns.

import { NextResponse } from "next/server";
import { supabaseServico } from "../supabase/service";
import type { DocContexto } from "../tipos";
import { BUCKET_CONTEXTO } from "./limites";
import { COLUNAS_DOCUMENTO } from "./resumo";
import { UUID } from "./validar";

export function erro(mensagem: string, status: number) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/** Lê o corpo JSON; null quando vem vazio ou inválido. */
export async function lerJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * A tabela ainda não existe (migração do contexto não aplicada)? Serve para
 * trocar o erro técnico por um aviso que a equipe entende.
 */
export function mensagemDoBanco(e: { message: string; code?: string }): string {
  const tabelaAusente =
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    /(could not find the table|relation .* does not exist)/i.test(e.message);
  if (tabelaAusente) {
    return "O recurso de contexto ainda não foi ativado no banco de dados (falta aplicar a migração).";
  }
  return `Erro no banco de dados: ${e.message}`;
}

export async function contatoExiste(contactId: string): Promise<boolean> {
  const { data } = await supabaseServico()
    .from("ar1_wa_contacts")
    .select("id")
    .eq("id", contactId)
    .maybeSingle();
  return Boolean(data);
}

export type DocumentoLido =
  | { ok: true; doc: DocContexto }
  | { ok: false; resposta: NextResponse };

/** Lê um documento pelo id, já com a resposta de erro pronta. */
export async function lerDocumento(id: string): Promise<DocumentoLido> {
  if (!UUID.test(id)) return { ok: false, resposta: erro("Documento inválido.", 400) };
  const { data, error } = await supabaseServico()
    .from("ar1_context_docs")
    .select(COLUNAS_DOCUMENTO)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, resposta: erro(mensagemDoBanco(error), 500) };
  if (!data) return { ok: false, resposta: erro("Documento não encontrado.", 404) };
  return { ok: true, doc: data as DocContexto };
}

/** Apaga um arquivo do bucket; falha vai só para o log. */
export async function apagarArquivo(caminho: string): Promise<void> {
  const { error } = await supabaseServico().storage.from(BUCKET_CONTEXTO).remove([caminho]);
  if (error) console.error("[contexto] não foi possível apagar o arquivo", caminho, error.message);
}
