import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Balao } from "@/components/Balao";
import type { Mensagem } from "@/lib/tipos";

function audio(parcial: Partial<Mensagem> = {}): Mensagem {
  return {
    id: "0d5c2c3a-7f0e-4a9b-9a1e-2f3d4c5b6a70",
    atendimento_id: "a",
    contact_id: "c",
    external_id: "AUD001",
    direction: "in",
    sent_by: "contato",
    sent_by_user: null,
    kind: "audio",
    body: null,
    media_url: "storage:ar1-wa-media/5562988887777/AUD001.mp3",
    media_mime: "audio/mpeg",
    media_name: null,
    transcript: null,
    sent_at: "2026-09-29T12:00:00.000Z",
    raw: null,
    created_at: "2026-09-29T12:00:00.000Z",
    ...parcial,
  };
}

const html = (m: Mensagem) => renderToStaticMarkup(createElement(Balao, { m }));

describe("balão de áudio", () => {
  it("com transcrição: mostra o rótulo e o texto; o aviso e o botão somem", () => {
    const h = html(audio({ transcript: "Quero gravar um podcast em outubro." }));
    expect(h).toContain("<audio");
    expect(h).toContain("/api/midia?path=ar1-wa-media%2F5562988887777%2FAUD001.mp3");
    expect(h).toContain("Transcrição");
    expect(h).toContain("Quero gravar um podcast em outubro.");
    expect(h).not.toContain("Áudio ainda sem transcrição");
    expect(h).not.toContain("Transcrever");
  });

  it("sem transcrição: mostra o aviso e o botão Transcrever", () => {
    const h = html(audio());
    expect(h).toContain("Áudio ainda sem transcrição");
    expect(h).toMatch(/<button[^>]*>Transcrever<\/button>/);
    expect(h).not.toContain(">Transcrição<");
  });

  it("transcrição só com espaços conta como ausente", () => {
    expect(html(audio({ transcript: "   " }))).toContain("Áudio ainda sem transcrição");
  });

  it("áudio fora do painel (URL externa) ou sem arquivo não oferece o botão", () => {
    const externo = html(audio({ media_url: "https://cdn.example/x.ogg" }));
    expect(externo).toContain("Áudio ainda sem transcrição");
    expect(externo).not.toContain("Transcrever");
    const semArquivo = html(audio({ media_url: null }));
    expect(semArquivo).toContain("Áudio indisponível");
    expect(semArquivo).not.toContain("Transcrever");
  });

  it("áudio enviado por nós também mostra a transcrição", () => {
    const h = html(audio({ direction: "out", sent_by: "celular", transcript: "Te mando a proposta amanhã." }));
    expect(h).toContain("Transcrição");
    expect(h).toContain("Te mando a proposta amanhã.");
  });
});
