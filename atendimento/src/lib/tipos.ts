// Tipos das tabelas do Supabase usadas pelo app (espelham as migrações).

import type { PropostaPremium } from "./propostas/premium/conteudo";
import type { StatusProposta } from "./propostas/premium/publico";
import type { Proposta } from "./propostas/proposta";

export type StatusAtendimento =
  | "novo"
  | "em_atendimento"
  | "aguardando_cliente"
  | "fechado";

export type Outcome =
  | "orcamento"
  | "agendado"
  | "sem_interesse"
  | "spam"
  | "outro";

export type AiKind =
  | "lead"
  | "cliente"
  | "fornecedor"
  | "pessoal"
  | "spam"
  | "indefinido";

export type AiUrgency = "alta" | "media" | "baixa";

export type KindMensagem =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "other";

export type StatusSugestao =
  | "pendente"
  | "aprovada"
  | "editada"
  | "descartada"
  | "substituida";

export interface Contato {
  id: string;
  phone: string;
  wa_name: string | null;
  display_name: string | null;
  company: string | null;
  photo_url: string | null;
  client_id: string | null;
  notes: string | null;
  blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface DadosExtraidos {
  nome?: string | null;
  empresa?: string | null;
  cidade?: string | null;
  data_prevista?: string | null;
  orcamento_estimado?: string | null;
  detalhes?: string | null;
  /** Sugestões comerciais da IA (funil). Só viram dado da oportunidade quando alguém aceita. */
  oportunidade?: OportunidadeIA | null;
}

export interface Atendimento {
  id: string;
  contact_id: string;
  status: StatusAtendimento;
  outcome: Outcome | null;
  assigned_to: string | null;
  quote_request_id: string | null;
  ai_kind: AiKind | null;
  ai_service: string | null;
  ai_urgency: AiUrgency | null;
  ai_summary: string | null;
  ai_extracted: DadosExtraidos;
  ai_analyzed_at: string | null;
  ai_analysis_due_at: string | null;
  ai_error: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  unread_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Mensagem {
  id: string;
  atendimento_id: string;
  contact_id: string;
  external_id: string | null;
  direction: "in" | "out";
  sent_by: "contato" | "celular" | "sistema";
  sent_by_user: string | null;
  kind: KindMensagem;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_name: string | null;
  transcript: string | null;
  sent_at: string;
  raw: unknown;
  created_at: string;
}

export interface Sugestao {
  id: string;
  atendimento_id: string;
  reply: string;
  rationale: string | null;
  status: StatusSugestao;
  final_text: string | null;
  decided_by: string | null;
  decided_at: string | null;
  message_id: string | null;
  model: string | null;
  created_at: string;
}

export interface MembroEquipe {
  user_id: string;
  role: "admin" | "commercial";
  active: boolean;
  email: string | null;
  created_at: string;
}

/** Atendimento com o contato e as sugestões pendentes embutidos (lista da fila). */
export interface AtendimentoDaFila extends Atendimento {
  contato: Contato;
  sugestoes_pendentes: { id: string }[];
  /** Etapa da oportunidade ligada (preenchida pela tela, não vem do banco). */
  etapa_funil?: EtapaFunil | null;
}

export interface StatusWhatsapp {
  connected: boolean | null;
  checked_at: string | null;
  state?: string | null;
  phone?: string | null;
  error?: string | null;
}

export type StatusOutbox = "queued" | "sending" | "sent" | "failed";

/** Fila de envio usada pela ponte local (Evolution API). */
export interface Outbox {
  id: string;
  atendimento_id: string;
  contact_id: string;
  phone: string;
  text: string;
  status: StatusOutbox;
  error: string | null;
  external_id: string | null;
  suggestion_id: string | null;
  created_by: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface QrWhatsapp {
  media_path: string | null;
  updated_at: string | null;
}

// ------------------------------------------------------ contexto para a IA

/** Escopo no banco: base da AR1 (global) ou de um contato. */
export type EscopoContextoBanco = "global" | "contact";
/** Escopo nas rotas e na interface. */
export type EscopoContexto = "global" | "contato";
export type KindContexto = "text" | "file";

/** Linha de public.ar1_context_docs. */
export interface DocContexto {
  id: string;
  scope: EscopoContextoBanco;
  contact_id: string | null;
  title: string;
  kind: KindContexto;
  content: string;
  content_truncated: boolean;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Documento na lista: sem o conteúdo inteiro, com tamanho e prévia. */
export interface DocContextoResumo extends Omit<DocContexto, "content"> {
  /** Quantidade de caracteres do texto guardado. */
  chars: number;
  /** Primeiros 200 caracteres do texto. */
  previa: string;
}

// ------------------------------------------------------------ funil de vendas

export type EtapaFunil =
  | "new"
  | "qualified"
  | "contacting"
  | "proposal"
  | "negotiating"
  | "won"
  | "lost";

export type OrigemOportunidade = "site" | "whatsapp" | "indicacao" | "outro";

/** Linha de public.ar1_quote_requests (a oportunidade do funil). */
export interface Oportunidade {
  id: string;
  name: string;
  phone: string;
  company: string;
  email: string | null;
  project_type: string;
  expected_date: string | null;
  message: string | null;
  source_path: string | null;
  status: EtapaFunil;
  internal_notes: string | null;
  assigned_to: string | null;
  client_id: string | null;
  contact_id: string | null;
  source: OrigemOportunidade;
  estimated_value: number | null;
  probability: number | null;
  next_action: string | null;
  next_action_at: string | null;
  lost_reason: string | null;
  ai_notes: string | null;
  stage_changed_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Sugestão comercial da IA, guardada em ar1_atendimentos.ai_extracted.oportunidade. */
export interface OportunidadeIA {
  etapa_sugerida: EtapaFunil | null;
  valor_estimado: number | null;
  probabilidade: number | null;
  proxima_acao: string | null;
  /** ISO 8601. */
  proxima_acao_em: string | null;
  motivo: string;
  /** Quando a IA fez esta leitura (ISO). */
  analisada_em?: string | null;
}

// ----------------------------------------------------------------- follow-ups

export type PrioridadeFollowup = "alta" | "media" | "baixa";
export type StatusFollowup = "pendente" | "enviado" | "adiado" | "descartado";

/** Linha de public.ar1_followups. */
export interface Followup {
  id: string;
  contact_id: string;
  atendimento_id: string | null;
  quote_request_id: string | null;
  reason: string;
  suggested_text: string;
  priority: PrioridadeFollowup;
  due_at: string;
  status: StatusFollowup;
  final_text: string | null;
  outbox_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------ propostas

/**
 * Linha de public.ar1_proposals. `kind = 'pdf'` é a proposta em PDF antiga
 * (content = Proposta); `kind = 'premium'` é a apresentação (content =
 * PropostaPremium, página pública, PDF opcional pelo Chrome).
 */
export interface PropostaRegistro {
  id: string;
  quote_request_id: string;
  contact_id: string | null;
  atendimento_id: string | null;
  /** AR1-AAAAMMDD-XXXX */
  number: string;
  title: string;
  /** O conteúdo aprovado (forma conforme `kind`). */
  content: Proposta | PropostaPremium;
  /** "Baseado em: …" */
  sources: string[];
  /** Soma dos itens com valor; null quando nenhum item tem valor. */
  total: number | null;
  /** Itens "a definir" / "sob consulta". */
  pending_items: number;
  /** AAAA-MM-DD */
  valid_until: string;
  /** Caminho do PDF no bucket ar1-context (null enquanto não há PDF). */
  file_path: string | null;
  file_size: number | null;
  pages: number | null;
  /** Modelo que montou o rascunho; null quando a proposta foi escrita sem IA. */
  model: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  sent_by: string | null;
  outbox_id: string | null;
  // Colunas da migração 20260930110000 (propostas premium). Ausentes antes dela.
  kind: "pdf" | "premium";
  status: StatusProposta;
  service: string | null;
  public_token: string | null;
  public_days: number;
  public_expires_at: string | null;
  views: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  decided_at: string | null;
  decided_by: string | null;
  unconfirmed_prices: boolean;
  pdf_engine: "chrome" | "pdf-lib" | null;
  pdf_error: string | null;
  updated_at: string;
  /**
   * Recados da IA e avisos do sistema para a equipe (nunca para o cliente).
   * Coluna internal_notes (jsonb), de uma migração posterior; null sem ela.
   */
  internal_notes: NotasInternas | null;
}

/** ar1_proposals.internal_notes: o que a equipe precisa conferir antes de enviar. */
export interface NotasInternas {
  pendencias: string[];
  avisos: string[];
  /** ISO */
  atualizado_em: string | null;
}
