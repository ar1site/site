// Regra dura da proposta: um valor só entra se estiver ESCRITO em algum lugar
// (documento, contexto do cliente, conversa, observações) ou for o valor
// estimado da oportunidade. Aqui ficam a leitura dos números de um texto e a
// conferência. Puro, testável.

/** Datas, horas, telefones e afins: números que não são dinheiro. */
const NAO_SAO_VALORES: readonly RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/g, // 2026-10-24, 2026-10-24T18:00
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, // 24/10, 24/10/2026
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // 14:30
  /\b\d{1,2}\s?h(?:\d{2})?\b/gi, // 14h, 14h30, 9 h
  /\d+(?:[.,]\d+)?\s?%/g, // 50%, 12,5 %
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, // CNPJ
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, // CPF
  /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, // telefones: (62) 98125-2338, 62 9835-4354
  /\b\d{8,}\b/g, // sequências longas (telefone sem pontuação, protocolo)
];

/** "4.800", "4.800,50", "4800", "4800,5", "4800.50" -> número. null quando não é número. */
function lerNumero(texto: string): number | null {
  let t = texto;
  if (t.includes(",")) {
    // Formato brasileiro: ponto separa milhar, vírgula separa centavos.
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Todos os números que podem ser um valor em dinheiro dentro de um texto.
 * Entende "R$ 4.800,00", "4800", "4,8 mil", "5 mil" e "1,2 milhão".
 */
export function numerosDoTexto(texto: string): number[] {
  let limpo = ` ${texto} `;
  for (const padrao of NAO_SAO_VALORES) limpo = limpo.replace(padrao, " ");

  const achados = new Set<number>();
  const padrao = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(?:mil(?:h[õo]es|h[ãa]o)?|k)\b)?/gi;
  for (const m of limpo.matchAll(padrao)) {
    const n = lerNumero(m[1]);
    if (n === null) continue;
    const sufixo = (m[2] ?? "").trim().toLowerCase();
    if (!sufixo) achados.add(n);
    else if (sufixo === "mil" || sufixo === "k") achados.add(Math.round(n * 1000 * 100) / 100);
    else achados.add(Math.round(n * 1_000_000 * 100) / 100);
  }
  return [...achados];
}

function iguais(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export interface BaseDosValores {
  /** Textos onde o valor pode estar escrito (documentos, conversa, observações). */
  textos: readonly string[];
  /** ar1_quote_requests.estimated_value */
  valorDaOportunidade: number | null;
}

/**
 * O valor tem base? Só quando é o valor estimado da oportunidade ou quando o
 * mesmo número aparece escrito em algum dos textos.
 */
export function valorTemBase(valor: number, base: BaseDosValores): boolean {
  if (!Number.isFinite(valor) || valor <= 0) return false;
  if (base.valorDaOportunidade !== null && iguais(valor, base.valorDaOportunidade)) return true;
  return base.textos.some((t) => numerosDoTexto(t).some((n) => iguais(n, valor)));
}
