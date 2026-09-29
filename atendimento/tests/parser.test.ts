import { describe, expect, it } from "vitest";
import { interpretarWebhook, mediaUrlDoBucket } from "@/lib/whatsapp/parser";

const baseZapi = {
  isStatusReply: false,
  chatLid: "1234@lid",
  connectedPhone: "5562981252338",
  waitingMessage: false,
  isEdit: false,
  isGroup: false,
  isNewsletter: false,
  instanceId: "ABC",
  messageId: "3EB0F1C2A9",
  phone: "5562999998888",
  fromMe: false,
  momment: 1790000000000,
  status: "RECEIVED",
  chatName: "Maria Souza",
  senderPhoto: null,
  senderName: "Maria Souza",
  photo: null,
  broadcast: false,
  participantPhone: null,
  type: "ReceivedCallback",
};

function mensagem(payload: unknown) {
  const r = interpretarWebhook(payload);
  if (r.tipo !== "mensagem") throw new Error(`esperava mensagem, veio ${r.tipo}`);
  return r.mensagem;
}

describe("parser Z-API", () => {
  it("texto recebido", () => {
    const m = mensagem({ ...baseZapi, text: { message: "Oi, quero fazer um orçamento de podcast" } });
    expect(m.origem).toBe("zapi");
    expect(m.kind).toBe("text");
    expect(m.body).toBe("Oi, quero fazer um orçamento de podcast");
    expect(m.phone).toBe("5562999998888");
    expect(m.fromMe).toBe(false);
    expect(m.externalId).toBe("3EB0F1C2A9");
    expect(m.contactName).toBe("Maria Souza");
    expect(m.sentAt.toISOString()).toBe(new Date(1790000000000).toISOString());
    expect(m.mediaUrl).toBeNull();
  });

  it("imagem com legenda", () => {
    const m = mensagem({
      ...baseZapi,
      messageId: "IMG1",
      image: {
        imageUrl: "https://cdn.example/x.jpeg",
        thumbnailUrl: "https://cdn.example/t.jpeg",
        caption: "nosso palco",
        mimeType: "image/jpeg",
      },
    });
    expect(m.kind).toBe("image");
    expect(m.body).toBe("nosso palco");
    expect(m.mediaUrl).toBe("https://cdn.example/x.jpeg");
    expect(m.mediaMime).toBe("image/jpeg");
  });

  it("áudio", () => {
    const m = mensagem({
      ...baseZapi,
      messageId: "AUD1",
      audio: { audioUrl: "https://cdn.example/x.ogg", mimeType: "audio/ogg; codecs=opus", ptt: true },
    });
    expect(m.kind).toBe("audio");
    expect(m.body).toBeNull();
    expect(m.mediaUrl).toBe("https://cdn.example/x.ogg");
    expect(m.mediaMime).toBe("audio/ogg; codecs=opus");
  });

  it("documento com nome", () => {
    const m = mensagem({
      ...baseZapi,
      messageId: "DOC1",
      document: {
        documentUrl: "https://cdn.example/x.pdf",
        fileName: "briefing.pdf",
        mimeType: "application/pdf",
        title: "briefing",
      },
    });
    expect(m.kind).toBe("document");
    expect(m.mediaName).toBe("briefing.pdf");
    expect(m.mediaUrl).toBe("https://cdn.example/x.pdf");
    expect(m.mediaMime).toBe("application/pdf");
  });

  it("mensagem enviada pelo celular (fromMe) vira saída e usa chatName como nome do contato", () => {
    const m = mensagem({
      ...baseZapi,
      messageId: "OUT1",
      fromMe: true,
      senderName: "AR1 Films",
      chatName: "Maria Souza",
      text: { message: "Bom dia! Vou te passar as opções." },
    });
    expect(m.fromMe).toBe(true);
    expect(m.kind).toBe("text");
    expect(m.body).toBe("Bom dia! Vou te passar as opções.");
    expect(m.contactName).toBe("Maria Souza");
    expect(m.outboxId).toBeNull();
  });

  it("grupo é ignorado", () => {
    const r = interpretarWebhook({ ...baseZapi, isGroup: true, text: { message: "oi grupo" } });
    expect(r.tipo).toBe("ignorar");
    if (r.tipo === "ignorar") expect(r.motivo).toBe("grupo");
  });

  it("newsletter, broadcast e resposta a status são ignorados", () => {
    expect(interpretarWebhook({ ...baseZapi, isNewsletter: true, text: { message: "x" } }).tipo).toBe("ignorar");
    expect(interpretarWebhook({ ...baseZapi, broadcast: true, text: { message: "x" } }).tipo).toBe("ignorar");
    expect(interpretarWebhook({ ...baseZapi, isStatusReply: true, text: { message: "x" } }).tipo).toBe("ignorar");
  });

  it("tipo de callback desconhecido vira evento (sem quebrar)", () => {
    const r = interpretarWebhook({ type: "PresenceChatCallback", phone: "5562999998888", status: "AVAILABLE" });
    expect(r.tipo).toBe("evento");
    expect(r.evento).toBe("PresenceChatCallback");
  });

  it("payload sem type e payload inválido não quebram", () => {
    expect(interpretarWebhook({}).tipo).toBe("evento");
    expect(interpretarWebhook(null).tipo).toBe("ignorar");
    expect(interpretarWebhook("texto").tipo).toBe("ignorar");
    expect(interpretarWebhook([1, 2]).tipo).toBe("ignorar");
  });

  it("conteúdo desconhecido dentro de ReceivedCallback vira kind other", () => {
    const m = mensagem({ ...baseZapi, messageId: "OTH1", poll: { question: "?" } });
    expect(m.kind).toBe("other");
    expect(m.body).toBeNull();
  });

  it("DeliveryCallback e MessageStatusCallback só registram evento", () => {
    expect(interpretarWebhook({ type: "DeliveryCallback", messageId: "x" }).tipo).toBe("evento");
    expect(interpretarWebhook({ type: "MessageStatusCallback", status: "READ" }).tipo).toBe("evento");
  });

  it("ConnectedCallback / DisconnectedCallback viram conexão", () => {
    const c = interpretarWebhook({
      type: "ConnectedCallback",
      connected: true,
      instanceId: "ABC",
      phone: "5562981252338",
      momment: 1790000000000,
    });
    expect(c.tipo).toBe("conexao");
    if (c.tipo === "conexao") {
      expect(c.connected).toBe(true);
      expect(c.phone).toBe("5562981252338");
    }
    const d = interpretarWebhook({
      type: "DisconnectedCallback",
      disconnected: true,
      error: "Device has been disconnected",
      instanceId: "ABC",
      momment: 1790000000000,
    });
    expect(d.tipo).toBe("conexao");
    if (d.tipo === "conexao") {
      expect(d.connected).toBe(false);
      expect(d.erro).toBe("Device has been disconnected");
    }
  });

  it("momment em segundos é corrigido para milissegundos", () => {
    const m = mensagem({ ...baseZapi, momment: 1790000000, text: { message: "x" } });
    expect(m.sentAt.getTime()).toBe(1790000000000);
  });

  it("telefone é normalizado para só dígitos", () => {
    const m = mensagem({ ...baseZapi, phone: "+55 (62) 99999-8888", text: { message: "x" } });
    expect(m.phone).toBe("5562999998888");
  });
});

