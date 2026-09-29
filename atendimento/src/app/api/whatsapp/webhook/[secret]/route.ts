import { after, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { interpretarWebhook } from "@/lib/whatsapp/parser";
import {
  gravarQr,
  gravarStatusConexao,
  processarMensagem,
  registrarEvento,
} from "@/lib/whatsapp/processar";
import { supabaseServico } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Espera curta para juntar uma rajada de mensagens numa análise só. */
const ESPERA_ANALISE_MS = 40_000;

const OK = NextResponse.json({ ok: true });

function dormir(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Depois de responder ao webhook: espera, relê o atendimento e só analisa
 * se nenhuma mensagem nova do contato chegou nesse meio-tempo.
 */
async function agendarAnalise(atendimentoId: string, sentAtIso: string) {
  await dormir(ESPERA_ANALISE_MS);
  const { data } = await supabaseServico()
    .from("ar1_atendimentos")
    .select("last_inbound_at, ai_analysis_due_at, status")
    .eq("id", atendimentoId)
    .maybeSingle();
  if (!data) return;
  if (data.status === "fechado") return;
  if (!data.ai_analysis_due_at) return; // já analisado por outro caminho
  const ultima = data.last_inbound_at ? new Date(data.last_inbound_at).getTime() : 0;
  if (ultima > new Date(sentAtIso).getTime()) return; // chegou mensagem mais nova; ela agenda a próxima

  try {
    const resposta = await fetch(`${env.appUrl}/api/ia/analisar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": env.webhookSecret,
      },
      body: JSON.stringify({ atendimento_id: atendimentoId }),
      cache: "no-store",
    });
    if (!resposta.ok) {
      console.error("[webhook] análise falhou", resposta.status, await resposta.text());
    }
  } catch (e) {
    console.error("[webhook] erro ao chamar a análise", e);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/whatsapp/webhook/[secret]">) {
  const { secret } = await ctx.params;
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return new NextResponse(null, { status: 404 });
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const resultado = interpretarWebhook(payload);

  try {
    await registrarEvento(resultado.evento, payload);
  } catch (e) {
    console.error("[webhook] falha ao registrar evento", e);
  }

  try {
    switch (resultado.tipo) {
      case "mensagem": {
        const r = await processarMensagem(resultado.mensagem, payload);
        // Histórico importado não dispara análise automática (o importador pede uma por conversa no fim).
        if (r.situacao === "gravada" && r.entrada && r.atendimentoId && !resultado.mensagem.historico) {
          const atendimentoId = r.atendimentoId;
          const sentAtIso = resultado.mensagem.sentAt.toISOString();
          after(() => agendarAnalise(atendimentoId, sentAtIso));
        }
        break;
      }
      case "conexao": {
        await gravarStatusConexao({
          connected: resultado.connected,
          checked_at: resultado.checkedAt,
          state: resultado.state,
          phone: resultado.phone,
          error: resultado.erro,
        });
        break;
      }
      case "qr": {
        await gravarQr({ media_path: resultado.mediaPath, updated_at: resultado.updatedAt });
        break;
      }
      case "ignorar":
      case "evento":
        break;
    }
  } catch (e) {
    // Nunca devolvemos erro ao provedor (evita reenvios em loop); o evento
    // já ficou registrado para diagnóstico.
    console.error("[webhook] erro ao processar", resultado.evento, e);
  }

  return OK;
}
