import { describe, expect, it, vi } from "vitest";
import {
  caminhoNoBucket,
  ErroTranscricao,
  formatoDoAudio,
  formatoPelosBytes,
  INSTRUCAO_TRANSCRICAO,
  interpretarRespostaTranscricao,
  LIMITE_AUDIO_BYTES,
  LIMITE_TRANSCRICAO,
  limparTranscricao,
  montarCorpoTranscricao,
  pedirTranscricao,
  transcreverArquivo,
  URL_OPENROUTER,
} from "@/lib/transcricao";

// Nada aqui fala com a OpenRouter nem com o Supabase: o fetch e o download são simulados.

const MODELO = "google/gemini-3.5-flash-lite";
const CHAVE = "chave-de-teste";

/** Começo de um arquivo de cada formato (o resto é enchimento). */
function bytesDe(formato: "mp3" | "mp3-sem-id3" | "ogg" | "wav" | "m4a" | "desconhecido", tamanho = 64): Uint8Array {
  const b = new Uint8Array(tamanho);
  const escrever = (texto: string, em: number) => {
    for (let i = 0; i < texto.length; i++) b[em + i] = texto.charCodeAt(i);
  };
  if (formato === "mp3") escrever("ID3", 0);
  if (formato === "mp3-sem-id3") {
    b[0] = 0xff;
    b[1] = 0xf3; // MPEG-2 camada III (16 kHz)
  }
  if (formato === "ogg") escrever("OggS", 0);
  if (formato === "wav") {
    escrever("RIFF", 0);
    escrever("WAVE", 8);
  }
  if (formato === "m4a") escrever("ftypM4A ", 4);
  if (formato === "desconhecido") escrever("qualquer coisa", 0);
  return b;
}

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function respostaComTexto(texto: string | null, extra: Record<string, unknown> = {}) {
  return respostaJson(200, {
    choices: [{ message: { role: "assistant", content: texto }, finish_reason: "stop", ...extra }],
  });
}

type FetchSimulado = ReturnType<typeof vi.fn<typeof fetch>>;

function fetchQueDevolve(resposta: () => Response): FetchSimulado {
  return vi.fn<typeof fetch>(async () => resposta());
}

/** Corpo JSON enviado na primeira chamada do fetch simulado. */
function corpoEnviado(f: FetchSimulado) {
  const init = f.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroTranscricao> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroTranscricao);
    return e as ErroTranscricao;
  }
  throw new Error("era para ter falhado");
}

// ------------------------------------------------------------------- formato

describe("formatoDoAudio", () => {
  it("decide pelo mime, ignorando parâmetros e maiúsculas", () => {
    expect(formatoDoAudio("audio/mpeg", "x/AUD.mp3")).toBe("mp3");
    expect(formatoDoAudio("audio/mp3", null)).toBe("mp3");
    expect(formatoDoAudio("audio/ogg; codecs=opus", "x/AUD.ogg")).toBe("ogg");
    expect(formatoDoAudio("AUDIO/OGG", null)).toBe("ogg");
    expect(formatoDoAudio("audio/opus", null)).toBe("ogg");
    expect(formatoDoAudio("audio/wav", null)).toBe("wav");
    expect(formatoDoAudio("audio/x-wav", null)).toBe("wav");
    expect(formatoDoAudio("audio/mp4", null)).toBe("m4a");
    expect(formatoDoAudio("audio/x-m4a", null)).toBe("m4a");
  });

  it("o mime vence a extensão quando os dois existem", () => {
    expect(formatoDoAudio("audio/mpeg", "5562/AUD.ogg")).toBe("mp3");
  });

  it("sem mime conhecido, decide pela extensão", () => {
    expect(formatoDoAudio(null, "5562988887777/AUD001.mp3")).toBe("mp3");
    expect(formatoDoAudio("", "5562988887777/AUD001.OGG")).toBe("ogg");
    expect(formatoDoAudio("application/octet-stream", "a/b.wav")).toBe("wav");
    expect(formatoDoAudio(undefined, "a/b.m4a")).toBe("m4a");
    expect(formatoDoAudio(null, "a/b.opus")).toBe("ogg");
    expect(formatoDoAudio(null, "storage:ar1-wa-media/a/b.mp3?token=1")).toBe("mp3");
  });

  it("formato não aceito devolve null", () => {
    expect(formatoDoAudio("audio/aac", "a/b.aac")).toBeNull();
    expect(formatoDoAudio("audio/amr", "a/b.amr")).toBeNull();
    expect(formatoDoAudio(null, "a/sem-extensao")).toBeNull();
    expect(formatoDoAudio(null, null)).toBeNull();
  });
});

