// Parte comercial da análise da IA: o que ela sugere para o funil.
// Puro (sem banco), testável. A IA só sugere; nada aqui grava etapa, valor ou
// próxima ação na oportunidade.

import { diaCurto, diaEHora, normalizarDataHora } from "../funil/datas";
import { ehEtapa, formatarReais, ROTULO_ETAPA, VALOR_MAXIMO } from "../funil/etapas";
import type { EtapaFunil, Oportunidade, OportunidadeIA } from "../tipos";

/**
 * O que a IA devolve, antes dos limites do código. O esquema (Zod) fica em
 * `oportunidade-esquema.ts`, separado para não ir para o navegador.
 */
export interface OportunidadeIABruta {
  etapa_sugerida: EtapaFunil | null;
  valor_estimado: number | null;
  probabilidade: number | null;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  motivo: string;
}

export const OPORTUNIDADE_IA_VAZIA: OportunidadeIABruta = {
  etapa_sugerida: null,
  valor_estimado: null,
  probabilidade: null,
  proxima_acao: null,
  proxima_acao_em: null,
  motivo: "",
};

const LIMITE_ACAO = 500;
const LIMITE_MOTIVO = 500;
export const LIMITE_NOTAS_IA = 2000;

function cortar(texto: string, limite: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > limite ? `${t.slice(0, limite - 1).trimEnd()}…` : t;
}

/** Aplica os limites do banco e descarta o que não faz sentido. */
export function normalizarOportunidadeIA(
  bruta: OportunidadeIABruta | null | undefined,
  analisadaEm?: string,
): OportunidadeIA {
  const b = bruta ?? OPORTUNIDADE_IA_VAZIA;

  let valor: number | null = null;
  if (typeof b.valor_estimado === "number" && Number.isFinite(b.valor_estimado)) {
    if (b.valor_estimado > 0 && b.valor_estimado <= VALOR_MAXIMO) {
      valor = Math.round(b.valor_estimado * 100) / 100;
    }
  }

  let probabilidade: number | null = null;
  if (typeof b.probabilidade === "number" && Number.isFinite(b.probabilidade)) {
    probabilidade = Math.min(100, Math.max(0, Math.round(b.probabilidade)));
  }

  const acao = typeof b.proxima_acao === "string" ? cortar(b.proxima_acao, LIMITE_ACAO) : "";
  const proximaAcao = acao || null;
  // Data sem ação não serve para nada.
  const proximaAcaoEm = proximaAcao ? normalizarDataHora(b.proxima_acao_em) : null;

  return {
    etapa_sugerida: ehEtapa(b.etapa_sugerida) ? b.etapa_sugerida : null,
    valor_estimado: valor,
    probabilidade,
    proxima_acao: proximaAcao,
    proxima_acao_em: proximaAcaoEm,
    motivo: cortar(typeof b.motivo === "string" ? b.motivo : "", LIMITE_MOTIVO),
    analisada_em: analisadaEm ?? null,
  };
}

/** Lê a sugestão guardada em ai_extracted.oportunidade (jsonb), com tolerância. */
export function lerOportunidadeIA(extraido: unknown): OportunidadeIA | null {
  if (!extraido || typeof extraido !== "object") return null;
  const bruto = (extraido as { oportunidade?: unknown }).oportunidade;
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const lida = normalizarOportunidadeIA(
    {
      etapa_sugerida: ehEtapa(o.etapa_sugerida) ? o.etapa_sugerida : null,
      valor_estimado: typeof o.valor_estimado === "number" ? o.valor_estimado : null,
      probabilidade: typeof o.probabilidade === "number" ? o.probabilidade : null,
      proxima_acao: typeof o.proxima_acao === "string" ? o.proxima_acao : null,
      proxima_acao_em: typeof o.proxima_acao_em === "string" ? o.proxima_acao_em : null,
      motivo: typeof o.motivo === "string" ? o.motivo : "",
    },
    typeof o.analisada_em === "string" ? o.analisada_em : undefined,
  );
  return temSugestao(lida) || lida.motivo ? lida : null;
}

export function temSugestao(o: OportunidadeIA | null | undefined): boolean {
  if (!o) return false;
  return Boolean(
    o.etapa_sugerida || o.valor_estimado !== null || o.probabilidade !== null || o.proxima_acao,
  );
}

/** "enviar proposta até 02/10" */
export function textoProximaAcao(
  acao: string | null | undefined,
  quando: string | null | undefined,
  agora: number = Date.now(),
): string {
  const a = (acao ?? "").trim();
  const dia = diaCurto(quando, agora);
  if (a && dia) return `${a} até ${dia}`;
  if (a) return a;
  return dia ? `até ${dia}` : "";
}

/**
 * Texto curto para ar1_quote_requests.ai_notes: a leitura da IA com a data.
 * É só um registro para a equipe ler; não altera nenhum campo comercial.
 */
export function textoNotasIA(entrada: {
  resumo: string | null | undefined;
  oportunidade: OportunidadeIA;
  agora: Date;
}): string {
  const { oportunidade: o, agora } = entrada;
  const linhas: string[] = [`Leitura da IA em ${diaEHora(agora.toISOString())}.`];
  const resumo = (entrada.resumo ?? "").replace(/\s+/g, " ").trim();
  if (resumo) linhas.push(resumo);

  const sugestoes: string[] = [];
  if (o.etapa_sugerida) sugestoes.push(`etapa ${ROTULO_ETAPA[o.etapa_sugerida as EtapaFunil]}`);
  if (o.valor_estimado !== null) sugestoes.push(`valor ${formatarReais(o.valor_estimado)}`);
  if (o.probabilidade !== null) sugestoes.push(`probabilidade ${o.probabilidade}%`);
  const acao = textoProximaAcao(o.proxima_acao, o.proxima_acao_em, agora.getTime());
  if (acao) sugestoes.push(`próxima ação: ${acao}`);
  if (sugestoes.length) linhas.push(`Sugestões: ${sugestoes.join("; ")}.`);
  if (o.motivo) linhas.push(`Motivo: ${o.motivo}`);

  const texto = linhas.join("\n");
  return texto.length > LIMITE_NOTAS_IA ? `${texto.slice(0, LIMITE_NOTAS_IA - 1).trimEnd()}…` : texto;
}

/** Estado atual da oportunidade, para a IA saber de onde está partindo. */
export function descreverOportunidadeAtual(
  o: Pick<
    Oportunidade,
    "status" | "estimated_value" | "probability" | "next_action" | "next_action_at" | "project_type"
  >,
  agora: number = Date.now(),
): string[] {
  return [
    `etapa atual: ${o.status} (${ROTULO_ETAPA[o.status] ?? o.status})`,
    `serviço: ${o.project_type || "(não informado)"}`,
    `valor estimado: ${o.estimated_value === null ? "(sem valor)" : formatarReais(o.estimated_value)}`,
    `probabilidade: ${o.probability === null ? "(não informada)" : `${o.probability}%`}`,
    `próxima ação: ${textoProximaAcao(o.next_action, o.next_action_at, agora) || "(nenhuma)"}`,
  ];
}
