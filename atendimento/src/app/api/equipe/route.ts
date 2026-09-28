import { NextResponse } from "next/server";
import { respostaNaoAutorizado, sessaoDaEquipe } from "@/lib/auth";
import { supabaseServico } from "@/lib/supabase/service";
import type { MembroEquipe } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista a equipe (ar1_staff) com o e-mail de cada pessoa (Auth admin). */
export async function GET() {
  const sessao = await sessaoDaEquipe();
  if (!sessao) return respostaNaoAutorizado();

  const db = supabaseServico();
  const { data: staff, error } = await db
    .from("ar1_staff")
    .select("user_id, role, active, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  const emails = new Map<string, string>();
  try {
    let pagina = 1;
    // A lista da equipe é pequena; paginamos por segurança.
    while (pagina <= 10) {
      const { data, error: erroAuth } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (erroAuth) throw erroAuth;
      for (const u of data.users) emails.set(u.id, u.email ?? "");
      if (data.users.length < 200) break;
      pagina += 1;
    }
  } catch (e) {
    console.error("[equipe] falha ao listar usuários", e);
  }

  const membros: MembroEquipe[] = (staff ?? []).map((s) => ({
    user_id: s.user_id,
    role: s.role,
    active: s.active,
    created_at: s.created_at,
    email: emails.get(s.user_id) ?? null,
  }));

  return NextResponse.json({ ok: true, membros, eu: sessao.user.id });
}
