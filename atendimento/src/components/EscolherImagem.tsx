"use client";

// Escolher a imagem de uma seção da proposta: fotos reais da galeria da AR1
// (filtradas pelas tags do serviço) ou uma imagem enviada do aparelho (logo,
// foto do cliente). A imagem enviada fica guardada só nesta proposta.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { escolherImagens, GALERIA, TAGS_DA_GALERIA, tagsDoServico, urlDaGaleria, type TagDaGaleria } from "@/lib/propostas/galeria";
import type { ImagemDaProposta } from "@/lib/propostas/premium/conteudo";

export const TIPOS_DE_IMAGEM = ["image/png", "image/jpeg", "image/webp"];
export const TAMANHO_MAXIMO_IMAGEM = 4 * 1024 * 1024;

/** Confere o arquivo antes de enviar (a rota confere de novo). */
export function problemaNaImagem(arquivo: File): string | null {
  if (!TIPOS_DE_IMAGEM.includes(arquivo.type)) return "Use uma imagem PNG, JPG ou WebP.";
  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) return "A imagem passa de 4 MB. Diminua e tente de novo.";
  return null;
}

type Filtro = "sugeridas" | "enviadas" | TagDaGaleria;

export function EscolherImagem({
  titulo,
  atual,
  servico,
  enviadas,
  permitirSemImagem = true,
  aoEscolher,
  aoEnviar,
  aoFechar,
}: {
  titulo: string;
  atual: ImagemDaProposta | null;
  servico: string | null;
  /** Imagens já enviadas nesta proposta: caminho -> URL. */
  enviadas: Record<string, string>;
  permitirSemImagem?: boolean;
  aoEscolher: (imagem: ImagemDaProposta | null) => void;
  /** Envia o arquivo e devolve o caminho no bucket (ou o erro). */
  aoEnviar: (arquivo: File) => Promise<{ caminho: string } | { erro: string }>;
  aoFechar: () => void;
}) {
  const idTitulo = useId();
  const [filtro, setFiltro] = useState<Filtro>("sugeridas");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const caminhosEnviados = Object.keys(enviadas);
  const lista = useMemo(() => {
    if (filtro === "enviadas") return [];
    if (filtro === "sugeridas") return escolherImagens(tagsDoServico(servico), GALERIA.length);
    return GALERIA.filter((i) => i.tags.includes(filtro));
  }, [filtro, servico]);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const problema = problemaNaImagem(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setEnviando(true);
    const r = await aoEnviar(arquivo);
    setEnviando(false);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if ("erro" in r) {
      setErro(r.erro);
      return;
    }
    aoEscolher({ origem: "cliente", arquivo: r.caminho });
  }

  const ehAtual = (img: ImagemDaProposta) => atual?.origem === img.origem && atual.arquivo === img.arquivo;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="cartao flex max-h-[92dvh] w-full flex-col rounded-b-none sm:max-w-3xl sm:rounded-b-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-borda px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-sm">
              {titulo}
            </h2>
            <p className="mt-0.5 text-xs text-apoio">Fotos reais da AR1 ou uma imagem enviada por você.</p>
          </div>
          <button type="button" className="-m-1 p-1 text-apoio hover:text-texto" onClick={aoFechar} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 px-4 pt-3" role="tablist" aria-label="Filtrar imagens">
          {(["sugeridas", ...TAGS_DA_GALERIA, ...(caminhosEnviados.length ? (["enviadas"] as const) : [])] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filtro === f}
              onClick={() => setFiltro(f)}
              className={`selo cursor-pointer capitalize ${filtro === f ? "border-cobre/70 bg-cobre/15 text-cobre-claro" : "hover:text-texto"}`}
            >
              {f === "sugeridas" ? "Sugeridas para o serviço" : f === "enviadas" ? `Enviadas (${caminhosEnviados.length})` : f}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtro === "enviadas" &&
              caminhosEnviados.map((caminho) => {
                const img: ImagemDaProposta = { origem: "cliente", arquivo: caminho };
                return (
                  <li key={caminho}>
                    <Miniatura url={enviadas[caminho]} legenda="Imagem enviada" marcada={ehAtual(img)} aoEscolher={() => aoEscolher(img)} />
                  </li>
                );
              })}
            {lista.map((i) => {
              const img: ImagemDaProposta = { origem: "galeria", arquivo: i.arquivo };
              return (
                <li key={i.arquivo}>
                  <Miniatura url={urlDaGaleria(i.arquivo)} legenda={i.legenda} marcada={ehAtual(img)} aoEscolher={() => aoEscolher(img)} />
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className="flex flex-col gap-2 border-t border-borda px-4 pt-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="min-w-0">
            {erro ? (
              <p className="text-xs text-erro" role="alert">
                {erro}
              </p>
            ) : (
              <p className="text-[11px] text-apoio">Enviar: PNG, JPG ou WebP até 4 MB. Fica guardada só nesta proposta.</p>
            )}
          </div>
          <div className="flex gap-2">
            {permitirSemImagem && atual && (
              <button type="button" className="botao botao-secundario flex-1 sm:flex-none" onClick={() => aoEscolher(null)} disabled={enviando}>
                Sem imagem
              </button>
            )}
            <label className={`botao botao-primario flex-1 sm:flex-none ${enviando ? "pointer-events-none opacity-50" : ""}`}>
              {enviando ? "Enviando…" : "Enviar imagem"}
              <input
                ref={arquivoRef}
                type="file"
                accept={TIPOS_DE_IMAGEM.join(",")}
                className="sr-only"
                onChange={(e) => enviar(e.target.files?.[0])}
                disabled={enviando}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function Miniatura({
  url,
  legenda,
  marcada,
  aoEscolher,
}: {
  url: string | undefined;
  legenda: string;
  marcada: boolean;
  aoEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={marcada}
      className={`group relative block w-full overflow-hidden rounded-lg border text-left transition ${
        marcada ? "border-cobre ring-2 ring-cobre" : "border-borda hover:border-apoio"
      }`}
    >
      <span className="block aspect-video w-full bg-superficie-2">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
        )}
      </span>
      <span className="block truncate bg-superficie-2 px-2 py-1 text-[11px] text-apoio">{legenda}</span>
      {marcada && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-cobre px-1.5 py-0.5 text-[10px] font-bold text-white">Em uso</span>
      )}
    </button>
  );
}
