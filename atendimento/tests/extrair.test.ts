import { describe, expect, it } from "vitest";
import {
  decodificarTexto,
  ErroExtracao,
  extrairTexto,
  limitarTexto,
  normalizarTexto,
} from "@/lib/contexto/extrair";
import { LIMITE_CARACTERES } from "@/lib/contexto/limites";
import { gerarDocx, gerarPdf } from "./ajuda/arquivos";

const FRASE = "Orçamento de gravação: R$ 3.500,00 à vista, com edição e captação de áudio.";

describe("texto puro", () => {
  it("lê .txt em UTF-8 com acentos", async () => {
    const r = await extrairTexto(new TextEncoder().encode(FRASE), { nome: "precos.txt", mime: "text/plain" });
    expect(r).toEqual({ texto: FRASE, truncado: false });
  });

  it("tira o BOM do UTF-8", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Olá")]);
    const r = await extrairTexto(bytes, { nome: "a.txt" });
    expect(r.texto).toBe("Olá");
  });

  it("cai para latin1 quando o arquivo não é UTF-8 válido", async () => {
    const bytes = new Uint8Array(Buffer.from(FRASE, "latin1"));
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toThrow();
    const r = await extrairTexto(bytes, { nome: "antigo.txt", mime: "text/plain" });
    expect(r.texto).toBe(FRASE);
  });

  it("lê UTF-16 com BOM (texto salvo pelo Bloco de Notas antigo)", () => {
    const corpo = Buffer.from("Ação", "utf16le");
    expect(decodificarTexto(new Uint8Array([0xff, 0xfe, ...corpo]))).toContain("Ação");
  });

  it("lê .md e .csv mesmo com mime vazio ou trocado pelo navegador", async () => {
    const md = await extrairTexto(new TextEncoder().encode("# Serviços\n\n- Podcast"), { nome: "servicos.md", mime: "" });
    expect(md.texto).toBe("# Serviços\n\n- Podcast");
    const csv = await extrairTexto(new TextEncoder().encode("serviço;preço\r\npodcast;1500\r\n"), {
      nome: "tabela.csv",
      mime: "application/vnd.ms-excel",
    });
    expect(csv.texto).toBe("serviço;preço\npodcast;1500");
  });

  it("recusa tipo não aceito", async () => {
    await expect(extrairTexto(new Uint8Array([1, 2, 3]), { nome: "foto.png", mime: "image/png" })).rejects.toBeInstanceOf(
      ErroExtracao,
    );
  });
});

describe("normalizarTexto e limitarTexto", () => {
  it("remove bytes nulos e controle, junta espaços e limita linhas em branco", () => {
    const bruto = "﻿Título\u0000  com   espaços\t\tdemais \r\n\r\n\r\n\r\nfim\u0007 \n";
    expect(normalizarTexto(bruto)).toBe("Título com espaços demais\n\nfim");
  });

  it("corta no limite e marca truncado", () => {
    const grande = "a".repeat(LIMITE_CARACTERES + 50);
    const r = limitarTexto(grande);
    expect(r.truncado).toBe(true);
    expect(r.texto.length).toBe(LIMITE_CARACTERES);
    expect(limitarTexto("curto")).toEqual({ texto: "curto", truncado: false });
  });

  it("não parte um emoji ao meio", () => {
    const r = limitarTexto("ab😀cd", 3);
    expect(r.texto).toBe("ab");
    expect(r.truncado).toBe(true);
  });

  it("marca truncado na extração de um arquivo grande", async () => {
    const bytes = new TextEncoder().encode("palavra ".repeat(40_000)); // 320 mil caracteres
    const r = await extrairTexto(bytes, { nome: "grande.txt" });
    expect(r.truncado).toBe(true);
    expect(r.texto.length).toBeLessThanOrEqual(LIMITE_CARACTERES);
  });
});

describe("docx", () => {
  it("extrai os parágrafos com acentos", async () => {
    const docx = gerarDocx(["Proposta para a Souza Eventos", FRASE, "Validade: 15 dias."]);
    const r = await extrairTexto(docx, {
      nome: "proposta.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(r.truncado).toBe(false);
    expect(r.texto).toBe(`Proposta para a Souza Eventos\n\n${FRASE}\n\nValidade: 15 dias.`);
  });

  it("dá erro legível quando o arquivo não é um docx de verdade", async () => {
    await expect(
      extrairTexto(new TextEncoder().encode("isto não é um zip"), { nome: "quebrado.docx" }),
    ).rejects.toThrow(/Word/);
  });
});

describe("pdf", () => {
  it("extrai o texto juntando as páginas", async () => {
    const pdf = gerarPdf([
      ["Tabela de preços AR1", "Gravação de podcast: R$ 1.500,00"],
      ["Condições: 50% na reserva da data"],
    ]);
    const r = await extrairTexto(pdf, { nome: "precos.pdf", mime: "application/pdf" });
    expect(r.paginas).toBe(2);
    expect(r.truncado).toBe(false);
    expect(r.texto).toContain("Tabela de preços AR1");
    expect(r.texto).toContain("Gravação de podcast: R$ 1.500,00");
    expect(r.texto).toContain("Condições: 50% na reserva da data");
    expect(r.texto.indexOf("Tabela")).toBeLessThan(r.texto.indexOf("Condições"));
  });

  it("PDF sem texto (escaneado) não é erro: volta texto vazio", async () => {
    const r = await extrairTexto(gerarPdf([[]]), { nome: "escaneado.pdf", mime: "application/pdf" });
    expect(r).toEqual({ texto: "", truncado: false, paginas: 1 });
  });

  it("dá erro legível quando o PDF está corrompido", async () => {
    await expect(
      extrairTexto(new TextEncoder().encode("não sou um pdf"), { nome: "quebrado.pdf" }),
    ).rejects.toThrow(/PDF/);
  });
});
