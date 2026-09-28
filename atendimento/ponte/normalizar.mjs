// Normalização pura dos eventos da Evolution API (v2) para o contrato da ponte
// (bridge.message / bridge.status / bridge.qr). Sem rede, sem disco: tudo aqui
// é testável com `node --test normalizar.test.mjs`.
//
// Envelope que a Evolution manda para o webhook (webhook.controller.ts):
//   { event, instance, data, destination, date_time, sender, server_url, apikey }
// `event` chega como "messages.upsert", "send.message", "connection.update",
// "qrcode.updated" (minúsculo, com ponto). Aceitamos também a forma
// "MESSAGES_UPSERT" por segurança.

export const BUCKET = "ar1-wa-media";
export const CAMINHO_QR = `${BUCKET}/_sistema/qr.png`;

const KINDS = ["text", "image", "audio", "video", "document", "sticker", "location", "contact", "other"];

// ------------------------------------------------------------- utilitários

function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function texto(v) {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function somenteDigitos(v) {
  return typeof v === "string" ? v.replace(/\D+/g, "") : "";
}

/** Nome do evento em forma canônica: "messages.upsert". */
export function nomeDoEvento(evento) {
  const e = texto(evento);
  if (!e) return null;
  return e.toLowerCase().replace(/_/g, ".");
}

/**
 * Converte messageTimestamp (segundos) em ISO. A Evolution normaliza para
 * número em segundos; aceitamos também string e o objeto Long {low, high}.
 */
export function isoDoTimestamp(ts, agora = () => new Date()) {
  let n = null;
  if (typeof ts === "number" && Number.isFinite(ts)) n = ts;
  else if (typeof ts === "string" && /^\d+$/.test(ts)) n = Number(ts);
  else if (obj(ts) && typeof ts.low === "number") {
    // Long do protobuf: high * 2^32 + low (unsigned)
    n = (ts.high ?? 0) * 4294967296 + (ts.low >>> 0);
  }
  if (n === null || n <= 0) return agora().toISOString();
  const ms = n < 1e12 ? n * 1000 : n; // se vier em ms, mantém
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? agora().toISOString() : d.toISOString();
}

/** "5562999999999@s.whatsapp.net" -> "5562999999999". */
export function telefoneDoJid(jid) {
  const j = texto(jid);
  if (!j) return "";
  const antes = j.split("@")[0].split(":")[0];
  return somenteDigitos(antes);
}

/**
 * Classifica o remoteJid. Grupos, status e canais são ignorados pela ponte.
 */
export function tipoDoJid(jid) {
  const j = (texto(jid) ?? "").toLowerCase();
  if (!j) return "vazio";
  if (j.endsWith("@g.us")) return "grupo";
  if (j === "status@broadcast" || j.endsWith("@broadcast")) return "broadcast";
  if (j.endsWith("@newsletter")) return "newsletter";
  if (j.endsWith("@lid")) return "lid";
  return "pessoa";
}

const EXT_POR_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/vcard": "vcf",
};

/** Só o tipo, sem parâmetros: "audio/ogg; codecs=opus" -> "audio/ogg". */
export function mimeBase(mime) {
  const m = texto(mime);
  if (!m) return null;
  return m.split(";")[0].trim().toLowerCase() || null;
}

/** Extensão do arquivo a partir do mime, ou do nome, ou "bin". */
export function extensaoDoMime(mime, nomeArquivo = null) {
  const base = mimeBase(mime);
  if (base && EXT_POR_MIME[base]) return EXT_POR_MIME[base];
  const nome = texto(nomeArquivo);
  if (nome) {
    const m = /\.([a-z0-9]{1,8})$/i.exec(nome);
    if (m) return m[1].toLowerCase();
  }
  if (base) {
    const sub = base.split("/")[1];
    if (sub && /^[a-z0-9.+-]{1,12}$/.test(sub)) return sub.replace(/[^a-z0-9]/g, "") || "bin";
  }
  return "bin";
}

