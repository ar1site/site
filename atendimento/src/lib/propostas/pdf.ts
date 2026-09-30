import "server-only";

// PDF da proposta com a marca AR1 Films. Roda em função serverless, sem
// navegador: pdf-lib + fontes embutidas (Montserrat e Inter, com acentos).
// A4 retrato, de 1 a 3 páginas, fundo claro para impressão.

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { ErroPdf } from "./erros";
import {
  diaPorExtenso,
  MAXIMO_DE_PAGINAS,
  reaisComCentavos,
  TEXTO_A_DEFINIR,
  totalDaProposta,
  type Proposta,
} from "./proposta";

export { ErroPdf };

export const CONTATOS_DA_AR1 = {
  whatsapp: "(62) 98125-2338",
  email: "contato@ar1films.com",
  site: "ar1films.com",
} as const;

export interface EntradaPdf {
  proposta: Proposta;
  /** AR1-AAAAMMDD-XXXX */
  numero: string;
  /** Dia da emissão, AAAA-MM-DD (Brasília). */
  emitidaEm: string;
  /** Dia até quando vale, AAAA-MM-DD (Brasília). */
  validaAte: string;
}

export interface PdfGerado {
  bytes: Uint8Array;
  paginas: number;
}

// ------------------------------------------------------------------ medidas

const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 48;
const LARGURA_UTIL = LARGURA - 2 * MARGEM;
/** Altura da faixa escura com a logo, no alto da primeira página. */
const FAIXA = 92;
/** Onde o texto começa nas páginas seguintes. */
const TOPO_SEGUINTE = ALTURA - 78;
/** Abaixo disto fica o rodapé. */
const LIMITE_INFERIOR = 74;

const COBRE = rgb(184 / 255, 107 / 255, 69 / 255);
const COBRE_CLARO = rgb(208 / 255, 138 / 255, 99 / 255);
const PRETO = rgb(17 / 255, 19 / 255, 21 / 255);
const TEXTO = rgb(34 / 255, 38 / 255, 41 / 255);
const APOIO = rgb(98 / 255, 105 / 255, 109 / 255);
const LINHA = rgb(221 / 255, 216 / 255, 209 / 255);
const FUNDO_TOTAL = rgb(248 / 255, 240 / 255, 234 / 255);
const BRANCO = rgb(1, 1, 1);

// ------------------------------------------------------------------ arquivos

const PASTA_FONTES = path.join(process.cwd(), "recursos", "propostas", "fontes");
const CAMINHO_LOGO = path.join(process.cwd(), "public", "marca", "ar1-films-logo.png");

interface Arquivos {
  interRegular: Uint8Array;
  interSemiBold: Uint8Array;
  montserratBold: Uint8Array;
  montserratExtraBold: Uint8Array;
  logo: Uint8Array;
}

let arquivos: Promise<Arquivos> | null = null;

function lerArquivos(): Promise<Arquivos> {
  if (!arquivos) {
    arquivos = Promise.all([
      readFile(path.join(PASTA_FONTES, "Inter-Regular.ttf")),
      readFile(path.join(PASTA_FONTES, "Inter-SemiBold.ttf")),
      readFile(path.join(PASTA_FONTES, "Montserrat-Bold.ttf")),
      readFile(path.join(PASTA_FONTES, "Montserrat-ExtraBold.ttf")),
      readFile(CAMINHO_LOGO),
    ])
      .then(([interRegular, interSemiBold, montserratBold, montserratExtraBold, logo]) => ({
        interRegular,
        interSemiBold,
        montserratBold,
        montserratExtraBold,
        logo,
      }))
      .catch((e) => {
        arquivos = null;
        throw new ErroPdf(
          `Não foi possível ler as fontes ou a logo da proposta (${e instanceof Error ? e.message : "erro"}).`,
          500,
        );
      });
  }
  return arquivos;
}

// -------------------------------------------------------------------- texto

interface Fonte {
  pdf: PDFFont;
  caracteres: Set<number>;
}

function fonte(pdf: PDFFont): Fonte {
  return { pdf, caracteres: new Set(pdf.getCharacterSet()) };
}

