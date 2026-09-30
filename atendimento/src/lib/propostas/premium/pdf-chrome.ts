import "server-only";

// PDF premium: o Chrome headless abre a MESMA página pública da proposta em
// modo de impressão (uma lâmina por seção, A4 paisagem, imagens de fundo) e
// imprime. Na Vercel usa o Chromium do @sparticuz/chromium-min (o pacote vem de
// CHROMIUM_PACK_URL); fora dela, um Chrome/Edge local (variável CHROME ou os
// caminhos conhecidos). Se nada disso funcionar, quem chama cai no pdf-lib.
//
// Há um prazo TOTAL (abrir, carregar, imprimir): a rota tem 60 s e precisa de
// folga para a reserva (pdf-lib) e o upload se o Chrome travar.

import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import { env } from "../../env";

export class ErroChrome extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroChrome";
  }
}

/** Prazo total do Chrome (download do Chromium na partida a frio + abrir + imprimir). */
export const PRAZO_TOTAL_CHROME_MS = 35_000;

const CAMINHOS_LOCAIS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

function naNuvem(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
}

async function abrirNavegador(): Promise<{ navegador: Browser; motor: string }> {
  const local = env.chromeLocal ?? CAMINHOS_LOCAIS.find((c) => existsSync(c)) ?? null;

  if (!naNuvem() && local) {
    const navegador = await puppeteer.launch({
      executablePath: local,
      headless: "shell",
      args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars"],
    });
    return { navegador, motor: `chrome local (${local})` };
  }

  // Vercel / Lambda: Chromium mínimo, com o binário baixado do pacote (como no
  // README do @sparticuz/chromium-min: headless "shell" e os argumentos dele).
  let chromium: typeof import("@sparticuz/chromium-min").default;
  try {
    chromium = (await import("@sparticuz/chromium-min")).default;
  } catch (e) {
    throw new ErroChrome(`@sparticuz/chromium-min não está disponível (${e instanceof Error ? e.message : "erro"}).`);
  }
  let executavel: string;
  try {
    executavel = await chromium.executablePath(env.chromiumPackUrl);
  } catch (e) {
    throw new ErroChrome(
      `Não foi possível baixar o Chromium de CHROMIUM_PACK_URL (${env.chromiumPackUrl}): ${e instanceof Error ? e.message : "erro"}.`,
    );
  }
  const navegador = await puppeteer.launch({
    executablePath: executavel,
    args: await puppeteer.defaultArgs({ args: [...chromium.args, "--hide-scrollbars"], headless: "shell" }),
    headless: "shell",
  });
  return { navegador, motor: `chromium ${env.chromiumPackUrl}` };
}

export interface PdfPeloChrome {
  bytes: Uint8Array;
  paginas: number;
  motor: string;
}

/** Corre `tarefa` com prazo; ao estourar, chama `aoEstourar` (fecha o navegador) e lança. */
async function comPrazo<T>(tarefa: Promise<T>, prazoMs: number, aoEstourar: () => void): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, falhar) => {
    relogio = setTimeout(() => {
      aoEstourar();
      falhar(new ErroChrome(`O Chrome passou de ${Math.round(prazoMs / 1000)} s e foi interrompido.`));
    }, prazoMs);
  });
  try {
    return await Promise.race([tarefa, limite]);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/**
 * Imprime a página `url` em PDF. A URL já leva a assinatura de impressão
 * (?impressao=…); nenhum cabeçalho com segredo é enviado. Estourando o prazo
 * total, o navegador é fechado e o erro volta para quem chama usar a reserva.
 */
export async function imprimirPagina(url: string, opcoes: { prazoMs?: number } = {}): Promise<PdfPeloChrome> {
  const prazo = opcoes.prazoMs ?? PRAZO_TOTAL_CHROME_MS;
  const inicio = Date.now();
  let navegadorAberto: Browser | null = null;
  const fechar = () => {
    navegadorAberto?.close().catch(() => undefined);
  };

  const trabalho = (async (): Promise<PdfPeloChrome> => {
    let aberto: { navegador: Browser; motor: string };
    try {
      aberto = await abrirNavegador();
    } catch (e) {
      if (e instanceof ErroChrome) throw e;
      throw new ErroChrome(`O Chrome não abriu: ${e instanceof Error ? e.message : "erro"}.`);
    }
    navegadorAberto = aberto.navegador;
    const restante = () => Math.max(5_000, prazo - (Date.now() - inicio));
    try {
      const pagina = await aberto.navegador.newPage();
      pagina.setDefaultTimeout(restante());
      await pagina.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
      await pagina.emulateMediaType("print");
      const resposta = await pagina.goto(url, { waitUntil: "networkidle0", timeout: restante() });
      if (!resposta || !resposta.ok()) {
        throw new ErroChrome(`A página da proposta respondeu ${resposta?.status() ?? "sem status"}.`);
      }
      // Espera as fontes e as imagens de fundo (as de fundo não entram no networkidle de forma confiável).
      await pagina.evaluate(async () => {
        await document.fonts.ready;
        const urls = new Set<string>();
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-fundo]"))) {
          const u = el.dataset.fundo;
          if (u) urls.add(u);
        }
        await Promise.all(
          [...urls].map(
            (u) =>
              new Promise<void>((ok) => {
                const img = new Image();
                img.onload = () => ok();
                img.onerror = () => ok();
                img.src = u;
              }),
          ),
        );
      });
      const pdf = await pagina.pdf({
        format: "a4",
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        timeout: restante(),
      });
      const bytes = new Uint8Array(pdf);
      const documento = await PDFDocument.load(bytes);
      return { bytes, paginas: documento.getPageCount(), motor: aberto.motor };
    } catch (e) {
      if (e instanceof ErroChrome) throw e;
      throw new ErroChrome(`Falha ao imprimir a página: ${e instanceof Error ? e.message : "erro"}.`);
    } finally {
      await aberto.navegador.close().catch(() => undefined);
    }
  })();

  // Se o prazo estourar, o trabalho ainda pode lançar depois: evita "unhandled rejection".
  trabalho.catch(() => undefined);
  return comPrazo(trabalho, prazo, fechar);
}
