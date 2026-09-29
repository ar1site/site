"use client";

// Leitura das retomadas pelo navegador (sessão da equipe, RLS).

import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "../realtime";
import { supabaseNoNavegador } from "../supabase/browser";
import type { Atendimento, Contato, Followup, Mensagem, Oportunidade } from "../tipos";

export type MensagemDaPrevia = Pick<
  Mensagem,
  "id" | "direction" | "kind" | "body" | "media_name" | "transcript" | "sent_at"
>;

export interface ItemDeRetomada {
  followup: Followup;
  contato: Contato | null;
  atendimento: Pick<Atendimento, "id" | "status" | "last_message_at" | "last_inbound_at" | "last_outbound_at"> | null;
  oportunidade: Pick<Oportunidade, "id" | "name" | "status" | "estimated_value"> | null;
  /** Últimas mensagens da conversa, em ordem cronológica. */
  previa: MensagemDaPrevia[];
}

/** Mensagens mostradas na prévia de cada item. */
export const MENSAGENS_NA_PREVIA = 3;

function unicos(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function buscarRetomadas(): Promise<
  { pendentes: ItemDeRetomada[]; adiadas: ItemDeRetomada[] } | { erro: string }
> {
  const supabase = supabaseNoNavegador();
  const { data, error } = await supabase
    .from("ar1_followups")
    .select("*")
    .in("status", ["pendente", "adiado"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { erro: "Não foi possível carregar as retomadas. Tentando de novo em instantes." };
  const followups = (data ?? []) as Followup[];
  if (followups.length === 0) return { pendentes: [], adiadas: [] };

  const idsContatos = unicos(followups.map((f) => f.contact_id));
  const idsAtendimentos = unicos(followups.map((f) => f.atendimento_id));
  const idsOportunidades = unicos(followups.map((f) => f.quote_request_id));
  const pendentes = followups.filter((f) => f.status === "pendente");

  const [contatos, atendimentos, oportunidades, previas] = await Promise.all([
    supabase.from("ar1_wa_contacts").select("*").in("id", idsContatos),
    idsAtendimentos.length
      ? supabase
          .from("ar1_atendimentos")
          .select("id, status, last_message_at, last_inbound_at, last_outbound_at")
          .in("id", idsAtendimentos)
      : Promise.resolve({ data: [] }),
    idsOportunidades.length
      ? supabase.from("ar1_quote_requests").select("id, name, status, estimated_value").in("id", idsOportunidades)
      : Promise.resolve({ data: [] }),
    // Prévia só das pendentes (no máximo uma por contato).
    Promise.all(
      pendentes.map(async (f) => {
        if (!f.atendimento_id) return [f.id, [] as MensagemDaPrevia[]] as const;
        const { data: mensagens } = await supabase
          .from("ar1_wa_messages")
          .select("id, direction, kind, body, media_name, transcript, sent_at")
          .eq("atendimento_id", f.atendimento_id)
          .order("sent_at", { ascending: false })
          .limit(MENSAGENS_NA_PREVIA);
        return [f.id, ((mensagens ?? []) as MensagemDaPrevia[]).slice().reverse()] as const;
      }),
    ),
  ]);

  const contatoPorId = new Map(((contatos.data ?? []) as Contato[]).map((c) => [c.id, c]));
  const atendimentoPorId = new Map(
    ((atendimentos.data ?? []) as NonNullable<ItemDeRetomada["atendimento"]>[]).map((a) => [a.id, a]),
  );
  const oportunidadePorId = new Map(
    ((oportunidades.data ?? []) as NonNullable<ItemDeRetomada["oportunidade"]>[]).map((o) => [o.id, o]),
  );
  const previaPorId = new Map(previas);

  const montar = (f: Followup): ItemDeRetomada => ({
    followup: f,
    contato: contatoPorId.get(f.contact_id) ?? null,
    atendimento: f.atendimento_id ? (atendimentoPorId.get(f.atendimento_id) ?? null) : null,
    oportunidade: f.quote_request_id ? (oportunidadePorId.get(f.quote_request_id) ?? null) : null,
    previa: previaPorId.get(f.id) ?? [],
  });

  return {
    pendentes: pendentes.map(montar),
    adiadas: followups.filter((f) => f.status === "adiado").map(montar),
  };
}

async function contarPendentes(): Promise<number | null> {
  const { count, error } = await supabaseNoNavegador()
    .from("ar1_followups")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  if (error) return null;
  return count ?? 0;
}

/** Quantas retomadas esperam decisão (contador do menu). Atualiza em tempo real. */
export function usePendentesDeRetomada(): number {
  const [total, setTotal] = useState(0);

  const atualizar = useCallback(() => {
    void contarPendentes().then((n) => {
      if (n !== null) setTotal(n);
    });
  }, []);

  useEffect(() => {
    let ativo = true;
    contarPendentes().then((n) => {
      if (ativo && n !== null) setTotal(n);
    });
    return () => {
      ativo = false;
    };
  }, []);

  useRealtime({ tabelas: ["ar1_followups"], aoMudar: atualizar, intervaloMs: 60_000 });

  return total;
}
