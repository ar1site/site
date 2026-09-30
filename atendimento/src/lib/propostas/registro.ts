import "server-only";

// Registro das propostas (tabela ar1_proposals) e o link do PDF guardado.
// Módulo leve, sem IA e sem gerador de PDF: é o que as rotas de envio e de
// download importam.

import { BUCKET_CONTEXTO } from "../contexto/limites";
import { UUID } from "../contexto/validar";
import { supabaseServico } from "../supabase/service";
import type { NotasInternas, PropostaRegistro } from "../tipos";
import { SEGUNDOS_DO_LINK_INTERNO } from "./mensagem";
import { ehStatusProposta } from "./premium/publico";
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

export const COLUNAS = "*";

/** Migração das propostas premium (tabela de preços, página pública, PDF pelo Chrome). */
export const MIGRACAO_PREMIUM = "20260930110000_ar1_propostas_premium.sql";
export const AVISO_FALTA_MIGRACAO_PREMIUM =
  `As propostas premium ainda não foram ativadas no banco de dados (falta aplicar a migração ${MIGRACAO_PREMIUM}).`;

/** A coluna nova não existe: a migração premium ainda não foi aplicada. */
export function colunaAusente(e: { message: string; code?: string }): boolean {
  return (
    e.code === "42703" ||
    e.code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(e.message)
  );
}

export function tabelaAusente(e: { message: string; code?: string }): boolean {
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    /(could not find the table|relation .* does not exist)/i.test(e.message)
  );
}

export function erroDoBanco(e: { message: string; code?: string }, contexto: string): ErroProposta {
  if (tabelaAusente(e)) return new ErroProposta(AVISO_FALTA_MIGRACAO, 503, true);
  if (colunaAusente(e)) return new ErroProposta(AVISO_FALTA_MIGRACAO_PREMIUM, 503, true);
  return new ErroProposta(`${contexto}: ${e.message}`, 500);
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** numeric chega como texto; jsonb pode chegar vazio; colunas premium podem faltar (migração pendente). */
export function normalizar(linha: Record<string, unknown>): PropostaRegistro {
  const r = linha as unknown as PropostaRegistro;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    ...r,
    total: numero(r.total),
    pending_items: numero(r.pending_items) ?? 0,
    sources: Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === "string") : [],
    file_path: texto(r.file_path),
    kind: r.kind === "premium" ? "premium" : "pdf",
    status: ehStatusProposta(r.status) ? r.status : r.sent_at ? "enviada" : "gerada",
    service: texto(r.service),
    public_token: texto(r.public_token),
    public_days: numero(r.public_days) ?? 30,
    public_expires_at: texto(r.public_expires_at),
    views: numero(r.views) ?? 0,
    first_viewed_at: texto(r.first_viewed_at),
    last_viewed_at: texto(r.last_viewed_at),
    accepted_at: texto(r.accepted_at),
    accepted_name: texto(r.accepted_name),
    decided_at: texto(r.decided_at),
    decided_by: texto(r.decided_by),
    unconfirmed_prices: r.unconfirmed_prices === true,
    pdf_engine: r.pdf_engine === "chrome" || r.pdf_engine === "pdf-lib" ? r.pdf_engine : null,
    pdf_error: texto(r.pdf_error),
    updated_at: texto(r.updated_at) ?? r.created_at,
    internal_notes: lerNotasInternas((linha as Record<string, unknown>).internal_notes),
  };
}

/** internal_notes (jsonb) com forma garantida; null quando a coluna não existe ou está vazia. */
export function lerNotasInternas(valor: unknown): NotasInternas | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const o = valor as Record<string, unknown>;
  const lista = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 20) : [];
  const notas = {
    pendencias: lista(o.pendencias),
    avisos: lista(o.avisos),
    atualizado_em: typeof o.atualizado_em === "string" ? o.atualizado_em : null,
  };
  return notas.pendencias.length || notas.avisos.length ? notas : null;
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
  if (!proposta.file_path) throw new ErroProposta("Esta proposta ainda não tem PDF. Gere o PDF primeiro.", 404);
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
  // A situação "enviada" só existe depois da migração premium; sem ela, a marca de envio basta.
  const { error: erroStatus } = await supabaseServico()
    .from(TABELA)
    .update({ status: "enviada" })
    .eq("id", entrada.propostaId)
    .in("status", ["rascunho", "gerada"]);
  if (erroStatus && !colunaAusente(erroStatus)) {
    console.error("[propostas] a situação da proposta não foi atualizada:", erroStatus.message);
  }
  if (error) console.error("[propostas] a mensagem saiu, mas a proposta não foi marcada como enviada:", error.message);
}
