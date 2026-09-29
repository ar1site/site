// Testes da conversão de áudio: `node --test audio.test.mjs`
// A parte de decisão (caminho e mime finais) usa um conversor simulado; a conversão
// real roda o ffmpeg num áudio curto gerado aqui mesmo e é pulada se não houver ffmpeg.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ARGUMENTOS_FFMPEG, ErroConversao, converterParaMp3, criarPreparadorDeMidia } from "./audio.mjs";
import { BUCKET, destinoDaMidia, normalizarMensagem, trocarExtensao } from "./normalizar.mjs";

const FFMPEG = process.env.FFMPEG || "ffmpeg";

function temFfmpeg() {
  try {
    const r = spawnSync(FFMPEG, ["-version"], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
const COM_FFMPEG = temFfmpeg();
const PULAR = COM_FFMPEG ? false : `ffmpeg não encontrado ("${FFMPEG}"); conversão real não testada`;
if (!COM_FFMPEG) console.warn(`[AVISO] ${PULAR}`);

/** WAV PCM 16 bits mono com um tom de 440 Hz. */
function wavDeTeste(segundos = 1, taxa = 8000) {
  const amostras = Math.floor(segundos * taxa);
  const dados = Buffer.alloc(amostras * 2);
  for (let i = 0; i < amostras; i++) {
    dados.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / taxa) * 12000), i * 2);
  }
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0, "ascii");
  cab.writeUInt32LE(36 + dados.length, 4);
  cab.write("WAVEfmt ", 8, "ascii");
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(1, 22); // mono
  cab.writeUInt32LE(taxa, 24);
  cab.writeUInt32LE(taxa * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36, "ascii");
  cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

/** Nota de voz como a do WhatsApp (ogg/opus), gerada pelo próprio ffmpeg. */
function oggOpusDeTeste() {
  const r = spawnSync(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ac", "1", "-c:a", "libopus", "-b:a", "24k", "-f", "ogg", "pipe:1"],
    { windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
  );
  return r.status === 0 && r.stdout?.length ? r.stdout : null;
}

function pareceMp3(buffer) {
  if (buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("latin1") === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0; // sincronismo de quadro MPEG
}

/** Lê canais, taxa e codec do MP3 gerado (ffmpeg -i escreve a descrição no stderr). */
function descrever(buffer) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", "pipe:0", "-f", "null", "-"], { input: buffer, encoding: "utf8", windowsHide: true, timeout: 30_000 });
  return `${r.stderr ?? ""}`;
}

const MIDIA_OGG = { kind: "audio", caminho: "5562988887777/AUD001.ogg", mime: "audio/ogg" };

// ------------------------------------------------------------ caminho final

describe("caminho final do áudio", () => {
  test("conversão deu certo: .mp3 e audio/mpeg, com o conteúdo convertido", async () => {
    const avisos = [];
    const mp3 = Buffer.from("conteudo-mp3");
    const preparar = criarPreparadorDeMidia({ converter: async () => mp3, avisar: (m) => avisos.push(m) });
    const r = await preparar({ ...MIDIA_OGG, buffer: Buffer.from("conteudo-ogg") });
    assert.equal(r.caminho, "5562988887777/AUD001.mp3");
    assert.equal(r.mime, "audio/mpeg");
    assert.equal(r.convertido, true);
    assert.equal(r.erro, null);
    assert.equal(r.buffer, mp3);
    assert.deepEqual(avisos, []);
  });

  test("conversão falhou: sobe o original em .ogg e audio/ogg", async () => {
    const avisos = [];
    const original = Buffer.from("conteudo-ogg");
    const preparar = criarPreparadorDeMidia({
      converter: async () => {
        throw new ErroConversao("ffmpeg não encontrado (ffmpeg)", "sem-ffmpeg");
      },
      avisar: (m) => avisos.push(m),
    });
    const r = await preparar({ ...MIDIA_OGG, buffer: original });
    assert.equal(r.caminho, "5562988887777/AUD001.ogg");
    assert.equal(r.mime, "audio/ogg");
    assert.equal(r.convertido, false);
    assert.equal(r.buffer, original);
    assert.match(r.erro, /ffmpeg não encontrado/);
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /ffmpeg não encontrado/);
  });

  test("conversor que devolve vazio conta como falha", async () => {
    const preparar = criarPreparadorDeMidia({ converter: async () => Buffer.alloc(0) });
    const r = await preparar({ ...MIDIA_OGG, buffer: Buffer.from("x") });
    assert.equal(r.convertido, false);
    assert.equal(r.caminho, "5562988887777/AUD001.ogg");
  });

  test("o aviso sai uma vez só por execução, mesmo com várias falhas", async () => {
    const avisos = [];
    const preparar = criarPreparadorDeMidia({
      converter: async () => {
        throw new Error("falhou");
      },
      avisar: (m) => avisos.push(m),
    });
    for (let i = 0; i < 5; i++) {
      const r = await preparar({ ...MIDIA_OGG, caminho: `5562988887777/AUD00${i}.ogg`, buffer: Buffer.from("x") });
      assert.equal(r.convertido, false);
    }
    assert.equal(avisos.length, 1);
  });

  test("falha com mime real diferente do evento: a extensão segue o arquivo salvo", async () => {
    const preparar = criarPreparadorDeMidia({
      converter: async () => {
        throw new Error("falhou");
      },
    });
    const r = await preparar({ ...MIDIA_OGG, mimeReal: "audio/mp4", buffer: Buffer.from("x") });
    assert.equal(r.caminho, "5562988887777/AUD001.m4a");
    assert.equal(r.mime, "audio/mp4");
  });

  test("imagem, vídeo e documento não passam pelo conversor", async () => {
    let chamadas = 0;
    const preparar = criarPreparadorDeMidia({
      converter: async () => {
        chamadas++;
        return Buffer.from("mp3");
      },
    });
    const buffer = Buffer.from("jpg");
    const r = await preparar({ kind: "image", caminho: "5562988887777/IMG001.jpg", mime: "image/jpeg", buffer });
    assert.equal(chamadas, 0);
    assert.equal(r.caminho, "5562988887777/IMG001.jpg");
    assert.equal(r.mime, "image/jpeg");
    assert.equal(r.buffer, buffer);
    assert.equal(r.convertido, false);
  });

  test("o ffmpeg e o tempo limite configurados chegam ao conversor", async () => {
    let recebido = null;
    const preparar = criarPreparadorDeMidia({
      ffmpeg: "C:\\ferramentas\\ffmpeg.exe",
      timeoutMs: 1234,
      converter: async (_b, opcoes) => {
        recebido = opcoes;
        return Buffer.from("mp3");
      },
    });
    await preparar({ ...MIDIA_OGG, buffer: Buffer.from("x") });
    assert.deepEqual(recebido, { ffmpeg: "C:\\ferramentas\\ffmpeg.exe", timeoutMs: 1234 });
  });

  test("do evento ao painel: media_path e media_mime refletem o arquivo salvo", async () => {
    const r = normalizarMensagem({
      key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "AUD9" },
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true }, base64: Buffer.from("ogg").toString("base64") },
      messageTimestamp: 1790586300,
    });
    // O normalizador só propõe o caminho; quem decide é a etapa depois da conversão.
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/AUD9.ogg");
    const preparar = criarPreparadorDeMidia({ converter: async () => Buffer.from("mp3") });
    const arquivo = await preparar({ kind: r.mensagem.kind, caminho: r.midia.caminho, mime: r.midia.mime, buffer: Buffer.from(r.midia.base64, "base64") });
    r.mensagem.media_path = `${BUCKET}/${arquivo.caminho}`;
    r.mensagem.media_mime = arquivo.mime;
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/AUD9.mp3");
    assert.equal(r.mensagem.media_mime, "audio/mpeg");
  });
});

