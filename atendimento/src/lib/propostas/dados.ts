"use client";

// Chamadas das telas de proposta às rotas do servidor e o rascunho guardado
// no aparelho (para não perder a edição ao fechar a janela).

import type { PropostaRegistro } from "../tipos";
import type { PropostaNoEditor } from "./editor";
import type { PropostaPremium } from "./premium/conteudo";
import type { EntradaNovaProposta } from "./premium/pedido";
import type { PedidoPuxado } from "./premium/prompt";
import type { StatusProposta } from "./premium/publico";
import type { Proposta } from "./proposta";
import type { RascunhoPronto } from "./rascunho";

/** O que a rota /api/propostas/rascunho devolve. */
export interface RascunhoRecebido extends RascunhoPronto {
  modelo: string | null;
  atendimento_id: string | null;
}

export type Resposta<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      erro: string;
      faltaMigracao?: boolean;
      campo?: string;
      /** Validação do formulário da nova proposta: mensagem por campo. */
      erros?: Record<string, string>;
      /** Passo do formulário onde está o erro (1 cliente, 2 pedido). */
      passo?: 1 | 2;
      /** Código HTTP (409 = a proposta mudou de situação; 503 = falta migração). */
      status?: number;
    };

async function chamar<T>(url: string, opcoes?: RequestInit): Promise<Resposta<T>> {
  try {
    const r = await fetch(url, { cache: "no-store", ...opcoes });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.ok === false) {
      const erros =
        j.erros && typeof j.erros === "object" && !Array.isArray(j.erros)
          ? Object.fromEntries(
              Object.entries(j.erros as Record<string, unknown>).filter((par): par is [string, string] => typeof par[1] === "string"),
            )
          : undefined;
      return {
        ok: false,
        erro: typeof j.erro === "string" ? j.erro : "Algo deu errado. Tente de novo.",
        faltaMigracao: j.falta_migracao === true,
        campo: typeof j.campo === "string" ? j.campo : undefined,
        erros,
        passo: j.passo === 1 || j.passo === 2 ? j.passo : undefined,
        status: r.status,
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
  return postar<{ link: string; texto: string; dias: number; expira_em: string | null }>(
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

// ------------------------------------------------------- propostas premium

export interface PropostaLida {
  proposta: PropostaRegistro;
  /** Caminho no bucket -> URL assinada das imagens enviadas. */
  imagens: Record<string, string>;
  /** Só no PATCH: avisos internos (preços mantidos diferentes da tabela, valores não confirmados). */
  avisos?: string[];
}

export function buscarTodasAsPropostas(
  filtros: { busca?: string; situacao?: string; servico?: string; de?: string; ate?: string } = {},
) {
  const q = new URLSearchParams();
  if (filtros.busca) q.set("busca", filtros.busca);
  if (filtros.situacao) q.set("situacao", filtros.situacao);
  if (filtros.servico) q.set("servico", filtros.servico);
  if (filtros.de) q.set("de", filtros.de);
  if (filtros.ate) q.set("ate", filtros.ate);
  const sufixo = q.toString();
  return chamar<{ propostas: PropostaRegistro[] }>(`/api/propostas${sufixo ? `?${sufixo}` : ""}`);
}

export function lerPropostaPremium(id: string) {
  return chamar<PropostaLida>(`/api/propostas/${encodeURIComponent(id)}`);
}

export function criarPropostaPremium(entrada: EntradaNovaProposta, semIA = false) {
  return postar<{ proposta: PropostaRegistro; pendencias: string[]; avisos: string[]; modelo: string | null }>(
    "/api/propostas/premium",
    { ...entrada, sem_ia: semIA },
  );
}

export function puxarPedidoDaConversa(contactId: string) {
  return postar<PedidoPuxado & { modelo: string }>("/api/propostas/premium/puxar", { contact_id: contactId });
}

function alterar(id: string, corpo: Record<string, unknown>) {
  return chamar<PropostaLida>(`/api/propostas/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

/**
 * Salva o conteúdo. Itens da tabela que a proposta já usa mantêm o preço
 * gravado; com `atualizarPrecos`, todas as linhas passam ao preço atual da tabela.
 */
export function salvarConteudoPremium(id: string, conteudo: PropostaPremium, opcoes: { atualizarPrecos?: boolean } = {}) {
  return alterar(id, { conteudo, ...(opcoes.atualizarPrecos ? { atualizar_precos: true } : {}) });
}

/**
 * Situação marcada pela equipe: "aceita", "recusada", "enviada" (marcar à mão,
 * quando o link foi copiado ou mandado por outro número) ou "gerada" (concluir
 * rascunho, desfazer envio manual, reabrir aceita/recusada). Ver podeMarcar.
 */
export function mudarSituacaoDaProposta(id: string, situacao: StatusProposta) {
  return alterar(id, { situacao });
}

/** Reabre uma proposta aceita/recusada e salva o conteúdo no mesmo pedido. */
export function reabrirESalvar(id: string, conteudo: PropostaPremium) {
  return alterar(id, { situacao: "gerada", conteudo });
}

export function mudarDiasDoLink(id: string, dias: number) {
  return alterar(id, { dias_link: dias });
}

export function gerarPdfPremium(id: string) {
  return postar<{ proposta: PropostaRegistro }>(`/api/propostas/${encodeURIComponent(id)}/pdf`, {});
}

export async function enviarImagemDaProposta(id: string, arquivo: File) {
  const corpo = new FormData();
  corpo.append("arquivo", arquivo);
  return chamar<{ caminho: string; url: string | null }>(`/api/propostas/${encodeURIComponent(id)}/imagem`, {
    method: "POST",
    body: corpo,
  });
}