/** Tira o que a fonte não sabe desenhar (emojis, símbolos raros) e espaços estranhos. */
function limpar(f: Fonte, texto: string): string {
  let saida = "";
  for (const ch of texto.normalize("NFC").replace(/[   \t]/g, " ")) {
    const codigo = ch.codePointAt(0) ?? 0;
    if (codigo < 32) continue;
    if (f.caracteres.has(codigo)) saida += ch;
  }
  return saida.replace(/ {2,}/g, " ").trim();
}

function largura(f: Fonte, texto: string, tamanho: number, espacamento = 0): number {
  return f.pdf.widthOfTextAtSize(texto, tamanho) + espacamento * texto.length;
}

/** Quebra o texto em linhas que cabem em `maximo`. Palavra maior que a linha é partida. */
function quebrar(f: Fonte, texto: string, tamanho: number, maximo: number, espacamento = 0): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    const limpo = limpar(f, paragrafo);
    if (!limpo) {
      if (linhas.length) linhas.push("");
      continue;
    }
    let atual = "";
    for (const palavra of limpo.split(" ")) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (largura(f, tentativa, tamanho, espacamento) <= maximo) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      atual = palavra;
      while (largura(f, atual, tamanho, espacamento) > maximo && atual.length > 1) {
        let corte = atual.length - 1;
        while (corte > 1 && largura(f, atual.slice(0, corte), tamanho, espacamento) > maximo) corte -= 1;
        linhas.push(atual.slice(0, corte));
        atual = atual.slice(corte);
      }
    }
    if (atual) linhas.push(atual);
  }
  while (linhas.length && linhas[linhas.length - 1] === "") linhas.pop();
  return linhas;
}

function maiusculas(texto: string): string {
  return texto.toLocaleUpperCase("pt-BR");
}

// ------------------------------------------------------------------ desenho

interface Estilo {
  fonte: Fonte;
  tamanho: number;
  cor: RGB;
  /** Espaço entre letras (pt). */
  espacamento?: number;
}

class Documento {
  readonly paginas: PDFPage[] = [];
  pagina!: PDFPage;
  y = 0;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly aoAbrirPagina: (doc: Documento, indice: number) => void,
  ) {
    this.novaPagina();
  }

  novaPagina(): void {
    this.pagina = this.pdf.addPage([LARGURA, ALTURA]);
    this.paginas.push(this.pagina);
    this.aoAbrirPagina(this, this.paginas.length - 1);
  }

  /** Garante `altura` livre; se não couber, abre outra página. */
  garantir(altura: number): void {
    if (this.y - altura < LIMITE_INFERIOR) this.novaPagina();
  }

  /**
   * Mantém um bloco inteiro na mesma página: se ele não cabe no que resta,
   * mas cabe numa página nova, começa na página nova.
   */
  manterJunto(altura: number): void {
    const cabeNumaPagina = altura <= TOPO_SEGUINTE - LIMITE_INFERIOR;
    if (cabeNumaPagina && this.y - altura < LIMITE_INFERIOR) this.novaPagina();
  }

  /** Escreve uma linha com a base em `y`. */
  linha(texto: string, x: number, y: number, estilo: Estilo, alinhar: "esquerda" | "direita" = "esquerda"): void {
    const limpo = limpar(estilo.fonte, texto);
    if (!limpo) return;
    const espacamento = estilo.espacamento ?? 0;
    const inicio = alinhar === "direita" ? x - largura(estilo.fonte, limpo, estilo.tamanho, espacamento) + espacamento : x;
    if (espacamento) this.pagina.pushOperators(setCharacterSpacing(espacamento));
    this.pagina.drawText(limpo, {
      x: inicio,
      y,
      size: estilo.tamanho,
      font: estilo.fonte.pdf,
      color: estilo.cor,
    });
    if (espacamento) this.pagina.pushOperators(setCharacterSpacing(0));
  }

  /**
   * Escreve um texto com quebra de linha a partir do cursor e desce o cursor.
   * Quebra de página acontece linha a linha.
   */
  paragrafo(texto: string, estilo: Estilo, opcoes: { x?: number; largura?: number; entrelinha?: number } = {}): void {
    const x = opcoes.x ?? MARGEM;
    const maximo = opcoes.largura ?? LARGURA_UTIL - (x - MARGEM);
    const passo = estilo.tamanho * (opcoes.entrelinha ?? 1.5);
    for (const l of quebrar(estilo.fonte, texto, estilo.tamanho, maximo, estilo.espacamento)) {
      this.garantir(passo);
      this.y -= passo;
      if (l) this.linha(l, x, this.y, estilo);
    }
  }

  regua(y: number, cor: RGB = LINHA, espessura = 0.6, x1 = MARGEM, x2 = LARGURA - MARGEM): void {
    this.pagina.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: espessura, color: cor });
  }
}

