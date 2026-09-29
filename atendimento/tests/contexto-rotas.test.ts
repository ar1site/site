import { describe, expect, it } from "vitest";
import {
  extensaoDe,
  nomeSeguro,
  tamanhoEmBytes,
  tamanhoEmCaracteres,
  TAMANHO_MAXIMO_BYTES,
  tipoDoArquivo,
  tituloPadrao,
} from "@/lib/contexto/limites";
import { previaDe, resumirDocumento } from "@/lib/contexto/resumo";
import {
  caminhoNoBucket,
  caminhoPertenceAoAlvo,
  validarAlteracao,
  validarAlvo,
  validarListagem,
  validarNovoDocumento,
  validarPedidoUpload,
} from "@/lib/contexto/validar";
import type { DocContexto } from "@/lib/tipos";

const CONTATO = "3f2b8c1e-7a4d-4e9b-9c1a-5d6e7f8a9b0c";
const UUID_ARQUIVO = "11111111-2222-4333-8444-555555555555";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function erroDe(r: { ok: boolean; erro?: string }): string {
  expect(r.ok).toBe(false);
  return r.erro ?? "";
}

describe("tipos e nomes de arquivo", () => {
  it("reconhece o tipo pela extensão, mesmo com mime vazio ou trocado", () => {
    expect(tipoDoArquivo("Proposta.PDF", "")).toBe("pdf");
    expect(tipoDoArquivo("briefing.docx", DOCX)).toBe("docx");
    expect(tipoDoArquivo("notas.md", "")).toBe("md");
    expect(tipoDoArquivo("tabela.csv", "application/vnd.ms-excel")).toBe("csv");
    expect(tipoDoArquivo("sem-extensao", "text/plain; charset=utf-8")).toBe("txt");
  });

  it("recusa o que o bucket não aceita", () => {
    expect(tipoDoArquivo("antigo.doc", "application/msword")).toBeNull();
    expect(tipoDoArquivo("planilha.xlsx", "")).toBeNull();
    expect(tipoDoArquivo("foto.png", "application/pdf")).toBeNull();
    expect(tipoDoArquivo("sem-extensao", "")).toBeNull();
  });

  it("gera nome seguro e título padrão", () => {
    expect(nomeSeguro("Proposta – Gravação & Edição (v2).pdf")).toBe("Proposta-Gravacao-Edicao-v2.pdf");
    expect(nomeSeguro("../../etc/passwd.txt")).toBe("etc-passwd.txt");
    expect(nomeSeguro("çãõ.md")).toBe("cao.md");
    expect(nomeSeguro("???.csv")).toBe("arquivo.csv");
    expect(nomeSeguro(`${"a".repeat(200)}.docx`).length).toBeLessThanOrEqual(80);
    expect(extensaoDe("a.b.PDF")).toBe("pdf");
    expect(tituloPadrao("Tabela_de_preços 2026.pdf")).toBe("Tabela de preços 2026");
    expect(tituloPadrao(".pdf")).toBe(".pdf");
  });

  it("formata tamanhos", () => {
    expect(tamanhoEmCaracteres(0)).toBe("sem texto");
    expect(tamanhoEmCaracteres(850)).toBe("850 caracteres");
    expect(tamanhoEmCaracteres(1_500)).toBe("1,5 mil caracteres");
    expect(tamanhoEmCaracteres(3_000)).toBe("3 mil caracteres");
    expect(tamanhoEmCaracteres(12_400)).toBe("12 mil caracteres");
    expect(tamanhoEmBytes(540 * 1024)).toBe("540 KB");
    expect(tamanhoEmBytes(3.2 * 1024 * 1024)).toBe("3,2 MB");
    expect(tamanhoEmBytes(null)).toBe("");
  });
});

describe("validarAlvo", () => {
  it("aceita global sem contato e contato com id", () => {
    expect(validarAlvo("global", undefined)).toEqual({
      ok: true,
      dados: { escopo: "global", scope: "global", contactId: null, pasta: "global" },
    });
    expect(validarAlvo("contato", CONTATO.toUpperCase())).toEqual({
      ok: true,
      dados: { escopo: "contato", scope: "contact", contactId: CONTATO, pasta: CONTATO },
    });
    expect(validarAlvo("contact", CONTATO).ok).toBe(true);
  });

  it("recusa combinações inválidas", () => {
    expect(erroDe(validarAlvo("global", CONTATO))).toMatch(/não pertence/);
    expect(erroDe(validarAlvo("contato", undefined))).toBe("Contato inválido.");
    expect(erroDe(validarAlvo("contato", "123"))).toBe("Contato inválido.");
    expect(erroDe(validarAlvo("contato", `${CONTATO}' or 1=1`))).toBe("Contato inválido.");
    expect(erroDe(validarAlvo("outro", undefined))).toBe("Escopo inválido.");
    expect(erroDe(validarAlvo(undefined, undefined))).toBe("Escopo inválido.");
  });

  it("lê os parâmetros da listagem", () => {
    expect(validarListagem(new URLSearchParams("escopo=global")).ok).toBe(true);
    const r = validarListagem(new URLSearchParams(`escopo=contato&contact_id=${CONTATO}`));
    expect(r.ok && r.dados.contactId).toBe(CONTATO);
    expect(validarListagem(new URLSearchParams("escopo=contato")).ok).toBe(false);
    expect(validarListagem(new URLSearchParams("")).ok).toBe(false);
  });
});

