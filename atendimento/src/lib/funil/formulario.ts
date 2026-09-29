// Leitura e validação dos formulários do funil. Puro, testável.

import { somenteDigitos } from "../formato";
import type { EtapaFunil, Oportunidade, OrigemOportunidade } from "../tipos";
import { diaParaIso } from "./datas";
import { ehEtapa, ehOrigem, VALOR_MAXIMO } from "./etapas";

/**
 * Lê um valor em reais digitado por uma pessoa: "4800", "4.800", "4.800,50",
 * "R$ 4.800,00", "4800.5". Vazio vira null. Inválido vira NaN.
 */
export function lerValor(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : Number.NaN;
  let t = texto.replace(/r\$/i, "").replace(/\s+/g, "");
  if (!t) return null;
  if (!/^-?[\d.,]+$/.test(t)) return Number.NaN;
  if (t.includes(",")) {
    // Formato brasileiro: ponto separa milhar, vírgula separa centavos.
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // "4.800" sem vírgula: ponto de milhar.
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}

/** Valor numérico -> texto para o campo de edição ("4800" ou "4800,50"). */
export function valorParaCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return "";
  const n = Number(valor);
  const redondo = Math.abs(n - Math.round(n)) < 0.005;
  return redondo ? String(Math.round(n)) : n.toFixed(2).replace(".", ",");
}

/** Probabilidade digitada: "60", "60%". Vazio vira null. Inválido vira NaN. */
export function lerProbabilidade(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).replace("%", "").trim();
  if (!t) return null;
  if (!/^\d{1,3}$/.test(t)) return Number.NaN;
  const n = Number(t);
  return n >= 0 && n <= 100 ? n : Number.NaN;
}

export interface EntradaOportunidade {
  nome: string;
  telefone: string;
  empresa: string;
  email?: string;
  servico: string;
  origem: string;
  etapa?: string;
  valor: string;
  probabilidade: string;
  proximaAcao: string;
  /** Dia (aaaa-mm-dd) da próxima ação. */
  proximaAcaoDia: string;
  responsavel: string | null;
  mensagem?: string | null;
  dataPrevista?: string | null;
}

export type CamposNovaOportunidade = Pick<
  Oportunidade,
  | "name"
  | "phone"
  | "company"
  | "email"
  | "project_type"
  | "expected_date"
  | "message"
  | "status"
  | "source"
  | "estimated_value"
  | "probability"
  | "next_action"
  | "next_action_at"
  | "assigned_to"
>;

export type ResultadoFormulario =
  | { ok: true; campos: CamposNovaOportunidade }
  | { ok: false; erros: Record<string, string> };

export const EMPRESA_NAO_INFORMADA = "Não informada";
export const SERVICO_A_DEFINIR = "A definir";

