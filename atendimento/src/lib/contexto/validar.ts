// Validação das entradas das rotas /api/contexto. Puro (sem banco), testável.

import type { EscopoContexto, EscopoContextoBanco } from "../tipos";
import {
  LIMITE_CARACTERES,
  LIMITE_NOME_ARQUIVO,
  LIMITE_TITULO,
  MIME_POR_EXTENSAO,
  nomeSeguro,
  TAMANHO_MAXIMO_BYTES,
  TIPOS_ACEITOS_LEGIVEL,
  tipoDoArquivo,
  tituloPadrao,
  type TipoArquivo,
} from "./limites";

export type Validado<T> = { ok: true; dados: T } | { ok: false; erro: string };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Alvo {
  escopo: EscopoContexto;
  /** Escopo como o banco guarda. */
  scope: EscopoContextoBanco;
  contactId: string | null;
  /** Primeira pasta do caminho no Storage: "global" ou o id do contato. */
  pasta: string;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function falha(erro: string): { ok: false; erro: string } {
  return { ok: false, erro };
}

/** Escopo + contato. Aceita "contato" (interface) e "contact" (banco). */
export function validarAlvo(escopo: unknown, contactId: unknown): Validado<Alvo> {
  if (escopo === "global") {
    if (contactId !== undefined && contactId !== null && contactId !== "") {
      return falha("A base de conhecimento da AR1 não pertence a um contato.");
    }
    return { ok: true, dados: { escopo: "global", scope: "global", contactId: null, pasta: "global" } };
  }
  if (escopo === "contato" || escopo === "contact") {
    if (typeof contactId !== "string" || !UUID.test(contactId)) {
      return falha("Contato inválido.");
    }
    const id = contactId.toLowerCase();
    return { ok: true, dados: { escopo: "contato", scope: "contact", contactId: id, pasta: id } };
  }
  return falha("Escopo inválido.");
}

function validarTitulo(valor: unknown, obrigatorio: boolean): Validado<string | null> {
  if (valor === undefined || valor === null || (typeof valor === "string" && !valor.trim())) {
    return obrigatorio ? falha("Informe um título.") : { ok: true, dados: null };
  }
  if (typeof valor !== "string") return falha("Título inválido.");
  const titulo = valor.replace(/\s+/g, " ").trim();
  if (titulo.length > LIMITE_TITULO) {
    return falha(`O título pode ter no máximo ${LIMITE_TITULO} caracteres.`);
  }
  return { ok: true, dados: titulo };
}

function validarTexto(valor: unknown): Validado<string> {
  if (typeof valor !== "string") return falha("Escreva o texto.");
  const texto = valor.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
  if (!texto) return falha("Escreva o texto.");
  if (texto.length > LIMITE_CARACTERES) {
    return falha(
      `O texto passou do limite de ${LIMITE_CARACTERES.toLocaleString("pt-BR")} caracteres. Divida em mais de um documento.`,
    );
  }
  return { ok: true, dados: texto };
}

export interface ArquivoValidado {
  nome: string;
  tipo: TipoArquivo;
  /** Mime canônico do tipo (o que o bucket aceita). */
  mime: string;
  tamanho: number;
}

function validarArquivo(corpo: Record<string, unknown>): Validado<ArquivoValidado> {
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  if (!nome) return falha("Arquivo sem nome.");
  if (nome.length > LIMITE_NOME_ARQUIVO) return falha("O nome do arquivo é longo demais.");
  if (/[\\/\u0000]/.test(nome)) return falha("Nome de arquivo inválido.");

  const mimeRecebido = typeof corpo.mime === "string" ? corpo.mime : "";
  const tipo = tipoDoArquivo(nome, mimeRecebido);
  if (!tipo) return falha(`Tipo de arquivo não aceito. Envie ${TIPOS_ACEITOS_LEGIVEL}.`);

  const tamanho = corpo.tamanho;
  if (typeof tamanho !== "number" || !Number.isInteger(tamanho) || tamanho < 0) {
    return falha("Tamanho do arquivo inválido.");
  }
  if (tamanho === 0) return falha("O arquivo está vazio.");
  if (tamanho > TAMANHO_MAXIMO_BYTES) return falha("O arquivo passa de 25 MB.");

  return { ok: true, dados: { nome, tipo, mime: MIME_POR_EXTENSAO[tipo], tamanho } };
}

// ------------------------------------------------------------- upload-url

export interface PedidoUpload extends ArquivoValidado {
  alvo: Alvo;
}

/** Corpo de POST /api/contexto/upload-url. */
export function validarPedidoUpload(corpo: unknown): Validado<PedidoUpload> {
  const c = objeto(corpo);
  if (!c) return falha("Pedido inválido.");
  const alvo = validarAlvo(c.escopo, c.contact_id);
  if (!alvo.ok) return alvo;
  const arquivo = validarArquivo(c);
  if (!arquivo.ok) return arquivo;
  return { ok: true, dados: { alvo: alvo.dados, ...arquivo.dados } };
}

/** Caminho no bucket: `<global|contact_id>/<uuid>-<nome seguro>`. */
export function caminhoNoBucket(alvo: Alvo, nome: string, uuid: string): string {
  return `${alvo.pasta}/${uuid}-${nomeSeguro(nome)}`;
}

/** O caminho precisa estar na pasta do alvo e ter a forma gerada por `caminhoNoBucket`. */
export function caminhoPertenceAoAlvo(caminho: string, alvo: Alvo): boolean {
  if (caminho.length > 500 || caminho.includes("..") || caminho.includes("\\")) return false;
  const partes = caminho.split("/");
  if (partes.length !== 2) return false;
  const [pasta, arquivo] = partes;
  if (pasta !== alvo.pasta) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,80}$/i.test(arquivo);
}

