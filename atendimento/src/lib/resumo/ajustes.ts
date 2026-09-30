// Ajustes do resumo diário (ar1_settings) e a trava de um envio por dia.
// Puro: serve ao navegador e ao servidor. Testado em tests/resumo.test.ts.

import { somenteDigitos } from "../formato";
import { diaDeBrasilia } from "./numeros";

export const CHAVE_DESTINATARIOS = "resumo.destinatarios";
export const CHAVE_ATIVO = "resumo.ativo";
export const CHAVE_ULTIMO_ENVIO = "resumo.ultimo_envio";
export const CHAVES_DO_RESUMO = [CHAVE_DESTINATARIOS, CHAVE_ATIVO, CHAVE_ULTIMO_ENVIO] as const;

/** Quem recebe quando nada foi configurado. */
export const DESTINATARIOS_PADRAO: readonly string[] = ["556281069562"];
export const MAXIMO_DE_DESTINATARIOS = 5;

/** Mesmo formato exigido por ar1_wa_contacts.phone e ar1_wa_outbox.phone. */
const TELEFONE = /^[0-9]{8,20}$/;

/**
 * Deixa o telefone só com dígitos e com o DDI do Brasil quando vier só com
 * DDD ("62 98106-9562" -> "5562981069562"). Número que começa com "+" já
 * traz o DDI e fica como está. null quando não é telefone.
 */
export function normalizarTelefone(valor: unknown): string | null {
  const comDDI = typeof valor === "string" && valor.trim().startsWith("+");
  let d = somenteDigitos(valor).replace(/^0+/, "");
  if (!comDDI && (d.length === 10 || d.length === 11)) d = `55${d}`;
  return TELEFONE.test(d) ? d : null;
}

/**
 * Lê ar1_settings['resumo.destinatarios']. Chave ausente = padrão. Lista
 * vazia gravada de propósito = ninguém recebe.
 */
export function lerDestinatarios(valor: unknown): string[] {
  if (valor === undefined || valor === null) return [...DESTINATARIOS_PADRAO];
  if (!Array.isArray(valor)) return [...DESTINATARIOS_PADRAO];
  const lista: string[] = [];
  for (const item of valor) {
    if (typeof item !== "string" && typeof item !== "number") continue;
    const telefone = normalizarTelefone(item);
    if (telefone && !lista.includes(telefone)) lista.push(telefone);
  }
  return lista.slice(0, MAXIMO_DE_DESTINATARIOS);
}

/** Lê ar1_settings['resumo.ativo']. Só desliga com false explícito. */
export function lerAtivo(valor: unknown): boolean {
  return !(valor === false || valor === "false" || valor === 0);
}

export interface UltimoEnvio {
  /** Dia do envio em Brasília, AAAA-MM-DD. */
  dia: string;
  enviado_em: string;
  destinatarios: string[];
  /** "cron", "interno" ou "equipe". */
  origem: string;
}

export function lerUltimoEnvio(valor: unknown): UltimoEnvio | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (typeof v.dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.dia)) return null;
  return {
    dia: v.dia,
    enviado_em: typeof v.enviado_em === "string" ? v.enviado_em : "",
    destinatarios: Array.isArray(v.destinatarios)
      ? v.destinatarios.filter((d): d is string => typeof d === "string")
      : [],
    origem: typeof v.origem === "string" ? v.origem : "",
  };
}

export function jaEnviouHoje(ultimo: UltimoEnvio | null, agora: Date): boolean {
  return ultimo !== null && ultimo.dia === diaDeBrasilia(agora);
}

export type MotivoDeNaoEnviar = "desligado" | "sem_destinatarios" | "ja_enviado";

export type Decisao =
  | { enviar: true }
  | { enviar: false; motivo: MotivoDeNaoEnviar; mensagem: string };

/**
 * O resumo sai agora? Não sai desligado, sem destinatário, nem duas vezes no
 * mesmo dia. `forcar` (só o botão "Enviar agora", com sessão de equipe) passa
 * por cima do desligado e da trava do dia, nunca da falta de destinatário.
 */
export function decidirEnvio(entrada: {
  ativo: boolean;
  destinatarios: readonly string[];
  ultimoEnvio: UltimoEnvio | null;
  agora: Date;
  forcar?: boolean;
}): Decisao {
  if (entrada.destinatarios.length === 0) {
    return {
      enviar: false,
      motivo: "sem_destinatarios",
      mensagem: "Nenhum telefone cadastrado para receber o resumo. Cadastre em Ajustes → Resumo diário.",
    };
  }
  if (entrada.forcar) return { enviar: true };
  if (!entrada.ativo) {
    return { enviar: false, motivo: "desligado", mensagem: "O resumo diário está desligado em Ajustes." };
  }
  if (jaEnviouHoje(entrada.ultimoEnvio, entrada.agora)) {
    return { enviar: false, motivo: "ja_enviado", mensagem: "O resumo de hoje já foi enviado." };
  }
  return { enviar: true };
}

export type TelefonesLidos = { ok: true; telefones: string[] } | { ok: false; erro: string };

/** Lê o campo de telefones da tela (um por linha, ou separados por vírgula). */
export function lerTelefonesDigitados(texto: string): TelefonesLidos {
  const partes = texto
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const telefones: string[] = [];
  for (const parte of partes) {
    const telefone = normalizarTelefone(parte);
    if (!telefone) return { ok: false, erro: `"${parte}" não parece um telefone. Use DDD + número, como 62 98106-9562.` };
    if (!telefones.includes(telefone)) telefones.push(telefone);
  }
  if (telefones.length > MAXIMO_DE_DESTINATARIOS) {
    return { ok: false, erro: `No máximo ${MAXIMO_DE_DESTINATARIOS} telefones.` };
  }
  return { ok: true, telefones };
}
