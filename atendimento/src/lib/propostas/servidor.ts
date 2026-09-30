import "server-only";

// Lado "banco" das propostas: lê o que a IA precisa, guarda o PDF no Storage
// e registra a proposta. A IA só rascunha; o PDF só nasce do que uma pessoa
// revisou e mandou gerar.

import { lerConfiguracoesDeAtendimento, lerDocumentosDeContexto } from "../analise/executar";
import { BUCKET_CONTEXTO } from "../contexto/limites";
import { UUID } from "../contexto/validar";
import { ErroIA, gerarEstruturado } from "../ia";
import { supabaseServico } from "../supabase/service";
import type { Atendimento, Contato, Mensagem, Oportunidade, PropostaRegistro } from "../tipos";
import { esquemaRascunhoProposta } from "./esquema";
import { gerarPdfDaProposta, type PdfGerado } from "./pdf";
import { diaDaProposta, proximoNumero, totalDaProposta, validaAte, type Proposta } from "./proposta";
import { COLUNAS, erroDoBanco, ErroProposta, normalizar, TABELA } from "./registro";
import {
  aplicarRegrasDoRascunho,
  LIMITE_MENSAGENS_PROPOSTA,
  montarPromptProposta,
  rascunhoSemIA,
  type RascunhoPronto,
} from "./rascunho";

export function caminhoDoPdf(oportunidadeId: string, numeroDaProposta: string): string {
  return `propostas/${oportunidadeId}/${numeroDaProposta}.pdf`;
}

// ------------------------------------------------------------------ leitura

interface Base {
  oportunidade: Oportunidade;
  contato: Contato | null;
  atendimento: Pick<Atendimento, "id" | "contact_id" | "ai_summary"> | null;
}

/**
 * Oportunidade, contato e a conversa que vale para ela: a informada, a ligada
 * à oportunidade (a mais recente) ou a conversa aberta do contato.
 */
async function lerBase(oportunidadeId: string, atendimentoId?: string | null): Promise<Base> {
  if (!UUID.test(oportunidadeId)) throw new ErroProposta("Oportunidade inválida.", 400);
  if (atendimentoId && !UUID.test(atendimentoId)) throw new ErroProposta("Conversa inválida.", 400);
  const db = supabaseServico();

  const { data: bruta, error } = await db
    .from("ar1_quote_requests")
    .select("*")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (error) throw new ErroProposta(`Erro ao ler a oportunidade: ${error.message}`, 500);
  if (!bruta) throw new ErroProposta("Oportunidade não encontrada.", 404);
  const oportunidade = bruta as Oportunidade;

  const colunas = "id, contact_id, ai_summary, status, quote_request_id, last_message_at";
  type Linha = Pick<Atendimento, "id" | "contact_id" | "ai_summary" | "status" | "quote_request_id">;
  let atendimento: Linha | null = null;
  if (atendimentoId) {
    const { data } = await db.from("ar1_atendimentos").select(colunas).eq("id", atendimentoId).maybeSingle();
    atendimento = (data as Linha | null) ?? null;
    if (!atendimento) throw new ErroProposta("Conversa não encontrada.", 404);
    const daOportunidade =
      atendimento.quote_request_id === oportunidade.id ||
      (oportunidade.contact_id !== null && atendimento.contact_id === oportunidade.contact_id);
    if (!daOportunidade) throw new ErroProposta("A conversa não é desta oportunidade.", 400);
  } else {
    const { data: ligadas } = await db
      .from("ar1_atendimentos")
      .select(colunas)
      .eq("quote_request_id", oportunidade.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5);
    const lista = (ligadas ?? []) as Linha[];
    atendimento = lista.find((a) => a.status !== "fechado") ?? lista[0] ?? null;
    if (!atendimento && oportunidade.contact_id) {
      const { data: abertas } = await db
        .from("ar1_atendimentos")
        .select(colunas)
        .eq("contact_id", oportunidade.contact_id)
        .neq("status", "fechado")
        .limit(1);
      atendimento = ((abertas ?? [])[0] as Linha | undefined) ?? null;
    }
  }

  const contatoId = oportunidade.contact_id ?? atendimento?.contact_id ?? null;
  let contato: Contato | null = null;
  if (contatoId) {
    const { data } = await db.from("ar1_wa_contacts").select("*").eq("id", contatoId).maybeSingle();
    contato = (data as Contato | null) ?? null;
  }

  return { oportunidade, contato, atendimento };
}

// ----------------------------------------------------------------- rascunho

export interface RascunhoGerado extends RascunhoPronto {
  /** Modelo que escreveu o rascunho; null quando foi montado sem IA. */
  modelo: string | null;
  atendimento_id: string | null;
}

/** Tempo máximo da chamada à IA (a rota tem 60 s). */
const TIMEOUT_IA_MS = 50_000;

/**
 * Passo 1: a IA monta o rascunho estruturado. Com `semIA`, devolve o rascunho
 * só com os dados da oportunidade (para começar em branco).
 */
