// Testes do normalizador: `node --test normalizar.test.mjs`
// Fixtures baseadas no formato dos webhooks da Evolution API v2 (envelope
// { event, instance, data, destination, date_time, sender, server_url, apikey }
// e `data` no formato do Baileys: key, pushName, message, messageType,
// messageTimestamp em segundos).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarEvento,
  normalizarMensagem,
  statusDaConsulta,
  acharInstancia,
  qrDaResposta,
  idDaRespostaDeEnvio,
  caminhoMidia,
  extensaoDoMime,
  telefoneDoJid,
  isoDoTimestamp,
  chaveDeDuplicidade,
  payloadMensagem,
  payloadQr,
  erroCurto,
  CAMINHO_QR,
} from "./normalizar.mjs";

const AGORA = () => new Date("2026-09-28T12:00:00.000Z");

function envelope(event, data, extra = {}) {
  return {
    event,
    instance: "ar1",
    data,
    destination: "http://host.docker.internal:3901/evolution",
    date_time: "2026-09-28T09:00:00.000Z",
    sender: "5562999990000@s.whatsapp.net",
    server_url: "http://localhost:8080",
    apikey: "SEGREDO-DA-INSTANCIA",
    ...extra,
  };
}

// --------------------------------------------------------------------- texto

describe("texto", () => {
  test("messages.upsert com conversation vira bridge.message de texto", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "3EB0A1B2C3D4E5F6A7B8" },
        pushName: "Maria Cliente",
        message: { conversation: "Oi, quero um orçamento de vídeo" },
        messageType: "conversation",
        messageTimestamp: 1790586000,
        instanceId: "0a1b2c3d",
        source: "android",
      }),
      { agora: AGORA },
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.evento, "messages.upsert");
    assert.deepEqual(r.mensagem, {
      external_id: "3EB0A1B2C3D4E5F6A7B8",
      phone: "5562988887777",
      from_me: false,
      sender_name: "Maria Cliente",
      sent_at: "2026-09-28T09:00:00.000Z",
      kind: "text",
      body: "Oi, quero um orçamento de vídeo",
      media_path: null,
      media_mime: null,
      media_name: null,
      is_group: false,
      outbox_id: null,
    });
    assert.equal(r.midia, null);

    const p = payloadMensagem(r.mensagem);
    assert.equal(p.type, "bridge.message");
    assert.equal(p.provider, "evolution");
    assert.equal(p.message.phone, "5562988887777");
  });

  test("evento em MAIÚSCULO_COM_SUBLINHADO também é reconhecido", () => {
    const r = normalizarEvento(
      envelope("MESSAGES_UPSERT", {
        key: { remoteJid: "5511977776666@s.whatsapp.net", fromMe: false, id: "ABC123" },
        message: { conversation: "teste" },
        messageTimestamp: "1790586000",
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.sent_at, "2026-09-28T09:00:00.000Z");
  });
});

// ------------------------------------------------------------ texto estendido

describe("texto estendido", () => {
  test("extendedTextMessage.text (com link ou resposta) vira texto", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "EXT001" },
        pushName: "Maria Cliente",
        message: {
          extendedTextMessage: {
            text: "Vi o site https://ar1films.com e gostei",
            matchedText: "https://ar1films.com",
            contextInfo: { stanzaId: "3EB0A1B2C3D4E5F6A7B8", participant: "5562999990000@s.whatsapp.net" },
          },
          messageContextInfo: { deviceListMetadataVersion: 2 },
        },
        messageType: "extendedTextMessage",
        messageTimestamp: 1790586100,
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.kind, "text");
    assert.equal(r.mensagem.body, "Vi o site https://ar1films.com e gostei");
    assert.equal(r.mensagem.media_path, null);
  });

  test("mensagem efêmera embrulhada é desembrulhada", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "EPH001" },
        message: { ephemeralMessage: { message: { extendedTextMessage: { text: "some em 7 dias" } } } },
        messageTimestamp: 1790586100,
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.body, "some em 7 dias");
  });
});

