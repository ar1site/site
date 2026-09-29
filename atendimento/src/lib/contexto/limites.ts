// Limites e tipos de arquivo do "Contexto para a IA". Puro: serve ao
// navegador e ao servidor. Espelha a migração 20260929100000_ar1_contexto.sql.

/** Bucket privado com os arquivos originais. */
export const BUCKET_CONTEXTO = "ar1-context";

/** Tamanho máximo de um arquivo (25 MB, igual ao limite do bucket). */
export const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

/** Máximo de caracteres guardados por documento (coluna `content`). */
export const LIMITE_CARACTERES = 300_000;

export const LIMITE_TITULO = 200;
export const LIMITE_NOME_ARQUIVO = 300;

export type TipoArquivo = "pdf" | "docx" | "txt" | "md" | "csv";

/** Extensão → tipo aceito pelo bucket. */
export const MIME_POR_EXTENSAO: Record<TipoArquivo, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
};

/** Valor do atributo `accept` do seletor de arquivos. */
export const ACEITA_ARQUIVOS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
  ...Object.values(MIME_POR_EXTENSAO),
].join(",");

export const AVISO_SEM_TEXTO = "Não consegui ler texto deste arquivo (parece imagem escaneada).";

export const TIPOS_ACEITOS_LEGIVEL = "PDF, Word (.docx), .txt, .md ou .csv";

/** Extensão em minúsculas, sem o ponto ("" quando não há). */
export function extensaoDe(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Descobre o tipo do arquivo. A extensão manda (o navegador costuma mandar
 * mime vazio para .md e "application/vnd.ms-excel" para .csv); sem extensão
 * conhecida, vale o mime informado. Devolve null quando o tipo não é aceito.
 */
export function tipoDoArquivo(nome: string, mime?: string | null): TipoArquivo | null {
  const ext = extensaoDe(nome);
  if (ext in MIME_POR_EXTENSAO) return ext as TipoArquivo;
  if (ext) return null; // extensão presente e não aceita (.doc, .xlsx, .png…)
  const limpo = (mime ?? "").split(";")[0].trim().toLowerCase();
  for (const [tipo, m] of Object.entries(MIME_POR_EXTENSAO)) {
    if (m === limpo) return tipo as TipoArquivo;
  }
  return null;
}

/** Nome do arquivo sem a extensão, para virar título. */
export function tituloPadrao(nomeArquivo: string): string {
  const base = nomeArquivo.trim().replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const limpo = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (limpo || nomeArquivo.trim() || "Documento").slice(0, LIMITE_TITULO);
}

/**
 * Nome seguro para o caminho no Storage: sem acentos, só letras, números,
 * ponto, hífen e sublinhado; no máximo 80 caracteres, preservando a extensão.
 */
export function nomeSeguro(nome: string): string {
  const ext = extensaoDe(nome);
  const semExt = ext ? nome.trim().slice(0, -(ext.length + 1)) : nome.trim();
  const base = semExt
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80 - (ext ? ext.length + 1 : 0));
  const final = base || "arquivo";
  return ext ? `${final}.${ext}` : final;
}

/** "12 mil caracteres", "850 caracteres", "1,5 mil caracteres". */
export function tamanhoEmCaracteres(chars: number): string {
  if (chars <= 0) return "sem texto";
  if (chars < 1000) return `${chars} caracteres`;
  const mil = chars / 1000;
  const texto = mil < 10 ? mil.toFixed(1).replace(".", ",").replace(/,0$/, "") : String(Math.round(mil));
  return `${texto} mil caracteres`;
}

/** "3,2 MB", "540 KB". */
export function tamanhoEmBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
