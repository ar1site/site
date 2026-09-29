// Conversão de áudio para MP3 antes de subir ao Storage. Usado pela ponte (ponte.mjs)
// e pelo importador de histórico (importar-historico.mjs). Sem efeitos ao importar:
// testável com `node --test audio.test.mjs`.
//
// Por que MP3: toca em qualquer navegador (o iPhone não toca ogg/opus, que é o formato
// das notas de voz do WhatsApp) e é aceito pelos modelos de áudio usados na transcrição.
// Mono, 16 kHz e ~48 kbps bastam para voz e deixam o arquivo pequeno (~360 KB por minuto).

import { spawn } from "node:child_process";
import { destinoDaMidia, erroCurto } from "./normalizar.mjs";

export const TIMEOUT_FFMPEG_MS = 60_000;

/** Entrada por stdin, saída por stdout: nada é gravado em disco. */
export const ARGUMENTOS_FFMPEG = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-i",
  "pipe:0",
  "-vn", // só o áudio (descarta capa/vídeo embutido)
  "-map_metadata",
  "-1",
  "-ac",
  "1",
  "-ar",
  "16000",
  "-b:a",
  "48k",
  // A saída é um pipe (não dá para voltar e preencher o cabeçalho Xing); sem ele o
  // navegador calcula a duração pelo tamanho, que é exato em taxa constante.
  "-write_xing",
  "0",
  "-f",
  "mp3",
  "pipe:1",
];

export class ErroConversao extends Error {
  /** @param {"sem-ffmpeg" | "falhou" | "tempo" | "vazio"} codigo */
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = "ErroConversao";
    this.codigo = codigo;
  }
}

/**
 * Converte um áudio (Buffer em qualquer formato que o ffmpeg leia por stdin) para MP3
 * mono 16 kHz ~48 kbps. Rejeita com ErroConversao se o ffmpeg não existir, falhar,
 * devolver vazio ou passar do tempo limite.
 */
export function converterParaMp3(buffer, { ffmpeg = "ffmpeg", timeoutMs = TIMEOUT_FFMPEG_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      reject(new ErroConversao("áudio vazio", "vazio"));
      return;
    }

    let processo;
    try {
      processo = spawn(ffmpeg, ARGUMENTOS_FFMPEG, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      reject(new ErroConversao(`não consegui iniciar o ffmpeg (${ffmpeg}): ${erroCurto(e, 120)}`, "sem-ffmpeg"));
      return;
    }

    let terminou = false;
    const partes = [];
    let erros = "";
    const timer = setTimeout(() => {
      fim(new ErroConversao(`ffmpeg passou de ${Math.round(timeoutMs / 1000)} s`, "tempo"));
      try {
        processo.kill("SIGKILL");
      } catch {}
    }, timeoutMs);

    function fim(erro, saida) {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      if (erro) reject(erro);
      else resolve(saida);
    }

    processo.on("error", (e) => {
      if (e?.code === "ENOENT") fim(new ErroConversao(`ffmpeg não encontrado (${ffmpeg})`, "sem-ffmpeg"));
      else fim(new ErroConversao(`ffmpeg não iniciou: ${erroCurto(e, 120)}`, "sem-ffmpeg"));
    });
    processo.stdout.on("data", (c) => partes.push(c));
    processo.stderr.on("data", (c) => {
      if (erros.length < 2000) erros += c.toString("utf8");
    });
    // Se o ffmpeg sair antes de ler tudo (arquivo inválido), a escrita dá EPIPE.
    processo.stdin.on("error", () => {});
    processo.on("close", (codigo) => {
      const saida = Buffer.concat(partes);
      if (codigo !== 0) {
        fim(new ErroConversao(`ffmpeg terminou com código ${codigo}: ${erroCurto(erros || "sem detalhe", 200)}`, "falhou"));
      } else if (saida.length === 0) {
        fim(new ErroConversao("ffmpeg devolveu um arquivo vazio", "vazio"));
      } else fim(null, saida);
    });

    processo.stdin.end(buffer);
  });
}

/**
 * Cria a função que prepara a mídia para subir. Para áudio, tenta converter para MP3;
 * se não der, devolve o arquivo original. O caminho e o mime finais são decididos
 * depois da conversão (destinoDaMidia).
 *
 * `avisar(texto)` é chamado UMA vez por execução, na primeira falha de conversão.
 * `converter` existe para os testes trocarem o ffmpeg por uma função simulada.
 */
export function criarPreparadorDeMidia({ ffmpeg = "ffmpeg", converter = converterParaMp3, avisar = () => {}, timeoutMs = TIMEOUT_FFMPEG_MS } = {}) {
  let avisou = false;

  /**
   * @param {{ kind: string, caminho: string, mime: string | null, mimeReal?: string | null, buffer: Buffer }} midia
   * @returns {Promise<{ buffer: Buffer, caminho: string, mime: string, convertido: boolean, erro: string | null }>}
   */
  return async function prepararMidia({ kind, caminho, mime, mimeReal = null, buffer }) {
    if (kind !== "audio") {
      return { buffer, ...destinoDaMidia({ kind, caminho, mime }, { mimeReal }), convertido: false, erro: null };
    }
    try {
      const mp3 = await converter(buffer, { ffmpeg, timeoutMs });
      if (!Buffer.isBuffer(mp3) || mp3.length === 0) throw new ErroConversao("conversão devolveu um arquivo vazio", "vazio");
      return { buffer: mp3, ...destinoDaMidia({ kind, caminho, mime }, { convertido: true }), convertido: true, erro: null };
    } catch (e) {
      const erro = erroCurto(e, 300);
      if (!avisou) {
        avisou = true;
        avisar(
          `não converti o áudio para MP3 (${erro}); subindo o arquivo original. ` +
            "Confira se o ffmpeg está instalado ou aponte o caminho em FFMPEG no ar1-ponte.env. " +
            "(Este aviso aparece uma vez por execução.)",
        );
      }
      return { buffer, ...destinoDaMidia({ kind, caminho, mime }, { mimeReal }), convertido: false, erro };
    }
  };
}