// ---------------------------------------------------------- imagem com legenda

describe("imagem com legenda", () => {
  const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  test("imageMessage com base64 no evento: media_path e mídia pronta para subir", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "IMG001" },
        pushName: "Maria Cliente",
        message: {
          imageMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7118-24/xyz.enc",
            mimetype: "image/jpeg",
            caption: "É esse o cenário",
            fileSha256: "abc",
            fileLength: "123456",
            height: 1280,
            width: 960,
            mediaKey: "chave",
            jpegThumbnail: "/9j/4AAQ",
          },
          base64: PNG_1PX,
        },
        messageType: "imageMessage",
        messageTimestamp: 1790586200,
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.kind, "image");
    assert.equal(r.mensagem.body, "É esse o cenário");
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/IMG001.jpg");
    assert.equal(r.mensagem.media_mime, "image/jpeg");
    assert.equal(r.mensagem.media_name, null);
    assert.equal(r.midia.caminho, "5562988887777/IMG001.jpg");
    assert.equal(r.midia.mime, "image/jpeg");
    assert.equal(r.midia.base64, PNG_1PX);
    assert.deepEqual(r.midia.key, { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "IMG001" });
  });

  test("imageMessage sem base64: mídia fica marcada para buscar pela API", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "IMG002" },
        message: { imageMessage: { mimetype: "image/png" } },
        messageTimestamp: 1790586200,
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.midia.base64, null);
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/IMG002.png");
  });

  test("base64 com prefixo data: é limpo", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "IMG003" },
        message: { imageMessage: { mimetype: "image/jpeg" }, base64: `data:image/jpeg;base64,${PNG_1PX}` },
        messageTimestamp: 1790586200,
      }),
    );
    assert.equal(r.midia.base64, PNG_1PX);
  });
});

// --------------------------------------------------------------------- áudio

describe("áudio", () => {
  test("audioMessage (nota de voz, ogg/opus) vira kind audio com .ogg", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "AUD001" },
        pushName: "Maria Cliente",
        message: {
          audioMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7117-24/abc.enc",
            mimetype: "audio/ogg; codecs=opus",
            fileSha256: "x",
            fileLength: "9876",
            seconds: 12,
            ptt: true,
            mediaKey: "chave",
            waveform: "AAAA",
          },
        },
        messageType: "audioMessage",
        messageTimestamp: 1790586300,
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.kind, "audio");
    assert.equal(r.mensagem.body, null);
    assert.equal(r.mensagem.media_mime, "audio/ogg");
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/AUD001.ogg");
    assert.equal(r.midia.mime, "audio/ogg");
    assert.equal(r.midia.base64, null);
  });
});

// ----------------------------------------------------------------- documento