/** Valida o formulário curto de nova oportunidade (os limites são os do banco). */
export function validarOportunidade(e: EntradaOportunidade): ResultadoFormulario {
  const erros: Record<string, string> = {};

  const nome = e.nome.trim();
  if (!nome) erros.nome = "Informe o nome.";
  else if (nome.length > 200) erros.nome = "Nome longo demais (máximo 200).";

  const telefone = e.telefone.trim();
  const digitos = somenteDigitos(telefone);
  if (digitos.length < 8) erros.telefone = "Informe o telefone com DDD.";
  else if (telefone.length > 32) erros.telefone = "Telefone longo demais.";

  const empresa = e.empresa.trim() || EMPRESA_NAO_INFORMADA;
  if (empresa.length > 200) erros.empresa = "Empresa longa demais (máximo 200).";

  const email = (e.email ?? "").trim();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    erros.email = "E-mail inválido.";
  }

  const servico = e.servico.trim() || SERVICO_A_DEFINIR;
  if (servico.length > 100) erros.servico = "Serviço longo demais (máximo 100).";

  const origem: OrigemOportunidade = ehOrigem(e.origem) ? e.origem : "outro";
  const etapa: EtapaFunil = ehEtapa(e.etapa) ? e.etapa : "new";
  if (etapa === "won" || etapa === "lost") {
    erros.etapa = "Crie a oportunidade numa etapa aberta e depois mova para Ganho ou Perdido.";
  }

  const valor = lerValor(e.valor);
  if (valor !== null && (Number.isNaN(valor) || valor < 0 || valor > VALOR_MAXIMO)) {
    erros.valor = "Valor inválido. Use só números, como 4800 ou 4.800,50.";
  }

  const probabilidade = lerProbabilidade(e.probabilidade);
  if (probabilidade !== null && Number.isNaN(probabilidade)) {
    erros.probabilidade = "A probabilidade vai de 0 a 100.";
  }

  const proximaAcao = e.proximaAcao.trim();
  if (proximaAcao.length > 500) erros.proximaAcao = "Próxima ação longa demais (máximo 500).";

  let proximaAcaoEm: string | null = null;
  if (e.proximaAcaoDia.trim()) {
    proximaAcaoEm = diaParaIso(e.proximaAcaoDia);
    if (!proximaAcaoEm) erros.proximaAcaoDia = "Data inválida.";
    else if (!proximaAcao) erros.proximaAcao = "Escreva qual é a próxima ação.";
  }

  const mensagem = (e.mensagem ?? "").trim();
  if (mensagem.length > 5000) erros.mensagem = "Texto longo demais (máximo 5000).";

  const dataPrevista = (e.dataPrevista ?? "").trim();
  if (dataPrevista && !diaParaIso(dataPrevista)) erros.dataPrevista = "Data inválida.";

  if (Object.keys(erros).length) return { ok: false, erros };

  return {
    ok: true,
    campos: {
      name: nome,
      phone: telefone,
      company: empresa,
      email: email || null,
      project_type: servico,
      expected_date: dataPrevista || null,
      message: mensagem || null,
      status: etapa,
      source: origem,
      estimated_value: valor,
      probability: probabilidade,
      next_action: proximaAcao || null,
      next_action_at: proximaAcao ? proximaAcaoEm : null,
      assigned_to: e.responsavel || null,
    },
  };
}

/** Telefones possíveis de um contato do WhatsApp (só dígitos, com e sem o 55). */
export function telefonesParaBusca(telefone: string): string[] {
  const d = somenteDigitos(telefone);
  if (d.length < 8) return [];
  const lista = new Set<string>([d]);
  if (d.length === 10 || d.length === 11) lista.add(`55${d}`);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) lista.add(d.slice(2));
  return [...lista];
}

// ------------------------------------------------------ edição (detalhe)

/** Campos do detalhe, como texto de formulário. Só entram os que a pessoa mexeu. */
export interface RascunhoOportunidade {
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
  project_type?: string;
  expected_date?: string;
  message?: string;
  source?: string;
  estimated_value?: string;
  probability?: string;
  next_action?: string;
  /** Dia (aaaa-mm-dd) da próxima ação. */
  next_action_dia?: string;
  assigned_to?: string;
  internal_notes?: string;
  lost_reason?: string;
}

export type ResultadoEdicao =
  | { ok: true; campos: Partial<Oportunidade> }
  | { ok: false; erros: Record<string, string> };

/**
 * Valida o que foi editado no detalhe e devolve só os campos a gravar.
 * A etapa não passa por aqui: ela muda pelas regras de transição.
 */
