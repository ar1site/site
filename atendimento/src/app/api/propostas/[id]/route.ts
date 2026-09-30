import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { alterarPropostaPremium, imagensAssinadas } from "@/lib/propostas/premium/servidor";
import { lerProposta } from "@/lib/propostas/registro";
import { lerCorpo, respostaDeErro } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/propostas/[id] — a proposta com as URLs das imagens enviadas. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();
  const { id } = await ctx.params;
  try {
    const proposta = await lerProposta(id);
    return NextResponse.json({ ok: true, proposta, imagens: await imagensAssinadas(proposta) });
  } catch (e) {
    return respostaDeErro(e, "propostas/ler");
  }
}

/**
 * PATCH /api/propostas/[id] — salva o conteúdo editado (o investimento é
 * recalculado pela tabela; itens já usados mantêm o preço gravado, a não ser
 * com `atualizar_precos: true`), a validade do link (`dias_link`) ou a
 * situação (`situacao`: aceita, recusada, enviada ou gerada). Devolve também
 * `avisos` internos (preços mantidos, valores não confirmados).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();
  const { id } = await ctx.params;
  const corpo = await lerCorpo(request);
  try {
    const { proposta, avisos } = await alterarPropostaPremium(
      id,
      {
        conteudo: corpo.conteudo,
        dias_link: corpo.dias_link,
        status: corpo.situacao,
        atualizar_precos: corpo.atualizar_precos,
      },
      sessao.user.id,
    );
    return NextResponse.json({ ok: true, proposta, imagens: await imagensAssinadas(proposta), avisos });
  } catch (e) {
    return respostaDeErro(e, "propostas/alterar");
  }
}
