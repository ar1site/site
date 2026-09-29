"use client";

// Funil de vendas: quadro por etapas. No desktop, colunas lado a lado com
// arrastar-e-soltar; no celular, uma etapa por vez (abas) e "Mover para…" em
// cada cartão. Quem muda etapa e valor é sempre uma pessoa.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nomeCurto, useEquipe } from "@/lib/equipe";
import {
  atualizarOportunidade,
  buscarOportunidades,
  contatoPeloTelefone,
  criarOportunidade,
} from "@/lib/funil/dados";
import { diaCurto } from "@/lib/funil/datas";
import {
  acaoVencida,
  DIAS_FECHADOS_RECENTES,
  ETAPAS,
  etapaAberta,
  fechouRecentemente,
  filtrarOportunidades,
  FILTROS_PADRAO,
  formatarReais,
  ordenarCartoes,
  ORIGENS,
  probabilidadeEfetiva,
  resumoDoFunil,
  ROTULO_ETAPA,
  ROTULO_ORIGEM,
  textoDiasNaEtapa,
  transicaoPede,
  validarTransicao,
  type CamposDaTransicao,
  type FiltrosDoFunil,
} from "@/lib/funil/etapas";
import type { CamposNovaOportunidade } from "@/lib/funil/formulario";
import { useRealtime } from "@/lib/realtime";
import { CONSULTA_DESKTOP, useMedia } from "@/lib/tela";
import type { EtapaFunil, Oportunidade, OrigemOportunidade } from "@/lib/tipos";
import { Dialogo, DialogoDeEtapa, FormularioOportunidade, type PedidoDeEtapa } from "./DialogosFunil";
import { SeloOrigem } from "./Selos";

// Guarda a última lista e os filtros enquanto a aba está aberta: abrir uma
// oportunidade e voltar não pisca "Carregando…" nem perde o filtro.
let listaEmCache: Oportunidade[] | null = null;
let filtrosEmCache: FiltrosDoFunil = FILTROS_PADRAO;
let etapaEmCache: EtapaFunil = "new";