describe("documento", () => {
  test("documentMessage guarda nome, mime e extensão do arquivo", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "DOC001" },
        pushName: "Maria Cliente",
        message: {
          documentMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7119-24/doc.enc",
            mimetype: "application/pdf",
            title: "Briefing evento",
            fileName: "Briefing evento.pdf",
            fileLength: "204800",
            pageCount: 3,
            caption: "segue o briefing",
          },
        },
        messageType: "documentMessage",
        messageTimestamp: 1790586400,
      }),
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.kind, "document");
    assert.equal(r.mensagem.body, "segue o briefing");
    assert.equal(r.mensagem.media_name, "Briefing evento.pdf");
    assert.equal(r.mensagem.media_mime, "application/pdf");
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/DOC001.pdf");
  });

  test("documentWithCaptionMessage é desembrulhado", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "DOC002" },
        message: {
          documentWithCaptionMessage: {
            message: { documentMessage: { mimetype: "application/octet-stream", fileName: "planilha.xlsx", caption: "custos" } },
          },
        },
        messageTimestamp: 1790586400,
      }),
    );
    assert.equal(r.mensagem.kind, "document");
    assert.equal(r.mensagem.body, "custos");
    // mime genérico: extensão vem do nome do arquivo
    assert.equal(r.mensagem.media_path, "ar1-wa-media/5562988887777/DOC002.xlsx");
  });

  test("outros tipos: figurinha, localização e contato", () => {
    const stk = normalizarMensagem({
      key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "STK1" },
      message: { stickerMessage: { mimetype: "image/webp", isAnimated: false } },
      messageTimestamp: 1790586400,
    });
    assert.equal(stk.mensagem.kind, "sticker");
    assert.equal(stk.mensagem.media_path, "ar1-wa-media/5562988887777/STK1.webp");

    const loc = normalizarMensagem({
      key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "LOC1" },
      message: { locationMessage: { degreesLatitude: -16.6869, degreesLongitude: -49.2648, name: "Estúdio", address: "Goiânia, GO" } },
      messageTimestamp: 1790586400,
    });
    assert.equal(loc.mensagem.kind, "location");
    assert.match(loc.mensagem.body, /^Estúdio — Goiânia, GO — -16.6869, -49.2648 — https:\/\/maps\.google\.com/);
    assert.equal(loc.mensagem.media_path, null);

    const ctt = normalizarMensagem({
      key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "CTT1" },
      message: {
        contactMessage: {
          displayName: "João Fornecedor",
          vcard: "BEGIN:VCARD\nVERSION:3.0\nFN:João Fornecedor\nTEL;type=CELL;waid=5562911112222:+55 62 91111-2222\nEND:VCARD",
        },
      },
      messageTimestamp: 1790586400,
    });
    assert.equal(ctt.mensagem.kind, "contact");
    assert.equal(ctt.mensagem.body, "João Fornecedor — 5562911112222");
  });
});

// ------------------------------------------------------------- grupo ignorado

describe("grupo ignorado", () => {
  test("remoteJid @g.us é ignorado", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "120363025246125486@g.us", fromMe: false, id: "GRP001", participant: "5562988887777@s.whatsapp.net" },
        pushName: "Maria Cliente",
        message: { conversation: "bom dia grupo" },
        messageTimestamp: 1790586500,
      }),
    );
    assert.equal(r.tipo, "ignorar");
    assert.equal(r.motivo, "grupo");
  });

  test("status@broadcast e newsletter são ignorados", () => {
    const st = normalizarMensagem({
      key: { remoteJid: "status@broadcast", fromMe: false, id: "ST1", participant: "5562988887777@s.whatsapp.net" },
      message: { imageMessage: { mimetype: "image/jpeg" } },
      messageTimestamp: 1790586500,
    });
    assert.equal(st.tipo, "ignorar");
    const nl = normalizarMensagem({
      key: { remoteJid: "120363123456789012@newsletter", fromMe: false, id: "NL1" },
      message: { conversation: "canal" },
      messageTimestamp: 1790586500,
    });
    assert.equal(nl.tipo, "ignorar");
  });

  test("reações e mensagens de protocolo são ignoradas", () => {
    const r = normalizarMensagem({
      key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "REA1" },
      message: { reactionMessage: { key: { id: "3EB0A1B2C3D4E5F6A7B8" }, text: "👍" } },
      messageTimestamp: 1790586500,
    });
    assert.equal(r.tipo, "ignorar");
  });

  test("remoteJid @lid usa remoteJidAlt para achar o telefone (CONFERIR)", () => {
    const r = normalizarMensagem({
      key: { remoteJid: "123456789012345@lid", remoteJidAlt: "5562988887777@s.whatsapp.net", fromMe: false, id: "LID1" },
      message: { conversation: "oi" },
      messageTimestamp: 1790586500,
    });
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.mensagem.phone, "5562988887777");
    const sem = normalizarMensagem({
      key: { remoteJid: "123456789012345@lid", fromMe: false, id: "LID2" },
      message: { conversation: "oi" },
    });
    assert.equal(sem.tipo, "ignorar");
  });
});

// ------------------------------------------------------------ fromMe + outbox

