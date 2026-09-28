"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEquipe } from "@/lib/equipe";
import { formatarTelefone, nomeDoContato, somenteDigitos, tempoRelativo } from "@/lib/formato";
import { useRealtime } from "@/lib/realtime";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import type { AtendimentoDaFila, StatusAtendimento } from "@/lib/tipos";
import { Avatar, SeloKind, SeloServico, SeloUrgencia } from "./Selos";

type Aba = "todos" | StatusAtendimento;

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "novo", rotulo: "Novos" },
  { id: "em_atendimento", rotulo: "Em atendimento" },
  { id: "aguardando_cliente", rotulo: "Aguardando cliente" },
  { id: "fechado", rotulo: "Fechados" },
];

function ordenar(lista: AtendimentoDaFila[]): AtendimentoDaFila[] {
  const peso = (a: AtendimentoDaFila) => {
    let p = 0;
    if (a.unread_count > 0) p += 2;
    if (a.ai_urgency === "alta") p += 1;
    return p;
  };
  return [...lista].sort((a, b) => {
    const d = peso(b) - peso(a);
    if (d !== 0) return d;
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });
}

type Conjunto = "abertos" | "fechados";

/** Busca a fila no Supabase (abertos ou fechados). Puro: não mexe em estado. */
async function buscarFila(conjunto: Conjunto): Promise<{ itens: AtendimentoDaFila[] } | { erro: string }> {
  const supabase = supabaseNoNavegador();
  let q = supabase
    .from("ar1_atendimentos")
    .select("*, contato:ar1_wa_contacts(*), sugestoes_pendentes:ar1_ai_suggestions(id)")
    .eq("ar1_ai_suggestions.status", "pendente")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(300);
  q = conjunto === "fechados" ? q.eq("status", "fechado") : q.neq("status", "fechado");
  const { data, error } = await q;
  if (error) return { erro: "Não foi possível carregar a fila. Tentando de novo em instantes." };
  return { itens: (data ?? []) as AtendimentoDaFila[] };
}

export function Fila({ compacta = false, selecionadoId }: { compacta?: boolean; selecionadoId?: string }) {
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");
  // Guarda o conjunto junto com a lista: se a aba mudou e a lista ainda é do outro conjunto, mostra "carregando".
  const [dados, setDados] = useState<{ conjunto: Conjunto; itens: AtendimentoDaFila[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const { nomeDe } = useEquipe();
  const conjunto: Conjunto = aba === "fechado" ? "fechados" : "abertos";
  const itens = dados && dados.conjunto === conjunto ? dados.itens : null;

  const carregar = useCallback(() => {
    return buscarFila(conjunto).then((r) => {
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setDados({ conjunto, itens: r.itens });
      setAgora(Date.now());
    });
  }, [conjunto]);

  useEffect(() => {
    let ativo = true;
    buscarFila(conjunto).then((r) => {
      if (!ativo) return;
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setDados({ conjunto, itens: r.itens });
      setAgora(Date.now());
    });
    return () => {
      ativo = false;
    };
  }, [conjunto]);

  useRealtime({
    tabelas: ["ar1_atendimentos", "ar1_wa_messages", "ar1_ai_suggestions"],
    aoMudar: carregar,
  });

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const filtrados = useMemo(() => {
    if (!itens) return [];
    let lista = itens;
    if (aba !== "todos" && aba !== "fechado") lista = lista.filter((a) => a.status === aba);
    const termo = busca.trim().toLowerCase();
    const digitos = somenteDigitos(termo);
    if (termo) {
      lista = lista.filter((a) => {
        const nome = nomeDoContato(a.contato).toLowerCase();
        const empresa = (a.contato?.company ?? "").toLowerCase();
        const tel = a.contato?.phone ?? "";
        return nome.includes(termo) || empresa.includes(termo) || (digitos.length >= 3 && tel.includes(digitos));
      });
    }
    return ordenar(lista);
  }, [itens, aba, busca]);

  return (
    <div className={`flex h-full flex-col ${compacta ? "" : "mx-auto w-full max-w-3xl"}`}>
      <div className={`sticky top-0 z-10 space-y-3 bg-fundo px-4 pb-2 pt-4 ${compacta ? "" : "lg:pt-6"}`}>
        {!compacta && <h1 className="text-xl">Fila de atendimento</h1>}
        <input
          type="search"
          className="campo"
          placeholder="Buscar por nome, empresa ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar"
        />
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                aba === a.id
                  ? "border-cobre bg-cobre/15 text-cobre-claro"
                  : "border-borda text-apoio hover:text-texto"
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="px-4 py-2 text-sm text-erro">{erro}</p>}

      <ul className="flex flex-col gap-2 px-4 pb-4">
        {itens === null && <li className="py-8 text-center text-sm text-apoio">Carregando…</li>}
        {itens !== null && filtrados.length === 0 && (
          <li className="py-8 text-center text-sm text-apoio">
            {busca ? "Nenhum atendimento encontrado." : "Nenhum atendimento por aqui."}
          </li>
        )}
        {filtrados.map((a) => {
          const nome = nomeDoContato(a.contato);
          const temSugestao = (a.sugestoes_pendentes?.length ?? 0) > 0;
          const selecionado = a.id === selecionadoId;
          return (
            <li key={a.id}>
              <Link
                href={`/atendimento/${a.id}`}
                className={`cartao flex gap-3 p-3 transition-colors hover:border-apoio/60 ${
                  selecionado ? "border-cobre" : ""
                } ${a.unread_count > 0 ? "bg-superficie" : "bg-superficie-2"}`}
              >
                <Avatar nome={nome} foto={a.contato?.photo_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate ${a.unread_count > 0 ? "font-semibold" : "font-medium"}`}>{nome}</p>
                    <span className="shrink-0 text-[11px] text-apoio">{tempoRelativo(a.last_message_at, agora)}</span>
                  </div>
                  <p className="truncate text-xs text-apoio">
                    {a.contato?.company || formatarTelefone(a.contato?.phone)}
                  </p>
                  {(a.ai_kind || a.ai_service || a.ai_urgency) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <SeloKind kind={a.ai_kind} />
                      <SeloServico servico={a.ai_service} />
                      <SeloUrgencia urgencia={a.ai_urgency} />
                    </div>
                  )}
                  {a.ai_summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-apoio">{a.ai_summary}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {temSugestao && <span className="font-semibold text-ok">Resposta sugerida pronta</span>}
                    {a.assigned_to && <span className="text-apoio">Com {nomeDe(a.assigned_to)}</span>}
                    {!a.assigned_to && a.status !== "fechado" && <span className="text-apoio/70">Sem responsável</span>}
                  </div>
                </div>
                {a.unread_count > 0 && (
                  <span className="self-center rounded-full bg-cobre px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${a.unread_count} não lidas`}>
                    {a.unread_count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
