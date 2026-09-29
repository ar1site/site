import { describe, expect, it } from "vitest";
import { anexarFontes, filtrarFontes, separarFontes } from "@/lib/contexto/fontes";
import {
  aplicarOrcamento,
  cortarTexto,
  distribuirOrcamento,
  MARCA_CORTE,
  MINIMO_POR_DOCUMENTO,
  ORCAMENTO_BASE,
  ORCAMENTO_CLIENTE,
} from "@/lib/contexto/orcamento";

const soma = (n: number[]) => n.reduce((a, b) => a + b, 0);

describe("distribuirOrcamento", () => {
  it("usa os limites combinados", () => {
    expect(ORCAMENTO_BASE).toBe(60_000);
    expect(ORCAMENTO_CLIENTE).toBe(40_000);
    expect(MINIMO_POR_DOCUMENTO).toBe(1_500);
  });

  it("não corta nada quando tudo cabe", () => {
    expect(distribuirOrcamento([10_000, 20_000, 500], 60_000)).toEqual([10_000, 20_000, 500]);
    expect(distribuirOrcamento([], 60_000)).toEqual([]);
    expect(distribuirOrcamento([60_000], 60_000)).toEqual([60_000]);
  });

  it("divide proporcionalmente quando passa do orçamento", () => {
    const cotas = distribuirOrcamento([90_000, 30_000], 60_000);
    expect(cotas).toEqual([45_000, 15_000]);
  });

  it("garante o mínimo por documento e tira a diferença dos maiores", () => {
    const tamanhos = [200_000, 2_000, 800];
    const cotas = distribuirOrcamento(tamanhos, 60_000);
    expect(cotas[1]).toBe(1_500); // proporcional daria ~590
    expect(cotas[2]).toBe(800); // menor que o mínimo: entra inteiro
    expect(cotas[0]).toBe(60_000 - 1_500 - 800);
    expect(soma(cotas)).toBeLessThanOrEqual(60_000);
  });

  it("nunca passa do orçamento nem do tamanho do documento", () => {
    const casos: [number[], number][] = [
      [[300_000, 300_000, 300_000], 60_000],
      [[70_000, 1, 1, 1], 60_000],
      [[1_501, 1_499, 100_000, 3_000], 40_000],
      [Array.from({ length: 30 }, (_, i) => 1_000 + i * 700), 40_000],
    ];
    for (const [tamanhos, orcamento] of casos) {
      const cotas = distribuirOrcamento(tamanhos, orcamento);
      expect(soma(cotas)).toBeLessThanOrEqual(orcamento);
      cotas.forEach((c, i) => {
        expect(c).toBeLessThanOrEqual(tamanhos[i]);
        if (c > 0) expect(c).toBeGreaterThanOrEqual(Math.min(tamanhos[i], MINIMO_POR_DOCUMENTO));
      });
    }
  });

  it("quando nem os mínimos cabem, entram os mais recentes (primeiros da lista)", () => {
    const tamanhos = Array.from({ length: 50 }, () => 10_000);
    const cotas = distribuirOrcamento(tamanhos, 60_000);
    const dentro = cotas.filter((c) => c > 0).length;
    expect(dentro).toBe(40); // 60.000 / 1.500
    expect(cotas.slice(0, 40).every((c) => c === 1_500)).toBe(true);
    expect(cotas.slice(40).every((c) => c === 0)).toBe(true);
  });
});

describe("cortarTexto", () => {
  it("devolve o texto inteiro quando cabe", () => {
    expect(cortarTexto("curto", 100)).toEqual({ texto: "curto", cortado: false });
  });

  it("guarda começo e fim, marca o corte e respeita o limite", () => {
    const texto = `INICIO ${"palavra ".repeat(2_000)}FINAL`;
    const r = cortarTexto(texto, 1_500);
    expect(r.cortado).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(1_500);
    expect(r.texto.startsWith("INICIO")).toBe(true);
    expect(r.texto.endsWith("FINAL")).toBe(true);
    expect(r.texto).toContain(`\n${MARCA_CORTE}\n`);
    expect(r.texto.split(MARCA_CORTE)).toHaveLength(2);
  });

  it("não parte palavras no corte", () => {
    const texto = "palavra ".repeat(2_000).trim();
    const [antes, depois] = cortarTexto(texto, 1_500).texto.split(`\n${MARCA_CORTE}\n`);
    expect(antes.endsWith("palavra")).toBe(true);
    expect(depois.startsWith("palavra")).toBe(true);
  });
});

