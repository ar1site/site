import "server-only";

// Extrai o texto de um arquivo de contexto (PDF, Word, texto puro).
// Só servidor: usa unpdf (PDF.js para serverless) e mammoth (DOCX).

import mammoth from "mammoth";
import { extractText } from "unpdf";
import { LIMITE_CARACTERES, tipoDoArquivo, type TipoArquivo } from "./limites";

export interface TextoExtraido {
  texto: string;
  /** O texto passava do limite e foi cortado. */
  truncado: boolean;
  /** Só para PDF. */
  paginas?: number;
}

export class ErroExtracao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroExtracao";
  }
}

/**
 * Limpa o texto: tira bytes nulos e caracteres de controle, unifica quebras
 * de linha, junta espaços repetidos e limita linhas em branco seguidas.
 */
export function normalizarTexto(bruto: string): string {
  return bruto
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[  -​  　]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Corta no limite sem partir um par substituto (emoji) ao meio. */
export function limitarTexto(
  texto: string,
  limite = LIMITE_CARACTERES,
): { texto: string; truncado: boolean } {
  if (texto.length <= limite) return { texto, truncado: false };
  let fim = limite;
  const ultimo = texto.charCodeAt(fim - 1);
  if (ultimo >= 0xd800 && ultimo <= 0xdbff) fim -= 1;
  return { texto: texto.slice(0, fim).trimEnd(), truncado: true };
}

/**
 * Bytes → texto. UTF-8 quando válido (com ou sem BOM), UTF-16 quando há BOM,
 * senão latin1 (Windows-1252), comum em arquivos antigos do Windows.
 */
export function decodificarTexto(bytes: Uint8Array): string {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function finalizar(bruto: string, paginas?: number): TextoExtraido {
  const { texto, truncado } = limitarTexto(normalizarTexto(bruto));
  return paginas === undefined ? { texto, truncado } : { texto, truncado, paginas };
}

async function extrairPdf(bytes: Uint8Array): Promise<TextoExtraido> {
  try {
    // Cópia: o PDF.js toma posse do buffer que recebe. Passando os bytes (e não
    // um documento já aberto), o unpdf abre e fecha o documento por conta própria.
    const { totalPages, text } = await extractText(new Uint8Array(bytes), { mergePages: false });
    return finalizar(text.join("\n\n"), totalPages);
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    if (nome === "PasswordException") {
      throw new ErroExtracao("Este PDF está protegido por senha. Envie uma versão sem senha.");
    }
    throw new ErroExtracao("Não consegui abrir este PDF. O arquivo pode estar corrompido.");
  }
}

async function extrairDocx(bytes: Uint8Array): Promise<TextoExtraido> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return finalizar(value);
  } catch {
    throw new ErroExtracao(
      "Não consegui abrir este documento do Word. Confira se é um .docx (o formato antigo .doc não é aceito).",
    );
  }
}

/**
 * Extrai o texto de um arquivo. PDF escaneado (sem camada de texto) não é
 * erro: volta texto vazio e a interface avisa. Lança ErroExtracao quando o
 * arquivo não abre ou o tipo não é aceito.
 */
export async function extrairTexto(
  dados: Uint8Array | ArrayBuffer,
  arquivo: { nome: string; mime?: string | null },
): Promise<TextoExtraido> {
  const bytes = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  const tipo: TipoArquivo | null = tipoDoArquivo(arquivo.nome, arquivo.mime);
  switch (tipo) {
    case "pdf":
      return extrairPdf(bytes);
    case "docx":
      return extrairDocx(bytes);
    case "txt":
    case "md":
    case "csv":
      return finalizar(decodificarTexto(bytes));
    default:
      throw new ErroExtracao("Tipo de arquivo não aceito.");
  }
}