describe("formatoPelosBytes", () => {
  it("reconhece os quatro formatos pelo começo do arquivo", () => {
    expect(formatoPelosBytes(bytesDe("mp3"))).toBe("mp3");
    expect(formatoPelosBytes(bytesDe("mp3-sem-id3"))).toBe("mp3");
    expect(formatoPelosBytes(bytesDe("ogg"))).toBe("ogg");
    expect(formatoPelosBytes(bytesDe("wav"))).toBe("wav");
    expect(formatoPelosBytes(bytesDe("m4a"))).toBe("m4a");
  });

  it("não reconhece lixo nem arquivo curto demais", () => {
    expect(formatoPelosBytes(bytesDe("desconhecido"))).toBeNull();
    expect(formatoPelosBytes(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBeNull();
  });
});

describe("caminhoNoBucket", () => {
  it("aceita as três formas do caminho", () => {
    expect(caminhoNoBucket("storage:ar1-wa-media/5562/AUD.mp3")).toBe("5562/AUD.mp3");
    expect(caminhoNoBucket("ar1-wa-media/5562/AUD.mp3")).toBe("5562/AUD.mp3");
    expect(caminhoNoBucket("5562/AUD.mp3")).toBe("5562/AUD.mp3");
  });

  it("recusa URL externa, outro bucket e caminho perigoso", () => {
    expect(caminhoNoBucket("https://cdn.example/x.ogg")).toBeNull();
    expect(caminhoNoBucket("storage:ar1-context/global/x.mp3")).toBeNull();
    expect(caminhoNoBucket("storage:ar1-wa-media/../segredo")).toBeNull();
    expect(caminhoNoBucket("")).toBeNull();
    expect(caminhoNoBucket(null)).toBeNull();
  });
});

// -------------------------------------------------------------------- pedido

describe("montarCorpoTranscricao", () => {
  it("monta a mensagem com a instrução e o áudio em base64", () => {
    const corpo = montarCorpoTranscricao({ base64: "QUJD", formato: "mp3", modelo: MODELO });
    expect(corpo).toEqual({
      model: MODELO,
      temperature: 0,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCAO_TRANSCRICAO },
            { type: "input_audio", input_audio: { data: "QUJD", format: "mp3" } },
          ],
        },
      ],
    });
  });

  it("a instrução pede fidelidade, [inaudível], [sem fala] e só o texto", () => {
    expect(INSTRUCAO_TRANSCRICAO).toContain("português do Brasil");
    expect(INSTRUCAO_TRANSCRICAO).toContain("não resuma");
    expect(INSTRUCAO_TRANSCRICAO).toContain("[inaudível]");
    expect(INSTRUCAO_TRANSCRICAO).toContain("[sem fala]");
    expect(INSTRUCAO_TRANSCRICAO).toContain("somente com o texto");
  });
});

