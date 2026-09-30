import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { CONTATOS_DA_AR1, ErroPdf, gerarPdfDaProposta } from "@/lib/propostas/pdf";
import { LIMITES, type Proposta } from "@/lib/propostas/proposta";
import { PROPOSTA_EXEMPLO } from "./ajuda/proposta";

const BASE = {
  numero: "AR1-20260930-0001",
  emitidaEm: "2026-09-30",
  validaAte: "2026-10-15",
};

/** Texto de cada página, com os espaços normalizados. */
async function textoDasPaginas(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t) => t.replace(/\s+/g, " ").trim());
}

describe("PDF da proposta", () => {
  it("gera um A4 retrato com os textos e os acentos certos", async () => {
    const { bytes, paginas } = await gerarPdfDaProposta({ proposta: PROPOSTA_EXEMPLO, ...BASE });

    // Guarda o exemplo para conferência visual: PDF_EXEMPLO_SAIDA=<pasta> npm test
    const saida = process.env.PDF_EXEMPLO_SAIDA;
    if (saida) {
      mkdirSync(saida, { recursive: true });
      writeFileSync(path.join(saida, "proposta-exemplo.pdf"), bytes);
    }

    // Abre com a própria biblioteca que gerou.
    const aberto = await PDFDocument.load(bytes);
    expect(aberto.getPageCount()).toBe(2);
    expect(paginas).toBe(2);
    for (const pagina of aberto.getPages()) {
      const { width, height } = pagina.getSize();
      expect(Math.round(width)).toBe(595);
      expect(Math.round(height)).toBe(842);
    }
    expect(aberto.getTitle()).toBe("Proposta AR1-20260930-0001 - Podcast itinerante na feira de noivas");
    expect(aberto.getAuthor()).toBe("AR1 Films");

    const textos = await textoDasPaginas(bytes);
    expect(textos).toHaveLength(2);
    const texto = textos.join(" ");
    // Títulos em caixa alta, com acento.
    expect(texto).toContain("PROPOSTA COMERCIAL");
    expect(texto).toContain("PODCAST ITINERANTE NA FEIRA DE NOIVAS");
    expect(texto).toContain("VÁLIDA ATÉ");
    expect(texto).toContain("CONDIÇÕES");
    expect(texto).toContain("OBSERVAÇÕES");
    expect(texto).toContain("DESCRIÇÃO");
    // Corpo com acentos do português.
    expect(texto).toContain("Pré-produção");
    expect(texto).toContain("Pós-produção");
    expect(texto).toContain("Centro de Convenções de Goiânia");
    expect(texto).toContain("captação de áudio e direção");
    expect(texto).toContain("Transmissão ao vivo opcional");
    // Número, datas, validade e contatos.
    expect(texto).toContain("AR1-20260930-0001");
    expect(texto).toContain("30/09/2026");
    expect(texto).toContain("15/10/2026");
    expect(texto).toContain("válida até 15/10/2026 (15 dias)");
    expect(texto).toContain(`WhatsApp ${CONTATOS_DA_AR1.whatsapp}`);
    expect(texto).toContain(CONTATOS_DA_AR1.email);
    expect(texto).toContain(CONTATOS_DA_AR1.site);
    expect(textos[0]).toContain("Página 1 de 2");
    expect(textos[1]).toContain("Página 2 de 2");
    // Valores: com centavos, "a definir" e total parcial.
    expect(texto).toContain("R$ 5.600,00");
    expect(texto).toContain("R$ 1.250,50");
    expect(texto).toContain("a definir");
    expect(texto).toContain("TOTAL PARCIAL");
    expect(texto).toContain("R$ 6.850,50");
    expect(texto).toContain("O item a definir não entra no total parcial.");
    // A tabela do investimento não se divide entre páginas.
    const comTabela = textos.filter((t) => t.includes("INVESTIMENTO"));
    expect(comTabela).toHaveLength(1);
    expect(comTabela[0]).toContain("R$ 5.600,00");
    expect(comTabela[0]).toContain("TOTAL PARCIAL");
  });

  it("proposta curta cabe em uma página", async () => {
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      escopo: PROPOSTA_EXEMPLO.escopo.slice(0, 2),
      entregas: PROPOSTA_EXEMPLO.entregas.slice(0, 2),
      cronograma: [],
      condicoes: PROPOSTA_EXEMPLO.condicoes.slice(0, 1),
      observacoes: null,
    };
    const { bytes, paginas } = await gerarPdfDaProposta({ proposta, ...BASE });
    expect(paginas).toBe(1);
    const [texto] = await textoDasPaginas(bytes);
    expect(texto).toContain("Página 1 de 1");
    expect(texto).not.toContain("CRONOGRAMA");
    expect(texto).not.toContain("OBSERVAÇÕES");
  });

  it("sem nenhum valor, o total sai como a definir", async () => {
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      investimento: [{ descricao: "Filme institucional", valor: null }],
    };
    const { bytes } = await gerarPdfDaProposta({ proposta, ...BASE });
    const texto = (await textoDasPaginas(bytes)).join(" ");
    expect(texto).not.toContain("R$");
    expect(texto).not.toContain("TOTAL PARCIAL");
    expect(texto).toMatch(/TOTAL a definir/);
  });

  it("com todos os valores, mostra o total cheio", async () => {
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      investimento: [
        { descricao: "Gravação", valor: 4800 },
        { descricao: "Edição", valor: 1200 },
      ],
    };
    const { bytes } = await gerarPdfDaProposta({ proposta, ...BASE });
    const texto = (await textoDasPaginas(bytes)).join(" ");
    expect(texto).toContain("R$ 6.000,00");
    expect(texto).not.toContain("TOTAL PARCIAL");
    expect(texto).not.toContain("a definir não entra");
  });

  it("proposta longa vira duas ou três páginas, com paginação e rodapé em todas", async () => {
    const frase = "Captação com três câmeras, direção no local, iluminação e áudio dedicados à gravação. ";
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      escopo: Array.from({ length: 10 }, (_, i) => ({
        item: `Etapa de produção número ${i + 1}`,
        descricao: frase.repeat(3).trim(),
      })),
      entregas: Array.from({ length: 10 }, (_, i) => `Entrega ${i + 1}: vídeo editado com correção de cor e áudio tratado`),
    };
    const { bytes, paginas } = await gerarPdfDaProposta({ proposta, ...BASE });
    expect(paginas).toBeGreaterThanOrEqual(2);
    expect(paginas).toBeLessThanOrEqual(3);
    const aberto = await PDFDocument.load(bytes);
    expect(aberto.getPageCount()).toBe(paginas);

    const textos = await textoDasPaginas(bytes);
    textos.forEach((texto, i) => {
      expect(texto).toContain(`Página ${i + 1} de ${paginas}`);
      expect(texto).toContain(CONTATOS_DA_AR1.email);
      expect(texto).toContain("AR1-20260930-0001");
    });
    // A logo e o título só na primeira; as seguintes têm o cabeçalho fino.
    expect(textos[0]).toContain("PROPOSTA COMERCIAL");
    expect(textos[1]).toContain("PROPOSTA AR1-20260930-0001");
    expect(textos[1]).not.toContain("PROPOSTA COMERCIAL");
  });

  it("recusa proposta que passa de três páginas, com mensagem clara", async () => {
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      resumo_do_pedido: "Resumo do pedido com bastante detalhe sobre o evento. ".repeat(22).trim(),
      escopo: Array.from({ length: LIMITES.itensDeEscopo }, (_, i) => ({
        item: `Item ${i + 1}`,
        descricao: "Descrição longa do item de escopo, com muitos detalhes de produção. ".repeat(5).trim(),
      })),
      entregas: Array.from({ length: LIMITES.entregas }, () => "Entrega com descrição bem comprida. ".repeat(5).trim()),
      condicoes: Array.from({ length: LIMITES.condicoes }, () => "Condição comercial bem detalhada. ".repeat(8).trim()),
      observacoes: "Observação longa. ".repeat(55).trim(),
    };
    await expect(gerarPdfDaProposta({ proposta, ...BASE })).rejects.toThrow(ErroPdf);
    await expect(gerarPdfDaProposta({ proposta, ...BASE })).rejects.toThrow(/máximo é 3/);
  });

  it("ignora o que a fonte não desenha (emoji) sem quebrar o documento", async () => {
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      titulo: "Gravação de podcast 🎙️ no estúdio",
      observacoes: "Cliente pediu “urgência” — confirmar data.\tTabulação e espaço duro.",
    };
    const { bytes } = await gerarPdfDaProposta({ proposta, ...BASE });
    const texto = (await textoDasPaginas(bytes)).join(" ");
    expect(texto).toContain("GRAVAÇÃO DE PODCAST NO ESTÚDIO");
    expect(texto).toContain("Cliente pediu “urgência” — confirmar data. Tabulação e espaço duro.");
  });

  it("letras, acentos, números e símbolos são lidos de volta iguais em todas as fontes", async () => {
    const acentos = "ÁÀÂÃÉÊÍÓÔÕÚÜÇ áàâãéêíóôõúüç";
    const simbolos = "R$ 1.234,56 50% & @ # + = / ( ) [ ] ! ? ; : º ª ° § € “ ” ‘ ’ – — …";
    const proposta: Proposta = {
      ...PROPOSTA_EXEMPLO,
      // Montserrat ExtraBold (caixa alta)
      titulo: `Título ${acentos} 0123456789 R$ 50% & @`,
      // Inter SemiBold
      cliente: { nome: `Cliente ${acentos}`, empresa: `Empresa ${simbolos}` },
      // Inter Regular
      resumo_do_pedido: `ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789\n${acentos}\n${simbolos}`,
      escopo: [],
      entregas: [],
      cronograma: [],
      condicoes: [],
      observacoes: null,
      investimento: [{ descricao: "Valor em destaque", valor: 9876543.21 }],
    };
    const { bytes } = await gerarPdfDaProposta({ proposta, ...BASE });
    const texto = (await textoDasPaginas(bytes)).join(" ");
    expect(texto).toContain(`TÍTULO ${acentos.toLocaleUpperCase("pt-BR")} 0123456789 R$ 50% & @`);
    expect(texto).toContain(`Cliente ${acentos}`);
    expect(texto).toContain(`Empresa ${simbolos}`);
    expect(texto).toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789");
    expect(texto).toContain(simbolos);
    // O total usa a Montserrat ExtraBold, inclusive o cifrão.
    expect(texto).toContain("TOTAL R$ 9.876.543,21");
  });
});
