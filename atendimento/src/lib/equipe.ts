"use client";

import { useEffect, useState } from "react";
import type { MembroEquipe } from "./tipos";

interface DadosEquipe {
  membros: MembroEquipe[];
  eu: string;
}

let cache: DadosEquipe | null = null;
let carregando: Promise<DadosEquipe | null> | null = null;

async function carregar(): Promise<DadosEquipe | null> {
  if (cache) return cache;
  if (!carregando) {
    carregando = fetch("/api/equipe", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.ok) return null;
        cache = { membros: j.membros as MembroEquipe[], eu: j.eu as string };
        return cache;
      })
      .catch(() => null)
      .finally(() => {
        carregando = null;
      });
  }
  return carregando;
}

/** Nome curto de um membro da equipe (parte antes do @ do e-mail). */
export function nomeCurto(email: string | null | undefined): string {
  if (!email) return "Equipe";
  const antes = email.split("@")[0] ?? email;
  return antes.charAt(0).toUpperCase() + antes.slice(1);
}

/** Hook com a equipe (cacheada por aba) e um resolvedor de nomes por user_id. */
export function useEquipe() {
  const [dados, setDados] = useState<DadosEquipe | null>(cache);

  useEffect(() => {
    let ativo = true;
    carregar().then((d) => {
      if (ativo && d) setDados(d);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function nomeDe(userId: string | null | undefined): string {
    if (!userId) return "";
    if (dados?.eu === userId) return "você";
    const m = dados?.membros.find((x) => x.user_id === userId);
    return m ? nomeCurto(m.email) : "equipe";
  }

  async function recarregar() {
    cache = null;
    const d = await carregar();
    if (d) setDados(d);
  }

  return { membros: dados?.membros ?? [], eu: dados?.eu ?? null, nomeDe, recarregar };
}
