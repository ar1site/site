// Parser tolerante dos webhooks de WhatsApp. Puro (sem banco), para ser testável.
// Aceita dois formatos no mesmo webhook, detectados pelo campo `type`:
//   - Ponte local (Evolution API): "bridge.message", "bridge.status", "bridge.qr"
//   - Z-API: "ReceivedCallback", "ConnectedCallback", "DisconnectedCallback", etc.
// Campos marcados com CONFERIR foram baseados na documentação pública da Z-API
// e nos exemplos recebidos; vale validar contra payloads reais em ar1_wa_events.

import type { KindMensagem } from "../tipos";
import { somenteDigitos } from "../formato";

export const BUCKET_MIDIA = "ar1-wa-media";

const KINDS: KindMensagem[] = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contact",
  "other",
];

export interface MensagemNormalizada {
  externalId: string;
  phone: string;
  fromMe: boolean;
  sentAt: Date;
  kind: KindMensagem;
  body: string | null;
  /** URL http(s) (Z-API) ou "storage:ar1-wa-media/<caminho>" (ponte). */
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  /** Nome do contato no WhatsApp (nunca o nosso, mesmo quando fromMe). */
  contactName: string | null;
  /** Foto do contato, quando veio no payload. */
  photoUrl: string | null;
  /** Só na ponte: id da fila de envio quando a mensagem saiu pelo painel. */
  outboxId: string | null;
  origem: "bridge" | "zapi";
  /** Só na ponte: mensagem antiga importada do histórico (não dispara análise automática). */
  historico?: boolean;
}

