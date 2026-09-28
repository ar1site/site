import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { env } from "@/lib/env";
import { supabaseServico } from "@/lib/supabase/service";
import type { StatusWhatsapp } from "@/lib/tipos";
import { ErroZapi, statusDaInstancia } from "@/lib/whatsapp/zapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado da conexão do WhatsApp.
 *   - bridge: lê ar1_settings['whatsapp.status'] (a ponte local atualiza pelo webhook).
 *   - zapi: consulta a Z-API e grava o resultado na mesma chave.
 */
export async function GET() {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const db = supabaseServico();

  if (env.whatsappProvider === "bridge") {
    const { data } = await db
      .from("ar1_settings")
      .select("value")
      .eq("key", "whatsapp.status")
      .maybeSingle();
    const valor = (data?.value ?? {}) as StatusWhatsapp;
    return NextResponse.json({
      ok: true,
      provedor: "bridge",
      connected: valor.connected ?? null,
      state: valor.state ?? null,
      phone: valor.phone ?? null,
      checked_at: valor.checked_at ?? null,
      error: valor.error ?? null,
    });
  }

  try {
    const s = await statusDaInstancia();
    const connected = Boolean(s.connected && s.smartphoneConnected !== false);
    const valor: StatusWhatsapp = {
      connected,
      checked_at: new Date().toISOString(),
      state: connected ? "open" : "close",
      error: typeof s.error === "string" ? s.error : null,
    };
    await db
      .from("ar1_settings")
      .upsert({ key: "whatsapp.status", value: valor }, { onConflict: "key" });
    return NextResponse.json({ ok: true, provedor: "zapi", ...valor });
  } catch (e) {
    const erro = e instanceof ErroZapi ? e.message : "Não foi possível consultar a Z-API.";
    return NextResponse.json({ ok: false, provedor: "zapi", erro }, { status: 502 });
  }
}
