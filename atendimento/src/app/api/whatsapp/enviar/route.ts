import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { supabaseServico } from "@/lib/supabase/service";
import type { Atendimento, Contato, Sugestao } from "@/lib/tipos";
import { enviarTexto, ErroZapi } from "@/lib/whatsapp/zapi";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function erro(mensagem: string, status = 400) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * Envia uma mensagem de texto para o contato do atendimento.
 *   - WHATSAPP_PROVIDER=bridge: enfileira em ar1_wa_outbox; a ponte local envia
 *     e devolve o resultado pelo webhook (bridge.message com outbox_id).
 *   - WHATSAPP_PROVIDER=zapi: chama a Z-API na hora e grava a mensagem.
 * Em ambos, a sugestão (se houver) é marcada como aprovada/editada.
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  let body: { atendimento_id?: unknown; text?: unknown; suggestion_id?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // corpo vazio
  }
  const atendimentoId = typeof body.atendimento_id === "string" ? body.atendimento_id : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const suggestionId = typeof body.suggestion_id === "string" ? body.suggestion_id : null;

  if (!UUID.test(atendimentoId)) return erro("Atendimento inválido.");
  if (!text) return erro("Escreva a mensagem antes de enviar.");
  if (text.length > 5000) return erro("A mensagem é longa demais (máximo 5000 caracteres).");
  if (suggestionId && !UUID.test(suggestionId)) return erro("Sugestão inválida.");

  const db = supabaseServico();
  const { data: atendimentoBruto } = await db
    .from("ar1_atendimentos")
    .select("*")
    .eq("id", atendimentoId)
    .maybeSingle();
  if (!atendimentoBruto) return erro("Atendimento não encontrado.", 404);
  const atendimento = atendimentoBruto as Atendimento;

  const { data: contatoBruto } = await db
    .from("ar1_wa_contacts")
    .select("*")
    .eq("id", atendimento.contact_id)
    .maybeSingle();
  if (!contatoBruto) return erro("Contato não encontrado.", 404);
  const contato = contatoBruto as Contato;
  if (contato.blocked) return erro("Este contato está bloqueado. Desbloqueie em Contatos para enviar.");

  let sugestao: Sugestao | null = null;
  if (suggestionId) {
    const { data } = await db
      .from("ar1_ai_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .eq("atendimento_id", atendimentoId)
      .maybeSingle();
    sugestao = (data as Sugestao | null) ?? null;
  }
  const statusSugestao = sugestao
    ? sugestao.reply.trim() === text
      ? "aprovada"
      : "editada"
    : null;

  // ------------------------------------------------------------- ponte local
  if (env.whatsappProvider === "bridge") {
    const { data: item, error: erroOutbox } = await db
      .from("ar1_wa_outbox")
      .insert({
        atendimento_id: atendimentoId,
        contact_id: contato.id,
        phone: contato.phone,
        text,
        status: "queued",
        suggestion_id: sugestao?.id ?? null,
        created_by: sessao.user.id,
      })
      .select("id")
      .single();
    if (erroOutbox) return erro(`Não foi possível enfileirar a mensagem: ${erroOutbox.message}`, 500);

    if (sugestao && statusSugestao) {
      await db
        .from("ar1_ai_suggestions")
        .update({
          status: statusSugestao,
          final_text: text,
          decided_by: sessao.user.id,
          decided_at: new Date().toISOString(),
        })
        .eq("id", sugestao.id);
    }

    return NextResponse.json({ ok: true, modo: "fila", outbox_id: item.id });
  }

  // ------------------------------------------------------------------- Z-API
  let externalId: string | null = null;
  try {
    const r = await enviarTexto(contato.phone, text);
    externalId = r.messageId ?? r.zaapId ?? r.id ?? null;
  } catch (e) {
    const msg = e instanceof ErroZapi ? e.message : "Falha ao enviar pelo WhatsApp.";
    return erro(msg, 502);
  }

  const agora = new Date().toISOString();
  const { data: mensagem, error: erroMsg } = await db
    .from("ar1_wa_messages")
    .upsert(
      {
        atendimento_id: atendimentoId,
        contact_id: contato.id,
        external_id: externalId,
        direction: "out",
        sent_by: "sistema",
        sent_by_user: sessao.user.id,
        kind: "text",
        body: text,
        sent_at: agora,
      },
      { onConflict: "external_id", ignoreDuplicates: true },
    )
    .select("id");
  if (erroMsg) {
    // A mensagem já saiu pelo WhatsApp; avisamos que o registro falhou.
    return erro(`A mensagem foi enviada, mas não foi registrada: ${erroMsg.message}`, 500);
  }
  const mensagemId = mensagem?.[0]?.id ?? null;

  if (sugestao && statusSugestao) {
    await db
      .from("ar1_ai_suggestions")
      .update({
        status: statusSugestao,
        final_text: text,
        decided_by: sessao.user.id,
        decided_at: agora,
        message_id: mensagemId,
      })
      .eq("id", sugestao.id);
  }

  return NextResponse.json({ ok: true, modo: "direto", message_id: mensagemId, external_id: externalId });
}