export async function prepararRascunho(entrada: {
  oportunidadeId: string;
  atendimentoId?: string | null;
  semIA?: boolean;
  agora?: Date;
}): Promise<RascunhoGerado> {
  const base = await lerBase(entrada.oportunidadeId, entrada.atendimentoId);
  const atendimentoId = base.atendimento?.id ?? null;

  if (entrada.semIA) {
    return { ...rascunhoSemIA(base.oportunidade, base.contato), modelo: null, atendimento_id: atendimentoId };
  }

  const db = supabaseServico();
  const [mensagensLidas, config, documentos] = await Promise.all([
    atendimentoId
      ? db
          .from("ar1_wa_messages")
          .select("direction, sent_by, kind, body, media_name, transcript, sent_at")
          .eq("atendimento_id", atendimentoId)
          .order("sent_at", { ascending: false })
          .limit(LIMITE_MENSAGENS_PROPOSTA)
      : Promise.resolve({ data: [], error: null }),
    lerConfiguracoesDeAtendimento(),
    base.contato
      ? lerDocumentosDeContexto(base.contato.id)
      : lerDocumentosDeContexto("00000000-0000-0000-0000-000000000000"),
  ]);
  if (mensagensLidas.error) {
    throw new ErroProposta(`Erro ao ler a conversa: ${mensagensLidas.error.message}`, 500);
  }
  const mensagens = ((mensagensLidas.data ?? []) as Mensagem[]).slice().reverse();

  const prompt = montarPromptProposta({
    oportunidade: base.oportunidade,
    contato: base.contato,
    mensagens,
    resumoDaConversa: base.atendimento?.ai_summary ?? null,
    instrucoes: config.instrucoes,
    baseConhecimento: documentos.baseConhecimento,
    contextoCliente: documentos.contextoCliente,
    agora: entrada.agora,
  });

  let resposta;
  try {
    resposta = await gerarEstruturado({
      system: prompt.system,
      user: prompt.user,
      esquema: esquemaRascunhoProposta,
      nomeEsquema: "rascunho_de_proposta",
      maxTokens: 6000,
      timeoutMs: TIMEOUT_IA_MS,
    });
  } catch (e) {
    if (e instanceof ErroIA) throw new ErroProposta(e.message, e.status);
    throw new ErroProposta(e instanceof Error ? e.message : "Erro na IA.", 502);
  }

  const pronto = aplicarRegrasDoRascunho(resposta.dados, {
    oportunidade: base.oportunidade,
    contato: base.contato,
    titulosDosDocumentos: prompt.titulosDosDocumentos,
    textosDeBase: prompt.textosDeBase,
    temConversa: prompt.temConversa,
  });
  return { ...pronto, modelo: resposta.modelo, atendimento_id: atendimentoId };
}

// -------------------------------------------------------------------- gerar

const TENTATIVAS_DE_NUMERO = 5;

/**
 * Passos 3 e 4: numera, gera o PDF, guarda no Storage privado e registra no
 * histórico da oportunidade. Número repetido (duas pessoas gerando ao mesmo
 * tempo) é resolvido pegando o próximo.
 */
export async function gerarProposta(entrada: {
  oportunidadeId: string;
  atendimentoId?: string | null;
  proposta: Proposta;
  fontes: string[];
  modelo: string | null;
  usuarioId: string;
  agora?: Date;
}): Promise<PropostaRegistro> {
  const agora = entrada.agora ?? new Date();
  const base = await lerBase(entrada.oportunidadeId, entrada.atendimentoId);
  const db = supabaseServico();

  const dia = diaDaProposta(agora);
  const emitidaEm = `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`;
  const valida = validaAte(agora, entrada.proposta.validade_dias);
  const total = totalDaProposta(entrada.proposta.investimento);

  let pdf: (PdfGerado & { numero: string }) | null = null;

  for (let tentativa = 0; tentativa < TENTATIVAS_DE_NUMERO; tentativa += 1) {
    const { data: doDia, error: erroNumeros } = await db
      .from(TABELA)
      .select("number")
      .like("number", `AR1-${dia}-%`)
      .order("number", { ascending: false })
      .limit(5);
    if (erroNumeros) throw erroDoBanco(erroNumeros, "Erro ao numerar a proposta");
    const candidato = proximoNumero(
      ((doDia ?? []) as { number: string }[]).map((l) => l.number),
      agora,
    );

    if (!pdf || pdf.numero !== candidato) {
      // Lança ErroPdf (422) quando passa de 3 páginas: nada é gravado.
      const gerado = await gerarPdfDaProposta({
        proposta: entrada.proposta,
        numero: candidato,
        emitidaEm,
        validaAte: valida,
      });
      pdf = { ...gerado, numero: candidato };
    }
    const caminho = caminhoDoPdf(base.oportunidade.id, candidato);

    // Registra primeiro (reserva o número); o arquivo sobe em seguida.
    const { data: criada, error: erroCriar } = await db
      .from(TABELA)
      .insert({
        quote_request_id: base.oportunidade.id,
        contact_id: base.contato?.id ?? null,
        atendimento_id: base.atendimento?.id ?? null,
        number: candidato,
        title: entrada.proposta.titulo.slice(0, 200),
        content: entrada.proposta,
        sources: entrada.fontes.slice(0, 30),
        total: total.itensComValor > 0 ? total.total : null,
        pending_items: total.itensADefinir,
        valid_until: valida,
        file_path: caminho,
        file_size: pdf.bytes.byteLength,
        pages: pdf.paginas,
        model: entrada.modelo ? entrada.modelo.slice(0, 100) : null,
        created_by: entrada.usuarioId,
      })
      .select(COLUNAS)
      .single();
    if (erroCriar) {
      if (erroCriar.code === "23505") continue; // outra pessoa pegou este número: tenta o próximo
      throw erroDoBanco(erroCriar, "Erro ao registrar a proposta");
    }

    const { error: erroArquivo } = await db.storage
      .from(BUCKET_CONTEXTO)
      .upload(caminho, Buffer.from(pdf.bytes), { contentType: "application/pdf", upsert: false });
    if (erroArquivo) {
      const id = (criada as unknown as { id: string }).id;
      await db.from(TABELA).delete().eq("id", id);
      throw new ErroProposta(`Não foi possível guardar o PDF: ${erroArquivo.message}`, 500);
    }

    return normalizar(criada as unknown as Record<string, unknown>);
  }

  throw new ErroProposta("Não foi possível numerar a proposta agora. Tente de novo.", 409);
}
