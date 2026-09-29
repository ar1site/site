import "server-only";

// Lado "banco" do webhook: contato -> atendimento -> mensagem, com dedupe.

import { supabaseServico } from "../supabase/service";
import type { Atendimento, Contato, Outbox } from "../tipos";
import type { MensagemNormalizada } from "./parser";

export interface ResultadoProcessamento {
  situacao: "gravada" | "duplicada" | "bloqueado";
  atendimentoId: string | null;
  mensagemId: string | null;
  contatoId: string | null;
  /** true quando a mensagem é do contato (dispara análise). */
  entrada: boolean;
}

async function garantirContato(m: MensagemNormalizada): Promise<Contato> {
  const db = supabaseServico();
  const { data: existente, error } = await db
    .from("ar1_wa_contacts")
    .select("*")
    .eq("phone", m.phone)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar contato: ${error.message}`);

  if (existente) {
    const contato = existente as Contato;
    const mudancas: Partial<Contato> = {};
    if (m.contactName && m.contactName !== contato.wa_name) mudancas.wa_name = m.contactName;
    if (m.photoUrl && !contato.photo_url) mudancas.photo_url = m.photoUrl;
    if (Object.keys(mudancas).length) {
      const { data: atualizado } = await db
        .from("ar1_wa_contacts")
        .update(mudancas)
        .eq("id", contato.id)
        .select("*")
        .maybeSingle();
      return (atualizado as Contato) ?? { ...contato, ...mudancas };
    }
    return contato;
  }

  const { data: criado, error: erroCriar } = await db
    .from("ar1_wa_contacts")
    .upsert(
      { phone: m.phone, wa_name: m.contactName, photo_url: m.photoUrl },
      { onConflict: "phone", ignoreDuplicates: false },
    )
    .select("*")
    .single();
  if (erroCriar) throw new Error(`Erro ao criar contato: ${erroCriar.message}`);
  return criado as Contato;
}

async function garantirAtendimentoAberto(contatoId: string): Promise<Atendimento> {
  const db = supabaseServico();
  const { data: aberto } = await db
    .from("ar1_atendimentos")
    .select("*")
    .eq("contact_id", contatoId)
    .neq("status", "fechado")
    .maybeSingle();
  if (aberto) return aberto as Atendimento;

  const { data: criado, error } = await db
    .from("ar1_atendimentos")
    .insert({ contact_id: contatoId, status: "novo" })
    .select("*")
    .single();
  if (error) {
    // Corrida: outra mensagem criou o atendimento no meio do caminho (índice único).
    const { data: denovo } = await db
      .from("ar1_atendimentos")
      .select("*")
      .eq("contact_id", contatoId)
      .neq("status", "fechado")
      .maybeSingle();
    if (denovo) return denovo as Atendimento;
    throw new Error(`Erro ao criar atendimento: ${error.message}`);
  }
  return criado as Atendimento;
}

async function lerOutbox(outboxId: string | null): Promise<Outbox | null> {
  if (!outboxId) return null;
  const { data } = await supabaseServico()
    .from("ar1_wa_outbox")
    .select("*")
    .eq("id", outboxId)
    .maybeSingle();
  return (data as Outbox | null) ?? null;
}

/**
 * Grava uma mensagem normalizada (recebida ou enviada) no banco.
 * Dedupe por external_id (ON CONFLICT DO NOTHING).
 */
export async function processarMensagem(
  m: MensagemNormalizada,
  raw: unknown,
): Promise<ResultadoProcessamento> {
  const db = supabaseServico();
  const contato = await garantirContato(m);

  if (contato.blocked) {
    return {
      situacao: "bloqueado",
      atendimentoId: null,
      mensagemId: null,
      contatoId: contato.id,
      entrada: !m.fromMe,
    };
  }

  const atendimento = await garantirAtendimentoAberto(contato.id);
  const outbox = m.fromMe ? await lerOutbox(m.outboxId) : null;

  const { data: inserida, error } = await db
    .from("ar1_wa_messages")
    .upsert(
      {
        atendimento_id: atendimento.id,
        contact_id: contato.id,
        external_id: m.externalId,
        direction: m.fromMe ? "out" : "in",
        sent_by: m.fromMe ? (outbox ? "sistema" : "celular") : "contato",
        sent_by_user: outbox?.created_by ?? null,
        kind: m.kind,
        body: m.body,
        media_url: m.mediaUrl,
        media_mime: m.mediaMime,
        media_name: m.mediaName,
        sent_at: m.sentAt.toISOString(),
        raw,
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`Erro ao gravar mensagem: ${error.message}`);

  const mensagemId = inserida?.[0]?.id ?? null;
  if (!mensagemId) {
    return {
      situacao: "duplicada",
      atendimentoId: atendimento.id,
      mensagemId: null,
      contatoId: contato.id,
      entrada: !m.fromMe,
    };
  }

  if (outbox) {
    await db
      .from("ar1_wa_outbox")
      .update({
        status: "sent",
        external_id: m.externalId,
        error: null,
        sent_at: m.sentAt.toISOString(),
      })
      .eq("id", outbox.id);
    if (outbox.suggestion_id) {
      await db
        .from("ar1_ai_suggestions")
        .update({ message_id: mensagemId })
        .eq("id", outbox.suggestion_id);
    }
  }

  return {
    situacao: "gravada",
    atendimentoId: atendimento.id,
    mensagemId,
    contatoId: contato.id,
    entrada: !m.fromMe,
  };
}

export async function gravarStatusConexao(valor: {
  connected: boolean;
  checked_at: string;
  state?: string | null;
  phone?: string | null;
  error?: string | null;
}) {
  await supabaseServico()
    .from("ar1_settings")
    .upsert({ key: "whatsapp.status", value: valor }, { onConflict: "key" });
}

/** Último estado gravado por esta instância do servidor (evita ler o banco a cada aviso). */
let ultimoStatusGravado: { chave: string; em: number } | null = null;
const INTERVALO_STATUS_REPETIDO_MS = 60_000;

/**
 * Segunda barreira contra enxurradas de avisos de conexão (a ponte já agrupa): estado igual
 * ao último só é gravado de novo depois de 60 s. Devolve true quando gravou.
 */
export async function gravarStatusConexaoSeMudou(valor: Parameters<typeof gravarStatusConexao>[0]) {
  const chave = `${valor.state ?? ""}|${valor.connected}`;
  const agora = Date.now();
  if (ultimoStatusGravado?.chave === chave && agora - ultimoStatusGravado.em < INTERVALO_STATUS_REPETIDO_MS) {
    return false;
  }
  const { data } = await supabaseServico()
    .from("ar1_settings")
    .select("value")
    .eq("key", "whatsapp.status")
    .maybeSingle();
  const atual = (data?.value ?? null) as { state?: string | null; connected?: boolean | null; checked_at?: string | null } | null;
  if (atual && `${atual.state ?? ""}|${atual.connected}` === chave && atual.checked_at) {
    const idade = agora - new Date(atual.checked_at).getTime();
    if (idade >= 0 && idade < INTERVALO_STATUS_REPETIDO_MS) {
      ultimoStatusGravado = { chave, em: agora };
      return false;
    }
  }
  await gravarStatusConexao(valor);
  ultimoStatusGravado = { chave, em: agora };
  return true;
}

export async function gravarQr(valor: { media_path: string | null; updated_at: string }) {
  await supabaseServico()
    .from("ar1_settings")
    .upsert({ key: "whatsapp.qr", value: valor }, { onConflict: "key" });
}

export async function registrarEvento(kind: string, payload: unknown) {
  await supabaseServico()
    .from("ar1_wa_events")
    .insert({ kind: kind.slice(0, 100), payload });
}
