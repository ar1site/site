// Recebe o formulário "Solicitar proposta" do site e grava a oportunidade no funil da AR1
// (Supabase, tabela ar1_quote_requests, origem "site"): o lead do site cai no mesmo lugar
// que o do WhatsApp. Se SMTP_USER/SMTP_PASS existirem, também avisa por e-mail; o e-mail é
// opcional e não impede o registro.
// Variáveis na Vercel (projeto do site): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e,
// opcionalmente, SMTP_USER, SMTP_PASS (senha de app do Google) e MAIL_TO.
import nodemailer from "nodemailer";

const ORIGENS = [/^https:\/\/(www\.)?ar1films\.com$/, /^https:\/\/ar1films(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const LIMITES = { name: 80, role: 100, phone: 24, email: 160, company: 160, project: 100, brief: 1000, date: 10, page: 200, utm_source: 100, utm_medium: 100, utm_campaign: 100 } as const;
const MAX_POR_TELEFONE_POR_HORA = 5;
type Campo = keyof typeof LIMITES;
type Lead = Record<Campo, string>;

const resposta = (status: number, corpo: Record<string, unknown>) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const escapar = (texto: string) => texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** Grava a oportunidade no funil. Devolve "ok", "limite", "nao_configurado" ou "erro". */
async function gravarNoFunil(lead: Lead, emailValido: boolean): Promise<"ok" | "limite" | "nao_configurado" | "erro"> {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !chave) return "nao_configurado";
  const headers = { apikey: chave, Authorization: `Bearer ${chave}`, "content-type": "application/json" };
  try {
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentes = await fetch(`${base}/rest/v1/ar1_quote_requests?select=id&source=eq.site&phone=eq.${encodeURIComponent(lead.phone)}&created_at=gte.${encodeURIComponent(desde)}`, { headers });
    if (recentes.ok && ((await recentes.json()) as unknown[]).length >= MAX_POR_TELEFONE_POR_HORA) return "limite";

    // Se esse telefone já conversa com a AR1 pelo WhatsApp, liga a oportunidade ao contato.
    let contactId: string | null = null;
    const digitos = lead.phone.replace(/\D/g, "");
    if (digitos.length >= 10) {
      const candidatos = [...new Set([digitos, digitos.startsWith("55") ? digitos : `55${digitos}`])];
      const contato = await fetch(`${base}/rest/v1/ar1_wa_contacts?select=id&phone=in.(${candidatos.join(",")})&limit=1`, { headers });
      if (contato.ok) contactId = ((await contato.json()) as { id: string }[])[0]?.id ?? null;
    }

    const mensagem = [
      lead.brief,
      lead.role ? `Cargo: ${lead.role}` : "",
      lead.utm_source ? `UTM source: ${lead.utm_source}` : "",
      lead.utm_medium ? `UTM medium: ${lead.utm_medium}` : "",
      lead.utm_campaign ? `UTM campaign: ${lead.utm_campaign}` : "",
    ].filter(Boolean).join("\n");

    const gravacao = await fetch(`${base}/rest/v1/ar1_quote_requests`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        name: lead.name,
        phone: lead.phone,
        company: lead.company,
        email: emailValido ? lead.email : null,
        project_type: lead.project,
        expected_date: /^\d{4}-\d{2}-\d{2}$/.test(lead.date) ? lead.date : null,
        message: mensagem || null,
        source_path: lead.page || "/",
        source: "site",
        status: "new",
        contact_id: contactId,
      }),
    });
    if (!gravacao.ok) {
      console.error("falha ao gravar no funil", gravacao.status, (await gravacao.text()).slice(0, 300));
      return "erro";
    }
    return "ok";
  } catch (erro) {
    console.error("falha ao gravar no funil", erro);
    return "erro";
  }
}

/** Aviso por e-mail (opcional). Devolve true se enviou. */
async function avisarPorEmail(lead: Lead, emailValido: boolean): Promise<boolean> {
  const { SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return false;
  const linhas: [string, string][] = [
    ["Nome", lead.name], ["Cargo", lead.role], ["WhatsApp", lead.phone], ["E-mail", lead.email], ["Empresa", lead.company],
    ["Principal interesse", lead.project], ["O que precisa acontecer", lead.brief], ["Data prevista", lead.date],
    ["Página", lead.page], ["UTM source", lead.utm_source], ["UTM medium", lead.utm_medium], ["UTM campaign", lead.utm_campaign],
  ];
  const preenchidas = linhas.filter(([, valor]) => valor);
  const texto = ["Nova solicitação de proposta pelo site ar1films.com", "", ...preenchidas.map(([rotulo, valor]) => `${rotulo}: ${valor}`)].join("\n");
  const html = `<p>Nova solicitação de proposta pelo site <b>ar1films.com</b></p><table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${preenchidas.map(([rotulo, valor]) => `<tr><td style="color:#666;vertical-align:top">${rotulo}</td><td style="white-space:pre-wrap">${escapar(valor)}</td></tr>`).join("")}</table>`;
  try {
    const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await transporte.sendMail({
      from: { name: "Site AR1 Films", address: SMTP_USER },
      to: MAIL_TO || "contato@ar1films.com",
      replyTo: emailValido ? { name: lead.name, address: lead.email } : undefined,
      subject: `Proposta pelo site · ${lead.project} · ${lead.name}`,
      text: texto,
      html,
    });
    return true;
  } catch (erro) {
    console.error("falha ao enviar e-mail da proposta", erro);
    return false;
  }
}

export async function POST(request: Request) {
  const origem = request.headers.get("origin") ?? "";
  if (origem && !ORIGENS.some((padrao) => padrao.test(origem))) return resposta(403, { ok: false, erro: "origem" });

  let dados: Record<string, unknown>;
  try { dados = await request.json(); } catch { return resposta(400, { ok: false, erro: "formato" }); }
  if (typeof dados.website === "string" && dados.website.trim()) return resposta(200, { ok: true }); // armadilha para robôs

  const lead = Object.fromEntries((Object.keys(LIMITES) as Campo[]).map((campo) => [campo, typeof dados[campo] === "string" ? (dados[campo] as string).trim().slice(0, LIMITES[campo]) : ""])) as Lead;
  if (!lead.name || !lead.company || !lead.project || lead.phone.replace(/\D/g, "").length < 8) return resposta(422, { ok: false, erro: "campos" });
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email);

  const funil = await gravarNoFunil(lead, emailValido);
  if (funil === "limite") return resposta(429, { ok: false, erro: "limite" });
  const email = await avisarPorEmail(lead, emailValido);

  if (funil === "ok" || email) return resposta(200, { ok: true });
  if (funil === "nao_configurado") return resposta(503, { ok: false, erro: "nao_configurado" });
  return resposta(502, { ok: false, erro: "envio" });
}
