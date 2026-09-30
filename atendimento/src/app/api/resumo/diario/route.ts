import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { origemAutorizada } from "@/lib/followups/autorizacao";
import { executarResumo } from "@/lib/resumo/executar";
import type { PedidoDoResumo, ResultadoDoResumo } from "@/lib/resumo/rotina";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function segredos() {
  return { cron: env.cronSecret, interno: process.env.WEBHOOK_SECRET };
}

function resposta(r: ResultadoDoResumo) {
  const falhou = r.motivo === "falha_no_envio";
  return NextResponse.json(
    {
      ok: !falhou,
      enviado: r.enviado,
      motivo: r.motivo ?? null,
      erro: falhou ? r.mensagem : undefined,
      mensagem: r.mensagem ?? null,
      texto: r.texto,
      origem_do_texto: r.origemDoTexto,
      aviso_da_ia: r.avisoDaIA ?? null,
      numeros: r.numeros,
      envios: r.envios,
      ultimo_envio: r.ultimoEnvio,
    },
    { status: falhou ? 502 : 200 },
  );
}

async function executar(pedido: PedidoDoResumo) {
  try {
    const r = await executarResumo(pedido);
    console.log(
      `[resumo] origem=${pedido.origem} modo=${pedido.modo} enviado=${r.enviado} motivo=${r.motivo ?? "-"} ` +
        `texto=${r.origemDoTexto ?? "-"} envios=${r.envios.filter((e) => e.ok).length}/${r.envios.length}`,
    );
    return resposta(r);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro ao montar o resumo diário.";
    console.error("[resumo/diario]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}

/**
 * Resumo diário para o dono. Aceita sessão de equipe (Ajustes → "Ver prévia"
 * e "Enviar agora"), x-internal-secret (= WEBHOOK_SECRET) ou Authorization:
 * Bearer CRON_SECRET. O resumo é interno: vai só para os telefones de
 * ar1_settings['resumo.destinatarios'], nunca para clientes.
 *
 * Corpo (só com sessão de equipe): { modo: "previa" | "enviar", forcar, texto }.
 * Chamadas de máquina sempre enviam, respeitando a trava de um envio por dia.
 */
export async function POST(request: Request) {
  const maquina = origemAutorizada(request.headers, segredos());
  if (maquina) return executar({ origem: maquina, modo: "enviar" });

  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  let corpo: { modo?: unknown; forcar?: unknown; texto?: unknown } = {};
  try {
    corpo = await request.json();
  } catch {
    // corpo vazio
  }
  return executar({
    origem: "equipe",
    modo: corpo.modo === "previa" ? "previa" : "enviar",
    forcar: corpo.forcar === true,
    texto: typeof corpo.texto === "string" ? corpo.texto : null,
    usuarioId: sessao.user.id,
  });
}

/**
 * O cron da Vercel chama por GET com Authorization: Bearer CRON_SECRET.
 * GET não aceita sessão de navegador, para um link aberto sem querer não
 * disparar o envio.
 */
export async function GET(request: Request) {
  const maquina = origemAutorizada(request.headers, segredos());
  if (!maquina) return respostaNaoAutorizado();
  return executar({ origem: maquina, modo: "enviar" });
}
