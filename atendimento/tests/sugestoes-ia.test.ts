import { describe, expect, it } from "vitest";
import { z } from "zod";
import { montarContexto } from "@/lib/analise/contexto";
import { esquemaAnalise, oportunidadeDaAnalise } from "@/lib/analise/executar";
import { esquemaOportunidadeIA } from "@/lib/analise/oportunidade-esquema";
import {
  lerOportunidadeIA,
  normalizarOportunidadeIA,
  temSugestao,
  textoNotasIA,
  textoProximaAcao,
} from "@/lib/analise/oportunidade";
import { camposIniciaisDaIA, sugestoesParaOportunidade, type EstadoComercial } from "@/lib/funil/sugestoes";
import type { OportunidadeIA } from "@/lib/tipos";

const AGORA = new Date("2026-09-29T15:00:00.000Z");

const analiseValida = {
  kind: "lead",
  service: "Gravação de podcast",
  urgency: "media",
  summary: "Quer gravar um podcast.",
  extracted: { nome: null, empresa: null, cidade: null, data_prevista: null, orcamento_estimado: null, detalhes: null },
  reply: "Olá!",
  rationale: "Pediu preço.",
  fontes: [],
  oportunidade: {
    etapa_sugerida: "proposal",
    valor_estimado: 4800,
    probabilidade: 60,
    proxima_acao: "enviar proposta",
    proxima_acao_em: "2026-10-02T18:00:00-03:00",
    motivo: "Pediu orçamento; valor da tabela de preços.",
  },
};

describe("esquema da análise com `oportunidade`", () => {
  const esquema = esquemaAnalise(["Gravação de podcast"]);

  it("aceita a leitura comercial completa", () => {
    expect(esquema.safeParse(analiseValida).success).toBe(true);
  });

  it("aceita todos os campos nulos (motivo continua texto)", () => {
    const r = esquema.safeParse({
      ...analiseValida,
      oportunidade: {
        etapa_sugerida: null,
        valor_estimado: null,
        probabilidade: null,
        proxima_acao: null,
        proxima_acao_em: null,
        motivo: "",
      },
    });
    expect(r.success).toBe(true);
  });

  it("o campo é obrigatório", () => {
    const sem: Record<string, unknown> = { ...analiseValida };
    delete sem.oportunidade;
    expect(esquema.safeParse(sem).success).toBe(false);
    expect(esquema.safeParse({ ...analiseValida, oportunidade: null }).success).toBe(false);
  });

  it("recusa etapa fora da lista, valor em texto e campo faltando", () => {
    const o = analiseValida.oportunidade;
    expect(esquema.safeParse({ ...analiseValida, oportunidade: { ...o, etapa_sugerida: "fechado" } }).success).toBe(false);
    expect(esquema.safeParse({ ...analiseValida, oportunidade: { ...o, valor_estimado: "4800" } }).success).toBe(false);
    const semMotivo: Record<string, unknown> = { ...o };
    delete semMotivo.motivo;
    expect(esquema.safeParse({ ...analiseValida, oportunidade: semMotivo }).success).toBe(false);
  });

  it("gera JSON Schema estrito: tudo obrigatório, sem propriedades extras, sem limites numéricos", () => {
    const js = z.toJSONSchema(esquema, { target: "draft-7" }) as unknown as {
      required: string[];
      properties: {
        oportunidade: {
          type: string;
          required: string[];
          additionalProperties: boolean;
          properties: Record<string, Record<string, unknown>>;
        };
      };
    };
    expect(js.required).toContain("oportunidade");
    const o = js.properties.oportunidade;
    expect(o.type).toBe("object");
    expect(o.additionalProperties).toBe(false);
    expect([...o.required].sort()).toEqual(
      ["etapa_sugerida", "motivo", "probabilidade", "proxima_acao", "proxima_acao_em", "valor_estimado"].sort(),
    );
    const texto = JSON.stringify(o);
    expect(texto).not.toContain("minimum");
    expect(texto).not.toContain("maximum");
    for (const etapa of ["new", "qualified", "contacting", "proposal", "negotiating", "won", "lost"]) {
      expect(texto).toContain(`"${etapa}"`);
    }
  });

  it("o esquema isolado bate com o da análise", () => {
    expect(esquemaOportunidadeIA.safeParse(analiseValida.oportunidade).success).toBe(true);
  });
});

