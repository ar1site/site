// Proposta comercial: conteúdo, limites, total, numeração e validade.
// Puro (sem banco, sem IA), testável. Serve ao navegador e ao servidor.

import { FUSO_BRASILIA_MS } from "../funil/datas";
import { VALOR_MAXIMO } from "../funil/etapas";

export interface ItemEscopo {
  item: string;
  descricao: string;
}

export interface EtapaCronograma {
  etapa: string;
  prazo: string;
}

export interface ItemInvestimento {
  descricao: string;
  /** Em reais. null = "a definir". */
  valor: number | null;
}

/** Conteúdo da proposta: o que a IA rascunha, a pessoa edita e o PDF mostra. */
export interface Proposta {
  titulo: string;
  cliente: { nome: string; empresa: string | null };
  resumo_do_pedido: string;
  escopo: ItemEscopo[];
  entregas: string[];
  cronograma: EtapaCronograma[];
  investimento: ItemInvestimento[];
  condicoes: string[];
  validade_dias: number;
  observacoes: string | null;
}

export type CampoDaProposta = Exclude<keyof Proposta, never>;

export const CAMPOS_DA_PROPOSTA: readonly CampoDaProposta[] = [
  "titulo",
  "cliente",
  "resumo_do_pedido",
  "escopo",
  "entregas",
  "cronograma",
  "investimento",
  "condicoes",
  "validade_dias",
  "observacoes",
] as const;

/** Validade usada quando nem a IA nem a pessoa informam outra. */
export const VALIDADE_PADRAO_DIAS = 15;
export const VALIDADE_MINIMA_DIAS = 1;
export const VALIDADE_MAXIMA_DIAS = 180;

/** O PDF tem de 1 a 3 páginas. */
export const MAXIMO_DE_PAGINAS = 3;

export const LIMITES = {
  titulo: 120,
  nome: 200,
  empresa: 200,
  resumo: 1200,
  itensDeEscopo: 12,
  itemDeEscopo: 80,
  descricaoDeEscopo: 400,
  entregas: 12,
  entrega: 200,
  etapas: 10,
  etapa: 80,
  prazo: 80,
  itensDeInvestimento: 12,
  descricaoDeInvestimento: 160,
  condicoes: 10,
  condicao: 300,
  observacoes: 1000,
} as const;

export const TEXTO_A_DEFINIR = "a definir";

// -------------------------------------------------------------------- total

