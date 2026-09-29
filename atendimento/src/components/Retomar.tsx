"use client";

// Retomadas sugeridas pela IA. A IA deixa a mensagem pronta; uma pessoa lê,
// edita se quiser e decide: enviar, adiar ou descartar. Nada sai sozinho.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { descreverMensagem } from "@/lib/analise/contexto";
import { ordenarParaTela } from "@/lib/followups/candidatos";
import { buscarRetomadas, type ItemDeRetomada } from "@/lib/followups/dados";
import { formatarTelefone, horaCurta, nomeDoContato, tempoRelativo } from "@/lib/formato";
import { daquiADias, diaCurto } from "@/lib/funil/datas";
import { formatarReais } from "@/lib/funil/etapas";
import { useRealtime } from "@/lib/realtime";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import { Avatar, SeloEtapa, SeloPrioridade } from "./Selos";
import { useUsuarioAtual } from "./Shell";

interface Dados {
  pendentes: ItemDeRetomada[];
  adiadas: ItemDeRetomada[];
}

interface RespostaGerar {
  ok: boolean;
  erro?: string;
  reativados?: number;
  candidatos?: number;
  criados?: number;
  para_depois?: number;
  falhas?: { contact_id: string; erro: string }[];
}

const OPCOES_DE_ADIAR = [1, 3, 7] as const;


function ordenar(itens: ItemDeRetomada[]): ItemDeRetomada[] {
  const ordem = ordenarParaTela(itens.map((i) => i.followup)).map((f) => f.id);
  return [...itens].sort((a, b) => ordem.indexOf(a.followup.id) - ordem.indexOf(b.followup.id));
}

function resumoDaGeracao(r: RespostaGerar): string {
  const partes: string[] = [];
  const criados = r.criados ?? 0;
  const reativados = r.reativados ?? 0;
  if (criados > 0) partes.push(criados === 1 ? "1 retomada nova" : `${criados} retomadas novas`);
  if (reativados > 0) partes.push(reativados === 1 ? "1 adiada voltou" : `${reativados} adiadas voltaram`);
  if (partes.length === 0) partes.push("Nada novo para retomar agora");
  const falhas = r.falhas?.length ?? 0;
  if (falhas > 0) partes.push(`${falhas} não ${falhas === 1 ? "pôde ser preparada" : "puderam ser preparadas"} (a IA falhou)`);
  if ((r.para_depois ?? 0) > 0) partes.push(`${r.para_depois} ficaram para a próxima rodada`);
  return `${partes.join(" · ")}.`;
}