export type ResultadoWebhook =
  | { tipo: "mensagem"; mensagem: MensagemNormalizada; evento: string }
  | {
      tipo: "conexao";
      connected: boolean;
      evento: string;
      erro: string | null;
      state: string | null;
      phone: string | null;
      checkedAt: string;
    }
  | { tipo: "qr"; mediaPath: string | null; updatedAt: string; evento: string }
  | { tipo: "ignorar"; motivo: string; evento: string }
  | { tipo: "evento"; evento: string };

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function texto(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

function limitar(v: string | null, max: number): string | null {
  if (v === null) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function dataDoMomento(momment: unknown): Date {
  if (typeof momment === "number" && Number.isFinite(momment)) {
    // Z-API manda em milissegundos; se vier em segundos, corrige.
    const ms = momment < 1e12 ? momment * 1000 : momment;
    return new Date(ms);
  }
  if (typeof momment === "string") {
    const n = Number(momment);
    if (Number.isFinite(n) && n > 0) return dataDoMomento(n);
    const d = new Date(momment);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function isoOuAgora(v: unknown): string {
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** "ar1-wa-media/5562.../x.jpg" ou "5562.../x.jpg" -> "storage:ar1-wa-media/5562.../x.jpg" */
export function mediaUrlDoBucket(mediaPath: string | null): string | null {
  if (!mediaPath) return null;
  let caminho = mediaPath.replace(/^\/+/, "");
  if (caminho.startsWith(`${BUCKET_MIDIA}/`)) caminho = caminho.slice(BUCKET_MIDIA.length + 1);
  if (!caminho || caminho.includes("..")) return null;
  return `storage:${BUCKET_MIDIA}/${caminho}`;
}

// ---------------------------------------------------------------- ponte local

function interpretarPonte(p: Obj, evento: string): ResultadoWebhook {
  if (evento === "bridge.status") {
    return {
      tipo: "conexao",
      evento,
      connected: p.connected === true,
      state: texto(p.state),
      phone: somenteDigitos(p.phone) || null,
      erro: texto(p.error),
      checkedAt: isoOuAgora(p.checked_at),
    };
  }

  if (evento === "bridge.qr") {
    return {
      tipo: "qr",
      evento,
      mediaPath: texto(p.media_path),
      updatedAt: isoOuAgora(p.updated_at),
    };
  }

  // bridge.message
  const m = obj(p.message);
  if (!m) return { tipo: "ignorar", motivo: "campo message ausente", evento };
  if (m.is_group === true) return { tipo: "ignorar", motivo: "grupo", evento };

  const phone = somenteDigitos(m.phone);
  if (phone.length < 8) return { tipo: "ignorar", motivo: "telefone ausente", evento };

  const externalId = texto(m.external_id);
  if (!externalId) return { tipo: "ignorar", motivo: "external_id ausente", evento };

  const kindBruto = texto(m.kind) ?? "other";
  const kind = (KINDS as string[]).includes(kindBruto) ? (kindBruto as KindMensagem) : "other";
  const fromMe = m.from_me === true;

  return {
    tipo: "mensagem",
    evento,
    mensagem: {
      externalId: limitar(externalId, 200)!,
      phone,
      fromMe,
      sentAt: dataDoMomento(m.sent_at),
      kind,
      body: limitar(texto(m.body), 20000),
      mediaUrl: mediaUrlDoBucket(texto(m.media_path)),
      mediaMime: limitar(texto(m.media_mime), 100),
      mediaName: limitar(texto(m.media_name), 300),
      // Na ponte, sender_name é o nome do contato; quando é nossa (from_me)
      // pode vir o nosso nome, então só usamos em mensagens recebidas.
      contactName: fromMe ? null : limitar(texto(m.sender_name), 200),
      photoUrl: null,
      outboxId: limitar(texto(m.outbox_id), 100),
      origem: "bridge",
      historico: m.history === true,
    },
  };
}

// ---------------------------------------------------------------------- Z-API

interface Conteudo {
  kind: KindMensagem;
  body: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
}

function extrairConteudoZapi(p: Obj): Conteudo | null {
  const vazio: Conteudo = {
    kind: "other",
    body: null,
    mediaUrl: null,
    mediaMime: null,
    mediaName: null,
  };

  const text = obj(p.text);
  if (text) {
    return { ...vazio, kind: "text", body: texto(text.message) };
  }

  const image = obj(p.image);
  if (image) {
    return {
      ...vazio,
      kind: "image",
      body: texto(image.caption),
      mediaUrl: texto(image.imageUrl) ?? texto(image.thumbnailUrl),
      mediaMime: texto(image.mimeType),
    };
  }

  const audio = obj(p.audio);
  if (audio) {
    return {
      ...vazio,
      kind: "audio",
      mediaUrl: texto(audio.audioUrl),
      mediaMime: texto(audio.mimeType),
    };
  }

  const video = obj(p.video);
  if (video) {
    return {
      ...vazio,
      kind: "video",
      body: texto(video.caption),
      mediaUrl: texto(video.videoUrl),
      mediaMime: texto(video.mimeType),
    };
  }

  const document = obj(p.document);
  if (document) {
    return {
      ...vazio,
      kind: "document",
      body: texto(document.caption),
      mediaUrl: texto(document.documentUrl),
      mediaMime: texto(document.mimeType),
      mediaName: texto(document.fileName) ?? texto(document.title),
    };
  }

  const sticker = obj(p.sticker);
  if (sticker) {
    return {
      ...vazio,
      kind: "sticker",
      mediaUrl: texto(sticker.stickerUrl),
      mediaMime: texto(sticker.mimeType),
    };
  }

  const location = obj(p.location);
  if (location) {
    // CONFERIR: nomes dos campos de localização na Z-API (latitude/longitude/address/url).
    const partes = [
      texto(location.name),
      texto(location.address),
      location.latitude !== undefined && location.longitude !== undefined
        ? `${location.latitude}, ${location.longitude}`
        : null,
    ].filter(Boolean);
    return {
      ...vazio,
      kind: "location",
      body: partes.length ? partes.join(" — ") : null,
      mediaUrl: texto(location.url),
    };
  }

  const contact = obj(p.contact);
  if (contact) {
    // CONFERIR: Z-API manda displayName + vCard (e às vezes phones[]).
    const phones = Array.isArray(contact.phones)
      ? (contact.phones as unknown[]).map((x) => texto(x)).filter(Boolean)
      : [];
    const partes = [texto(contact.displayName), ...phones].filter(Boolean);
    return {
      ...vazio,
      kind: "contact",
      body: partes.length ? partes.join(" — ") : texto(contact.vCard),
    };
  }

  // Respostas de botões/listas e mensagens de template chegam como texto.
  // CONFERIR: nomes exatos desses objetos na Z-API.
  for (const chave of [
    "buttonsResponseMessage",
    "listResponseMessage",
    "hydratedTemplate",
    "buttonReply",
  ]) {
    const alt = obj(p[chave]);
    if (alt) {
      const msg =
        texto(alt.message) ??
        texto(alt.title) ??
        texto(alt.selectedRowId) ??
        texto(alt.buttonId);
      return { ...vazio, kind: "text", body: msg };
    }
  }

  // Reações não viram mensagem na conversa.
  if (obj(p.reaction)) return null;

  return vazio;
}

function interpretarZapi(p: Obj, evento: string): ResultadoWebhook {
  const agora = new Date().toISOString();
  if (evento === "ConnectedCallback") {
    return {
      tipo: "conexao",
      connected: true,
      evento,
      erro: null,
      state: "open",
      phone: somenteDigitos(p.phone) || null,
      checkedAt: agora,
    };
  }
  if (evento === "DisconnectedCallback") {
    return {
      tipo: "conexao",
      connected: false,
      evento,
      erro: texto(p.error),
      state: "close",
      phone: null,
      checkedAt: agora,
    };
  }
  if (evento !== "ReceivedCallback") {
    return { tipo: "evento", evento };
  }

  if (p.isGroup === true) return { tipo: "ignorar", motivo: "grupo", evento };
  if (p.isNewsletter === true) return { tipo: "ignorar", motivo: "newsletter", evento };
  if (p.broadcast === true) return { tipo: "ignorar", motivo: "broadcast", evento };
  if (p.isStatusReply === true) return { tipo: "ignorar", motivo: "resposta a status", evento };
  // CONFERIR: waitingMessage=true indica mensagem ainda sem conteúdo (chega
  // completa em outro callback). Registramos só o evento para não criar
  // mensagem vazia com o mesmo messageId, o que bloquearia a versão completa.
  if (p.waitingMessage === true) return { tipo: "ignorar", motivo: "aguardando conteúdo", evento };

  const phone = somenteDigitos(p.phone);
  if (phone.length < 8) return { tipo: "ignorar", motivo: "telefone ausente", evento };

  const externalId = texto(p.messageId) ?? texto(p.id);
  if (!externalId) return { tipo: "ignorar", motivo: "messageId ausente", evento };

  const conteudo = extrairConteudoZapi(p);
  if (!conteudo) return { tipo: "ignorar", motivo: "reação", evento };

  const fromMe = p.fromMe === true;
  // Quando a mensagem é nossa (fromMe), senderName/senderPhoto são os nossos;
  // o nome do contato está em chatName.
  const contactName = fromMe
    ? texto(p.chatName)
    : (texto(p.senderName) ?? texto(p.chatName));
  const photoUrl = fromMe ? texto(p.photo) : (texto(p.senderPhoto) ?? texto(p.photo));

  return {
    tipo: "mensagem",
    evento,
    mensagem: {
      externalId: limitar(externalId, 200)!,
      phone,
      fromMe,
      sentAt: dataDoMomento(p.momment),
      kind: conteudo.kind,
      body: limitar(conteudo.body, 20000),
      mediaUrl: limitar(conteudo.mediaUrl, 2000),
      mediaMime: limitar(conteudo.mediaMime, 100),
      mediaName: limitar(conteudo.mediaName, 300),
      contactName: limitar(contactName, 200),
      photoUrl: limitar(photoUrl, 1000),
      outboxId: null,
      origem: "zapi",
    },
  };
}

/**
 * Interpreta um payload de webhook (ponte local ou Z-API). Nunca lança:
 * campos ausentes viram valores nulos ou um resultado "ignorar"/"evento".
 */
export function interpretarWebhook(payload: unknown): ResultadoWebhook {
  const p = obj(payload);
  if (!p) return { tipo: "ignorar", motivo: "payload inválido", evento: "invalido" };

  const evento = texto(p.type) ?? "desconhecido";
  if (evento.startsWith("bridge.")) {
    if (!["bridge.message", "bridge.status", "bridge.qr"].includes(evento)) {
      return { tipo: "evento", evento };
    }
    return interpretarPonte(p, evento);
  }
  return interpretarZapi(p, evento);
}
