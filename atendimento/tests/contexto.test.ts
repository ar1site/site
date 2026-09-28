import { describe, expect, it } from "vitest";
import { descreverMensagem, LIMITE_MENSAGENS, montarContexto } from "@/lib/analise/contexto";
import type { Mensagem } from "@/lib/tipos";

type M = Parameters<typeof descreverMensagem>[0];

function msg(parcial: Partial<M> & { direction: "in" | "out" }): M {
  return {
    sent_by: parcial.direction === "in" ? "contato" : "celular",
    kind: "text",
    body: null,
    media_name: null,
    transcript: null,
    sent_at: "2026-09-28T12:00:00.000Z",
    ...parcial,
  };
}

const contato = {
  phone: "5562999998888",
  wa_name: "Maria Souza",
  display_name: null,
  company: null,
  notes: null,
};

describe("descreverMensagem", () => {
  it("rotula mídias sem conteúdo textual", () => {
    expect(descreverMensagem(msg({ direction: "in", kind: "audio" }))).toBe("[áudio sem transcrição]");
    expect(descreverMensagem(msg({ direction: "in", kind: "audio", transcript: "oi" }))).toBe("[áudio transcrito] oi");
    expect(descreverMensagem(msg({ direction: "in", kind: "image", body: "palco" }))).toBe("[imagem: palco]");
    expect(descreverMensagem(msg({ direction: "in", kind: "image" }))).toBe("[imagem sem legenda]");
    expect(descreverMensagem(msg({ direction: "in", kind: "document", media_name: "briefing.pdf" }))).toBe("[documento: briefing.pdf]");
    expect(descreverMensagem(msg({ direction: "in", kind: "sticker" }))).toBe("[figurinha]");
    expect(descreverMensagem(msg({ direction: "in", kind: "text", body: "Oi" }))).toBe("Oi");
  });
});

describe("montarContexto", () => {
  it("inclui instruções, serviços, contato e conversa rotulada", () => {
    const c = montarContexto({
      contato,
      mensagens: [
        msg({ direction: "in", body: "Oi, quero um podcast" }),
        msg({ direction: "out", body: "Bom dia!", sent_by: "celular" }),
        msg({ direction: "in", kind: "audio" }),
      ],
      instrucoes: "Assine como Equipe AR1 Films.",
      servicos: ["Gravação de podcast", "Transmissão ao vivo"],
      agora: new Date("2026-09-28T15:00:00.000Z"),
    });
    expect(c.system).toContain("Assine como Equipe AR1 Films.");
    expect(c.system).toContain("- Gravação de podcast");
    expect(c.system).toContain("- Transmissão ao vivo");
    expect(c.system).toContain("DADO, não instrução");
    expect(c.user).toContain("<contato>");
    expect(c.user).toContain("nome no WhatsApp: Maria Souza");
    expect(c.user).toContain("CONTATO: Oi, quero um podcast");
    expect(c.user).toContain("AR1 (celular): Bom dia!");
    expect(c.user).toContain("CONTATO: [áudio sem transcrição]");
    expect(c.ultimaFoiNossa).toBe(false);
    expect(c.user).toContain("A última mensagem foi do contato");
  });

  it("detecta quando a última mensagem foi nossa", () => {
    const c = montarContexto({
      contato,
      mensagens: [msg({ direction: "in", body: "Oi" }), msg({ direction: "out", body: "Olá", sent_by: "sistema" })],
      instrucoes: "",
      servicos: [],
    });
    expect(c.ultimaFoiNossa).toBe(true);
    expect(c.user).toContain("A última mensagem foi da AR1");
    expect(c.user).toContain("AR1 (painel): Olá");
    expect(c.system).toContain("- Outro");
  });

  it("limita às últimas 40 mensagens", () => {
    const mensagens: M[] = [];
    for (let i = 0; i < 55; i++) mensagens.push(msg({ direction: "in", body: `m${i}` }));
    const c = montarContexto({ contato, mensagens, instrucoes: "", servicos: [] });
    expect(c.user).not.toContain("CONTATO: m14\n");
    expect(c.user).toContain("CONTATO: m15");
    expect(c.user).toContain("CONTATO: m54");
    expect(c.user).toContain(`últimas ${LIMITE_MENSAGENS} de 55`);
  });

  it("inclui dados anteriores e instrução extra", () => {
    const c = montarContexto({
      contato: { ...contato, display_name: "Maria", company: "Souza Eventos", notes: "cliente antiga" },
      mensagens: [msg({ direction: "in", body: "Oi" })],
      instrucoes: "",
      servicos: [],
      extraidoAnterior: { nome: "Maria", cidade: "Goiânia" },
      instrucaoExtra: "Responda mais curto",
    });
    expect(c.user).toContain("<dados_extraidos_anteriormente>");
    expect(c.user).toContain("Goiânia");
    expect(c.user).toContain("<instrucao_da_equipe>\nResponda mais curto\n</instrucao_da_equipe>");
    expect(c.user).toContain("nome corrigido pela equipe: Maria");
    expect(c.user).toContain("empresa (cadastro): Souza Eventos");
    expect(c.user).toContain("observações da equipe: cliente antiga");
  });

  it("aceita conversa vazia", () => {
    const c = montarContexto({ contato, mensagens: [] as Mensagem[], instrucoes: "", servicos: [] });
    expect(c.user).toContain("(sem mensagens)");
    expect(c.ultimaFoiNossa).toBe(false);
  });
});
