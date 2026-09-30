import "server-only";

// Lado "banco" das propostas premium: acha (ou cria, DEPOIS da IA) o contato e
// a oportunidade, chama a IA (modelo AI_MODEL_PROPOSTAS), recalcula os valores
// pela tabela de preços, grava, gera o PDF (Chrome, com o pdf-lib de reserva),
// cuida da página pública (visitas, aceite) e do link. Nada sai para o cliente
// sem um clique da equipe.

import { randomBytes, randomUUID } from "node:crypto";
import { lerConfiguracoesDeAtendimento, lerDocumentosDeContexto } from "../../analise/executar";
import { BUCKET_CONTEXTO } from "../../contexto/limites";
import { UUID } from "../../contexto/validar";
import { env } from "../../env";
import { FUSO_BRASILIA_MS } from "../../funil/datas";
import { formatarTelefone, somenteDigitos } from "../../formato";
import { EMPRESA_NAO_INFORMADA, telefonesParaBusca } from "../../funil/formulario";
import { ErroIA, gerarEstruturado } from "../../ia";
import { lerTabelaDePrecos } from "../../precos/servidor";
import { supabaseServico } from "../../supabase/service";
import type { Atendimento, Contato, Mensagem, NotasInternas, Oportunidade, PropostaRegistro } from "../../tipos";
import { ErroPdf } from "../erros";
import { DIAS_DO_LINK, SEGUNDOS_DO_LINK, textoDaMensagem } from "../mensagem";
import { gerarPdfDaProposta } from "../pdf";
import { diaDaProposta, proximoNumero, validaAte } from "../proposta";
import { colunaAusente, COLUNAS, erroDoBanco, ErroProposta, lerProposta, linkDoPdf, normalizar, TABELA } from "../registro";
import {
  caminhoDeImagemValido,
  conferirPremium,
  ehPremium,
  normalizarPremium,
  type PropostaPremium,
} from "./conteudo";
import { esquemaPedidoDaConversa, esquemaPropostaPremium } from "./esquema";
import { assinarImpressao } from "./impressao";
import {
  avisoDePrecoMantido,
  precosMantidos,
  recalcularInvestimento,
  usaValoresNaoConfirmados,
  type Investimento,
} from "./investimento";
import { imprimirPagina } from "./pdf-chrome";
import { DIGITOS_MINIMOS_TELEFONE, pedidoEmTexto, type ClienteDoPedido, type EntradaNovaProposta } from "./pedido";
import {
  aplicarRespostaPremium,
  LIMITE_MENSAGENS_PREMIUM,
  montarPromptPedido,
  montarPromptPremium,
  pedidoDaResposta,
  propostaSemIA,
  type PedidoPuxado,
  type PropostaPremiumPronta,
} from "./prompt";
import {
  aceitarPelaPagina,
  ehRobo,
  ehStatusProposta,
  ehToken,
  estadoDoLink,
  expiraEm,
  lerDiasDoLink,
  mensagemDoLinkPremium,
  podeMarcar,
  propostaDecidida,
  registrarVisualizacao,
  ROTULO_STATUS_PROPOSTA,
  statusAoReabrir,
  tokenDeBytes,
  urlPublica,
  type StatusProposta,
} from "./publico";
import { entradaDaReserva } from "./reserva";

/**
 * Tempo máximo da chamada à IA que escreve a proposta. A rota tem
 * maxDuration 300 (Vercel com Fluid compute): uma apresentação completa pelo
 * Opus pode passar de um minuto.
 */
export const TIMEOUT_IA_PROPOSTA_MS = 240_000;
/** "Puxar da conversa" é curto (rota com 60 s). */
export const TIMEOUT_IA_PEDIDO_MS = 50_000;

export function novoToken(): string {
  return tokenDeBytes(randomBytes(32));
}

// ------------------------------------------------------------- contato e oportunidade

async function lerContato(id: string): Promise<Contato | null> {
  const { data } = await supabaseServico().from("ar1_wa_contacts").select("*").eq("id", id).maybeSingle();
  return (data as Contato | null) ?? null;
}

async function contatoPeloTelefone(telefone: string): Promise<Contato | null> {
  const telefones = telefonesParaBusca(telefone);
  if (!telefones.length) return null;
  const { data } = await supabaseServico().from("ar1_wa_contacts").select("*").in("phone", telefones).limit(1);
  return ((data ?? [])[0] as Contato | undefined) ?? null;
}