describe("normalizarOportunidadeIA (limites no código)", () => {
  it("mantém o que é válido e normaliza a data", () => {
    expect(normalizarOportunidadeIA(analiseValida.oportunidade as never, AGORA.toISOString())).toEqual({
      etapa_sugerida: "proposal",
      valor_estimado: 4800,
      probabilidade: 60,
      proxima_acao: "enviar proposta",
      proxima_acao_em: "2026-10-02T21:00:00.000Z",
      motivo: "Pediu orçamento; valor da tabela de preços.",
      analisada_em: AGORA.toISOString(),
    });
  });

  it("limita a probabilidade a 0–100 e arredonda", () => {
    const base = { ...analiseValida.oportunidade } as never as Parameters<typeof normalizarOportunidadeIA>[0];
    expect(normalizarOportunidadeIA({ ...base!, probabilidade: 140 }).probabilidade).toBe(100);
    expect(normalizarOportunidadeIA({ ...base!, probabilidade: -3 }).probabilidade).toBe(0);
    expect(normalizarOportunidadeIA({ ...base!, probabilidade: 62.6 }).probabilidade).toBe(63);
  });

  it("descarta valor zero, negativo ou absurdo", () => {
    const base = { ...analiseValida.oportunidade } as never as Parameters<typeof normalizarOportunidadeIA>[0];
    expect(normalizarOportunidadeIA({ ...base!, valor_estimado: 0 }).valor_estimado).toBeNull();
    expect(normalizarOportunidadeIA({ ...base!, valor_estimado: -100 }).valor_estimado).toBeNull();
    expect(normalizarOportunidadeIA({ ...base!, valor_estimado: 1e13 }).valor_estimado).toBeNull();
    expect(normalizarOportunidadeIA({ ...base!, valor_estimado: 4800.456 }).valor_estimado).toBe(4800.46);
  });

  it("data sem ação é descartada; data ilegível vira nula", () => {
    const base = { ...analiseValida.oportunidade } as never as Parameters<typeof normalizarOportunidadeIA>[0];
    expect(normalizarOportunidadeIA({ ...base!, proxima_acao: "  " }).proxima_acao_em).toBeNull();
    expect(normalizarOportunidadeIA({ ...base!, proxima_acao: "  " }).proxima_acao).toBeNull();
    expect(normalizarOportunidadeIA({ ...base!, proxima_acao_em: "semana que vem" }).proxima_acao_em).toBeNull();
  });

  it("corta textos longos nos limites do banco", () => {
    const base = { ...analiseValida.oportunidade } as never as Parameters<typeof normalizarOportunidadeIA>[0];
    const r = normalizarOportunidadeIA({ ...base!, proxima_acao: "a".repeat(900), motivo: "m".repeat(900) });
    expect(r.proxima_acao!.length).toBeLessThanOrEqual(500);
    expect(r.motivo.length).toBeLessThanOrEqual(500);
  });

  it("nulo ou ausente vira leitura vazia", () => {
    const r = normalizarOportunidadeIA(null);
    expect(temSugestao(r)).toBe(false);
    expect(r.motivo).toBe("");
  });
});

describe("oportunidadeDaAnalise (regras do código)", () => {
  it("spam, pessoal e fornecedor não geram sugestão comercial", () => {
    for (const kind of ["spam", "pessoal", "fornecedor"] as const) {
      const r = oportunidadeDaAnalise({ kind, oportunidade: analiseValida.oportunidade as never }, AGORA);
      expect(temSugestao(r)).toBe(false);
      expect(r.etapa_sugerida).toBeNull();
      expect(r.valor_estimado).toBeNull();
    }
  });

  it("lead e cliente mantêm a sugestão", () => {
    const r = oportunidadeDaAnalise({ kind: "lead", oportunidade: analiseValida.oportunidade as never }, AGORA);
    expect(r.etapa_sugerida).toBe("proposal");
    expect(r.analisada_em).toBe(AGORA.toISOString());
  });
});

describe("lerOportunidadeIA (o que está guardado em ai_extracted)", () => {
  it("lê a chave oportunidade", () => {
    const lida = lerOportunidadeIA({ nome: "Maria", oportunidade: analiseValida.oportunidade });
    expect(lida?.etapa_sugerida).toBe("proposal");
    expect(lida?.valor_estimado).toBe(4800);
  });

  it("tolera ausência, lixo e análise antiga (sem a chave)", () => {
    expect(lerOportunidadeIA(null)).toBeNull();
    expect(lerOportunidadeIA({})).toBeNull();
    expect(lerOportunidadeIA({ nome: "Maria" })).toBeNull();
    expect(lerOportunidadeIA({ oportunidade: "texto" })).toBeNull();
    expect(lerOportunidadeIA({ oportunidade: { etapa_sugerida: "xyz", valor_estimado: "4800" } })).toBeNull();
  });
});