export interface TotalDaProposta {
  /** Soma dos itens que têm valor. */
  total: number;
  itensComValor: number;
  /** Itens sem valor ("a definir"): não entram na soma. */
  itensADefinir: number;
  /** true quando há itens e todos têm valor. */
  completo: boolean;
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function totalDaProposta(investimento: readonly ItemInvestimento[]): TotalDaProposta {
  let total = 0;
  let itensComValor = 0;
  let itensADefinir = 0;
  for (const item of investimento) {
    if (typeof item.valor === "number" && Number.isFinite(item.valor)) {
      total += item.valor;
      itensComValor += 1;
    } else {
      itensADefinir += 1;
    }
  }
  return {
    total: centavos(total),
    itensComValor,
    itensADefinir,
    completo: itensComValor > 0 && itensADefinir === 0,
  };
}

/** "R$ 4.800,00": no documento o valor sai sempre com centavos. */
export function reaisComCentavos(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Texto do total para a tela e para o histórico. */
export function textoDoTotal(t: Pick<TotalDaProposta, "total" | "itensComValor" | "itensADefinir">): string {
  if (t.itensComValor === 0) return TEXTO_A_DEFINIR;
  const valor = reaisComCentavos(t.total);
  if (t.itensADefinir === 0) return valor;
  return `${valor} + ${t.itensADefinir} ${t.itensADefinir === 1 ? "item" : "itens"} ${TEXTO_A_DEFINIR}`;
}

// ---------------------------------------------------------------- numeração

/** AR1-AAAAMMDD-XXXX */
export const NUMERO_VALIDO = /^AR1-(\d{8})-(\d{4})$/;
export const SEQUENCIA_MAXIMA = 9999;

/** Dia em Brasília como "AAAAMMDD". */
export function diaDaProposta(agora: Date): string {
  return new Date(agora.getTime() + FUSO_BRASILIA_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

export function numeroDaProposta(dia: string, sequencia: number): string {
  if (!/^\d{8}$/.test(dia)) throw new Error("Dia inválido para o número da proposta.");
  if (!Number.isInteger(sequencia) || sequencia < 1 || sequencia > SEQUENCIA_MAXIMA) {
    throw new Error("Sequência inválida para o número da proposta.");
  }
  return `AR1-${dia}-${String(sequencia).padStart(4, "0")}`;
}

/**
 * Próximo número do dia: a maior sequência já usada naquele dia + 1.
 * Números de outros dias e textos fora do padrão são ignorados.
 */
export function proximoNumero(existentes: readonly string[], agora: Date): string {
  const dia = diaDaProposta(agora);
  let maior = 0;
  for (const n of existentes) {
    const m = NUMERO_VALIDO.exec(n.trim());
    if (!m || m[1] !== dia) continue;
    maior = Math.max(maior, Number(m[2]));
  }
  if (maior >= SEQUENCIA_MAXIMA) throw new Error("Limite de propostas do dia atingido.");
  return numeroDaProposta(dia, maior + 1);
}

// ----------------------------------------------------------------- validade

/** Dia (AAAA-MM-DD, em Brasília) até quando a proposta vale. */
export function validaAte(agora: Date, dias: number): string {
  const local = new Date(agora.getTime() + FUSO_BRASILIA_MS);
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(base + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "2026-10-15" -> "15/10/2026" */
export function diaPorExtenso(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

/** Validade em dias dentro dos limites; fora deles (ou sem número), a padrão. */
export function lerValidade(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.trim()) : Number.NaN;
  if (!Number.isFinite(n)) return VALIDADE_PADRAO_DIAS;
  const inteiro = Math.round(n);
  if (inteiro < VALIDADE_MINIMA_DIAS || inteiro > VALIDADE_MAXIMA_DIAS) return VALIDADE_PADRAO_DIAS;
  return inteiro;
}

// ---------------------------------------------------------------- validação

export type ResultadoValidacao =
  | { ok: true; proposta: Proposta }
  | { ok: false; erro: string; campo: CampoDaProposta };

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

/** Uma linha: espaços e quebras viram um espaço só. */
export function umaLinha(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

/** Texto com parágrafos: mantém as quebras, tira o excesso. */
export function variasLinhas(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

/**
 * Confere a proposta editada antes de gerar o PDF. Linhas vazias saem; os
 * limites são os que cabem em até 3 páginas. Valor ausente ou vazio vira null
 * ("a definir"); valor negativo ou absurdo é recusado.
 */
export function validarProposta(bruta: unknown): ResultadoValidacao {
  const p = objeto(bruta);
  if (!p) return { ok: false, erro: "Proposta inválida.", campo: "titulo" };
  const falha = (campo: CampoDaProposta, erro: string): ResultadoValidacao => ({ ok: false, erro, campo });

  const titulo = umaLinha(p.titulo);
  if (!titulo) return falha("titulo", "Dê um título à proposta.");
  if (titulo.length > LIMITES.titulo) return falha("titulo", `Título longo demais (máximo ${LIMITES.titulo}).`);

  const cliente = objeto(p.cliente) ?? {};
  const nome = umaLinha(cliente.nome);
  if (!nome) return falha("cliente", "Informe o nome do cliente.");
  if (nome.length > LIMITES.nome) return falha("cliente", `Nome longo demais (máximo ${LIMITES.nome}).`);
  const empresa = umaLinha(cliente.empresa);
  if (empresa.length > LIMITES.empresa) return falha("cliente", `Empresa longa demais (máximo ${LIMITES.empresa}).`);

  const resumo = variasLinhas(p.resumo_do_pedido);
  if (resumo.length > LIMITES.resumo) return falha("resumo_do_pedido", `Resumo longo demais (máximo ${LIMITES.resumo}).`);

  const escopo: ItemEscopo[] = [];
  for (const bruto of lista(p.escopo)) {
    const o = objeto(bruto) ?? {};
    const item = umaLinha(o.item);
    const descricao = variasLinhas(o.descricao);
    if (!item && !descricao) continue;
    if (!item) return falha("escopo", "Há um item de escopo sem nome.");
    if (item.length > LIMITES.itemDeEscopo) return falha("escopo", `Item de escopo longo demais (máximo ${LIMITES.itemDeEscopo}).`);
    if (descricao.length > LIMITES.descricaoDeEscopo) {
      return falha("escopo", `Descrição de escopo longa demais (máximo ${LIMITES.descricaoDeEscopo}).`);
    }
    escopo.push({ item, descricao });
  }
  if (escopo.length > LIMITES.itensDeEscopo) return falha("escopo", `Máximo de ${LIMITES.itensDeEscopo} itens de escopo.`);

  const entregas: string[] = [];
  for (const bruto of lista(p.entregas)) {
    const texto = umaLinha(bruto);
    if (!texto) continue;
    if (texto.length > LIMITES.entrega) return falha("entregas", `Entrega longa demais (máximo ${LIMITES.entrega}).`);
    entregas.push(texto);
  }
  if (entregas.length > LIMITES.entregas) return falha("entregas", `Máximo de ${LIMITES.entregas} entregas.`);

  const cronograma: EtapaCronograma[] = [];
  for (const bruto of lista(p.cronograma)) {
    const o = objeto(bruto) ?? {};
    const etapa = umaLinha(o.etapa);
    const prazo = umaLinha(o.prazo);
    if (!etapa && !prazo) continue;
    if (!etapa) return falha("cronograma", "Há uma etapa do cronograma sem nome.");
    if (etapa.length > LIMITES.etapa) return falha("cronograma", `Etapa longa demais (máximo ${LIMITES.etapa}).`);
    if (prazo.length > LIMITES.prazo) return falha("cronograma", `Prazo longo demais (máximo ${LIMITES.prazo}).`);
    cronograma.push({ etapa, prazo: prazo || TEXTO_A_DEFINIR });
  }
  if (cronograma.length > LIMITES.etapas) return falha("cronograma", `Máximo de ${LIMITES.etapas} etapas no cronograma.`);

  const investimento: ItemInvestimento[] = [];
  for (const bruto of lista(p.investimento)) {
    const o = objeto(bruto) ?? {};
    const descricao = umaLinha(o.descricao);
    const valorBruto = o.valor;
    const semValor = valorBruto === null || valorBruto === undefined || valorBruto === "";
    if (!descricao && semValor) continue;
    if (!descricao) return falha("investimento", "Há um valor sem descrição no investimento.");
    if (descricao.length > LIMITES.descricaoDeInvestimento) {
      return falha("investimento", `Descrição do investimento longa demais (máximo ${LIMITES.descricaoDeInvestimento}).`);
    }
    let valor: number | null = null;
    if (!semValor) {
      if (typeof valorBruto !== "number" || !Number.isFinite(valorBruto)) {
        return falha("investimento", `Valor inválido em "${descricao}".`);
      }
      if (valorBruto < 0) return falha("investimento", `O valor de "${descricao}" não pode ser negativo.`);
      if (valorBruto > VALOR_MAXIMO) return falha("investimento", `O valor de "${descricao}" é alto demais.`);
      valor = centavos(valorBruto);
    }
    investimento.push({ descricao, valor });
  }
  if (investimento.length > LIMITES.itensDeInvestimento) {
    return falha("investimento", `Máximo de ${LIMITES.itensDeInvestimento} itens no investimento.`);
  }

  const condicoes: string[] = [];
  for (const bruto of lista(p.condicoes)) {
    const texto = umaLinha(bruto);
    if (!texto) continue;
    if (texto.length > LIMITES.condicao) return falha("condicoes", `Condição longa demais (máximo ${LIMITES.condicao}).`);
    condicoes.push(texto);
  }
  if (condicoes.length > LIMITES.condicoes) return falha("condicoes", `Máximo de ${LIMITES.condicoes} condições.`);

  const validadeBruta = p.validade_dias;
  const validade = typeof validadeBruta === "number" ? validadeBruta : Number(String(validadeBruta ?? "").trim());
  if (
    !Number.isInteger(validade) ||
    validade < VALIDADE_MINIMA_DIAS ||
    validade > VALIDADE_MAXIMA_DIAS
  ) {
    return falha("validade_dias", `A validade vai de ${VALIDADE_MINIMA_DIAS} a ${VALIDADE_MAXIMA_DIAS} dias.`);
  }

  const observacoes = variasLinhas(p.observacoes);
  if (observacoes.length > LIMITES.observacoes) {
    return falha("observacoes", `Observações longas demais (máximo ${LIMITES.observacoes}).`);
  }

  if (!resumo && escopo.length === 0 && entregas.length === 0 && investimento.length === 0) {
    return falha("resumo_do_pedido", "A proposta está vazia: escreva o resumo, o escopo ou o investimento.");
  }

  return {
    ok: true,
    proposta: {
      titulo,
      cliente: { nome, empresa: empresa || null },
      resumo_do_pedido: resumo,
      escopo,
      entregas,
      cronograma,
      investimento,
      condicoes,
      validade_dias: validade,
      observacoes: observacoes || null,
    },
  };
}

/** Nome do arquivo que a pessoa baixa: "Proposta AR1-20260930-0001 - Souza Eventos.pdf". */
export function nomeDoArquivo(numero: string, cliente: Proposta["cliente"]): string {
  const quem = (cliente.empresa || cliente.nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return quem ? `Proposta ${numero} - ${quem}.pdf` : `Proposta ${numero}.pdf`;
}
