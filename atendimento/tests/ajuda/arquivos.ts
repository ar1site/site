// Gera arquivos mínimos (PDF e DOCX) em memória para os testes de extração,
// sem depender de arquivos binários no repositório.

import { crc32 } from "node:zlib";

// ------------------------------------------------------------------- PDF

function textoPdf(linha: string): string {
  return linha.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * PDF com uma página por item de `paginas`; cada página recebe as linhas
 * informadas (fonte Helvetica, WinAnsi: aceita acentos do português).
 * Página sem linhas = página sem texto (como um PDF escaneado).
 */
export function gerarPdf(paginas: string[][]): Uint8Array {
  const objetos: string[] = [];
  const idsDasPaginas = paginas.map((_, i) => 4 + i * 2);

  objetos[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objetos[2] = `<< /Type /Pages /Kids [${idsDasPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`;
  objetos[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  paginas.forEach((linhas, i) => {
    const idPagina = 4 + i * 2;
    const idConteudo = idPagina + 1;
    const comandos = linhas.length
      ? `BT /F1 12 Tf 72 720 Td 16 TL ${linhas.map((l) => `(${textoPdf(l)}) Tj T*`).join(" ")} ET`
      : "";
    objetos[idPagina] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${idConteudo} 0 R >>`;
    objetos[idConteudo] = `<< /Length ${Buffer.byteLength(comandos, "latin1")} >>\nstream\n${comandos}\nendstream`;
  });

  let corpo = "%PDF-1.4\n";
  const posicoes: number[] = [];
  for (let id = 1; id < objetos.length; id++) {
    posicoes[id] = Buffer.byteLength(corpo, "latin1");
    corpo += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(corpo, "latin1");
  corpo += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objetos.length; id++) {
    corpo += `${String(posicoes[id]).padStart(10, "0")} 00000 n \n`;
  }
  corpo += `trailer\n<< /Size ${objetos.length} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(corpo, "latin1"));
}

// ------------------------------------------------------------------- ZIP

/** ZIP sem compressão (método "store"), suficiente para um .docx de teste. */
export function gerarZip(arquivos: { nome: string; conteudo: string }[]): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let posicao = 0;

  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, "utf8");
    const dados = Buffer.from(a.conteudo, "utf8");
    const crc = crc32(dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(0, 8); // método: store
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x21, 12); // data (01/01/1980)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(posicao, 42);

    locais.push(local, nome, dados);
    centrais.push(central, nome);
    posicao += local.length + nome.length + dados.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(posicao, 16);

  return new Uint8Array(Buffer.concat([...locais, diretorio, fim]));
}

// ------------------------------------------------------------------ DOCX

function xml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Documento do Word com um parágrafo por item. */
export function gerarDocx(paragrafos: string[]): Uint8Array {
  const corpo = paragrafos
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${xml(p)}</w:t></w:r></w:p>`)
    .join("");
  return gerarZip([
    {
      nome: "[Content_Types].xml",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    },
    {
      nome: "_rels/.rels",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    },
    {
      nome: "word/document.xml",
      conteudo:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${corpo}</w:body></w:document>`,
    },
  ]);
}
