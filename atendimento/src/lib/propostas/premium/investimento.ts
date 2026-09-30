// Investimento da proposta premium: os valores vêm SEMPRE da tabela de
// preços. A IA (ou a pessoa) escolhe o item e a quantidade; o servidor
// recalcula unitário, total da linha, subtotal, desconto e total. Item sem
// correspondência na tabela entra "sob consulta". Puro, testável.

import type { ItemDePreco } from "../../precos/precos";

export const TEXTO_SOB_CONSULTA = "sob consulta";
export const MAXIMO_DE_ITENS = 20;
export const QUANTIDADE_MAXIMA = 1000;

/** Uma linha do investimento como fica guardada na proposta. */
export interface ItemDoInvestimento {
  descricao: string;
  quantidade: number;
  unidade: string;
  /** null = sob consulta. */
  valor_unitario: number | null;
  /** null = sob consulta. */
  valor_total: number | null;
  /** Item da tabela de preços; null = sob consulta. */
  price_item_id: string | null;
  /** O item da tabela ainda não foi confirmado pela equipe (aviso interno). */
  nao_confirmado: boolean;
}

export interface Investimento {
  itens: ItemDoInvestimento[];
  subtotal: number;
  /** Desconto em reais (nunca maior que o subtotal). null = sem desconto. */
  desconto: number | null;
  total: number;
  condicoes_pagamento: string;
  /** Quantas linhas estão "sob consulta". */
  sob_consulta: number;
}

/** O que chega da IA ou do editor: só a escolha (item e quantidade), nunca o valor. */
export interface LinhaPedida {
  descricao?: string | null;
  quantidade?: number | string | null;
  unidade?: string | null;
  price_item_id?: string | null;
}

/** Tabela mínima que o recálculo precisa. */
export type ItemDaTabela = Pick<ItemDePreco, "id" | "name" | "unit" | "price" | "min_qty" | "active" | "confirmed">;

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

function lerQuantidade(valor: unknown, minimo: number): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return minimo;
  return Math.min(QUANTIDADE_MAXIMA, Math.max(minimo, centavos(n)));
}

function umaLinha(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, limite) : "";
}

/**
 * Preço que a proposta JÁ usa para um item da tabela (gravado pelo servidor
 * numa gravação anterior). Serve para a proposta não mudar de valor sozinha
 * quando a tabela muda depois.
 */
export type PrecoGuardado = Pick<ItemDoInvestimento, "price_item_id" | "valor_unitario" | "unidade" | "nao_confirmado">;

export interface OpcoesDoRecalculo {
  desconto?: number | null;
  condicoesPagamento?: string | null;
  /**
   * Linhas já gravadas na proposta (lidas do BANCO, nunca do navegador). Um item
   * que a proposta já usa mantém o valor unitário gravado, mesmo que a tabela
   * tenha mudado de preço ou o item tenha sido desativado/removido. Itens novos
   * seguem a tabela (e precisam estar ativos). Sem esta opção, vale só a tabela.
   */
  guardados?: readonly PrecoGuardado[] | null;
}

function porItemGuardado(guardados: readonly PrecoGuardado[] | null | undefined): Map<string, PrecoGuardado> {
  const mapa = new Map<string, PrecoGuardado>();
  for (const g of guardados ?? []) {
    if (!g.price_item_id || typeof g.valor_unitario !== "number" || !Number.isFinite(g.valor_unitario)) continue;
    if (!mapa.has(g.price_item_id)) mapa.set(g.price_item_id, g);
  }
  return mapa;
}

/**
 * Recalcula o investimento a partir da tabela. Regras:
 *   - o valor unitário é SEMPRE o da tabela (o que vier de fora é ignorado),
 *     ou o já gravado na proposta para aquele item (opção `guardados`);
 *   - item inexistente ou inativo na tabela (e ainda não usado) vira "sob consulta" (valores null);
 *   - quantidade abaixo da mínima do item sobe para a mínima;
 *   - item não confirmado marca a linha (aviso interno; não aparece ao cliente);
 *   - desconto em reais, limitado ao subtotal; total = subtotal − desconto.
 */