/** Nome seguro para o Storage (sem barras, espaços ou caracteres estranhos). */
export function nomeSeguro(v, max = 120) {
  const s = (texto(v) ?? "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return s.slice(0, max) || "arquivo";
}

/** "ar1-wa-media/<phone>/<external_id>.<ext>" */
export function caminhoMidia(phone, externalId, mime, nomeArquivo = null) {
  const ext = extensaoDoMime(mime, nomeArquivo);
  return `${BUCKET}/${somenteDigitos(phone) || "desconhecido"}/${nomeSeguro(externalId)}.${ext}`;
}

/** Tira o prefixo "data:image/png;base64," se existir. */
export function base64Puro(v) {
  const s = texto(v);
  if (!s) return null;
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}

// ------------------------------------------------------------- mensagens

/**
 * Desembrulha camadas que o WhatsApp coloca em volta do conteúdo real:
 * ephemeralMessage, viewOnceMessage(V2), documentWithCaptionMessage, etc.
 */
export function desembrulhar(message, profundidade = 0) {
  const m = obj(message);
  if (!m || profundidade > 5) return m;
  for (const chave of [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
    "deviceSentMessage",
  ]) {
    const interno = obj(m[chave]);
    if (interno && obj(interno.message)) return desembrulhar(interno.message, profundidade + 1);
  }
  return m;
}

const CHAVES_IGNORADAS = new Set([
  "messageContextInfo",
  "senderKeyDistributionMessage",
  "base64",
  "mediaUrl",
]);

/**
 * Extrai kind/body/mídia de `data.message`. Devolve null quando não é uma
 * mensagem de conversa (reação, protocolo, etc.).
 */
export function extrairConteudo(messageBruto) {
  const m = desembrulhar(messageBruto);
  const vazio = { kind: "other", body: null, mime: null, nome: null, temMidia: false };
  if (!m) return vazio;

  const chaves = Object.keys(m).filter((k) => !CHAVES_IGNORADAS.has(k));
  if (chaves.length === 0) return vazio;

  // Eventos que não são mensagens de conversa.
  if (m.reactionMessage || m.protocolMessage || m.pollUpdateMessage || m.keepInChatMessage) return null;

  const conv = texto(m.conversation);
  if (conv) return { ...vazio, kind: "text", body: conv };

  const ext = obj(m.extendedTextMessage);
  if (ext) return { ...vazio, kind: "text", body: texto(ext.text) };

  const img = obj(m.imageMessage);
  if (img) {
    return { ...vazio, kind: "image", body: texto(img.caption), mime: texto(img.mimetype) ?? "image/jpeg", temMidia: true };
  }

  const aud = obj(m.audioMessage);
  if (aud) {
    return { ...vazio, kind: "audio", mime: texto(aud.mimetype) ?? "audio/ogg", temMidia: true };
  }

  const vid = obj(m.videoMessage);
  if (vid) {
    return { ...vazio, kind: "video", body: texto(vid.caption), mime: texto(vid.mimetype) ?? "video/mp4", temMidia: true };
  }

  const doc = obj(m.documentMessage);
  if (doc) {
    const nome = texto(doc.fileName) ?? texto(doc.title);
    return {
      ...vazio,
      kind: "document",
      body: texto(doc.caption),
      mime: texto(doc.mimetype) ?? "application/octet-stream",
      nome,
      temMidia: true,
    };
  }

  const stk = obj(m.stickerMessage);
  if (stk) {
    return { ...vazio, kind: "sticker", mime: texto(stk.mimetype) ?? "image/webp", temMidia: true };
  }

  const loc = obj(m.locationMessage) ?? obj(m.liveLocationMessage);
  if (loc) {
    const partes = [texto(loc.name), texto(loc.address)];
    if (typeof loc.degreesLatitude === "number" && typeof loc.degreesLongitude === "number") {
      partes.push(`${loc.degreesLatitude}, ${loc.degreesLongitude}`);
      partes.push(`https://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}`);
    }
    const body = partes.filter(Boolean).join(" — ");
    return { ...vazio, kind: "location", body: body || null };
  }

  const ctt = obj(m.contactMessage);
  if (ctt) {
    return { ...vazio, kind: "contact", body: corpoDoContato(ctt) };
  }

  const ctts = obj(m.contactsArrayMessage);
  if (ctts) {
    const lista = Array.isArray(ctts.contacts) ? ctts.contacts.map((c) => corpoDoContato(obj(c) ?? {})).filter(Boolean) : [];
    return { ...vazio, kind: "contact", body: lista.join("\n") || texto(ctts.displayName) };
  }

  // Respostas de botões / listas / templates chegam como texto.
  const btn = obj(m.buttonsResponseMessage);
  if (btn) return { ...vazio, kind: "text", body: texto(btn.selectedDisplayText) ?? texto(btn.selectedButtonId) };
  const lst = obj(m.listResponseMessage);
  if (lst) {
    const sel = obj(lst.singleSelectReply);
    return { ...vazio, kind: "text", body: texto(lst.title) ?? texto(sel?.selectedRowId) };
  }
  const tpl = obj(m.templateButtonReplyMessage);
  if (tpl) return { ...vazio, kind: "text", body: texto(tpl.selectedDisplayText) ?? texto(tpl.selectedId) };

  return vazio;
}

function corpoDoContato(ctt) {
  const nome = texto(ctt.displayName);
  const vcard = texto(ctt.vcard) ?? "";
  const tels = [];
  for (const linha of vcard.split(/\r?\n/)) {
    const m = /^TEL[^:]*:(.+)$/i.exec(linha.trim());
    if (m) {
      const d = somenteDigitos(m[1]);
      if (d && !tels.includes(d)) tels.push(d);
    }
  }
  const partes = [nome, ...tels].filter(Boolean);
  return partes.length ? partes.join(" — ") : null;
}

/**
 * Resolve o telefone do contato a partir da chave da mensagem.
 * CONFERIR: em versões 2.3.x, com Baileys 7, o remoteJid pode vir como
 * "<id>@lid"; o número real então aparece em key.remoteJidAlt ou key.senderPn.
 */
export function telefoneDaChave(key, data = null) {
  const k = obj(key) ?? {};
  const candidatos = [k.remoteJidAlt, k.senderPn, data?.remoteJidAlt, k.remoteJid, k.participantAlt, k.participant];
  for (const c of candidatos) {
    const t = texto(c);
    if (!t) continue;
    if (tipoDoJid(t) === "pessoa") {
      const d = telefoneDoJid(t);
      if (d.length >= 8) return d;
    }
  }
  return "";
}

/**
 * Normaliza `data` de messages.upsert / send.message para bridge.message.
 * `opcoes.outboxIdPara(externalId)` pode devolver o id da outbox (mapa em memória).
 * Devolve { tipo: "mensagem", mensagem, midia } ou { tipo: "ignorar", motivo }.
 */
export function normalizarMensagem(data, opcoes = {}) {
  const d = obj(data);
  if (!d) return { tipo: "ignorar", motivo: "data ausente" };
  const key = obj(d.key);
  if (!key) return { tipo: "ignorar", motivo: "key ausente" };

  const remoteJid = texto(key.remoteJid);
  const tipoJid = tipoDoJid(remoteJid);
  if (tipoJid === "grupo") return { tipo: "ignorar", motivo: "grupo" };
  if (tipoJid === "broadcast") return { tipo: "ignorar", motivo: "status/broadcast" };
  if (tipoJid === "newsletter") return { tipo: "ignorar", motivo: "newsletter" };
  if (tipoJid === "vazio") return { tipo: "ignorar", motivo: "remoteJid ausente" };

  const externalId = texto(key.id);
  if (!externalId) return { tipo: "ignorar", motivo: "key.id ausente" };

  const phone = telefoneDaChave(key, d);
  if (phone.length < 8) return { tipo: "ignorar", motivo: `telefone não identificado (${remoteJid})` };

  const conteudo = extrairConteudo(d.message);
  if (conteudo === null) return { tipo: "ignorar", motivo: "reação/protocolo" };

  const fromMe = key.fromMe === true;
  const agora = opcoes.agora ?? (() => new Date());
  const sentAt = isoDoTimestamp(d.messageTimestamp, agora);

  let mediaPath = null;
  let midia = null;
  if (conteudo.temMidia) {
    mediaPath = caminhoMidia(phone, externalId, conteudo.mime, conteudo.nome);
    const msgDesembrulhada = desembrulhar(d.message) ?? {};
    const base64 = base64Puro(obj(d.message)?.base64) ?? base64Puro(msgDesembrulhada.base64) ?? base64Puro(d.base64);
    midia = {
      caminho: mediaPath.slice(BUCKET.length + 1), // sem o prefixo do bucket
      mime: mimeBase(conteudo.mime) ?? "application/octet-stream",
      base64, // null quando a Evolution não mandou; a ponte busca pela API
      key: { remoteJid, fromMe, id: externalId, ...(texto(key.participant) ? { participant: key.participant } : {}) },
    };
  }

  const outboxId = fromMe && typeof opcoes.outboxIdPara === "function" ? (opcoes.outboxIdPara(externalId) ?? null) : null;

  const mensagem = {
    external_id: externalId.slice(0, 200),
    phone,
    from_me: fromMe,
    sender_name: texto(d.pushName),
    sent_at: sentAt,
    kind: KINDS.includes(conteudo.kind) ? conteudo.kind : "other",
    body: conteudo.body,
    media_path: mediaPath,
    media_mime: conteudo.temMidia ? mimeBase(conteudo.mime) : null,
    media_name: conteudo.nome,
    is_group: false,
    outbox_id: outboxId,
  };

  return { tipo: "mensagem", mensagem, midia };
}

// ------------------------------------------------------------- estado / QR

/** connection.update -> bridge.status. */
export function normalizarStatus(data, agora = () => new Date()) {
  const d = obj(data) ?? {};
  const state = texto(d.state) ?? "close";
  return {
    tipo: "status",
    status: {
      type: "bridge.status",
      provider: "evolution",
      connected: state === "open",
      state,
      phone: telefoneDoJid(d.wuid) || null,
      checked_at: agora().toISOString(),
      ...(d.statusReason !== undefined ? { status_reason: d.statusReason } : {}),
    },
  };
}

/** Monta o bridge.status a partir do retorno de GET /instance/connectionState. */
export function statusDaConsulta(resposta, agora = () => new Date()) {
  const inst = obj(obj(resposta)?.instance) ?? obj(resposta) ?? {};
  const state = texto(inst.state) ?? texto(inst.connectionStatus) ?? "close";
  return {
    type: "bridge.status",
    provider: "evolution",
    connected: state === "open",
    state,
    phone: telefoneDoJid(inst.ownerJid ?? inst.wuid) || null,
    checked_at: agora().toISOString(),
  };
}

/** qrcode.updated -> { tipo: "qr", base64 } (PNG puro, sem prefixo data:). */
export function normalizarQr(data) {
  const d = obj(data) ?? {};
  const qr = obj(d.qrcode) ?? d;
  const base64 = base64Puro(qr.base64);
  if (!base64) return { tipo: "ignorar", motivo: "qrcode sem base64" };
  return { tipo: "qr", base64, code: texto(qr.code), pairingCode: texto(qr.pairingCode) };
}

/** Payload bridge.qr para o painel. */
export function payloadQr(agora = () => new Date()) {
  return { type: "bridge.qr", media_path: CAMINHO_QR, updated_at: agora().toISOString() };
}

/** Payload bridge.message para o painel. */
export function payloadMensagem(mensagem) {
  return { type: "bridge.message", provider: "evolution", message: mensagem };
}

// ------------------------------------------------------------- entrada única

/**
 * Normaliza um envelope completo do webhook da Evolution.
 * Resultados: { tipo: "mensagem" | "status" | "qr" | "ignorar" | "outro", ... }
 */
export function normalizarEvento(envelope, opcoes = {}) {
  const e = obj(envelope);
  if (!e) return { tipo: "ignorar", motivo: "payload inválido", evento: null };
  const evento = nomeDoEvento(e.event);
  if (!evento) return { tipo: "ignorar", motivo: "evento sem nome", evento: null };

  switch (evento) {
    case "messages.upsert":
    case "send.message":
      return { evento, ...normalizarMensagem(e.data, opcoes) };
    case "connection.update":
      return { evento, ...normalizarStatus(e.data, opcoes.agora) };
    case "qrcode.updated":
      return { evento, ...normalizarQr(e.data) };
    default:
      return { tipo: "outro", evento };
  }
}

/** Chave para deduplicar eventos que chegam duas vezes (webhook global + instância). */
export function chaveDeDuplicidade(resultado, envelope) {
  if (!resultado) return null;
  if (resultado.tipo === "mensagem") return `m:${resultado.mensagem.external_id}:${resultado.mensagem.from_me ? 1 : 0}`;
  if (resultado.tipo === "status") return `s:${resultado.status.state}:${obj(envelope)?.date_time ?? ""}`;
  if (resultado.tipo === "qr") return `q:${resultado.code ?? resultado.base64.slice(0, 64)}`;
  return null;
}

/** Mensagem curta de erro (para a coluna `error` da outbox e para o log). */
export function erroCurto(e, max = 300) {
  let s;
  if (e instanceof Error) s = e.message;
  else if (typeof e === "string") s = e;
  else {
    try {
      s = JSON.stringify(e);
    } catch {
      s = String(e);
    }
  }
  s = (s ?? "erro").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Extrai key.id da resposta de POST /message/sendText. */
export function idDaRespostaDeEnvio(resposta) {
  const r = obj(resposta);
  if (!r) return null;
  return texto(obj(r.key)?.id) ?? texto(r.messageId) ?? texto(r.id);
}

/**
 * Localiza a instância pelo nome no retorno de GET /instance/fetchInstances.
 * Aceita os dois formatos: [{ name, connectionStatus, ... }] (v2.x) e
 * [{ instance: { instanceName, status } }] (formato antigo da doc).
 */
export function acharInstancia(lista, nome) {
  if (!Array.isArray(lista)) return null;
  for (const item of lista) {
    const i = obj(item);
    if (!i) continue;
    const inst = obj(i.instance) ?? i;
    const n = texto(inst.name) ?? texto(inst.instanceName);
    if (n === nome) {
      return {
        nome: n,
        estado: texto(inst.connectionStatus) ?? texto(inst.state) ?? texto(inst.status) ?? null,
        telefone: telefoneDoJid(inst.ownerJid) || null,
      };
    }
  }
  return null;
}

/** Extrai o QR (base64 puro) do retorno de GET /instance/connect/{instancia}. */
export function qrDaResposta(resposta) {
  const r = obj(resposta);
  if (!r) return null;
  const qr = obj(r.qrcode) ?? r;
  return base64Puro(qr.base64);
}
