import { describe, expect, it } from "vitest";
import { z } from "zod";
import { esquemaAnalise } from "@/lib/analise/executar";

const valida = {
  kind: "lead",
  service: "Gravação de podcast",
  urgency: "media",
  summary: "Quer gravar um podcast.",
  extracted: { nome: null, empresa: null, cidade: null, data_prevista: null, orcamento_estimado: null, detalhes: null },
  reply: "Olá!",
  rationale: "Pediu preço.",
  fontes: ["Tabela de preços 2026"],
};

describe("esquemaAnalise", () => {
  const esquema = esquemaAnalise(["Gravação de podcast"]);

  it("exige o campo fontes (lista de títulos, pode ser vazia)", () => {
    expect(esquema.safeParse(valida).success).toBe(true);
    expect(esquema.safeParse({ ...valida, fontes: [] }).success).toBe(true);
    const semFontes: Record<string, unknown> = { ...valida };
    delete semFontes.fontes;
    expect(esquema.safeParse(semFontes).success).toBe(false);
    expect(esquema.safeParse({ ...valida, fontes: "FAQ" }).success).toBe(false);
  });

  it("gera JSON Schema estrito com fontes obrigatório", () => {
    const js = z.toJSONSchema(esquema, { target: "draft-7" }) as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { type?: string; items?: { type?: string } }>;
    };
    expect(js.required).toContain("fontes");
    expect(js.additionalProperties).toBe(false);
    expect(js.properties.fontes).toMatchObject({ type: "array", items: { type: "string" } });
  });
});
