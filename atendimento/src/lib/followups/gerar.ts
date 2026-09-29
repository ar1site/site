import "server-only";

// Rotina das retomadas: reativa as adiadas, escolhe os candidatos e pede à IA
// a mensagem de cada um. Só grava sugestões (status "pendente"); o envio é
// sempre decisão de uma pessoa, na tela Retomar.

import { lerConfiguracoesDeAtendimento, lerDocumentosDeContexto } from "../analise/executar";
import { ETAPAS_ABERTAS } from "../funil/etapas";
import { ErroIA, gerarEstruturado } from "../ia";
import { supabaseServico } from "../supabase/service";
import type { Atendimento, Contato, Mensagem, Oportunidade } from "../tipos";
import {
  adiadosParaReativar,
  CHAVE_DIAS_SEM_RETORNO,
  DIAS_MAXIMOS_PARADA,
  lerDiasSemRetorno,
  selecionarCandidatos,
  type AtendimentoParaRetomada,
  type Candidato,
  type ContatoParaRetomada,
  type FollowupExistente,
  type OportunidadeParaRetomada,
} from "./candidatos";
import {
  esquemaFollowup,
  LIMITE_MENSAGENS_RETOMADA,
  montarFollowup,
  montarPromptFollowup,
} from "./prompt";

export interface ResultadoGeracao {
  /** Adiadas que voltaram a pendente. */
  reativados: number;
  /** Candidatos escolhidos nesta execução. */
  candidatos: number;
  /** Sugestões novas gravadas. */
  criados: number;
  /** Candidatos que ficaram para a próxima execução por falta de tempo. */
  adiadosPorTempo: number;
  falhas: { contact_id: string; erro: string }[];
}

/** Chamadas à IA ao mesmo tempo. */
const PARALELO = 5;
/** Depois deste tempo de execução, nenhuma chamada nova à IA começa (a rota tem 60 s). */
const PRAZO_PARA_COMECAR_MS = 36_000;
/** Tempo máximo de cada chamada à IA. */
const TIMEOUT_IA_MS = 18_000;

const COLUNAS_ATENDIMENTO =
  "id, contact_id, status, outcome, ai_kind, ai_summary, quote_request_id, last_message_at, last_inbound_at, last_outbound_at";
const COLUNAS_FOLLOWUP = "id, contact_id, status, due_at, decided_at, updated_at";
const DIA_MS = 24 * 60 * 60 * 1000;

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

type AtendimentoLido = AtendimentoParaRetomada & Pick<Atendimento, "ai_summary">;

