import "server-only";

import { z } from "zod";
import { ErroIA, gerarEstruturado } from "../ia";
import { supabaseServico } from "../supabase/service";
import type { Atendimento, Contato, DadosExtraidos, Mensagem } from "../tipos";
import { LIMITE_MENSAGENS, montarContexto } from "./contexto";

export class ErroAnalise extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ErroAnalise";
  }
}

export function esquemaAnalise(servicos: string[]) {
  const lista = Array.from(new Set([...servicos, "Outro"])).filter(Boolean);
  return z.object({
    kind: z.enum(["lead", "cliente", "fornecedor", "pessoal", "spam", "indefinido"]),
    service: z.enum(lista as [string, ...string[]]),
    urgency: z.enum(["alta", "media", "baixa"]),
    summary: z.string(),
    extracted: z.object({
      nome: z.string().nullable(),
      empresa: z.string().nullable(),
      cidade: z.string().nullable(),
      data_prevista: z.string().nullable(),
      orcamento_estimado: z.string().nullable(),
      detalhes: z.string().nullable(),
    }),
    reply: z.string().nullable(),
    rationale: z.string(),
  });
}

export type ResultadoAnalise = z.infer<ReturnType<typeof esquemaAnalise>>;

export async function lerConfiguracoesDeAtendimento(): Promise<{
  instrucoes: string;
  servicos: string[];
}> {
  const { data } = await supabaseServico()
    .from("ar1_settings")
    .select("key, value")
    .in("key", ["atendimento.instrucoes", "atendimento.servicos"]);
  let instrucoes = "";
  let servicos: string[] = [];
  for (const linha of data ?? []) {
    if (linha.key === "atendimento.instrucoes" && typeof linha.value === "string") {
      instrucoes = linha.value;
    }
    if (linha.key === "atendimento.servicos" && Array.isArray(linha.value)) {
      servicos = (linha.value as unknown[]).filter((s): s is string => typeof s === "string");
    }
  }
  return { instrucoes, servicos };
}

/**
 * Analisa um atendimento com a IA e grava o resultado. Lança ErroAnalise
 * com mensagem legível (já registrada em ai_error) quando falha.
 */
export async function analisarAtendimento(
  atendimentoId: string,
  instrucaoExtra?: string | null,
): Promise<{ analise: ResultadoAnalise; sugestaoId: string | null; modelo: string }> {
  const db = supabaseServico();

  const { data: atendimentoBruto, error: erroAt } = await db
    .from("ar1_atendimentos")
    .select("*")
    .eq("id", atendimentoId)
    .maybeSingle();
  if (erroAt) throw new ErroAnalise(`Erro ao ler o atendimento: ${erroAt.message}`, 500);
  if (!atendimentoBruto) throw new ErroAnalise("Atendimento não encontrado.", 404);
  const atendimento = atendimentoBruto as Atendimento;

  const [{ data: contatoBruto }, { data: mensagensBrutas }, config] = await Promise.all([
    db.from("ar1_wa_contacts").select("*").eq("id", atendimento.contact_id).maybeSingle(),
    db
      .from("ar1_wa_messages")
      .select("direction, sent_by, kind, body, media_name, transcript, sent_at")
      .eq("atendimento_id", atendimentoId)
      .order("sent_at", { ascending: false })
      .limit(LIMITE_MENSAGENS),
    lerConfiguracoesDeAtendimento(),
  ]);
  if (!contatoBruto) throw new ErroAnalise("Contato do atendimento não encontrado.", 404);
  const contato = contatoBruto as Contato;
  const mensagens = ((mensagensBrutas ?? []) as Mensagem[]).slice().reverse();

  const contexto = montarContexto({
    contato,
    mensagens,
    instrucoes: config.instrucoes,
    servicos: config.servicos,
    extraidoAnterior: atendimento.ai_extracted as DadosExtraidos,
    instrucaoExtra,
  });

  let analise: ResultadoAnalise;
  let modelo: string;
  try {
    const resposta = await gerarEstruturado({
      system: contexto.system,
      user: contexto.user,
      esquema: esquemaAnalise(config.servicos),
      nomeEsquema: "analise_atendimento",
      maxTokens: 4096,
    });
    analise = resposta.dados;
    modelo = resposta.modelo;
  } catch (e) {
    const msg = e instanceof ErroIA ? e.message : e instanceof Error ? e.message : "Erro na IA.";
    await db
      .from("ar1_atendimentos")
      .update({ ai_error: msg.slice(0, 1000) })
      .eq("id", atendimentoId);
    throw new ErroAnalise(msg, e instanceof ErroIA ? e.status : 502);
  }

  // Regras de segurança no código, independentemente do modelo:
  let reply = analise.reply?.trim() || null;
  if (analise.kind === "spam") reply = null;
  if (contexto.ultimaFoiNossa && !instrucaoExtra?.trim()) reply = null;
  if (reply && reply.length > 5000) reply = reply.slice(0, 5000);

  const extracted: DadosExtraidos = {
    nome: analise.extracted.nome,
    empresa: analise.extracted.empresa,
    cidade: analise.extracted.cidade,
    data_prevista: analise.extracted.data_prevista,
    orcamento_estimado: analise.extracted.orcamento_estimado,
    detalhes: analise.extracted.detalhes,
  };

  const agora = new Date().toISOString();
  const { error: erroUpd } = await db
    .from("ar1_atendimentos")
    .update({
      ai_kind: analise.kind,
      ai_service: analise.service.slice(0, 100),
      ai_urgency: analise.urgency,
      ai_summary: analise.summary.slice(0, 2000),
      ai_extracted: extracted,
      ai_analyzed_at: agora,
      ai_analysis_due_at: null,
      ai_error: null,
    })
    .eq("id", atendimentoId);
  if (erroUpd) throw new ErroAnalise(`Erro ao gravar a análise: ${erroUpd.message}`, 500);

  let sugestaoId: string | null = null;
  if (reply) {
    await db
      .from("ar1_ai_suggestions")
      .update({ status: "substituida" })
      .eq("atendimento_id", atendimentoId)
      .eq("status", "pendente");
    const { data: sugestao, error: erroSug } = await db
      .from("ar1_ai_suggestions")
      .insert({
        atendimento_id: atendimentoId,
        reply,
        rationale: analise.rationale.slice(0, 2000),
        status: "pendente",
        model: modelo.slice(0, 100),
      })
      .select("id")
      .single();
    if (erroSug) throw new ErroAnalise(`Erro ao gravar a sugestão: ${erroSug.message}`, 500);
    sugestaoId = sugestao.id;
  }

  return { analise: { ...analise, reply, extracted: analise.extracted }, sugestaoId, modelo };
}
