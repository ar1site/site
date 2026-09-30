"use client";

// Prévia da proposta premium no editor: a MESMA apresentação que o cliente
// abre em /p/<token>, desenhada dentro de um quadro isolado (iframe) do
// tamanho do aparelho escolhido. Assim as medidas da página (altura da tela,
// largura do celular) valem como no aparelho de verdade:
//   - Celular: 390 × 844, como o cliente abre pelo WhatsApp;
//   - Computador: 1280 × 800;
//   - PDF: lâminas A4 paisagem, como o Chrome imprime.
// Um segundo quadro, invisível, mede as lâminas do PDF e avisa quais passam do
// tamanho da página (o que passa é cortado na impressão).

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ROTULO_SECAO, secoesVisiveis, type SecaoPremium } from "@/lib/propostas/premium/conteudo";
import { ApresentacaoPremium, type DadosDaApresentacao } from "./ApresentacaoPremium";

export type Aparelho = "celular" | "computador" | "pdf";

const APARELHOS: Record<Aparelho, { rotulo: string; largura: number; altura: number }> = {
  celular: { rotulo: "Celular", largura: 390, altura: 844 },
  computador: { rotulo: "Computador", largura: 1280, altura: 800 },
  // A4 paisagem a 96 dpi (297 × 210 mm).
  pdf: { rotulo: "PDF", largura: 1123, altura: 794 },
};

/** Seção da lâmina de fecho (sempre a última; não é editável). */
export const SECAO_FECHO = "fecho";

const DOCUMENTO_VAZIO = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head><body></body></html>';

/** Estilos do quadro: sem margem, sem barra de rolagem aparente. */
const ESTILO_DO_QUADRO =
  "html,body{margin:0;background:#111315}html{scrollbar-width:none;-webkit-text-size-adjust:100%}" +
  "html::-webkit-scrollbar{display:none}";

/** Copia as folhas de estilo da página (Tailwind, fontes, apresentação) para dentro do quadro. */
function copiarEstilos(destino: Document) {
  destino.head.querySelectorAll("[data-copia-do-painel]").forEach((n) => n.remove());
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
    const copia = n.cloneNode(true) as HTMLElement;
    copia.setAttribute("data-copia-do-painel", "");
    destino.head.appendChild(copia);
  });
  const proprio = destino.createElement("style");
  proprio.setAttribute("data-copia-do-painel", "");
  proprio.textContent = ESTILO_DO_QUADRO;
  destino.head.appendChild(proprio);
  // As variáveis das fontes (Inter, Montserrat) ficam na classe do <html>.
  destino.documentElement.className = document.documentElement.className;
}

/**
 * Quadro isolado: um iframe do mesmo endereço com os estilos da página, onde o
 * conteúdo entra por portal (continua sendo React, com os mesmos dados).
 */
function QuadroIsolado({
  titulo,
  largura,
  altura,
  estilo,
  oculto = false,
  aoPreparar,
  children,
}: {
  titulo: string;
  largura: number;
  altura: number;
  estilo?: CSSProperties;
  oculto?: boolean;
  aoPreparar?: (doc: Document) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [corpo, setCorpo] = useState<HTMLElement | null>(null);

  const preparar = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body) return;
    copiarEstilos(doc);
    setCorpo(doc.body);
    aoPreparar?.(doc);
  }, [aoPreparar]);

  // Folhas de estilo que chegam depois (outra rota, recarga em desenvolvimento).
  useEffect(() => {
    if (!corpo) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const observador = new MutationObserver(() => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        const doc = ref.current?.contentDocument;
        if (doc) copiarEstilos(doc);
      }, 150);
    });
    observador.observe(document.head, { childList: true });
    return () => {
      clearTimeout(espera);
      observador.disconnect();
    };
  }, [corpo]);

  return (
    <>
      <iframe
        ref={ref}
        title={titulo}
        srcDoc={DOCUMENTO_VAZIO}
        onLoad={preparar}
        width={largura}
        height={altura}
        tabIndex={oculto ? -1 : undefined}
        aria-hidden={oculto || undefined}
        style={{ border: 0, display: "block", width: largura, height: altura, background: "#111315", ...estilo }}
      />
      {corpo && createPortal(children, corpo)}
    </>
  );
}

/** Botões da página do cliente, só para ver na prévia (não fazem nada). */
function AcoesDeExemplo() {
  return (
    <div className="ap-acoes" aria-hidden>
      <span className="ap-botao ap-botao--cobre">Aceitar proposta</span>
      <span className="ap-botao ap-botao--contorno">Falar no WhatsApp</span>
    </div>
  );
}

/** Lâminas do modo de impressão cujo conteúdo passa da altura da página. */
function laminasQuePassam(doc: Document): string[] {
  const janela = doc.defaultView;
  if (!janela) return [];
  const passam: string[] = [];
  doc.querySelectorAll<HTMLElement>(".ap-lamina").forEach((lamina) => {
    const e = janela.getComputedStyle(lamina);
    const caixa = lamina.getBoundingClientRect();
    const disponivel = caixa.height - parseFloat(e.paddingTop) - parseFloat(e.paddingBottom);
    let topo = Infinity;
    let base = -Infinity;
    for (const filho of Array.from(lamina.children) as HTMLElement[]) {
      const ef = janela.getComputedStyle(filho);
      if (ef.position === "absolute" || ef.position === "fixed" || ef.display === "none") continue;
      const r = filho.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      topo = Math.min(topo, r.top - parseFloat(ef.marginTop || "0"));
      base = Math.max(base, r.bottom + parseFloat(ef.marginBottom || "0"));
    }
    if (base > topo && base - topo > disponivel + 2) passam.push(lamina.dataset.secao ?? "");
  });
  return passam;
}