export async function gerarFollowups(opcoes: { agora?: Date } = {}): Promise<ResultadoGeracao> {
  const inicio = Date.now();
  const agora = opcoes.agora ?? new Date();
  const db = supabaseServico();

  // 1. Configuração ----------------------------------------------------------
  const [{ data: ajuste }, config] = await Promise.all([
    db.from("ar1_settings").select("value").eq("key", CHAVE_DIAS_SEM_RETORNO).maybeSingle(),
    lerConfiguracoesDeAtendimento(),
  ]);
  const diasSemRetorno = lerDiasSemRetorno(ajuste?.value);

  // 2. Follow-ups existentes (pendentes, adiados e os decididos recentemente) -
  const desde = new Date(agora.getTime() - 90 * DIA_MS).toISOString();
  const [emEspera, decididos] = await Promise.all([
    db.from("ar1_followups").select(COLUNAS_FOLLOWUP).in("status", ["pendente", "adiado"]).limit(5000),
    db
      .from("ar1_followups")
      .select(COLUNAS_FOLLOWUP)
      .in("status", ["enviado", "descartado"])
      .gte("updated_at", desde)
      .limit(5000),
  ]);
  const erroFollowups = emEspera.error ?? decididos.error;
  if (erroFollowups) throw new Error(`Erro ao ler as retomadas: ${erroFollowups.message}`);
  const followups = [...(emEspera.data ?? []), ...(decididos.data ?? [])] as FollowupExistente[];

  // 3. Adiadas com prazo vencido voltam a pendente ---------------------------
  let reativados = 0;
  const pendentes = new Set(followups.filter((f) => f.status === "pendente").map((f) => f.contact_id));
  for (const id of adiadosParaReativar(followups, agora)) {
    const f = followups.find((x) => x.id === id);
    if (!f) continue;
    // O banco aceita só uma pendente por contato.
    const novoStatus = pendentes.has(f.contact_id) ? "descartado" : "pendente";
    const { error } = await db
      .from("ar1_followups")
      .update({ status: novoStatus })
      .eq("id", id)
      .eq("status", "adiado");
    if (error) {
      console.error("[followups] não foi possível reativar a retomada adiada", id, error.message);
      continue;
    }
    f.status = novoStatus;
    if (novoStatus === "pendente") {
      pendentes.add(f.contact_id);
      reativados += 1;
    }
  }

  // 4. Conversas abertas e oportunidades com ação vencida --------------------
  const limiteAntigo = new Date(agora.getTime() - (DIAS_MAXIMOS_PARADA + 1) * DIA_MS).toISOString();
  const [{ data: abertosBrutos, error: erroAbertos }, { data: oportunidadesBrutas, error: erroOportunidades }] =
    await Promise.all([
      db
        .from("ar1_atendimentos")
        .select(COLUNAS_ATENDIMENTO)
        .neq("status", "fechado")
        .gte("last_message_at", limiteAntigo)
        .order("last_message_at", { ascending: true })
        .limit(2000),
      db
        .from("ar1_quote_requests")
        .select("id, contact_id, status, next_action, next_action_at, estimated_value, probability, project_type")
        .in("status", [...ETAPAS_ABERTAS])
        .not("contact_id", "is", null)
        .lt("next_action_at", agora.toISOString())
        .order("next_action_at", { ascending: true })
        .limit(500),
    ]);
  if (erroAbertos) throw new Error(`Erro ao ler os atendimentos: ${erroAbertos.message}`);
  if (erroOportunidades) throw new Error(`Erro ao ler as oportunidades: ${erroOportunidades.message}`);

  const atendimentos = (abertosBrutos ?? []) as AtendimentoLido[];
  type OportunidadeLida = OportunidadeParaRetomada &
    Pick<Oportunidade, "estimated_value" | "probability" | "project_type">;
  const oportunidades = (oportunidadesBrutas ?? []) as OportunidadeLida[];

  // Oportunidade com ação vencida pode estar com a conversa aberta fora da
  // janela acima, ou só com conversas encerradas: busca as conversas do contato.
  const conhecidos = new Set(atendimentos.map((a) => a.id));
  const contatosDasOportunidades = [
    ...new Set(oportunidades.map((o) => o.contact_id).filter((id): id is string => Boolean(id))),
  ];
  for (const lote of emLotes(contatosDasOportunidades, 100)) {
    const { data, error } = await db
      .from("ar1_atendimentos")
      .select(COLUNAS_ATENDIMENTO)
      .in("contact_id", lote)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1000);
    if (error) throw new Error(`Erro ao ler as conversas das oportunidades: ${error.message}`);
    for (const a of (data ?? []) as AtendimentoLido[]) {
      if (conhecidos.has(a.id)) continue;
      conhecidos.add(a.id);
      atendimentos.push(a);
    }
  }

  // 5. Contatos envolvidos ---------------------------------------------------
  const idsContatos = [...new Set(atendimentos.map((a) => a.contact_id))];
  const contatos = new Map<string, Contato>();
  for (const lote of emLotes(idsContatos, 100)) {
    const { data, error } = await db.from("ar1_wa_contacts").select("*").in("id", lote);
    if (error) throw new Error(`Erro ao ler os contatos: ${error.message}`);
    for (const c of (data ?? []) as Contato[]) contatos.set(c.id, c);
  }

  // 6. Seleção (regras puras) ------------------------------------------------
  const candidatos = selecionarCandidatos({
    atendimentos,
    contatos: [...contatos.values()] as ContatoParaRetomada[],
    oportunidades,
    followups,
    agora,
    diasSemRetorno,
  });

  // 7. Uma mensagem por candidato, com a mesma base de contexto da análise ----
  const resultado: ResultadoGeracao = {
    reativados,
    candidatos: candidatos.length,
    criados: 0,
    adiadosPorTempo: 0,
    falhas: [],
  };
  const atendimentoPorId = new Map(atendimentos.map((a) => [a.id, a]));
  const oportunidadePorId = new Map(oportunidades.map((o) => [o.id, o]));

  async function preparar(candidato: Candidato): Promise<void> {
    const contato = contatos.get(candidato.contact_id);
    if (!contato) return;
    const [{ data: mensagensBrutas, error: erroMsg }, documentos, oportunidade] = await Promise.all([
      db
        .from("ar1_wa_messages")
        .select("direction, sent_by, kind, body, media_name, transcript, sent_at")
        .eq("atendimento_id", candidato.atendimento_id)
        .order("sent_at", { ascending: false })
        .limit(LIMITE_MENSAGENS_RETOMADA),
      lerDocumentosDeContexto(candidato.contact_id),
      lerOportunidade(candidato.quote_request_id, oportunidadePorId),
    ]);
    if (erroMsg) throw new Error(`Erro ao ler as mensagens: ${erroMsg.message}`);
    const mensagens = ((mensagensBrutas ?? []) as Mensagem[]).slice().reverse();

    const prompt = montarPromptFollowup({
      candidato,
      contato,
      mensagens,
      instrucoes: config.instrucoes,
      resumo: atendimentoPorId.get(candidato.atendimento_id)?.ai_summary ?? null,
      oportunidade,
      baseConhecimento: documentos.baseConhecimento,
      contextoCliente: documentos.contextoCliente,
      agora,
    });

    const resposta = await gerarEstruturado({
      system: prompt.system,
      user: prompt.user,
      esquema: esquemaFollowup,
      nomeEsquema: "retomada_whatsapp",
      maxTokens: 1500,
      timeoutMs: TIMEOUT_IA_MS,
    });
    const pronto = montarFollowup(candidato, resposta.dados);
    if (!pronto) throw new Error("A IA não escreveu a mensagem.");

    const { error } = await db.from("ar1_followups").insert({
      contact_id: candidato.contact_id,
      atendimento_id: candidato.atendimento_id,
      quote_request_id: candidato.quote_request_id,
      reason: pronto.reason,
      suggested_text: pronto.suggested_text,
      priority: pronto.priority,
      due_at: agora.toISOString(),
      status: "pendente",
      model: resposta.modelo.slice(0, 100),
    });
    if (error) {
      // 23505: outra execução criou a pendente deste contato no meio do caminho.
      if (error.code === "23505") return;
      throw new Error(`Erro ao gravar a retomada: ${error.message}`);
    }
    resultado.criados += 1;
  }

  const fila = [...candidatos];
  async function trabalhador(): Promise<void> {
    for (;;) {
      const candidato = fila.shift();
      if (!candidato) return;
      if (Date.now() - inicio > PRAZO_PARA_COMECAR_MS) {
        resultado.adiadosPorTempo += 1;
        continue;
      }
      try {
        await preparar(candidato);
      } catch (e) {
        const erro = e instanceof ErroIA || e instanceof Error ? e.message : "Erro desconhecido.";
        console.error("[followups] falha ao preparar a retomada", candidato.contact_id, erro);
        resultado.falhas.push({ contact_id: candidato.contact_id, erro: erro.slice(0, 300) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, () => trabalhador()));

  return resultado;
}

type OportunidadeDoPrompt = Pick<
  Oportunidade,
  "status" | "estimated_value" | "probability" | "next_action" | "next_action_at" | "project_type"
>;

async function lerOportunidade(
  id: string | null,
  conhecidas: Map<string, OportunidadeDoPrompt>,
): Promise<OportunidadeDoPrompt | null> {
  if (!id) return null;
  const conhecida = conhecidas.get(id);
  if (conhecida) return conhecida;
  const { data } = await supabaseServico()
    .from("ar1_quote_requests")
    .select("status, estimated_value, probability, next_action, next_action_at, project_type")
    .eq("id", id)
    .maybeSingle();
  return (data as OportunidadeDoPrompt | null) ?? null;
}
