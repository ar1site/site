"use client";

// Detalhe da oportunidade: campos comerciais, notas, histórico simples,
// leitura e sugestões da IA. A IA só sugere; gravar é sempre um clique de alguém.

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { lerOportunidadeIA } from "@/lib/analise/oportunidade";
import { nomeCurto, useEquipe } from "@/lib/equipe";
import {
  atualizarOportunidade,
  buscarConversaDaOportunidade,
  buscarOportunidade,
  useServicos,
  type ConversaDaOportunidade,
} from "@/lib/funil/dados";
import { diaCompleto, diaEHora, isoParaDia } from "@/lib/funil/datas";
import {
  acaoVencida,
  ETAPAS,
  etapaAberta,
  formatarReais,
  ORIGENS,
  probabilidadeEfetiva,
  ROTULO_ETAPA,
  ROTULO_ORIGEM,
  textoDiasNaEtapa,
  transicaoPede,
  validarTransicao,
  type CamposDaTransicao,
} from "@/lib/funil/etapas";
import { validarEdicao, valorParaCampo, type RascunhoOportunidade } from "@/lib/funil/formulario";
import { useRealtime } from "@/lib/realtime";
import type { EtapaFunil, Oportunidade } from "@/lib/tipos";
import { Campo, DialogoDeEtapa, type PedidoDeEtapa } from "./DialogosFunil";
import { Propostas } from "./Propostas";
import { SeloEtapa, SeloOrigem } from "./Selos";
import { SugestoesIA } from "./SugestoesIA";

interface Estado {
  oportunidade: Oportunidade;
  conversa: ConversaDaOportunidade | null;
}

async function buscarTudo(id: string): Promise<Estado | { erro: string }> {
  const r = await buscarOportunidade(id);
  if ("erro" in r) return r;
  if (!r.oportunidade) return { erro: "Oportunidade não encontrada." };
  const conversa = await buscarConversaDaOportunidade(r.oportunidade);
  return { oportunidade: r.oportunidade, conversa };
}

/** Valor do campo na tela: o que a pessoa digitou ou, se não mexeu, o que está no banco. */
function valoresDoBanco(o: Oportunidade): Required<RascunhoOportunidade> {
  return {
    name: o.name ?? "",
    company: o.company ?? "",
    phone: o.phone ?? "",
    email: o.email ?? "",
    project_type: o.project_type ?? "",
    expected_date: o.expected_date ?? "",
    message: o.message ?? "",
    source: o.source,
    estimated_value: valorParaCampo(o.estimated_value),
    probability: o.probability === null ? "" : String(o.probability),
    next_action: o.next_action ?? "",
    next_action_dia: isoParaDia(o.next_action_at),
    assigned_to: o.assigned_to ?? "",
    internal_notes: o.internal_notes ?? "",
    lost_reason: o.lost_reason ?? "",
  };
}