// ---------------------------------------------------------------- documento

export async function gerarPdfDaProposta(entrada: EntradaPdf): Promise<PdfGerado> {
  const { proposta: p, numero } = entrada;
  const dados = await lerArquivos();

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Cada fonte do jeito que sai certo (conferido desenhando e lendo de volta
  // letras, acentos, números e símbolos):
  //   - Inter vai INTEIRA: o subconjunto do pdf-lib perde letras dela (o texto
  //     sai com buracos). Por isso o PDF pesa cerca de 0,4 MB.
  //   - Montserrat vai em SUBCONJUNTO: inteira, o "$" da ExtraBold sai com a
  //     largura errada e é lido como outro caractere.
  // Ao trocar de fonte ou de versão do pdf-lib, confira de novo com uma imagem.
  const [interRegular, interSemiBold, montserratBold, montserratExtraBold] = await Promise.all([
    pdf.embedFont(dados.interRegular, { subset: false }),
    pdf.embedFont(dados.interSemiBold, { subset: false }),
    pdf.embedFont(dados.montserratBold, { subset: true }),
    pdf.embedFont(dados.montserratExtraBold, { subset: true }),
  ]);
  const logo: PDFImage = await pdf.embedPng(dados.logo);

  const corpo = fonte(interRegular);
  const forte = fonte(interSemiBold);
  const titulo = fonte(montserratBold);
  const destaque = fonte(montserratExtraBold);

  const estiloCorpo: Estilo = { fonte: corpo, tamanho: 10, cor: TEXTO };
  const estiloForte: Estilo = { fonte: forte, tamanho: 10, cor: PRETO };
  const estiloApoio: Estilo = { fonte: corpo, tamanho: 9, cor: APOIO };
  const estiloRotulo: Estilo = { fonte: titulo, tamanho: 7.5, cor: COBRE, espacamento: 0.5 };
  const estiloSecao: Estilo = { fonte: titulo, tamanho: 10.5, cor: PRETO, espacamento: 0.8 };

  const doc = new Documento(pdf, (d, indice) => {
    if (indice === 0) {
      // Faixa escura com a logo (a logo da AR1 é clara, feita para fundo escuro).
      d.pagina.drawRectangle({ x: 0, y: ALTURA - FAIXA, width: LARGURA, height: FAIXA, color: PRETO });
      d.pagina.drawRectangle({ x: 0, y: ALTURA - FAIXA - 3, width: LARGURA, height: 3, color: COBRE });
      const alturaLogo = 66;
      const larguraLogo = (logo.width / logo.height) * alturaLogo;
      d.pagina.drawImage(logo, {
        x: MARGEM - 9,
        y: ALTURA - FAIXA + (FAIXA - alturaLogo) / 2,
        width: larguraLogo,
        height: alturaLogo,
      });
      d.linha("PROPOSTA COMERCIAL", LARGURA - MARGEM, ALTURA - 45, {
        fonte: destaque,
        tamanho: 13,
        cor: BRANCO,
        espacamento: 0.9,
      }, "direita");
      d.linha(numero, LARGURA - MARGEM, ALTURA - 62, { fonte: forte, tamanho: 10, cor: COBRE_CLARO, espacamento: 0.4 }, "direita");
      d.y = ALTURA - FAIXA - 3;
      return;
    }
    // Páginas seguintes: cabeçalho fino.
    d.linha("AR1 FILMS", MARGEM, ALTURA - 46, { fonte: destaque, tamanho: 9.5, cor: PRETO, espacamento: 0.7 });
    d.linha(`PROPOSTA ${numero}`, LARGURA - MARGEM, ALTURA - 46, { fonte: titulo, tamanho: 7.5, cor: COBRE, espacamento: 0.5 }, "direita");
    d.regua(ALTURA - 56, COBRE, 1);
    d.y = TOPO_SEGUINTE;
  });

  /** Espaço que o título de uma seção ocupa. */
  const ALTURA_DA_SECAO = 39;

  /** Título de seção, sempre junto de pelo menos um pedaço do conteúdo. */
  function secao(nome: string, alturaMinimaDoConteudo = 30, blocoInteiro = false): void {
    if (blocoInteiro) doc.manterJunto(ALTURA_DA_SECAO + alturaMinimaDoConteudo);
    doc.garantir(34 + Math.min(alturaMinimaDoConteudo, 70));
    doc.y -= 30;
    doc.linha(maiusculas(nome), MARGEM, doc.y, estiloSecao);
    doc.pagina.drawRectangle({ x: MARGEM, y: doc.y - 7, width: 26, height: 2, color: COBRE });
    doc.y -= 9;
  }

  // Título e dados ----------------------------------------------------------
  doc.y -= 14;
  doc.paragrafo(maiusculas(p.titulo), { fonte: destaque, tamanho: 17, cor: PRETO, espacamento: 0.4 }, { entrelinha: 1.3 });
  doc.y -= 12;

  const colunas = [
    { rotulo: "Cliente", valor: p.cliente.nome, parte: 0.32 },
    { rotulo: "Empresa", valor: p.cliente.empresa ?? "", parte: 0.32 },
    { rotulo: "Data", valor: diaPorExtenso(entrada.emitidaEm), parte: 0.18 },
    { rotulo: "Válida até", valor: diaPorExtenso(entrada.validaAte), parte: 0.18 },
  ].filter((c) => c.valor);
  {
    const linhasDasColunas = colunas.map((c) => quebrar(forte, c.valor, 10.5, LARGURA_UTIL * c.parte - 14));
    const altura = 27 + Math.max(...linhasDasColunas.map((l) => l.length)) * 14 + 4;
    doc.garantir(altura);
    const topo = doc.y;
    let x = MARGEM;
    colunas.forEach((c, j) => {
      doc.linha(maiusculas(c.rotulo), x, topo - 12, estiloRotulo);
      linhasDasColunas[j].forEach((l, k) => doc.linha(l, x, topo - 27 - k * 14, { fonte: forte, tamanho: 10.5, cor: PRETO }));
      x += LARGURA_UTIL * c.parte;
    });
    doc.y = topo - altura;
  }
  doc.regua(doc.y, LINHA, 0.8);

  // Resumo ------------------------------------------------------------------
  if (p.resumo_do_pedido) {
    secao("Resumo do pedido");
    doc.paragrafo(p.resumo_do_pedido, estiloCorpo);
  }

  // Escopo ------------------------------------------------------------------
  if (p.escopo.length) {
    secao("Escopo", 40);
    p.escopo.forEach((e, i) => {
      doc.garantir(34);
      if (i > 0) doc.y -= 5;
      const x = MARGEM + 22;
      doc.y -= 15;
      doc.linha(String(i + 1).padStart(2, "0"), MARGEM, doc.y, { fonte: destaque, tamanho: 9.5, cor: COBRE });
      const nome = quebrar(forte, e.item, 10, LARGURA_UTIL - 22);
      nome.forEach((l, k) => {
        if (k > 0) {
          doc.garantir(15);
          doc.y -= 15;
        }
        doc.linha(l, x, doc.y, estiloForte);
      });
      if (e.descricao) doc.paragrafo(e.descricao, estiloCorpo, { x, largura: LARGURA_UTIL - 22 });
    });
  }

  function marcadores(itens: string[]): void {
    for (const item of itens) {
      const linhas = quebrar(corpo, item, 10, LARGURA_UTIL - 16);
      linhas.forEach((l, k) => {
        doc.garantir(15);
        doc.y -= 15;
        if (k === 0) {
          doc.pagina.drawRectangle({ x: MARGEM + 1, y: doc.y + 2.2, width: 4, height: 4, color: COBRE });
        }
        doc.linha(l, MARGEM + 16, doc.y, estiloCorpo);
      });
      doc.y -= 2;
    }
  }

  // Entregas ----------------------------------------------------------------
  if (p.entregas.length) {
    secao("Entregas");
    marcadores(p.entregas);
  }

  // Cronograma --------------------------------------------------------------
  if (p.cronograma.length) {
    const larguraPrazo = 170;
    const larguraEtapa = LARGURA_UTIL - larguraPrazo - 14;
    const alturaDaTabela = p.cronograma.reduce(
      (soma, e) =>
        soma +
        Math.max(quebrar(corpo, e.etapa, 10, larguraEtapa).length, quebrar(forte, e.prazo, 10, larguraPrazo).length, 1) * 14 +
        10,
      22,
    );
    secao("Cronograma", alturaDaTabela, true);
    doc.y -= 16;
    doc.linha("ETAPA", MARGEM, doc.y, estiloRotulo);
    doc.linha("PRAZO", LARGURA - MARGEM - larguraPrazo, doc.y, estiloRotulo);
    doc.y -= 6;
    doc.regua(doc.y, COBRE, 0.8);
    for (const etapa of p.cronograma) {
      const nome = quebrar(corpo, etapa.etapa, 10, larguraEtapa);
      const prazo = quebrar(forte, etapa.prazo, 10, larguraPrazo);
      const linhas = Math.max(nome.length, prazo.length, 1);
      const altura = linhas * 14 + 10;
      doc.garantir(altura);
      const topo = doc.y;
      nome.forEach((l, k) => doc.linha(l, MARGEM, topo - 15 - k * 14, estiloCorpo));
      prazo.forEach((l, k) =>
        doc.linha(l, LARGURA - MARGEM - larguraPrazo, topo - 15 - k * 14, {
          ...estiloForte,
          cor: etapa.prazo === TEXTO_A_DEFINIR ? APOIO : PRETO,
        }),
      );
      doc.y = topo - altura;
      doc.regua(doc.y);
    }
  }

  // Investimento ------------------------------------------------------------
  if (p.investimento.length) {
    const total = totalDaProposta(p.investimento);
    const larguraValor = 120;
    const larguraDescricao = LARGURA_UTIL - larguraValor - 14;
    const alturaDaTabela = p.investimento.reduce(
      (soma, item) => soma + Math.max(quebrar(corpo, item.descricao, 10, larguraDescricao).length, 1) * 14 + 10,
      22 + 36 + 22,
    );
    secao("Investimento", alturaDaTabela, true);
    doc.y -= 16;
    doc.linha("DESCRIÇÃO", MARGEM, doc.y, estiloRotulo);
    doc.linha("VALOR", LARGURA - MARGEM, doc.y, estiloRotulo, "direita");
    doc.y -= 6;
    doc.regua(doc.y, COBRE, 0.8);
    for (const item of p.investimento) {
      const descricao = quebrar(corpo, item.descricao, 10, larguraDescricao);
      const altura = Math.max(descricao.length, 1) * 14 + 10;
      doc.garantir(altura);
      const topo = doc.y;
      descricao.forEach((l, k) => doc.linha(l, MARGEM, topo - 15 - k * 14, estiloCorpo));
      if (item.valor === null) doc.linha(TEXTO_A_DEFINIR, LARGURA - MARGEM, topo - 15, { ...estiloCorpo, cor: APOIO }, "direita");
      else doc.linha(reaisComCentavos(item.valor), LARGURA - MARGEM, topo - 15, estiloForte, "direita");
      doc.y = topo - altura;
      doc.regua(doc.y);
    }

    const parcial = total.itensComValor > 0 && total.itensADefinir > 0;
    doc.garantir(parcial ? 58 : 42);
    doc.y -= 6;
    doc.pagina.drawRectangle({ x: MARGEM, y: doc.y - 30, width: LARGURA_UTIL, height: 30, color: FUNDO_TOTAL });
    doc.pagina.drawRectangle({ x: MARGEM, y: doc.y - 30, width: 3, height: 30, color: COBRE });
    doc.linha(parcial ? "TOTAL PARCIAL" : "TOTAL", MARGEM + 14, doc.y - 19, {
      fonte: titulo,
      tamanho: 9.5,
      cor: PRETO,
      espacamento: 0.7,
    });
    doc.linha(
      total.itensComValor > 0 ? reaisComCentavos(total.total) : TEXTO_A_DEFINIR,
      LARGURA - MARGEM - 12,
      doc.y - 20,
      { fonte: destaque, tamanho: 13, cor: total.itensComValor > 0 ? PRETO : APOIO },
      "direita",
    );
    doc.y -= 30;
    if (parcial) {
      doc.y -= 4;
      doc.paragrafo(
        total.itensADefinir === 1
          ? "O item a definir não entra no total parcial."
          : "Os itens a definir não entram no total parcial.",
        estiloApoio,
      );
    }
  }

  // Condições ---------------------------------------------------------------
  if (p.condicoes.length) {
    secao("Condições");
    marcadores(p.condicoes);
  }

  // Observações -------------------------------------------------------------
  if (p.observacoes) {
    secao("Observações");
    doc.paragrafo(p.observacoes, estiloCorpo);
  }

  // Fecho -------------------------------------------------------------------
  doc.garantir(52);
  doc.y -= 26;
  doc.regua(doc.y, LINHA, 0.8);
  doc.y -= 4;
  doc.paragrafo(
    `Proposta ${numero}, emitida em ${diaPorExtenso(entrada.emitidaEm)} e válida até ${diaPorExtenso(entrada.validaAte)} ` +
      `(${p.validade_dias} ${p.validade_dias === 1 ? "dia" : "dias"}).`,
    estiloApoio,
  );

  if (doc.paginas.length > MAXIMO_DE_PAGINAS) {
    throw new ErroPdf(
      `A proposta ficou com ${doc.paginas.length} páginas e o máximo é ${MAXIMO_DE_PAGINAS}. ` +
        "Encurte os textos ou junte itens e gere de novo.",
    );
  }

  // Rodapé com contatos e paginação ---------------------------------------------
  const contatos = `WhatsApp ${CONTATOS_DA_AR1.whatsapp}   ·   ${CONTATOS_DA_AR1.email}   ·   ${CONTATOS_DA_AR1.site}`;
  doc.paginas.forEach((pagina, i) => {
    doc.pagina = pagina;
    doc.regua(52, COBRE, 1);
    doc.linha("AR1 FILMS", MARGEM, 37, { fonte: destaque, tamanho: 8, cor: PRETO, espacamento: 0.6 });
    doc.linha(contatos, MARGEM, 24, { fonte: corpo, tamanho: 8.5, cor: APOIO });
    doc.linha(numero, LARGURA - MARGEM, 37, { fonte: forte, tamanho: 8, cor: APOIO }, "direita");
    doc.linha(`Página ${i + 1} de ${doc.paginas.length}`, LARGURA - MARGEM, 24, { fonte: corpo, tamanho: 8.5, cor: APOIO }, "direita");
  });

  const emissao = new Date(`${entrada.emitidaEm}T12:00:00-03:00`);
  pdf.setTitle(`Proposta ${numero} - ${p.titulo}`);
  pdf.setAuthor("AR1 Films");
  pdf.setSubject(`Proposta comercial para ${p.cliente.empresa || p.cliente.nome}`);
  pdf.setCreator("AR1 Atendimento");
  pdf.setProducer("AR1 Atendimento (pdf-lib)");
  pdf.setLanguage("pt-BR");
  if (!Number.isNaN(emissao.getTime())) {
    pdf.setCreationDate(emissao);
    pdf.setModificationDate(emissao);
  }

  const bytes = await pdf.save();
  return { bytes, paginas: doc.paginas.length };
}
