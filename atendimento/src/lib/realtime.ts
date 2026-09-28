"use client";

import { useEffect, useRef } from "react";
import { supabaseNoNavegador } from "./supabase/browser";

interface OpcoesRealtime {
  /** Tabelas a observar (schema public). */
  tabelas: string[];
  /** Filtro PostgREST opcional aplicado a todas as tabelas (ex.: "atendimento_id=eq.<id>"). */
  filtro?: string;
  /** Chamado (com debounce curto) quando há mudança ou quando a recarga periódica dispara. */
  aoMudar: () => void;
  /** Intervalo da recarga de segurança (ms). Padrão: 60 s. */
  intervaloMs?: number;
  /** Desliga a assinatura quando falso. */
  ativo?: boolean;
}

/**
 * Assina mudanças em tempo real (Supabase Realtime) e faz uma recarga
 * periódica de segurança. Também recarrega quando a aba volta a ficar visível.
 */
export function useRealtime({ tabelas, filtro, aoMudar, intervaloMs = 60_000, ativo = true }: OpcoesRealtime) {
  const callback = useRef(aoMudar);
  useEffect(() => {
    callback.current = aoMudar;
  });
  const chaveTabelas = tabelas.join(",");

  useEffect(() => {
    if (!ativo) return;
    const supabase = supabaseNoNavegador();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disparar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callback.current(), 250);
    };

    let canal = supabase.channel(`painel-${chaveTabelas}-${filtro ?? "todos"}-${Math.random().toString(36).slice(2)}`);
    for (const tabela of chaveTabelas.split(",")) {
      canal = canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabela, ...(filtro ? { filter: filtro } : {}) },
        disparar,
      );
    }
    canal.subscribe();

    const intervalo = setInterval(() => callback.current(), intervaloMs);
    const aoVisivel = () => {
      if (document.visibilityState === "visible") callback.current();
    };
    document.addEventListener("visibilitychange", aoVisivel);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVisivel);
      supabase.removeChannel(canal);
    };
  }, [chaveTabelas, filtro, intervaloMs, ativo]);
}