describe("fromMe com outbox", () => {
  test("send.message com key.id conhecido recebe outbox_id", () => {
    const mapa = new Map([["BAE5F1A2B3C4D5E6", "0d5c2c3a-7f0e-4a9b-9a1e-2f3d4c5b6a70"]]);
    const r = normalizarEvento(
      envelope("send.message", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: true, id: "BAE5F1A2B3C4D5E6" },
        pushName: "Estúdios SOBI",
        status: "PENDING",
        message: { conversation: "Olá! Recebemos seu pedido, já te retorno com valores." },
        messageType: "conversation",
        messageTimestamp: 1790586600,
        instanceId: "0a1b2c3d",
        source: "unknown",
      }),
      { outboxIdPara: (id) => mapa.get(id) },
    );
    assert.equal(r.tipo, "mensagem");
    assert.equal(r.evento, "send.message");
    assert.equal(r.mensagem.from_me, true);
    assert.equal(r.mensagem.outbox_id, "0d5c2c3a-7f0e-4a9b-9a1e-2f3d4c5b6a70");
    assert.equal(r.mensagem.phone, "5562988887777");
    assert.equal(r.mensagem.kind, "text");
  });

  test("messages.upsert com fromMe e id desconhecido (enviada pelo celular) fica sem outbox_id", () => {
    const r = normalizarEvento(
      envelope("messages.upsert", {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: true, id: "CELULAR001" },
        message: { conversation: "respondi pelo celular" },
        messageTimestamp: 1790586600,
      }),
      { outboxIdPara: () => undefined },
    );
    assert.equal(r.mensagem.from_me, true);
    assert.equal(r.mensagem.outbox_id, null);
  });

  test("mensagem recebida nunca ganha outbox_id, mesmo com id no mapa", () => {
    const r = normalizarMensagem(
      {
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "X1" },
        message: { conversation: "oi" },
      },
      { outboxIdPara: () => "uuid-qualquer" },
    );
    assert.equal(r.mensagem.outbox_id, null);
  });

  test("id da resposta do sendText é lido de key.id", () => {
    assert.equal(
      idDaRespostaDeEnvio({
        key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: true, id: "BAE5F1A2B3C4D5E6" },
        message: { conversation: "texto" },
        messageTimestamp: "1790586600",
        status: "PENDING",
      }),
      "BAE5F1A2B3C4D5E6",
    );
    assert.equal(idDaRespostaDeEnvio({}), null);
  });
});

// ------------------------------------------------------------ connection.update

describe("connection.update", () => {
  test("state open vira bridge.status conectado com telefone", () => {
    const r = normalizarEvento(
      envelope("connection.update", {
        instance: "ar1",
        state: "open",
        statusReason: 200,
        wuid: "5562999990000:12@s.whatsapp.net",
        profileName: "Estúdios SOBI",
        profilePictureUrl: null,
      }),
      { agora: AGORA },
    );
    assert.equal(r.tipo, "status");
    assert.deepEqual(r.status, {
      type: "bridge.status",
      provider: "evolution",
      connected: true,
      state: "open",
      phone: "5562999990000",
      checked_at: "2026-09-28T12:00:00.000Z",
      status_reason: 200,
    });
  });

  test("state close vira desconectado", () => {
    const r = normalizarEvento(envelope("connection.update", { instance: "ar1", state: "close", statusReason: 401 }), { agora: AGORA });
    assert.equal(r.status.connected, false);
    assert.equal(r.status.state, "close");
    assert.equal(r.status.phone, null);
  });

  test("retorno de GET /instance/connectionState vira bridge.status", () => {
    const s = statusDaConsulta({ instance: { instanceName: "ar1", state: "connecting" } }, AGORA);
    assert.equal(s.connected, false);
    assert.equal(s.state, "connecting");
    assert.equal(s.checked_at, "2026-09-28T12:00:00.000Z");
  });

  test("fetchInstances nos dois formatos", () => {
    const novo = acharInstancia(
      [{ id: "0a1b", name: "ar1", connectionStatus: "open", ownerJid: "5562999990000@s.whatsapp.net", integration: "WHATSAPP-BAILEYS" }],
      "ar1",
    );
    assert.deepEqual(novo, { nome: "ar1", estado: "open", telefone: "5562999990000" });
    const antigo = acharInstancia([{ instance: { instanceName: "ar1", status: "close" } }], "ar1");
    assert.deepEqual(antigo, { nome: "ar1", estado: "close", telefone: null });
    assert.equal(acharInstancia([{ name: "outra" }], "ar1"), null);
    assert.equal(acharInstancia(null, "ar1"), null);
  });
});