describe("aplicarOrcamento", () => {
  it("ignora documentos sem texto e mantém a ordem", () => {
    const r = aplicarOrcamento(
      [
        { titulo: "Novo", texto: "conteúdo novo" },
        { titulo: "Escaneado", texto: "   " },
        { titulo: "Antigo", texto: "conteúdo antigo" },
      ],
      60_000,
    );
    expect(r.documentos.map((d) => d.titulo)).toEqual(["Novo", "Antigo"]);
    expect(r.documentos.every((d) => !d.cortado)).toBe(true);
    expect(r.omitidos).toEqual([]);
  });

  it("corta os documentos grandes e avisa quais ficaram de fora", () => {
    const docs = Array.from({ length: 45 }, (_, i) => ({ titulo: `Doc ${i + 1}`, texto: "x ".repeat(5_000) }));
    const r = aplicarOrcamento(docs, 60_000);
    expect(r.documentos).toHaveLength(40);
    expect(r.documentos[0].titulo).toBe("Doc 1");
    expect(r.documentos.every((d) => d.cortado && d.texto.includes(MARCA_CORTE))).toBe(true);
    expect(r.omitidos).toEqual(["Doc 41", "Doc 42", "Doc 43", "Doc 44", "Doc 45"]);
    expect(soma(r.documentos.map((d) => d.texto.length))).toBeLessThanOrEqual(60_000);
  });
});

describe("fontes", () => {
  const titulos = ["Tabela de preços 2026", "Proposta Souza Eventos", "FAQ"];

  it("aceita só títulos de documentos enviados, sem repetir", () => {
    expect(
      filtrarFontes(["tabela de preços 2026", "### FAQ", "Documento inventado", "FAQ", "  Proposta  Souza Eventos "], titulos),
    ).toEqual(["Tabela de preços 2026", "FAQ", "Proposta Souza Eventos"]);
    expect(filtrarFontes([], titulos)).toEqual([]);
    expect(filtrarFontes(["FAQ"], [])).toEqual([]);
  });

  it("anexa e separa as fontes do rationale", () => {
    const junto = anexarFontes("O cliente pediu valores.", ["Tabela de preços 2026", "FAQ"]);
    expect(junto).toBe("O cliente pediu valores.\nFontes: Tabela de preços 2026; FAQ");
    expect(separarFontes(junto)).toEqual({
      texto: "O cliente pediu valores.",
      fontes: ["Tabela de preços 2026", "FAQ"],
    });
  });

  it("sem fontes, o rationale fica como está", () => {
    expect(anexarFontes("Só cumprimentou.", [])).toBe("Só cumprimentou.");
    expect(separarFontes("Só cumprimentou.")).toEqual({ texto: "Só cumprimentou.", fontes: [] });
    expect(separarFontes(null)).toEqual({ texto: "", fontes: [] });
  });

  it("respeita o limite da coluna (2000) sem perder as fontes", () => {
    const junto = anexarFontes("a".repeat(3_000), ["FAQ"]);
    expect(junto.length).toBeLessThanOrEqual(2_000);
    expect(separarFontes(junto).fontes).toEqual(["FAQ"]);
  });

  it("não duplica o sufixo se o modelo já escreveu as fontes no rationale", () => {
    const junto = anexarFontes("Motivo.\nFontes: FAQ", ["FAQ"]);
    expect(junto).toBe("Motivo.\nFontes: FAQ");
  });
});
