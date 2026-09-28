import { NextResponse } from "next/server";
import { respostaNaoAutorizado, segredoInternoValido, sessaoDaEquipe } from "@/lib/auth";
import { analisarAtendimento, ErroAnalise } from "@/lib/analise/executar";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const interno = segredoInternoValido(request);
  const sessao = interno ? null : await sessaoDaEquipe();
  if (!interno && !sessao) return respostaNaoAutorizado();

  let body: { atendimento_id?: unknown; instrucao?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // corpo vazio
  }
  const atendimentoId = typeof body.atendimento_id === "string" ? body.atendimento_id : "";
  if (!UUID.test(atendimentoId)) {
    return NextResponse.json({ ok: false, erro: "Atendimento inválido." }, { status: 400 });
  }
  const instrucao =
    typeof body.instrucao === "string" && body.instrucao.trim()
      ? body.instrucao.trim().slice(0, 2000)
      : null;

  try {
    const r = await analisarAtendimento(atendimentoId, instrucao);
    return NextResponse.json({
      ok: true,
      analise: r.analise,
      sugestao_id: r.sugestaoId,
      modelo: r.modelo,
    });
  } catch (e) {
    const status = e instanceof ErroAnalise ? e.status : 502;
    const erro = e instanceof Error ? e.message : "Erro na análise.";
    console.error("[ia/analisar]", atendimentoId, erro);
    return NextResponse.json({ ok: false, erro }, { status: status >= 400 ? status : 502 });
  }
}
