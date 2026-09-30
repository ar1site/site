import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { lerCorpo, respostaDeErro } from "@/lib/propostas/respostas";
import { prepararRascunho } from "@/lib/propostas/servidor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/propostas/rascunho — a IA monta o rascunho estruturado da
 * proposta. Nada é gravado: o rascunho volta para a tela, onde uma pessoa
 * revisa e edita. Com `sem_ia: true`, devolve só os dados da oportunidade.
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const corpo = await lerCorpo(request);
  try {
    const rascunho = await prepararRascunho({
      oportunidadeId: typeof corpo.oportunidade_id === "string" ? corpo.oportunidade_id : "",
      atendimentoId: typeof corpo.atendimento_id === "string" ? corpo.atendimento_id : null,
      semIA: corpo.sem_ia === true,
    });
    return NextResponse.json({ ok: true, rascunho });
  } catch (e) {
    return respostaDeErro(e, "propostas/rascunho");
  }
}
