// Fontes (títulos dos documentos usados pela IA) guardadas no fim do
// `rationale` da sugestão, na forma "\nFontes: A; B". Puro, testável.

const PREFIXO = "Fontes: ";
const SEPARADOR = "; ";

function chave(titulo: string): string {
  return titulo.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fica só com as fontes que correspondem a documentos realmente enviados
 * (comparação sem diferenciar maiúsculas), sem repetir, com o título oficial.
 */
export function filtrarFontes(fontes: readonly string[], titulosDisponiveis: readonly string[]): string[] {
  const oficiais = new Map<string, string>();
  for (const t of titulosDisponiveis) {
    const k = chave(t);
    if (k && !oficiais.has(k)) oficiais.set(k, t.replace(/\s+/g, " ").trim());
  }
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const f of fontes) {
    if (typeof f !== "string") continue;
    const k = chave(f.replace(/^#+\s*/, ""));
    const oficial = oficiais.get(k);
    if (!oficial || vistos.has(k)) continue;
    vistos.add(k);
    saida.push(oficial);
  }
  return saida;
}

/** Junta as fontes ao fim do rationale, respeitando o limite da coluna. */
export function anexarFontes(rationale: string, fontes: readonly string[], limite = 2000): string {
  const base = separarFontes(rationale).texto;
  const titulos = fontes.map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (titulos.length === 0) return base.slice(0, limite);

  let sufixo = `\n${PREFIXO}${titulos.join(SEPARADOR)}`;
  const tetoSufixo = Math.min(600, Math.floor(limite / 2));
  if (sufixo.length > tetoSufixo) sufixo = `${sufixo.slice(0, tetoSufixo - 1).trimEnd()}…`;
  return `${base.slice(0, limite - sufixo.length).trimEnd()}${sufixo}`;
}

/** Separa o texto do rationale das fontes anexadas por `anexarFontes`. */
export function separarFontes(rationale: string | null | undefined): { texto: string; fontes: string[] } {
  const bruto = (rationale ?? "").trim();
  const m = /(?:^|\n)Fontes: ([^\n]+)$/.exec(bruto);
  if (!m) return { texto: bruto, fontes: [] };
  const fontes = m[1]
    .split(SEPARADOR)
    .map((f) => f.trim())
    .filter(Boolean);
  return { texto: bruto.slice(0, m.index).trim(), fontes };
}