describe("pedirTranscricao (fetch simulado)", () => {
  it("chama a OpenRouter com a chave, o modelo e o formato certos", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("Oi, quero um orçamento."));
    const bytes = bytesDe("mp3");
    const r = await pedirTranscricao({ bytes, formato: "mp3" }, { fetchImpl: f, modelo: MODELO, chave: CHAVE });

    expect(r).toEqual({ texto: "Oi, quero um orçamento.", modelo: MODELO, formato: "mp3" });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_OPENROUTER);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CHAVE}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const corpo = corpoEnviado(f);
    expect(corpo.model).toBe(MODELO);
    expect(corpo.temperature).toBe(0);
    expect(corpo.messages).toHaveLength(1);
    expect(corpo.messages[0].role).toBe("user");
    expect(corpo.messages[0].content[0]).toEqual({ type: "text", text: INSTRUCAO_TRANSCRICAO });
    expect(corpo.messages[0].content[1]).toEqual({
      type: "input_audio",
      input_audio: { data: Buffer.from(bytes).toString("base64"), format: "mp3" },
    });
  });

  it("codifica só o trecho do buffer que pertence ao áudio", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const inteiro = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
    await pedirTranscricao({ bytes: inteiro.subarray(2, 5), formato: "ogg" }, { fetchImpl: f, modelo: MODELO, chave: CHAVE });
    expect(corpoEnviado(f).messages[0].content[1].input_audio).toEqual({
      data: Buffer.from([1, 2, 3]).toString("base64"),
      format: "ogg",
    });
  });

  it("usa AI_AUDIO_MODEL quando definido e o padrão quando não", async () => {
    const anterior = { modelo: process.env.AI_AUDIO_MODEL, chave: process.env.OPENROUTER_API_KEY };
    try {
      process.env.OPENROUTER_API_KEY = CHAVE;
      process.env.AI_AUDIO_MODEL = "openai/gpt-audio-teste";
      const f1 = fetchQueDevolve(() => respostaComTexto("ok"));
      const r1 = await pedirTranscricao({ bytes: bytesDe("mp3"), formato: "mp3" }, { fetchImpl: f1 });
      expect(r1.modelo).toBe("openai/gpt-audio-teste");
      expect(corpoEnviado(f1).model).toBe("openai/gpt-audio-teste");

      process.env.AI_AUDIO_MODEL = "";
      const f2 = fetchQueDevolve(() => respostaComTexto("ok"));
      await pedirTranscricao({ bytes: bytesDe("mp3"), formato: "mp3" }, { fetchImpl: f2 });
      expect(corpoEnviado(f2).model).toBe("google/gemini-3.5-flash-lite");
    } finally {
      if (anterior.modelo === undefined) delete process.env.AI_AUDIO_MODEL;
      else process.env.AI_AUDIO_MODEL = anterior.modelo;
      if (anterior.chave === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = anterior.chave;
    }
  });

  it("áudio vazio ou acima de 20 MB nem chega a chamar a IA", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const vazio = await erroDe(pedirTranscricao({ bytes: new Uint8Array(0), formato: "mp3" }, { fetchImpl: f, modelo: MODELO, chave: CHAVE }));
    expect(vazio.message).toContain("vazio");
    const grande = await erroDe(
      pedirTranscricao({ bytes: new Uint8Array(LIMITE_AUDIO_BYTES + 1), formato: "mp3" }, { fetchImpl: f, modelo: MODELO, chave: CHAVE }),
    );
    expect(grande.status).toBe(413);
    expect(grande.message).toContain("20 MB");
    expect(f).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ resposta

describe("respostas da IA", () => {
  const pedir = (f: FetchSimulado) =>
    pedirTranscricao({ bytes: bytesDe("mp3"), formato: "mp3" }, { fetchImpl: f, modelo: MODELO, chave: CHAVE });

  it("texto: devolve limpo, sem espaços nas pontas", async () => {
    const r = await pedir(fetchQueDevolve(() => respostaComTexto("  Bom dia! Vocês gravam podcast?\n")));
    expect(r.texto).toBe("Bom dia! Vocês gravam podcast?");
  });

  it("conteúdo em partes também é aceito", async () => {
    const f = fetchQueDevolve(() =>
      respostaJson(200, {
        choices: [{ message: { content: [{ type: "text", text: "Primeira parte. " }, { type: "text", text: "Segunda parte." }] } }],
      }),
    );
    expect((await pedir(f)).texto).toBe("Primeira parte. Segunda parte.");
  });

  it("áudio sem fala volta como [sem fala]", async () => {
    expect((await pedir(fetchQueDevolve(() => respostaComTexto("[sem fala]")))).texto).toBe("[sem fala]");
  });

  it("corta em 20.000 caracteres", async () => {
    const r = await pedir(fetchQueDevolve(() => respostaComTexto("a".repeat(LIMITE_TRANSCRICAO + 500))));
    expect(r.texto).toHaveLength(20_000);
  });

  it("vazio: erro legível", async () => {
    for (const conteudo of ["", "   \n ", null]) {
      const e = await erroDe(pedir(fetchQueDevolve(() => respostaComTexto(conteudo))));
      expect(e.message).toBe("A IA devolveu uma transcrição vazia. Tente de novo.");
    }
    const semEscolha = await erroDe(pedir(fetchQueDevolve(() => respostaJson(200, { choices: [] }))));
    expect(semEscolha.message).toBe("A IA não devolveu resposta para este áudio.");
  });

  it("erro 4xx: mensagens próprias para chave, créditos, modelo, limite e pedido recusado", async () => {
    const casos: [number, RegExp, number][] = [
      [401, /chave da OpenRouter foi recusada/, 502],
      [403, /chave da OpenRouter foi recusada/, 502],
      [402, /sem créditos/, 502],
      [404, /modelo de transcrição não foi encontrado.*AI_AUDIO_MODEL/, 502],
      [413, /grande demais/, 413],
      [429, /ocupada no momento/, 502],
    ];
    for (const [status, mensagem, statusDoErro] of casos) {
      const e = await erroDe(pedir(fetchQueDevolve(() => respostaJson(status, { error: { message: "detalhe", code: status } }))));
      expect(e.message).toMatch(mensagem);
      expect(e.status).toBe(statusDoErro);
    }
    const recusado = await erroDe(
      pedir(fetchQueDevolve(() => respostaJson(400, { error: { message: "Audio input is not supported by this model", code: 400 } }))),
    );
    expect(recusado.status).toBe(400);
    expect(recusado.message).toContain("A IA recusou o áudio: Audio input is not supported by this model");
    expect(recusado.message).toContain("AI_AUDIO_MODEL");
  });

  it("erro 5xx: mensagem com o código, mesmo quando o corpo não é JSON", async () => {
    const e1 = await erroDe(pedir(fetchQueDevolve(() => respostaJson(500, { error: { message: "Internal error" } }))));
    expect(e1.message).toBe("Erro da IA ao transcrever (500): Internal error");
    expect(e1.status).toBe(502);
    const e2 = await erroDe(pedir(fetchQueDevolve(() => respostaJson(503, "<html>Service Unavailable</html>"))));
    expect(e2.message).toContain("(503)");
    expect(e2.message).toContain("Service Unavailable");
  });

  it("erro dentro de uma resposta 200 (formato da OpenRouter) também é erro", async () => {
    const e = await erroDe(pedir(fetchQueDevolve(() => respostaJson(200, { error: { message: "Provider returned error", code: 429 } }))));
    expect(e.message).toMatch(/ocupada no momento/);
  });

  it("200 com corpo que não é JSON", async () => {
    const e = await erroDe(pedir(fetchQueDevolve(() => respostaJson(200, "não é json"))));
    expect(e.message).toBe("A OpenRouter respondeu algo inesperado (HTTP 200).");
  });

  it("filtro de conteúdo", async () => {
    const e = await erroDe(
      pedir(fetchQueDevolve(() => respostaJson(200, { choices: [{ message: { content: "" }, finish_reason: "content_filter" }] }))),
    );
    expect(e.message).toContain("filtro de conteúdo");
  });

  it("tempo esgotado: o pedido é cancelado e o erro é legível", async () => {
    // Fetch que só termina quando o sinal de cancelamento dispara, como o fetch de verdade.
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const sinal = (init as RequestInit).signal as AbortSignal;
          sinal.addEventListener("abort", () => reject(sinal.reason));
        }),
    );
    const inicio = Date.now();
    const e = await erroDe(
      pedirTranscricao({ bytes: bytesDe("mp3"), formato: "mp3" }, { fetchImpl: f, modelo: MODELO, chave: CHAVE, timeoutMs: 30 }),
    );
    expect(e.message).toBe("A IA demorou demais para transcrever. Tente de novo.");
    expect(Date.now() - inicio).toBeLessThan(5_000);
  });

  it("falha de rede", async () => {
    const f = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const e = await erroDe(pedir(f));
    expect(e.message).toContain("Não foi possível falar com a IA");
  });
});