// ------------------------------------------------------------ novo documento

export type NovoDocumento =
  | { tipo: "texto"; alvo: Alvo; titulo: string; texto: string }
  | { tipo: "arquivo"; alvo: Alvo; titulo: string; path: string; arquivo: ArquivoValidado };

/** Corpo de POST /api/contexto (texto digitado ou arquivo já enviado ao Storage). */
export function validarNovoDocumento(corpo: unknown): Validado<NovoDocumento> {
  const c = objeto(corpo);
  if (!c) return falha("Pedido inválido.");
  const alvo = validarAlvo(c.escopo, c.contact_id);
  if (!alvo.ok) return alvo;

  const ehArquivo = c.path !== undefined && c.path !== null;
  if (ehArquivo && c.texto !== undefined && c.texto !== null) {
    return falha("Envie texto ou arquivo, não os dois.");
  }

  if (!ehArquivo) {
    const titulo = validarTitulo(c.titulo, true);
    if (!titulo.ok) return titulo;
    const texto = validarTexto(c.texto);
    if (!texto.ok) return texto;
    return {
      ok: true,
      dados: { tipo: "texto", alvo: alvo.dados, titulo: titulo.dados as string, texto: texto.dados },
    };
  }

  if (typeof c.path !== "string" || !caminhoPertenceAoAlvo(c.path, alvo.dados)) {
    return falha("Caminho do arquivo inválido.");
  }
  const arquivo = validarArquivo(c);
  if (!arquivo.ok) return arquivo;
  const titulo = validarTitulo(c.titulo, false);
  if (!titulo.ok) return titulo;
  return {
    ok: true,
    dados: {
      tipo: "arquivo",
      alvo: alvo.dados,
      titulo: titulo.dados ?? tituloPadrao(arquivo.dados.nome),
      path: c.path,
      arquivo: arquivo.dados,
    },
  };
}

// ------------------------------------------------------------------ listagem

/** Parâmetros de GET /api/contexto. */
export function validarListagem(parametros: URLSearchParams): Validado<Alvo> {
  return validarAlvo(parametros.get("escopo") ?? undefined, parametros.get("contact_id") ?? undefined);
}

// ------------------------------------------------------------------ alteração

export interface Alteracao {
  title?: string;
  content?: string;
  active?: boolean;
}

/**
 * Corpo de PATCH /api/contexto/[id]. `kind` é o tipo do documento que está
 * no banco: só documento de texto aceita trocar o conteúdo.
 */
export function validarAlteracao(corpo: unknown, kind: "text" | "file"): Validado<Alteracao> {
  const c = objeto(corpo);
  if (!c) return falha("Pedido inválido.");
  const alteracao: Alteracao = {};

  const tituloBruto = c.title ?? c.titulo;
  if (tituloBruto !== undefined) {
    const titulo = validarTitulo(tituloBruto, true);
    if (!titulo.ok) return titulo;
    alteracao.title = titulo.dados as string;
  }

  const textoBruto = c.content ?? c.texto;
  if (textoBruto !== undefined) {
    if (kind !== "text") {
      return falha("O texto de um arquivo não pode ser editado. Envie o arquivo de novo.");
    }
    const texto = validarTexto(textoBruto);
    if (!texto.ok) return texto;
    alteracao.content = texto.dados;
  }

  const ativo = c.active ?? c.ativo;
  if (ativo !== undefined) {
    if (typeof ativo !== "boolean") return falha("Valor inválido para \"Usar na IA\".");
    alteracao.active = ativo;
  }

  if (Object.keys(alteracao).length === 0) return falha("Nada para alterar.");
  return { ok: true, dados: alteracao };
}
