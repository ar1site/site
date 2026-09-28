// Tipos das tabelas do Supabase usadas pelo app (espelham as migrações).

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
