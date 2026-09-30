// Galeria de imagens reais da AR1 Films usadas nas propostas premium.
// Os arquivos ficam em public/marca/galeria/ (copiados do site). Puro, testável.

export type TagDaGaleria = "podcast" | "haras" | "leilão" | "evento" | "campo" | "estúdio" | "institucional";

export const TAGS_DA_GALERIA: readonly TagDaGaleria[] = [
  "podcast",
  "haras",
  "leilão",
  "evento",
  "campo",
  "estúdio",
  "institucional",
] as const;

export interface ImagemDaGaleria {
  /** Nome do arquivo em public/marca/galeria/. */
  arquivo: string;
  legenda: string;
  tags: TagDaGaleria[];
  /** Orientação da foto (as verticais servem melhor em colunas). */
  orientacao?: "horizontal" | "vertical";
}

export const PASTA_DA_GALERIA = "/marca/galeria";

export const GALERIA: readonly ImagemDaGaleria[] = [
  // Institucional e estúdio
  { arquivo: "ar1-films-fachada-2026-v1.webp", legenda: "Fachada da AR1 Films em Goiânia", tags: ["institucional", "estúdio"] },
  { arquivo: "glow-horizontal.webp", legenda: "Luz de estúdio", tags: ["institucional", "estúdio"] },
  { arquivo: "glow-vertical.webp", legenda: "Luz de estúdio", tags: ["institucional", "estúdio"], orientacao: "vertical" },
  { arquivo: "edit-suite.webp", legenda: "Ilha de edição da AR1", tags: ["estúdio", "institucional"] },
  { arquivo: "consultoria-pos-producao.webp", legenda: "Pós-produção", tags: ["estúdio", "institucional"] },
  { arquivo: "consultoria-hero-estudio-v1.webp", legenda: "Estúdio de podcast", tags: ["estúdio", "podcast"] },
  { arquivo: "consultoria-estudio-sobi-v1.webp", legenda: "Estúdio no Haras SOBI", tags: ["estúdio", "haras", "podcast"] },
  { arquivo: "consultoria-bastidores-estudio-v1.webp", legenda: "Bastidores do estúdio", tags: ["estúdio", "podcast"] },
  { arquivo: "consultoria-equipamento-camera-v1.webp", legenda: "Equipamento de câmera", tags: ["estúdio", "institucional"] },
  // Podcast
  { arquivo: "podcast-entrevista-v1.webp", legenda: "Entrevista em podcast", tags: ["podcast", "estúdio"] },
  { arquivo: "podcast-artista-v1.webp", legenda: "Artista no estúdio", tags: ["podcast", "estúdio"] },
  { arquivo: "podcast-bastidores-camera-v1.webp", legenda: "Câmera nos bastidores do podcast", tags: ["podcast", "estúdio"] },
  // Eventos e transmissões
  { arquivo: "evento-palco-camera.webp", legenda: "Câmera no palco do evento", tags: ["evento"] },
  { arquivo: "event-stage.webp", legenda: "Palco de evento", tags: ["evento"] },
  { arquivo: "conteudo-corporativo-palco.webp", legenda: "Conteúdo corporativo no palco", tags: ["evento", "institucional"] },
  // Leilão e campo
  { arquivo: "camera-auction.webp", legenda: "Câmera no leilão", tags: ["leilão", "campo"] },
  { arquivo: "camera-auction-vertical.webp", legenda: "Câmera no leilão", tags: ["leilão", "campo"], orientacao: "vertical" },
  { arquivo: "cattle-rays.webp", legenda: "Gado no fim da tarde", tags: ["campo", "leilão"] },
  { arquivo: "cattle-wide.webp", legenda: "Gado no pasto", tags: ["campo", "leilão"] },
  { arquivo: "hero-fields.webp", legenda: "Campo aberto", tags: ["campo", "institucional"] },
  { arquivo: "producao-campo-equipe.webp", legenda: "Equipe de produção em campo", tags: ["campo", "institucional", "leilão"] },
  // Haras SOBI
  { arquivo: "haras-vista-aerea-2026-v1.webp", legenda: "Vista aérea do Haras SOBI", tags: ["haras", "campo"] },
  { arquivo: "haras-pista-e-cavalo-2026-v1.webp", legenda: "Pista e cavalo no Haras SOBI", tags: ["haras", "campo"] },
  { arquivo: "haras-palco-externo-2026-v1.webp", legenda: "Palco externo do Haras SOBI", tags: ["haras", "evento"] },
  { arquivo: "haras-show-noturno-2026-v1.webp", legenda: "Show noturno no Haras SOBI", tags: ["haras", "evento"] },
  { arquivo: "haras-espaco-coberto-2026-v1.webp", legenda: "Área coberta do Haras SOBI", tags: ["haras", "evento"] },
  { arquivo: "haras-salao-eventos-2026-v1.webp", legenda: "Salão de eventos do Haras SOBI", tags: ["haras", "evento"] },
  { arquivo: "haras-lounge-coberto-2026-v1.webp", legenda: "Lounge coberto do Haras SOBI", tags: ["haras", "evento", "podcast"] },
  { arquivo: "haras-bosque-2026-v1.webp", legenda: "Bosque do Haras SOBI", tags: ["haras", "campo"] },
  { arquivo: "haras-lago-2026-v1.webp", legenda: "Lago do Haras SOBI", tags: ["haras", "campo"] },
];

