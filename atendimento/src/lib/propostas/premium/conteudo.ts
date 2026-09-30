// Conteúdo da proposta premium (apresentação): tipos, limites, seções e a
// normalização do que vem da IA ou do editor. Puro (sem banco), serve ao
// navegador e ao servidor. Os valores do investimento NÃO passam por aqui:
// eles são recalculados a partir da tabela em `investimento.ts`.

import { ehImagemDaGaleria } from "../galeria";
import { umaLinha, VALIDADE_MAXIMA_DIAS, VALIDADE_MINIMA_DIAS, variasLinhas } from "../proposta";
import { type Investimento, type ItemDoInvestimento, MAXIMO_DE_ITENS } from "./investimento";

/** Imagem usada na proposta: da galeria da AR1 ou enviada (logo, foto do cliente). */
export interface ImagemDaProposta {
  origem: "galeria" | "cliente";
  /** Galeria: nome do arquivo. Cliente: caminho no bucket ar1-context (propostas/<id>/...). */
  arquivo: string;
}

export interface SecaoSolucao {
  titulo: string;
  descricao: string;
  imagem: ImagemDaProposta | null;
}

export interface ItemDoEscopo {
  item: string;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
}

export interface EtapaDoCronograma {
  etapa: string;
  prazo: string;
}

export type SecaoPremium =
  | "capa"
  | "entendimento"
  | "por_que_ar1"
  | "solucao"
  | "escopo"
  | "entregas"
  | "cronograma"
  | "investimento"
  | "proximos_passos"
  | "observacoes";

export const ORDEM_PADRAO: readonly SecaoPremium[] = [
  "capa",
  "entendimento",
  "por_que_ar1",
  "solucao",
  "escopo",
  "entregas",
  "cronograma",
  "investimento",
  "proximos_passos",
  "observacoes",
] as const;

export const ROTULO_SECAO: Record<SecaoPremium, string> = {
  capa: "Capa",
  entendimento: "Entendimento",
  por_que_ar1: "Por que a AR1",
  solucao: "Solução",
  escopo: "Escopo detalhado",
  entregas: "Entregas",
  cronograma: "Cronograma",
  investimento: "Investimento",
  proximos_passos: "Próximos passos",
  observacoes: "Observações",
};

/** Conteúdo completo, como fica em ar1_proposals.content (kind = 'premium'). */
export interface PropostaPremium {
  /** Marca a forma do conteúdo (as propostas em PDF antigas não têm). */
  versao: 2;
  titulo: string;
  subtitulo: string;
  cliente: { nome: string; empresa: string | null };
  /** Logo ou imagem enviada do cliente (caminho no bucket), mostrada na capa. */
  logo_cliente: string | null;
  capa: { frase: string; imagem: ImagemDaProposta | null };
  /** 2 a 3 parágrafos separados por linha em branco. */
  entendimento: string;
  por_que_ar1: string[];
  solucao: SecaoSolucao[];
  escopo_detalhado: ItemDoEscopo[];
  entregas: string[];
  cronograma: EtapaDoCronograma[];
  investimento: Investimento;
  proximos_passos: string[];
  validade_dias: number;
  observacoes: string | null;
  /** Ordem das seções na apresentação (a capa é sempre a primeira). */
  ordem_secoes: SecaoPremium[];
}

/**
 * Validade comercial padrão da proposta premium: 30 dias, a mesma do link
 * público (a proposta em PDF antiga usa 15).
 */
export const VALIDADE_PREMIUM_PADRAO_DIAS = 30;

/** Validade em dias (1 a 180); fora disso, ou sem número, a padrão (30). */
export function lerValidadePremium(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.trim()) : Number.NaN;
  if (!Number.isFinite(n)) return VALIDADE_PREMIUM_PADRAO_DIAS;
  const inteiro = Math.round(n);
  if (inteiro < VALIDADE_MINIMA_DIAS || inteiro > VALIDADE_MAXIMA_DIAS) return VALIDADE_PREMIUM_PADRAO_DIAS;
  return inteiro;
}