describe("sugestoesParaOportunidade (linhas com Aceitar)", () => {
  const ia: OportunidadeIA = {
    etapa_sugerida: "proposal",
    valor_estimado: 4800,
    probabilidade: 60,
    proxima_acao: "enviar proposta",
    proxima_acao_em: "2026-10-02T21:00:00.000Z",
    motivo: "Pediu orçamento.",
  };
  const atual: EstadoComercial = {
    status: "contacting",
    estimated_value: null,
    probability: null,
    next_action: null,
    next_action_at: null,
  };

  it("gera uma linha por campo, com o texto pedido", () => {
    const linhas = sugestoesParaOportunidade(ia, atual, AGORA.getTime());
    expect(linhas.map((l) => l.texto)).toEqual([
      "IA sugere mover para Proposta",
      "IA sugere valor de R$ 4.800",
      "IA sugere probabilidade de 60%",
      "IA sugere próxima ação: enviar proposta até 02/10",
    ]);
  });

  it("cada linha altera só o próprio campo", () => {
    const porCampo = Object.fromEntries(
      sugestoesParaOportunidade(ia, atual, AGORA.getTime()).map((l) => [l.campo, l]),
    );
    expect(porCampo.valor.campos).toEqual({ estimated_value: 4800 });
    expect(porCampo.probabilidade.campos).toEqual({ probability: 60 });
    expect(porCampo.proxima_acao.campos).toEqual({
      next_action: "enviar proposta",
      next_action_at: "2026-10-02T21:00:00.000Z",
    });
    // Etapa não é gravada direto: passa pelas regras de transição.
    expect(porCampo.etapa.campos).toEqual({});
    expect(porCampo.etapa.etapa).toBe("proposal");
  });

  it("some a linha do que já está aplicado", () => {
    const linhas = sugestoesParaOportunidade(
      ia,
      {
        status: "proposal",
        estimated_value: 4800,
        probability: 60,
        next_action: "Enviar proposta",
        next_action_at: "2026-10-02T21:00:00.000Z",
      },
      AGORA.getTime(),
    );
    expect(linhas).toEqual([]);
  });

  it("valor que chega como texto do banco conta como igual", () => {
    const linhas = sugestoesParaOportunidade(
      { ...ia, etapa_sugerida: null, probabilidade: null, proxima_acao: null, proxima_acao_em: null },
      { ...atual, estimated_value: "4800.00" as unknown as number },
      AGORA.getTime(),
    );
    expect(linhas).toEqual([]);
  });

  it("campos nulos da IA não viram sugestão", () => {
    const linhas = sugestoesParaOportunidade(
      { ...ia, valor_estimado: null, probabilidade: null },
      atual,
      AGORA.getTime(),
    );
    expect(linhas.map((l) => l.campo)).toEqual(["etapa", "proxima_acao"]);
  });

  it("ação sem data sugerida não apaga a data que a equipe marcou", () => {
    const [linha] = sugestoesParaOportunidade(
      { ...ia, etapa_sugerida: null, valor_estimado: null, probabilidade: null, proxima_acao: "ligar", proxima_acao_em: null },
      { ...atual, next_action: "enviar proposta", next_action_at: "2026-10-02T21:00:00.000Z" },
      AGORA.getTime(),
    );
    expect(linha.texto).toBe("IA sugere próxima ação: ligar");
    expect(linha.campos).toEqual({ next_action: "ligar" });
  });

  it("sugere Ganho e Perdido só como linha (a tela pede valor ou motivo)", () => {
    const ganho = sugestoesParaOportunidade({ ...ia, etapa_sugerida: "won" }, atual, AGORA.getTime())[0];
    expect(ganho.texto).toBe("IA sugere mover para Ganho");
    expect(ganho.campos).toEqual({});
    const perdido = sugestoesParaOportunidade({ ...ia, etapa_sugerida: "lost" }, atual, AGORA.getTime())[0];
    expect(perdido.texto).toBe("IA sugere mover para Perdido");
  });

  it("oportunidade fechada não recebe sugestão; sem leitura, lista vazia", () => {
    expect(sugestoesParaOportunidade(ia, { ...atual, status: "won" }, AGORA.getTime())).toEqual([]);
    expect(sugestoesParaOportunidade(ia, { ...atual, status: "lost" }, AGORA.getTime())).toEqual([]);
    expect(sugestoesParaOportunidade(null, atual, AGORA.getTime())).toEqual([]);
  });

  it("preenche o formulário de criar oportunidade", () => {
    expect(camposIniciaisDaIA(ia)).toEqual({
      estimated_value: 4800,
      probability: 60,
      next_action: "enviar proposta",
      next_action_at: "2026-10-02T21:00:00.000Z",
    });
    expect(camposIniciaisDaIA(null)).toEqual({
      estimated_value: null,
      probability: null,
      next_action: null,
      next_action_at: null,
    });
  });
});

