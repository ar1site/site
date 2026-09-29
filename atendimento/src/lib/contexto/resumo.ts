// Transforma a linha do banco no item da lista (sem o conteúdo inteiro). Puro.

import type { DocContexto, DocContextoResumo } from "../tipos";

export const TAMANHO_PREVIA = 200;

/** Colunas lidas do banco (tudo, inclusive o conteúdo, para medir e fazer a prévia). */
export const COLUNAS_DOCUMENTO =
  "id, scope, contact_id, title, kind, content, content_truncated, file_path, file_name, file_mime, file_size, active, created_by, created_at, updated_at";

export function previaDe(texto: string, tamanho = TAMANHO_PREVIA): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= tamanho) return limpo;
  return `${limpo.slice(0, tamanho).trimEnd()}…`;
}

export function resumirDocumento(doc: DocContexto): DocContextoResumo {
  const { content, ...resto } = doc;
  const texto = content ?? "";
  return { ...resto, chars: texto.length, previa: previaDe(texto) };
}
