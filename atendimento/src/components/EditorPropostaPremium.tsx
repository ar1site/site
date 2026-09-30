"use client";

// Editor da proposta premium (/propostas/[id]). Todos os campos da
// apresentação, imagens (galeria da AR1 ou enviadas), ordem das seções e o
// investimento recalculado pela tabela de preços, com a prévia ao lado (no
// celular, abaixo): a mesma página que o cliente abre. Daqui saem o PDF, o
// link para o cliente, o envio pelo WhatsApp e a marcação de aceita/recusada.
// Nada vai para o cliente sem o clique de alguém da equipe.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEquipe } from "@/lib/equipe";
import { diaCurto, diaEHora } from "@/lib/funil/datas";
import { lerValor, valorParaCampo } from "@/lib/funil/formulario";
import { buscarItensDePreco } from "@/lib/precos/dados";
import { agruparPorServico, precoComUnidade, UNIDADES, type ItemDePreco, type Unidade } from "@/lib/precos/precos";
import {
  enviarImagemDaProposta,
  gerarPdfPremium,
  lerPropostaPremium,
  mudarDiasDoLink,
  mudarSituacaoDaProposta,
  pedirLink,
  salvarConteudoPremium,
} from "@/lib/propostas/dados";
import { urlDaGaleria } from "@/lib/propostas/galeria";
import {
  conferirPremium,
  ehPremium,
  LIMITES_PREMIUM,
  ROTULO_SECAO,
  type ImagemDaProposta,
  type PropostaPremium,
  type SecaoPremium,
} from "@/lib/propostas/premium/conteudo";
import {
  AVISO_NAO_CONFIRMADO,
  MAXIMO_DE_ITENS,
  quantidadeLegivel,
  recalcularInvestimento,
  reaisPremium,
  TEXTO_SOB_CONSULTA,
  textoDoTotalPremium,
  usaValoresNaoConfirmados,
  type Investimento,
  type ItemDaTabela,
} from "@/lib/propostas/premium/investimento";
import { DIAS_LINK_MAXIMO } from "@/lib/propostas/premium/pedido";
import { estadoDoLink, podeMarcar, type StatusProposta } from "@/lib/propostas/premium/publico";
import { diaPorExtenso, validaAte, VALIDADE_MAXIMA_DIAS, VALIDADE_MINIMA_DIAS } from "@/lib/propostas/proposta";
import type { PropostaRegistro } from "@/lib/tipos";
import type { DadosDaApresentacao } from "./ApresentacaoPremium";
import { Campo, Dialogo } from "./DialogosFunil";
import { EscolherImagem, problemaNaImagem, TIPOS_DE_IMAGEM } from "./EscolherImagem";
import { PreviaProposta, rotuloDaLamina } from "./PreviaProposta";
import { EnvioDaProposta, SeloSituacao } from "./Propostas";

// ------------------------------------------------------------------ modelo

/** Linha do investimento como a tela edita (a quantidade é texto enquanto digita). */
interface LinhaNoEditor {
  chave: string;
  /** null = sob consulta. */
  price_item_id: string | null;
  descricao: string;
  quantidade: string;
  /** Só vale para "sob consulta" (com item, a unidade é a da tabela). */
  unidade: string;
}

interface Rascunho {
  /** O conteúdo editado; o investimento daqui é ignorado (sai das linhas). */
  conteudo: PropostaPremium;
  linhas: LinhaNoEditor[];
  desconto: string;
  condicoes: string;
}

let ultimaChave = 0;
const novaChave = () => `l${(ultimaChave += 1)}`;

function rascunhoDe(p: PropostaPremium, anterior?: Rascunho | null): Rascunho {
  return {
    conteudo: p,
    linhas: p.investimento.itens.map((i, k) => ({
      chave: anterior?.linhas[k]?.chave ?? novaChave(),
      price_item_id: i.price_item_id,
      descricao: i.descricao,
      quantidade: valorParaCampo(i.quantidade),
      unidade: i.unidade,
    })),
    desconto: valorParaCampo(p.investimento.desconto),
    condicoes: p.investimento.condicoes_pagamento,
  };
}

function descontoDe(texto: string): number | null {
  const d = lerValor(texto);
  return d !== null && Number.isFinite(d) && d > 0 ? d : null;
}

function investimentoDe(r: Rascunho, tabela: readonly ItemDaTabela[]): Investimento {
  return recalcularInvestimento(
    r.linhas.map((l) => ({ descricao: l.descricao, quantidade: l.quantidade, unidade: l.unidade, price_item_id: l.price_item_id })),
    tabela,
    { desconto: descontoDe(r.desconto), condicoesPagamento: r.condicoes },
  );
}

/** Sem a tabela (falha ao ler), usa os valores gravados na própria proposta. */
function tabelaDoConteudo(inv: Investimento): ItemDaTabela[] {
  return inv.itens
    .filter((i) => i.price_item_id && i.valor_unitario !== null)
    .map((i) => ({
      id: i.price_item_id as string,
      name: i.descricao,
      unit: i.unidade as Unidade,
      price: i.valor_unitario as number,
      min_qty: 1,
      active: true,
      confirmed: !i.nao_confirmado,
    }));
}

function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  if (para < 0 || para >= lista.length) return [...lista];
  const copia = [...lista];
  const [x] = copia.splice(de, 1);
  copia.splice(para, 0, x);
  return copia;
}

function trocar<T>(lista: readonly T[], i: number, novo: T): T[] {
  return lista.map((x, k) => (k === i ? novo : x));
}

function tirar<T>(lista: readonly T[], i: number): T[] {
  return lista.filter((_, k) => k !== i);
}

function vazia(p: PropostaPremium, s: SecaoPremium, inv: Investimento): boolean {
  switch (s) {
    case "capa":
      return false;
    case "entendimento":
      return !p.entendimento.trim();
    case "por_que_ar1":
      return !p.por_que_ar1.some((x) => x.trim());
    case "solucao":
      return !p.solucao.some((x) => x.titulo.trim());
    case "escopo":
      return !p.escopo_detalhado.some((x) => x.item.trim());
    case "entregas":
      return !p.entregas.some((x) => x.trim());
    case "cronograma":
      return !p.cronograma.some((x) => x.etapa.trim());
    case "investimento":
      return inv.itens.length === 0;
    case "proximos_passos":
      return !p.proximos_passos.some((x) => x.trim());
    case "observacoes":
      return !(p.observacoes ?? "").trim();
  }
}

