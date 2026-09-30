import { NextResponse } from "next/server";
import { aceitarProposta } from "@/lib/propostas/premium/servidor";
import { lerCorpo } from "@/lib/propostas/respostas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/p/[token]/aceitar — o cliente aceita a proposta pela página pública
 * (sem login): grava "aceita", a data e o nome digitado. Só com link ativo,
 * dentro da validade da proposta e com a situação gerada ou enviada.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const corpo = await lerCorpo(request);
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const r = await aceitarProposta(token, corpo.nome, { userAgent: request.headers.get("user-agent"), ip });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true, nome: r.nome });
}
