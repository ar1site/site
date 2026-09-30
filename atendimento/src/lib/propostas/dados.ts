"use client";

// Chamadas das telas de proposta às rotas do servidor e o rascunho guardado
// no aparelho (para não perder a edição ao fechar a janela).

import type { PropostaRegistro } from "../tipos";
import type { PropostaNoEditor } from "./editor";
import type { Proposta } from "./proposta";
import type { RascunhoPronto } from "./rascunho";

/** O que a rota /api/propostas/rascunho devolve. */
export interface RascunhoRecebido extends RascunhoPronto {
  modelo: string | null;
  atendimento_id: string | null;
}

export type Resposta<T> = ({ ok: true } & T) | { ok: false; erro: string; faltaMigracao?: boolean; campo?: string };

async function chamar<T>(url: string, opcoes?: RequestInit): Promise<Resposta<T>> {
  try {
    const r = await fetch(url, { cache: "no-store", ...opcoes });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.ok === false) {
      return {
        ok: false,
        erro: typeof j.erro === "string" ? j.erro : "Algo deu errado. Tente de novo.",
        faltaMigracao: j.falta_migracao === true,
        campo: typeof j.campo === "string" ? j.campo : undefined,
      };
    }
    return { ...(j as T), ok: true };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Tente de novo." };
  }
}

function postar<T>(url: string, corpo: unknown): Promise<Resposta<T>> {
  return chamar<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

export function buscarPropostas(oportunidadeId: string) {
  return chamar<{ propostas: PropostaRegistro[] }>(`/api/propostas?oportunidade=${encodeURIComponent(oportunidadeId)}`);
}

export function pedirRascunho(entrada: { oportunidadeId: string; atendimentoId: string | null; semIA?: boolean }) {
  return postar<{ rascunho: RascunhoRecebido }>("/api/propostas/rascunho", {
    oportunidade_id: entrada.oportunidadeId,
    atendimento_id: entrada.atendimentoId ?? undefined,
    sem_ia: entrada.semIA === true,
  });
}

export function gerarPdf(entrada: {
  oportunidadeId: string;
  atendimentoId: string | null;
  proposta: Proposta;
  fontes: string[];
  modelo: string | null;
}) {
  return postar<{ proposta: PropostaRegistro }>("/api/propostas", {
    oportunidade_id: entrada.oportunidadeId,
    atendimento_id: entrada.atendimentoId ?? undefined,
    proposta: entrada.proposta,
    fontes: entrada.fontes,
    modelo: entrada.modelo ?? undefined,
  });
}

export function pedirLink(propostaId: string) {
  return postar<{ link: string; texto: string; dias: number; expira_em: string }>(
    `/api/propostas/${encodeURIComponent(propostaId)}/link`,
    {},
  );
}

export function enviarLink(entrada: { atendimentoId: string; texto: string; propostaId: string }) {
  return postar<{ modo: "fila" | "direto" }>("/api/whatsapp/enviar", {
    atendimento_id: entrada.atendimentoId,
    text: entrada.texto,
    proposal_id: entrada.propostaId,
  });
}

// ------------------------------------------------- rascunho neste aparelho

export interface RascunhoLocal {
  estado: PropostaNoEditor;
  /** Como o rascunho chegou (para mostrar o que veio da IA e o que mudou). */
  original: RascunhoRecebido;
  editados: string[];
  salvoEm: string;
}

const chave = (oportunidadeId: string) => `ar1.proposta.rascunho.${oportunidadeId}`;

export function lerRascunhoLocal(oportunidadeId: string): RascunhoLocal | null {
  try {
    const bruto = window.localStorage.getItem(chave(oportunidadeId));
    if (!bruto) return null;
    const lido = JSON.parse(bruto) as Partial<RascunhoLocal>;
    if (!lido?.estado || !lido.original?.proposta || typeof lido.estado.titulo !== "string") return null;
    return {
      estado: lido.estado,
      original: lido.original,
      editados: Array.isArray(lido.editados) ? lido.editados.filter((e): e is string => typeof e === "string") : [],
      salvoEm: typeof lido.salvoEm === "string" ? lido.salvoEm : "",
    };
  } catch {
    return null;
  }
}

export function guardarRascunhoLocal(oportunidadeId: string, rascunho: RascunhoLocal): void {
  try {
    window.localStorage.setItem(chave(oportunidadeId), JSON.stringify(rascunho));
  } catch {
    // aparelho sem espaço ou navegação privada: segue sem guardar
  }
}

export function apagarRascunhoLocal(oportunidadeId: string): void {
  try {
    window.localStorage.removeItem(chave(oportunidadeId));
  } catch {
    // nada a fazer
  }
}
