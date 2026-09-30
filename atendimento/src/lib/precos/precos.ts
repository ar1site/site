// Tabela de preços da AR1 (ar1_price_items): tipos, serviços, unidades,
// validação e formatação. Puro (sem banco), serve ao navegador e ao servidor.
// Espelha a migração 20260930110000_ar1_propostas_premium.sql.

import { VALOR_MAXIMO } from "../funil/etapas";
import { lerValor } from "../funil/formulario";

/** Serviços da base de conhecimento (o que a AR1 vende). */
export const SERVICOS = [
  "Podcast gravado",
  "Podcast ao vivo",
  "Podcast itinerante",
  "Transmissão ao vivo",
  "Leilão 360",
  "Filme de Legado",
  "Filme de marca",
  "Fotografia",
  "Shows/DVDs/clipes",
  "Conteúdo recorrente",
  "Consultoria de estúdio",
  "Locação do Haras SOBI",
  "Teleprompter",
] as const;

export type Servico = (typeof SERVICOS)[number];

export const UNIDADES = ["por episódio", "por dia", "por projeto", "por mês", "por hora", "por evento"] as const;

export type Unidade = (typeof UNIDADES)[number];

/** Linha de public.ar1_price_items. */
export interface ItemDePreco {
  id: string;
  service: Servico;
  name: string;
  description: string | null;
  unit: Unidade;
  /** Em reais. */
  price: number;
  min_qty: number;
  includes: string[];
  active: boolean;
  /** false = "valor inicial sugerido, confirmar". */
  confirmed: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const AVISO_VALORES_INICIAIS = "Valores iniciais sugeridos. Confirme cada item antes de usar em propostas.";

export const LIMITES_PRECO = {
  nome: 120,
  descricao: 600,
  inclui: 12,
  itemInclui: 160,
  quantidadeMinima: 1000,
} as const;

export function ehServico(valor: unknown): valor is Servico {
  return typeof valor === "string" && (SERVICOS as readonly string[]).includes(valor);
}

export function ehUnidade(valor: unknown): valor is Unidade {
  return typeof valor === "string" && (UNIDADES as readonly string[]).includes(valor);
}

/** numeric chega como texto; jsonb pode chegar estranho. */
export function normalizarItem(linha: Record<string, unknown>): ItemDePreco {
  const r = linha as unknown as ItemDePreco;
  const price = Number(r.price);
  const min = Number(r.min_qty);
  return {
    ...r,
    service: ehServico(r.service) ? r.service : SERVICOS[0],
    unit: ehUnidade(r.unit) ? r.unit : "por projeto",
    price: Number.isFinite(price) ? price : 0,
    min_qty: Number.isFinite(min) && min >= 1 ? Math.round(min) : 1,
    includes: Array.isArray(r.includes) ? r.includes.filter((s): s is string => typeof s === "string") : [],
    active: r.active !== false,
    confirmed: r.confirmed === true,
    sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
    description: typeof r.description === "string" && r.description.trim() ? r.description : null,
  };
}

/** Itens agrupados por serviço, na ordem da lista de serviços e por sort_order. */
export function agruparPorServico(itens: readonly ItemDePreco[]): { servico: Servico; itens: ItemDePreco[] }[] {
  return SERVICOS.map((servico) => ({
    servico,
    itens: itens
      .filter((i) => i.service === servico)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR")),
  })).filter((g) => g.itens.length > 0);
}

/** "R$ 2.800,00" */
export function reais(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "R$ 2.800,00 por dia" */
export function precoComUnidade(item: Pick<ItemDePreco, "price" | "unit">): string {
  return `${reais(item.price)} ${item.unit}`;
}

// ---------------------------------------------------------------- formulário

/** O que a tela edita, como texto. */
export interface ItemNoFormulario {
  service: string;
  name: string;
  description: string;
  unit: string;
  /** "2800", "2.800,50" */
  price: string;
  min_qty: string;
  /** Uma linha por item. */
  includes: string;
}

export type CamposDoItem = Pick<
  ItemDePreco,
  "service" | "name" | "description" | "unit" | "price" | "min_qty" | "includes"
>;

export type ResultadoItem = { ok: true; campos: CamposDoItem } | { ok: false; erros: Record<string, string> };

export function paraFormulario(i: ItemDePreco): ItemNoFormulario {
  return {
    service: i.service,
    name: i.name,
    description: i.description ?? "",
    unit: i.unit,
    price: i.price % 1 === 0 ? String(i.price) : i.price.toFixed(2).replace(".", ","),
    min_qty: String(i.min_qty),
    includes: i.includes.join("\n"),
  };
}

export function itemVazio(servico: Servico = SERVICOS[0]): ItemNoFormulario {
  return { service: servico, name: "", description: "", unit: "por projeto", price: "", min_qty: "1", includes: "" };
}

/** Valida o formulário de um item da tabela (os limites são os do banco). */
export function validarItem(f: ItemNoFormulario): ResultadoItem {
  const erros: Record<string, string> = {};

  if (!ehServico(f.service)) erros.service = "Escolha um serviço da lista.";

  const name = f.name.replace(/\s+/g, " ").trim();
  if (!name) erros.name = "Dê um nome ao item.";
  else if (name.length > LIMITES_PRECO.nome) erros.name = `Nome longo demais (máximo ${LIMITES_PRECO.nome}).`;

  const description = f.description.trim();
  if (description.length > LIMITES_PRECO.descricao) {
    erros.description = `Descrição longa demais (máximo ${LIMITES_PRECO.descricao}).`;
  }

  if (!ehUnidade(f.unit)) erros.unit = "Escolha uma unidade.";

  const price = lerValor(f.price);
  if (price === null || Number.isNaN(price) || price < 0 || price > VALOR_MAXIMO) {
    erros.price = "Preço inválido. Use só números, como 2800 ou 2.800,50.";
  }

  const min = Number(f.min_qty.trim() || "1");
  if (!Number.isInteger(min) || min < 1 || min > LIMITES_PRECO.quantidadeMinima) {
    erros.min_qty = `Quantidade mínima de 1 a ${LIMITES_PRECO.quantidadeMinima}.`;
  }

  const includes = f.includes
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  if (includes.length > LIMITES_PRECO.inclui) erros.includes = `No máximo ${LIMITES_PRECO.inclui} linhas em "o que inclui".`;
  if (includes.some((l) => l.length > LIMITES_PRECO.itemInclui)) {
    erros.includes = `Cada linha de "o que inclui" tem no máximo ${LIMITES_PRECO.itemInclui} caracteres.`;
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return {
    ok: true,
    campos: {
      service: f.service as Servico,
      name,
      description: description || null,
      unit: f.unit as Unidade,
      price: price as number,
      min_qty: min,
      includes,
    },
  };
}