describe("destinoDaMidia e trocarExtensao", () => {
  test("troca só a extensão do arquivo", () => {
    assert.equal(trocarExtensao("5562/AUD.ogg", "mp3"), "5562/AUD.mp3");
    assert.equal(trocarExtensao("5562/AUD", "mp3"), "5562/AUD.mp3");
    assert.equal(trocarExtensao("55.62/AUD", "mp3"), "55.62/AUD.mp3");
    assert.equal(trocarExtensao("5562/a.b.ogg", "mp3"), "5562/a.b.mp3");
  });

  test("áudio convertido, áudio original e outras mídias", () => {
    assert.deepEqual(destinoDaMidia(MIDIA_OGG, { convertido: true }), { caminho: "5562988887777/AUD001.mp3", mime: "audio/mpeg" });
    assert.deepEqual(destinoDaMidia(MIDIA_OGG), { caminho: "5562988887777/AUD001.ogg", mime: "audio/ogg" });
    assert.deepEqual(destinoDaMidia(MIDIA_OGG, { mimeReal: "audio/ogg; codecs=opus" }), { caminho: "5562988887777/AUD001.ogg", mime: "audio/ogg" });
    // "convertido" só vale para áudio
    assert.deepEqual(destinoDaMidia({ kind: "document", caminho: "5562/DOC.pdf", mime: "application/pdf" }, { convertido: true }), {
      caminho: "5562/DOC.pdf",
      mime: "application/pdf",
    });
    // documento com mime genérico mantém a extensão tirada do nome do arquivo
    assert.deepEqual(destinoDaMidia({ kind: "document", caminho: "5562/DOC.xlsx", mime: "application/octet-stream" }), {
      caminho: "5562/DOC.xlsx",
      mime: "application/octet-stream",
    });
  });
});