export function recalcularInvestimento(
  linhas: readonly LinhaPedida[],
  tabela: readonly ItemDaTabela[],
  opcoes: OpcoesDoRecalculo = {},
): Investimento {
  const porId = new Map(tabela.map((i) => [i.id, i]));
  const guardados = porItemGuardado(opcoes.guardados);
  const itens: ItemDoInvestimento[] = [];

  for (const linha of linhas.slice(0, MAXIMO_DE_ITENS)) {
    const item = linha.price_item_id ? porId.get(linha.price_item_id) : undefined;
    const guardado = linha.price_item_id ? guardados.get(linha.price_item_id) : undefined;
    const usavel = item && item.active !== false ? item : null;
    const descricao = umaLinha(linha.descricao, 160) || usavel?.name || item?.name || "";
    if (!descricao) continue;
    if (guardado && guardado.valor_unitario !== null) {
      // Preço já gravado: fica. O aviso de "não confirmado" some quando a
      // equipe confirma o item com o mesmo preço.
      const quantidade = lerQuantidade(linha.quantidade, item?.min_qty ?? 1);
      const mesmoPreco = item ? centavos(item.price) === guardado.valor_unitario : false;
      itens.push({
        descricao,
        quantidade,
        unidade: guardado.unidade || item?.unit || "por projeto",
        valor_unitario: guardado.valor_unitario,
        valor_total: centavos(guardado.valor_unitario * quantidade),
        price_item_id: linha.price_item_id as string,
        nao_confirmado: item && mesmoPreco ? !item.confirmed : guardado.nao_confirmado,
      });
    } else if (usavel) {
      const quantidade = lerQuantidade(linha.quantidade, usavel.min_qty);
      itens.push({
        descricao,
        quantidade,
        unidade: usavel.unit,
        valor_unitario: centavos(usavel.price),
        valor_total: centavos(usavel.price * quantidade),
        price_item_id: usavel.id,
        nao_confirmado: !usavel.confirmed,
      });
    } else {
      itens.push({
        descricao,
        quantidade: lerQuantidade(linha.quantidade, 1),
        unidade: umaLinha(linha.unidade, 40) || "por projeto",
        valor_unitario: null,
        valor_total: null,
        price_item_id: null,
        nao_confirmado: false,
      });
    }
  }

  const subtotal = centavos(itens.reduce((s, i) => s + (i.valor_total ?? 0), 0));
  const descontoBruto = opcoes.desconto;
  const desconto =
    typeof descontoBruto === "number" && Number.isFinite(descontoBruto) && descontoBruto > 0
      ? centavos(Math.min(descontoBruto, subtotal))
      : null;
  const total = centavos(subtotal - (desconto ?? 0));

  return {
    itens,
    subtotal,
    desconto,
    total,
    condicoes_pagamento: (opcoes.condicoesPagamento ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
    sob_consulta: itens.filter((i) => i.price_item_id === null).length,
  };
}

/** Um item cujo preço na proposta ficou diferente do preço atual da tabela. */
export interface PrecoMantido {
  descricao: string;
  price_item_id: string;
  /** O que a proposta usa. */
  valor_na_proposta: number;
  /** O que a tabela diz agora (null = item removido ou desativado). */
  valor_na_tabela: number | null;
}

/**
 * Linhas do investimento que mantiveram o preço gravado, mas que a tabela
 * atual cobra diferente (ou não oferece mais). Para avisar a equipe.
 */
export function precosMantidos(inv: Pick<Investimento, "itens">, tabela: readonly ItemDaTabela[]): PrecoMantido[] {
  const porId = new Map(tabela.map((i) => [i.id, i]));
  const lista: PrecoMantido[] = [];
  for (const linha of inv.itens) {
    if (!linha.price_item_id || linha.valor_unitario === null) continue;
    const item = porId.get(linha.price_item_id);
    const atual = item && item.active !== false ? centavos(item.price) : null;
    if (atual === linha.valor_unitario) continue;
    lista.push({
      descricao: linha.descricao,
      price_item_id: linha.price_item_id,
      valor_na_proposta: linha.valor_unitario,
      valor_na_tabela: atual,
    });
  }
  return lista;
}

/** Aviso interno de um preço mantido. */
export function avisoDePrecoMantido(m: PrecoMantido): string {
  return m.valor_na_tabela === null
    ? `"${m.descricao}" saiu da tabela de preços; a proposta mantém ${reaisPremium(m.valor_na_proposta)}.`
    : `"${m.descricao}" custa ${reaisPremium(m.valor_na_tabela)} na tabela hoje; a proposta mantém ${reaisPremium(m.valor_na_proposta)}. ` +
        "Para usar o valor novo, salve com \"Atualizar preços pela tabela\".";
}

/** A proposta usa algum valor que a equipe ainda não confirmou? */
export function usaValoresNaoConfirmados(inv: Pick<Investimento, "itens">): boolean {
  return inv.itens.some((i) => i.nao_confirmado);
}

/** Aviso interno para a equipe (nunca vai para o cliente). */
export const AVISO_NAO_CONFIRMADO =
  "Esta proposta usa valores não confirmados da tabela de preços. Confirme os itens em Ajustes → Tabela de preços antes de enviar.";

/** "R$ 4.800,00" */
export function reaisPremium(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Texto do total para listas e mensagens: "R$ 4.800,00", "R$ 4.800,00 + 1 item sob consulta" ou "sob consulta". */
export function textoDoTotalPremium(inv: Pick<Investimento, "total" | "sob_consulta" | "itens">): string {
  const comValor = inv.itens.length - inv.sob_consulta;
  if (comValor === 0) return inv.itens.length ? TEXTO_SOB_CONSULTA : "—";
  const base = reaisPremium(inv.total);
  if (inv.sob_consulta === 0) return base;
  return `${base} + ${inv.sob_consulta} ${inv.sob_consulta === 1 ? "item" : "itens"} ${TEXTO_SOB_CONSULTA}`;
}

/** "2 dias", "1 episódio", "3 por mês" (quantidade + unidade legível). */
export function quantidadeLegivel(quantidade: number, unidade: string): string {
  const q = quantidade % 1 === 0 ? String(quantidade) : quantidade.toLocaleString("pt-BR");
  const u = unidade.replace(/^por\s+/i, "").trim();
  if (!u) return q;
  const plural: Record<string, string> = {
    dia: "dias",
    episódio: "episódios",
    projeto: "projetos",
    mês: "meses",
    hora: "horas",
    evento: "eventos",
  };
  return `${q} ${quantidade === 1 ? u : (plural[u] ?? u)}`;
}
