// O formulário da nova proposta (cliente + pedido) e a validação. Puro,
// serve ao navegador e ao servidor.

import { somenteDigitos } from "../../formato";
import { ehServico } from "../../precos/precos";

/** Passo 1: quem é o cliente. */
export interface ClienteDoPedido {
  /** Contato do WhatsApp escolhido (ou null quando digitado). */
  contact_id: string | null;
  /** Oportunidade existente (ou null para criar). */
  oportunidade_id: string | null;
  nome: string;
  empresa: string;
  telefone: string;
  email: string;
  cidade: string;
}

/** Passo 2: o que o cliente precisa. */
export interface Pedido {
  servico: string;
  servicos_adicionais: string[];
  descricao: string;
  data_periodo: string;
  local: string;
  publico_objetivo: string;
  quantidades: string;
  observacoes: string;
}

export interface EntradaNovaProposta {
  cliente: ClienteDoPedido;
  pedido: Pedido;
  /** Dias de validade do link público (padrão 30). */
  dias_link: number;
}

export const DIAS_LINK_PADRAO = 30;
export const DIAS_LINK_MAXIMO = 365;

export const LIMITES_PEDIDO = {
  nome: 200,
  empresa: 200,
  telefone: 32,
  email: 254,
  cidade: 120,
  servico: 100,
  adicionais: 6,
  descricao: 4000,
  curto: 300,
  quantidades: 600,
  observacoes: 2000,
} as const;

export function clienteVazio(): ClienteDoPedido {
  return { contact_id: null, oportunidade_id: null, nome: "", empresa: "", telefone: "", email: "", cidade: "" };
}

export function pedidoVazio(): Pedido {
  return {
    servico: "",
    servicos_adicionais: [],
    descricao: "",
    data_periodo: "",
    local: "",
    publico_objetivo: "",
    quantidades: "",
    observacoes: "",
  };
}

function texto(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim().slice(0, limite) : "";
}

function umaLinha(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, limite) : "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DDD + número (10 dígitos fixo, 11 celular). */
export const DIGITOS_MINIMOS_TELEFONE = 10;

export type ResultadoEntrada =
  | { ok: true; entrada: EntradaNovaProposta }
  | { ok: false; erros: Record<string, string>; passo: 1 | 2 };

/** Lê e valida o corpo enviado pelo formulário (ou qualquer objeto). */
export function validarEntrada(bruto: unknown): ResultadoEntrada {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const c = (b.cliente && typeof b.cliente === "object" ? b.cliente : {}) as Record<string, unknown>;
  const p = (b.pedido && typeof b.pedido === "object" ? b.pedido : {}) as Record<string, unknown>;
  const erros: Record<string, string> = {};

  const cliente: ClienteDoPedido = {
    contact_id: typeof c.contact_id === "string" && UUID.test(c.contact_id) ? c.contact_id : null,
    oportunidade_id: typeof c.oportunidade_id === "string" && UUID.test(c.oportunidade_id) ? c.oportunidade_id : null,
    nome: umaLinha(c.nome, LIMITES_PEDIDO.nome),
    empresa: umaLinha(c.empresa, LIMITES_PEDIDO.empresa),
    telefone: umaLinha(c.telefone, LIMITES_PEDIDO.telefone),
    email: umaLinha(c.email, LIMITES_PEDIDO.email),
    cidade: umaLinha(c.cidade, LIMITES_PEDIDO.cidade),
  };
  if (!cliente.nome) erros.nome = "Informe o nome do cliente.";
  if (cliente.telefone && somenteDigitos(cliente.telefone).length < DIGITOS_MINIMOS_TELEFONE) {
    erros.telefone = "Telefone incompleto: use o DDD, como (62) 99999-9999.";
  } else if (!cliente.telefone && !cliente.contact_id && !cliente.oportunidade_id) {
    // Cliente digitado: o telefone cria o contato e a oportunidade no funil
    // (a oportunidade exige telefone no banco).
    erros.telefone = "Informe o telefone com DDD: ele cria o contato e a oportunidade no funil.";
  }
  if (cliente.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) erros.email = "E-mail inválido.";
  if (Object.keys(erros).length) return { ok: false, erros, passo: 1 };

  const adicionais = Array.isArray(p.servicos_adicionais)
    ? [...new Set(p.servicos_adicionais.map((s) => umaLinha(s, LIMITES_PEDIDO.servico)).filter(Boolean))].slice(
        0,
        LIMITES_PEDIDO.adicionais,
      )
    : [];
  const pedido: Pedido = {
    servico: umaLinha(p.servico, LIMITES_PEDIDO.servico),
    servicos_adicionais: adicionais.filter((s) => s !== umaLinha(p.servico, LIMITES_PEDIDO.servico)),
    descricao: texto(p.descricao, LIMITES_PEDIDO.descricao),
    data_periodo: umaLinha(p.data_periodo, LIMITES_PEDIDO.curto),
    local: umaLinha(p.local, LIMITES_PEDIDO.curto),
    publico_objetivo: texto(p.publico_objetivo, LIMITES_PEDIDO.curto),
    quantidades: texto(p.quantidades, LIMITES_PEDIDO.quantidades),
    observacoes: texto(p.observacoes, LIMITES_PEDIDO.observacoes),
  };
  if (!pedido.servico) erros.servico = "Escolha o serviço principal.";
  if (!pedido.descricao && !pedido.quantidades) erros.descricao = "Descreva o que o cliente precisa.";
  if (Object.keys(erros).length) return { ok: false, erros, passo: 2 };

  const diasBruto = Number(b.dias_link ?? DIAS_LINK_PADRAO);
  const dias_link =
    Number.isInteger(diasBruto) && diasBruto >= 1 && diasBruto <= DIAS_LINK_MAXIMO ? diasBruto : DIAS_LINK_PADRAO;

  return { ok: true, entrada: { cliente, pedido, dias_link } };
}

