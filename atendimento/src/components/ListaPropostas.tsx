"use client";

// Tela Propostas: todas as propostas (premium e em PDF), com busca, filtro
// por situação e o botão "Nova proposta".

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useEquipe } from "@/lib/equipe";
import { diaCurto } from "@/lib/funil/datas";
import { buscarTodasAsPropostas } from "@/lib/propostas/dados";
import { ROTULO_STATUS_PROPOSTA, type StatusProposta } from "@/lib/propostas/premium/publico";
import type { PropostaRegistro } from "@/lib/tipos";
import { SeloSituacao, totalDoRegistro } from "./Propostas";

const SITUACOES: (StatusProposta | "todas")[] = ["todas", "gerada", "enviada", "aceita", "recusada", "rascunho"];

export function ListaPropostas() {
  const { nomeDe } = useEquipe();
  const [lista, setLista] = useState<PropostaRegistro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [faltaMigracao, setFaltaMigracao] = useState(false);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<StatusProposta | "todas">("todas");
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    let ativo = true;
    buscarTodasAsPropostas().then((r) => {
      if (!ativo) return;
      if (r.ok) setLista(r.propostas);
      else {
        setLista([]);
        setErro(r.erro);
        setFaltaMigracao(r.faltaMigracao === true);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (lista ?? []).filter((p) => {
      if (situacao !== "todas" && p.status !== situacao) return false;
      if (!termo) return true;
      const c = p.content?.cliente;
      return [p.number, p.title, p.service ?? "", c?.nome ?? "", c?.empresa ?? ""].join(" ").toLowerCase().includes(termo);
    });
  }, [lista, busca, situacao]);

  const contagem = (s: StatusProposta | "todas") =>
    s === "todas" ? (lista ?? []).length : (lista ?? []).filter((p) => p.status === s).length;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-4 lg:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl">Propostas</h1>
          <p className="text-xs text-apoio">Apresentações premium para clientes do WhatsApp ou de fora dele.</p>
        </div>
        <Link href="/propostas/nova" className="botao botao-primario w-full sm:w-auto">
          + Nova proposta
        </Link>
      </header>

      {erro && (
        <p className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${faltaMigracao ? "border-alerta/60 bg-alerta/10 text-alerta" : "border-erro/50 bg-erro/10 text-erro"}`}>
          {erro}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="campo text-sm sm:flex-1"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número, cliente, empresa ou serviço"
          aria-label="Buscar propostas"
          autoComplete="off"
        />
        <select className="campo text-sm sm:w-48" value={situacao} onChange={(e) => setSituacao(e.target.value as StatusProposta | "todas")} aria-label="Situação">
          {SITUACOES.map((s) => (
            <option key={s} value={s}>
              {s === "todas" ? "Todas" : ROTULO_STATUS_PROPOSTA[s]} ({contagem(s)})
            </option>
          ))}
        </select>
      </div>

      {lista === null && <p className="text-sm text-apoio">Carregando propostas…</p>}
      {lista !== null && filtradas.length === 0 && !erro && (
        <p className="cartao p-6 text-center text-sm text-apoio">
          {lista.length === 0 ? "Nenhuma proposta ainda. Crie a primeira em “Nova proposta”." : "Nenhuma proposta com esse filtro."}
        </p>
      )}

      {filtradas.length > 0 && (
        <ul className="space-y-2">
          {filtradas.map((p) => {
            const c = p.content?.cliente;
            const href = p.kind === "premium" ? `/propostas/${p.id}` : `/funil/${p.quote_request_id}`;
            return (
              <li key={p.id}>
                <Link href={href} className="cartao block p-3 transition-colors hover:border-apoio sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold tracking-wide">
                      {p.number}
                      {p.kind !== "premium" && <span className="ml-1.5 text-[10px] font-normal text-apoio">PDF</span>}
                    </span>
                    <SeloSituacao p={p} agora={agora} />
                  </div>
                  <p className="mt-1 break-words text-sm">{p.title}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-apoio">
                    <span>
                      <span className="text-texto">{c?.empresa || c?.nome || "Cliente"}</span>
                      {c?.empresa && c?.nome ? ` · ${c.nome}` : ""}
                    </span>
                    {p.service && <span>{p.service}</span>}
                    <span className="font-semibold text-texto">{totalDoRegistro(p)}</span>
                    <span>{diaCurto(p.created_at, agora)}</span>
                    <span>{nomeDe(p.created_by) || "equipe"}</span>
                    {p.kind === "premium" && p.views > 0 && (
                      <span>
                        {p.views} {p.views === 1 ? "visualização" : "visualizações"}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
