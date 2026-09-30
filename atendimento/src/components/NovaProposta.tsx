"use client";

// Nova proposta em quatro passos: 1) cliente (contato do WhatsApp ou
// digitado), 2) pedido (com "Puxar da conversa"), 3) a IA monta a proposta,
// 4) o editor com a prévia (/propostas/<id>). Nada é enviado ao cliente por aqui.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatarTelefone, nomeDoContato, somenteDigitos } from "@/lib/formato";
import { buscarOportunidade } from "@/lib/funil/dados";
import { EMPRESA_NAO_INFORMADA, SERVICO_A_DEFINIR } from "@/lib/funil/formulario";
import { SERVICOS } from "@/lib/precos/precos";
import { criarPropostaPremium, puxarPedidoDaConversa } from "@/lib/propostas/dados";
import {
  clienteVazio,
  DIAS_LINK_MAXIMO,
  DIAS_LINK_PADRAO,
  LIMITES_PEDIDO,
  pedidoVazio,
  servicoDaTabela,
  validarEntrada,
  type ClienteDoPedido,
  type Pedido,
} from "@/lib/propostas/premium/pedido";
import { diaPorExtenso } from "@/lib/propostas/proposta";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import type { Contato, DadosExtraidos } from "@/lib/tipos";
import { Campo } from "./DialogosFunil";

type Passo = 1 | 2 | 3;

const PASSOS = ["Cliente", "Pedido", "Gerar", "Editar e enviar"] as const;

/** O que a IA faz enquanto a pessoa espera (só para mostrar o andamento). */
const ETAPAS_DA_IA = [
  "Lendo o pedido e a conversa",
  "Consultando a base de conhecimento",
  "Escolhendo itens da tabela de preços",
  "Escolhendo as imagens da galeria",
  "Escrevendo a apresentação",
];

/**
 * Termo seguro para o filtro .or() do banco: vírgula, parênteses, aspas e os
 * curingas (% _ *) quebram ou mudam a busca. Palavras viram "a%b" (em ordem).
 */
