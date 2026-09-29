"use client";

import { useState } from "react";
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

/**
 * Player do áudio com a transcrição embaixo. Sem transcrição, mostra o botão
 * "Transcrever" (POST /api/transcrever); o texto gravado volta também pelo
 * tempo real da conversa.
 */
function AudioComTranscricao({ m, url }: { m: Mensagem; url: string | null }) {
  const [estado, setEstado] = useState<"parado" | "transcrevendo">("parado");
  const [textoLocal, setTextoLocal] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const transcricao = m.transcript?.trim() || textoLocal;
  // Só dá para transcrever o que está guardado no painel (bucket da ponte).
  const podeTranscrever = Boolean(m.media_url?.startsWith("storage:"));

  async function transcrever() {
    setEstado("transcrevendo");
    setErro(null);
    try {
      const resposta = await fetch("/api/transcrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: m.id }),
      });
      const dados = (await resposta.json().catch(() => null)) as
        | { ok?: boolean; transcricao?: string; erro?: string }
        | null;
      if (!resposta.ok || !dados?.ok || !dados.transcricao) {
        setErro(dados?.erro || "Não foi possível transcrever este áudio. Tente de novo.");
        return;
      }
      setTextoLocal(dados.transcricao);
    } catch {
      setErro("Não foi possível falar com o servidor. Verifique a conexão e tente de novo.");
    } finally {
      setEstado("parado");
    }
  }

  return (
    <div className="space-y-1">
      {url ? <audio controls preload="none" src={url} className="max-w-full" /> : <span className="italic text-apoio">Áudio indisponível</span>}
      {transcricao ? (
        <div className="border-l-2 border-apoio/40 pl-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-apoio">Transcrição</p>
          <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">{transcricao}</p>
        </div>
      ) : estado === "transcrevendo" ? (
        <p className="text-xs italic text-apoio" role="status">
          Transcrevendo…
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs italic text-apoio">Áudio ainda sem transcrição</p>
            {podeTranscrever && (
              <button type="button" className="botao botao-secundario px-2 py-0.5 text-xs" onClick={transcrever}>
                Transcrever
              </button>
            )}
          </div>
          {erro && (
            <p className="text-xs text-erro" role="alert">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
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
      return <AudioComTranscricao m={m} url={url} />;
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
