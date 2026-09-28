// Recebe o formulário "Solicitar proposta" e envia para contato@ar1films.com pelo Google Workspace da AR1.
// Variáveis na Vercel (Settings → Environment Variables): SMTP_USER (conta Google que envia),
// SMTP_PASS (senha de app dessa conta) e, opcionalmente, MAIL_TO (padrão: contato@ar1films.com).
import nodemailer from "nodemailer";

const ORIGENS = [/^https:\/\/(www\.)?ar1films\.com$/, /^https:\/\/ar1films(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const LIMITES = { name: 80, role: 100, phone: 24, email: 160, company: 160, project: 120, brief: 1000, date: 10, page: 200, utm_source: 100, utm_medium: 100, utm_campaign: 100 } as const;
type Campo = keyof typeof LIMITES;

const resposta = (status: number, corpo: Record<string, unknown>) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const escapar = (texto: string) => texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export async function POST(request: Request) {
  const origem = request.headers.get("origin") ?? "";
  if (origem && !ORIGENS.some((padrao) => padrao.test(origem))) return resposta(403, { ok: false, erro: "origem" });

  let dados: Record<string, unknown>;
  try { dados = await request.json(); } catch { return resposta(400, { ok: false, erro: "formato" }); }
  if (typeof dados.website === "string" && dados.website.trim()) return resposta(200, { ok: true }); // armadilha para robôs

  const lead = Object.fromEntries((Object.keys(LIMITES) as Campo[]).map((campo) => [campo, typeof dados[campo] === "string" ? (dados[campo] as string).trim().slice(0, LIMITES[campo]) : ""])) as Record<Campo, string>;
  if (!lead.name || !lead.phone || !lead.company || !lead.project) return resposta(422, { ok: false, erro: "campos" });
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email);

  const { SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return resposta(503, { ok: false, erro: "nao_configurado" });

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
  } catch (erro) {
    console.error("falha ao enviar proposta", erro);
    return resposta(502, { ok: false, erro: "envio" });
  }
  return resposta(200, { ok: true });
}
