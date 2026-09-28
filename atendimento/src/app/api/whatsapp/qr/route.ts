import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { BUCKET_MIDIA, env } from "@/lib/env";
import { supabaseServico } from "@/lib/supabase/service";
import type { QrWhatsapp } from "@/lib/tipos";
import { ErroZapi, qrCodeImagem } from "@/lib/whatsapp/zapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QR code para conectar o WhatsApp. Responde `{ ok, imagem, atualizado_em }`,
 * em que `imagem` é uma URL (assinada, na ponte) ou data URL (Z-API), ou null.
 */
export async function GET() {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  if (env.whatsappProvider === "bridge") {
    const db = supabaseServico();
    const { data } = await db
      .from("ar1_settings")
      .select("value")
      .eq("key", "whatsapp.qr")
      .maybeSingle();
    const valor = (data?.value ?? {}) as QrWhatsapp;
    if (!valor.media_path) {
      return NextResponse.json({ ok: true, provedor: "bridge", imagem: null, atualizado_em: null });
    }
    let caminho = valor.media_path.replace(/^\/+/, "");
    if (caminho.startsWith(`${BUCKET_MIDIA}/`)) caminho = caminho.slice(BUCKET_MIDIA.length + 1);
    const { data: assinada, error } = await db.storage
      .from(BUCKET_MIDIA)
      .createSignedUrl(caminho, 300);
    if (error || !assinada) {
      return NextResponse.json({
        ok: true,
        provedor: "bridge",
        imagem: null,
        atualizado_em: valor.updated_at ?? null,
        erro: "O QR code registrado não está mais disponível. Aguarde a ponte gerar outro.",
      });
    }
    return NextResponse.json({
      ok: true,
      provedor: "bridge",
      imagem: assinada.signedUrl,
      atualizado_em: valor.updated_at ?? null,
    });
  }

  try {
    const imagem = await qrCodeImagem();
    return NextResponse.json({
      ok: true,
      provedor: "zapi",
      imagem,
      atualizado_em: new Date().toISOString(),
      ...(imagem ? {} : { erro: "A Z-API não devolveu QR code. O WhatsApp pode já estar conectado." }),
    });
  } catch (e) {
    const erro = e instanceof ErroZapi ? e.message : "Não foi possível obter o QR code.";
    return NextResponse.json({ ok: false, provedor: "zapi", erro }, { status: 502 });
  }
}