describe("interpretarRespostaTranscricao e limparTranscricao", () => {
  it("lê o texto de uma resposta normal", () => {
    const corpo = JSON.stringify({ choices: [{ message: { content: "Olá." }, finish_reason: "stop" }] });
    expect(interpretarRespostaTranscricao(200, corpo)).toBe("Olá.");
  });

  it("resposta cortada por tamanho (finish_reason length) ainda vale", () => {
    const corpo = JSON.stringify({ choices: [{ message: { content: "Texto que parou no meio" }, finish_reason: "length" }] });
    expect(interpretarRespostaTranscricao(200, corpo)).toBe("Texto que parou no meio");
  });

  it("tira cerca de código e aspas em volta, mantém aspas do meio", () => {
    expect(limparTranscricao("```\nOi, tudo bem?\n```")).toBe("Oi, tudo bem?");
    expect(limparTranscricao('"Oi, tudo bem?"')).toBe("Oi, tudo bem?");
    expect(limparTranscricao('Ele disse "sim" e "não"')).toBe('Ele disse "sim" e "não"');
    expect(limparTranscricao('"sim" ou "não"')).toBe('"sim" ou "não"');
    expect(limparTranscricao("linha 1\r\n\r\n\r\n\r\nlinha 2")).toBe("linha 1\n\nlinha 2");
  });
});

// ------------------------------------------------------------------- arquivo