describe("validarPedidoUpload", () => {
  const base = { escopo: "global", nome: "Tabela de preços.pdf", mime: "application/pdf", tamanho: 120_000 };

  it("aceita arquivo válido e devolve o mime do bucket", () => {
    const r = validarPedidoUpload({ ...base, nome: "tabela.csv", mime: "application/vnd.ms-excel" });
    expect(r.ok && r.dados.mime).toBe("text/csv");
    expect(r.ok && r.dados.tipo).toBe("csv");
    const limite = validarPedidoUpload({ ...base, tamanho: TAMANHO_MAXIMO_BYTES });
    expect(limite.ok).toBe(true);
  });

  it("recusa tipo, tamanho e nome inválidos", () => {
    expect(erroDe(validarPedidoUpload({ ...base, nome: "video.mp4", mime: "video/mp4" }))).toMatch(/Tipo de arquivo não aceito/);
    expect(erroDe(validarPedidoUpload({ ...base, tamanho: TAMANHO_MAXIMO_BYTES + 1 }))).toBe("O arquivo passa de 25 MB.");
    expect(erroDe(validarPedidoUpload({ ...base, tamanho: 0 }))).toBe("O arquivo está vazio.");
    expect(erroDe(validarPedidoUpload({ ...base, tamanho: "120000" }))).toBe("Tamanho do arquivo inválido.");
    expect(erroDe(validarPedidoUpload({ ...base, tamanho: -1 }))).toBe("Tamanho do arquivo inválido.");
    expect(erroDe(validarPedidoUpload({ ...base, nome: "" }))).toBe("Arquivo sem nome.");
    expect(erroDe(validarPedidoUpload({ ...base, nome: "../segredo.pdf" }))).toBe("Nome de arquivo inválido.");
    expect(erroDe(validarPedidoUpload({ ...base, escopo: "contato" }))).toBe("Contato inválido.");
    expect(erroDe(validarPedidoUpload(null))).toBe("Pedido inválido.");
    expect(erroDe(validarPedidoUpload([]))).toBe("Pedido inválido.");
  });

  it("monta o caminho <global|contato>/<uuid>-<nome seguro>", () => {
    const global = validarAlvo("global", undefined);
    const contato = validarAlvo("contato", CONTATO);
    if (!global.ok || !contato.ok) throw new Error("alvo inválido");
    expect(caminhoNoBucket(global.dados, "Tabela de preços.pdf", UUID_ARQUIVO)).toBe(
      `global/${UUID_ARQUIVO}-Tabela-de-precos.pdf`,
    );
    const caminho = caminhoNoBucket(contato.dados, "Briefing João.docx", UUID_ARQUIVO);
    expect(caminho).toBe(`${CONTATO}/${UUID_ARQUIVO}-Briefing-Joao.docx`);
    expect(caminhoPertenceAoAlvo(caminho, contato.dados)).toBe(true);
    expect(caminhoPertenceAoAlvo(caminho, global.dados)).toBe(false);
    expect(caminhoPertenceAoAlvo(`global/../${CONTATO}/x.pdf`, global.dados)).toBe(false);
    expect(caminhoPertenceAoAlvo("global/qualquer-coisa.pdf", global.dados)).toBe(false);
    expect(caminhoPertenceAoAlvo(`global/pasta/${UUID_ARQUIVO}-a.pdf`, global.dados)).toBe(false);
  });
});

