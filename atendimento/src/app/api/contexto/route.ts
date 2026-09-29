import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { ErroExtracao, extrairTexto } from "@/lib/contexto/extrair";
import { BUCKET_CONTEXTO, TAMANHO_MAXIMO_BYTES } from "@/lib/contexto/limites";
import { COLUNAS_DOCUMENTO, resumirDocumento } from "@/lib/contexto/resumo";
import {
  apagarArquivo,
  contatoExiste,
  erro,
  lerJson,
  mensagemDoBanco,
} from "@/lib/contexto/servidor";
import { validarListagem, validarNovoDocumento } from "@/lib/contexto/validar";
import { supabaseServico } from "@/lib/supabase/service";
import type { DocContexto } from "@/lib/tipos";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Máximo de documentos devolvidos numa lista. */
const LIMITE_LISTA = 200;

/**
 * GET /api/contexto?escopo=global
 * GET /api/contexto?escopo=contato&contact_id=<uuid>
 * Lista os documentos sem o conteúdo inteiro (manda `chars` e `previa`).
 */
export async function GET(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const alvo = validarListagem(new URL(request.url).searchParams);
  if (!alvo.ok) return erro(alvo.erro, 400);

  let consulta = supabaseServico()
    .from("ar1_context_docs")
    .select(COLUNAS_DOCUMENTO)
    .eq("scope", alvo.dados.scope);
  if (alvo.dados.contactId) consulta = consulta.eq("contact_id", alvo.dados.contactId);

  const { data, error } = await consulta
    .order("created_at", { ascending: false })
    .limit(LIMITE_LISTA);
  if (error) return erro(mensagemDoBanco(error), 500);

  const documentos = ((data ?? []) as DocContexto[]).map(resumirDocumento);
  return NextResponse.json({ ok: true, documentos });
}

/**
 * POST /api/contexto
 * Texto:   { escopo, contact_id?, titulo, texto }
 * Arquivo: { escopo, contact_id?, titulo?, path, nome, mime, tamanho }
 *          (o arquivo já está no Storage; aqui ele é lido e o texto extraído)
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const novo = validarNovoDocumento(await lerJson(request));
  if (!novo.ok) return erro(novo.erro, 400);
  const pedido = novo.dados;
  const db = supabaseServico();

  if (pedido.alvo.contactId && !(await contatoExiste(pedido.alvo.contactId))) {
    return erro("Contato não encontrado.", 404);
  }

  const comum = {
    scope: pedido.alvo.scope,
    contact_id: pedido.alvo.contactId,
    title: pedido.titulo,
    active: true,
    created_by: sessao.user.id,
  };

  if (pedido.tipo === "texto") {
    const { data, error } = await db
      .from("ar1_context_docs")
      .insert({ ...comum, kind: "text", content: pedido.texto, content_truncated: false })
      .select(COLUNAS_DOCUMENTO)
      .single();
    if (error || !data) return erro(mensagemDoBanco(error ?? { message: "sem resposta" }), 500);
    return NextResponse.json({ ok: true, documento: resumirDocumento(data as DocContexto) });
  }

  // ------------------------------------------------------------- arquivo
  const { path, arquivo } = pedido;

  const { data: repetido } = await db
    .from("ar1_context_docs")
    .select("id")
    .eq("file_path", path)
    .limit(1);
  if (repetido && repetido.length > 0) {
    return erro("Este arquivo já foi registrado.", 409);
  }

  const { data: blob, error: erroDownload } = await db.storage.from(BUCKET_CONTEXTO).download(path);
  if (erroDownload || !blob) {
    return erro("O arquivo não chegou ao armazenamento. Envie de novo.", 404);
  }
  if (blob.size === 0) {
    await apagarArquivo(path);
    return erro("O arquivo está vazio.", 400);
  }
  if (blob.size > TAMANHO_MAXIMO_BYTES) {
    await apagarArquivo(path);
    return erro("O arquivo passa de 25 MB.", 400);
  }

  let extraido;
  try {
    extraido = await extrairTexto(new Uint8Array(await blob.arrayBuffer()), {
      nome: arquivo.nome,
      mime: arquivo.mime,
    });
  } catch (e) {
    await apagarArquivo(path);
    if (e instanceof ErroExtracao) return erro(e.message, 422);
    console.error("[contexto] erro ao extrair texto", arquivo.nome, e);
    return erro("Não consegui ler este arquivo.", 422);
  }

  const { data, error } = await db
    .from("ar1_context_docs")
    .insert({
      ...comum,
      kind: "file",
      content: extraido.texto,
      content_truncated: extraido.truncado,
      file_path: path,
      file_name: arquivo.nome,
      file_mime: arquivo.mime,
      file_size: blob.size,
    })
    .select(COLUNAS_DOCUMENTO)
    .single();
  if (error || !data) {
    await apagarArquivo(path);
    return erro(mensagemDoBanco(error ?? { message: "sem resposta" }), 500);
  }

  return NextResponse.json({
    ok: true,
    documento: resumirDocumento(data as DocContexto),
    paginas: extraido.paginas ?? null,
    truncado: extraido.truncado,
    sem_texto: extraido.texto.length === 0,
  });
}
