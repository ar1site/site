"use client";

// A oportunidade do funil dentro da conversa. Sem oportunidade: "Criar
// oportunidade" abre um formulário curto, já com a sugestão da IA (editável).
// Com oportunidade: resumo, link para o funil e sugestões com Aceitar.

import Link from "next/link";
import { useState } from "react";
import { lerOportunidadeIA, temSugestao, textoProximaAcao } from "@/lib/analise/oportunidade";
import { formatarTelefone, nomeDoContato } from "@/lib/formato";
import { criarOportunidade } from "@/lib/funil/dados";
import { diaCurto } from "@/lib/funil/datas";
import { acaoVencida, etapaAberta, formatarReais, probabilidadeEfetiva, ROTULO_ETAPA } from "@/lib/funil/etapas";
import type { CamposNovaOportunidade } from "@/lib/funil/formulario";
import { camposIniciaisDaIA } from "@/lib/funil/sugestoes";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import type { Atendimento, Contato, DadosExtraidos, Oportunidade } from "@/lib/tipos";
import { FormularioOportunidade, type ValoresIniciais } from "./DialogosFunil";
import { Propostas } from "./Propostas";
import { SeloEtapa } from "./Selos";
import { SugestoesIA } from "./SugestoesIA";

export function OportunidadeNaConversa({
  atendimento,
  contato,
  oportunidade,
  outrasDoContato,
  usuarioId,
  propostasAtivas = true,
  aoMudar,
}: {
  atendimento: Atendimento;
  contato: Contato;
  /** A oportunidade ligada a esta conversa, se houver. */
  oportunidade: Oportunidade | null;
  /** Oportunidades abertas do mesmo contato que ainda não estão ligadas a esta conversa. */
  outrasDoContato: Oportunidade[];
  usuarioId: string;
  /**
   * A conversa desenha este cartão duas vezes (celular e painel do desktop).
   * Só o que está visível carrega as propostas, para não buscar em dobro.
   */
  propostasAtivas?: boolean;
  aoMudar: () => void | Promise<void>;
}) {
  const [criando, setCriando] = useState(false);
  const [ligando, setLigando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora] = useState(() => Date.now());
  const ia = lerOportunidadeIA(atendimento.ai_extracted);

  async function ligar(id: string): Promise<string | null> {
    const { error } = await supabaseNoNavegador()
      .from("ar1_atendimentos")
      .update({ quote_request_id: id })
      .eq("id", atendimento.id);
    if (error) return `A oportunidade foi criada, mas não foi ligada à conversa: ${error.message}`;
    return null;
  }

  async function criar(campos: CamposNovaOportunidade): Promise<string | null> {
    const r = await criarOportunidade({
      ...campos,
      contact_id: contato.id,
      client_id: contato.client_id,
      source: "whatsapp",
      source_path: "whatsapp",
    });
    if (!r.ok) return r.erro;
    const erroLigar = await ligar(r.id);
    if (erroLigar) return erroLigar;
    setCriando(false);
    await aoMudar();
    return null;
  }

  async function ligarExistente(id: string) {
    setLigando(id);
    setErro(null);
    const e = await ligar(id);
    setLigando(null);
    if (e) setErro(e.replace("A oportunidade foi criada, mas não", "Não"));
    else await aoMudar();
  }

  // ------------------------------------------------ já existe oportunidade
  if (oportunidade) {
    const vencida = acaoVencida(oportunidade, agora);
    const prob = probabilidadeEfetiva(oportunidade);
    const acao = textoProximaAcao(oportunidade.next_action, oportunidade.next_action_at, agora);
    return (
      <div className="space-y-2 rounded-lg border border-borda bg-superficie-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-apoio">Oportunidade</p>
          <SeloEtapa etapa={oportunidade.status} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-apoio">Valor</dt>
          <dd>
            {formatarReais(oportunidade.estimated_value)}
            {etapaAberta(oportunidade.status) ? ` · ${prob.valor}%${prob.padrao ? " (padrão)" : ""}` : ""}
          </dd>
          <dt className="text-apoio">Próxima ação</dt>
          <dd className={`break-words ${vencida ? "font-semibold text-erro" : ""}`}>
            {acao || "nenhuma"}
            {vencida ? " (vencida)" : ""}
          </dd>
        </dl>
        <SugestoesIA oportunidade={oportunidade} ia={ia} aoAplicar={() => void aoMudar()} compacto />
        <Link href={`/funil/${oportunidade.id}`} className="botao botao-secundario w-full py-1.5 text-xs">
          Abrir no funil
        </Link>
        {propostasAtivas && (
          <div className="border-t border-borda pt-3">
            <Propostas oportunidade={oportunidade} atendimentoId={atendimento.id} aoMudar={aoMudar} compacto />
          </div>
        )}
      </div>
    );
  }

  // ------------------------------------------------------- formulário curto
  if (criando) {
    const ex = (atendimento.ai_extracted ?? {}) as DadosExtraidos;
    const daIA = camposIniciaisDaIA(ia);
    const resumo = [
      atendimento.ai_summary,
      ex.detalhes ? `Detalhes: ${ex.detalhes}` : null,
      ex.cidade ? `Cidade: ${ex.cidade}` : null,
      ex.orcamento_estimado ? `Orçamento mencionado: ${ex.orcamento_estimado}` : null,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 5000);
    const inicial: ValoresIniciais = {
      name: (ex.nome || nomeDoContato(contato)).slice(0, 200),
      phone: formatarTelefone(contato.phone),
      company: (ex.empresa || contato.company || "").slice(0, 200),
      project_type: (atendimento.ai_service || "").slice(0, 100),
      source: "whatsapp",
      assigned_to: atendimento.assigned_to ?? usuarioId,
      message: resumo || null,
      expected_date: ex.data_prevista && /^\d{4}-\d{2}-\d{2}$/.test(ex.data_prevista) ? ex.data_prevista : null,
      ...daIA,
    };
    return (
      <div className="rounded-lg border border-cobre/50 bg-superficie-2 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-cobre-claro">Nova oportunidade</p>
        <FormularioOportunidade
          inicial={inicial}
          fixos={["telefone", "origem", "responsavel"]}
          avisoIA={temSugestao(ia)}
          rotuloSalvar="Salvar oportunidade"
          aoSalvar={criar}
          aoCancelar={() => setCriando(false)}
        />
      </div>
    );
  }

  // ----------------------------------------------------- ainda sem oportunidade
  return (
    <div className="space-y-2">
      {temSugestao(ia) && ia && (
        <div className="rounded-lg border border-borda bg-superficie-2 p-3 text-xs">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-apoio">Leitura comercial da IA</p>
          <ul className="space-y-0.5">
            {ia.etapa_sugerida && <li>Etapa sugerida: {ROTULO_ETAPA[ia.etapa_sugerida]}</li>}
            {ia.valor_estimado !== null && <li>Valor estimado: {formatarReais(ia.valor_estimado)}</li>}
            {ia.probabilidade !== null && <li>Probabilidade: {ia.probabilidade}%</li>}
            {ia.proxima_acao && (
              <li className="break-words">Próxima ação: {textoProximaAcao(ia.proxima_acao, ia.proxima_acao_em, agora)}</li>
            )}
          </ul>
          {ia.motivo && <p className="mt-1 leading-snug text-apoio">Por quê: {ia.motivo}</p>}
        </div>
      )}

      {outrasDoContato.map((o) => (
        <div key={o.id} className="rounded-lg border border-borda bg-superficie-2 p-3 text-xs">
          <p className="leading-snug">
            Este contato já tem uma oportunidade aberta: <span className="font-semibold">{o.project_type}</span>
            {o.estimated_value !== null ? `, ${formatarReais(o.estimated_value)}` : ""}
            {o.next_action_at ? `, próxima ação até ${diaCurto(o.next_action_at, agora)}` : ""}.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SeloEtapa etapa={o.status} />
            <button
              type="button"
              className="botao botao-secundario py-1 text-xs"
              onClick={() => ligarExistente(o.id)}
              disabled={ligando !== null}
            >
              {ligando === o.id ? "Ligando…" : "Ligar a esta conversa"}
            </button>
            <Link href={`/funil/${o.id}`} className="text-cobre-claro underline">
              ver
            </Link>
          </div>
        </div>
      ))}

      {erro && <p className="text-xs text-erro">{erro}</p>}

      <button type="button" className="botao botao-secundario w-full py-1.5 text-xs" onClick={() => setCriando(true)}>
        Criar oportunidade
      </button>
    </div>
  );
}