export function Retomar() {
  const usuario = useUsuarioAtual();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 5000 : 9000);
  }, []);

  const carregar = useCallback(() => {
    return buscarRetomadas().then((r) => {
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setDados({ pendentes: ordenar(r.pendentes), adiadas: r.adiadas });
      setAgora(Date.now());
    });
  }, []);

  useEffect(() => {
    let ativo = true;
    buscarRetomadas().then((r) => {
      if (!ativo) return;
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setDados({ pendentes: ordenar(r.pendentes), adiadas: r.adiadas });
      setAgora(Date.now());
    });
    return () => {
      ativo = false;
    };
  }, []);

  useRealtime({ tabelas: ["ar1_followups"], aoMudar: carregar, intervaloMs: 60_000 });

  async function gerar() {
    setGerando(true);
    try {
      const resposta = await fetch("/api/followups/gerar", { method: "POST" });
      const r = (await resposta.json().catch(() => ({ ok: false }))) as RespostaGerar;
      if (!resposta.ok || !r.ok) throw new Error(r.erro || "Não foi possível gerar as retomadas.");
      mostrar("ok", resumoDaGeracao(r));
      await carregar();
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Não foi possível gerar as retomadas.");
    } finally {
      setGerando(false);
    }
  }

  async function enviar(item: ItemDeRetomada, texto: string): Promise<boolean> {
    setOcupado(item.followup.id);
    try {
      const resposta = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followup_id: item.followup.id, text: texto.trim() }),
      });
      const r = await resposta.json().catch(() => ({}));
      if (!resposta.ok || r.ok === false) throw new Error(r.erro || "Falha ao enviar.");
      mostrar("ok", r.modo === "fila" ? "Mensagem na fila de envio." : "Mensagem enviada.");
      await carregar();
      return true;
    } catch (e) {
      mostrar("erro", e instanceof Error ? e.message : "Falha ao enviar.");
      await carregar();
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function decidir(item: ItemDeRetomada, campos: Record<string, unknown>, mensagem: string) {
    setOcupado(item.followup.id);
    const { error } = await supabaseNoNavegador()
      .from("ar1_followups")
      .update({ ...campos, decided_by: usuario.id, decided_at: new Date().toISOString() })
      .eq("id", item.followup.id);
    setOcupado(null);
    if (error) {
      mostrar("erro", `Não foi possível salvar: ${error.message}`);
      return;
    }
    mostrar("ok", mensagem);
    await carregar();
  }

  async function adiar(item: ItemDeRetomada, dias: number) {
    const volta = daquiADias(dias);
    await decidir(
      item,
      { status: "adiado", due_at: volta },
      dias === 1 ? "Adiada para amanhã." : `Adiada por ${dias} dias.`,
    );
  }

  async function descartar(item: ItemDeRetomada) {
    await decidir(item, { status: "descartado" }, "Retomada descartada.");
  }

  async function trazerDeVolta(item: ItemDeRetomada) {
    setOcupado(item.followup.id);
    const { error } = await supabaseNoNavegador()
      .from("ar1_followups")
      .update({ status: "pendente", due_at: new Date().toISOString() })
      .eq("id", item.followup.id);
    setOcupado(null);
    if (error) {
      mostrar(
        "erro",
        error.code === "23505"
          ? "Este contato já tem outra retomada pendente. Decida aquela primeiro."
          : `Não foi possível salvar: ${error.message}`,
      );
      return;
    }
    await carregar();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-4 lg:pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl">Retomar</h1>
          <p className="mt-1 text-xs leading-snug text-apoio">
            Conversas que ficaram paradas, com a mensagem pronta. Você decide o que sai.
          </p>
        </div>
        <button type="button" className="botao botao-primario shrink-0" onClick={gerar} disabled={gerando}>
          {gerando ? "Gerando…" : "Gerar agora"}
        </button>
      </div>
      {gerando && (
        <p className="mt-2 text-xs text-apoio">A IA está lendo as conversas paradas. Pode levar até um minuto.</p>
      )}

      {aviso && (
        <div
          role="status"
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            aviso.tipo === "erro" ? "border-erro/50 bg-erro/10 text-erro" : "border-ok/50 bg-ok/10 text-ok"
          }`}
        >
          {aviso.texto}
        </div>
      )}
      {erro && <p className="mt-3 text-sm text-erro">{erro}</p>}

      {dados === null && !erro && <p className="py-10 text-center text-sm text-apoio">Carregando…</p>}

      {dados && dados.pendentes.length === 0 && (
        <div className="cartao mt-4 flex flex-col items-center gap-2 px-6 py-10 text-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ok" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="M22 4 12 14.01l-3-3" />
          </svg>
          <p className="font-semibold">Tudo em dia por aqui</p>
          <p className="max-w-sm text-sm text-apoio">
            Nenhuma conversa esperando retomada. A IA confere todo dia às 8 h; se quiser conferir agora, toque em
            &ldquo;Gerar agora&rdquo;.
          </p>
        </div>
      )}

      {dados && dados.pendentes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {dados.pendentes.map((item) => (
            <li key={item.followup.id}>
              <CartaoRetomada
                item={item}
                agora={agora}
                ocupado={ocupado === item.followup.id}
                bloqueado={ocupado !== null}
                aoEnviar={(texto) => enviar(item, texto)}
                aoAdiar={(dias) => adiar(item, dias)}
                aoDescartar={() => descartar(item)}
              />
            </li>
          ))}
        </ul>
      )}

      {dados && dados.adiadas.length > 0 && (
        <details className="cartao mt-4">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            Adiadas ({dados.adiadas.length})
          </summary>
          <ul className="divide-y divide-borda border-t border-borda">
            {dados.adiadas.map((item) => (
              <li key={item.followup.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{nomeDoContato(item.contato)}</p>
                  <p className="text-xs text-apoio">Volta em {diaCurto(item.followup.due_at, agora)}</p>
                </div>
                <button
                  type="button"
                  className="botao botao-secundario shrink-0 py-1 text-xs"
                  onClick={() => trazerDeVolta(item)}
                  disabled={ocupado !== null}
                >
                  Trazer de volta
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CartaoRetomada({
  item,
  agora,
  ocupado,
  bloqueado,
  aoEnviar,
  aoAdiar,
  aoDescartar,
}: {
  item: ItemDeRetomada;
  agora: number;
  ocupado: boolean;
  bloqueado: boolean;
  aoEnviar: (texto: string) => Promise<boolean>;
  aoAdiar: (dias: number) => void;
  aoDescartar: () => void;
}) {
  const { followup: f, contato, atendimento, oportunidade, previa } = item;
  const [texto, setTexto] = useState(f.suggested_text);
  const [adiando, setAdiando] = useState(false);
  const nome = nomeDoContato(contato);
  const editado = texto.trim() !== f.suggested_text.trim();
  const parado = atendimento?.last_message_at ?? null;
  // Chegou ou saiu mensagem depois que a IA escreveu: a sugestão pode estar velha.
  const mudouDepois = Boolean(parado && new Date(parado).getTime() > new Date(f.created_at).getTime());
  const semEnvio = Boolean(contato?.blocked);

  return (
    <article className={`cartao p-4 ${f.priority === "alta" ? "border-erro/40" : ""}`}>
      <div className="flex items-start gap-3">
        <Avatar nome={nome} foto={contato?.photo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate font-semibold">{nome}</p>
            {parado && <span className="shrink-0 text-[11px] text-apoio">parada {tempoRelativo(parado, agora)}</span>}
          </div>
          <p className="truncate text-xs text-apoio">{contato?.company || formatarTelefone(contato?.phone)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <SeloPrioridade prioridade={f.priority} />
            {oportunidade && <SeloEtapa etapa={oportunidade.status} />}
            {oportunidade && oportunidade.estimated_value !== null && (
              <span className="selo">{formatarReais(oportunidade.estimated_value)}</span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 break-words text-sm leading-snug">{f.reason}</p>

      {mudouDepois && (
        <p className="mt-2 rounded-lg border border-alerta/50 bg-alerta/10 px-3 py-2 text-xs text-alerta">
          Houve mensagem nova nesta conversa depois que a sugestão foi escrita. Confira antes de enviar.
        </p>
      )}

      {previa.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg border border-borda bg-superficie-2 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-apoio">Últimas mensagens</p>
          {previa.map((m) => (
            <p key={m.id} className="break-words text-xs leading-snug">
              <span className={m.direction === "in" ? "font-semibold text-cobre-claro" : "font-semibold text-apoio"}>
                {m.direction === "in" ? "Cliente" : "AR1"}
              </span>{" "}
              <span className="text-apoio/80">
                {diaCurto(m.sent_at, agora)} {horaCurta(m.sent_at)}
              </span>
              <span className="line-clamp-3 block text-texto/90">{descreverMensagem({ ...m, sent_by: "contato" })}</span>
            </p>
          ))}
        </div>
      )}

      <label className="mt-3 block">
        <span className="mb-1 flex items-center justify-between text-xs text-apoio">
          <span className="font-semibold uppercase tracking-wide text-cobre-claro">Mensagem sugerida</span>
          {editado && <span>editada</span>}
        </span>
        <textarea
          className="campo min-h-28 text-sm"
          rows={Math.min(12, Math.max(4, Math.ceil(texto.length / 36) + texto.split("\n").length - 1))}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={5000}
          aria-label={`Mensagem sugerida para ${nome}`}
        />
      </label>

      {semEnvio && <p className="mt-2 text-xs text-erro">Contato bloqueado: desbloqueie em Contatos para enviar.</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="botao botao-primario flex-1 sm:flex-none"
          onClick={() => aoEnviar(texto)}
          disabled={bloqueado || semEnvio || !texto.trim()}
        >
          {ocupado ? "Enviando…" : "Enviar"}
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => setAdiando((v) => !v)} disabled={bloqueado} aria-expanded={adiando}>
          Adiar
        </button>
        <button type="button" className="botao botao-perigo" onClick={aoDescartar} disabled={bloqueado}>
          Descartar
        </button>
      </div>

      {adiando && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-apoio">Adiar por:</span>
          {OPCOES_DE_ADIAR.map((dias) => (
            <button
              key={dias}
              type="button"
              className="botao botao-secundario px-3 py-1 text-xs"
              disabled={bloqueado}
              onClick={() => {
                setAdiando(false);
                aoAdiar(dias);
              }}
            >
              {dias === 1 ? "1 dia" : `${dias} dias`}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-borda pt-2 text-xs">
        {f.atendimento_id && (
          <Link href={`/atendimento/${f.atendimento_id}`} className="text-cobre-claro underline">
            Abrir conversa
          </Link>
        )}
        {oportunidade && (
          <Link href={`/funil/${oportunidade.id}`} className="text-cobre-claro underline">
            Abrir oportunidade
          </Link>
        )}
        <span className="text-apoio/80">Sugerida {tempoRelativo(f.created_at, agora)}</span>
      </div>
    </article>
  );
}
