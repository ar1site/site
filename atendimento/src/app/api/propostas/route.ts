import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { validarProposta } from "@/lib/propostas/proposta";
import { erro, lerCorpo, respostaDeErro } from "@/lib/propostas/respostas";
import { listarPropostas } from "@/lib/propostas/registro";
import { listarTodasAsPropostas } from "@/lib/propostas/premium/servidor";
import { gerarProposta } from "@/lib/propostas/servidor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/propostas?oportunidade=<id> — histórico de propostas da oportunidade.
 * GET /api/propostas?busca=…&situacao=… — todas as propostas (tela Propostas).
 */
export async function GET(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const parametros = new URL(request.url).searchParams;
  const oportunidade = parametros.get("oportunidade");
  try {
    if (oportunidade) return NextResponse.json({ ok: true, propostas: await listarPropostas(oportunidade) });
    const propostas = await listarTodasAsPropostas({
      busca: parametros.get("busca") ?? "",
      status: parametros.get("situacao") ?? "",
    });
    return NextResponse.json({ ok: true, propostas });
  } catch (e) {
    return respostaDeErro(e, "propostas");
  }
}

/**
 * POST /api/propostas — gera o PDF da proposta simples que a pessoa revisou,
 * guarda no Storage privado e registra no histórico. Nada é enviado ao cliente aqui.
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const corpo = await lerCorpo(request);
  const validada = validarProposta(corpo.proposta);
  if (!validada.ok) return erro(validada.erro, 400, { campo: validada.campo });

  const fontes = Array.isArray(corpo.fontes)
    ? corpo.fontes
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.replace(/\s+/g, " ").trim().slice(0, 200))
        .filter(Boolean)
    : [];

  try {
    const proposta = await gerarProposta({
      oportunidadeId: typeof corpo.oportunidade_id === "string" ? corpo.oportunidade_id : "",
      atendimentoId: typeof corpo.atendimento_id === "string" ? corpo.atendimento_id : null,
      proposta: validada.proposta,
      fontes,
      modelo: typeof corpo.modelo === "string" && corpo.modelo.trim() ? corpo.modelo.trim() : null,
      usuarioId: sessao.user.id,
    });
    return NextResponse.json({ ok: true, proposta });
  } catch (e) {
    return respostaDeErro(e, "propostas");
  }
}
