import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { BUCKET_CONTEXTO } from "@/lib/contexto/limites";
import { contatoExiste, erro, lerJson } from "@/lib/contexto/servidor";
import { caminhoNoBucket, validarPedidoUpload } from "@/lib/contexto/validar";
import { supabaseServico } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/contexto/upload-url
 * Valida o arquivo e devolve o caminho e o token de envio direto ao Storage
 * (as funções da Vercel limitam o corpo a ~4,5 MB, então o arquivo não passa
 * pelo servidor).
 */
export async function POST(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const pedido = validarPedidoUpload(await lerJson(request));
  if (!pedido.ok) return erro(pedido.erro, 400);
  const { alvo, nome, mime } = pedido.dados;

  if (alvo.contactId && !(await contatoExiste(alvo.contactId))) {
    return erro("Contato não encontrado.", 404);
  }

  const caminho = caminhoNoBucket(alvo, nome, randomUUID());
  const { data, error } = await supabaseServico()
    .storage.from(BUCKET_CONTEXTO)
    .createSignedUploadUrl(caminho);
  if (error || !data) {
    console.error("[contexto/upload-url]", error?.message);
    return erro("Não foi possível preparar o envio do arquivo. Tente de novo.", 502);
  }

  return NextResponse.json({ ok: true, path: data.path, token: data.token, mime });
}
