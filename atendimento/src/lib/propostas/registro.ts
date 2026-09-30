import "server-only";

// Registro das propostas (tabela ar1_proposals) e o link do PDF guardado.
// Módulo leve, sem IA e sem gerador de PDF: é o que as rotas de envio e de
// download importam.

import { BUCKET_CONTEXTO } from "../contexto/limites";
import { UUID } from "../contexto/validar";
import { supabaseServico } from "../supabase/service";
import type { PropostaRegistro } from "../tipos";
import { SEGUNDOS_DO_LINK_INTERNO } from "./mensagem";
import { nomeDoArquivo } from "./proposta";

export class ErroProposta extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    /** true quando a tabela ar1_proposals ainda não existe. */
    public readonly faltaMigracao = false,
  ) {
    super(message);
    this.name = "ErroProposta";
  }
}

export const TABELA = "ar1_proposals";
export const MIGRACAO = "20260930100000_ar1_propostas.sql";
export const AVISO_FALTA_MIGRACAO =
  `O recurso de propostas ainda não foi ativado no banco de dados (falta aplicar a migração ${MIGRACAO}).`;

export const COLUNAS =
  "id, quote_request_id, contact_id, atendimento_id, number, title, content, sources, total, pending_items, " +
  "valid_until, file_path, file_size, pages, model, created_by, created_at, sent_at, sent_by, outbox_id";

export function tabelaAusente(e: { message: string; code?: string }): boolean {
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    /(could not find the table|relation .* does not exist)/i.test(e.message)
  );
}

export function erroDoBanco(e: { message: string; code?: string }, contexto: string): ErroProposta {
  if (tabelaAusente(e)) return new ErroProposta(AVISO_FALTA_MIGRACAO, 503, true);
  return new ErroProposta(`${contexto}: ${e.message}`, 500);
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** numeric chega como texto; jsonb pode chegar vazio. */
export function normalizar(linha: Record<string, unknown>): PropostaRegistro {
  const r = linha as unknown as PropostaRegistro;
  return {
    ...r,
    total: numero(r.total),
    pending_items: numero(r.pending_items) ?? 0,
    sources: Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === "string") : [],
  };
}

// ---------------------------------------------------------------- histórico

export async function listarPropostas(oportunidadeId: string): Promise<PropostaRegistro[]> {
  if (!UUID.test(oportunidadeId)) throw new ErroProposta("Oportunidade inválida.", 400);
  const { data, error } = await supabaseServico()
    .from(TABELA)
    .select(COLUNAS)
    .eq("quote_request_id", oportunidadeId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw erroDoBanco(error, "Erro ao ler as propostas");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizar);
}

export async function lerProposta(id: string): Promise<PropostaRegistro> {
  if (!UUID.test(id)) throw new ErroProposta("Proposta inválida.", 400);
  const { data, error } = await supabaseServico().from(TABELA).select(COLUNAS).eq("id", id).maybeSingle();
  if (error) throw erroDoBanco(error, "Erro ao ler a proposta");
  if (!data) throw new ErroProposta("Proposta não encontrada.", 404);
  return normalizar(data as unknown as Record<string, unknown>);
}

/** URL assinada do PDF (o navegador baixa com o nome certo). */
export async function linkDoPdf(proposta: PropostaRegistro, segundos = SEGUNDOS_DO_LINK_INTERNO): Promise<string> {
  const { data, error } = await supabaseServico()
    .storage.from(BUCKET_CONTEXTO)
    .createSignedUrl(proposta.file_path, segundos, {
      download: nomeDoArquivo(proposta.number, proposta.content?.cliente ?? { nome: "", empresa: null }),
    });
  if (error || !data?.signedUrl) throw new ErroProposta("Arquivo da proposta não encontrado no armazenamento.", 404);
  return data.signedUrl;
}

/** Marca a proposta como enviada (o link saiu pelo WhatsApp). Falha só vai para o log. */
export async function marcarComoEnviada(entrada: {
  propostaId: string;
  usuarioId: string;
  outboxId: string | null;
  quando: string;
}): Promise<void> {
  const { error } = await supabaseServico()
    .from(TABELA)
    .update({ sent_at: entrada.quando, sent_by: entrada.usuarioId, outbox_id: entrada.outboxId })
    .eq("id", entrada.propostaId);
  if (error) console.error("[propostas] a mensagem saiu, mas a proposta não foi marcada como enviada:", error.message);
}
