import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { origemAutorizada } from "@/lib/followups/autorizacao";
import { gerarFollowups } from "@/lib/followups/gerar";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function segredos() {
  return { cron: env.cronSecret, interno: process.env.WEBHOOK_SECRET };
}

async function executar(origem: string) {
  try {
    const r = await gerarFollowups();
    console.log(
      `[followups] origem=${origem} reativados=${r.reativados} candidatos=${r.candidatos} criados=${r.criados} ` +
        `falhas=${r.falhas.length} para_depois=${r.adiadosPorTempo}`,
    );
    return NextResponse.json({
      ok: true,
      reativados: r.reativados,
      candidatos: r.candidatos,
      criados: r.criados,
      para_depois: r.adiadosPorTempo,
      falhas: r.falhas,
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Erro ao gerar as retomadas.";
    console.error("[followups/gerar]", erro);
    return NextResponse.json({ ok: false, erro }, { status: 500 });
  }
}

/**
 * Gera as sugestões de retomada. Aceita sessão de equipe (botão "Gerar
 * agora"), x-internal-secret (= WEBHOOK_SECRET) ou Authorization: Bearer
 * CRON_SECRET. Só cria sugestões pendentes: nada é enviado daqui.
 */
export async function POST(request: Request) {
  const maquina = origemAutorizada(request.headers, segredos());
  if (maquina) return executar(maquina);
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();
  return executar("equipe");
}

/**
 * O cron da Vercel chama por GET com Authorization: Bearer CRON_SECRET.
 * GET não aceita sessão de navegador, para um link aberto sem querer não
 * disparar a rotina.
 */
export async function GET(request: Request) {
  const maquina = origemAutorizada(request.headers, segredos());
  if (!maquina) return respostaNaoAutorizado();
  return executar(maquina);
}