describe("validarNovoDocumento", () => {
  it("aceita texto digitado", () => {
    const r = validarNovoDocumento({ escopo: "global", titulo: "  Perguntas   frequentes ", texto: "Linha 1\r\nLinha 2\u0000 " });
    expect(r).toEqual({
      ok: true,
      dados: {
        tipo: "texto",
        alvo: { escopo: "global", scope: "global", contactId: null, pasta: "global" },
        titulo: "Perguntas frequentes",
        texto: "Linha 1\nLinha 2",
      },
    });
  });

  it("recusa texto sem título, vazio ou grande demais", () => {
    expect(erroDe(validarNovoDocumento({ escopo: "global", texto: "algo" }))).toBe("Informe um título.");
    expect(erroDe(validarNovoDocumento({ escopo: "global", titulo: "T", texto: "   " }))).toBe("Escreva o texto.");
    expect(erroDe(validarNovoDocumento({ escopo: "global", titulo: "T" }))).toBe("Escreva o texto.");
    expect(erroDe(validarNovoDocumento({ escopo: "global", titulo: "T".repeat(201), texto: "a" }))).toMatch(/no máximo 200/);
    expect(erroDe(validarNovoDocumento({ escopo: "global", titulo: "T", texto: "a".repeat(300_001) }))).toMatch(/limite/);
    expect(validarNovoDocumento({ escopo: "global", titulo: "T", texto: "a".repeat(300_000) }).ok).toBe(true);
  });

  it("aceita arquivo já enviado e usa o nome como título padrão", () => {
    const path = `${CONTATO}/${UUID_ARQUIVO}-Proposta-Souza.docx`;
    const r = validarNovoDocumento({
      escopo: "contato",
      contact_id: CONTATO,
      path,
      nome: "Proposta Souza.docx",
      mime: DOCX,
      tamanho: 45_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok || r.dados.tipo !== "arquivo") throw new Error("esperava arquivo");
    expect(r.dados.titulo).toBe("Proposta Souza");
    expect(r.dados.path).toBe(path);
    expect(r.dados.arquivo).toEqual({ nome: "Proposta Souza.docx", tipo: "docx", mime: DOCX, tamanho: 45_000 });

    const comTitulo = validarNovoDocumento({
      escopo: "contato",
      contact_id: CONTATO,
      titulo: "Proposta enviada em setembro",
      path,
      nome: "Proposta Souza.docx",
      mime: DOCX,
      tamanho: 45_000,
    });
    expect(comTitulo.ok && comTitulo.dados.titulo).toBe("Proposta enviada em setembro");
  });

  it("recusa caminho de outra pasta e mistura de texto com arquivo", () => {
    const arquivo = { nome: "a.pdf", mime: "application/pdf", tamanho: 10 };
    expect(
      erroDe(validarNovoDocumento({ escopo: "contato", contact_id: CONTATO, path: `global/${UUID_ARQUIVO}-a.pdf`, ...arquivo })),
    ).toBe("Caminho do arquivo inválido.");
    expect(erroDe(validarNovoDocumento({ escopo: "global", path: 123, ...arquivo }))).toBe("Caminho do arquivo inválido.");
    expect(
      erroDe(validarNovoDocumento({ escopo: "global", path: `global/${UUID_ARQUIVO}-a.pdf`, texto: "x", titulo: "T", ...arquivo })),
    ).toBe("Envie texto ou arquivo, não os dois.");
  });
});

describe("validarAlteracao", () => {
  it("aceita título, texto (só em documento de texto) e ativo", () => {
    expect(validarAlteracao({ title: " Novo  título " }, "file")).toEqual({ ok: true, dados: { title: "Novo título" } });
    expect(validarAlteracao({ active: false }, "file")).toEqual({ ok: true, dados: { active: false } });
    expect(validarAlteracao({ title: "T", content: "novo texto", active: true }, "text")).toEqual({
      ok: true,
      dados: { title: "T", content: "novo texto", active: true },
    });
  });

  it("recusa o que não pode", () => {
    expect(erroDe(validarAlteracao({ content: "x" }, "file"))).toMatch(/não pode ser editado/);
    expect(erroDe(validarAlteracao({ content: "" }, "text"))).toBe("Escreva o texto.");
    expect(erroDe(validarAlteracao({ title: "" }, "text"))).toBe("Informe um título.");
    expect(erroDe(validarAlteracao({ active: "sim" }, "text"))).toMatch(/Usar na IA/);
    expect(erroDe(validarAlteracao({}, "text"))).toBe("Nada para alterar.");
    expect(erroDe(validarAlteracao({ scope: "global", file_path: "x" }, "text"))).toBe("Nada para alterar.");
    expect(erroDe(validarAlteracao(null, "text"))).toBe("Pedido inválido.");
  });
});

describe("resumo da lista", () => {
  const doc: DocContexto = {
    id: UUID_ARQUIVO,
    scope: "global",
    contact_id: null,
    title: "FAQ",
    kind: "text",
    content: `Pergunta:   o que é?\n\n${"resposta ".repeat(100)}`,
    content_truncated: false,
    file_path: null,
    file_name: null,
    file_mime: null,
    file_size: null,
    active: true,
    created_by: null,
    created_at: "2026-09-29T12:00:00.000Z",
    updated_at: "2026-09-29T12:00:00.000Z",
  };

  it("manda tamanho e prévia, sem o conteúdo inteiro", () => {
    const r = resumirDocumento(doc);
    expect("content" in r).toBe(false);
    expect(r.chars).toBe(doc.content.length);
    expect(r.previa.startsWith("Pergunta: o que é? resposta")).toBe(true);
    expect(r.previa.length).toBeLessThanOrEqual(201);
    expect(r.previa.endsWith("…")).toBe(true);
    expect(r.title).toBe("FAQ");
  });

  it("arquivo sem texto vira prévia vazia", () => {
    expect(resumirDocumento({ ...doc, content: "" })).toMatchObject({ chars: 0, previa: "" });
    expect(previaDe("curto")).toBe("curto");
  });
});