// ---------------------------------------------------------------- qrcode.updated

describe("qrcode.updated", () => {
  test("extrai o PNG em base64 (sem prefixo) e o code", () => {
    const r = normalizarEvento(
      envelope("qrcode.updated", {
        qrcode: {
          instance: "ar1",
          pairingCode: null,
          code: "2@AbCdEf...",
          base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        },
      }),
    );
    assert.equal(r.tipo, "qr");
    assert.equal(r.base64, "iVBORw0KGgoAAAANSUhEUg==");
    assert.equal(r.code, "2@AbCdEf...");
    assert.equal(payloadQr(AGORA).media_path, CAMINHO_QR);
    assert.deepEqual(payloadQr(AGORA), { type: "bridge.qr", media_path: "ar1-wa-media/_sistema/qr.png", updated_at: "2026-09-28T12:00:00.000Z" });
  });

  test("qrcode sem base64 é ignorado", () => {
    const r = normalizarEvento(envelope("qrcode.updated", { qrcode: { instance: "ar1", code: "2@x" } }));
    assert.equal(r.tipo, "ignorar");
  });

  test("retorno de GET /instance/connect traz o QR", () => {
    assert.equal(qrDaResposta({ pairingCode: null, code: "2@x", base64: "data:image/png;base64,QUJD", count: 1 }), "QUJD");
    assert.equal(qrDaResposta({ instance: { instanceName: "ar1", state: "open" } }), null);
  });
});

// -------------------------------------------------------------------- outros

describe("utilitários", () => {
  test("eventos desconhecidos e payload inválido", () => {
    assert.equal(normalizarEvento(envelope("contacts.update", {})).tipo, "outro");
    assert.equal(normalizarEvento(null).tipo, "ignorar");
    assert.equal(normalizarEvento({ data: {} }).tipo, "ignorar");
  });

  test("telefone, extensão, caminho e timestamp", () => {
    assert.equal(telefoneDoJid("5562988887777@s.whatsapp.net"), "5562988887777");
    assert.equal(telefoneDoJid("5562988887777:3@s.whatsapp.net"), "5562988887777");
    assert.equal(extensaoDoMime("audio/ogg; codecs=opus"), "ogg");
    assert.equal(extensaoDoMime("application/octet-stream", "foto.JPG"), "jpg");
    assert.equal(extensaoDoMime(null, null), "bin");
    assert.equal(caminhoMidia("5562988887777", "A/B C", "image/png"), "ar1-wa-media/5562988887777/A_B_C.png");
    assert.equal(isoDoTimestamp(1790586000), "2026-09-28T09:00:00.000Z");
    assert.equal(isoDoTimestamp(1790586000000), "2026-09-28T09:00:00.000Z");
    assert.equal(isoDoTimestamp({ low: 1790586000, high: 0, unsigned: false }), "2026-09-28T09:00:00.000Z");
    assert.equal(isoDoTimestamp(undefined, AGORA), "2026-09-28T12:00:00.000Z");
  });

  test("chave de duplicidade e erro curto", () => {
    const r = normalizarMensagem({ key: { remoteJid: "5562988887777@s.whatsapp.net", fromMe: false, id: "DUP1" }, message: { conversation: "x" } });
    assert.equal(chaveDeDuplicidade(r), "m:DUP1:0");
    assert.equal(erroCurto(new Error("  falhou\n  muito ")), "falhou muito");
    assert.equal(erroCurto("a".repeat(400)).length, 300);
  });
});
