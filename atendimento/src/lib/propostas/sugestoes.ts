// Depois de gerar a proposta, o painel sugere (com Aceitar) mover a
// oportunidade para Proposta e marcar a cobrança do retorno. Puro, testável.
// São sugestões: nada muda sem o clique de uma pessoa.

import { diaCurto, diaParaIso, FUSO_BRASILIA_MS } from "../funil/datas";
import { etapaAberta, ROTULO_ETAPA } from "../funil/etapas";
import type { SugestaoDeCampo } from "../funil/sugestoes";
import type { EtapaFunil, Oportunidade } from "../tipos";

export const ACAO_APOS_PROPOSTA = "Cobrar retorno da proposta";
export const DIAS_PARA_COBRAR = 3;
/** Proposta mais antiga que isso não gera mais sugestão. */
export const DIAS_DE_SUGESTAO = 7;

const DIA_MS = 24 * 60 * 60 * 1000;
const ANTES_DA_PROPOSTA: readonly EtapaFunil[] = ["new", "qualified", "contacting"];

function mesmoTexto(a: string | null | undefined, b: string): boolean {
  const limpar = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return limpar(a) === limpar(b);
}

/** Dia (em Brasília) da geração + N dias, vencendo às 18 h. */
export function prazoParaCobrar(geradaEm: Date, dias = DIAS_PARA_COBRAR): string | null {
  const dia = new Date(geradaEm.getTime() + FUSO_BRASILIA_MS + dias * DIA_MS).toISOString().slice(0, 10);
  return diaParaIso(dia);
}

export function sugestoesAposProposta(
  oportunidade: Pick<Oportunidade, "status" | "next_action" | "next_action_at">,
  /** Quando a proposta mais recente foi gerada (ISO). */
  geradaEm: string | null | undefined,
  agora: number = Date.now(),
): SugestaoDeCampo[] {
  if (!geradaEm || !etapaAberta(oportunidade.status)) return [];
  const quando = new Date(geradaEm).getTime();
  if (Number.isNaN(quando) || agora - quando > DIAS_DE_SUGESTAO * DIA_MS) return [];

  const lista: SugestaoDeCampo[] = [];

  if (ANTES_DA_PROPOSTA.includes(oportunidade.status)) {
    lista.push({
      campo: "etapa",
      texto: `Proposta gerada: mover para ${ROTULO_ETAPA.proposal}`,
      campos: {},
      etapa: "proposal",
    });
  }

  const prazo = prazoParaCobrar(new Date(quando));
  const prazoValido = prazo !== null && new Date(prazo).getTime() > agora;
  const proximaAcaoEm = oportunidade.next_action_at ? new Date(oportunidade.next_action_at).getTime() : Number.NaN;
  // Já marcada: a mesma ação, com data posterior à geração da proposta.
  const jaMarcada = mesmoTexto(oportunidade.next_action, ACAO_APOS_PROPOSTA) && proximaAcaoEm >= quando;
  if (prazoValido && !jaMarcada) {
    lista.push({
      campo: "proxima_acao",
      texto: `Proposta gerada: próxima ação "${ACAO_APOS_PROPOSTA}" até ${diaCurto(prazo, agora)}`,
      campos: { next_action: ACAO_APOS_PROPOSTA, next_action_at: prazo },
    });
  }

  return lista;
}
