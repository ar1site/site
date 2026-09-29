// Transforma a leitura da IA em linhas "IA sugere…" com o campo que cada uma
// altera. Puro, testável. Quem aplica é a tela, e só depois do clique em Aceitar.

import { textoProximaAcao } from "../analise/oportunidade";
import type { EtapaFunil, Oportunidade, OportunidadeIA } from "../tipos";
import { etapaAberta, formatarReais, numeroOuNull, ROTULO_ETAPA } from "./etapas";

export type CampoSugerido = "etapa" | "valor" | "probabilidade" | "proxima_acao";

export type CamposSugeridos = Partial<
  Pick<Oportunidade, "estimated_value" | "probability" | "next_action" | "next_action_at">
>;

export interface SugestaoDeCampo {
  campo: CampoSugerido;
  /** "IA sugere mover para Proposta" */
  texto: string;
  /**
   * Campos que o Aceitar grava. Vazio quando a sugestão é de etapa: mudar de
   * etapa passa pelas regras de transição (motivo em Perdido, valor em Ganho).
   */
  campos: CamposSugeridos;
  /** Só quando `campo` é "etapa". */
  etapa?: EtapaFunil;
}

export type EstadoComercial = Pick<
  Oportunidade,
  "status" | "estimated_value" | "probability" | "next_action" | "next_action_at"
>;

function mesmoTexto(a: string | null | undefined, b: string | null | undefined): boolean {
  const limpar = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return limpar(a) === limpar(b);
}

function mesmoInstante(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta === tb;
}

/**
 * Sugestões da IA que ainda não estão aplicadas na oportunidade.
 * Oportunidade fechada (ganha ou perdida) não recebe sugestão.
 */
export function sugestoesParaOportunidade(
  ia: OportunidadeIA | null | undefined,
  atual: EstadoComercial,
  agora: number = Date.now(),
): SugestaoDeCampo[] {
  if (!ia || !etapaAberta(atual.status)) return [];
  const lista: SugestaoDeCampo[] = [];

  if (ia.etapa_sugerida && ia.etapa_sugerida !== atual.status) {
    lista.push({
      campo: "etapa",
      texto: `IA sugere mover para ${ROTULO_ETAPA[ia.etapa_sugerida]}`,
      campos: {},
      etapa: ia.etapa_sugerida,
    });
  }

  if (ia.valor_estimado !== null && ia.valor_estimado !== numeroOuNull(atual.estimated_value)) {
    lista.push({
      campo: "valor",
      texto: `IA sugere valor de ${formatarReais(ia.valor_estimado)}`,
      campos: { estimated_value: ia.valor_estimado },
    });
  }

  if (ia.probabilidade !== null && ia.probabilidade !== numeroOuNull(atual.probability)) {
    lista.push({
      campo: "probabilidade",
      texto: `IA sugere probabilidade de ${ia.probabilidade}%`,
      campos: { probability: ia.probabilidade },
    });
  }

  if (ia.proxima_acao) {
    const igual =
      mesmoTexto(ia.proxima_acao, atual.next_action) &&
      (ia.proxima_acao_em === null || mesmoInstante(ia.proxima_acao_em, atual.next_action_at));
    if (!igual) {
      const campos: CamposSugeridos = { next_action: ia.proxima_acao };
      // Sem data sugerida, a data que a equipe já marcou continua valendo.
      if (ia.proxima_acao_em) campos.next_action_at = ia.proxima_acao_em;
      lista.push({
        campo: "proxima_acao",
        texto: `IA sugere próxima ação: ${textoProximaAcao(ia.proxima_acao, ia.proxima_acao_em, agora)}`,
        campos,
      });
    }
  }

  return lista;
}

/** Valores para abrir o formulário "Criar oportunidade" já com a sugestão da IA. */
export function camposIniciaisDaIA(ia: OportunidadeIA | null | undefined): Required<CamposSugeridos> {
  return {
    estimated_value: ia?.valor_estimado ?? null,
    probability: ia?.probabilidade ?? null,
    next_action: ia?.proxima_acao ?? null,
    next_action_at: ia?.proxima_acao ? (ia.proxima_acao_em ?? null) : null,
  };
}