export function rotuloDaLamina(secao: string): string {
  if (secao === SECAO_FECHO) return "Fecho";
  return ROTULO_SECAO[secao as SecaoPremium] ?? secao;
}

export function PreviaProposta({
  dados,
  secaoEmFoco,
  aoMedirPdf,
}: {
  dados: DadosDaApresentacao;
  /** Seção aberta no editor: a prévia rola até ela. */
  secaoEmFoco: SecaoPremium | null;
  /** Lâminas do PDF que passam do tamanho da página (medidas a cada mudança). */
  aoMedirPdf?: (secoes: string[]) => void;
}) {
  const [aparelho, setAparelho] = useState<Aparelho>("celular");
  const [largura, setLargura] = useState(0);
  const [alturaJanela, setAlturaJanela] = useState(800);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [docVisivel, setDocVisivel] = useState<Document | null>(null);
  const [docMedida, setDocMedida] = useState<Document | null>(null);

  // Largura disponível para a prévia (e a altura da janela, para o celular caber inteiro).
  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const medir = () => {
      setLargura(el.clientWidth);
      setAlturaJanela(window.innerHeight);
    };
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  const medida = APARELHOS[aparelho];
  const limiteDeAltura = aparelho === "celular" ? Math.max(420, alturaJanela * 0.74) : Infinity;
  const escala = largura > 0 ? Math.min(1, largura / medida.largura, limiteDeAltura / medida.altura) : 0.3;

  const rolarAte = useCallback(
    (secao: string, suave = true) => {
      const doc = docVisivel;
      const alvo = doc?.querySelector<HTMLElement>(`[data-secao="${secao}"]`);
      const janela = doc?.defaultView;
      if (!alvo || !janela) return;
      janela.scrollTo({ top: alvo.getBoundingClientRect().top + janela.scrollY, behavior: suave ? "smooth" : "auto" });
    },
    [docVisivel],
  );

  useEffect(() => {
    if (secaoEmFoco) rolarAte(secaoEmFoco);
  }, [secaoEmFoco, rolarAte, aparelho]);

  // Mede as lâminas do PDF depois de cada mudança (com as fontes carregadas).
  const conteudoJson = JSON.stringify(dados.conteudo);
  useEffect(() => {
    if (!docMedida || !aoMedirPdf) return;
    let ativo = true;
    const espera = setTimeout(() => {
      const fontes = docMedida.fonts?.ready ?? Promise.resolve();
      fontes.then(() => {
        if (ativo) aoMedirPdf(laminasQuePassam(docMedida));
      });
    }, 450);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [docMedida, aoMedirPdf, conteudoJson, dados.imagens]);

  const secoes = [...secoesVisiveis(dados.conteudo), SECAO_FECHO];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Ver a prévia como" className="inline-flex rounded-lg border border-borda bg-superficie-2 p-0.5">
          {(Object.keys(APARELHOS) as Aparelho[]).map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={aparelho === a}
              onClick={() => setAparelho(a)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                aparelho === a ? "bg-cobre text-white" : "text-apoio hover:text-texto"
              }`}
            >
              {APARELHOS[a].rotulo}
            </button>
          ))}
        </div>
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-apoio">
          <span className="shrink-0">Ir para</span>
          <select
            className="campo min-w-0 max-w-44 py-1 text-xs"
            value=""
            onChange={(e) => e.target.value && rolarAte(e.target.value)}
            aria-label="Ir para a seção"
          >
            <option value="">seção…</option>
            {secoes.map((s) => (
              <option key={s} value={s}>
                {rotuloDaLamina(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={caixaRef} className="w-full">
        <div
          className={`relative mx-auto overflow-hidden ${
            aparelho === "celular" ? "rounded-[22px] border-[3px] border-[#2f3438] shadow-2xl shadow-black/50" : "rounded-lg border border-borda"
          }`}
          style={{
            width: Math.round(medida.largura * escala) + (aparelho === "celular" ? 6 : 2),
            height: Math.round(medida.altura * escala) + (aparelho === "celular" ? 6 : 2),
          }}
        >
          <div style={{ width: medida.largura, height: medida.altura, transform: `scale(${escala})`, transformOrigin: "0 0" }}>
            <QuadroIsolado
              key={aparelho}
              titulo={`Prévia da proposta (${medida.rotulo.toLowerCase()})`}
              largura={medida.largura}
              altura={medida.altura}
              aoPreparar={setDocVisivel}
            >
              <ApresentacaoPremium
                dados={dados}
                modo={aparelho === "pdf" ? "impressao" : "tela"}
                acoes={aparelho === "pdf" ? null : <AcoesDeExemplo />}
              />
            </QuadroIsolado>
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-apoio/80">
        {aparelho === "celular" && "Como o cliente vê ao abrir o link no celular. Role dentro da prévia."}
        {aparelho === "computador" && "Como o cliente vê no computador (tela de 1280 px). Role dentro da prévia."}
        {aparelho === "pdf" && "Uma lâmina por seção, como sai no PDF (A4 paisagem)."}
      </p>

      {/* Medidor invisível das lâminas do PDF. */}
      {aoMedirPdf && (
        <div style={{ position: "fixed", left: -20000, top: 0, visibility: "hidden", pointerEvents: "none" }} aria-hidden>
          <QuadroIsolado titulo="Medição das lâminas do PDF" largura={1123} altura={794} oculto aoPreparar={setDocMedida}>
            <ApresentacaoPremium dados={dados} modo="impressao" acoes={null} />
          </QuadroIsolado>
        </div>
      )}
    </div>
  );
}