function contagem(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function resumoDaSecao(p: PropostaPremium, s: SecaoPremium, inv: Investimento): string {
  switch (s) {
    case "capa":
      return p.titulo || "sem título";
    case "entendimento":
      return p.entendimento.trim().slice(0, 70) || "";
    case "por_que_ar1":
      return contagem(p.por_que_ar1.filter((x) => x.trim()).length, "motivo", "motivos");
    case "solucao":
      return contagem(p.solucao.length, "bloco", "blocos");
    case "escopo":
      return contagem(p.escopo_detalhado.length, "item", "itens");
    case "entregas":
      return contagem(p.entregas.length, "entrega", "entregas");
    case "cronograma":
      return contagem(p.cronograma.length, "etapa", "etapas");
    case "investimento":
      return textoDoTotalPremium(inv);
    case "proximos_passos":
      return contagem(p.proximos_passos.length, "passo", "passos");
    case "observacoes":
      return (p.observacoes ?? "").trim().slice(0, 70);
  }
}

type Aviso = { tipo: "erro" | "ok"; texto: string } | null;
type Ocupado = null | "salvar" | "pdf" | "situacao" | "link" | "dias" | "logo" | "envio";
type AlvoDaImagem = { alvo: "capa" } | { alvo: "solucao"; indice: number };
interface LinkPronto {
  link: string;
  texto: string;
  expira_em: string | null;
  dias: number;
}

// ------------------------------------------------------------------ editor

export function EditorPropostaPremium({ id, nova }: { id: string; nova: boolean }) {
  const router = useRouter();
  const { nomeDe } = useEquipe();
  const [proposta, setProposta] = useState<PropostaRegistro | null>(null);
  const [erroCarga, setErroCarga] = useState<{ texto: string; faltaMigracao: boolean } | null>(null);
  const [imagens, setImagens] = useState<Record<string, string>>({});
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvo, setSalvo] = useState("");
  const [tabela, setTabela] = useState<ItemDePreco[] | null>(null);
  const [erroTabela, setErroTabela] = useState<string | null>(null);
  const [recados, setRecados] = useState<{ pendencias: string[]; avisos: string[] } | null>(null);
  const [aberta, setAberta] = useState<SecaoPremium | null>(null);
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [cortadas, setCortadas] = useState<string[]>([]);
  const [escolhendo, setEscolhendo] = useState<AlvoDaImagem | null>(null);
  const [linkPronto, setLinkPronto] = useState<LinkPronto | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const [diasLink, setDiasLink] = useState("");
  const [agora, setAgora] = useState(() => Date.now());
  const rascunhoAtual = useRef<Rascunho | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    rascunhoAtual.current = rascunho;
  }, [rascunho]);

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 4000 : 9000);
  }, []);

  // Carrega a proposta e a tabela de preços (para recalcular na hora).
  useEffect(() => {
    let ativo = true;
    (async () => {
      const [r, t] = await Promise.all([lerPropostaPremium(id), buscarItensDePreco()]);
      if (!ativo) return;
      if (t.ok) setTabela(t.itens);
      else setErroTabela(t.erro);
      if (!r.ok) {
        setErroCarga({ texto: r.erro, faltaMigracao: r.faltaMigracao === true });
        return;
      }
      if (r.proposta.kind !== "premium" || !ehPremium(r.proposta.content)) {
        router.replace(`/funil/${r.proposta.quote_request_id}`);
        return;
      }
      const novo = rascunhoDe(r.proposta.content);
      setProposta(r.proposta);
      setImagens(r.imagens);
      setRascunho(novo);
      setSalvo(JSON.stringify(novo));
      setDiasLink(String(r.proposta.public_days || 30));
      setAgora(Date.now());
      if (nova) {
        // Recados da IA deixados pela tela Nova proposta (lidos uma vez).
        try {
          const chave = `ar1.proposta.avisos.${id}`;
          const bruto = window.sessionStorage.getItem(chave);
          window.sessionStorage.removeItem(chave);
          const lido = bruto ? (JSON.parse(bruto) as { pendencias?: unknown; avisos?: unknown }) : null;
          const textos = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
          if (lido) {
            const pendencias = textos(lido.pendencias);
            const avisos = textos(lido.avisos).filter((a) => a !== AVISO_NAO_CONFIRMADO);
            if (pendencias.length || avisos.length) setRecados({ pendencias, avisos });
          }
        } catch {
          // sem armazenamento: segue sem os recados
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [id, nova, router]);

  const tabelaEfetiva = useMemo<readonly ItemDaTabela[]>(() => {
    if (tabela) return tabela;
    return proposta && ehPremium(proposta.content) ? tabelaDoConteudo(proposta.content.investimento) : [];
  }, [tabela, proposta]);

  const investimento = useMemo(() => (rascunho ? investimentoDe(rascunho, tabelaEfetiva) : null), [rascunho, tabelaEfetiva]);
  const conteudo = useMemo<PropostaPremium | null>(
    () => (rascunho && investimento ? { ...rascunho.conteudo, investimento } : null),
    [rascunho, investimento],
  );
  const sujo = rascunho !== null && JSON.stringify(rascunho) !== salvo;

  const dados = useMemo<DadosDaApresentacao | null>(() => {
    if (!proposta || !conteudo) return null;
    return {
      conteudo,
      numero: proposta.number,
      emitidaEm: proposta.created_at.slice(0, 10),
      validaAte: validaAte(new Date(proposta.created_at), conteudo.validade_dias),
      imagens,
    };
  }, [proposta, conteudo, imagens]);

  // Avisa antes de fechar a aba com alterações não salvas.
  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [sujo]);

  const aoMedirPdf = useCallback((secoes: string[]) => setCortadas(secoes), []);

  // ---------------------------------------------------------------- edição

  const mudarConteudo = (f: (c: PropostaPremium) => PropostaPremium) =>
    setRascunho((r) => (r ? { ...r, conteudo: f(r.conteudo) } : r));
  const mudarRascunho = (f: (r: Rascunho) => Rascunho) => setRascunho((r) => (r ? f(r) : r));

  function moverSecao(secao: SecaoPremium, direcao: -1 | 1) {
    mudarConteudo((c) => {
      const i = c.ordem_secoes.indexOf(secao);
      const alvo = i + direcao;
      if (i <= 0 || alvo <= 0 || alvo >= c.ordem_secoes.length) return c;
      return { ...c, ordem_secoes: mover(c.ordem_secoes, i, alvo) };
    });
  }

  // ------------------------------------------------------------- servidor

  /** Salva e devolve a proposta gravada (ou null quando não deu). */
  async function salvar(): Promise<PropostaRegistro | null> {
    if (!rascunho || !conteudo || !proposta) return null;
    const conferida = conferirPremium(conteudo);
    if (!conferida.ok) {
      mostrar("erro", conferida.erro);
      return null;
    }
    const enviado = JSON.stringify(rascunho);
    setOcupado("salvar");
    const r = await salvarConteudoPremium(proposta.id, conteudo);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return null;
    }
    setProposta(r.proposta);
    setImagens((atual) => ({ ...atual, ...r.imagens }));
    setAgora(Date.now());
    const mudouDepois = JSON.stringify(rascunhoAtual.current) !== enviado;
    if (!mudouDepois && ehPremium(r.proposta.content)) {
      const novo = rascunhoDe(r.proposta.content, rascunhoAtual.current);
      setRascunho(novo);
      setSalvo(JSON.stringify(novo));
    } else {
      // Editou enquanto salvava: o que foi enviado está salvo; o resto continua pendente.
      setSalvo(enviado);
    }
    mostrar("ok", "Proposta salva.");
    return r.proposta;
  }

  async function garantirSalvo(): Promise<PropostaRegistro | null> {
    if (sujo) return salvar();
    return proposta;
  }

  async function recarregar() {
    const r = await lerPropostaPremium(id);
    if (r.ok) {
      setProposta(r.proposta);
      setImagens((atual) => ({ ...atual, ...r.imagens }));
      setAgora(Date.now());
    }
  }

  async function gerarPdf() {
    const p = await garantirSalvo();
    if (!p) return;
    setOcupado("pdf");
    const r = await gerarPdfPremium(p.id);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    setProposta(r.proposta);
    setAgora(Date.now());
    mostrar(
      "ok",
      r.proposta.pdf_engine === "pdf-lib"
        ? "PDF gerado pela versão simples (o Chrome não funcionou). O motivo está no quadro da proposta."
        : "PDF gerado. Já dá para baixar.",
    );
  }

  async function abrirLink() {
    const p = await garantirSalvo();
    if (!p) return;
    setOcupado("link");
    const r = await pedirLink(p.id);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    setLinkPronto({ link: r.link, texto: r.texto, expira_em: r.expira_em, dias: r.dias });
    await recarregar();
  }

  async function abrirEnvio() {
    const p = await garantirSalvo();
    if (!p) return;
    setEnvioAberto(true);
  }

  async function renovarLink() {
    if (!proposta) return;
    const dias = Number(diasLink);
    if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_LINK_MAXIMO) {
      mostrar("erro", `Use de 1 a ${DIAS_LINK_MAXIMO} dias.`);
      return;
    }
    setOcupado("dias");
    const r = await mudarDiasDoLink(proposta.id, dias);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    setProposta(r.proposta);
    setAgora(Date.now());
    mostrar("ok", `Link válido por ${dias} ${dias === 1 ? "dia" : "dias"} a partir de hoje.`);
  }

  async function marcar(novo: StatusProposta) {
    if (!proposta) return;
    const perguntas: Partial<Record<StatusProposta, string>> = {
      aceita: "Marcar esta proposta como aceita pelo cliente?",
      recusada: "Marcar esta proposta como recusada? O cliente não consegue mais aceitar pelo link.",
      gerada: "Reabrir a proposta? A marcação de aceita/recusada é desfeita.",
    };
    if (perguntas[novo] && !window.confirm(perguntas[novo])) return;
    setOcupado("situacao");
    const r = await mudarSituacaoDaProposta(proposta.id, novo);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    setProposta(r.proposta);
    setAgora(Date.now());
    mostrar("ok", novo === "aceita" ? "Marcada como aceita." : novo === "recusada" ? "Marcada como recusada." : "Proposta reaberta.");
  }

  async function enviarImagem(arquivo: File): Promise<{ caminho: string } | { erro: string }> {
    const r = await enviarImagemDaProposta(id, arquivo);
    if (!r.ok) return { erro: r.erro };
    const { caminho, url } = r;
    if (url) setImagens((atual) => ({ ...atual, [caminho]: url }));
    return { caminho };
  }

  async function enviarLogo(arquivo: File | undefined) {
    if (!arquivo) return;
    const problema = problemaNaImagem(arquivo);
    if (problema) {
      mostrar("erro", problema);
      return;
    }
    setOcupado("logo");
    const r = await enviarImagem(arquivo);
    setOcupado(null);
    if (logoRef.current) logoRef.current.value = "";
    if ("erro" in r) {
      mostrar("erro", r.erro);
      return;
    }
    mudarConteudo((c) => ({ ...c, logo_cliente: r.caminho }));
  }

  function escolherImagem(img: ImagemDaProposta | null) {
    const alvo = escolhendo;
    setEscolhendo(null);
    if (!alvo) return;
    if (alvo.alvo === "capa") mudarConteudo((c) => ({ ...c, capa: { ...c.capa, imagem: img } }));
    else
      mudarConteudo((c) => ({
        ...c,
        solucao: c.solucao.map((s, k) => (k === alvo.indice ? { ...s, imagem: img } : s)),
      }));
  }

  // ------------------------------------------------------------- telas

  if (erroCarga) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <Link href="/propostas" className="inline-flex items-center gap-1 text-xs text-apoio hover:text-texto">
          <IconeVoltar /> Propostas
        </Link>
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            erroCarga.faltaMigracao ? "border-alerta/60 bg-alerta/10 text-alerta" : "border-erro/50 bg-erro/10 text-erro"
          }`}
        >
          {erroCarga.texto}
        </p>
      </div>
    );
  }

  if (!proposta || !rascunho || !conteudo || !investimento || !dados) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <p className="text-sm text-apoio">Carregando a proposta…</p>
      </div>
    );
  }

  const p = rascunho.conteudo;
  const ordem = p.ordem_secoes;
  const estadoLink = estadoDoLink(proposta, agora);
  const naoConfirmados = usaValoresNaoConfirmados(investimento);
  const logoUrl = p.logo_cliente ? imagens[p.logo_cliente] : null;
  const alvoAtual: ImagemDaProposta | null =
    escolhendo?.alvo === "capa" ? p.capa.imagem : escolhendo?.alvo === "solucao" ? (p.solucao[escolhendo.indice]?.imagem ?? null) : null;
  const trabalhando = ocupado !== null;
  const nomeCliente = p.cliente.empresa || p.cliente.nome || "Cliente";

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-12 lg:px-6">
      {/* Barra do editor */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-borda bg-fundo/95 px-4 py-2.5 backdrop-blur lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/propostas"
            className="-ml-1 shrink-0 rounded-md p-1 text-apoio hover:text-texto"
            aria-label="Voltar para Propostas"
            onClick={(e) => {
              if (sujo && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) e.preventDefault();
            }}
          >
            <IconeVoltar />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{p.titulo || "Proposta sem título"}</p>
            <p className="truncate text-[11px] text-apoio">
              {proposta.number} · {nomeCliente}
            </p>
          </div>
          <span className={`hidden text-[11px] sm:inline ${sujo ? "text-alerta" : "text-apoio"}`} role="status">
            {ocupado === "salvar" ? "Salvando…" : sujo ? "Alterações não salvas" : "Tudo salvo"}
          </span>
          <a href="#previa" className="botao botao-secundario shrink-0 px-3 py-1.5 text-xs xl:hidden">
            Prévia
          </a>
          <button
            type="button"
            className="botao botao-primario shrink-0 px-3 py-1.5 text-xs"
            onClick={() => void salvar()}
            disabled={!sujo || trabalhando}
          >
            {ocupado === "salvar" ? "Salvando…" : sujo ? "Salvar" : "Salvo"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Coluna do editor */}
        <div className="min-w-0 space-y-4">
          {/* Situação e ações */}
          <section className="cartao space-y-3 p-4" aria-label="Situação da proposta">
            <div className="flex flex-wrap items-center gap-2">
              <SeloSituacao p={proposta} agora={agora} />
              {estadoLink === "ativo" && proposta.public_expires_at && (
                <span className="selo">Link ativo até {diaCurto(proposta.public_expires_at, agora)}</span>
              )}
              {estadoLink === "expirado" && <span className="selo border-alerta/60 text-alerta">Link vencido</span>}
              {naoConfirmados && <span className="selo border-alerta/60 text-alerta">Valores não confirmados</span>}
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-apoio">Cliente</dt>
              <dd className="min-w-0 break-words">
                {p.cliente.empresa ? `${p.cliente.empresa} · ${p.cliente.nome}` : p.cliente.nome}
              </dd>
              <dt className="text-apoio">Serviço</dt>
              <dd>{proposta.service || "—"}</dd>
              <dt className="text-apoio">Total</dt>
              <dd className="font-semibold">
                {textoDoTotalPremium(investimento)}
                {sujo && <span className="ml-1 font-normal text-alerta">(não salvo)</span>}
              </dd>
              <dt className="text-apoio">Criada</dt>
              <dd>
                {diaEHora(proposta.created_at)} por {nomeDe(proposta.created_by) || "equipe"}
                {proposta.model ? " · com IA" : ""}
              </dd>
              <dt className="text-apoio">Visualizações</dt>
              <dd>
                {proposta.views === 0
                  ? "o cliente ainda não abriu"
                  : `${proposta.views} · primeira ${diaEHora(proposta.first_viewed_at)} · última ${diaEHora(proposta.last_viewed_at)}`}
              </dd>
              {proposta.status === "aceita" && (
                <>
                  <dt className="text-apoio">Aceite</dt>
                  <dd className="text-ok">
                    {proposta.accepted_name
                      ? `${proposta.accepted_name}, pela página, em ${diaEHora(proposta.accepted_at)}`
                      : `marcada pela equipe${proposta.decided_by ? ` (${nomeDe(proposta.decided_by) || "equipe"})` : ""} em ${diaEHora(proposta.decided_at)}`}
                  </dd>
                </>
              )}
              {proposta.status === "recusada" && (
                <>
                  <dt className="text-apoio">Recusa</dt>
                  <dd>
                    marcada {proposta.decided_by ? `por ${nomeDe(proposta.decided_by) || "equipe"} ` : ""}em {diaEHora(proposta.decided_at)}
                  </dd>
                </>
              )}
              {proposta.sent_at && (
                <>
                  <dt className="text-apoio">Enviada</dt>
                  <dd>
                    {diaEHora(proposta.sent_at)}
                    {proposta.sent_by ? ` por ${nomeDe(proposta.sent_by) || "equipe"}` : ""}
                  </dd>
                </>
              )}
              <dt className="text-apoio">PDF</dt>
              <dd>
                {proposta.file_path
                  ? `${proposta.pdf_engine === "pdf-lib" ? "versão simples" : "apresentação completa"}${proposta.pages ? ` · ${contagem(proposta.pages, "página", "páginas")}` : ""}`
                  : "ainda não gerado"}
              </dd>
            </dl>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Link href={`/funil/${proposta.quote_request_id}`} className="text-cobre-claro underline">
                Abrir a oportunidade
              </Link>
              {proposta.atendimento_id && (
                <Link href={`/atendimento/${proposta.atendimento_id}`} className="text-cobre-claro underline">
                  Abrir a conversa
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                className="botao botao-primario col-span-2 sm:col-span-1"
                onClick={() => void abrirEnvio()}
                disabled={!proposta.atendimento_id || trabalhando}
                title={proposta.atendimento_id ? undefined : "Este cliente não tem conversa no WhatsApp"}
              >
                Enviar pelo WhatsApp
              </button>
              <button type="button" className="botao botao-secundario" onClick={() => void abrirLink()} disabled={trabalhando}>
                {ocupado === "link" ? "Preparando…" : "Link para o cliente"}
              </button>
              <button type="button" className="botao botao-secundario" onClick={() => void gerarPdf()} disabled={trabalhando}>
                {ocupado === "pdf" ? "Gerando o PDF…" : proposta.file_path ? "Gerar PDF de novo" : "Gerar PDF"}
              </button>
              {proposta.file_path && (
                <a
                  href={`/api/propostas/${proposta.id}/arquivo`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`botao botao-secundario ${trabalhando ? "pointer-events-none opacity-50" : ""}`}
                >
                  Baixar PDF
                </a>
              )}
            </div>
            {!proposta.atendimento_id && (
              <p className="text-[11px] leading-relaxed text-apoio">
                Cliente sem conversa no WhatsApp: use “Link para o cliente” e envie por outro canal.
              </p>
            )}
            {ocupado === "pdf" && (
              <p className="text-[11px] text-apoio" role="status">
                O Chrome está montando as lâminas. Pode levar até 1 minuto; não feche esta tela.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2 border-t border-borda pt-3">
              <Campo rotulo="Validade do link (dias)" className="w-32">
                <input
                  className="campo text-sm"
                  inputMode="numeric"
                  value={diasLink}
                  onChange={(e) => setDiasLink(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  aria-describedby="ajuda-link"
                />
              </Campo>
              <button type="button" className="botao botao-secundario" onClick={() => void renovarLink()} disabled={trabalhando}>
                {ocupado === "dias" ? "Renovando…" : "Renovar a partir de hoje"}
              </button>
              <p id="ajuda-link" className="w-full text-[11px] text-apoio">
                {estadoLink === "expirado"
                  ? "O link venceu: o cliente vê só o aviso e o WhatsApp. Renove para ele voltar a abrir."
                  : "Depois do prazo, o link para de abrir a apresentação."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-borda pt-3">
              {podeMarcar(proposta.status, "aceita") && (
                <button type="button" className="botao botao-secundario border-ok/50 text-ok" onClick={() => void marcar("aceita")} disabled={trabalhando}>
                  Marcar como aceita
                </button>
              )}
              {podeMarcar(proposta.status, "recusada") && (
                <button type="button" className="botao botao-perigo" onClick={() => void marcar("recusada")} disabled={trabalhando}>
                  Marcar como recusada
                </button>
              )}
              {(proposta.status === "aceita" || proposta.status === "recusada") && (
                <button type="button" className="botao botao-secundario" onClick={() => void marcar("gerada")} disabled={trabalhando}>
                  Reabrir
                </button>
              )}
            </div>
          </section>

          {/* Avisos internos (nunca aparecem para o cliente) */}
          <AvisosInternos
            naoConfirmados={naoConfirmados}
            sobConsulta={investimento.sob_consulta}
            cortadas={cortadas}
            erroTabela={erroTabela}
            pdfErro={proposta.pdf_engine === "pdf-lib" ? proposta.pdf_error : null}
            recados={recados}
            aoFecharRecados={() => setRecados(null)}
          />

          {/* Seções */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm">Conteúdo</h2>
              <p className="text-[11px] text-apoio">As setas mudam a ordem na apresentação.</p>
            </div>
            {ordem.map((secao, indice) => (
              <CartaoDaSecao
                key={secao}
                titulo={ROTULO_SECAO[secao]}
                resumo={resumoDaSecao(p, secao, investimento)}
                vazia={vazia(p, secao, investimento)}
                aberta={aberta === secao}
                aoAbrir={() => setAberta((a) => (a === secao ? null : secao))}
                podeSubir={indice > 1}
                podeDescer={indice > 0 && indice < ordem.length - 1}
                fixa={secao === "capa"}
                aoMover={(d) => moverSecao(secao, d)}
              >
                {secao === "capa" && (
                  <div className="space-y-3">
                    <Campo rotulo="Título da proposta">
                      <input
                        className="campo text-sm"
                        value={p.titulo}
                        maxLength={LIMITES_PREMIUM.titulo}
                        onChange={(e) => mudarConteudo((c) => ({ ...c, titulo: e.target.value }))}
                      />
                    </Campo>
                    <Campo rotulo="Subtítulo">
                      <input
                        className="campo text-sm"
                        value={p.subtitulo}
                        maxLength={LIMITES_PREMIUM.subtitulo}
                        onChange={(e) => mudarConteudo((c) => ({ ...c, subtitulo: e.target.value }))}
                      />
                    </Campo>
                    <Campo rotulo="Frase de abertura">
                      <textarea
                        className="campo min-h-16 text-sm"
                        value={p.capa.frase}
                        maxLength={LIMITES_PREMIUM.frase}
                        onChange={(e) => mudarConteudo((c) => ({ ...c, capa: { ...c.capa, frase: e.target.value } }))}
                      />
                    </Campo>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Campo rotulo="Nome do cliente">
                        <input
                          className="campo text-sm"
                          value={p.cliente.nome}
                          maxLength={200}
                          onChange={(e) => mudarConteudo((c) => ({ ...c, cliente: { ...c.cliente, nome: e.target.value } }))}
                        />
                      </Campo>
                      <Campo rotulo="Empresa">
                        <input
                          className="campo text-sm"
                          value={p.cliente.empresa ?? ""}
                          maxLength={200}
                          onChange={(e) => mudarConteudo((c) => ({ ...c, cliente: { ...c.cliente, empresa: e.target.value || null } }))}
                        />
                      </Campo>
                    </div>
                    <SeletorDeImagem
                      rotulo="Imagem de fundo da capa"
                      url={urlDaImagemLocal(p.capa.imagem, imagens)}
                      aoTrocar={() => setEscolhendo({ alvo: "capa" })}
                    />
                    <div>
                      <span className="mb-1 block text-xs text-apoio">Logo do cliente (aparece na capa)</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-md border border-borda bg-superficie-2">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt="Logo do cliente" className="max-h-full max-w-full object-contain" />
                          ) : (
                            <span className="text-[11px] text-apoio">sem logo</span>
                          )}
                        </span>
                        <label className={`botao botao-secundario px-3 py-1.5 text-xs ${ocupado === "logo" ? "pointer-events-none opacity-50" : ""}`}>
                          {ocupado === "logo" ? "Enviando…" : p.logo_cliente ? "Trocar logo" : "Enviar logo"}
                          <input
                            ref={logoRef}
                            type="file"
                            accept={TIPOS_DE_IMAGEM.join(",")}
                            className="sr-only"
                            onChange={(e) => void enviarLogo(e.target.files?.[0])}
                          />
                        </label>
                        {p.logo_cliente && (
                          <button type="button" className="text-xs text-apoio underline hover:text-texto" onClick={() => mudarConteudo((c) => ({ ...c, logo_cliente: null }))}>
                            remover
                          </button>
                        )}
                      </div>
                      <span className="mt-1 block text-[11px] text-apoio/80">PNG com fundo transparente fica melhor. Até 4 MB.</span>
                    </div>
                    <Campo
                      rotulo="Validade da proposta (dias)"
                      ajuda={`Válida até ${diaPorExtenso(dados.validaAte)}. Aparece na capa e no fecho.`}
                      className="w-56"
                    >
                      <CampoNumerico
                        valor={p.validade_dias}
                        inteiro
                        aoMudar={(n) => {
                          if (n === null) return;
                          mudarConteudo((c) => ({ ...c, validade_dias: Math.min(VALIDADE_MAXIMA_DIAS, Math.max(VALIDADE_MINIMA_DIAS, n)) }));
                        }}
                      />
                    </Campo>
                  </div>
                )}

                {secao === "entendimento" && (
                  <Campo rotulo="O que o cliente precisa" ajuda="Separe os parágrafos com uma linha em branco. Ideal: 2 ou 3 parágrafos curtos.">
                    <textarea
                      className="campo min-h-44 text-sm"
                      value={p.entendimento}
                      maxLength={LIMITES_PREMIUM.entendimento}
                      onChange={(e) => mudarConteudo((c) => ({ ...c, entendimento: e.target.value }))}
                    />
                    <Contador atual={p.entendimento.length} limite={LIMITES_PREMIUM.entendimento} />
                  </Campo>
                )}

                {secao === "por_que_ar1" && (
                  <ListaDeTextos
                    itens={p.por_que_ar1}
                    maximo={LIMITES_PREMIUM.porQue}
                    limite={LIMITES_PREMIUM.porQueItem}
                    rotulo="Motivo"
                    rotuloAdicionar="Adicionar motivo"
                    multilinha
                    aoMudar={(lista) => mudarConteudo((c) => ({ ...c, por_que_ar1: lista }))}
                  />
                )}

                {secao === "solucao" && (
                  <ListaEditavel
                    itens={p.solucao}
                    maximo={LIMITES_PREMIUM.solucao}
                    rotuloAdicionar="Adicionar bloco"
                    novo={() => ({ titulo: "", descricao: "", imagem: null })}
                    aoMudar={(lista) => mudarConteudo((c) => ({ ...c, solucao: lista }))}
                    rotuloDoItem={(i) => `Bloco ${i + 1}`}
                    render={(s, i, mudar) => (
                      <div className="space-y-2">
                        <Campo rotulo="Título">
                          <input className="campo text-sm" value={s.titulo} maxLength={LIMITES_PREMIUM.solucaoTitulo} onChange={(e) => mudar({ ...s, titulo: e.target.value })} />
                        </Campo>
                        <Campo rotulo="Descrição">
                          <textarea
                            className="campo min-h-20 text-sm"
                            value={s.descricao}
                            maxLength={LIMITES_PREMIUM.solucaoDescricao}
                            onChange={(e) => mudar({ ...s, descricao: e.target.value })}
                          />
                        </Campo>
                        <SeletorDeImagem rotulo="Imagem" url={urlDaImagemLocal(s.imagem, imagens)} aoTrocar={() => setEscolhendo({ alvo: "solucao", indice: i })} compacto />
                      </div>
                    )}
                  />
                )}

                {secao === "escopo" && (
                  <ListaEditavel
                    itens={p.escopo_detalhado}
                    maximo={LIMITES_PREMIUM.escopo}
                    rotuloAdicionar="Adicionar item"
                    novo={() => ({ item: "", descricao: "", quantidade: null, unidade: null })}
                    aoMudar={(lista) => mudarConteudo((c) => ({ ...c, escopo_detalhado: lista }))}
                    rotuloDoItem={(i) => `Item ${i + 1}`}
                    render={(e, _i, mudar) => (
                      <div className="space-y-2">
                        <Campo rotulo="Item">
                          <input className="campo text-sm" value={e.item} maxLength={LIMITES_PREMIUM.escopoItem} onChange={(ev) => mudar({ ...e, item: ev.target.value })} />
                        </Campo>
                        <Campo rotulo="Descrição">
                          <textarea
                            className="campo min-h-14 text-sm"
                            value={e.descricao}
                            maxLength={LIMITES_PREMIUM.escopoDescricao}
                            onChange={(ev) => mudar({ ...e, descricao: ev.target.value })}
                          />
                        </Campo>
                        <div className="grid grid-cols-2 gap-2">
                          <Campo rotulo="Quantidade (opcional)">
                            <CampoNumerico valor={e.quantidade} aoMudar={(n) => mudar({ ...e, quantidade: n })} />
                          </Campo>
                          <Campo rotulo="Unidade (opcional)">
                            <input
                              className="campo text-sm"
                              value={e.unidade ?? ""}
                              maxLength={40}
                              placeholder="episódio, dia, câmera…"
                              onChange={(ev) => mudar({ ...e, unidade: ev.target.value || null })}
                            />
                          </Campo>
                        </div>
                      </div>
                    )}
                  />
                )}

                {secao === "entregas" && (
                  <ListaDeTextos
                    itens={p.entregas}
                    maximo={LIMITES_PREMIUM.entregas}
                    limite={LIMITES_PREMIUM.entrega}
                    rotulo="Entrega"
                    rotuloAdicionar="Adicionar entrega"
                    aoMudar={(lista) => mudarConteudo((c) => ({ ...c, entregas: lista }))}
                  />
                )}

                {secao === "cronograma" && (
                  <ListaEditavel
                    itens={p.cronograma}
                    maximo={LIMITES_PREMIUM.etapas}
                    rotuloAdicionar="Adicionar etapa"
                    novo={() => ({ etapa: "", prazo: "" })}
                    aoMudar={(lista) => mudarConteudo((c) => ({ ...c, cronograma: lista }))}
                    rotuloDoItem={(i) => `Etapa ${i + 1}`}
                    render={(c, _i, mudar) => (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                        <Campo rotulo="Etapa">
                          <input className="campo text-sm" value={c.etapa} maxLength={LIMITES_PREMIUM.etapa} onChange={(e) => mudar({ ...c, etapa: e.target.value })} />
                        </Campo>
                        <Campo rotulo="Prazo">
                          <input
                            className="campo text-sm"
                            value={c.prazo}
                            maxLength={LIMITES_PREMIUM.prazo}
                            placeholder="Ex.: semana 1, 24/10, a definir"
                            onChange={(e) => mudar({ ...c, prazo: e.target.value })}
                          />
                        </Campo>
                      </div>
                    )}
                  />
                )}

                {secao === "investimento" && (
                  <EditorDoInvestimento
                    rascunho={rascunho}
                    investimento={investimento}
                    tabela={tabela}
                    tabelaEfetiva={tabelaEfetiva}
                    aoMudar={mudarRascunho}
                  />
                )}

                {secao === "proximos_passos" && (
                  <ListaDeTextos
                    itens={p.proximos_passos}
                    maximo={LIMITES_PREMIUM.proximosPassos}
                    limite={LIMITES_PREMIUM.passo}
                    rotulo="Passo"
                    rotuloAdicionar="Adicionar passo"
                    aoMudar={(lista) => mudarConteudo((c) => ({ ...c, proximos_passos: lista }))}
                  />
                )}

                {secao === "observacoes" && (
                  <Campo rotulo="Observações (o cliente vê)" ajuda="Condições gerais, o que não está incluído, dependências. Deixe em branco para não mostrar.">
                    <textarea
                      className="campo min-h-28 text-sm"
                      value={p.observacoes ?? ""}
                      maxLength={LIMITES_PREMIUM.observacoes}
                      onChange={(e) => mudarConteudo((c) => ({ ...c, observacoes: e.target.value || null }))}
                    />
                    <Contador atual={(p.observacoes ?? "").length} limite={LIMITES_PREMIUM.observacoes} />
                  </Campo>
                )}
              </CartaoDaSecao>
            ))}
            <p className="px-1 text-[11px] text-apoio/80">
              A lâmina final (“Vamos fazer acontecer?”, contatos e botões do cliente) entra sempre no fim.
            </p>
          </div>

          <div className="flex justify-end">
            <button type="button" className="botao botao-primario w-full sm:w-auto" onClick={() => void salvar()} disabled={!sujo || trabalhando}>
              {ocupado === "salvar" ? "Salvando…" : sujo ? "Salvar alterações" : "Tudo salvo"}
            </button>
          </div>
        </div>

        {/* Prévia */}
        <aside id="previa" className="min-w-0 scroll-mt-16 xl:sticky xl:top-20 xl:self-start" aria-label="Prévia da proposta">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm">Prévia</h2>
            <p className="text-[11px] text-apoio">{sujo ? "Mostrando as alterações ainda não salvas" : "Igual ao que o cliente vê"}</p>
          </div>
          <PreviaProposta dados={dados} secaoEmFoco={aberta} aoMedirPdf={aoMedirPdf} />
        </aside>
      </div>

      {escolhendo && (
        <EscolherImagem
          titulo={escolhendo.alvo === "capa" ? "Imagem da capa" : `Imagem do bloco ${escolhendo.indice + 1} da solução`}
          atual={alvoAtual}
          servico={proposta.service}
          enviadas={imagensEnviadas(imagens, p.logo_cliente)}
          aoEscolher={escolherImagem}
          aoEnviar={enviarImagem}
          aoFechar={() => setEscolhendo(null)}
        />
      )}

      {linkPronto && <DialogoDoLink pronto={linkPronto} aoFechar={() => setLinkPronto(null)} />}

      {envioAberto && proposta.atendimento_id && (
        <EnvioDaProposta
          proposta={proposta}
          atendimentoId={proposta.atendimento_id}
          aoFechar={() => setEnvioAberto(false)}
          aoEnviar={async (modo) => {
            setEnvioAberto(false);
            mostrar("ok", modo === "fila" ? "Mensagem com o link na fila de envio." : "Mensagem com o link enviada.");
            await recarregar();
          }}
        />
      )}

      {aviso && (
        <p
          role="status"
          className={`fixed inset-x-4 bottom-24 z-40 rounded-lg border px-3 py-2 text-sm shadow-xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96 ${
            aviso.tipo === "erro" ? "border-erro/60 bg-[#2a1716] text-erro" : "border-ok/60 bg-[#15241a] text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------- auxiliares

function urlDaImagemLocal(img: ImagemDaProposta | null, imagens: Record<string, string>): string | null {
  if (!img) return null;
  return img.origem === "galeria" ? urlDaGaleria(img.arquivo) : (imagens[img.arquivo] ?? null);
}

/** Imagens enviadas nesta proposta (menos a logo), para reaproveitar. */
function imagensEnviadas(imagens: Record<string, string>, logo: string | null): Record<string, string> {
  return Object.fromEntries(Object.entries(imagens).filter(([caminho]) => caminho !== logo));
}

function IconeVoltar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function Seta({ para }: { para: "cima" | "baixo" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={para === "cima" ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

/**
 * Número editável: enquanto o campo está em foco vale o que a pessoa digita
 * ("2," a caminho de "2,5"); fora do foco, mostra o valor guardado.
 */
function CampoNumerico({
  valor,
  aoMudar,
  inteiro = false,
}: {
  valor: number | null;
  /** null = campo vazio (ou número inválido). */
  aoMudar: (n: number | null) => void;
  inteiro?: boolean;
}) {
  const [digitando, setDigitando] = useState<string | null>(null);
  return (
    <input
      className="campo text-sm"
      inputMode={inteiro ? "numeric" : "decimal"}
      value={digitando ?? (valor === null ? "" : valorParaCampo(valor))}
      onFocus={() => setDigitando(valor === null ? "" : valorParaCampo(valor))}
      onBlur={() => setDigitando(null)}
      onChange={(e) => {
        const texto = (inteiro ? e.target.value.replace(/\D/g, "") : e.target.value.replace(/[^\d,.]/g, "")).slice(0, 8);
        setDigitando(texto);
        const n = lerValor(texto);
        const ok = n !== null && Number.isFinite(n) && n > 0 && (!inteiro || Number.isInteger(n));
        aoMudar(ok ? n : null);
      }}
    />
  );
}

function Contador({ atual, limite }: { atual: number; limite: number }) {
  if (atual < limite * 0.7) return null;
  return (
    <span className={`mt-1 block text-right text-[11px] ${atual >= limite ? "text-alerta" : "text-apoio"}`}>
      {atual}/{limite}
    </span>
  );
}

function CartaoDaSecao({
  titulo,
  resumo,
  vazia,
  aberta,
  aoAbrir,
  podeSubir,
  podeDescer,
  fixa,
  aoMover,
  children,
}: {
  titulo: string;
  resumo: string;
  vazia: boolean;
  aberta: boolean;
  aoAbrir: () => void;
  podeSubir: boolean;
  podeDescer: boolean;
  fixa: boolean;
  aoMover: (direcao: -1 | 1) => void;
  children: ReactNode;
}) {
  return (
    <section className={`cartao overflow-hidden ${aberta ? "border-cobre/60" : ""}`}>
      <div className="flex items-center gap-1 pr-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left" onClick={aoAbrir} aria-expanded={aberta}>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{titulo}</span>
            <span className={`block truncate text-xs ${vazia ? "text-alerta/90" : "text-apoio"}`}>
              {vazia ? "Vazia: não aparece na apresentação" : resumo || " "}
            </span>
          </span>
          <span className={`shrink-0 text-apoio transition-transform ${aberta ? "rotate-180" : ""}`}>
            <Seta para="baixo" />
          </span>
        </button>
        {fixa ? (
          <span className="selo shrink-0">Sempre a primeira</span>
        ) : (
          <span className="flex shrink-0 flex-col">
            <button
              type="button"
              className="rounded p-0.5 text-apoio hover:bg-superficie-2 hover:text-texto disabled:opacity-25"
              onClick={() => aoMover(-1)}
              disabled={!podeSubir}
              aria-label={`Subir ${titulo}`}
            >
              <Seta para="cima" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-apoio hover:bg-superficie-2 hover:text-texto disabled:opacity-25"
              onClick={() => aoMover(1)}
              disabled={!podeDescer}
              aria-label={`Descer ${titulo}`}
            >
              <Seta para="baixo" />
            </button>
          </span>
        )}
      </div>
      {aberta && <div className="border-t border-borda px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

function BotoesDoItem({
  indice,
  total,
  rotulo,
  aoMover,
  aoRemover,
}: {
  indice: number;
  total: number;
  rotulo: string;
  aoMover: (para: number) => void;
  aoRemover: () => void;
}) {
  const classe = "rounded p-1 text-apoio hover:bg-superficie hover:text-texto disabled:opacity-25";
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" className={classe} onClick={() => aoMover(indice - 1)} disabled={indice === 0} aria-label={`Subir ${rotulo}`}>
        <Seta para="cima" />
      </button>
      <button type="button" className={classe} onClick={() => aoMover(indice + 1)} disabled={indice === total - 1} aria-label={`Descer ${rotulo}`}>
        <Seta para="baixo" />
      </button>
      <button type="button" className={`${classe} hover:text-erro`} onClick={aoRemover} aria-label={`Remover ${rotulo}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

function ListaEditavel<T>({
  itens,
  maximo,
  rotuloAdicionar,
  novo,
  aoMudar,
  rotuloDoItem,
  render,
}: {
  itens: T[];
  maximo: number;
  rotuloAdicionar: string;
  novo: () => T;
  aoMudar: (lista: T[]) => void;
  rotuloDoItem: (i: number) => string;
  render: (item: T, i: number, mudar: (novo: T) => void) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      {itens.map((item, i) => (
        <div key={i} className="rounded-lg border border-borda bg-superficie-2 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-apoio">{rotuloDoItem(i)}</span>
            <BotoesDoItem
              indice={i}
              total={itens.length}
              rotulo={rotuloDoItem(i)}
              aoMover={(para) => aoMudar(mover(itens, i, para))}
              aoRemover={() => aoMudar(tirar(itens, i))}
            />
          </div>
          {render(item, i, (n) => aoMudar(trocar(itens, i, n)))}
        </div>
      ))}
      {itens.length < maximo ? (
        <button type="button" className="botao botao-secundario w-full border-dashed py-1.5 text-xs" onClick={() => aoMudar([...itens, novo()])}>
          + {rotuloAdicionar}
        </button>
      ) : (
        <p className="text-[11px] text-apoio">Máximo de {maximo} nesta seção.</p>
      )}
    </div>
  );
}

function ListaDeTextos({
  itens,
  maximo,
  limite,
  rotulo,
  rotuloAdicionar,
  multilinha = false,
  aoMudar,
}: {
  itens: string[];
  maximo: number;
  limite: number;
  rotulo: string;
  rotuloAdicionar: string;
  multilinha?: boolean;
  aoMudar: (lista: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {itens.map((texto, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="mt-2.5 w-6 shrink-0 text-right text-[11px] font-bold text-cobre-claro">{String(i + 1).padStart(2, "0")}</span>
          {multilinha ? (
            <textarea
              className="campo min-h-16 flex-1 text-sm"
              value={texto}
              maxLength={limite}
              aria-label={`${rotulo} ${i + 1}`}
              onChange={(e) => aoMudar(trocar(itens, i, e.target.value))}
            />
          ) : (
            <input
              className="campo min-w-0 flex-1 text-sm"
              value={texto}
              maxLength={limite}
              aria-label={`${rotulo} ${i + 1}`}
              onChange={(e) => aoMudar(trocar(itens, i, e.target.value))}
            />
          )}
          <BotoesDoItem
            indice={i}
            total={itens.length}
            rotulo={`${rotulo.toLowerCase()} ${i + 1}`}
            aoMover={(para) => aoMudar(mover(itens, i, para))}
            aoRemover={() => aoMudar(tirar(itens, i))}
          />
        </div>
      ))}
      {itens.length < maximo ? (
        <button type="button" className="botao botao-secundario w-full border-dashed py-1.5 text-xs" onClick={() => aoMudar([...itens, ""])}>
          + {rotuloAdicionar}
        </button>
      ) : (
        <p className="text-[11px] text-apoio">Máximo de {maximo} nesta seção.</p>
      )}
    </div>
  );
}

function SeletorDeImagem({
  rotulo,
  url,
  aoTrocar,
  compacto = false,
}: {
  rotulo: string;
  url: string | null;
  aoTrocar: () => void;
  compacto?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs text-apoio">{rotulo}</span>
      <button
        type="button"
        onClick={aoTrocar}
        className={`group relative block overflow-hidden rounded-lg border border-borda bg-superficie-2 text-left hover:border-apoio ${
          compacto ? "aspect-video w-40" : "aspect-video w-full max-w-sm"
        }`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-apoio">sem imagem</span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-center text-[11px] font-semibold text-white opacity-90 group-hover:opacity-100">
          Trocar imagem
        </span>
      </button>
    </div>
  );
}

// ----------------------------------------------------------- investimento

function EditorDoInvestimento({
  rascunho,
  investimento,
  tabela,
  tabelaEfetiva,
  aoMudar,
}: {
  rascunho: Rascunho;
  investimento: Investimento;
  /** null = a tabela não carregou (os valores vêm da própria proposta). */
  tabela: ItemDePreco[] | null;
  tabelaEfetiva: readonly ItemDaTabela[];
  aoMudar: (f: (r: Rascunho) => Rascunho) => void;
}) {
  const grupos = useMemo(() => agruparPorServico((tabela ?? []).filter((i) => i.active)), [tabela]);
  const porId = useMemo(() => new Map(tabelaEfetiva.map((i) => [i.id, i])), [tabelaEfetiva]);
  const nomes = useMemo(() => new Map((tabela ?? []).map((i) => [i.id, i])), [tabela]);
  const linhas = rascunho.linhas;
  const descontoInvalido = rascunho.desconto.trim() !== "" && !Number.isFinite(lerValor(rascunho.desconto) ?? Number.NaN);
  const comValor = investimento.itens.length - investimento.sob_consulta;

  const mudarLinha = (i: number, campos: Partial<LinhaNoEditor>) =>
    aoMudar((r) => ({ ...r, linhas: r.linhas.map((l, k) => (k === i ? { ...l, ...campos } : l)) }));

  function trocarItem(i: number, novoId: string) {
    const anterior = linhas[i];
    const antigo = anterior.price_item_id ? porId.get(anterior.price_item_id) : undefined;
    const novo = novoId ? porId.get(novoId) : undefined;
    // A descrição segue o item, a menos que alguém tenha escrito outra.
    const descricaoPadrao = !anterior.descricao.trim() || (antigo && anterior.descricao === antigo.name);
    mudarLinha(i, {
      price_item_id: novo ? novo.id : null,
      descricao: novo && descricaoPadrao ? novo.name : anterior.descricao,
      quantidade: novo && Number(anterior.quantidade.replace(",", ".")) < novo.min_qty ? String(novo.min_qty) : anterior.quantidade,
      unidade: novo ? novo.unit : anterior.unidade,
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-apoio">
        Escolha o item da tabela de preços e a quantidade: o valor vem sempre da tabela e o total é recalculado. Sem item
        que sirva, use “sob consulta” (o cliente vê “{TEXTO_SOB_CONSULTA}” e a linha não entra no total).
      </p>
      {!tabela && (
        <p className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs text-alerta">
          A tabela de preços não carregou: dá para mudar quantidades e textos dos itens já escolhidos, mas não trocar de item. Ao
          salvar, o sistema recalcula pela tabela.
        </p>
      )}

      {linhas.map((l, i) => {
        const calculo = recalcularInvestimento(
          [{ descricao: l.descricao || "item", quantidade: l.quantidade, unidade: l.unidade, price_item_id: l.price_item_id }],
          tabelaEfetiva,
        ).itens[0];
        const item = l.price_item_id ? porId.get(l.price_item_id) : undefined;
        const inativo = Boolean(l.price_item_id) && (!item || item.active === false);
        const quantidadeLida = Number(l.quantidade.replace(",", "."));
        const subiuParaMinimo = item && item.active !== false && Number.isFinite(quantidadeLida) && quantidadeLida > 0 && quantidadeLida < item.min_qty;
        return (
          <div key={l.chave} className="rounded-lg border border-borda bg-superficie-2 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-apoio">Linha {i + 1}</span>
              <BotoesDoItem
                indice={i}
                total={linhas.length}
                rotulo={`linha ${i + 1}`}
                aoMover={(para) => aoMudar((r) => ({ ...r, linhas: mover(r.linhas, i, para) }))}
                aoRemover={() => aoMudar((r) => ({ ...r, linhas: tirar(r.linhas, i) }))}
              />
            </div>
            <div className="space-y-2">
              <Campo rotulo="Item da tabela de preços">
                <select className="campo text-sm" value={l.price_item_id ?? ""} onChange={(e) => trocarItem(i, e.target.value)} disabled={!tabela}>
                  <option value="">Sob consulta (sem valor da tabela)</option>
                  {inativo && l.price_item_id && (
                    <option value={l.price_item_id} disabled>
                      {nomes.get(l.price_item_id)?.name ?? l.descricao} (fora da tabela ou desativado)
                    </option>
                  )}
                  {!tabela && item && <option value={item.id}>{item.name}</option>}
                  {grupos.map((g) => (
                    <optgroup key={g.servico} label={g.servico}>
                      {g.itens.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name} · {precoComUnidade(it)}
                          {it.confirmed ? "" : " (a confirmar)"}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Descrição que o cliente lê">
                <input
                  className="campo text-sm"
                  value={l.descricao}
                  maxLength={160}
                  placeholder={item?.name ?? "Ex.: Transmissão em plataforma própria"}
                  onChange={(e) => mudarLinha(i, { descricao: e.target.value })}
                />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Quantidade">
                  <input
                    className="campo text-sm"
                    inputMode="decimal"
                    value={l.quantidade}
                    onChange={(e) => mudarLinha(i, { quantidade: e.target.value.replace(/[^\d,.]/g, "").slice(0, 7) })}
                  />
                </Campo>
                {l.price_item_id && item ? (
                  <div>
                    <span className="mb-1 block text-xs text-apoio">Unidade</span>
                    <p className="py-2 text-sm">{item.unit}</p>
                  </div>
                ) : (
                  <Campo rotulo="Unidade">
                    <select className="campo text-sm" value={l.unidade} onChange={(e) => mudarLinha(i, { unidade: e.target.value })}>
                      {(UNIDADES as readonly string[]).includes(l.unidade) ? null : <option value={l.unidade}>{l.unidade}</option>}
                      {UNIDADES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </Campo>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda pt-2 text-xs">
                <span className="text-apoio">
                  {calculo && calculo.valor_unitario !== null
                    ? `${quantidadeLegivel(calculo.quantidade, calculo.unidade)} × ${reaisPremium(calculo.valor_unitario)}`
                    : `${TEXTO_SOB_CONSULTA} (não entra no total)`}
                </span>
                <span className="font-semibold">
                  {calculo && calculo.valor_total !== null ? reaisPremium(calculo.valor_total) : TEXTO_SOB_CONSULTA}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {calculo?.nao_confirmado && <span className="selo border-alerta/60 text-alerta">Valor não confirmado (só a equipe vê)</span>}
                {subiuParaMinimo && item && <span className="selo">Mínimo de {item.min_qty}: a quantidade sobe para o mínimo</span>}
                {inativo && <span className="selo border-alerta/60 text-alerta">Item fora da tabela: vira sob consulta</span>}
              </div>
            </div>
          </div>
        );
      })}

      {linhas.length < MAXIMO_DE_ITENS ? (
        <button
          type="button"
          className="botao botao-secundario w-full border-dashed py-1.5 text-xs"
          onClick={() =>
            aoMudar((r) => ({
              ...r,
              linhas: [...r.linhas, { chave: novaChave(), price_item_id: null, descricao: "", quantidade: "1", unidade: "por projeto" }],
            }))
          }
        >
          + Adicionar linha
        </button>
      ) : (
        <p className="text-[11px] text-apoio">Máximo de {MAXIMO_DE_ITENS} linhas.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Campo rotulo="Desconto (R$)" erro={descontoInvalido ? "Use só números, como 500 ou 1.250,00." : undefined}>
          <input
            className="campo text-sm"
            inputMode="decimal"
            value={rascunho.desconto}
            placeholder="0"
            onChange={(e) => aoMudar((r) => ({ ...r, desconto: e.target.value.slice(0, 16) }))}
          />
        </Campo>
        <Campo rotulo="Condições de pagamento">
          <textarea
            className="campo min-h-16 text-sm"
            value={rascunho.condicoes}
            maxLength={LIMITES_PREMIUM.condicoes}
            placeholder="Ex.: 50% na aprovação e 50% na entrega."
            onChange={(e) => aoMudar((r) => ({ ...r, condicoes: e.target.value }))}
          />
        </Campo>
      </div>

      <dl className="space-y-1 rounded-lg border border-cobre/40 bg-cobre/5 p-3 text-sm">
        {investimento.desconto ? (
          <>
            <div className="flex justify-between gap-3 text-apoio">
              <dt>Subtotal</dt>
              <dd>{reaisPremium(investimento.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-apoio">
              <dt>Desconto</dt>
              <dd>− {reaisPremium(investimento.desconto)}</dd>
            </div>
          </>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="titulo text-xs text-cobre-claro">{investimento.sob_consulta > 0 && comValor > 0 ? "Total parcial" : "Total"}</dt>
          <dd className="titulo text-lg">{comValor > 0 ? reaisPremium(investimento.total) : TEXTO_SOB_CONSULTA}</dd>
        </div>
        {investimento.sob_consulta > 0 && (
          <p className="text-[11px] text-apoio">
            {contagem(investimento.sob_consulta, "linha sob consulta", "linhas sob consulta")}: não entra
            {investimento.sob_consulta === 1 ? "" : "m"} no total.
          </p>
        )}
      </dl>
    </div>
  );
}

// -------------------------------------------------------------- avisos

function AvisosInternos({
  naoConfirmados,
  sobConsulta,
  cortadas,
  erroTabela,
  pdfErro,
  recados,
  aoFecharRecados,
}: {
  naoConfirmados: boolean;
  sobConsulta: number;
  cortadas: string[];
  erroTabela: string | null;
  pdfErro: string | null;
  recados: { pendencias: string[]; avisos: string[] } | null;
  aoFecharRecados: () => void;
}) {
  const algum = naoConfirmados || sobConsulta > 0 || cortadas.length > 0 || erroTabela || pdfErro || recados;
  if (!algum) return null;
  return (
    <section className="space-y-2" aria-label="Avisos para a equipe">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-apoio">Só a equipe vê</p>
      {naoConfirmados && (
        <div className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
          {AVISO_NAO_CONFIRMADO}{" "}
          <Link href="/configuracoes#tabela-de-precos" className="font-semibold underline">
            Abrir a tabela de preços
          </Link>
        </div>
      )}
      {cortadas.length > 0 && (
        <div className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
          No PDF, {cortadas.length === 1 ? "a lâmina" : "as lâminas"}{" "}
          <strong>{cortadas.map(rotuloDaLamina).join(", ")}</strong> {cortadas.length === 1 ? "passa" : "passam"} do tamanho da
          página e o fim fica cortado. Encurte os textos ou tire itens (a página do link não é afetada). Veja na prévia “PDF”.
        </div>
      )}
      {sobConsulta > 0 && (
        <p className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-xs leading-relaxed text-apoio">
          {contagem(sobConsulta, "linha do investimento está", "linhas do investimento estão")} “{TEXTO_SOB_CONSULTA}”: o cliente vê
          sem valor. Se houver item na tabela que sirva, escolha-o para entrar no total.
        </p>
      )}
      {erroTabela && (
        <p className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">{erroTabela}</p>
      )}
      {pdfErro && (
        <p className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-xs leading-relaxed text-apoio">
          O último PDF saiu pela versão simples porque o Chrome falhou: {pdfErro}
        </p>
      )}
      {recados && (
        <div className="rounded-lg border border-cobre/50 bg-cobre/10 px-3 py-2 text-xs leading-relaxed">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-semibold text-cobre-claro">Recados da IA sobre esta proposta</p>
            <button type="button" className="text-apoio underline hover:text-texto" onClick={aoFecharRecados}>
              ok, entendi
            </button>
          </div>
          {recados.pendencias.length > 0 && (
            <>
              <p className="text-apoio">Confirmar com o cliente:</p>
              <ul className="mb-1 list-disc pl-5">
                {recados.pendencias.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}
          {recados.avisos.length > 0 && (
            <ul className="list-disc pl-5 text-apoio">
              {recados.avisos.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ link

function DialogoDoLink({ pronto, aoFechar }: { pronto: LinkPronto; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState<"link" | "texto" | null>(null);

  async function copiar(qual: "link" | "texto") {
    const valor = qual === "link" ? pronto.link : pronto.texto;
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(qual);
      setTimeout(() => setCopiado((c) => (c === qual ? null : c)), 2500);
    } catch {
      window.prompt("Copie o texto:", valor);
    }
  }

  return (
    <Dialogo titulo="Link para o cliente" aoFechar={aoFechar}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-apoio">
          Mande este link por onde preferir (WhatsApp, e-mail). Ele abre a apresentação completa, com os botões “Aceitar
          proposta” e “Falar no WhatsApp”.
          {pronto.expira_em ? ` Vale até ${diaEHora(pronto.expira_em)}.` : ""}
        </p>
        <input className="campo text-xs" value={pronto.link} readOnly onFocus={(e) => e.target.select()} aria-label="Link da proposta" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="botao botao-primario flex-1" onClick={() => void copiar("link")}>
            {copiado === "link" ? "Link copiado" : "Copiar link"}
          </button>
          <button type="button" className="botao botao-secundario flex-1" onClick={() => void copiar("texto")}>
            {copiado === "texto" ? "Mensagem copiada" : "Copiar mensagem pronta"}
          </button>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-apoio hover:text-texto">Ver a mensagem pronta</summary>
          <p className="mt-2 whitespace-pre-wrap rounded-lg border border-borda bg-superficie-2 p-2 leading-relaxed">{pronto.texto}</p>
        </details>
        <p className="text-[11px] text-apoio/80">
          <a href={pronto.link} target="_blank" rel="noopener noreferrer" className="underline hover:text-texto">
            Abrir a página
          </a>{" "}
          (abrir por aqui também conta como visualização do cliente; para conferir sem contar, use a prévia).
        </p>
      </div>
    </Dialogo>
  );
}
