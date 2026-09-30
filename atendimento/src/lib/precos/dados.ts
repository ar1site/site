"use client";

// Leitura e gravação da tabela de preços pelo navegador (sessão da equipe, RLS).

import { supabaseNoNavegador } from "../supabase/browser";
import { AVISO_FALTA_MIGRACAO_PRECOS, TABELA_PRECOS } from "./limites";
import { normalizarItem, type CamposDoItem, type ItemDePreco } from "./precos";

export type RespostaPrecos<T> = ({ ok: true } & T) | { ok: false; erro: string; faltaMigracao?: boolean };

function tabelaAusente(e: { message: string; code?: string }): boolean {
  return e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message);
}

function falha(e: { message: string; code?: string }, contexto: string): { ok: false; erro: string; faltaMigracao?: boolean } {
  if (tabelaAusente(e)) return { ok: false, erro: AVISO_FALTA_MIGRACAO_PRECOS, faltaMigracao: true };
  return { ok: false, erro: `${contexto}: ${e.message}` };
}

export async function buscarItensDePreco(): Promise<RespostaPrecos<{ itens: ItemDePreco[] }>> {
  const { data, error } = await supabaseNoNavegador()
    .from(TABELA_PRECOS)
    .select("*")
    .order("service")
    .order("sort_order")
    .limit(500);
  if (error) return falha(error, "Não foi possível carregar a tabela de preços");
  return { ok: true, itens: (data ?? []).map((l) => normalizarItem(l as Record<string, unknown>)) };
}

export async function criarItemDePreco(
  campos: CamposDoItem,
  usuarioId: string,
): Promise<RespostaPrecos<{ item: ItemDePreco }>> {
  const { data, error } = await supabaseNoNavegador()
    .from(TABELA_PRECOS)
    .insert({ ...campos, active: true, confirmed: false, sort_order: 9999, updated_by: usuarioId })
    .select("*")
    .single();
  if (error || !data) return falha(error ?? { message: "sem resposta" }, "Não foi possível adicionar o item");
  return { ok: true, item: normalizarItem(data as Record<string, unknown>) };
}

export async function alterarItemDePreco(
  id: string,
  campos: Partial<CamposDoItem> & Partial<Pick<ItemDePreco, "active" | "confirmed" | "sort_order">>,
  usuarioId: string,
): Promise<RespostaPrecos<{ item: ItemDePreco }>> {
  const { data, error } = await supabaseNoNavegador()
    .from(TABELA_PRECOS)
    .update({ ...campos, updated_by: usuarioId })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return falha(error ?? { message: "sem resposta" }, "Não foi possível salvar o item");
  return { ok: true, item: normalizarItem(data as Record<string, unknown>) };
}

export async function removerItemDePreco(id: string): Promise<RespostaPrecos<Record<never, never>>> {
  const { error } = await supabaseNoNavegador().from(TABELA_PRECOS).delete().eq("id", id);
  if (error) return falha(error, "Não foi possível remover o item");
  return { ok: true };
}
