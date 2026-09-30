// Página pública da proposta premium: /p/<token>, sem login. Apresentação
// rolável em tela cheia; o cliente pode aceitar ou chamar no WhatsApp.
//
// - A visita é contada pela própria página depois de abrir no navegador
//   (POST /api/p/<token>/visita): robôs de prévia e a equipe logada não contam.
// - `?impressao=1` mostra o modo de impressão (uma lâmina A4 paisagem por
//   seção, sem botões). Com a assinatura curta do servidor
//   (`?impressao=<expira>.<hmac>`, feita para o Chrome que gera o PDF), a
//   validade do link é ignorada.
// - A prévia do link (Open Graph) usa um JPG 1200x630 da galeria; link vencido
//   não mostra dados do cliente na prévia.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AcoesDoCliente } from "@/components/AcoesDoCliente";
import { ApresentacaoPremium, type DadosDaApresentacao } from "@/components/ApresentacaoPremium";
import { env } from "@/lib/env";
import { OG_ALTURA, OG_LARGURA, urlOgDaGaleria } from "@/lib/propostas/galeria";
import { ehPremium, type PropostaPremium } from "@/lib/propostas/premium/conteudo";
import { conferirImpressao } from "@/lib/propostas/premium/impressao";
import { estadoDoLink, propostaVencida } from "@/lib/propostas/premium/publico";
import { imagensAssinadas, lerPropostaPorToken } from "@/lib/propostas/premium/servidor";
import type { PropostaRegistro } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type Parametros = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ impressao?: string | string[] }>;
};

/** Uma leitura por pedido (a metadata e a página usam a mesma). */
const propostaDoToken = cache(async (token: string): Promise<(PropostaRegistro & { content: PropostaPremium }) | null> => {
  const p = await lerPropostaPorToken(token);
  if (!p || p.kind !== "premium" || !ehPremium(p.content)) return null;
  return p as PropostaRegistro & { content: PropostaPremium };
});

const imagensDaProposta = cache(async (token: string): Promise<Record<string, string>> => {
  const p = await propostaDoToken(token);
  return p ? imagensAssinadas(p) : {};
});

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  const { token } = await params;
  const p = await propostaDoToken(token);
  const base = env.appUrl;
  const semDados: Metadata = {
    title: { absolute: "Proposta · AR1 Films" },
    description: "Proposta comercial da AR1 Films.",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
  if (!p || estadoDoLink(p) !== "ativo") return semDados;

  const capa = p.content.capa.imagem;
  const og = `${base}${urlOgDaGaleria(capa?.origem === "galeria" ? capa.arquivo : "")}`;
  const titulo = `${p.content.titulo} · Proposta AR1 Films`;
  const descricao =
    p.content.subtitulo ||
    p.content.capa.frase ||
    `Proposta ${p.number} da AR1 Films para ${p.content.cliente.empresa || p.content.cliente.nome}.`;
  return {
    title: { absolute: titulo },
    description: descricao,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: {
      title: titulo,
      description: descricao,
      type: "website",
      siteName: "AR1 Films",
      locale: "pt_BR",
      images: [{ url: og, width: OG_LARGURA, height: OG_ALTURA, alt: p.content.titulo, type: "image/jpeg" }],
    },
    twitter: { card: "summary_large_image", title: titulo, description: descricao, images: [og] },
  };
}

export default async function PaginaPublicaDaProposta({ params, searchParams }: Parametros) {
  const [{ token }, consulta] = await Promise.all([params, searchParams]);
  const p = await propostaDoToken(token);
  if (!p) notFound();

  const pedidoDeImpressao = primeiro(consulta.impressao);
  const impressao = Boolean(pedidoDeImpressao);
  const interna = impressao && conferirImpressao(token, pedidoDeImpressao, process.env.WEBHOOK_SECRET);
  const ativo = estadoDoLink(p) === "ativo";

  if (!ativo && !interna) {
    return (
      <main className="ap" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "2rem 1rem" }}>
        <div style={{ maxWidth: 560 }}>
          <p className="ap-olho">AR1 Films</p>
          <h1 className="ap-h2">Este link venceu</h1>
          <span className="ap-marca" />
          <p className="ap-texto">
            A proposta {p.number} não está mais disponível por este endereço. Fale com a gente para receber uma versão
            atualizada.
          </p>
          <div className="ap-acoes">
            <AcoesDoCliente
              token={token}
              numero={p.number}
              titulo={p.content.titulo}
              aceitaPor={null}
              linkAtivo={false}
              contarVisita={false}
            />
          </div>
        </div>
      </main>
    );
  }

  const dados: DadosDaApresentacao = {
    conteudo: p.content,
    numero: p.number,
    emitidaEm: p.created_at.slice(0, 10),
    validaAte: p.valid_until,
    imagens: await imagensDaProposta(token),
    base: env.appUrl,
  };

  return (
    <main>
      <ApresentacaoPremium
        dados={dados}
        modo={impressao ? "impressao" : "tela"}
        acoes={
          impressao ? null : (
            <AcoesDoCliente
              token={token}
              numero={p.number}
              titulo={p.content.titulo}
              aceitaPor={p.status === "aceita" ? (p.accepted_name ?? "você") : null}
              linkAtivo={ativo}
              encerrada={p.status === "recusada"}
              emPreparacao={p.status === "rascunho"}
              venceuEm={propostaVencida(p.valid_until) ? p.valid_until : null}
              contarVisita
            />
          )
        }
      />
    </main>
  );
}
