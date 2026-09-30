import "server-only";

// Respostas padronizadas das rotas /api/propostas.

import { NextResponse } from "next/server";
import { ErroIA } from "../ia";
import { ErroPdf } from "./erros";
import { ErroProposta } from "./registro";

export function erro(mensagem: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, erro: mensagem, ...extra }, { status });
}

/** Transforma qualquer falha em resposta com mensagem legível. */
export function respostaDeErro(e: unknown, contexto: string) {
  if (e instanceof ErroProposta) {
    return erro(e.message, e.status, e.faltaMigracao ? { falta_migracao: true } : {});
  }
  if (e instanceof ErroPdf) return erro(e.message, e.status);
  if (e instanceof ErroIA) return erro(e.message, e.status);
  const mensagem = e instanceof Error ? e.message : "Erro inesperado.";
  console.error(`[${contexto}]`, mensagem);
  return erro(`Algo deu errado: ${mensagem}`, 500);
}

/** Lê o corpo JSON; objeto vazio quando vem vazio ou inválido. */
export async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  try {
    const corpo: unknown = await request.json();
    return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