describe("transcreverArquivo (download e fetch simulados)", () => {
  const opcoes = (f: FetchSimulado, baixar: (c: string) => Promise<Uint8Array>) => ({
    fetchImpl: f,
    baixar,
    modelo: MODELO,
    chave: CHAVE,
  });

  it("baixa pelo caminho dentro do bucket e manda o formato do arquivo", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("Transcrição."));
    const baixar = vi.fn(async () => bytesDe("mp3"));
    const r = await transcreverArquivo(
      { caminho: "storage:ar1-wa-media/5562988887777/AUD001.mp3", mime: "audio/mpeg" },
      opcoes(f, baixar),
    );
    expect(baixar).toHaveBeenCalledWith("5562988887777/AUD001.mp3");
    expect(r.texto).toBe("Transcrição.");
    expect(corpoEnviado(f).messages[0].content[1].input_audio.format).toBe("mp3");
  });

  it("áudio antigo em ogg (antes da conversão na ponte) vai como ogg", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    await transcreverArquivo({ caminho: "5562/AUD.ogg", mime: "audio/ogg" }, opcoes(f, async () => bytesDe("ogg")));
    expect(corpoEnviado(f).messages[0].content[1].input_audio.format).toBe("ogg");
  });

  it("o conteúdo do arquivo vence o cadastro quando os dois discordam", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    await transcreverArquivo({ caminho: "5562/AUD.ogg", mime: "audio/ogg" }, opcoes(f, async () => bytesDe("mp3-sem-id3")));
    expect(corpoEnviado(f).messages[0].content[1].input_audio.format).toBe("mp3");
  });

  it("conteúdo não reconhecido: vale o mime e, sem mime, a extensão", async () => {
    const f1 = fetchQueDevolve(() => respostaComTexto("ok"));
    await transcreverArquivo({ caminho: "5562/AUD.bin", mime: "audio/wav" }, opcoes(f1, async () => bytesDe("desconhecido")));
    expect(corpoEnviado(f1).messages[0].content[1].input_audio.format).toBe("wav");

    const f2 = fetchQueDevolve(() => respostaComTexto("ok"));
    await transcreverArquivo({ caminho: "5562/AUD.m4a", mime: null }, opcoes(f2, async () => bytesDe("desconhecido")));
    expect(corpoEnviado(f2).messages[0].content[1].input_audio.format).toBe("m4a");
  });

  it("formato não aceito: erro legível, sem chamar a IA", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const e = await erroDe(
      transcreverArquivo({ caminho: "5562/AUD.amr", mime: "audio/amr" }, opcoes(f, async () => bytesDe("desconhecido"))),
    );
    expect(e.status).toBe(415);
    expect(e.message).toContain("Formato de áudio não aceito");
    expect(e.message).toContain("audio/amr");
    expect(f).not.toHaveBeenCalled();
  });

  it("arquivo acima de 20 MB: erro legível, sem chamar a IA", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const e = await erroDe(
      transcreverArquivo(
        { caminho: "5562/AUD.mp3", mime: "audio/mpeg" },
        opcoes(f, async () => new Uint8Array(LIMITE_AUDIO_BYTES + 1024 * 1024)),
      ),
    );
    expect(e.status).toBe(413);
    expect(e.message).toBe("O áudio tem 21 MB; o limite para transcrição é 20 MB.");
    expect(f).not.toHaveBeenCalled();
  });

  it("arquivo exatamente no limite passa", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const noLimite = new Uint8Array(LIMITE_AUDIO_BYTES);
    noLimite.set(bytesDe("mp3"));
    const r = await transcreverArquivo({ caminho: "5562/AUD.mp3", mime: "audio/mpeg" }, opcoes(f, async () => noLimite));
    expect(r.texto).toBe("ok");
  });

  it("URL externa (Z-API) e arquivo vazio não são transcritos", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const baixar = vi.fn(async () => new Uint8Array(0));
    const externa = await erroDe(transcreverArquivo({ caminho: "https://cdn.example/x.ogg", mime: "audio/ogg" }, opcoes(f, baixar)));
    expect(externa.status).toBe(422);
    expect(baixar).not.toHaveBeenCalled();
    const vazio = await erroDe(transcreverArquivo({ caminho: "5562/AUD.mp3", mime: "audio/mpeg" }, opcoes(f, baixar)));
    expect(vazio.message).toContain("vazio");
    expect(f).not.toHaveBeenCalled();
  });

  it("falha no download vira erro da transcrição", async () => {
    const f = fetchQueDevolve(() => respostaComTexto("ok"));
    const e = await erroDe(
      transcreverArquivo(
        { caminho: "5562/AUD.mp3", mime: "audio/mpeg" },
        opcoes(f, async () => {
          throw new ErroTranscricao("Não encontrei o arquivo do áudio (pode não ter sido sincronizado).", 404);
        }),
      ),
    );
    expect(e.status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });
});