/** Telefone só com dígitos e DDI (55 quando parece brasileiro sem DDI); null quando não serve para contato. */
export function telefoneParaContato(telefone: string): string | null {
  const d = somenteDigitos(telefone);
  if (d.length < DIGITOS_MINIMOS_TELEFONE || d.length > 20) return null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

async function criarContato(c: ClienteDoPedido, telefone: string): Promise<Contato | null> {
  const { data, error } = await supabaseServico()
    .from("ar1_wa_contacts")
    .insert({ phone: telefone, display_name: c.nome, company: c.empresa || null })
    .select("*")
    .single();
  if (error) {
    console.error("[propostas] contato não criado:", error.message);
    return null;
  }
  return data as Contato;
}

/** Conversa que vale para o contato: a aberta ou a mais recente. */
async function conversaDoContato(contactId: string): Promise<Pick<Atendimento, "id" | "ai_summary" | "status"> | null> {
  const { data } = await supabaseServico()
    .from("ar1_atendimentos")
    .select("id, ai_summary, status, last_message_at")
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(5);
  const lista = (data ?? []) as Pick<Atendimento, "id" | "ai_summary" | "status">[];
  return lista.find((a) => a.status !== "fechado") ?? lista[0] ?? null;
}

async function mensagensDaConversa(atendimentoId: string | null): Promise<Mensagem[]> {
  if (!atendimentoId) return [];
  const { data } = await supabaseServico()
    .from("ar1_wa_messages")
    .select("direction, sent_by, kind, body, media_name, transcript, sent_at")
    .eq("atendimento_id", atendimentoId)
    .order("sent_at", { ascending: false })
    .limit(LIMITE_MENSAGENS_PREMIUM);
  return ((data ?? []) as Mensagem[]).slice().reverse();
}

const ETAPAS_ABERTAS = ["new", "qualified", "contacting", "proposal", "negotiating"];

/** O que já existe no banco (só leitura; nada é criado antes da IA responder). */
interface BaseLida {
  contato: Contato | null;
  oportunidade: Oportunidade | null;
  atendimentoId: string | null;
  resumoDaConversa: string | null;
}

async function lerBase(entrada: EntradaNovaProposta): Promise<BaseLida> {
  const db = supabaseServico();
  const c = entrada.cliente;

  let contato: Contato | null = null;
  if (c.contact_id) {
    contato = await lerContato(c.contact_id);
    if (!contato) throw new ErroProposta("Contato não encontrado. Escolha o contato de novo.", 404);
  } else if (c.telefone) {
    contato = await contatoPeloTelefone(c.telefone);
  }

  let oportunidade: Oportunidade | null = null;
  if (c.oportunidade_id) {
    const { data, error } = await db.from("ar1_quote_requests").select("*").eq("id", c.oportunidade_id).maybeSingle();
    if (error) throw new ErroProposta(`Erro ao ler a oportunidade: ${error.message}`, 500);
    if (!data) throw new ErroProposta("Oportunidade não encontrada.", 404);
    oportunidade = data as Oportunidade;
    if (contato && oportunidade.contact_id && oportunidade.contact_id !== contato.id) {
      if (c.contact_id) throw new ErroProposta("A oportunidade escolhida é de outro contato.", 400);
      contato = null; // achado só pelo telefone digitado: vale o contato da oportunidade
    }
    if (!contato && oportunidade.contact_id) contato = await lerContato(oportunidade.contact_id);
  } else if (contato) {
    const { data } = await db
      .from("ar1_quote_requests")
      .select("*")
      .eq("contact_id", contato.id)
      .in("status", ETAPAS_ABERTAS)
      .order("updated_at", { ascending: false })
      .limit(1);
    oportunidade = ((data ?? [])[0] as Oportunidade | undefined) ?? null;
  }

  const conversa = contato ? await conversaDoContato(contato.id) : null;
  return {
    contato,
    oportunidade,
    atendimentoId: conversa?.id ?? null,
    resumoDaConversa: conversa?.ai_summary ?? null,
  };
}

/** Telefone que a oportunidade nova vai ter (a coluna exige de 8 a 32 caracteres). */
function telefoneDaOportunidade(c: ClienteDoPedido, contato: Contato | null): string | null {
  const digitado = c.telefone.trim();
  if (digitado && somenteDigitos(digitado).length >= 8) return digitado.slice(0, 32);
  if (contato?.phone) return (formatarTelefone(contato.phone) || contato.phone).slice(0, 32);
  return null;
}

interface BaseGravada {
  contato: Contato | null;
  oportunidade: Oportunidade;
  /** O que esta chamada criou (para desfazer se a proposta não for gravada). */
  criados: { contatoId: string | null; oportunidadeId: string | null };
}

/**
 * Cria o contato (se há telefone e ele não existe) e a oportunidade (se não
 * há uma aberta), já na etapa Proposta. Oportunidade existente NÃO muda de
 * etapa aqui: o painel sugere "mover para Proposta" e a pessoa aceita.
 */
async function gravarBase(entrada: EntradaNovaProposta, lida: BaseLida, usuarioId: string): Promise<BaseGravada> {
  const c = entrada.cliente;
  const criados: BaseGravada["criados"] = { contatoId: null, oportunidadeId: null };
  let contato = lida.contato;
  if (!contato && c.telefone) {
    const telefone = telefoneParaContato(c.telefone);
    if (telefone) {
      contato = await criarContato(c, telefone);
      criados.contatoId = contato?.id ?? null;
    }
  }
  if (lida.oportunidade) return { contato, oportunidade: lida.oportunidade, criados };

  const telefone = telefoneDaOportunidade(c, contato);
  if (!telefone) {
    await desfazerBase(criados);
    throw new ErroProposta("Informe o telefone do cliente com DDD: ele cria a oportunidade no funil.", 400);
  }
  const { data, error } = await supabaseServico()
    .from("ar1_quote_requests")
    .insert({
      name: c.nome,
      phone: telefone,
      company: c.empresa || contato?.company || EMPRESA_NAO_INFORMADA,
      email: c.email || null,
      project_type: entrada.pedido.servico.slice(0, 100),
      message: pedidoEmTexto(c, entrada.pedido).slice(0, 5000),
      status: "proposal",
      source: "outro",
      source_path: "propostas",
      contact_id: contato?.id ?? null,
      assigned_to: usuarioId,
    })
    .select("*")
    .single();
  if (error || !data) {
    await desfazerBase(criados);
    throw new ErroProposta(`Não foi possível criar a oportunidade: ${error?.message ?? "erro"}`, 500);
  }
  criados.oportunidadeId = (data as Oportunidade).id;
  return { contato, oportunidade: data as Oportunidade, criados };
}

/** Desfaz o que gravarBase criou (a proposta não chegou a ser gravada). Falha só vai para o log. */
async function desfazerBase(criados: BaseGravada["criados"]): Promise<void> {
  const db = supabaseServico();
  if (criados.oportunidadeId) {
    const { error } = await db.from("ar1_quote_requests").delete().eq("id", criados.oportunidadeId);
    if (error) console.error("[propostas] oportunidade criada não foi desfeita:", error.message);
  }
  if (criados.contatoId) {
    const { error } = await db.from("ar1_wa_contacts").delete().eq("id", criados.contatoId);
    if (error) console.error("[propostas] contato criado não foi desfeito:", error.message);
  }
}

// ----------------------------------------------------------- colunas opcionais

/**
 * Grava colunas que dependem de uma migração posterior (internal_notes,
 * accepted_snapshot). Sem a coluna, segue sem gravar e sem erro.
 */
async function gravarOpcional(id: string, campos: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabaseServico().from(TABELA).update(campos).eq("id", id);
  if (!error) return true;
  if (!colunaAusente(error)) console.error("[propostas] gravação opcional falhou:", error.message);
  return false;
}

function notasInternas(pendencias: readonly string[], avisos: readonly string[], agora: Date): NotasInternas {
  return { pendencias: [...pendencias], avisos: [...avisos], atualizado_em: agora.toISOString() };
}

// ------------------------------------------------------------------ criar

export interface PropostaCriada {
  proposta: PropostaRegistro;
  pendencias: string[];
  avisos: string[];
  modelo: string | null;
}

const TENTATIVAS_DE_NUMERO = 5;

/** Total gravado: null quando nenhuma linha tem valor (tudo sob consulta ou vazio). */
function totalGravado(inv: Pick<Investimento, "itens" | "sob_consulta" | "total">): number | null {
  return inv.itens.length - inv.sob_consulta > 0 ? inv.total : null;
}

/**
 * Passo 3: a IA escreve a proposta, o servidor recalcula os valores e grava.
 * Com IA: situação "gerada". Sem IA ("Criar em branco"): "rascunho" (vira
 * "gerada" ao gerar o PDF ou o link). Contato e oportunidade novos só são
 * criados DEPOIS que a IA respondeu (sem sujeira quando a IA falha) e são
 * desfeitos se a proposta não puder ser gravada.
 */
export async function criarPropostaPremium(entrada: {
  dados: EntradaNovaProposta;
  usuarioId: string;
  semIA?: boolean;
  agora?: Date;
}): Promise<PropostaCriada> {
  const agora = entrada.agora ?? new Date();
  const db = supabaseServico();
  const tabela = await lerTabelaDePrecos();
  const lida = await lerBase(entrada.dados);
  if (!lida.oportunidade && !telefoneDaOportunidade(entrada.dados.cliente, lida.contato)) {
    throw new ErroProposta("Informe o telefone do cliente com DDD: ele cria a oportunidade no funil.", 400);
  }
  const contexto = { cliente: entrada.dados.cliente, pedido: entrada.dados.pedido, tabela };

  let pronta: PropostaPremiumPronta;
  let modelo: string | null = null;
  if (entrada.semIA) {
    pronta = propostaSemIA(contexto);
  } else {
    const [mensagens, config, documentos] = await Promise.all([
      mensagensDaConversa(lida.atendimentoId),
      lerConfiguracoesDeAtendimento(),
      lerDocumentosDeContexto(lida.contato?.id ?? "00000000-0000-0000-0000-000000000000"),
    ]);
    const prompt = montarPromptPremium({
      cliente: entrada.dados.cliente,
      pedido: entrada.dados.pedido,
      tabela: tabela.filter((i) => i.active),
      instrucoes: config.instrucoes,
      baseConhecimento: documentos.baseConhecimento,
      contextoCliente: documentos.contextoCliente,
      mensagens,
      agora,
    });
    let resposta;
    try {
      resposta = await gerarEstruturado({
        system: prompt.system,
        user: prompt.user,
        esquema: esquemaPropostaPremium,
        nomeEsquema: "proposta_premium",
        maxTokens: 12000,
        timeoutMs: TIMEOUT_IA_PROPOSTA_MS,
        modelo: env.aiModelPropostas,
      });
    } catch (e) {
      if (e instanceof ErroIA) throw new ErroProposta(e.message, e.status);
      throw new ErroProposta(e instanceof Error ? e.message : "Erro na IA.", 502);
    }
    modelo = resposta.modelo;
    pronta = aplicarRespostaPremium(resposta.dados, contexto);
  }

  const base = await gravarBase(entrada.dados, lida, entrada.usuarioId);
  const conteudo = pronta.conteudo;
  const dias = lerDiasDoLink(entrada.dados.dias_link);
  const dia = diaDaProposta(agora);

  try {
    for (let tentativa = 0; tentativa < TENTATIVAS_DE_NUMERO; tentativa += 1) {
      const { data: doDia, error: erroNumeros } = await db
        .from(TABELA)
        .select("number")
        .like("number", `AR1-${dia}-%`)
        .order("number", { ascending: false })
        .limit(5);
      if (erroNumeros) throw erroDoBanco(erroNumeros, "Erro ao numerar a proposta");
      const numero = proximoNumero(((doDia ?? []) as { number: string }[]).map((l) => l.number), agora);

      const { data: criada, error } = await db
        .from(TABELA)
        .insert({
          quote_request_id: base.oportunidade.id,
          contact_id: base.contato?.id ?? null,
          atendimento_id: lida.atendimentoId,
          number: numero,
          title: (conteudo.titulo || "Proposta").slice(0, 200),
          content: conteudo,
          sources: [],
          total: totalGravado(conteudo.investimento),
          pending_items: conteudo.investimento.sob_consulta,
          valid_until: validaAte(agora, conteudo.validade_dias),
          file_path: null,
          model: modelo ? modelo.slice(0, 100) : null,
          created_by: entrada.usuarioId,
          kind: "premium",
          status: entrada.semIA ? "rascunho" : "gerada",
          service: entrada.dados.pedido.servico.slice(0, 100),
          public_token: novoToken(),
          public_days: dias,
          public_expires_at: expiraEm(agora, dias),
          unconfirmed_prices: pronta.usaNaoConfirmados,
        })
        .select(COLUNAS)
        .single();
      if (error) {
        if (error.code === "23505") continue; // número (ou token) repetido: tenta de novo
        throw erroDoBanco(error, "Erro ao registrar a proposta");
      }
      let proposta = normalizar(criada as unknown as Record<string, unknown>);
      if (pronta.pendencias.length || pronta.avisos.length) {
        const notas = notasInternas(pronta.pendencias, pronta.avisos, agora);
        if (await gravarOpcional(proposta.id, { internal_notes: notas })) proposta = { ...proposta, internal_notes: notas };
      }
      return { proposta, pendencias: pronta.pendencias, avisos: pronta.avisos, modelo };
    }
    throw new ErroProposta("Não foi possível numerar a proposta agora. Tente de novo.", 409);
  } catch (e) {
    await desfazerBase(base.criados);
    throw e;
  }
}

// ----------------------------------------------------------------- puxar

/** "Puxar da conversa": a IA preenche o pedido a partir das mensagens do contato. Não grava nada. */
export async function puxarPedidoDaConversa(contactId: string, agora?: Date): Promise<PedidoPuxado & { modelo: string }> {
  if (!UUID.test(contactId)) throw new ErroProposta("Contato inválido.", 400);
  const contato = await lerContato(contactId);
  if (!contato) throw new ErroProposta("Contato não encontrado.", 404);
  const conversa = await conversaDoContato(contato.id);
  const [mensagens, documentos] = await Promise.all([
    mensagensDaConversa(conversa?.id ?? null),
    lerDocumentosDeContexto(contato.id),
  ]);
  if (!mensagens.length) throw new ErroProposta("Este contato ainda não tem mensagens no WhatsApp.", 404);
  const prompt = montarPromptPedido({
    contato: { phone: contato.phone, nome: contato.display_name || contato.wa_name, empresa: contato.company, notes: contato.notes },
    mensagens,
    resumoDaConversa: conversa?.ai_summary ?? null,
    baseConhecimento: documentos.baseConhecimento,
    contextoCliente: documentos.contextoCliente,
    agora,
  });
  try {
    const resposta = await gerarEstruturado({
      system: prompt.system,
      user: prompt.user,
      esquema: esquemaPedidoDaConversa,
      nomeEsquema: "pedido_da_conversa",
      maxTokens: 3000,
      timeoutMs: TIMEOUT_IA_PEDIDO_MS,
    });
    return { ...pedidoDaResposta(resposta.dados), modelo: resposta.modelo };
  } catch (e) {
    if (e instanceof ErroIA) throw new ErroProposta(e.message, e.status);
    throw e;
  }
}

// ------------------------------------------------------------------ listar

export interface FiltrosDaLista {
  busca?: string;
  status?: string;
  /** Serviço principal (coluna service), exato. */
  servico?: string;
  /** Dia inicial e final da criação, AAAA-MM-DD em Brasília (inclusive). */
  de?: string;
  ate?: string;
}

const LIMITE_DA_LISTA = 300;

/** Texto seguro para o filtro `or` do PostgREST (sem vírgula, parênteses, aspas, curingas). */
export function termoDeBusca(busca: string | null | undefined): string {
  return (busca ?? "")
    .replace(/[,()"'\\%*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Início do dia (Brasília) em ISO; null quando não é AAAA-MM-DD. */
function inicioDoDia(dia: string | undefined, mais = 0): string | null {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const t = Date.parse(`${dia}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t - FUSO_BRASILIA_MS + mais * 24 * 60 * 60 * 1000).toISOString();
}

function combina(p: PropostaRegistro, termo: string): boolean {
  if (!termo) return true;
  const cliente = p.content?.cliente;
  return [p.number, p.title, p.service ?? "", cliente?.nome ?? "", cliente?.empresa ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(termo.toLowerCase());
}

/**
 * Lista geral (tela Propostas): as mais novas primeiro, até 300. Com busca,
 * o banco procura em número/título/serviço em TODAS as propostas, e o nome ou a
 * empresa do cliente são conferidos nas 300 mais recentes.
 */
export async function listarTodasAsPropostas(filtros: FiltrosDaLista = {}): Promise<PropostaRegistro[]> {
  const db = supabaseServico();
  const termo = termoDeBusca(filtros.busca);
  const status = filtros.status && ehStatusProposta(filtros.status) ? filtros.status : null;
  const servico = (filtros.servico ?? "").trim().slice(0, 100);
  const de = inicioDoDia(filtros.de);
  const ate = inicioDoDia(filtros.ate, 1);

  const consulta = (comBusca: boolean) => {
    let q = db.from(TABELA).select(COLUNAS).order("created_at", { ascending: false }).limit(LIMITE_DA_LISTA);
    if (status) q = q.eq("status", status);
    if (servico) q = q.eq("service", servico);
    if (de) q = q.gte("created_at", de);
    if (ate) q = q.lt("created_at", ate);
    if (comBusca) q = q.or(`number.ilike.*${termo}*,title.ilike.*${termo}*,service.ilike.*${termo}*`);
    return q;
  };

  const [recentes, achadas] = await Promise.all([consulta(false), termo ? consulta(true) : Promise.resolve(null)]);
  if (recentes.error) throw erroDoBanco(recentes.error, "Erro ao listar as propostas");
  if (achadas?.error) throw erroDoBanco(achadas.error, "Erro ao buscar as propostas");

  const porId = new Map<string, PropostaRegistro>();
  for (const linha of [...((achadas?.data ?? []) as unknown[]), ...((recentes.data ?? []) as unknown[])]) {
    const p = normalizar(linha as Record<string, unknown>);
    if (!porId.has(p.id)) porId.set(p.id, p);
  }
  return [...porId.values()]
    .filter((p) => combina(p, termo))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, LIMITE_DA_LISTA);
}

// ---------------------------------------------------------------- alterar

function premiumOuErro(p: PropostaRegistro): PropostaPremium {
  if (p.kind !== "premium" || !ehPremium(p.content)) throw new ErroProposta("Esta proposta não é premium.", 400);
  return p.content;
}

export interface AlteracaoPremium {
  conteudo?: unknown;
  dias_link?: unknown;
  /** Situação pedida: "aceita" | "recusada" | "enviada" | "gerada" (ver podeMarcar). */
  status?: unknown;
  /** true: recalcula todas as linhas pelo preço ATUAL da tabela (senão, as já usadas mantêm o preço gravado). */
  atualizar_precos?: unknown;
}

export interface PropostaAlterada {
  proposta: PropostaRegistro;
  /** Avisos internos (preços mantidos diferentes da tabela, valores não confirmados). */
  avisos: string[];
}

/** Campos da mudança de situação pedida pela equipe. */
export function camposDaSituacao(
  atual: Pick<PropostaRegistro, "status" | "sent_at" | "sent_by" | "outbox_id">,
  pedido: unknown,
  usuarioId: string,
  agora: Date,
): { status: StatusProposta; campos: Record<string, unknown> } {
  if (!ehStatusProposta(pedido) || pedido === "rascunho") {
    throw new ErroProposta("Situação inválida. Use aceita, recusada, enviada ou gerada.", 400);
  }
  if (!podeMarcar(atual.status, pedido, { enviadaPelaFila: Boolean(atual.outbox_id) })) {
    throw new ErroProposta(
      `Não dá para passar de "${ROTULO_STATUS_PROPOSTA[atual.status]}" para "${ROTULO_STATUS_PROPOSTA[pedido]}".`,
      400,
    );
  }
  const quando = agora.toISOString();
  switch (pedido) {
    case "aceita":
    case "recusada":
      return { status: pedido, campos: { status: pedido, decided_at: quando, decided_by: usuarioId } };
    case "enviada":
      // Marcada à mão: o link foi copiado ou mandado por outro número.
      return {
        status: "enviada",
        campos: { status: "enviada", sent_at: atual.sent_at ?? quando, sent_by: atual.sent_by ?? usuarioId },
      };
    case "gerada": {
      if (atual.status === "aceita" || atual.status === "recusada") {
        const volta = statusAoReabrir(atual);
        return {
          status: volta,
          campos: { status: volta, decided_at: null, decided_by: null, accepted_at: null, accepted_name: null },
        };
      }
      if (atual.status === "enviada") {
        return { status: "gerada", campos: { status: "gerada", sent_at: null, sent_by: null } };
      }
      return { status: "gerada", campos: { status: "gerada" } };
    }
  }
}

/**
 * Salva o que o editor mandou, em uma só gravação condicionada à situação lida
 * (se o cliente aceitar no meio, a gravação falha com 409 em vez de passar por
 * cima). Regras:
 *   - o investimento é SEMPRE recalculado no servidor; linhas de itens que a
 *     proposta já usa mantêm o preço gravado (a proposta não muda de valor
 *     sozinha), a não ser com `atualizar_precos: true`;
 *   - proposta aceita ou recusada não tem o conteúdo alterado (reabra antes;
 *     `situacao: "gerada"` e `conteudo` podem ir no mesmo pedido);
 *   - imagens enviadas só valem se forem desta proposta.
 */
export async function alterarPropostaPremium(
  id: string,
  alteracao: AlteracaoPremium,
  usuarioId: string,
  agora: Date = new Date(),
): Promise<PropostaAlterada> {
  const atual = await lerProposta(id);
  const conteudoAtual = premiumOuErro(atual);
  const campos: Record<string, unknown> = {};
  const avisos: string[] = [];
  let statusFinal = atual.status;

  if (alteracao.status !== undefined && alteracao.status !== null) {
    const mudanca = camposDaSituacao(atual, alteracao.status, usuarioId, agora);
    Object.assign(campos, mudanca.campos);
    statusFinal = mudanca.status;
  }

  if (alteracao.conteudo !== undefined) {
    if (propostaDecidida(statusFinal)) {
      throw new ErroProposta(
        `Esta proposta está ${ROTULO_STATUS_PROPOSTA[statusFinal].toLowerCase()}. Reabra a proposta para editar o conteúdo.`,
        409,
      );
    }
    const bruto = (alteracao.conteudo && typeof alteracao.conteudo === "object" ? alteracao.conteudo : {}) as Record<string, unknown>;
    const inv = (bruto.investimento && typeof bruto.investimento === "object" ? bruto.investimento : {}) as Record<string, unknown>;
    const tabela = await lerTabelaDePrecos();
    const descontoBruto = typeof inv.desconto === "number" ? inv.desconto : Number(String(inv.desconto ?? "").replace(",", "."));
    const investimento = recalcularInvestimento(Array.isArray(inv.itens) ? inv.itens : [], tabela, {
      desconto: Number.isFinite(descontoBruto) && descontoBruto > 0 ? descontoBruto : null,
      condicoesPagamento: typeof inv.condicoes_pagamento === "string" ? inv.condicoes_pagamento : "",
      guardados: alteracao.atualizar_precos === true ? null : conteudoAtual.investimento.itens,
    });
    const conteudo = normalizarPremium({ ...bruto, cliente: bruto.cliente ?? conteudoAtual.cliente }, investimento);
    const minha = (caminho: string) => caminhoDeImagemValido(caminho) && caminho.startsWith(`propostas/${id}/`);
    if (conteudo.logo_cliente && !minha(conteudo.logo_cliente)) conteudo.logo_cliente = null;
    if (conteudo.capa.imagem?.origem === "cliente" && !minha(conteudo.capa.imagem.arquivo)) conteudo.capa.imagem = null;
    for (const s of conteudo.solucao) if (s.imagem?.origem === "cliente" && !minha(s.imagem.arquivo)) s.imagem = null;
    const conferida = conferirPremium(conteudo);
    if (!conferida.ok) throw new ErroProposta(conferida.erro, 400);
    campos.content = conteudo;
    campos.title = (conteudo.titulo || "Proposta").slice(0, 200);
    campos.total = totalGravado(investimento);
    campos.pending_items = investimento.sob_consulta;
    campos.unconfirmed_prices = usaValoresNaoConfirmados(investimento);
    campos.valid_until = validaAte(new Date(atual.created_at), conteudo.validade_dias);
    for (const m of precosMantidos(investimento, tabela)) avisos.push(avisoDePrecoMantido(m));
  }

  if (alteracao.dias_link !== undefined && alteracao.dias_link !== null) {
    const dias = lerDiasDoLink(alteracao.dias_link);
    campos.public_days = dias;
    campos.public_expires_at = expiraEm(agora, dias);
    if (!atual.public_token) campos.public_token = novoToken();
  }

  if (Object.keys(campos).length === 0) return { proposta: atual, avisos };
  const { data, error } = await supabaseServico()
    .from(TABELA)
    .update(campos)
    .eq("id", id)
    .eq("status", atual.status)
    .select(COLUNAS);
  if (error) throw erroDoBanco(error, "Erro ao salvar a proposta");
  const linha = ((data ?? []) as unknown[])[0];
  if (!linha) {
    throw new ErroProposta("A proposta mudou de situação enquanto você editava (o cliente pode ter aceitado). Atualize a tela.", 409);
  }
  const proposta = normalizar(linha as Record<string, unknown>);
  if (proposta.unconfirmed_prices) avisos.push("Esta proposta usa valores não confirmados da tabela de preços.");
  return { proposta, avisos };
}

/** Rascunho vira "gerada" quando a equipe gera o PDF ou pede o link. */
async function concluirRascunho(p: PropostaRegistro): Promise<PropostaRegistro> {
  if (p.status !== "rascunho") return p;
  const { data, error } = await supabaseServico()
    .from(TABELA)
    .update({ status: "gerada" })
    .eq("id", p.id)
    .eq("status", "rascunho")
    .select(COLUNAS);
  if (error) {
    console.error("[propostas] rascunho não passou a gerada:", error.message);
    return p;
  }
  const linha = ((data ?? []) as unknown[])[0];
  return linha ? normalizar(linha as Record<string, unknown>) : { ...p, status: "gerada" };
}

// ------------------------------------------------------------------- PDF

export function caminhoDoPdfPremium(oportunidadeId: string, numero: string): string {
  return `propostas/${oportunidadeId}/${numero}.pdf`;
}

/** URL que o Chrome abre: a página pública em modo de impressão, com a assinatura curta. */
export function urlDeImpressao(token: string, agora: number = Date.now()): string {
  return `${urlPublica(env.appUrl, token)}?impressao=${encodeURIComponent(assinarImpressao(token, env.webhookSecret, agora))}`;
}

/**
 * Gera o PDF: primeiro pelo Chrome (a mesma página pública, uma lâmina por
 * seção); se falhar, pelo pdf-lib (versão simples, com o mesmo total),
 * registrando o motivo em pdf_error. Imprime o que está GRAVADO (salve antes).
 */
export async function gerarPdfPremium(id: string): Promise<PropostaRegistro> {
  const proposta = await lerProposta(id);
  const conteudo = premiumOuErro(proposta);
  const db = supabaseServico();

  let token = proposta.public_token;
  if (!token) {
    token = novoToken();
    const { error } = await db
      .from(TABELA)
      .update({ public_token: token, public_expires_at: expiraEm(new Date(), proposta.public_days) })
      .eq("id", id);
    if (error) throw erroDoBanco(error, "Erro ao criar o link da proposta");
  }

  let bytes: Uint8Array;
  let paginas: number;
  let motor: "chrome" | "pdf-lib";
  let erroChrome: string | null = null;
  try {
    const impresso = await imprimirPagina(urlDeImpressao(token));
    bytes = impresso.bytes;
    paginas = impresso.paginas;
    motor = "chrome";
  } catch (e) {
    erroChrome = (e instanceof Error ? e.message : "erro desconhecido").slice(0, 480);
    console.error("[propostas] PDF pelo Chrome falhou; usando o pdf-lib:", erroChrome);
    try {
      const reserva = entradaDaReserva(conteudo);
      const gerado = await gerarPdfDaProposta({
        proposta: reserva.proposta,
        numero: proposta.number,
        emitidaEm: proposta.created_at.slice(0, 10),
        validaAte: proposta.valid_until,
        desconto: reserva.desconto,
        textoSemValor: reserva.textoSemValor,
        maximoDePaginas: reserva.maximoDePaginas,
      });
      bytes = gerado.bytes;
      paginas = gerado.paginas;
      motor = "pdf-lib";
    } catch (e2) {
      const motivo = e2 instanceof ErroPdf || e2 instanceof Error ? e2.message : "erro";
      throw new ErroProposta(`O PDF não pôde ser gerado. Chrome: ${erroChrome}. Reserva (pdf-lib): ${motivo}`, 502);
    }
  }

  const caminho = caminhoDoPdfPremium(proposta.quote_request_id, proposta.number);
  const { error: erroArquivo } = await db.storage
    .from(BUCKET_CONTEXTO)
    .upload(caminho, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (erroArquivo) throw new ErroProposta(`Não foi possível guardar o PDF: ${erroArquivo.message}`, 500);

  const { data, error } = await db
    .from(TABELA)
    .update({
      file_path: caminho,
      file_size: bytes.byteLength,
      pages: Math.min(60, Math.max(1, paginas)),
      pdf_engine: motor,
      pdf_error: erroChrome,
    })
    .eq("id", id)
    .select(COLUNAS)
    .single();
  if (error) throw erroDoBanco(error, "Erro ao registrar o PDF");
  return concluirRascunho(normalizar(data as unknown as Record<string, unknown>));
}

// ---------------------------------------------------------------- imagens

export const TAMANHO_MAXIMO_IMAGEM = 4 * 1024 * 1024;
const MIME_IMAGEM: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Tipo real pelo começo do arquivo (não confia no que o navegador declarou). */
export function tipoDaImagem(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function guardarImagemDaProposta(id: string, arquivo: File): Promise<string> {
  await lerProposta(id);
  if (arquivo.size === 0) throw new ErroProposta("O arquivo está vazio.", 400);
  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) throw new ErroProposta("A imagem passa de 4 MB.", 400);
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = tipoDaImagem(bytes);
  if (!tipo) throw new ErroProposta("Envie uma imagem PNG, JPG ou WebP.", 400);
  const ext = MIME_IMAGEM[tipo];
  const base = arquivo.name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "imagem";
  const caminho = `propostas/${id}/${randomUUID()}-${base}.${ext}`;
  const { error } = await supabaseServico()
    .storage.from(BUCKET_CONTEXTO)
    .upload(caminho, Buffer.from(bytes), { contentType: tipo, upsert: false });
  if (error) throw new ErroProposta(`Não foi possível guardar a imagem: ${error.message}`, 502);
  return caminho;
}

/** URL assinada de uma imagem enviada (para a tela e a página pública). */
export async function urlDaImagemEnviada(caminho: string, segundos = 24 * 60 * 60): Promise<string | null> {
  if (!caminhoDeImagemValido(caminho)) return null;
  const { data } = await supabaseServico().storage.from(BUCKET_CONTEXTO).createSignedUrl(caminho, segundos);
  return data?.signedUrl ?? null;
}

/** URLs assinadas das imagens enviadas (logo, fotos do cliente) que a proposta usa. */
export async function imagensAssinadas(p: PropostaRegistro): Promise<Record<string, string>> {
  if (!ehPremium(p.content)) return {};
  const caminhos = new Set<string>();
  if (p.content.logo_cliente) caminhos.add(p.content.logo_cliente);
  if (p.content.capa.imagem?.origem === "cliente") caminhos.add(p.content.capa.imagem.arquivo);
  for (const s of p.content.solucao) if (s.imagem?.origem === "cliente") caminhos.add(s.imagem.arquivo);
  const pares = await Promise.all([...caminhos].map(async (c) => [c, await urlDaImagemEnviada(c)] as const));
  return Object.fromEntries(pares.filter((par): par is readonly [string, string] => typeof par[1] === "string"));
}

// ----------------------------------------------------------- página pública

export async function lerPropostaPorToken(token: string): Promise<PropostaRegistro | null> {
  if (!ehToken(token)) return null;
  const { data, error } = await supabaseServico().from(TABELA).select(COLUNAS).eq("public_token", token).maybeSingle();
  if (error) {
    console.error("[propostas] página pública:", error.message);
    return null;
  }
  return data ? normalizar(data as unknown as Record<string, unknown>) : null;
}

const TENTATIVAS_DE_VISITA = 3;

/**
 * Conta a visita do cliente sem perder visitas simultâneas: grava só se a
 * contagem ainda for a lida (senão relê e tenta de novo, até 3 vezes).
 */
export async function registrarVisita(p: PropostaRegistro, agora: Date = new Date()): Promise<boolean> {
  const db = supabaseServico();
  let atual: Pick<PropostaRegistro, "views" | "first_viewed_at" | "last_viewed_at"> = p;
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_VISITA; tentativa += 1) {
    const novo = registrarVisualizacao(atual, agora);
    const { data, error } = await db
      .from(TABELA)
      .update(novo)
      .eq("id", p.id)
      .eq("views", atual.views)
      .select("id");
    if (error) {
      console.error("[propostas] visita não registrada:", error.message);
      return false;
    }
    if (((data ?? []) as unknown[]).length) return true;
    const { data: relida } = await db
      .from(TABELA)
      .select("views, first_viewed_at, last_viewed_at")
      .eq("id", p.id)
      .maybeSingle();
    if (!relida) return false;
    const r = relida as Record<string, unknown>;
    atual = {
      views: Number(r.views) || 0,
      first_viewed_at: typeof r.first_viewed_at === "string" ? r.first_viewed_at : null,
      last_viewed_at: typeof r.last_viewed_at === "string" ? r.last_viewed_at : null,
    };
  }
  return false;
}

export type ResultadoDaVisita = { contada: true } | { contada: false; motivo: "robo" | "equipe" | "link" | "falha" };

/**
 * Visita avisada pela própria página, depois de abrir no navegador (robôs de
 * prévia não rodam o script). Não contam: robôs pelo user-agent, a equipe
 * logada no painel e link inexistente ou vencido.
 */
export async function contarVisita(
  token: string,
  quem: { userAgent: string | null; daEquipe: boolean },
  agora: Date = new Date(),
): Promise<ResultadoDaVisita> {
  if (ehRobo(quem.userAgent)) return { contada: false, motivo: "robo" };
  if (quem.daEquipe) return { contada: false, motivo: "equipe" };
  const p = await lerPropostaPorToken(token);
  if (!p || p.kind !== "premium" || estadoDoLink(p, agora.getTime()) !== "ativo") return { contada: false, motivo: "link" };
  return (await registrarVisita(p, agora)) ? { contada: true } : { contada: false, motivo: "falha" };
}

export type ResultadoDoAceite = { ok: true; nome: string } | { ok: false; erro: string; status: number };

/**
 * O cliente aceitou pela página. A gravação só vale se a situação ainda for
 * gerada/enviada (se a equipe marcou recusada no mesmo instante, responde 409).
 * Guarda também o retrato do que foi aceito (total, itens, versão do conteúdo,
 * navegador) na coluna accepted_snapshot, quando ela existir.
 */
export async function aceitarProposta(
  token: string,
  nome: unknown,
  quem: { userAgent?: string | null; ip?: string | null } = {},
  agora: Date = new Date(),
): Promise<ResultadoDoAceite> {
  const p = await lerPropostaPorToken(token);
  if (!p || p.kind !== "premium") return { ok: false, erro: "Proposta não encontrada.", status: 404 };
  const r = aceitarPelaPagina(p, nome, agora);
  if (!r.ok) return r;
  const { data, error } = await supabaseServico()
    .from(TABELA)
    .update(r.campos)
    .eq("id", p.id)
    .in("status", ["gerada", "enviada"])
    .select("id");
  if (error) return { ok: false, erro: "Não foi possível registrar o aceite. Tente de novo.", status: 500 };
  if (!((data ?? []) as unknown[]).length) {
    return { ok: false, erro: "Esta proposta acabou de mudar de situação. Atualize a página.", status: 409 };
  }
  if (ehPremium(p.content)) {
    const inv = p.content.investimento;
    await gravarOpcional(p.id, {
      accepted_snapshot: {
        numero: p.number,
        total: p.total,
        subtotal: inv.subtotal,
        desconto: inv.desconto,
        sob_consulta: inv.sob_consulta,
        itens: inv.itens.map((i) => ({
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidade: i.unidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
        })),
        conteudo_atualizado_em: p.updated_at,
        valida_ate: p.valid_until,
        user_agent: (quem.userAgent ?? "").slice(0, 300) || null,
        ip: (quem.ip ?? "").slice(0, 64) || null,
      },
    });
  }
  return { ok: true, nome: r.campos.accepted_name };
}

// ------------------------------------------------------------------ link

export interface LinkParaOCliente {
  link: string;
  texto: string;
  expira_em: string | null;
  /** Dias de validade do link. */
  dias: number;
}

/**
 * Link para o cliente: página pública (premium; o link vencido é reativado com
 * o MESMO token e novo vencimento; o rascunho passa a "gerada") ou PDF assinado
 * de 7 dias (propostas antigas). Não envia nada.
 */
export async function linkParaOCliente(id: string): Promise<LinkParaOCliente> {
  let p = await lerProposta(id);
  if (p.kind === "premium") {
    const agora = new Date();
    let token = p.public_token;
    let expira = p.public_expires_at;
    if (!token || estadoDoLink(p, agora.getTime()) !== "ativo") {
      token = token ?? novoToken();
      expira = expiraEm(agora, p.public_days);
      const { error } = await supabaseServico().from(TABELA).update({ public_token: token, public_expires_at: expira }).eq("id", id);
      if (error) throw erroDoBanco(error, "Erro ao renovar o link");
    }
    p = await concluirRascunho(p);
    const link = urlPublica(env.appUrl, token);
    return {
      link,
      expira_em: expira,
      dias: p.public_days,
      texto: mensagemDoLinkPremium({
        nomeDoCliente: p.content?.cliente?.nome,
        titulo: p.title,
        numero: p.number,
        validaAte: p.valid_until,
        link,
      }),
    };
  }
  // Propostas em PDF antigas: link assinado de 7 dias (fluxo original).
  const link = await linkDoPdf(p, SEGUNDOS_DO_LINK);
  return {
    link,
    dias: DIAS_DO_LINK,
    expira_em: new Date(Date.now() + SEGUNDOS_DO_LINK * 1000).toISOString(),
    texto: textoDaMensagem({ nomeDoCliente: p.content?.cliente?.nome, titulo: p.title, numero: p.number, validaAte: p.valid_until, link }),
  };
}
