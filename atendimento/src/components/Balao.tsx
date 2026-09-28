"use client";

import { horaCurta } from "@/lib/formato";
import type { Mensagem, Outbox } from "@/lib/tipos";

/** Resolve a URL de mídia: "storage:..." vira a rota assinada; http(s) passa direto. */
export function urlDaMidia(mediaUrl: string | null): string | null {
  if (!mediaUrl) return null;
  if (mediaUrl.startsWith("storage:")) {
    return `/api/midia?path=${encodeURIComponent(mediaUrl.slice("storage:".length))}`;
  }
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  return null;
}

function Conteudo({ m }: { m: Mensagem }) {
  const url = urlDaMidia(m.media_url);
  const legenda = m.body?.trim();

  switch (m.kind) {
    case "text":
      return <p className="whitespace-pre-wrap break-words">{legenda || <span className="italic text-apoio">(mensagem vazia)</span>}</p>;
    case "image":
      return (
        <div className="space-y-1">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={legenda || "Imagem recebida"} className="max-h-64 max-w-full rounded-lg object-cover" loading="lazy" />
            </a>
          ) : (
            <span className="italic text-apoio">Imagem indisponível</span>
          )}
          {legenda && <p className="whitespace-pre-wrap break-words">{legenda}</p>}
        </div>
      );
    case "audio":
      return (
        <div className="space-y-1">
          {url ? <audio controls preload="none" src={url} className="max-w-full" /> : <span className="italic text-apoio">Áudio indisponível</span>}
          {m.transcript ? (
            <p className="whitespace-pre-wrap text-sm">{m.transcript}</p>
          ) : (
            <p className="text-xs italic text-apoio">Áudio ainda sem transcrição</p>
          )}
        </div>
      );
    case "video":
      return (
        <div className="space-y-1">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              Abrir vídeo
            </a>
          ) : (
            <span className="italic text-apoio">Vídeo indisponível</span>
          )}
          {legenda && <p className="whitespace-pre-wrap break-words">{legenda}</p>}
        </div>
      );
    case "document":
      return (
        <div className="space-y-1">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline">
              <span aria-hidden>📄</span>
              {m.media_name || "Documento"}
            </a>
          ) : (
            <span className="italic text-apoio">Documento: {m.media_name || "sem nome"} (indisponível)</span>
          )}
          {legenda && <p className="whitespace-pre-wrap break-words">{legenda}</p>}
        </div>
      );
    case "sticker":
      return url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Figurinha" className="h-28 w-28 object-contain" loading="lazy" />
      ) : (
        <span className="italic text-apoio">Figurinha</span>
      );
    case "location":
      return (
        <p>
          <span className="selo mr-1">Localização</span>
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              {legenda || "Abrir no mapa"}
            </a>
          ) : (
            legenda || ""
          )}
        </p>
      );
    case "contact":
      return (
        <p>
          <span className="selo mr-1">Contato</span>
          {legenda || ""}
        </p>
      );
    default:
      return <p className="italic text-apoio">{legenda || "Mensagem de tipo não suportado"}</p>;
  }
}

export function Balao({ m, nomeAutor }: { m: Mensagem; nomeAutor?: string }) {
  const nossa = m.direction === "out";
  return (
    <div className={`flex ${nossa ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%] ${
          nossa ? "rounded-br-sm bg-cobre/25 text-texto" : "rounded-bl-sm bg-superficie text-texto"
        }`}
      >
        <Conteudo m={m} />
        <p className="mt-1 text-right text-[10px] text-apoio">
          {nossa && (
            <span className="mr-1">
              {m.sent_by === "sistema" ? `painel${nomeAutor ? ` · ${nomeAutor}` : ""}` : "celular"}
            </span>
          )}
          {horaCurta(m.sent_at)}
        </p>
      </div>
    </div>
  );
}

export function BalaoFila({ item, aoTentarDeNovo }: { item: Outbox; aoTentarDeNovo: (id: string) => void }) {
  const falhou = item.status === "failed";
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm sm:max-w-[70%] ${
          falhou ? "border border-erro/50 bg-erro/10" : "bg-cobre/15 text-texto/80"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{item.text}</p>
        {falhou ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-erro">Falhou: {item.error || "erro desconhecido"}</span>
            <button type="button" onClick={() => aoTentarDeNovo(item.id)} className="underline">
              Tentar de novo
            </button>
          </div>
        ) : (
          <p className="mt-1 text-right text-[10px] italic text-apoio">enviando…</p>
        )}
      </div>
    </div>
  );
}
