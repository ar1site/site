"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { separarFontes } from "@/lib/contexto/fontes";
import { useEquipe } from "@/lib/equipe";
import {
  dataCurta,
  formatarDataPrevista,
  formatarTelefone,
  nomeDoContato,
  ROTULO_EXTRAIDO,
  ROTULO_OUTCOME,
  ROTULO_STATUS,
  tempoRelativo,
} from "@/lib/formato";
import { useRealtime } from "@/lib/realtime";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import type {
  Atendimento,
  Contato,
  DadosExtraidos,
  Mensagem,
  Outcome,
  Outbox,
  StatusAtendimento,
  Sugestao,
} from "@/lib/tipos";
import { Balao, BalaoFila } from "./Balao";
import { ContextoDocs } from "./ContextoDocs";
import { Avatar, SeloKind, SeloServico, SeloStatus, SeloUrgencia } from "./Selos";
import { useUsuarioAtual } from "./Shell";

/** Mesmo ponto de quebra do `xl` do Tailwind: acima dele o painel lateral aparece. */
const CONSULTA_TELA_LARGA = "(min-width: 80rem)";

function assinarTelaLarga(aoMudar: () => void) {
  const consulta = window.matchMedia(CONSULTA_TELA_LARGA);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

/** true quando o painel lateral (desktop largo) está visível. */
function useTelaLarga(): boolean {
  return useSyncExternalStore(
    assinarTelaLarga,
    () => window.matchMedia(CONSULTA_TELA_LARGA).matches,
    () => false,
  );
}

interface Estado {
  atendimento: Atendimento;
  contato: Contato;
  mensagens: Mensagem[];
  sugestao: Sugestao | null;
  fila: Outbox[];
}

async function chamarApi<T = unknown>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    throw new Error(j.erro || "Algo deu errado. Tente de novo.");
  }
  return j as T;
}

/** Busca tudo que a tela precisa. Puro: não mexe em estado. */
async function buscarConversa(atendimentoId: string): Promise<Estado | { erro: string }> {
  const supabase = supabaseNoNavegador();
  const { data: at, error } = await supabase
    .from("ar1_atendimentos")
    .select("*, contato:ar1_wa_contacts(*)")
    .eq("id", atendimentoId)
    .maybeSingle();
  if (error) return { erro: "Não foi possível abrir a conversa." };
  if (!at) return { erro: "Atendimento não encontrado." };

  const [{ data: mensagens }, { data: sugestoes }, { data: fila }] = await Promise.all([
    supabase
      .from("ar1_wa_messages")
      .select("*")
      .eq("atendimento_id", atendimentoId)
      .order("sent_at", { ascending: true })
      .limit(500),
    supabase
      .from("ar1_ai_suggestions")
      .select("*")
      .eq("atendimento_id", atendimentoId)
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("ar1_wa_outbox")
      .select("*")
      .eq("atendimento_id", atendimentoId)
      .in("status", ["queued", "sending", "failed"])
      .order("created_at", { ascending: true }),
  ]);
  const { contato, ...atendimento } = at as Atendimento & { contato: Contato };
  return {
    atendimento,
    contato,
    mensagens: (mensagens ?? []) as Mensagem[],
    sugestao: ((sugestoes ?? [])[0] as Sugestao | undefined) ?? null,
    fila: (fila ?? []) as Outbox[],
  };
}

