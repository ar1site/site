import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { validarEntrada } from "@/lib/propostas/premium/pedido";
import { criarPropostaPremium } from "@/lib/propostas/premium/servidor";
import { erro, lerCorpo, respostaDeErro } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
// A IA (Opus) escreve a apresentação inteira: pode passar de um minuto. 300 s exige o
// Fluid compute da Vercel (padrão nos projetos novos; no Hobby o máximo é 300 s).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/propostas/premium — cria a proposta premium a partir do formulário
 * (cliente + pedido): a IA escreve o conteúdo, o servidor recalcula os valores
 * pela tabela de preços e grava com situação "gerada". Com `sem_ia: true`, só
 * o pedido entra e a pessoa escreve o resto. Nada é enviado ao cliente aqui.
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const corpo = await lerCorpo(request);
  const validada = validarEntrada(corpo);
  if (!validada.ok) return erro("Confira os campos marcados.", 400, { erros: validada.erros, passo: validada.passo });

  try {
    const criada = await criarPropostaPremium({
      dados: validada.entrada,
      usuarioId: sessao.user.id,
      semIA: corpo.sem_ia === true,
    });
    return NextResponse.json({ ok: true, ...criada });
  } catch (e) {
    return respostaDeErro(e, "propostas/premium");
  }
}
