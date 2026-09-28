import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseNoServidor } from "./supabase/server";
import { supabaseServico } from "./supabase/service";

export interface SessaoEquipe {
  user: User;
  role: "admin" | "commercial";
}

/**
 * Lê a sessão dos cookies e confirma que o usuário é da equipe ativa.
 * Devolve null quando não há sessão válida ou o usuário não é da equipe.
 */
export async function sessaoDaEquipe(): Promise<SessaoEquipe | null> {
  const supabase = await supabaseNoServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: staff } = await supabaseServico()
    .from("ar1_staff")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!staff || !staff.active) return null;
  return { user, role: staff.role as "admin" | "commercial" };
}

/** Confere o cabeçalho x-internal-secret (chamadas internas do servidor). */
export function segredoInternoValido(request: Request): boolean {
  const recebido = request.headers.get("x-internal-secret");
  const esperado = process.env.WEBHOOK_SECRET;
  return Boolean(recebido && esperado && recebido === esperado);
}

export function respostaNaoAutorizado() {
  return NextResponse.json(
    { ok: false, erro: "Faça login para continuar." },
    { status: 401 },
  );
}
