import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { DIAS_DO_LINK, SEGUNDOS_DO_LINK, textoDaMensagem } from "@/lib/propostas/mensagem";
import { respostaDeErro } from "@/lib/propostas/respostas";
import { lerProposta, linkDoPdf } from "@/lib/propostas/registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/propostas/[id]/link — cria o link assinado de 7 dias e o texto
 * sugerido da mensagem. Não envia nada: a pessoa revisa o texto e envia pelo
 * fluxo normal (/api/whatsapp/enviar).
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const { id } = await ctx.params;
  try {
    const proposta = await lerProposta(id);
    const link = await linkDoPdf(proposta, SEGUNDOS_DO_LINK);
    return NextResponse.json({
      ok: true,
      link,
      dias: DIAS_DO_LINK,
      expira_em: new Date(Date.now() + SEGUNDOS_DO_LINK * 1000).toISOString(),
      texto: textoDaMensagem({
        nomeDoCliente: proposta.content?.cliente?.nome,
        titulo: proposta.title,
        numero: proposta.number,
        validaAte: proposta.valid_until,
        link,
      }),
    });
  } catch (e) {
    return respostaDeErro(e, "propostas/link");
  }
}