describe("parser ponte local (Evolution)", () => {
  it("texto recebido", () => {
    const m = mensagem({
      type: "bridge.message",
      provider: "evolution",
      message: {
        external_id: "EV-1",
        phone: "5562999998888",
        from_me: false,
        sender_name: "Maria Souza",
        sent_at: "2026-09-28T12:00:00.000Z",
        kind: "text",
        body: "Olá, quero um orçamento",
        media_path: null,
        media_mime: null,
        media_name: null,
        is_group: false,
        outbox_id: null,
      },
    });
    expect(m.origem).toBe("bridge");
    expect(m.kind).toBe("text");
    expect(m.body).toBe("Olá, quero um orçamento");
    expect(m.contactName).toBe("Maria Souza");
    expect(m.fromMe).toBe(false);
    expect(m.sentAt.toISOString()).toBe("2026-09-28T12:00:00.000Z");
    expect(m.mediaUrl).toBeNull();
    expect(m.outboxId).toBeNull();
    expect(m.historico).toBe(false);
  });

  it("mensagem importada do histórico vem marcada", () => {
    const m = mensagem({
      type: "bridge.message",
      provider: "evolution",
      message: {
        external_id: "EV-H1",
        phone: "5562999998888",
        from_me: false,
        sender_name: "Maria Souza",
        sent_at: "2026-08-01T12:00:00.000Z",
        kind: "text",
        body: "Mensagem antiga",
        is_group: false,
        outbox_id: null,
        history: true,
      },
    });
    expect(m.historico).toBe(true);
  });

  it("áudio com media_path vira media_url storage:", () => {
    const m = mensagem({
      type: "bridge.message",
      provider: "evolution",
      message: {
        external_id: "EV-2",
        phone: "5562999998888",
        from_me: false,
        sender_name: "Maria Souza",
        sent_at: "2026-09-28T12:01:00.000Z",
        kind: "audio",
        body: null,
        media_path: "ar1-wa-media/5562999998888/EV-2.ogg",
        media_mime: "audio/ogg",
        media_name: null,
        is_group: false,
        outbox_id: null,
      },
    });
    expect(m.kind).toBe("audio");
    expect(m.mediaUrl).toBe("storage:ar1-wa-media/5562999998888/EV-2.ogg");
    expect(m.mediaMime).toBe("audio/ogg");
  });

  it("from_me com outbox_id preserva o id da fila e não usa sender_name como nome do contato", () => {
    const m = mensagem({
      type: "bridge.message",
      provider: "evolution",
      message: {
        external_id: "EV-3",
        phone: "5562999998888",
        from_me: true,
        sender_name: "AR1 Films",
        sent_at: "2026-09-28T12:02:00.000Z",
        kind: "text",
        body: "Bom dia! Vou te passar as opções.",
        media_path: null,
        media_mime: null,
        media_name: null,
        is_group: false,
        outbox_id: "0b1f8f4e-1b2c-4d5e-8f90-123456789abc",
      },
    });
    expect(m.fromMe).toBe(true);
    expect(m.outboxId).toBe("0b1f8f4e-1b2c-4d5e-8f90-123456789abc");
    expect(m.contactName).toBeNull();
  });

  it("grupo é ignorado", () => {
    const r = interpretarWebhook({
      type: "bridge.message",
      message: { external_id: "G1", phone: "5562999998888", from_me: false, kind: "text", body: "x", is_group: true },
    });
    expect(r.tipo).toBe("ignorar");
  });

  it("kind desconhecido cai em other", () => {
    const m = mensagem({
      type: "bridge.message",
      message: { external_id: "K1", phone: "5562999998888", from_me: false, kind: "poll", body: null, is_group: false },
    });
    expect(m.kind).toBe("other");
  });

  it("bridge.status vira conexão", () => {
    const r = interpretarWebhook({
      type: "bridge.status",
      provider: "evolution",
      connected: true,
      state: "open",
      phone: "5562981252338",
      checked_at: "2026-09-28T12:00:00.000Z",
    });
    expect(r.tipo).toBe("conexao");
    if (r.tipo === "conexao") {
      expect(r.connected).toBe(true);
      expect(r.state).toBe("open");
      expect(r.phone).toBe("5562981252338");
      expect(r.checkedAt).toBe("2026-09-28T12:00:00.000Z");
    }
  });

  it("bridge.qr vira qr", () => {
    const r = interpretarWebhook({
      type: "bridge.qr",
      media_path: "ar1-wa-media/_sistema/qr.png",
      updated_at: "2026-09-28T12:00:00.000Z",
    });
    expect(r.tipo).toBe("qr");
    if (r.tipo === "qr") expect(r.mediaPath).toBe("ar1-wa-media/_sistema/qr.png");
  });

  it("bridge.* desconhecido vira evento", () => {
    expect(interpretarWebhook({ type: "bridge.ping" }).tipo).toBe("evento");
  });
});

describe("mediaUrlDoBucket", () => {
  it("aceita com e sem prefixo do bucket", () => {
    expect(mediaUrlDoBucket("ar1-wa-media/a/b.jpg")).toBe("storage:ar1-wa-media/a/b.jpg");
    expect(mediaUrlDoBucket("a/b.jpg")).toBe("storage:ar1-wa-media/a/b.jpg");
    expect(mediaUrlDoBucket("/ar1-wa-media/a/b.jpg")).toBe("storage:ar1-wa-media/a/b.jpg");
  });
  it("rejeita caminho com ..", () => {
    expect(mediaUrlDoBucket("../x")).toBeNull();
    expect(mediaUrlDoBucket(null)).toBeNull();
  });
});
