"use client";

// Leitura e gravação das oportunidades pelo navegador (sessão da equipe, RLS).

import { useEffect, useState } from "react";
import { supabaseNoNavegador } from "../supabase/browser";
import type { Atendimento, Oportunidade } from "../tipos";
import { ehEtapa, ehOrigem, numeroOuNull } from "./etapas";
import { telefonesParaBusca, type CamposNovaOportunidade } from "./formulario";

/** Garante tipos certos (numeric pode vir como texto) e valores conhecidos. */
export function normalizarOportunidade(linha: Record<string, unknown>): Oportunidade {
  const o = linha as unknown as Oportunidade;
  return {
    ...o,
    status: ehEtapa(o.status) ? o.status : "new",
    source: ehOrigem(o.source) ? o.source : "outro",
    estimated_value: numeroOuNull(o.estimated_value),
    probability: numeroOuNull(o.probability),
  };
}

export async function buscarOportunidades(): Promise<{ lista: Oportunidade[] } | { erro: string }> {
  const { data, error } = await supabaseNoNavegador()
    .from("ar1_quote_requests")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) return { erro: "Não foi possível carregar o funil. Tentando de novo em instantes." };
  return { lista: (data ?? []).map((l) => normalizarOportunidade(l as Record<string, unknown>)) };
}

export async function buscarOportunidade(id: string): Promise<{ oportunidade: Oportunidade | null } | { erro: string }> {
  const { data, error } = await supabaseNoNavegador()
    .from("ar1_quote_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { erro: "Não foi possível abrir a oportunidade." };
  return { oportunidade: data ? normalizarOportunidade(data as Record<string, unknown>) : null };
}

export async function atualizarOportunidade(
  id: string,
  campos: Partial<Oportunidade>,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await supabaseNoNavegador().from("ar1_quote_requests").update(campos).eq("id", id);
  if (error) return { ok: false, erro: `Não foi possível salvar: ${error.message}` };
  return { ok: true };
}

/** Procura o contato do WhatsApp pelo telefone, para ligar a oportunidade a ele. */
export async function contatoPeloTelefone(telefone: string): Promise<string | null> {
  const telefones = telefonesParaBusca(telefone);
  if (!telefones.length) return null;
  const { data } = await supabaseNoNavegador()
    .from("ar1_wa_contacts")
    .select("id")
    .in("phone", telefones)
    .limit(1);
  return data?.[0]?.id ?? null;
}

export async function criarOportunidade(
  campos: CamposNovaOportunidade & Partial<Pick<Oportunidade, "contact_id" | "client_id" | "source_path">>,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data, error } = await supabaseNoNavegador()
    .from("ar1_quote_requests")
    .insert(campos)
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, erro: `Não foi possível criar a oportunidade: ${error?.message ?? "erro"}` };
  }
  return { ok: true, id: data.id as string };
}

export type ConversaDaOportunidade = Pick<
  Atendimento,
  "id" | "status" | "ai_extracted" | "ai_analyzed_at" | "last_message_at" | "quote_request_id"
>;

const COLUNAS_CONVERSA = "id, status, ai_extracted, ai_analyzed_at, last_message_at, quote_request_id";

/**
 * A conversa que vale para uma oportunidade: a ligada a ela (a mais recente)
 * ou, na falta, a conversa aberta do contato.
 */
export async function buscarConversaDaOportunidade(
  o: Pick<Oportunidade, "id" | "contact_id">,
): Promise<ConversaDaOportunidade | null> {
  const supabase = supabaseNoNavegador();
  const { data: ligadas } = await supabase
    .from("ar1_atendimentos")
    .select(COLUNAS_CONVERSA)
    .eq("quote_request_id", o.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5);
  const lista = (ligadas ?? []) as ConversaDaOportunidade[];
  const ligada = lista.find((a) => a.status !== "fechado") ?? lista[0];
  if (ligada) return ligada;
  if (!o.contact_id) return null;
  const { data: aberta } = await supabase
    .from("ar1_atendimentos")
    .select(COLUNAS_CONVERSA)
    .eq("contact_id", o.contact_id)
    .neq("status", "fechado")
    .limit(1);
  return ((aberta ?? [])[0] as ConversaDaOportunidade | undefined) ?? null;
}

// ------------------------------------------------------------------ serviços

let servicosEmCache: string[] | null = null;

/** Serviços cadastrados em Configurações (para sugerir no campo "Serviço"). */
export function useServicos(): string[] {
  const [servicos, setServicos] = useState<string[]>(servicosEmCache ?? []);
  useEffect(() => {
    if (servicosEmCache) return;
    let ativo = true;
    supabaseNoNavegador()
      .from("ar1_settings")
      .select("value")
      .eq("key", "atendimento.servicos")
      .maybeSingle()
      .then(({ data }) => {
        const lista = Array.isArray(data?.value)
          ? (data.value as unknown[]).filter((s): s is string => typeof s === "string")
          : [];
        servicosEmCache = lista;
        if (ativo) setServicos(lista);
      });
    return () => {
      ativo = false;
    };
  }, []);
  return servicos;
}
