import { NextResponse } from "next/server";
import { respostaNaoAutorizado, segredoInternoValido, sessaoDaEquipe } from "@/lib/auth";
import { ErroTranscricao, transcreverMensagem } from "@/lib/transcricao";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/transcrever  { message_id, forcar? }
 * Transcreve o áudio de uma mensagem sob demanda, grava em `transcript` e devolve o texto.
 * Se a mensagem já tem transcrição, devolve a que existe (`forcar: true` refaz).
 * Aceita a sessão da equipe ou o cabeçalho x-internal-secret.
 */
export async function POST(request: Request) {
  const interno = segredoInternoValido(request);
  const sessao = interno ? null : await sessaoDaEquipe();
  if (!interno && !sessao) return respostaNaoAutorizado();

  let body: { message_id?: unknown; forcar?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // corpo vazio
  }
  const mensagemId = typeof body.message_id === "string" ? body.message_id.trim() : "";
  if (!UUID.test(mensagemId)) {
    return NextResponse.json({ ok: false, erro: "Mensagem inválida." }, { status: 400 });
  }

  try {
    const r = await transcreverMensagem(mensagemId, { forcar: body.forcar === true });
    return NextResponse.json({
      ok: true,
      transcricao: r.texto,
      modelo: r.modelo,
      ja_existia: r.jaExistia,
    });
  } catch (e) {
    const status = e instanceof ErroTranscricao ? e.status : 502;
    const erro = e instanceof Error ? e.message : "Erro na transcrição.";
    console.error("[transcrever]", mensagemId, erro);
    return NextResponse.json({ ok: false, erro }, { status: status >= 400 ? status : 502 });
  }
}
