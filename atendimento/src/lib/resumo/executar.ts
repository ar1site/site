import "server-only";

// Portas de verdade do resumo diário: Supabase, IA e fila de envio.
// A ordem das coisas e as regras ficam em `rotina.ts` (testado).

import { env } from "../env";
import { ETAPAS_ABERTAS } from "../funil/etapas";
import { gerarEstruturado } from "../ia";
import { supabaseServico } from "../supabase/service";
import type { Atendimento, Contato } from "../tipos";
import { enviarTexto } from "../whatsapp/zapi";
import {
  CHAVE_ATIVO,
  CHAVE_DESTINATARIOS,
  CHAVE_ULTIMO_ENVIO,
  CHAVES_DO_RESUMO,
  lerAtivo,
  lerDestinatarios,
  lerUltimoEnvio,
  type UltimoEnvio,
} from "./ajustes";
import {
  CAMPOS_DA_CONVERSA_INTERNA,
  ehConversaInterna,
  NOME_DO_CONTATO_INTERNO,
  NOTAS_DO_CONTATO_INTERNO,
} from "./conversa-interna";
import {
  HORAS_DO_RESUMO,
  type AtendimentoDoResumo,
  type ContatoDoResumo,
  type FollowupDoResumo,
  type OportunidadeDoResumo,
} from "./numeros";
import { rodarResumo, type PedidoDoResumo, type Portas, type ResultadoDoEnvio, type ResultadoDoResumo } from "./rotina";
import { esquemaResumo, montarPromptResumo } from "./texto";

/** Tempo máximo da chamada à IA (a rota tem 60 s e ainda precisa enviar). */
const TIMEOUT_IA_MS = 25_000;
const HORA_MS = 60 * 60 * 1000;

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function lerAjustes() {
  const { data, error } = await supabaseServico()
    .from("ar1_settings")
    .select("key, value")
    .in("key", [...CHAVES_DO_RESUMO]);
  if (error) throw new Error(`Erro ao ler os ajustes do resumo: ${error.message}`);
  const valor = (chave: string): unknown => (data ?? []).find((l) => l.key === chave)?.value;
  return {
    ativo: lerAtivo(valor(CHAVE_ATIVO)),
    destinatarios: lerDestinatarios(valor(CHAVE_DESTINATARIOS)),
    ultimoEnvio: lerUltimoEnvio(valor(CHAVE_ULTIMO_ENVIO)),
  };
}

async function lerDados(agora: Date) {
  const db = supabaseServico();
  const desde = new Date(agora.getTime() - HORAS_DO_RESUMO * HORA_MS).toISOString();

  const [atendimentos, oportunidades, followups] = await Promise.all([
    // Conversas abertas (para "aguardando resposta") e as criadas nas últimas 24 h.
    db
      .from("ar1_atendimentos")
      .select("id, contact_id, status, ai_kind, ai_service, ai_urgency, created_at, last_inbound_at, last_outbound_at")
      .or(`status.neq.fechado,created_at.gte.${desde}`)
      .order("created_at", { ascending: false })
      .limit(3000),
    // Oportunidades abertas e as fechadas nas últimas 24 h.
    db
      .from("ar1_quote_requests")
      .select("id, name, project_type, status, estimated_value, probability, next_action, next_action_at, closed_at, stage_changed_at")
      .or(`status.in.(${ETAPAS_ABERTAS.join(",")}),closed_at.gte.${desde}`)
      .limit(3000),
    db.from("ar1_followups").select("id, status").eq("status", "pendente").limit(1000),
  ]);
  const erro = atendimentos.error ?? oportunidades.error ?? followups.error;
  if (erro) throw new Error(`Erro ao ler os dados do resumo: ${erro.message}`);

  const lista = (atendimentos.data ?? []) as AtendimentoDoResumo[];
  const contatos: ContatoDoResumo[] = [];
  for (const lote of emLotes([...new Set(lista.map((a) => a.contact_id))], 100)) {
    const { data, error } = await db
      .from("ar1_wa_contacts")
      .select("id, phone, wa_name, display_name, blocked")
      .in("id", lote);
    if (error) throw new Error(`Erro ao ler os contatos do resumo: ${error.message}`);
    contatos.push(...((data ?? []) as ContatoDoResumo[]));
  }

  return {
    atendimentos: lista,
    contatos,
    oportunidades: (oportunidades.data ?? []) as OportunidadeDoResumo[],
    followups: (followups.data ?? []) as FollowupDoResumo[],
  };
}

async function escreverComIA(numeros: Parameters<Portas["escreverComIA"]>[0]): Promise<string> {
  const prompt = montarPromptResumo(numeros);
  const resposta = await gerarEstruturado({
    system: prompt.system,
    user: prompt.user,
    esquema: esquemaResumo,
    nomeEsquema: "resumo_diario",
    maxTokens: 1200,
    timeoutMs: TIMEOUT_IA_MS,
  });
  return resposta.dados.texto;
}

/**
 * Grava o último envio só se o dia ainda não estiver reservado. A condição
 * vai junto do UPDATE, então duas execuções simultâneas não passam as duas.
 */