// ------------------------------------------------------------ conversão real

describe("conversão real com ffmpeg", () => {
  test("argumentos: stdin -> MP3 mono 16 kHz 48 kbps -> stdout", () => {
    const a = ARGUMENTOS_FFMPEG;
    assert.equal(a[a.indexOf("-i") + 1], "pipe:0");
    assert.equal(a[a.indexOf("-ac") + 1], "1");
    assert.equal(a[a.indexOf("-ar") + 1], "16000");
    assert.equal(a[a.indexOf("-b:a") + 1], "48k");
    assert.equal(a[a.indexOf("-f") + 1], "mp3");
    assert.equal(a.at(-1), "pipe:1");
  });

  test("WAV curto vira MP3 mono 16 kHz", { skip: PULAR }, async () => {
    const mp3 = await converterParaMp3(wavDeTeste(1), { ffmpeg: FFMPEG });
    assert.ok(mp3.length > 1000, `MP3 pequeno demais (${mp3.length} bytes)`);
    assert.ok(pareceMp3(mp3), "a saída não parece MP3");
    const d = descrever(mp3);
    assert.match(d, /Audio: mp3/);
    assert.match(d, /16000 Hz/);
    assert.match(d, /mono/);
    // ~48 kbps: 1 s dá perto de 6 KB
    assert.ok(mp3.length < 12_000, `MP3 grande demais para 1 s a 48 kbps (${mp3.length} bytes)`);
  });

  test("nota de voz ogg/opus (formato do WhatsApp) vira MP3", { skip: PULAR }, async (t) => {
    const ogg = oggOpusDeTeste();
    if (!ogg) {
      t.skip("este ffmpeg não tem libopus para gerar o áudio de teste");
      return;
    }
    assert.equal(ogg.subarray(0, 4).toString("latin1"), "OggS");
    const preparar = criarPreparadorDeMidia({ ffmpeg: FFMPEG });
    const r = await preparar({ ...MIDIA_OGG, buffer: ogg });
    assert.equal(r.convertido, true, r.erro ?? "");
    assert.equal(r.caminho, "5562988887777/AUD001.mp3");
    assert.equal(r.mime, "audio/mpeg");
    assert.ok(pareceMp3(r.buffer));
    assert.match(descrever(r.buffer), /Audio: mp3.*16000 Hz.*mono/s);
  });

  test("arquivo que não é áudio: o ffmpeg falha e o original é mantido", { skip: PULAR }, async () => {
    const lixo = Buffer.from("isto não é um áudio ".repeat(50));
    await assert.rejects(converterParaMp3(lixo, { ffmpeg: FFMPEG }), (e) => e instanceof ErroConversao && e.codigo === "falhou");
    const avisos = [];
    const preparar = criarPreparadorDeMidia({ ffmpeg: FFMPEG, avisar: (m) => avisos.push(m) });
    const r = await preparar({ ...MIDIA_OGG, buffer: lixo });
    assert.equal(r.convertido, false);
    assert.equal(r.caminho, "5562988887777/AUD001.ogg");
    assert.equal(r.buffer, lixo);
    assert.equal(avisos.length, 1);
  });

  test("tempo limite: o processo é encerrado e a conversão falha", { skip: PULAR }, async () => {
    // 60 s de áudio com limite de 1 ms: não dá tempo nem de começar.
    await assert.rejects(converterParaMp3(wavDeTeste(60), { ffmpeg: FFMPEG, timeoutMs: 1 }), (e) => e instanceof ErroConversao && e.codigo === "tempo");
  });
});

describe("sem ffmpeg", () => {
  test("programa inexistente: erro claro e o original é mantido", async () => {
    const inexistente = "ffmpeg-que-nao-existe-ar1";
    await assert.rejects(converterParaMp3(Buffer.from("x"), { ffmpeg: inexistente }), (e) => e instanceof ErroConversao && e.codigo === "sem-ffmpeg");
    const avisos = [];
    const preparar = criarPreparadorDeMidia({ ffmpeg: inexistente, avisar: (m) => avisos.push(m) });
    const a = await preparar({ ...MIDIA_OGG, buffer: Buffer.from("x") });
    const b = await preparar({ ...MIDIA_OGG, caminho: "5562988887777/AUD002.ogg", buffer: Buffer.from("y") });
    assert.equal(a.convertido, false);
    assert.equal(a.caminho, "5562988887777/AUD001.ogg");
    assert.equal(b.caminho, "5562988887777/AUD002.ogg");
    assert.equal(avisos.length, 1);
    assert.match(avisos[0], /FFMPEG/);
  });

  test("áudio vazio não chama o ffmpeg", async () => {
    await assert.rejects(converterParaMp3(Buffer.alloc(0)), (e) => e instanceof ErroConversao && e.codigo === "vazio");
  });
});