export function OportunidadeDetalhe({ id, emPainel = false }: { id: string; emPainel?: boolean }) {
  const { membros, eu } = useEquipe();
  const servicos = useServicos();
  const idLista = useId();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<RascunhoOportunidade>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pedido, setPedido] = useState<PedidoDeEtapa | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 3000 : 7000);
  }, []);

  const carregar = useCallback(() => {
    return buscarTudo(id).then((r) => {
      if ("erro" in r) {
        setErroCarga(r.erro);
        return;
      }
      setErroCarga(null);
      setEstado(r);
      setAgora(Date.now());
    });
  }, [id]);

  useEffect(() => {
    let ativo = true;
    buscarTudo(id).then((r) => {
      if (!ativo) return;
      if ("erro" in r) setErroCarga(r.erro);
      else {
        setEstado(r);
        setAgora(Date.now());
      }
    });
    return () => {
      ativo = false;
    };
  }, [id]);

  useRealtime({ tabelas: ["ar1_quote_requests"], filtro: `id=eq.${id}`, aoMudar: carregar, intervaloMs: 60_000 });

  if (erroCarga) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-apoio">{erroCarga}</p>
        <Link href="/funil" className="botao botao-secundario">
          Voltar para o funil
        </Link>
      </div>
    );
  }
  if (!estado) return <p className="p-8 text-center text-sm text-apoio">Carregando oportunidade…</p>;

  const { oportunidade: o, conversa } = estado;
  const banco = valoresDoBanco(o);
  const valor = <K extends keyof RascunhoOportunidade>(campo: K): string => rascunho[campo] ?? banco[campo];
  const mexido = Object.keys(rascunho).length > 0;
  const ia = lerOportunidadeIA(conversa?.ai_extracted);
  const aberta = etapaAberta(o.status);
  const prob = probabilidadeEfetiva(o);
  const vencida = acaoVencida(o, agora);

  function mudar(campo: keyof RascunhoOportunidade, texto: string) {
    setRascunho((r) => {
      const novo = { ...r };
      // Voltou ao que está no banco: deixa de ser alteração.
      if (texto === banco[campo]) delete novo[campo];
      else novo[campo] = texto;
      return novo;
    });
    setErros((e) => {
      if (!e[campo]) return e;
      const novo = { ...e };
      delete novo[campo];
      return novo;
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const r = validarEdicao(rascunho, o);
    if (!r.ok) {
      setErros(r.erros);
      mostrar("erro", "Confira os campos marcados.");
      return;
    }
    if (Object.keys(r.campos).length === 0) {
      setRascunho({});
      return;
    }
    setSalvando(true);
    const gravou = await atualizarOportunidade(o.id, r.campos);
    setSalvando(false);
    if (!gravou.ok) {
      mostrar("erro", gravou.erro);
      return;
    }
    setRascunho({});
    setErros({});
    mostrar("ok", "Alterações salvas.");
    await carregar();
  }

  function mover(para: EtapaFunil) {
    if (para === o.status) return;
    if (transicaoPede(para)) {
      setPedido({ oportunidade: o, para });
      return;
    }
    const r = validarTransicao({ de: o.status, para });
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    void gravarEtapa(r.campos);
  }

  async function gravarEtapa(campos: CamposDaTransicao) {
    setSalvando(true);
    const r = await atualizarOportunidade(o.id, campos);
    setSalvando(false);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    setPedido(null);
    // O que a transição gravou deixa de ser rascunho.
    setRascunho((atual) => {
      const novo = { ...atual };
      if ("estimated_value" in campos) delete novo.estimated_value;
      if ("probability" in campos) delete novo.probability;
      if ("lost_reason" in campos) delete novo.lost_reason;
      return novo;
    });
    mostrar("ok", `Agora em ${ROTULO_ETAPA[campos.status ?? o.status]}.`);
    await carregar();
  }

  function aoAceitarSugestao(campos: Partial<Oportunidade>) {
    setRascunho((atual) => {
      const novo = { ...atual };
      if ("estimated_value" in campos) delete novo.estimated_value;
      if ("probability" in campos) delete novo.probability;
      if ("next_action" in campos) delete novo.next_action;
      if ("next_action_at" in campos) delete novo.next_action_dia;
      return novo;
    });
    mostrar("ok", "Sugestão aplicada.");
    void carregar();
  }

  return (
    <div className={`mx-auto w-full ${emPainel ? "" : "max-w-3xl"}`}>
      <form onSubmit={salvar} className="space-y-4 px-4 pb-6 pt-4 lg:pt-6" noValidate>
        {/* Cabeçalho */}
        <header className="space-y-2">
          <Link href="/funil" className="inline-flex items-center gap-1 text-xs text-apoio hover:text-texto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Funil
          </Link>
          <h1 className="break-words text-lg leading-tight">{o.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <SeloEtapa etapa={o.status} />
            <SeloOrigem origem={o.source} />
            <span className="text-xs text-apoio">
              {formatarReais(o.estimated_value)}
              {aberta ? ` · ${prob.valor}%${prob.padrao ? " (padrão da etapa)" : ""}` : ""}
            </span>
          </div>
          {conversa ? (
            <Link href={`/atendimento/${conversa.id}`} className="botao botao-secundario w-full sm:w-auto">
              Abrir conversa
            </Link>
          ) : (
            <p className="text-xs text-apoio">
              {o.contact_id
                ? "O contato não tem conversa aberta no momento."
                : "Esta oportunidade ainda não está ligada a uma conversa do WhatsApp."}
            </p>
          )}
        </header>

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

        {/* Etapa e histórico */}
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm">Etapa</h2>
          <Campo rotulo="Etapa atual" ajuda="Perdido pede o motivo; Ganho pede o valor final.">
            <select
              className="campo text-sm"
              value={o.status}
              onChange={(e) => mover(e.target.value as EtapaFunil)}
              disabled={salvando}
            >
              {ETAPAS.map((e) => (
                <option key={e} value={e}>
                  {ROTULO_ETAPA[e]}
                </option>
              ))}
            </select>
          </Campo>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-apoio">Criada em</dt>
            <dd>{diaEHora(o.created_at)}</dd>
            <dt className="text-apoio">Nesta etapa desde</dt>
            <dd>
              {diaCompleto(o.stage_changed_at)} ({textoDiasNaEtapa(o.stage_changed_at, agora).replace(" nesta etapa", "")})
            </dd>
            {o.closed_at && (
              <>
                <dt className="text-apoio">Fechada em</dt>
                <dd>{diaEHora(o.closed_at)}</dd>
              </>
            )}
          </dl>
          {o.status === "lost" && (
            <Campo rotulo="Motivo da perda" erro={erros.lost_reason}>
              <textarea className="campo min-h-20 text-sm" value={valor("lost_reason")} onChange={(e) => mudar("lost_reason", e.target.value)} maxLength={500} />
            </Campo>
          )}
        </section>

        {/* IA */}
        <section className="cartao space-y-3 border-cobre/40 p-4">
          <h2 className="text-sm">Sugestões da IA</h2>
          <SugestoesIA oportunidade={o} ia={ia} aoAplicar={aoAceitarSugestao} />
          {o.ai_notes && (
            <details className="rounded-lg border border-borda bg-superficie-2">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold">Leitura da IA</summary>
              <p className="whitespace-pre-line break-words border-t border-borda px-3 py-2 text-xs leading-relaxed text-apoio">
                {o.ai_notes}
              </p>
            </details>
          )}
        </section>

        {/* Propostas */}
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm">Propostas</h2>
          <Propostas oportunidade={o} atendimentoId={conversa?.id ?? null} aoMudar={carregar} />
        </section>

        {/* Comercial */}
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm">Comercial</h2>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor estimado (R$)" erro={erros.estimated_value}>
              <input className="campo text-sm" inputMode="decimal" value={valor("estimated_value")} onChange={(e) => mudar("estimated_value", e.target.value)} placeholder="sem valor" autoComplete="off" />
            </Campo>
            <Campo rotulo="Probabilidade (%)" erro={erros.probability}>
              <input className="campo text-sm" inputMode="numeric" value={valor("probability")} onChange={(e) => mudar("probability", e.target.value)} placeholder={`padrão: ${prob.padrao ? prob.valor : "—"}`} maxLength={4} autoComplete="off" />
            </Campo>
          </div>
          <Campo rotulo="Próxima ação" erro={erros.next_action}>
            <input className="campo text-sm" value={valor("next_action")} onChange={(e) => mudar("next_action", e.target.value)} maxLength={500} placeholder="Ex.: enviar proposta" autoComplete="off" />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Até quando" erro={erros.next_action_dia} ajuda={vencida ? undefined : "Vence às 18 h do dia escolhido."}>
              <input type="date" className={`campo text-sm ${vencida && !rascunho.next_action_dia ? "border-erro/70 text-erro" : ""}`} value={valor("next_action_dia")} onChange={(e) => mudar("next_action_dia", e.target.value)} />
              {vencida && !rascunho.next_action_dia && <span className="mt-1 block text-xs font-semibold text-erro">Ação vencida.</span>}
            </Campo>
            <Campo rotulo="Responsável">
              <select className="campo text-sm" value={valor("assigned_to")} onChange={(e) => mudar("assigned_to", e.target.value)}>
                <option value="">Sem responsável</option>
                {membros
                  .filter((m) => m.active || m.user_id === o.assigned_to)
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === eu ? `${nomeCurto(m.email)} (você)` : nomeCurto(m.email)}
                    </option>
                  ))}
                {o.assigned_to && !membros.some((m) => m.user_id === o.assigned_to) && (
                  <option value={o.assigned_to}>Equipe</option>
                )}
              </select>
            </Campo>
          </div>
          <Campo rotulo="Origem" erro={erros.source}>
            <select className="campo text-sm" value={valor("source")} onChange={(e) => mudar("source", e.target.value)}>
              {ORIGENS.map((origem) => (
                <option key={origem} value={origem}>
                  {ROTULO_ORIGEM[origem]}
                </option>
              ))}
            </select>
          </Campo>
        </section>

        {/* Notas */}
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm">Notas internas</h2>
          <Campo rotulo="Só a equipe vê" erro={erros.internal_notes}>
            <textarea className="campo min-h-28 text-sm" value={valor("internal_notes")} onChange={(e) => mudar("internal_notes", e.target.value)} maxLength={10000} />
          </Campo>
        </section>

        {/* Contato e pedido */}
        <section className="cartao space-y-3 p-4">
          <h2 className="text-sm">Contato e pedido</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome" erro={erros.name}>
              <input className="campo text-sm" value={valor("name")} onChange={(e) => mudar("name", e.target.value)} maxLength={200} autoComplete="off" />
            </Campo>
            <Campo rotulo="Empresa" erro={erros.company}>
              <input className="campo text-sm" value={valor("company")} onChange={(e) => mudar("company", e.target.value)} maxLength={200} autoComplete="off" />
            </Campo>
            <Campo rotulo="Telefone" erro={erros.phone}>
              <input className="campo text-sm" inputMode="tel" value={valor("phone")} onChange={(e) => mudar("phone", e.target.value)} maxLength={32} autoComplete="off" />
            </Campo>
            <Campo rotulo="E-mail" erro={erros.email}>
              <input className="campo text-sm" inputMode="email" value={valor("email")} onChange={(e) => mudar("email", e.target.value)} maxLength={254} autoComplete="off" />
            </Campo>
            <Campo rotulo="Serviço" erro={erros.project_type}>
              <input className="campo text-sm" list={idLista} value={valor("project_type")} onChange={(e) => mudar("project_type", e.target.value)} maxLength={100} autoComplete="off" />
              <datalist id={idLista}>
                {servicos.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Data prevista do projeto" erro={erros.expected_date}>
              <input type="date" className="campo text-sm" value={valor("expected_date")} onChange={(e) => mudar("expected_date", e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Pedido / resumo" erro={erros.message}>
            <textarea className="campo min-h-24 text-sm" value={valor("message")} onChange={(e) => mudar("message", e.target.value)} maxLength={5000} />
          </Campo>
        </section>

        {/* Barra de salvar: só aparece quando há alteração */}
        {mexido && (
          <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-borda bg-superficie-2 px-4 py-3 lg:bottom-0">
            <div className="flex items-center gap-2">
              <button type="submit" className="botao botao-primario flex-1 sm:flex-none" disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
              <button
                type="button"
                className="botao botao-secundario"
                disabled={salvando}
                onClick={() => {
                  setRascunho({});
                  setErros({});
                }}
              >
                Desfazer
              </button>
            </div>
          </div>
        )}
      </form>

      {pedido && (
        <DialogoDeEtapa pedido={pedido} ocupado={salvando} aoConfirmar={gravarEtapa} aoCancelar={() => setPedido(null)} />
      )}
    </div>
  );
}