describe("textos da leitura da IA", () => {
  it("monta a próxima ação com a data", () => {
    expect(textoProximaAcao("enviar proposta", "2026-10-02T21:00:00.000Z", AGORA.getTime())).toBe(
      "enviar proposta até 02/10",
    );
    expect(textoProximaAcao("ligar", null, AGORA.getTime())).toBe("ligar");
    expect(textoProximaAcao(null, null, AGORA.getTime())).toBe("");
  });

  it("ai_notes leva a data, o resumo, as sugestões e o motivo, dentro de 2000 caracteres", () => {
    const texto = textoNotasIA({
      resumo: "Quer gravar um podcast em outubro.",
      oportunidade: normalizarOportunidadeIA(analiseValida.oportunidade as never),
      agora: AGORA,
    });
    expect(texto).toContain("Leitura da IA em 29/09/2026 12:00.");
    expect(texto).toContain("Quer gravar um podcast em outubro.");
    expect(texto).toContain(
      "Sugestões: etapa Proposta; valor R$ 4.800; probabilidade 60%; próxima ação: enviar proposta até 02/10.",
    );
    expect(texto).toContain("Motivo: Pediu orçamento; valor da tabela de preços.");

    const longo = textoNotasIA({
      resumo: "r".repeat(3000),
      oportunidade: normalizarOportunidadeIA(analiseValida.oportunidade as never),
      agora: AGORA,
    });
    expect(longo.length).toBeLessThanOrEqual(2000);
  });
});

describe("prompt da análise com o funil", () => {
  const contato = { phone: "5562999998888", wa_name: "Maria", display_name: null, company: null, notes: null };
  const mensagens = [
    { direction: "in" as const, sent_by: "contato" as const, kind: "text" as const, body: "Quanto custa?", media_name: null, transcript: null, sent_at: "2026-09-29T12:00:00.000Z" },
  ];

  it("explica o campo oportunidade e que são só sugestões", () => {
    const c = montarContexto({ contato, mensagens, instrucoes: "", servicos: [], agora: AGORA });
    expect(c.system).toContain("- oportunidade:");
    expect(c.system).toContain("São SUGESTÕES internas");
    expect(c.system).toContain("Sem base, use null: não chute.");
    expect(c.system).toContain("etapa_sugerida");
    expect(c.user).not.toContain("<oportunidade_atual>");
  });

  it("mostra a oportunidade atual quando a conversa está ligada a uma", () => {
    const c = montarContexto({
      contato,
      mensagens,
      instrucoes: "",
      servicos: [],
      agora: AGORA,
      oportunidadeAtual: {
        status: "proposal",
        estimated_value: 4800,
        probability: 60,
        next_action: "enviar proposta",
        next_action_at: "2026-10-02T21:00:00.000Z",
        project_type: "Gravação de podcast",
      },
    });
    expect(c.user).toContain("<oportunidade_atual>");
    expect(c.user).toContain("etapa atual: proposal (Proposta)");
    expect(c.user).toContain("valor estimado: R$ 4.800");
    expect(c.user).toContain("próxima ação: enviar proposta até 02/10");
  });

  it("a leitura comercial anterior não volta para o prompt", () => {
    const c = montarContexto({
      contato,
      mensagens,
      instrucoes: "",
      servicos: [],
      agora: AGORA,
      extraidoAnterior: {
        cidade: "Goiânia",
        oportunidade: normalizarOportunidadeIA(analiseValida.oportunidade as never),
      },
    });
    expect(c.user).toContain("<dados_extraidos_anteriormente>");
    expect(c.user).toContain("Goiânia");
    expect(c.user).not.toContain("etapa_sugerida");
  });
});