async function reservarDia(envio: UltimoEnvio, forcar: boolean): Promise<boolean> {
  const db = supabaseServico();
  const linha = { key: CHAVE_ULTIMO_ENVIO, value: envio, updated_at: envio.enviado_em };

  if (forcar) {
    const { error } = await db.from("ar1_settings").upsert(linha, { onConflict: "key" });
    if (error) throw new Error(`Erro ao registrar o envio do resumo: ${error.message}`);
    return true;
  }

  // Primeiro envio da história: a chave ainda não existe.
  const { error: erroCriar } = await db.from("ar1_settings").insert(linha);
  if (!erroCriar) return true;
  if (erroCriar.code !== "23505") throw new Error(`Erro ao registrar o envio do resumo: ${erroCriar.message}`);

  // A chave existe: só grava se o dia guardado for outro (ou se não houver dia).
  const valor = { value: envio, updated_at: envio.enviado_em };
  const outroDia = await db
    .from("ar1_settings")
    .update(valor)
    .eq("key", CHAVE_ULTIMO_ENVIO)
    .neq("value->>dia", envio.dia)
    .select("key");
  if (outroDia.error) throw new Error(`Erro ao registrar o envio do resumo: ${outroDia.error.message}`);
  if ((outroDia.data ?? []).length > 0) return true;

  const semDia = await db
    .from("ar1_settings")
    .update(valor)
    .eq("key", CHAVE_ULTIMO_ENVIO)
    .is("value->>dia", null)
    .select("key");
  if (semDia.error) throw new Error(`Erro ao registrar o envio do resumo: ${semDia.error.message}`);
  return (semDia.data ?? []).length > 0;
}

async function devolverDia(anterior: UltimoEnvio | null): Promise<void> {
  const db = supabaseServico();
  const { error } = anterior
    ? await db.from("ar1_settings").update({ value: anterior }).eq("key", CHAVE_ULTIMO_ENVIO)
    : await db.from("ar1_settings").delete().eq("key", CHAVE_ULTIMO_ENVIO);
  if (error) console.error("[resumo] não foi possível desfazer a reserva do dia:", error.message);
}

/** Contato do destinatário: usa o que existe; se não existe, cria. */
async function garantirContato(telefone: string): Promise<Contato> {
  const db = supabaseServico();
  const { data: existente, error } = await db.from("ar1_wa_contacts").select("*").eq("phone", telefone).maybeSingle();
  if (error) throw new Error(`Erro ao buscar o contato: ${error.message}`);
  if (existente) return existente as Contato;

  const { data: criado, error: erroCriar } = await db
    .from("ar1_wa_contacts")
    .upsert(
      { phone: telefone, display_name: NOME_DO_CONTATO_INTERNO, notes: NOTAS_DO_CONTATO_INTERNO },
      { onConflict: "phone", ignoreDuplicates: false },
    )
    .select("*")
    .single();
  if (erroCriar) throw new Error(`Erro ao criar o contato: ${erroCriar.message}`);
  return criado as Contato;
}

/**
 * Conversa interna do destinatário: fechada e marcada como "pessoal", para
 * não aparecer na Fila nem virar retomada. Reaproveita a que já existe.
 */
async function garantirConversaInterna(contatoId: string): Promise<string> {
  const db = supabaseServico();
  const { data: fechadas, error } = await db
    .from("ar1_atendimentos")
    .select("id, status, ai_kind, ai_summary")
    .eq("contact_id", contatoId)
    .eq("status", "fechado")
    .eq("ai_kind", "pessoal")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Erro ao buscar a conversa interna: ${error.message}`);
  const existente = ((fechadas ?? []) as Pick<Atendimento, "id" | "status" | "ai_kind" | "ai_summary">[]).find(
    ehConversaInterna,
  );
  if (existente) return existente.id;

  const agora = new Date().toISOString();
  const { data: criada, error: erroCriar } = await db
    .from("ar1_atendimentos")
    .insert({ contact_id: contatoId, ...CAMPOS_DA_CONVERSA_INTERNA, ai_analyzed_at: agora, closed_at: agora })
    .select("id")
    .single();
  if (erroCriar) throw new Error(`Erro ao criar a conversa interna: ${erroCriar.message}`);
  return criada.id as string;
}

async function enviar(telefone: string, texto: string, usuarioId: string | null): Promise<ResultadoDoEnvio> {
  const db = supabaseServico();
  const contato = await garantirContato(telefone);
  if (contato.blocked) {
    return { telefone, ok: false, erro: "o contato está bloqueado em Contatos" };
  }
  const atendimentoId = await garantirConversaInterna(contato.id);

  if (env.whatsappProvider === "bridge") {
    // Mesmo caminho das mensagens da equipe: a ponte local lê a fila e envia.
    const { error } = await db.from("ar1_wa_outbox").insert({
      atendimento_id: atendimentoId,
      contact_id: contato.id,
      phone: contato.phone,
      text: texto,
      status: "queued",
      created_by: usuarioId,
    });
    if (error) return { telefone, ok: false, erro: `não entrou na fila de envio: ${error.message}` };
    return { telefone, ok: true };
  }

  // Z-API: envia na hora e registra a mensagem na conversa interna.
  const r = await enviarTexto(contato.phone, texto);
  const agora = new Date().toISOString();
  const { error } = await db.from("ar1_wa_messages").upsert(
    {
      atendimento_id: atendimentoId,
      contact_id: contato.id,
      external_id: r.messageId ?? r.zaapId ?? r.id ?? null,
      direction: "out",
      sent_by: "sistema",
      sent_by_user: usuarioId,
      kind: "text",
      body: texto,
      sent_at: agora,
    },
    { onConflict: "external_id", ignoreDuplicates: true },
  );
  if (error) console.error("[resumo] enviado, mas não registrado na conversa interna:", error.message);
  return { telefone, ok: true };
}

export const PORTAS_REAIS: Portas = { lerAjustes, lerDados, escreverComIA, reservarDia, devolverDia, enviar };

export function executarResumo(pedido: PedidoDoResumo): Promise<ResultadoDoResumo> {
  return rodarResumo(PORTAS_REAIS, pedido);
}
