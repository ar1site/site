import { describe, expect, it } from "vitest";
import {
  esperaRestante,
  executarPosMensagem,
  planejarPosMensagem,
  type GravacaoParaPlano,
  type MensagemParaPlano,
} from "@/lib/whatsapp/pos-mensagem";

const AUDIO_DO_BUCKET = "storage:ar1-wa-media/5562988887777/AUD001.mp3";

function mensagem(parcial: Partial<MensagemParaPlano> = {}): MensagemParaPlano {
  return { kind: "audio", fromMe: false, mediaUrl: AUDIO_DO_BUCKET, historico: false, ...parcial };
}

function gravacao(parcial: Partial<GravacaoParaPlano> = {}): GravacaoParaPlano {
  return { situacao: "gravada", atendimentoId: "at-1", mensagemId: "msg-1", entrada: true, ...parcial };
}

describe("planejarPosMensagem", () => {
  it("áudio recebido: transcreve e analisa", () => {
    expect(planejarPosMensagem(mensagem(), gravacao())).toEqual({ transcrever: true, analisar: true });
  });

  it("áudio enviado por nós: transcreve, mas não dispara análise", () => {
    expect(planejarPosMensagem(mensagem({ fromMe: true }), gravacao({ entrada: false }))).toEqual({
      transcrever: true,
      analisar: false,
    });
  });

  it("texto recebido: só análise, como antes", () => {
    expect(planejarPosMensagem(mensagem({ kind: "text", mediaUrl: null }), gravacao())).toEqual({
      transcrever: false,
      analisar: true,
    });
  });

  it("texto enviado por nós: nada a fazer", () => {
    expect(planejarPosMensagem(mensagem({ kind: "text", mediaUrl: null, fromMe: true }), gravacao({ entrada: false }))).toEqual({
      transcrever: false,
      analisar: false,
    });
  });

  it("histórico importado: nem transcrição nem análise", () => {
    expect(planejarPosMensagem(mensagem({ historico: true }), gravacao())).toEqual({ transcrever: false, analisar: false });
  });

  it("mensagem repetida ou de contato bloqueado: nada a fazer", () => {
    expect(planejarPosMensagem(mensagem(), gravacao({ situacao: "duplicada", mensagemId: null }))).toEqual({
      transcrever: false,
      analisar: false,
    });
    expect(planejarPosMensagem(mensagem(), gravacao({ situacao: "bloqueado", atendimentoId: null, mensagemId: null }))).toEqual({
      transcrever: false,
      analisar: false,
    });
  });

  it("áudio sem arquivo ou fora do bucket (Z-API): não transcreve, mas analisa", () => {
    expect(planejarPosMensagem(mensagem({ mediaUrl: null }), gravacao())).toEqual({ transcrever: false, analisar: true });
    expect(planejarPosMensagem(mensagem({ mediaUrl: "https://cdn.example/x.ogg" }), gravacao())).toEqual({
      transcrever: false,
      analisar: true,
    });
    expect(planejarPosMensagem(mensagem({ mediaUrl: "storage:ar1-context/x.mp3" }), gravacao())).toEqual({
      transcrever: false,
      analisar: true,
    });
  });

  it("imagem, vídeo e documento não são transcritos", () => {
    for (const kind of ["image", "video", "document", "sticker"]) {
      expect(planejarPosMensagem(mensagem({ kind }), gravacao()).transcrever).toBe(false);
    }
  });
});

describe("esperaRestante", () => {
  it("desconta o tempo gasto na transcrição, sem ficar negativa", () => {
    expect(esperaRestante(40_000, 0)).toBe(40_000);
    expect(esperaRestante(40_000, 6_500)).toBe(33_500);
    expect(esperaRestante(40_000, 40_000)).toBe(0);
    expect(esperaRestante(40_000, 50_000)).toBe(0);
    expect(esperaRestante(40_000, -10)).toBe(40_000);
    expect(esperaRestante(40_000, Number.NaN)).toBe(40_000);
  });
});

describe("executarPosMensagem", () => {
  /** Ações simuladas que anotam a ordem em que rodaram e um relógio controlado. */
  function cenario(opcoes: { transcricaoLevaMs?: number; transcricaoFalha?: boolean } = {}) {
    const ordem: string[] = [];
    let relogio = 1_000_000;
    const falhas: unknown[] = [];
    return {
      ordem,
      falhas,
      acoes: {
        agora: () => relogio,
        transcrever: async () => {
          ordem.push("transcrever:inicio");
          await Promise.resolve();
          relogio += opcoes.transcricaoLevaMs ?? 0;
          if (opcoes.transcricaoFalha) {
            ordem.push("transcrever:falhou");
            throw new Error("A IA demorou demais para transcrever. Tente de novo.");
          }
          ordem.push("transcrever:gravou");
        },
        esperarEAnalisar: async (esperaMs: number) => {
          ordem.push(`esperar:${esperaMs}`);
          await Promise.resolve();
          ordem.push("analisar");
        },
        aoFalharTranscricao: (e: unknown) => {
          falhas.push(e);
        },
      },
    };
  }

  it("transcreve e grava ANTES de esperar e analisar", async () => {
    const c = cenario({ transcricaoLevaMs: 7_000 });
    await executarPosMensagem({ transcrever: true, analisar: true }, 40_000, c.acoes);
    expect(c.ordem).toEqual(["transcrever:inicio", "transcrever:gravou", "esperar:33000", "analisar"]);
    expect(c.falhas).toEqual([]);
  });

  it("se a transcrição falhar, a análise segue normalmente", async () => {
    const c = cenario({ transcricaoLevaMs: 50_000, transcricaoFalha: true });
    await executarPosMensagem({ transcrever: true, analisar: true }, 40_000, c.acoes);
    expect(c.ordem).toEqual(["transcrever:inicio", "transcrever:falhou", "esperar:0", "analisar"]);
    expect(c.falhas).toHaveLength(1);
    expect((c.falhas[0] as Error).message).toContain("demorou demais");
  });

  it("áudio nosso: só transcreve", async () => {
    const c = cenario();
    await executarPosMensagem({ transcrever: true, analisar: false }, 40_000, c.acoes);
    expect(c.ordem).toEqual(["transcrever:inicio", "transcrever:gravou"]);
  });

  it("texto recebido: espera inteira e análise, sem transcrição", async () => {
    const c = cenario();
    await executarPosMensagem({ transcrever: false, analisar: true }, 40_000, c.acoes);
    expect(c.ordem).toEqual(["esperar:40000", "analisar"]);
  });

  it("nada a fazer: nenhuma ação roda", async () => {
    const c = cenario();
    await executarPosMensagem({ transcrever: false, analisar: false }, 40_000, c.acoes);
    expect(c.ordem).toEqual([]);
  });

  it("falha na transcrição sem registrador não estoura", async () => {
    const c = cenario({ transcricaoFalha: true });
    const acoes = { ...c.acoes, aoFalharTranscricao: undefined };
    await expect(executarPosMensagem({ transcrever: true, analisar: true }, 40_000, acoes)).resolves.toBeUndefined();
    expect(c.ordem.at(-1)).toBe("analisar");
  });
});