export function validarEdicao(
  rascunho: RascunhoOportunidade,
  atual: Pick<Oportunidade, "status" | "next_action" | "next_action_at">,
): ResultadoEdicao {
  const erros: Record<string, string> = {};
  const campos: Partial<Oportunidade> = {};
  const tem = (k: keyof RascunhoOportunidade) => rascunho[k] !== undefined;

  if (tem("name")) {
    const v = rascunho.name!.trim();
    if (!v) erros.name = "Informe o nome.";
    else if (v.length > 200) erros.name = "Nome longo demais (máximo 200).";
    else campos.name = v;
  }
  if (tem("company")) {
    const v = rascunho.company!.trim() || EMPRESA_NAO_INFORMADA;
    if (v.length > 200) erros.company = "Empresa longa demais (máximo 200).";
    else campos.company = v;
  }
  if (tem("phone")) {
    const v = rascunho.phone!.trim();
    if (somenteDigitos(v).length < 8) erros.phone = "Informe o telefone com DDD.";
    else if (v.length > 32) erros.phone = "Telefone longo demais.";
    else campos.phone = v;
  }
  if (tem("email")) {
    const v = rascunho.email!.trim();
    if (v && (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) erros.email = "E-mail inválido.";
    else campos.email = v || null;
  }
  if (tem("project_type")) {
    const v = rascunho.project_type!.trim() || SERVICO_A_DEFINIR;
    if (v.length > 100) erros.project_type = "Serviço longo demais (máximo 100).";
    else campos.project_type = v;
  }
  if (tem("expected_date")) {
    const v = rascunho.expected_date!.trim();
    if (v && !diaParaIso(v)) erros.expected_date = "Data inválida.";
    else campos.expected_date = v || null;
  }
  if (tem("message")) {
    const v = rascunho.message!.trim();
    if (v.length > 5000) erros.message = "Texto longo demais (máximo 5000).";
    else campos.message = v || null;
  }
  if (tem("source")) {
    if (!ehOrigem(rascunho.source)) erros.source = "Origem inválida.";
    else campos.source = rascunho.source;
  }
  if (tem("estimated_value")) {
    const v = lerValor(rascunho.estimated_value);
    if (v !== null && (Number.isNaN(v) || v < 0 || v > VALOR_MAXIMO)) {
      erros.estimated_value = "Valor inválido. Use só números, como 4800 ou 4.800,50.";
    } else campos.estimated_value = v;
  }
  if (tem("probability")) {
    const v = lerProbabilidade(rascunho.probability);
    if (v !== null && Number.isNaN(v)) erros.probability = "A probabilidade vai de 0 a 100.";
    else campos.probability = v;
  }
  if (tem("assigned_to")) campos.assigned_to = rascunho.assigned_to!.trim() || null;
  if (tem("internal_notes")) {
    const v = rascunho.internal_notes!.trim();
    if (v.length > 10000) erros.internal_notes = "Notas longas demais (máximo 10000).";
    else campos.internal_notes = v || null;
  }
  if (tem("lost_reason")) {
    const v = rascunho.lost_reason!.trim();
    if (!v && atual.status === "lost") erros.lost_reason = "Oportunidade perdida precisa de motivo.";
    else if (v.length > 500) erros.lost_reason = "Motivo longo demais (máximo 500).";
    else campos.lost_reason = v || null;
  }

  // Próxima ação e data andam juntas: data sem ação não existe.
  if (tem("next_action") || tem("next_action_dia")) {
    const acao = tem("next_action") ? rascunho.next_action!.trim() : (atual.next_action ?? "").trim();
    if (acao.length > 500) erros.next_action = "Próxima ação longa demais (máximo 500).";
    let quando: string | null = atual.next_action_at;
    if (tem("next_action_dia")) {
      const dia = rascunho.next_action_dia!.trim();
      quando = dia ? diaParaIso(dia) : null;
      if (dia && !quando) erros.next_action_dia = "Data inválida.";
    }
    if (!acao && tem("next_action_dia") && rascunho.next_action_dia!.trim()) {
      erros.next_action = "Escreva qual é a próxima ação.";
    }
    if (!erros.next_action && !erros.next_action_dia) {
      campos.next_action = acao || null;
      campos.next_action_at = acao ? quando : null;
    }
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, campos };
}