export function Conversa({ atendimentoId }: { atendimentoId: string }) {
  const usuario = useUsuarioAtual();
  const { nomeDe } = useEquipe();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [contextoMudou, setContextoMudou] = useState(false);
  const telaLarga = useTelaLarga();
  const fimRef = useRef<HTMLDivElement>(null);
  const aoMudarContexto = useCallback(() => setContextoMudou(true), []);

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 3000 : 7000);
  }, []);

  const carregar = useCallback(() => {
    return buscarConversa(atendimentoId).then((r) => {
      if ("erro" in r) {
        setErroCarga(r.erro);
        return;
      }
      setErroCarga(null);
      setEstado(r);
    });
  }, [atendimentoId]);

  useEffect(() => {
    let ativo = true;
    buscarConversa(atendimentoId).then((r) => {
      if (!ativo) return;
      if ("erro" in r) setErroCarga(r.erro);
      else setEstado(r);
    });
    return () => {
      ativo = false;
    };
  }, [atendimentoId]);

  useRealtime({
    tabelas: ["ar1_wa_messages", "ar1_ai_suggestions", "ar1_wa_outbox"],
    filtro: `atendimento_id=eq.${atendimentoId}`,
    aoMudar: carregar,
  });
  useRealtime({
    tabelas: ["ar1_atendimentos"],
    filtro: `id=eq.${atendimentoId}`,
    aoMudar: carregar,
    intervaloMs: 120_000,
  });

  // Zera não lidas ao abrir (e sempre que chegam novas enquanto a conversa está aberta).
  useEffect(() => {
    if (!estado) return;
    if (estado.atendimento.unread_count > 0) {
      supabaseNoNavegador()
        .from("ar1_atendimentos")
        .update({ unread_count: 0 })
        .eq("id", atendimentoId)
        .then(() => undefined);
    }
  }, [estado, atendimentoId]);

  // Rola para o fim quando chegam mensagens.
  const qtdMensagens = estado?.mensagens.length ?? 0;
  const qtdFila = estado?.fila.length ?? 0;
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [qtdMensagens, qtdFila]);

  // ------------------------------------------------------------------ ações

  async function atualizarAtendimento(campos: Partial<Atendimento>, rotulo: string) {
    setOcupado(rotulo);
    const { error } = await supabaseNoNavegador().from("ar1_atendimentos").update(campos).eq("id", atendimentoId);
    setOcupado(null);
    if (error) {
      mostrar("erro", `Não foi possível salvar: ${error.message}`);
      return false;
    }
    await carregar();
    return true;
  }

  async function atualizarContato(campos: Partial<Contato>) {
    if (!estado) return;
    const { error } = await supabaseNoNavegador().from("ar1_wa_contacts").update(campos).eq("id", estado.contato.id);
    if (error) mostrar("erro", `Não foi possível salvar o contato: ${error.message}`);
    else await carregar();
  }

  async function enviar(texto: string, sugestaoId?: string | null) {
    const t = texto.trim();
    if (!t) return false;
    setOcupado("enviar");
    try {
      const r = await chamarApi<{ modo: "fila" | "direto" }>("/api/whatsapp/enviar", {
        atendimento_id: atendimentoId,
        text: t,
        suggestion_id: sugestaoId ?? undefined,
      });
      mostrar("ok", r.modo === "fila" ? "Mensagem na fila de envio." : "Mensagem enviada.");
      await carregar();
      return true;
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Falha ao enviar.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function analisar(instrucao?: string) {
    setOcupado("analisar");
    try {
      await chamarApi("/api/ia/analisar", { atendimento_id: atendimentoId, instrucao });
      setContextoMudou(false);
      mostrar("ok", "Análise atualizada.");
      await carregar();
      return true;
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Falha na análise.");
      await carregar();
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function descartarSugestao() {
    if (!estado?.sugestao) return;
    const { error } = await supabaseNoNavegador()
      .from("ar1_ai_suggestions")
      .update({ status: "descartada", decided_by: usuario.id, decided_at: new Date().toISOString() })
      .eq("id", estado.sugestao.id);
    if (error) mostrar("erro", "Não foi possível descartar.");
    else await carregar();
  }

  async function tentarDeNovo(outboxId: string) {
    const { error } = await supabaseNoNavegador()
      .from("ar1_wa_outbox")
      .update({ status: "queued", error: null })
      .eq("id", outboxId);
    if (error) mostrar("erro", "Não foi possível reenfileirar.");
    else await carregar();
  }

  async function criarPedidoDeOrcamento() {
    if (!estado) return;
    const { atendimento, contato } = estado;
    const ex = (atendimento.ai_extracted ?? {}) as DadosExtraidos;
    const nome = (ex.nome || nomeDoContato(contato)).slice(0, 200);
    const empresa = (ex.empresa || contato.company || "Não informada").slice(0, 200);
    const tipo = (atendimento.ai_service || "A definir").slice(0, 100);
    const data = ex.data_prevista && /^\d{4}-\d{2}-\d{2}$/.test(ex.data_prevista) ? ex.data_prevista : null;
    const mensagem = [atendimento.ai_summary, ex.detalhes ? `Detalhes: ${ex.detalhes}` : null, ex.cidade ? `Cidade: ${ex.cidade}` : null, ex.orcamento_estimado ? `Orçamento mencionado: ${ex.orcamento_estimado}` : null]
      .filter(Boolean)
      .join("\n")
      .slice(0, 5000);

    setOcupado("orcamento");
    const supabase = supabaseNoNavegador();
    const { data: pedido, error } = await supabase
      .from("ar1_quote_requests")
      .insert({
        name: nome,
        phone: formatarTelefone(contato.phone),
        company: empresa,
        project_type: tipo,
        expected_date: data,
        message: mensagem || null,
        source_path: "whatsapp",
        assigned_to: atendimento.assigned_to ?? usuario.id,
        client_id: contato.client_id,
      })
      .select("id")
      .single();
    if (error || !pedido) {
      setOcupado(null);
      mostrar("erro", `Não foi possível criar o pedido: ${error?.message ?? "erro"}`);
      return;
    }
    await atualizarAtendimento({ quote_request_id: pedido.id }, "orcamento");
    mostrar("ok", "Pedido de orçamento criado.");
  }

  // --------------------------------------------------------------- render

  if (erroCarga) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-apoio">{erroCarga}</p>
        <Link href="/" className="botao botao-secundario">
          Voltar para a fila
        </Link>
      </div>
    );
  }
  if (!estado) {
    return <div className="flex h-full items-center justify-center text-sm text-apoio">Carregando conversa…</div>;
  }

  const { atendimento, contato, mensagens, sugestao, fila } = estado;
  const nome = nomeDoContato(contato);
  const fechado = atendimento.status === "fechado";
  const fontes = separarFontes(sugestao?.rationale).fontes;

  const painelAnalise = (
    <PainelAnalise
      atendimento={atendimento}
      fontes={fontes}
      ocupado={ocupado}
      aoReanalisar={() => analisar()}
      aoCriarOrcamento={criarPedidoDeOrcamento}
    />
  );
  // Um só por vez (celular ou desktop), para não buscar nem enviar em dobro.
  const contextoDoCliente = (ocultarTitulo: boolean) => (
    <ContextoDoCliente
      contactId={contato.id}
      mudou={contextoMudou}
      ocupado={ocupado}
      ocultarTitulo={ocultarTitulo}
      aoMudar={aoMudarContexto}
      aoReanalisar={() => analisar()}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <Cabecalho
        atendimento={atendimento}
        contato={contato}
        nome={nome}
        ocupado={ocupado}
        nomeDe={nomeDe}
        aoSalvarNome={(v) => atualizarContato({ display_name: v || null })}
        aoMudarStatus={(s) => atualizarAtendimento({ status: s, ...(s === "fechado" ? { closed_at: new Date().toISOString() } : { closed_at: null }) }, "status")}
        aoAssumir={() => atualizarAtendimento({ assigned_to: usuario.id, ...(atendimento.status === "novo" ? { status: "em_atendimento" as const } : {}) }, "assumir")}
        aoEncerrar={(outcome) => atualizarAtendimento({ status: "fechado", outcome, closed_at: new Date().toISOString() }, "encerrar")}
        aoReabrir={() => atualizarAtendimento({ status: "em_atendimento", outcome: null, closed_at: null }, "reabrir")}
      />

      {aviso && (
        <div
          role="status"
          className={`mx-3 mt-2 rounded-lg border px-3 py-2 text-sm ${
            aviso.tipo === "erro" ? "border-erro/50 bg-erro/10 text-erro" : "border-ok/50 bg-ok/10 text-ok"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Coluna da conversa */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* Análise (celular): recolhível acima da conversa */}
            <details className="cartao mb-3 xl:hidden">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">
                Análise da IA
                {atendimento.ai_kind && (
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    <SeloKind kind={atendimento.ai_kind} />
                    <SeloUrgencia urgencia={atendimento.ai_urgency} />
                  </span>
                )}
              </summary>
              <div className="border-t border-borda p-3">{painelAnalise}</div>
            </details>

            {/* Contexto do cliente (celular): recolhível logo abaixo da análise */}
            {!telaLarga && (
              <details className="cartao mb-3 xl:hidden">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">
                  Contexto deste cliente
                  {contextoMudou && <span className="selo ml-2 border-cobre/70 align-middle text-cobre-claro">mudou</span>}
                </summary>
                <div className="border-t border-borda p-3">{contextoDoCliente(true)}</div>
              </details>
            )}

            <LinhaDoTempo mensagens={mensagens} fila={fila} nomeDe={nomeDe} aoTentarDeNovo={tentarDeNovo} />
            <div ref={fimRef} />
          </div>

          <div className="border-t border-borda bg-superficie-2 p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {sugestao && !fechado && (
              <CartaoSugestao
                key={sugestao.id}
                sugestao={sugestao}
                ocupado={ocupado}
                aoEnviar={(texto) => enviar(texto, sugestao.id)}
                aoDescartar={descartarSugestao}
                aoPedirOutra={(instrucao) => analisar(instrucao)}
              />
            )}
            {fechado ? (
              <p className="text-center text-xs text-apoio">Atendimento encerrado. Reabra para responder.</p>
            ) : (
              <Composer ocupado={ocupado} aoEnviar={(t) => enviar(t)} />
            )}
          </div>
        </div>

        {/* Painel da IA (desktop largo) */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-borda bg-superficie-2 p-4 xl:block">
          <h2 className="mb-3 text-sm">Análise da IA</h2>
          {painelAnalise}
          {telaLarga && <div className="cartao mt-5 p-3">{contextoDoCliente(false)}</div>}
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cabeçalho

function Cabecalho({
  atendimento,
  contato,
  nome,
  ocupado,
  nomeDe,
  aoSalvarNome,
  aoMudarStatus,
  aoAssumir,
  aoEncerrar,
  aoReabrir,
}: {
  atendimento: Atendimento;
  contato: Contato;
  nome: string;
  ocupado: string | null;
  nomeDe: (id: string | null) => string;
  aoSalvarNome: (v: string) => void;
  aoMudarStatus: (s: StatusAtendimento) => void;
  aoAssumir: () => void;
  aoEncerrar: (o: Outcome) => void;
  aoReabrir: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nomeEdit, setNomeEdit] = useState(contato.display_name ?? contato.wa_name ?? "");
  const [encerrando, setEncerrando] = useState(false);
  const usuario = useUsuarioAtual();
  const fechado = atendimento.status === "fechado";

  function salvar() {
    setEditando(false);
    const v = nomeEdit.trim();
    if (v !== (contato.display_name ?? "")) aoSalvarNome(v);
  }

  return (
    <header className="border-b border-borda bg-superficie-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <Link href="/" className="rounded-lg p-1 text-apoio hover:text-texto lg:hidden" aria-label="Voltar para a fila">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <Avatar nome={nome} foto={contato.photo_url} tamanho={36} />
        <div className="min-w-0 flex-1">
          {editando ? (
            <input
              autoFocus
              className="campo py-1 text-sm"
              value={nomeEdit}
              onChange={(e) => setNomeEdit(e.target.value)}
              onBlur={salvar}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvar();
                if (e.key === "Escape") setEditando(false);
              }}
              placeholder="Nome do contato"
              aria-label="Nome do contato"
              maxLength={200}
            />
          ) : (
            <button type="button" onClick={() => setEditando(true)} className="block max-w-full truncate text-left font-semibold hover:underline" title="Clique para editar o nome">
              {nome}
            </button>
          )}
          <p className="truncate text-xs text-apoio">
            {formatarTelefone(contato.phone)}
            {contato.company ? ` · ${contato.company}` : ""}
            {contato.wa_name && contato.display_name && contato.wa_name !== contato.display_name ? ` · no WhatsApp: ${contato.wa_name}` : ""}
          </p>
        </div>
        <SeloStatus status={atendimento.status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          className="campo w-auto py-1 text-xs"
          value={atendimento.status}
          onChange={(e) => aoMudarStatus(e.target.value as StatusAtendimento)}
          disabled={ocupado === "status"}
          aria-label="Status do atendimento"
        >
          {(Object.keys(ROTULO_STATUS) as StatusAtendimento[]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS[s]}
            </option>
          ))}
        </select>

        {atendimento.assigned_to === usuario.id ? (
          <span className="selo border-ok/60 text-ok">Com você</span>
        ) : (
          <button type="button" className="botao botao-secundario py-1 text-xs" onClick={aoAssumir} disabled={ocupado === "assumir" || fechado}>
            {atendimento.assigned_to ? `Assumir (com ${nomeDe(atendimento.assigned_to)})` : "Assumir"}
          </button>
        )}

        {fechado ? (
          <>
            {atendimento.outcome && <span className="selo">{ROTULO_OUTCOME[atendimento.outcome]}</span>}
            <button type="button" className="botao botao-secundario py-1 text-xs" onClick={aoReabrir} disabled={ocupado === "reabrir"}>
              Reabrir
            </button>
          </>
        ) : encerrando ? (
          <span className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-apoio">Encerrar como:</span>
            {(Object.keys(ROTULO_OUTCOME) as Outcome[]).map((o) => (
              <button
                key={o}
                type="button"
                className="botao botao-secundario px-2 py-1 text-xs"
                onClick={() => {
                  setEncerrando(false);
                  aoEncerrar(o);
                }}
              >
                {ROTULO_OUTCOME[o]}
              </button>
            ))}
            <button type="button" className="text-xs text-apoio underline" onClick={() => setEncerrando(false)}>
              cancelar
            </button>
          </span>
        ) : (
          <button type="button" className="botao botao-perigo py-1 text-xs" onClick={() => setEncerrando(true)} disabled={ocupado === "encerrar"}>
            Encerrar
          </button>
        )}
      </div>
    </header>
  );
}

// ------------------------------------------------------------- linha do tempo

function LinhaDoTempo({
  mensagens,
  fila,
  nomeDe,
  aoTentarDeNovo,
}: {
  mensagens: Mensagem[];
  fila: Outbox[];
  nomeDe: (id: string | null) => string;
  aoTentarDeNovo: (id: string) => void;
}) {
  const grupos = useMemo(() => {
    const g: { dia: string; itens: Mensagem[] }[] = [];
    for (const m of mensagens) {
      const dia = new Date(m.sent_at).toDateString();
      const ultimo = g[g.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.itens.push(m);
      else g.push({ dia, itens: [m] });
    }
    return g;
  }, [mensagens]);

  if (mensagens.length === 0 && fila.length === 0) {
    return <p className="py-10 text-center text-sm text-apoio">Nenhuma mensagem ainda.</p>;
  }

  return (
    <div className="space-y-2">
      {grupos.map((g) => (
        <div key={g.dia} className="space-y-2">
          <p className="py-1 text-center text-[11px] uppercase tracking-wide text-apoio">{dataCurta(g.itens[0].sent_at)}</p>
          {g.itens.map((m) => (
            <Balao key={m.id} m={m} nomeAutor={m.sent_by_user ? nomeDe(m.sent_by_user) : undefined} />
          ))}
        </div>
      ))}
      {fila.map((item) => (
        <BalaoFila key={item.id} item={item} aoTentarDeNovo={aoTentarDeNovo} />
      ))}
    </div>
  );
}

// --------------------------------------------------------------- painel da IA

function PainelAnalise({
  atendimento,
  fontes,
  ocupado,
  aoReanalisar,
  aoCriarOrcamento,
}: {
  atendimento: Atendimento;
  /** Documentos usados na sugestão pendente. */
  fontes: string[];
  ocupado: string | null;
  aoReanalisar: () => void;
  aoCriarOrcamento: () => void;
}) {
  const ex = (atendimento.ai_extracted ?? {}) as DadosExtraidos;
  const entradas = (Object.keys(ROTULO_EXTRAIDO) as (keyof DadosExtraidos)[])
    .map((k) => [k, ex[k]] as const)
    .filter(([, v]) => v && String(v).trim());
  const analisada = Boolean(atendimento.ai_analyzed_at);
  const agendada = Boolean(atendimento.ai_analysis_due_at);

  return (
    <div className="space-y-3 text-sm">
      {!analisada && !atendimento.ai_error && (
        <p className="text-apoio">{agendada ? "Análise agendada: chega em instantes." : "Ainda sem análise."}</p>
      )}
      {atendimento.ai_error && (
        <p className="rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-xs text-erro">{atendimento.ai_error}</p>
      )}
      {analisada && (
        <>
          <div className="flex flex-wrap gap-1">
            <SeloKind kind={atendimento.ai_kind} />
            <SeloServico servico={atendimento.ai_service} />
            <SeloUrgencia urgencia={atendimento.ai_urgency} />
          </div>
          {atendimento.ai_summary && <p className="leading-snug">{atendimento.ai_summary}</p>}
          {entradas.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {entradas.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-apoio">{ROTULO_EXTRAIDO[k]}</dt>
                  <dd className="break-words">{k === "data_prevista" ? formatarDataPrevista(String(v)) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {fontes.length > 0 && (
            <p className="break-words text-xs text-apoio">
              <span className="text-cobre-claro">Baseado em:</span> {fontes.join("; ")}
            </p>
          )}
          <p className="text-[11px] text-apoio">
            Analisado {tempoRelativo(atendimento.ai_analyzed_at)}
            {agendada ? " · nova análise agendada" : ""}
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="botao botao-secundario py-1 text-xs" onClick={aoReanalisar} disabled={ocupado === "analisar"}>
          {ocupado === "analisar" ? "Analisando…" : analisada ? "Reanalisar" : "Analisar agora"}
        </button>
        {atendimento.quote_request_id ? (
          <span className="selo border-ok/60 text-ok">Pedido criado</span>
        ) : (
          <button type="button" className="botao botao-secundario py-1 text-xs" onClick={aoCriarOrcamento} disabled={ocupado === "orcamento"}>
            Criar pedido de orçamento
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------ contexto do cliente

function ContextoDoCliente({
  contactId,
  mudou,
  ocupado,
  ocultarTitulo,
  aoMudar,
  aoReanalisar,
}: {
  contactId: string;
  mudou: boolean;
  ocupado: string | null;
  ocultarTitulo: boolean;
  aoMudar: () => void;
  aoReanalisar: () => void;
}) {
  return (
    <div className="space-y-3">
      {mudou && (
        <div role="status" className="rounded-lg border border-cobre/60 bg-cobre/10 p-3 text-xs">
          <p>O contexto deste cliente mudou. A análise e a resposta sugerida ainda usam o contexto antigo.</p>
          <button
            type="button"
            className="botao botao-primario mt-2 w-full whitespace-normal py-1.5 text-xs sm:w-auto"
            onClick={aoReanalisar}
            disabled={ocupado === "analisar"}
          >
            {ocupado === "analisar" ? "Analisando…" : "Reanalisar com o novo contexto"}
          </button>
        </div>
      )}
      <ContextoDocs
        escopo="contato"
        contactId={contactId}
        titulo="Contexto deste cliente"
        descricao="Briefing, proposta enviada, combinados e outros documentos deste contato. A IA usa só nesta conversa e nas próximas com ele."
        ocultarTitulo={ocultarTitulo}
        aoMudar={aoMudar}
      />
    </div>
  );
}

// ---------------------------------------------------------- sugestão / composer

function CartaoSugestao({
  sugestao,
  ocupado,
  aoEnviar,
  aoDescartar,
  aoPedirOutra,
}: {
  sugestao: Sugestao;
  ocupado: string | null;
  aoEnviar: (texto: string) => Promise<boolean>;
  aoDescartar: () => void;
  aoPedirOutra: (instrucao: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState(sugestao.reply);
  const [instrucao, setInstrucao] = useState("");
  const editado = texto.trim() !== sugestao.reply.trim();
  const motivo = separarFontes(sugestao.rationale);

  return (
    <div className="cartao mb-3 border-cobre/50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-cobre-claro">Resposta sugerida</p>
        {editado && <span className="text-[11px] text-apoio">editada</span>}
      </div>
      {motivo.texto && <p className="mb-2 text-xs text-apoio">{motivo.texto}</p>}
      {motivo.fontes.length > 0 && (
        <p className="mb-2 break-words text-xs text-apoio">
          <span className="text-cobre-claro">Baseado em:</span> {motivo.fontes.join("; ")}
        </p>
      )}
      <textarea
        className="campo min-h-24 text-sm"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        aria-label="Texto da resposta sugerida"
        maxLength={5000}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="botao botao-primario" onClick={() => aoEnviar(texto)} disabled={ocupado === "enviar" || !texto.trim()}>
          {ocupado === "enviar" ? "Enviando…" : "Enviar"}
        </button>
        <button type="button" className="botao botao-secundario" onClick={aoDescartar} disabled={ocupado !== null}>
          Descartar
        </button>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!instrucao.trim()) return;
          const ok = await aoPedirOutra(instrucao.trim());
          if (ok) setInstrucao("");
        }}
      >
        <input
          className="campo py-1.5 text-sm"
          placeholder="Peça outra sugestão (ex.: mais curta, pergunte a data)"
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          maxLength={2000}
          aria-label="Instrução para nova sugestão"
        />
        <button type="submit" className="botao botao-secundario" disabled={ocupado === "analisar" || !instrucao.trim()}>
          {ocupado === "analisar" ? "…" : "Pedir"}
        </button>
      </form>
    </div>
  );
}

function Composer({ ocupado, aoEnviar }: { ocupado: string | null; aoEnviar: (t: string) => Promise<boolean> }) {
  const [texto, setTexto] = useState("");
  async function submeter() {
    if (!texto.trim()) return;
    const ok = await aoEnviar(texto);
    if (ok) setTexto("");
  }
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submeter();
      }}
    >
      <textarea
        className="campo max-h-40 min-h-11 flex-1 resize-none py-2 text-sm"
        placeholder="Escreva uma mensagem"
        value={texto}
        rows={1}
        onChange={(e) => {
          setTexto(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submeter();
          }
        }}
        maxLength={5000}
        aria-label="Mensagem"
      />
      <button type="submit" className="botao botao-primario" disabled={ocupado === "enviar" || !texto.trim()}>
        {ocupado === "enviar" ? "…" : "Enviar"}
      </button>
    </form>
  );
}
