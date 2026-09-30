import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { gerarPdfPremium } from "@/lib/propostas/premium/servidor";
import { respostaDeErro } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/propostas/[id]/pdf — imprime a página da proposta em PDF pelo Chrome
 * (uma lâmina por seção). Se o Chrome falhar, gera a versão simples pelo pdf-lib
 * e registra o motivo em `pdf_error`. O arquivo fica no bucket ar1-context.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();
  const { id } = await ctx.params;
  try {
    const proposta = await gerarPdfPremium(id);
    return NextResponse.json({ ok: true, proposta });
  } catch (e) {
    return respostaDeErro(e, "propostas/pdf");
  }
}