export function termoDeBusca(termo: string): string {
  return termo
    .replace(/[^\p{L}\p{N}@.\-' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "%");
}

async function buscarContatos(termo: string): Promise<Contato[]> {
  const t = termoDeBusca(termo);
  if (t.replace(/%/g, "").length < 2) return [];
  const digitos = somenteDigitos(termo);
  const filtros = [`wa_name.ilike."%${t}%"`, `display_name.ilike."%${t}%"`, `company.ilike."%${t}%"`];
  if (digitos.length >= 3) filtros.push(`phone.ilike."%${digitos}%"`);
  const { data } = await supabaseNoNavegador()
    .from("ar1_wa_contacts")
    .select("*")
    .or(filtros.join(","))
    .eq("blocked", false)
    .limit(8);
  return (data ?? []) as Contato[];
}

/** Cidade que a IA leu na conversa mais recente do contato (se houver). */
async function cidadeDoContato(contatoId: string): Promise<string> {
  const { data } = await supabaseNoNavegador()
    .from("ar1_atendimentos")
    .select("ai_extracted, last_message_at")
    .eq("contact_id", contatoId)
    .order("last_message_at", { ascending: false })
    .limit(1);
  const extraidos = ((data ?? [])[0] as { ai_extracted?: DadosExtraidos | null } | undefined)?.ai_extracted;
  return typeof extraidos?.cidade === "string" ? extraidos.cidade.slice(0, LIMITES_PEDIDO.cidade) : "";
}

async function lerContato(id: string): Promise<Contato | null> {
  const { data } = await supabaseNoNavegador().from("ar1_wa_contacts").select("*").eq("id", id).maybeSingle();
  return (data as Contato | null) ?? null;
}

/** Data da oportunidade (AAAA-MM-DD) em texto para o campo "Data ou período". */
function periodoDaData(data: string | null): string {
  if (!data) return "";
  return /^\d{4}-\d{2}-\d{2}/.test(data) ? diaPorExtenso(data) : data;
}

export function NovaProposta({ oportunidadeId, contatoId }: { oportunidadeId: string | null; contatoId: string | null }) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>(1);
  const [cliente, setCliente] = useState<ClienteDoPedido>(clienteVazio);
  const [pedido, setPedido] = useState<Pedido>(pedidoVazio);
  const [contato, setContato] = useState<Contato | null>(null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Contato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ tipo: "alerta" | "ok" | "erro"; texto: string } | null>(null);
  const [puxando, setPuxando] = useState(false);
  const [gerando, setGerando] = useState<"ia" | "sem_ia" | null>(null);
  const [etapaDaIA, setEtapaDaIA] = useState(0);
  const [carregando, setCarregando] = useState(Boolean(oportunidadeId || contatoId));
  const [diasLink, setDiasLink] = useState(String(DIAS_LINK_PADRAO));

  // Preenche a partir da oportunidade (/propostas/nova?oportunidade=…) ou do contato (?contato=…).
  useEffect(() => {
    let ativo = true;
    (async () => {
      if (oportunidadeId) {
        const r = await buscarOportunidade(oportunidadeId);
        if (!ativo) return;
        if ("erro" in r) {
          setAviso({ tipo: "erro", texto: `${r.erro} Preencha o cliente à mão ou recarregue a página.` });
        } else if (!r.oportunidade) {
          setAviso({ tipo: "alerta", texto: "Oportunidade não encontrada (pode ter sido apagada). Preencha o cliente à mão." });
        } else {
          const o = r.oportunidade;
          const c = o.contact_id ? await lerContato(o.contact_id) : null;
          const cidade = c ? await cidadeDoContato(c.id) : "";
          if (!ativo) return;
          setContato(c);
          setCliente({
            contact_id: c?.id ?? null,
            oportunidade_id: o.id,
            nome: o.name || (c ? nomeDoContato(c) : ""),
            empresa: o.company && o.company !== EMPRESA_NAO_INFORMADA ? o.company : (c?.company ?? ""),
            telefone: c ? formatarTelefone(c.phone) : o.phone || "",
            email: o.email ?? "",
            cidade,
          });
          setPedido((p) => ({
            ...p,
            servico: o.project_type && o.project_type !== SERVICO_A_DEFINIR ? servicoDaTabela(o.project_type) : "",
            descricao: (o.message ?? "").slice(0, LIMITES_PEDIDO.descricao),
            data_periodo: periodoDaData(o.expected_date),
          }));
        }
      } else if (contatoId) {
        const c = await lerContato(contatoId);
        const cidade = c ? await cidadeDoContato(c.id) : "";
        if (!ativo) return;
        if (c) {
          setContato(c);
          setCliente((atual) => ({
            ...atual,
            contact_id: c.id,
            nome: nomeDoContato(c),
            empresa: c.company ?? "",
            telefone: formatarTelefone(c.phone),
            cidade,
          }));
        } else {
          setAviso({ tipo: "alerta", texto: "Contato não encontrado. Busque de novo ou preencha à mão." });
        }
      }
      if (ativo) setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [oportunidadeId, contatoId]);

  // Busca de contatos com pequena espera (só com 2 letras ou mais).
  const termoValido = termo.trim().length >= 2;
  useEffect(() => {
    if (!termoValido) return;
    let ativo = true;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarContatos(termo).then((lista) => {
        if (!ativo) return;
        setAchados(lista);
        setBuscando(false);
      });
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [termo, termoValido]);
  const sugestoes = termoValido ? achados : [];

  // Andamento enquanto a IA escreve (20 a 50 segundos).
  useEffect(() => {
    if (gerando !== "ia") return;
    const t = setInterval(() => setEtapaDaIA((e) => Math.min(e + 1, ETAPAS_DA_IA.length - 1)), 7000);
    return () => clearInterval(t);
  }, [gerando]);

  function escolherContato(c: Contato) {
    setContato(c);
    setAchados([]);
    setTermo("");
    setCliente((atual) => ({
      ...atual,
      contact_id: c.id,
      nome: atual.nome || nomeDoContato(c),
      empresa: atual.empresa || c.company || "",
      telefone: formatarTelefone(c.phone),
    }));
    setErros((e) => ({ ...e, nome: "", telefone: "" }));
    cidadeDoContato(c.id).then((cidade) => {
      if (cidade) setCliente((atual) => (atual.contact_id === c.id && !atual.cidade ? { ...atual, cidade } : atual));
    });
  }

  function tirarContato() {
    setContato(null);
    setCliente((atual) => ({ ...atual, contact_id: null, telefone: "" }));
  }

  const mudarCliente = (campo: keyof ClienteDoPedido, valor: string) => {
    setCliente((c) => ({ ...c, [campo]: valor }));
    setErros((e) => (e[campo] ? { ...e, [campo]: "" } : e));
  };
  const mudarPedido = (campo: keyof Pedido, valor: string) => {
    setPedido((p) => ({ ...p, [campo]: valor }));
    setErros((e) => (e[campo] ? { ...e, [campo]: "" } : e));
  };

  const entrada = useMemo(() => ({ cliente, pedido, dias_link: Number(diasLink) }), [cliente, pedido, diasLink]);
  /** Sem contato nem oportunidade, o funil precisa de um telefone para abrir a oportunidade. */
  const precisaTelefone = !cliente.contact_id && !cliente.oportunidade_id;

  /** Confere os passos até `atual`; com erro, marca os campos e volta ao passo deles. */
  function conferirPasso(atual: Passo): boolean {
    const r = validarEntrada(entrada);
    const errosDoPasso: Record<string, string> = !r.ok && r.passo <= atual ? { ...r.erros } : {};
    if (precisaTelefone && somenteDigitos(cliente.telefone).length < 10 && !errosDoPasso.telefone) {
      errosDoPasso.telefone = "Informe o telefone com DDD: sem contato do WhatsApp, é ele que abre a oportunidade no funil.";
    }
    if (Object.keys(errosDoPasso).length === 0) return true;
    setErros(errosDoPasso);
    setAviso({ tipo: "alerta", texto: "Confira os campos marcados." });
    const primeiroPasso: Passo = !r.ok && r.passo <= atual ? r.passo : 1;
    if (primeiroPasso < atual) setPasso(primeiroPasso);
    return false;
  }

  function avancar() {
    if (!conferirPasso(passo)) return;
    setErros({});
    setAviso(null);
    setPasso((p) => (p === 1 ? 2 : 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function puxar() {
    if (!cliente.contact_id) return;
    setPuxando(true);
    setAviso(null);
    const r = await puxarPedidoDaConversa(cliente.contact_id);
    setPuxando(false);
    if (!r.ok) {
      setAviso({ tipo: "erro", texto: r.erro });
      return;
    }
    setPedido((p) => ({
      servico: r.pedido.servico || p.servico,
      servicos_adicionais: r.pedido.servicos_adicionais.length ? r.pedido.servicos_adicionais : p.servicos_adicionais,
      descricao: r.pedido.descricao || p.descricao,
      data_periodo: r.pedido.data_periodo || p.data_periodo,
      local: r.pedido.local || p.local,
      publico_objetivo: r.pedido.publico_objetivo || p.publico_objetivo,
      quantidades: r.pedido.quantidades || p.quantidades,
      observacoes: r.pedido.observacoes || p.observacoes,
    }));
    setCliente((c) => ({
      ...c,
      cidade: c.cidade || r.cliente.cidade,
      empresa: c.empresa || r.cliente.empresa,
      email: c.email || r.cliente.email,
    }));
    setErros({});
    setAviso({ tipo: "ok", texto: "Campos preenchidos a partir da conversa. Confira antes de seguir." });
  }

  async function gerar(semIA: boolean) {
    if (!conferirPasso(3)) return;
    const r = validarEntrada(entrada);
    if (!r.ok) return;
    setGerando(semIA ? "sem_ia" : "ia");
    setEtapaDaIA(0);
    setAviso(null);
    const resposta = await criarPropostaPremium(r.entrada, semIA);
    if (!resposta.ok) {
      setGerando(null);
      setAviso({
        tipo: "erro",
        texto: semIA ? resposta.erro : `${resposta.erro} Tente de novo ou use “Criar em branco” e preencha no editor.`,
      });
      return;
    }
    try {
      window.sessionStorage.setItem(
        `ar1.proposta.avisos.${resposta.proposta.id}`,
        JSON.stringify({ pendencias: resposta.pendencias, avisos: resposta.avisos }),
      );
    } catch {
      // sem armazenamento: os recados não aparecem, só isso
    }
    router.push(`/propostas/${resposta.proposta.id}?nova=1`);
  }

  const cabecalho = (
    <header className="space-y-3">
      <Link href="/propostas" className="inline-flex items-center gap-1 text-xs text-apoio hover:text-texto">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Propostas
      </Link>
      <h1 className="text-lg">Nova proposta</h1>
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Passos">
        {PASSOS.map((rotulo, i) => {
          const n = i + 1;
          const atual = n === passo;
          const feito = n < passo;
          return (
            <li key={rotulo} aria-current={atual ? "step" : undefined} className="min-w-0">
              <span className={`block h-1 rounded-full ${atual ? "bg-cobre" : feito ? "bg-ok/70" : "bg-borda"}`} />
              <span className={`mt-1.5 block truncate text-[11px] ${atual ? "font-semibold text-cobre-claro" : feito ? "text-texto" : "text-apoio"}`}>
                {n}. {rotulo}
              </span>
            </li>
          );
        })}
      </ol>
    </header>
  );

  if (carregando) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 lg:py-6">
        {cabecalho}
        <p className="text-sm text-apoio">Carregando os dados…</p>
      </div>
    );
  }

  const classeDoAviso =
    aviso?.tipo === "ok"
      ? "border-ok/50 bg-ok/10 text-ok"
      : aviso?.tipo === "erro"
        ? "border-erro/50 bg-erro/10 text-erro"
        : "border-alerta/60 bg-alerta/10 text-alerta";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-8 pt-4 lg:py-6">
      {cabecalho}

      {aviso && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${classeDoAviso}`}>
          {aviso.texto}
        </p>
      )}

      {passo === 1 && (
        <section className="cartao space-y-4 p-4">
          <div>
            <h2 className="text-sm">Quem é o cliente</h2>
            <p className="mt-0.5 text-xs text-apoio">Cliente do WhatsApp ou de fora dele (indicação, e-mail, evento).</p>
          </div>
          {contato ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cobre/50 bg-cobre/10 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{nomeDoContato(contato)}</span>
                <span className="text-apoio"> · {formatarTelefone(contato.phone)}</span>
                {contato.company && <span className="text-apoio"> · {contato.company}</span>}
                <span className="selo ml-2">WhatsApp</span>
              </span>
              <button type="button" className="text-xs text-apoio underline hover:text-texto" onClick={tirarContato}>
                trocar
              </button>
            </div>
          ) : (
            <Campo rotulo="Buscar contato do WhatsApp (nome, empresa ou telefone)" ajuda="Opcional: sem contato, preencha os dados abaixo.">
              <input
                className="campo text-sm"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Ex.: Maria, Souza Eventos, 62999…"
                autoComplete="off"
              />
              {termoValido && buscando && sugestoes.length === 0 && <span className="mt-1 block text-[11px] text-apoio">Buscando…</span>}
              {sugestoes.length > 0 && (
                <ul className="mt-1 divide-y divide-borda overflow-hidden rounded-lg border border-borda bg-superficie-2">
                  {sugestoes.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-superficie"
                        onClick={() => escolherContato(c)}
                      >
                        <span className="min-w-0 truncate">
                          {nomeDoContato(c)}
                          {c.company && <span className="text-apoio"> · {c.company}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-apoio">{formatarTelefone(c.phone)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Campo>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome" erro={erros.nome}>
              <input className="campo text-sm" value={cliente.nome} onChange={(e) => mudarCliente("nome", e.target.value)} maxLength={LIMITES_PEDIDO.nome} autoComplete="off" />
            </Campo>
            <Campo rotulo="Empresa" erro={erros.empresa}>
              <input className="campo text-sm" value={cliente.empresa} onChange={(e) => mudarCliente("empresa", e.target.value)} maxLength={LIMITES_PEDIDO.empresa} autoComplete="off" />
            </Campo>
            <Campo
              rotulo="Telefone"
              erro={erros.telefone}
              ajuda={contato ? "Do contato do WhatsApp." : precisaTelefone ? "Com DDD. Obrigatório sem contato do WhatsApp." : "Com DDD."}
            >
              <input
                className="campo text-sm"
                inputMode="tel"
                value={cliente.telefone}
                onChange={(e) => mudarCliente("telefone", e.target.value)}
                maxLength={LIMITES_PEDIDO.telefone}
                autoComplete="off"
                disabled={Boolean(contato)}
              />
            </Campo>
            <Campo rotulo="E-mail" erro={erros.email}>
              <input className="campo text-sm" inputMode="email" value={cliente.email} onChange={(e) => mudarCliente("email", e.target.value)} maxLength={LIMITES_PEDIDO.email} autoComplete="off" />
            </Campo>
            <Campo rotulo="Cidade" erro={erros.cidade}>
              <input className="campo text-sm" value={cliente.cidade} onChange={(e) => mudarCliente("cidade", e.target.value)} maxLength={LIMITES_PEDIDO.cidade} autoComplete="off" />
            </Campo>
          </div>
          {cliente.oportunidade_id ? (
            <p className="text-xs text-apoio">
              A proposta entra na oportunidade já aberta no funil.{" "}
              <Link href={`/funil/${cliente.oportunidade_id}`} className="underline hover:text-texto">
                Ver oportunidade
              </Link>
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-apoio">
              {contato
                ? "Se o contato tiver oportunidade aberta, a proposta entra nela; se não, uma nova é criada no funil (etapa Proposta)."
                : "Ao gerar, uma oportunidade nova é criada no funil (etapa Proposta) e o contato é criado pelo telefone."}
            </p>
          )}
          <div className="flex justify-end">
            <button type="button" className="botao botao-primario w-full sm:w-auto" onClick={avancar}>
              Continuar
            </button>
          </div>
        </section>
      )}

      {passo === 2 && (
        <section className="cartao space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm">O que o cliente precisa</h2>
              <p className="mt-0.5 break-words text-xs text-apoio">
                {cliente.nome}
                {cliente.empresa ? ` · ${cliente.empresa}` : ""}
              </p>
            </div>
            {cliente.contact_id && (
              <button type="button" className="botao botao-secundario w-full px-3 py-1.5 text-xs sm:w-auto" onClick={puxar} disabled={puxando || gerando !== null}>
                {puxando ? "Lendo a conversa…" : "Puxar da conversa"}
              </button>
            )}
          </div>
          {cliente.contact_id && (
            <p className="text-xs leading-relaxed text-apoio">
              “Puxar da conversa” pede à IA para preencher os campos com o que o cliente disse no WhatsApp. Você confere antes de seguir.
            </p>
          )}
          <Campo rotulo="Serviço principal" erro={erros.servico}>
            <select className="campo text-sm" value={pedido.servico} onChange={(e) => mudarPedido("servico", e.target.value)}>
              <option value="">Escolha…</option>
              {SERVICOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {pedido.servico && !(SERVICOS as readonly string[]).includes(pedido.servico) && <option value={pedido.servico}>{pedido.servico}</option>}
            </select>
          </Campo>
          <div>
            <span className="mb-1 block text-xs text-apoio">Serviços adicionais (toque para marcar, até {LIMITES_PEDIDO.adicionais})</span>
            <div className="flex flex-wrap gap-1.5">
              {SERVICOS.filter((s) => s !== pedido.servico).map((s) => {
                const marcado = pedido.servicos_adicionais.includes(s);
                const cheio = !marcado && pedido.servicos_adicionais.length >= LIMITES_PEDIDO.adicionais;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`selo cursor-pointer py-1 disabled:cursor-not-allowed disabled:opacity-40 ${marcado ? "border-cobre/70 bg-cobre/15 text-cobre-claro" : "hover:text-texto"}`}
                    aria-pressed={marcado}
                    disabled={cheio}
                    onClick={() =>
                      setPedido((p) => ({
                        ...p,
                        servicos_adicionais: marcado
                          ? p.servicos_adicionais.filter((x) => x !== s)
                          : [...p.servicos_adicionais, s].slice(0, LIMITES_PEDIDO.adicionais),
                      }))
                    }
                  >
                    {marcado ? "✓ " : "+ "}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <Campo rotulo="Descrição do que o cliente precisa" erro={erros.descricao}>
            <textarea
              className="campo min-h-28 text-sm"
              value={pedido.descricao}
              onChange={(e) => mudarPedido("descricao", e.target.value)}
              maxLength={LIMITES_PEDIDO.descricao}
              placeholder="Ex.: podcast itinerante na feira de noivas, dois dias, com cortes para as redes do evento."
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Data ou período">
              <input className="campo text-sm" value={pedido.data_periodo} onChange={(e) => mudarPedido("data_periodo", e.target.value)} maxLength={LIMITES_PEDIDO.curto} placeholder="Ex.: 24 e 25 de outubro" autoComplete="off" />
            </Campo>
            <Campo rotulo="Local">
              <input className="campo text-sm" value={pedido.local} onChange={(e) => mudarPedido("local", e.target.value)} maxLength={LIMITES_PEDIDO.curto} placeholder="Ex.: Centro de Convenções, Goiânia" autoComplete="off" />
            </Campo>
          </div>
          <Campo rotulo="Público e objetivo">
            <textarea className="campo min-h-16 text-sm" value={pedido.publico_objetivo} onChange={(e) => mudarPedido("publico_objetivo", e.target.value)} maxLength={LIMITES_PEDIDO.curto} placeholder="Para quem é o conteúdo e onde será publicado ou exibido." />
          </Campo>
          <Campo rotulo="Quantidades (episódios, dias, câmeras, público…)">
            <textarea className="campo min-h-16 text-sm" value={pedido.quantidades} onChange={(e) => mudarPedido("quantidades", e.target.value)} maxLength={LIMITES_PEDIDO.quantidades} placeholder="Ex.: 2 dias de gravação, 3 câmeras, 8 episódios" />
          </Campo>
          <Campo rotulo="Observações para a IA (o cliente não vê)">
            <textarea className="campo min-h-16 text-sm" value={pedido.observacoes} onChange={(e) => mudarPedido("observacoes", e.target.value)} maxLength={LIMITES_PEDIDO.observacoes} placeholder="Ex.: cliente sensível a preço; destacar a experiência em feiras." />
          </Campo>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button type="button" className="botao botao-secundario" onClick={() => setPasso(1)}>
              Voltar
            </button>
            <button type="button" className="botao botao-primario" onClick={avancar} disabled={puxando}>
              Continuar
            </button>
          </div>
        </section>
      )}

      {passo === 3 && (
        <section className="cartao space-y-4 p-4">
          <h2 className="text-sm">Gerar a proposta</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-apoio">Cliente</dt>
            <dd className="min-w-0 break-words">
              {cliente.nome}
              {cliente.empresa ? ` · ${cliente.empresa}` : ""}
              {cliente.cidade ? ` · ${cliente.cidade}` : ""}
            </dd>
            <dt className="text-apoio">Serviço</dt>
            <dd className="min-w-0 break-words">
              {pedido.servico}
              {pedido.servicos_adicionais.length ? ` + ${pedido.servicos_adicionais.join(", ")}` : ""}
            </dd>
            {pedido.data_periodo && (
              <>
                <dt className="text-apoio">Quando</dt>
                <dd className="min-w-0 break-words">{pedido.data_periodo}</dd>
              </>
            )}
            {pedido.local && (
              <>
                <dt className="text-apoio">Onde</dt>
                <dd className="min-w-0 break-words">{pedido.local}</dd>
              </>
            )}
          </dl>
          <Campo rotulo="Validade do link para o cliente (dias)" ajuda="Depois disso o link para de abrir; dá para renovar a qualquer momento no editor.">
            <input
              className="campo w-28 text-sm"
              inputMode="numeric"
              value={diasLink}
              onChange={(e) => setDiasLink(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onBlur={() => {
                const n = Number(diasLink);
                if (!Number.isInteger(n) || n < 1 || n > DIAS_LINK_MAXIMO) setDiasLink(String(DIAS_LINK_PADRAO));
              }}
            />
          </Campo>
          <p className="text-xs leading-relaxed text-apoio">
            A IA escreve a apresentação completa (capa, entendimento, solução, escopo, entregas, cronograma, investimento e
            próximos passos) com a base de conhecimento, a conversa e a <strong className="text-texto">tabela de preços</strong>. Os
            valores nunca são inventados: cada linha do investimento vem de um item da tabela, e o sistema faz a conta. Costuma
            levar de 20 a 50 segundos. Depois, tudo pode ser editado.
          </p>

          {gerando === "ia" && (
            <ol className="space-y-1.5 rounded-lg border border-cobre/40 bg-cobre/5 p-3 text-xs" aria-live="polite">
              {ETAPAS_DA_IA.map((t, i) => (
                <li key={t} className={`flex items-center gap-2 ${i < etapaDaIA ? "text-texto" : i === etapaDaIA ? "text-cobre-claro" : "text-apoio/60"}`}>
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${i < etapaDaIA ? "bg-ok" : i === etapaDaIA ? "animate-pulse bg-cobre" : "bg-borda"}`}
                    aria-hidden
                  />
                  {t}
                  {i === etapaDaIA ? "…" : ""}
                </li>
              ))}
            </ol>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" className="botao botao-secundario" onClick={() => setPasso(2)} disabled={gerando !== null}>
              Voltar
            </button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" className="botao botao-secundario" onClick={() => gerar(true)} disabled={gerando !== null}>
                {gerando === "sem_ia" ? "Criando…" : "Criar em branco (sem IA)"}
              </button>
              <button type="button" className="botao botao-primario" onClick={() => gerar(false)} disabled={gerando !== null}>
                {gerando === "ia" ? "A IA está escrevendo…" : "Gerar proposta com a IA"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