export function Funil({ selecionadoId }: { selecionadoId?: string }) {
  const { membros, eu, nomeDe } = useEquipe();
  const desktop = useMedia(CONSULTA_DESKTOP);
  const [lista, setLista] = useState<Oportunidade[] | null>(listaEmCache);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [filtros, setFiltrosEstado] = useState<FiltrosDoFunil>(filtrosEmCache);
  const [etapaAtiva, setEtapaAtivaEstado] = useState<EtapaFunil>(etapaEmCache);
  const [abertas, setAbertas] = useState<Record<"won" | "lost", boolean>>({ won: false, lost: false });
  const [antigos, setAntigos] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [pedido, setPedido] = useState<PedidoDeEtapa | null>(null);
  const [movendo, setMovendo] = useState(false);
  const [criando, setCriando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EtapaFunil | null>(null);

  const setFiltros = useCallback((f: FiltrosDoFunil) => {
    filtrosEmCache = f;
    setFiltrosEstado(f);
  }, []);
  const setEtapaAtiva = useCallback((e: EtapaFunil) => {
    etapaEmCache = e;
    setEtapaAtivaEstado(e);
  }, []);

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 3000 : 7000);
  }, []);

  const carregar = useCallback(() => {
    return buscarOportunidades().then((r) => {
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      listaEmCache = r.lista;
      setLista(r.lista);
      setAgora(Date.now());
    });
  }, []);

  useEffect(() => {
    let ativo = true;
    buscarOportunidades().then((r) => {
      if (!ativo) return;
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      listaEmCache = r.lista;
      setLista(r.lista);
      setAgora(Date.now());
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Tempo real + recarga de segurança a cada 60 s.
  useRealtime({ tabelas: ["ar1_quote_requests"], aoMudar: carregar, intervaloMs: 60_000 });

  // ------------------------------------------------------------------ dados

  const filtradas = useMemo(() => filtrarOportunidades(lista ?? [], filtros), [lista, filtros]);
  const resumo = useMemo(() => resumoDoFunil(filtradas), [filtradas]);

  const porEtapa = useMemo(() => {
    const mapa = Object.fromEntries(ETAPAS.map((e) => [e, [] as Oportunidade[]])) as Record<EtapaFunil, Oportunidade[]>;
    for (const o of filtradas) mapa[o.status]?.push(o);
    for (const e of ETAPAS) {
      if (etapaAberta(e)) {
        mapa[e] = ordenarCartoes(mapa[e], agora);
      } else {
        // Fechadas: a mais recente primeiro.
        mapa[e] = [...mapa[e]].sort((a, b) =>
          (b.closed_at ?? b.stage_changed_at).localeCompare(a.closed_at ?? a.stage_changed_at),
        );
      }
    }
    return mapa;
  }, [filtradas, agora]);

  /** Cartões visíveis de uma etapa: nas fechadas, só os dos últimos 30 dias (a não ser que peça os antigos). */
  const visiveis = useCallback(
    (etapa: EtapaFunil) => {
      const todos = porEtapa[etapa];
      if (etapaAberta(etapa) || antigos) return todos;
      return todos.filter((o) => fechouRecentemente(o, agora));
    },
    [porEtapa, antigos, agora],
  );

  const responsaveis = useMemo(() => {
    const ids = new Set<string>();
    for (const o of lista ?? []) if (o.assigned_to) ids.add(o.assigned_to);
    for (const m of membros) if (m.active) ids.add(m.user_id);
    return [...ids];
  }, [lista, membros]);

  const temFiltro =
    filtros.origem !== "todas" || filtros.responsavel !== "todos" || filtros.busca.trim() !== "";

  // ------------------------------------------------------------------ ações

  async function gravarEtapa(o: Oportunidade, campos: CamposDaTransicao): Promise<boolean> {
    setMovendo(true);
    // Otimista: o cartão muda de coluna na hora; se o banco recusar, volta.
    const anterior = lista;
    const alterada: Oportunidade = { ...o, ...campos, stage_changed_at: new Date().toISOString() };
    setLista((l) => (l ? l.map((x) => (x.id === o.id ? alterada : x)) : l));
    const r = await atualizarOportunidade(o.id, campos);
    setMovendo(false);
    if (!r.ok) {
      setLista(anterior);
      mostrar("erro", r.erro);
      return false;
    }
    mostrar("ok", `${o.name}: agora em ${ROTULO_ETAPA[campos.status ?? o.status]}.`);
    void carregar();
    return true;
  }

  function mover(o: Oportunidade, para: EtapaFunil) {
    if (o.status === para) return;
    if (transicaoPede(para)) {
      setPedido({ oportunidade: o, para });
      return;
    }
    const r = validarTransicao({ de: o.status, para });
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    void gravarEtapa(o, r.campos);
  }

  async function confirmarPedido(campos: CamposDaTransicao) {
    if (!pedido) return;
    const o = (lista ?? []).find((x) => x.id === pedido.oportunidade.id);
    if (!o) {
      setPedido(null);
      return;
    }
    const ok = await gravarEtapa(o, campos);
    if (ok) setPedido(null);
  }

  async function criar(campos: CamposNovaOportunidade): Promise<string | null> {
    const contactId = await contatoPeloTelefone(campos.phone);
    const r = await criarOportunidade({ ...campos, contact_id: contactId, source_path: "painel" });
    if (!r.ok) return r.erro;
    setCriando(false);
    setEtapaAtiva(campos.status);
    mostrar("ok", "Oportunidade criada.");
    await carregar();
    return null;
  }

  function soltar(etapa: EtapaFunil, id: string) {
    setSobre(null);
    setArrastando(null);
    const o = (lista ?? []).find((x) => x.id === id);
    if (o) mover(o, etapa);
  }

  // ----------------------------------------------------------------- render

  const cartao = (o: Oportunidade) => (
    <CartaoOportunidade
      key={o.id}
      o={o}
      agora={agora}
      selecionado={o.id === selecionadoId}
      responsavel={o.assigned_to ? (o.assigned_to === eu ? "você" : nomeDe(o.assigned_to)) : null}
      arrastavel={desktop}
      arrastando={arrastando === o.id}
      aoArrastar={(id) => setArrastando(id)}
      aoMover={(para) => mover(o, para)}
    />
  );

  const rodapeFechadas = (etapa: EtapaFunil) => {
    if (etapaAberta(etapa)) return null;
    const escondidas = porEtapa[etapa].length - visiveis(etapa).length;
    if (!antigos && escondidas === 0) return null;
    return (
      <button type="button" className="w-full py-1 text-center text-xs text-apoio underline" onClick={() => setAntigos((v) => !v)}>
        {antigos ? `Mostrar só os últimos ${DIAS_FECHADOS_RECENTES} dias` : `Mostrar mais antigas (${escondidas})`}
      </button>
    );
  };

  return (
    <div className="flex flex-col lg:h-dvh">
      {/* Topo: título, totais e filtros */}
      <div className="space-y-3 px-4 pb-3 pt-4 lg:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl">Funil</h1>
          <button type="button" className="botao botao-primario" onClick={() => setCriando(true)}>
            <span aria-hidden>+</span> Nova oportunidade
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:max-w-xl">
          <div className="cartao px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-apoio">Em aberto</p>
            <p className="titulo text-lg leading-tight">{formatarReais(resumo.totalEmAberto)}</p>
            <p className="text-[11px] text-apoio">
              {resumo.quantidadeEmAberto} {resumo.quantidadeEmAberto === 1 ? "oportunidade" : "oportunidades"}
            </p>
          </div>
          <div className="cartao border-cobre/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-cobre-claro">Previsão ponderada</p>
            <p className="titulo text-lg leading-tight">{formatarReais(resumo.previsaoPonderada)}</p>
            <p className="text-[11px] text-apoio">valor × probabilidade</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            className="campo text-sm sm:max-w-xs"
            placeholder="Buscar por nome ou empresa"
            value={filtros.busca}
            onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            aria-label="Buscar por nome ou empresa"
          />
          <div className="flex gap-2">
            <select
              className="campo min-w-0 flex-1 sm:w-auto sm:flex-none"
              value={filtros.origem}
              onChange={(e) => setFiltros({ ...filtros, origem: e.target.value as OrigemOportunidade | "todas" })}
              aria-label="Filtrar por origem"
            >
              <option value="todas">Origem</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_ORIGEM[o]}
                </option>
              ))}
            </select>
            <select
              className="campo min-w-0 flex-1 sm:w-auto sm:flex-none"
              value={filtros.responsavel}
              onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}
              aria-label="Filtrar por responsável"
            >
              <option value="todos">Responsável</option>
              <option value="sem">Sem responsável</option>
              {responsaveis.map((id) => {
                const m = membros.find((x) => x.user_id === id);
                return (
                  <option key={id} value={id}>
                    {id === eu ? "Comigo" : m ? nomeCurto(m.email) : "Equipe"}
                  </option>
                );
              })}
            </select>
          </div>
          {temFiltro && (
            <button type="button" className="self-start text-xs text-apoio underline sm:self-center" onClick={() => setFiltros(FILTROS_PADRAO)}>
              limpar filtros
            </button>
          )}
        </div>

        {aviso && (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2 text-sm ${
              aviso.tipo === "erro" ? "border-erro/50 bg-erro/10 text-erro" : "border-ok/50 bg-ok/10 text-ok"
            }`}
          >
            {aviso.texto}
          </div>
        )}
        {erro && <p className="text-sm text-erro">{erro}</p>}
      </div>

      {lista === null ? (
        <p className="px-4 py-8 text-center text-sm text-apoio">Carregando…</p>
      ) : desktop ? (
        /* ------------------------------------------------ quadro (desktop) */
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4">
          {ETAPAS.map((etapa) => {
            const total = resumo.porEtapa[etapa];
            const fechada = !etapaAberta(etapa);
            const recolhida = fechada && !abertas[etapa as "won" | "lost"];
            const alvo = sobre === etapa && arrastando !== null;
            return (
              <section
                key={etapa}
                aria-label={ROTULO_ETAPA[etapa]}
                onDragOver={(e) => {
                  if (!arrastando) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (sobre !== etapa) setSobre(etapa);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre((s) => (s === etapa ? null : s));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  soltar(etapa, e.dataTransfer.getData("text/plain") || arrastando || "");
                }}
                className={`flex shrink-0 flex-col rounded-xl border bg-superficie-2 transition-colors ${
                  recolhida ? "w-44" : "w-72"
                } ${alvo ? "border-cobre bg-cobre/10" : "border-borda"}`}
              >
                <header className="border-b border-borda px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-xs">{ROTULO_ETAPA[etapa]}</h2>
                    <span className="selo">{total.quantidade}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-apoio">{formatarReais(total.soma)}</p>
                  {fechada && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-cobre-claro underline"
                      onClick={() => setAbertas((a) => ({ ...a, [etapa]: !a[etapa as "won" | "lost"] }))}
                      aria-expanded={!recolhida}
                    >
                      {recolhida ? "Mostrar" : "Recolher"}
                    </button>
                  )}
                </header>
                {recolhida ? (
                  <p className="px-3 py-3 text-[11px] leading-snug text-apoio">
                    {visiveis(etapa).length} nos últimos {DIAS_FECHADOS_RECENTES} dias. Solte um cartão aqui para mover.
                  </p>
                ) : (
                  <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {visiveis(etapa).length === 0 && (
                      <p className="px-1 py-4 text-center text-xs text-apoio/70">
                        {fechada ? `Nada nos últimos ${DIAS_FECHADOS_RECENTES} dias.` : "Nenhuma oportunidade."}
                      </p>
                    )}
                    {visiveis(etapa).map(cartao)}
                    {rodapeFechadas(etapa)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* ----------------------------------------- uma etapa por vez (celular) */
        <div className="flex flex-col">
          <div className="sticky top-0 z-10 -mb-px flex gap-1 overflow-x-auto border-b border-borda bg-fundo px-4 pb-2 pt-1" role="tablist" aria-label="Etapas do funil">
            {ETAPAS.map((etapa) => (
              <button
                key={etapa}
                role="tab"
                aria-selected={etapaAtiva === etapa}
                onClick={(e) => {
                  setEtapaAtiva(etapa);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "center" });
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  etapaAtiva === etapa ? "border-cobre bg-cobre/15 text-cobre-claro" : "border-borda text-apoio"
                }`}
              >
                {ROTULO_ETAPA[etapa]}
                <span className={`rounded-full px-1.5 text-[10px] ${etapaAtiva === etapa ? "bg-cobre/30" : "bg-superficie"}`}>
                  {resumo.porEtapa[etapa].quantidade}
                </span>
              </button>
            ))}
          </div>
          <div className="px-4 pb-4 pt-3" role="tabpanel">
            <p className="mb-2 text-xs text-apoio">
              {ROTULO_ETAPA[etapaAtiva]}: {resumo.porEtapa[etapaAtiva].quantidade}{" "}
              {resumo.porEtapa[etapaAtiva].quantidade === 1 ? "oportunidade" : "oportunidades"} ·{" "}
              {formatarReais(resumo.porEtapa[etapaAtiva].soma)}
              {!etapaAberta(etapaAtiva) && !antigos ? ` · mostrando os últimos ${DIAS_FECHADOS_RECENTES} dias` : ""}
            </p>
            <div className="flex flex-col gap-2">
              {visiveis(etapaAtiva).length === 0 && (
                <p className="py-8 text-center text-sm text-apoio">
                  {temFiltro ? "Nenhuma oportunidade com esses filtros." : "Nenhuma oportunidade nesta etapa."}
                </p>
              )}
              {visiveis(etapaAtiva).map(cartao)}
              {rodapeFechadas(etapaAtiva)}
            </div>
          </div>
        </div>
      )}

      {pedido && (
        <DialogoDeEtapa pedido={pedido} ocupado={movendo} aoConfirmar={confirmarPedido} aoCancelar={() => setPedido(null)} />
      )}
      {criando && (
        <Dialogo titulo="Nova oportunidade" aoFechar={() => setCriando(false)}>
          <FormularioOportunidade
            inicial={{ source: "indicacao", assigned_to: eu }}
            aoSalvar={criar}
            aoCancelar={() => setCriando(false)}
          />
        </Dialogo>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- cartão

function CartaoOportunidade({
  o,
  agora,
  selecionado,
  responsavel,
  arrastavel,
  arrastando,
  aoArrastar,
  aoMover,
}: {
  o: Oportunidade;
  agora: number;
  selecionado: boolean;
  responsavel: string | null;
  arrastavel: boolean;
  arrastando: boolean;
  aoArrastar: (id: string | null) => void;
  aoMover: (para: EtapaFunil) => void;
}) {
  const vencida = acaoVencida(o, agora);
  const prob = probabilidadeEfetiva(o);
  const aberta = etapaAberta(o.status);
  const empresa = o.company && o.company !== "Não informada" ? o.company : null;
  const ref = useRef<HTMLElement>(null);

  // Com o painel de detalhe aberto, o cartão escolhido aparece no quadro.
  useEffect(() => {
    if (selecionado) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selecionado]);

  return (
    <article
      ref={ref}
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", o.id);
        e.dataTransfer.effectAllowed = "move";
        aoArrastar(o.id);
      }}
      onDragEnd={() => aoArrastar(null)}
      className={`cartao p-3 text-sm transition-opacity ${arrastavel ? "cursor-grab active:cursor-grabbing" : ""} ${
        selecionado ? "border-cobre" : ""
      } ${arrastando ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/funil/${o.id}`} draggable={false} className="min-w-0 font-semibold leading-snug hover:underline">
          <span className="line-clamp-2 break-words">{o.name}</span>
        </Link>
        <SeloOrigem origem={o.source} />
      </div>
      <p className="mt-0.5 truncate text-xs text-apoio">{[empresa, o.project_type].filter(Boolean).join(" · ")}</p>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className={o.estimated_value === null ? "text-apoio" : "font-semibold"}>{formatarReais(o.estimated_value)}</span>
        {aberta && (
          <span className="text-xs text-apoio" title={prob.padrao ? "Probabilidade padrão da etapa (ainda não preenchida)" : "Probabilidade"}>
            {prob.valor}%{prob.padrao ? " (padrão)" : ""}
          </span>
        )}
      </p>

      {aberta && o.next_action && (
        <p className={`mt-1 break-words text-xs leading-snug ${vencida ? "font-semibold text-erro" : "text-texto"}`}>
          {vencida ? "Vencida: " : "Próxima: "}
          {o.next_action}
          {o.next_action_at ? ` · ${vencida ? "era" : "até"} ${diaCurto(o.next_action_at, agora)}` : ""}
        </p>
      )}
      {aberta && !o.next_action && <p className="mt-1 text-xs text-apoio/70">Sem próxima ação</p>}
      {o.status === "lost" && o.lost_reason && (
        <p className="mt-1 line-clamp-2 break-words text-xs text-apoio">Motivo: {o.lost_reason}</p>
      )}

      <p className="mt-2 text-[11px] text-apoio">
        {responsavel ? `Com ${responsavel}` : "Sem responsável"} · {textoDiasNaEtapa(o.stage_changed_at, agora)}
      </p>

      <select
        className="campo mt-2 py-1.5 text-xs"
        value=""
        onChange={(e) => {
          if (e.target.value) aoMover(e.target.value as EtapaFunil);
        }}
        aria-label={`Mover ${o.name} para outra etapa`}
      >
        <option value="">Mover para…</option>
        {ETAPAS.filter((e) => e !== o.status).map((e) => (
          <option key={e} value={e}>
            {ROTULO_ETAPA[e]}
          </option>
        ))}
      </select>
    </article>
  );
}