export const LIMITES_PREMIUM = {
  titulo: 90,
  subtitulo: 140,
  frase: 160,
  entendimento: 1800,
  porQue: 3,
  porQueItem: 220,
  solucao: 6,
  solucaoTitulo: 80,
  solucaoDescricao: 500,
  escopo: 16,
  escopoItem: 90,
  escopoDescricao: 400,
  entregas: 14,
  entrega: 200,
  etapas: 10,
  etapa: 80,
  prazo: 80,
  proximosPassos: 6,
  passo: 200,
  observacoes: 1200,
  condicoes: 400,
} as const;

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

function cortar(texto: string, limite: number): string {
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto;
}

function linhas(valor: unknown, maximo: number, limite: number): string[] {
  return lista(valor)
    .map((v) => cortar(umaLinha(v), limite))
    .filter(Boolean)
    .slice(0, maximo);
}

/** Aceita a forma guardada `{origem, arquivo}` ou só o nome do arquivo da galeria. */
export function lerImagem(valor: unknown): ImagemDaProposta | null {
  if (typeof valor === "string") return ehImagemDaGaleria(valor) ? { origem: "galeria", arquivo: valor } : null;
  const o = objeto(valor);
  const arquivo = typeof o.arquivo === "string" ? o.arquivo.trim() : "";
  if (!arquivo) return null;
  if (o.origem === "cliente") return caminhoDeImagemValido(arquivo) ? { origem: "cliente", arquivo } : null;
  return ehImagemDaGaleria(arquivo) ? { origem: "galeria", arquivo } : null;
}

/** Caminho de imagem enviada: propostas/<uuid>/<nome>. */
export function caminhoDeImagemValido(caminho: string): boolean {
  return /^propostas\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}\.(png|jpg|jpeg|webp)$/i.test(caminho);
}

function lerNumeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function lerOrdem(valor: unknown): SecaoPremium[] {
  const vistas = new Set<SecaoPremium>();
  for (const s of lista(valor)) {
    if (typeof s === "string" && (ORDEM_PADRAO as readonly string[]).includes(s)) vistas.add(s as SecaoPremium);
  }
  const ordem = [...vistas].filter((s) => s !== "capa");
  for (const s of ORDEM_PADRAO) if (s !== "capa" && !vistas.has(s)) ordem.push(s);
  return ["capa", ...ordem];
}

/**
 * Normaliza o conteúdo (da IA, do editor ou do banco) aplicando limites. O
 * investimento chega já recalculado pelo servidor (`recalcularInvestimento`);
 * aqui só é copiado com a forma garantida.
 */
