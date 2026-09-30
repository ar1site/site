import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { ErroProposta, lerProposta, marcarComoEnviada } from "@/lib/propostas/registro";
import { supabaseServico } from "@/lib/supabase/service";
import type { Atendimento, Contato, Followup, PropostaRegistro, Sugestao } from "@/lib/tipos";
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
 *
 * Com `followup_id` (tela Retomar), a mensagem é a retomada aprovada por uma
 * pessoa: o follow-up passa a "enviado" com o texto final e o item da fila.
 * Nesse caso `atendimento_id` é opcional: vale a conversa aberta do contato
 * e, se não houver, a conversa em que a retomada foi sugerida.
 *
 * Com `proposal_id`, a mensagem leva o link da proposta (o texto já foi
 * revisado por uma pessoa): depois do envio a proposta fica marcada como enviada.
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  let body: {
    atendimento_id?: unknown;
    text?: unknown;
    suggestion_id?: unknown;
    followup_id?: unknown;
    proposal_id?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    // corpo vazio
  }
  let atendimentoId = typeof body.atendimento_id === "string" ? body.atendimento_id : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const suggestionId = typeof body.suggestion_id === "string" ? body.suggestion_id : null;
  const followupId = typeof body.followup_id === "string" ? body.followup_id : null;
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id : null;

  if (followupId && !UUID.test(followupId)) return erro("Retomada inválida.");
  if (!followupId && !UUID.test(atendimentoId)) return erro("Atendimento inválido.");
  if (atendimentoId && !UUID.test(atendimentoId)) return erro("Atendimento inválido.");
  if (!text) return erro("Escreva a mensagem antes de enviar.");
  if (text.length > 5000) return erro("A mensagem é longa demais (máximo 5000 caracteres).");
  if (suggestionId && !UUID.test(suggestionId)) return erro("Sugestão inválida.");
  if (proposalId && !UUID.test(proposalId)) return erro("Proposta inválida.");

  const db = supabaseServico();

  let followup: Followup | null = null;
  if (followupId) {
    const { data } = await db.from("ar1_followups").select("*").eq("id", followupId).maybeSingle();
    followup = (data as Followup | null) ?? null;
    if (!followup) return erro("Retomada não encontrada.", 404);
    if (followup.status !== "pendente") {
      return erro("Esta retomada já foi decidida. Atualize a tela.", 409);
    }
    if (!atendimentoId) {
      const { data: aberto } = await db
        .from("ar1_atendimentos")
        .select("id")
        .eq("contact_id", followup.contact_id)
        .neq("status", "fechado")
        .maybeSingle();
      atendimentoId = aberto?.id ?? followup.atendimento_id ?? "";
    }
    if (!UUID.test(atendimentoId)) {
      return erro("Este contato não tem conversa para receber a mensagem.", 409);
    }
  }

  const { data: atendimentoBruto } = await db
    .from("ar1_atendimentos")
    .select("*")
    .eq("id", atendimentoId)
    .maybeSingle();
  if (!atendimentoBruto) return erro("Atendimento não encontrado.", 404);
  const atendimento = atendimentoBruto as Atendimento;
  if (followup && followup.contact_id !== atendimento.contact_id) {
    return erro("A retomada não é deste contato.", 400);
  }

  /** Marca a retomada como enviada (texto final, item da fila, quem decidiu). */
  async function concluirFollowup(outboxId: string | null, quando: string) {
    if (!followup) return;
    const { error: erroFollowup } = await db
      .from("ar1_followups")
      .update({
        status: "enviado",
        final_text: text,
        outbox_id: outboxId,
        decided_by: sessao!.user.id,
        decided_at: quando,
      })
      .eq("id", followup.id)
      .eq("status", "pendente");
    if (erroFollowup) {
      console.error("[enviar] a mensagem saiu, mas a retomada não foi atualizada:", erroFollowup.message);
    }
  }

  const { data: contatoBruto } = await db
    .from("ar1_wa_contacts")
    .select("*")
    .eq("id", atendimento.contact_id)
    .maybeSingle();
  if (!contatoBruto) return erro("Contato não encontrado.", 404);
  const contato = contatoBruto as Contato;
  if (contato.blocked) return erro("Este contato está bloqueado. Desbloqueie em Contatos para enviar.");

  let proposta: PropostaRegistro | null = null;
  if (proposalId) {
    try {
      proposta = await lerProposta(proposalId);
    } catch (e) {
      if (e instanceof ErroProposta) return erro(e.message, e.status);
      throw e;
    }
    if (proposta.contact_id && proposta.contact_id !== contato.id) {
      return erro("A proposta não é deste contato.", 400);
    }
  }

  /** Marca a proposta como enviada (quem enviou, quando e o item da fila). */
  async function concluirProposta(outboxId: string | null, quando: string) {
    if (!proposta) return;
    await marcarComoEnviada({ propostaId: proposta.id, usuarioId: sessao!.user.id, outboxId, quando });
  }

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

    await concluirFollowup(item.id, new Date().toISOString());
    await concluirProposta(item.id, new Date().toISOString());

    return NextResponse.json({
      ok: true,
      modo: "fila",
      outbox_id: item.id,
      atendimento_id: atendimentoId,
    });
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

  await concluirFollowup(null, agora);
  await concluirProposta(null, agora);

  return NextResponse.json({
    ok: true,
    modo: "direto",
    message_id: mensagemId,
    external_id: externalId,
    atendimento_id: atendimentoId,
  });
}
