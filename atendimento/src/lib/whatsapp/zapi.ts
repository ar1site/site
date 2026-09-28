import "server-only";

import { env } from "../env";

// Cliente mínimo da Z-API. Documentação: https://developer.z-api.io/
// Endpoints usados: send-text, status, qr-code/image.

export class ErroZapi extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detalhe?: unknown,
  ) {
    super(message);
    this.name = "ErroZapi";
  }
}

function baseUrl(): string {
  return `https://api.z-api.io/instances/${env.zapiInstanceId}/token/${env.zapiToken}`;
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${baseUrl()}/${caminho}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "Client-Token": env.zapiClientToken,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new ErroZapi(
      "Não foi possível falar com a Z-API. Verifique a conexão e tente de novo.",
      0,
      e instanceof Error ? e.message : e,
    );
  }

  const textoResposta = await resposta.text();
  let dados: unknown = null;
  try {
    dados = textoResposta ? JSON.parse(textoResposta) : null;
  } catch {
    dados = textoResposta;
  }

  if (!resposta.ok) {
    throw new ErroZapi(mensagemDeErro(resposta.status, dados), resposta.status, dados);
  }
  return dados as T;
}

function mensagemDeErro(status: number, dados: unknown): string {
  const d = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
  const bruto = String(d.error ?? d.message ?? d.value ?? "").toLowerCase();

  if (status === 401 || status === 403) {
    return "A Z-API recusou as credenciais. Confira ZAPI_TOKEN e ZAPI_CLIENT_TOKEN.";
  }
  if (bruto.includes("disconnected") || bruto.includes("not connected") || bruto.includes("instance not")) {
    return "WhatsApp desconectado. Leia o QR code em Configurações.";
  }
  if (status === 404) {
    return "Instância da Z-API não encontrada. Confira ZAPI_INSTANCE_ID.";
  }
  if (status === 429) {
    return "A Z-API pediu para esperar um pouco (limite de envios). Tente em instantes.";
  }
  if (status >= 500) {
    return "A Z-API está com problema no momento. Tente de novo em instantes.";
  }
  const original = String(d.error ?? d.message ?? "").trim();
  return original ? `A Z-API respondeu: ${original}` : `Erro ${status} na Z-API.`;
}

export interface RespostaEnvio {
  zaapId?: string;
  messageId?: string;
  id?: string;
}

/** Envia texto simples para um telefone (só dígitos, com DDI). */
export async function enviarTexto(phone: string, message: string): Promise<RespostaEnvio> {
  return chamar<RespostaEnvio>("send-text", {
    method: "POST",
    body: JSON.stringify({ phone, message }),
  });
}

export interface StatusInstancia {
  connected?: boolean;
  smartphoneConnected?: boolean;
  error?: string | null;
  [k: string]: unknown;
}

export async function statusDaInstancia(): Promise<StatusInstancia> {
  try {
    return await chamar<StatusInstancia>("status", { method: "GET" });
  } catch (e) {
    // A Z-API às vezes responde erro HTTP quando desconectado; tratamos como
    // "desconectado" com a mensagem legível.
    if (e instanceof ErroZapi && e.status !== 401 && e.status !== 403 && e.status !== 404) {
      return { connected: false, smartphoneConnected: false, error: e.message };
    }
    throw e;
  }
}

/**
 * QR code em base64 (data URL). A Z-API devolve `{ value: "data:image/png;base64,..." }`
 * ou, em algumas versões, a string base64 pura. CONFERIR no painel.
 */
export async function qrCodeImagem(): Promise<string | null> {
  const dados = await chamar<unknown>("qr-code/image", { method: "GET" });
  if (typeof dados === "string") return normalizarDataUrl(dados);
  if (dados && typeof dados === "object") {
    const d = dados as Record<string, unknown>;
    const valor = d.value ?? d.qrcode ?? d.image ?? d.base64;
    if (typeof valor === "string") return normalizarDataUrl(valor);
    if (d.connected === true) return null;
  }
  return null;
}

function normalizarDataUrl(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (t.startsWith("data:")) return t;
  // Base64 puro (sem prefixo)
  if (/^[A-Za-z0-9+/=\s]+$/.test(t) && t.length > 100) {
    return `data:image/png;base64,${t.replace(/\s+/g, "")}`;
  }
  return null;
}