export function normalizarPremium(bruto: unknown, investimento: Investimento): PropostaPremium {
  const p = objeto(bruto);
  const cliente = objeto(p.cliente);
  const capa = objeto(p.capa);

  return {
    versao: 2,
    titulo: cortar(umaLinha(p.titulo), LIMITES_PREMIUM.titulo),
    subtitulo: cortar(umaLinha(p.subtitulo), LIMITES_PREMIUM.subtitulo),
    cliente: {
      nome: cortar(umaLinha(cliente.nome), 200),
      empresa: cortar(umaLinha(cliente.empresa), 200) || null,
    },
    logo_cliente: typeof p.logo_cliente === "string" && caminhoDeImagemValido(p.logo_cliente) ? p.logo_cliente : null,
    capa: { frase: cortar(umaLinha(capa.frase), LIMITES_PREMIUM.frase), imagem: lerImagem(capa.imagem) },
    entendimento: cortar(variasLinhas(p.entendimento), LIMITES_PREMIUM.entendimento),
    por_que_ar1: linhas(p.por_que_ar1, LIMITES_PREMIUM.porQue, LIMITES_PREMIUM.porQueItem),
    solucao: lista(p.solucao)
      .map((s) => {
        const o = objeto(s);
        return {
          titulo: cortar(umaLinha(o.titulo), LIMITES_PREMIUM.solucaoTitulo),
          descricao: cortar(variasLinhas(o.descricao), LIMITES_PREMIUM.solucaoDescricao),
          imagem: lerImagem(o.imagem),
        };
      })
      .filter((s) => s.titulo)
      .slice(0, LIMITES_PREMIUM.solucao),
    escopo_detalhado: lista(p.escopo_detalhado)
      .map((e) => {
        const o = objeto(e);
        return {
          item: cortar(umaLinha(o.item), LIMITES_PREMIUM.escopoItem),
          descricao: cortar(variasLinhas(o.descricao), LIMITES_PREMIUM.escopoDescricao),
          quantidade: lerNumeroOuNull(o.quantidade),
          unidade: cortar(umaLinha(o.unidade), 40) || null,
        };
      })
      .filter((e) => e.item)
      .slice(0, LIMITES_PREMIUM.escopo),
    entregas: linhas(p.entregas, LIMITES_PREMIUM.entregas, LIMITES_PREMIUM.entrega),
    cronograma: lista(p.cronograma)
      .map((c) => {
        const o = objeto(c);
        return {
          etapa: cortar(umaLinha(o.etapa), LIMITES_PREMIUM.etapa),
          prazo: cortar(umaLinha(o.prazo), LIMITES_PREMIUM.prazo) || "a definir",
        };
      })
      .filter((c) => c.etapa)
      .slice(0, LIMITES_PREMIUM.etapas),
    investimento: {
      itens: investimento.itens.slice(0, MAXIMO_DE_ITENS).map((i): ItemDoInvestimento => ({ ...i })),
      subtotal: investimento.subtotal,
      desconto: investimento.desconto,
      total: investimento.total,
      condicoes_pagamento: cortar(umaLinha(investimento.condicoes_pagamento), LIMITES_PREMIUM.condicoes),
      sob_consulta: investimento.sob_consulta,
    },
    proximos_passos: linhas(p.proximos_passos, LIMITES_PREMIUM.proximosPassos, LIMITES_PREMIUM.passo),
    validade_dias: lerValidadePremium(p.validade_dias),
    observacoes: cortar(variasLinhas(p.observacoes), LIMITES_PREMIUM.observacoes) || null,
    ordem_secoes: lerOrdem(p.ordem_secoes),
  };
}

/** Conteúdo guardado é premium (versão 2)? */
export function ehPremium(conteudo: unknown): conteudo is PropostaPremium {
  return objeto(conteudo).versao === 2;
}

/** Só as seções que têm conteúdo, na ordem escolhida. */
export function secoesVisiveis(p: PropostaPremium): SecaoPremium[] {
  return p.ordem_secoes.filter((s) => {
    switch (s) {
      case "capa":
        return true;
      case "entendimento":
        return Boolean(p.entendimento);
      case "por_que_ar1":
        return p.por_que_ar1.length > 0;
      case "solucao":
        return p.solucao.length > 0;
      case "escopo":
        return p.escopo_detalhado.length > 0;
      case "entregas":
        return p.entregas.length > 0;
      case "cronograma":
        return p.cronograma.length > 0;
      case "investimento":
        return p.investimento.itens.length > 0;
      case "proximos_passos":
        return p.proximos_passos.length > 0;
      case "observacoes":
        return Boolean(p.observacoes);
    }
  });
}

/** Erro de validação para gerar ou salvar: o mínimo para a proposta fazer sentido. */
export function conferirPremium(p: PropostaPremium): { ok: true } | { ok: false; erro: string } {
  if (!p.titulo) return { ok: false, erro: "Dê um título à proposta." };
  if (!p.cliente.nome) return { ok: false, erro: "Informe o nome do cliente." };
  if (!p.entendimento && p.solucao.length === 0 && p.investimento.itens.length === 0) {
    return { ok: false, erro: "A proposta está vazia: escreva o entendimento, a solução ou o investimento." };
  }
  return { ok: true };
}

/** Parágrafos do entendimento (separados por linha em branco). */
export function paragrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