/** Tags que melhor representam cada serviço da tabela de preços. */
export const TAGS_POR_SERVICO: Record<string, TagDaGaleria[]> = {
  "Podcast gravado": ["podcast", "estúdio"],
  "Podcast ao vivo": ["podcast", "estúdio"],
  "Podcast itinerante": ["podcast", "evento"],
  "Transmissão ao vivo": ["evento"],
  "Leilão 360": ["leilão", "campo"],
  "Filme de Legado": ["campo", "institucional"],
  "Filme de marca": ["institucional", "estúdio"],
  Fotografia: ["institucional", "campo"],
  "Shows/DVDs/clipes": ["evento", "haras"],
  "Conteúdo recorrente": ["estúdio", "institucional"],
  "Consultoria de estúdio": ["estúdio"],
  "Locação do Haras SOBI": ["haras"],
  Teleprompter: ["estúdio", "evento"],
};

export function ehTag(valor: unknown): valor is TagDaGaleria {
  return typeof valor === "string" && (TAGS_DA_GALERIA as readonly string[]).includes(valor);
}

export function ehImagemDaGaleria(arquivo: unknown): arquivo is string {
  return typeof arquivo === "string" && GALERIA.some((i) => i.arquivo === arquivo);
}

/** URL pública da imagem da galeria (relativa ao app). */
export function urlDaGaleria(arquivo: string): string {
  return `${PASTA_DA_GALERIA}/${arquivo}`;
}

/** Imagem de prévia do link (Open Graph): JPG 1200x630 gerado por scripts/gerar-og-galeria.mjs. */
export const OG_LARGURA = 1200;
export const OG_ALTURA = 630;
/** Prévia padrão quando a capa não é da galeria (foto enviada pelo cliente) ou não existe. */
export const OG_PADRAO = "hero-fields.webp";

export function urlOgDaGaleria(arquivo: string): string {
  const nome = ehImagemDaGaleria(arquivo) ? arquivo : OG_PADRAO;
  return `${PASTA_DA_GALERIA}/og/${nome.replace(/\.[^.]+$/, ".jpg")}`;
}

/** Tags que valem para um serviço (por nome da tabela ou aproximação pelo texto). */
export function tagsDoServico(servico: string | null | undefined): TagDaGaleria[] {
  const s = (servico ?? "").trim();
  if (!s) return ["institucional"];
  if (TAGS_POR_SERVICO[s]) return TAGS_POR_SERVICO[s];
  const t = s.toLowerCase();
  const achadas: TagDaGaleria[] = [];
  if (/podcast/.test(t)) achadas.push("podcast");
  if (/haras|sobi|loca/.test(t)) achadas.push("haras");
  if (/leil/.test(t)) achadas.push("leilão");
  if (/evento|show|dvd|clipe|transmiss|ao vivo|live/.test(t)) achadas.push("evento");
  if (/campo|fazenda|agro|legado|gado/.test(t)) achadas.push("campo");
  if (/est[uú]dio|consultoria|edi[cç][aã]o|conte[uú]do/.test(t)) achadas.push("estúdio");
  if (/filme|marca|institucional|foto/.test(t)) achadas.push("institucional");
  return achadas.length ? [...new Set(achadas)] : ["institucional"];
}

/**
 * Escolhe imagens por tag: primeiro as que têm mais tags em comum, depois as
 * demais (para nunca voltar vazio). Sem repetição; `quantidade` no máximo.
 */
export function escolherImagens(
  tags: readonly TagDaGaleria[],
  quantidade: number,
  opcoes: { evitar?: readonly string[]; orientacao?: "horizontal" | "vertical" } = {},
): ImagemDaGaleria[] {
  const evitar = new Set(opcoes.evitar ?? []);
  const pontuadas = GALERIA.filter((i) => !evitar.has(i.arquivo))
    .filter((i) => !opcoes.orientacao || (i.orientacao ?? "horizontal") === opcoes.orientacao)
    .map((i, indice) => ({
      imagem: i,
      indice,
      pontos: i.tags.reduce((soma, t) => soma + (tags.includes(t) ? (tags.indexOf(t) === 0 ? 2 : 1) : 0), 0),
    }))
    .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);
  return pontuadas.slice(0, Math.max(0, quantidade)).map((p) => p.imagem);
}

/** Uma imagem por tag do serviço para a capa e as seções da solução. */
export function imagensParaServico(servico: string | null | undefined, quantidade: number): ImagemDaGaleria[] {
  return escolherImagens(tagsDoServico(servico), quantidade);
}

/** Texto curto da galeria para a IA escolher (arquivo, legenda e tags). */
export function galeriaParaPrompt(): string {
  return GALERIA.map((i) => `- ${i.arquivo} — ${i.legenda} [${i.tags.join(", ")}]`).join("\n");
}
