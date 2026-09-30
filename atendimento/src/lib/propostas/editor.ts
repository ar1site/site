// Estado do editor da proposta (tudo como texto de formulário) e a conversão
// de ida e volta para a proposta. Puro, testável.

import { lerValor, valorParaCampo } from "../funil/formulario";
import {
  totalDaProposta,
  validarProposta,
  type CampoDaProposta,
  type ItemInvestimento,
  type Proposta,
  type ResultadoValidacao,
  type TotalDaProposta,
} from "./proposta";

export interface InvestimentoNoEditor {
  descricao: string;
  /** Texto digitado: "4800", "4.800,50" ou vazio ("a definir"). */
  valor: string;
  /** De onde saiu o valor sugerido (só informativo). */
  fonte: string | null;
}

export interface PropostaNoEditor {
  titulo: string;
  nome: string;
  empresa: string;
  resumo: string;
  escopo: { item: string; descricao: string }[];
  entregas: string[];
  cronograma: { etapa: string; prazo: string }[];
  investimento: InvestimentoNoEditor[];
  condicoes: string[];
  validade: string;
  observacoes: string;
}

export function paraEditor(p: Proposta, fontesDosValores: readonly (string | null)[] = []): PropostaNoEditor {
  return {
    titulo: p.titulo,
    nome: p.cliente.nome,
    empresa: p.cliente.empresa ?? "",
    resumo: p.resumo_do_pedido,
    escopo: p.escopo.map((e) => ({ ...e })),
    entregas: [...p.entregas],
    cronograma: p.cronograma.map((e) => ({ ...e })),
    investimento: p.investimento.map((i, n) => ({
      descricao: i.descricao,
      valor: valorParaCampo(i.valor),
      fonte: i.valor === null ? null : (fontesDosValores[n] ?? null),
    })),
    condicoes: [...p.condicoes],
    validade: String(p.validade_dias),
    observacoes: p.observacoes ?? "",
  };
}

/** Itens do investimento com o valor lido. Valor ilegível vira NaN. */
function lerInvestimento(itens: readonly InvestimentoNoEditor[]): ItemInvestimento[] {
  return itens.map((i) => ({ descricao: i.descricao, valor: lerValor(i.valor) }));
}

/** Total do que está na tela agora (valor ilegível conta como "a definir"). */
export function totalDoEditor(itens: readonly InvestimentoNoEditor[]): TotalDaProposta {
  return totalDaProposta(lerInvestimento(itens).filter((i) => i.descricao.trim() || i.valor !== null));
}

/** Converte o que está na tela em proposta validada, pronta para virar PDF. */
export function doEditor(e: PropostaNoEditor): ResultadoValidacao {
  const investimento = lerInvestimento(e.investimento);
  const ilegivel = investimento.find((i) => i.valor !== null && Number.isNaN(i.valor));
  if (ilegivel) {
    return {
      ok: false,
      campo: "investimento",
      erro: `Valor inválido em "${ilegivel.descricao.trim() || "item sem descrição"}". Use só números, como 4800 ou 4.800,50.`,
    };
  }
  const validade = e.validade.trim();
  return validarProposta({
    titulo: e.titulo,
    cliente: { nome: e.nome, empresa: e.empresa },
    resumo_do_pedido: e.resumo,
    escopo: e.escopo,
    entregas: e.entregas,
    cronograma: e.cronograma,
    investimento,
    condicoes: e.condicoes,
    validade_dias: /^\d{1,3}$/.test(validade) ? Number(validade) : Number.NaN,
    observacoes: e.observacoes,
  });
}

/** Seção do editor em que cada campo da proposta aparece (para mostrar o erro no lugar). */
export type SecaoDoEditor =
  | "titulo"
  | "cliente"
  | "resumo"
  | "escopo"
  | "entregas"
  | "cronograma"
  | "investimento"
  | "condicoes"
  | "validade"
  | "observacoes";

export const SECAO_DO_CAMPO: Record<CampoDaProposta, SecaoDoEditor> = {
  titulo: "titulo",
  cliente: "cliente",
  resumo_do_pedido: "resumo",
  escopo: "escopo",
  entregas: "entregas",
  cronograma: "cronograma",
  investimento: "investimento",
  condicoes: "condicoes",
  validade_dias: "validade",
  observacoes: "observacoes",
};
