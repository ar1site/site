// Reserva do PDF: quando o Chrome falha, a proposta premium vira a forma da
// proposta em PDF antiga (pdf-lib, A4 retrato). Puro, testável.
//
// Cuidados para o cliente não receber um documento contraditório:
//   - o total é o MESMO da proposta (subtotal − desconto), com o desconto em
//     linhas próprias, e as linhas sem valor saem "sob consulta";
//   - o PDF antigo tem no máximo 12 linhas de investimento: as que sobram são
//     somadas numa linha "Demais itens" (o total não muda);
//   - a reserva aceita mais páginas que o PDF simples (PAGINAS_DA_RESERVA).

import { LIMITES, validarProposta, type ItemInvestimento, type Proposta } from "../proposta";
import type { PropostaPremium } from "./conteudo";
import { quantidadeLegivel, TEXTO_SOB_CONSULTA, type ItemDoInvestimento } from "./investimento";

/** Máximo de páginas do PDF de reserva (o simples tem 3). */
export const PAGINAS_DA_RESERVA = 8;

function cortar(t: string, limite: number): string {
  return t.length > limite ? `${t.slice(0, limite - 1).trimEnd()}…` : t;
}

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

function linha(i: ItemDoInvestimento): ItemInvestimento {
  return {
    descricao: cortar(`${i.descricao} — ${quantidadeLegivel(i.quantidade, i.unidade)}`, LIMITES.descricaoDeInvestimento),
    valor: i.valor_total,
  };
}

function juntar(itens: readonly ItemDoInvestimento[], comValor: boolean): ItemInvestimento {
  const nomes = itens.map((i) => i.descricao).join("; ");
  const valor = comValor ? centavos(itens.reduce((s, i) => s + (i.valor_total ?? 0), 0)) : null;
  return { descricao: cortar(`Demais itens (${itens.length}): ${nomes}`, LIMITES.descricaoDeInvestimento), valor };
}

/** Linhas do investimento que cabem no PDF simples, sem mudar o total. */
export function investimentoDaReserva(itens: readonly ItemDoInvestimento[]): ItemInvestimento[] {
  const maximo = LIMITES.itensDeInvestimento;
  if (itens.length <= maximo) return itens.map(linha);
  const temValor = (i: ItemDoInvestimento) => i.valor_total !== null;
  // Um grupo só, quando as que sobram são todas com valor ou todas sob consulta.
  const sobra = itens.slice(maximo - 1);
  if (sobra.every(temValor) || !sobra.some(temValor)) {
    return [...itens.slice(0, maximo - 1).map(linha), juntar(sobra, sobra.every(temValor))];
  }
  // Misturadas: um grupo com valor e outro sob consulta (o total parcial continua certo).
  const resto = itens.slice(maximo - 2);
  return [
    ...itens.slice(0, maximo - 2).map(linha),
    juntar(resto.filter(temValor), true),
    juntar(resto.filter((i) => !temValor(i)), false),
  ];
}

export interface EntradaDaReserva {
  proposta: Proposta;
  /** Desconto em reais (já negociado), para o PDF mostrar Subtotal / Desconto / Total. */
  desconto: number | null;
  textoSemValor: string;
  maximoDePaginas: number;
}

/** Converte para a proposta simples. Lança se o resultado não passar na validação do PDF antigo. */
export function propostaParaReserva(p: PropostaPremium): Proposta {
  return entradaDaReserva(p).proposta;
}

/** Tudo o que o gerador pdf-lib precisa para a reserva (proposta + desconto + limites). */
export function entradaDaReserva(p: PropostaPremium): EntradaDaReserva {
  const inv = p.investimento;
  // Descrições mais curtas que no PDF simples: a reserva é um resumo fiel, não a apresentação.
  const escopo = [
    ...p.solucao.map((s) => ({ item: s.titulo, descricao: cortar(s.descricao, 260) })),
    ...p.escopo_detalhado.map((e) => ({
      item: e.quantidade ? `${e.item} (${quantidadeLegivel(e.quantidade, e.unidade ?? "")})` : e.item,
      descricao: cortar(e.descricao, 200),
    })),
  ]
    .map((e) => ({ item: cortar(e.item, LIMITES.itemDeEscopo), descricao: cortar(e.descricao, LIMITES.descricaoDeEscopo) }))
    .slice(0, LIMITES.itensDeEscopo);

  const condicoes = [
    inv.condicoes_pagamento ? `Pagamento: ${inv.condicoes_pagamento}` : "",
    ...p.proximos_passos.map((s) => `Próximo passo: ${s}`),
  ]
    .filter(Boolean)
    .map((c) => cortar(c, LIMITES.condicao))
    .slice(0, LIMITES.condicoes);

  const resumo = [p.subtitulo, p.entendimento, ...p.por_que_ar1.map((x) => `• ${x}`)].filter(Boolean).join("\n\n");

  const r = validarProposta({
    titulo: cortar(p.titulo || "Proposta comercial", LIMITES.titulo),
    cliente: p.cliente,
    resumo_do_pedido: cortar(resumo, LIMITES.resumo),
    escopo,
    entregas: p.entregas.map((e) => cortar(e, LIMITES.entrega)).slice(0, LIMITES.entregas),
    cronograma: p.cronograma.slice(0, LIMITES.etapas),
    investimento: investimentoDaReserva(inv.itens),
    condicoes,
    validade_dias: p.validade_dias,
    observacoes: p.observacoes ? cortar(p.observacoes, LIMITES.observacoes) : null,
  });
  if (!r.ok) throw new Error(`Não foi possível montar a versão simples do PDF: ${r.erro}`);
  return {
    proposta: r.proposta,
    desconto: inv.desconto && inv.desconto > 0 ? inv.desconto : null,
    textoSemValor: TEXTO_SOB_CONSULTA,
    maximoDePaginas: PAGINAS_DA_RESERVA,
  };
}