/**
 * O serviço digitado bate com um da tabela? Senão, a aproximação pelo texto.
 * Sem correspondência, devolve "" (a pessoa escolhe; nada de chutar um serviço).
 */
export function servicoDaTabela(servico: string): string {
  if (ehServico(servico)) return servico;
  const t = semAcento(servico.toLowerCase());
  if (!t.trim()) return "";
  const mapa: [RegExp, string][] = [
    [/itinerante/, "Podcast itinerante"],
    [/podcast.*(ao vivo|\blive\b)|(ao vivo|\blive\b).*podcast/, "Podcast ao vivo"],
    [/podcast|videocast/, "Podcast gravado"],
    [/leil/, "Leilão 360"],
    [/transmiss|ao vivo|\blive\b|streaming/, "Transmissão ao vivo"],
    [/legado|document/, "Filme de Legado"],
    [/\bshows?\b|\bdvds?\b|clipe/, "Shows/DVDs/clipes"],
    [/filme|institucional|\bmarca\b|\bvideos?\b/, "Filme de marca"],
    [/\bfoto/, "Fotografia"],
    [/recorrente|mensal|conteudo/, "Conteúdo recorrente"],
    [/consultoria|implanta|montar (um |o )?estudio/, "Consultoria de estúdio"],
    [/haras|\bsobi\b|locacao|\bespaco\b/, "Locação do Haras SOBI"],
    [/teleprompter|prompter/, "Teleprompter"],
  ];
  for (const [re, nome] of mapa) if (re.test(t)) return nome;
  return "";
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Texto do pedido para o prompt e para o resumo da oportunidade. */
export function pedidoEmTexto(cliente: ClienteDoPedido, pedido: Pedido): string {
  return [
    `cliente: ${cliente.nome}${cliente.empresa ? ` (${cliente.empresa})` : ""}`,
    cliente.cidade ? `cidade: ${cliente.cidade}` : null,
    `serviço principal: ${pedido.servico}`,
    pedido.servicos_adicionais.length ? `serviços adicionais: ${pedido.servicos_adicionais.join(", ")}` : null,
    pedido.descricao ? `o que o cliente precisa: ${pedido.descricao}` : null,
    pedido.data_periodo ? `data ou período: ${pedido.data_periodo}` : null,
    pedido.local ? `local: ${pedido.local}` : null,
    pedido.publico_objetivo ? `público e objetivo: ${pedido.publico_objetivo}` : null,
    pedido.quantidades ? `quantidades: ${pedido.quantidades}` : null,
    pedido.observacoes ? `observações da equipe: ${pedido.observacoes}` : null,
  ]
    .filter((l): l is string => Boolean(l))
    .join("\n");
}
