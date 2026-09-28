import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { BUCKET_MIDIA } from "@/lib/env";
import { supabaseServico } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/midia?path=<caminho no bucket ar1-wa-media>
 * Redireciona para uma URL assinada (1 h) do arquivo. Aceita o caminho com
 * ou sem o prefixo do bucket e com ou sem "storage:".
 */
export async function GET(request: Request) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const url = new URL(request.url);
  let caminho = (url.searchParams.get("path") ?? "").trim();
  caminho = caminho.replace(/^storage:/, "").replace(/^\/+/, "");
  if (caminho.startsWith(`${BUCKET_MIDIA}/`)) caminho = caminho.slice(BUCKET_MIDIA.length + 1);

  if (!caminho || caminho.includes("..") || caminho.length > 1000) {
    return NextResponse.json({ ok: false, erro: "Caminho inválido." }, { status: 400 });
  }

  const { data, error } = await supabaseServico()
    .storage.from(BUCKET_MIDIA)
    .createSignedUrl(caminho, 3600);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, erro: "Arquivo não encontrado ou ainda não sincronizado." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
