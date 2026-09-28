#!/usr/bin/env node
// Simula chamadas do webhook de WhatsApp para testar o painel ponta a ponta.
//
// Uso:
//   node scripts/simular-webhook.mjs <URL_DO_WEBHOOK> [opções]
//
//   URL_DO_WEBHOOK  ex.: https://atendimento.ar1films.com/api/whatsapp/webhook/SEGREDO
//                   ou   http://localhost:3000/api/whatsapp/webhook/SEGREDO
//
// Opções:
//   --formato bridge|zapi   Formato do payload (padrão: bridge)
//   --cenario <nome>        texto | imagem | audio | documento | enviada | grupo | conectado | desconectado | qr | todos
//                           (padrão: texto)
//   --telefone 5562999998888
//   --nome "Maria Souza"
//   --texto "Oi, quero um orçamento"
//   --outbox <uuid>         (cenário "enviada" no formato bridge)
//
// Exemplos:
//   node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO
//   node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO --formato zapi --cenario todos
//   node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO --texto "Quero gravar um podcast em outubro"

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--"));
if (!url) {
  console.error("Informe a URL do webhook. Ex.: node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO");
  process.exit(1);
}

function opcao(nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  if (i === -1 || i + 1 >= args.length) return padrao;
  return args[i + 1];
}

const formato = opcao("formato", "bridge");
const cenario = opcao("cenario", "texto");
const telefone = opcao("telefone", "5562999998888").replace(/\D+/g, "");
const nome = opcao("nome", "Maria Souza");
const texto = opcao("texto", "Oi, quero fazer um orçamento de podcast");
const outboxId = opcao("outbox", null);

const agora = Date.now();
const id = () => `SIM${agora.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

// ------------------------------------------------------------------ Z-API

function baseZapi(extra) {
  return {
    isStatusReply: false,
    chatLid: "1234@lid",
    connectedPhone: "5562981252338",
    waitingMessage: false,
    isEdit: false,
    isGroup: false,
    isNewsletter: false,
    instanceId: "SIMULADOR",
    messageId: id(),
    phone: telefone,
    fromMe: false,
    momment: Date.now(),
    status: "RECEIVED",
    chatName: nome,
    senderPhoto: null,
    senderName: nome,
    photo: null,
    broadcast: false,
    participantPhone: null,
    type: "ReceivedCallback",
    ...extra,
  };
}

const cenariosZapi = {
  texto: () => baseZapi({ text: { message: texto } }),
  imagem: () =>
    baseZapi({
      image: {
        imageUrl: "https://picsum.photos/seed/ar1/800/600.jpg",
        thumbnailUrl: "https://picsum.photos/seed/ar1/200/150.jpg",
        caption: "nosso palco",
        mimeType: "image/jpeg",
      },
    }),
  audio: () =>
    baseZapi({
      audio: { audioUrl: "https://example.com/audio-simulado.ogg", mimeType: "audio/ogg; codecs=opus", ptt: true },
    }),
  documento: () =>
    baseZapi({
      document: {
        documentUrl: "https://example.com/briefing.pdf",
        fileName: "briefing.pdf",
        mimeType: "application/pdf",
        title: "briefing",
      },
    }),
  enviada: () =>
    baseZapi({ fromMe: true, senderName: "AR1 Films", text: { message: "Bom dia! Vou te passar as opções." } }),
  grupo: () => baseZapi({ isGroup: true, chatName: "Grupo de teste", text: { message: "mensagem de grupo (deve ser ignorada)" } }),
  conectado: () => ({ type: "ConnectedCallback", connected: true, instanceId: "SIMULADOR", phone: "5562981252338", momment: Date.now() }),
  desconectado: () => ({
    type: "DisconnectedCallback",
    disconnected: true,
    error: "Device has been disconnected",
    instanceId: "SIMULADOR",
    momment: Date.now(),
  }),
  qr: () => ({ type: "PresenceChatCallback", phone: telefone, status: "AVAILABLE" }),
};

// ------------------------------------------------------------------ ponte

function baseBridge(extra) {
  return {
    type: "bridge.message",
    provider: "evolution",
    message: {
      external_id: id(),
      phone: telefone,
      from_me: false,
      sender_name: nome,
      sent_at: new Date().toISOString(),
      kind: "text",
      body: null,
      media_path: null,
      media_mime: null,
      media_name: null,
      is_group: false,
      outbox_id: null,
      ...extra,
    },
  };
}

const cenariosBridge = {
  texto: () => baseBridge({ body: texto }),
  imagem: () => baseBridge({ kind: "image", body: "nosso palco", media_path: `ar1-wa-media/${telefone}/simulada.jpg`, media_mime: "image/jpeg" }),
  audio: () => baseBridge({ kind: "audio", media_path: `ar1-wa-media/${telefone}/simulado.ogg`, media_mime: "audio/ogg" }),
  documento: () =>
    baseBridge({ kind: "document", media_path: `ar1-wa-media/${telefone}/briefing.pdf`, media_mime: "application/pdf", media_name: "briefing.pdf" }),
  enviada: () => baseBridge({ from_me: true, sender_name: "AR1 Films", body: "Bom dia! Vou te passar as opções.", outbox_id: outboxId }),
  grupo: () => baseBridge({ is_group: true, body: "mensagem de grupo (deve ser ignorada)" }),
  conectado: () => ({ type: "bridge.status", provider: "evolution", connected: true, state: "open", phone: "5562981252338", checked_at: new Date().toISOString() }),
  desconectado: () => ({ type: "bridge.status", provider: "evolution", connected: false, state: "close", phone: null, checked_at: new Date().toISOString() }),
  qr: () => ({ type: "bridge.qr", media_path: "ar1-wa-media/_sistema/qr.png", updated_at: new Date().toISOString() }),
};

const cenarios = formato === "zapi" ? cenariosZapi : cenariosBridge;
const lista = cenario === "todos" ? Object.keys(cenarios) : [cenario];

for (const nomeCenario of lista) {
  const gerar = cenarios[nomeCenario];
  if (!gerar) {
    console.error(`Cenário desconhecido: ${nomeCenario}. Opções: ${Object.keys(cenarios).join(", ")}, todos`);
    process.exit(1);
  }
  const payload = gerar();
  const inicio = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const corpo = await r.text();
    console.log(`[${nomeCenario}] ${formato} -> HTTP ${r.status} em ${Date.now() - inicio} ms: ${corpo.slice(0, 200)}`);
  } catch (e) {
    console.error(`[${nomeCenario}] falha: ${e instanceof Error ? e.message : e}`);
  }
  if (lista.length > 1) await new Promise((res) => setTimeout(res, 500));
}
