// Conversa interna: a que o painel usa para mandar o resumo diário ao dono.
// Ela existe porque a fila de envio (ar1_wa_outbox) exige um atendimento.
// Fica fechada e marcada como "pessoal", para não aparecer na Fila, não entrar
// no funil e não virar retomada. Puro, testável.

import type { Atendimento } from "../tipos";

export const RESUMO_DA_CONVERSA_INTERNA = "Conversa interna do painel: resumo diário enviado ao dono.";
export const NOME_DO_CONTATO_INTERNO = "Resumo diário (dono)";
export const NOTAS_DO_CONTATO_INTERNO =
  "Recebe o resumo diário do painel. Contato criado pelo sistema; não é cliente.";

export type AtendimentoInterno = Pick<Atendimento, "status" | "ai_kind" | "ai_summary">;

/** Campos com que a conversa interna é criada. */
export const CAMPOS_DA_CONVERSA_INTERNA = {
  status: "fechado",
  outcome: "outro",
  ai_kind: "pessoal",
  ai_urgency: "baixa",
  ai_summary: RESUMO_DA_CONVERSA_INTERNA,
} as const;

export function ehConversaInterna(a: AtendimentoInterno | null | undefined): boolean {
  return Boolean(
    a &&
      a.status === "fechado" &&
      a.ai_kind === "pessoal" &&
      (a.ai_summary ?? "").startsWith("Conversa interna do painel"),
  );
}
