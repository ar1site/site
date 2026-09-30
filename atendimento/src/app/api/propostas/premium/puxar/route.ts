import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { puxarPedidoDaConversa } from "@/lib/propostas/premium/servidor";
import { erro, lerCorpo, respostaDeErro } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST /api/propostas/premium/puxar — a IA preenche o pedido a partir da conversa do contato. Não grava nada. */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const corpo = await lerCorpo(request);
  const contactId = typeof corpo.contact_id === "string" ? corpo.contact_id : "";
  if (!contactId) return erro("Escolha um contato do WhatsApp para puxar a conversa.", 400);
  try {
    return NextResponse.json({ ok: true, ...(await puxarPedidoDaConversa(contactId)) });
  } catch (e) {
    return respostaDeErro(e, "propostas/premium/puxar");
  }
}
