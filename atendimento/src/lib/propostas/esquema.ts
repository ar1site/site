// Esquema (Zod) do rascunho que a IA devolve. Só o servidor e os testes importam.
// Sem limites no esquema (a saída estruturada estrita não aceita mínimo/máximo);
// os limites e a regra dos valores são aplicados em `rascunho.ts`.

import { z } from "zod";

export const esquemaRascunhoProposta = z.object({
  titulo: z.string(),
  cliente: z.object({
    nome: z.string(),
    empresa: z.string().nullable(),
  }),
  resumo_do_pedido: z.string(),
  escopo: z.array(z.object({ item: z.string(), descricao: z.string() })),
  entregas: z.array(z.string()),
  cronograma: z.array(z.object({ etapa: z.string(), prazo: z.string() })),
  investimento: z.array(
    z.object({
      descricao: z.string(),
      /** Em reais. null quando o valor não está escrito em lugar nenhum. */
      valor: z.number().nullable(),
      /** De onde o valor saiu: título do documento, "conversa" ou "oportunidade". */
      fonte_do_valor: z.string().nullable(),
    }),
  ),
  condicoes: z.array(z.string()),
  validade_dias: z.number().nullable(),
  /** Texto para o cliente ler no fim da proposta (ressalvas, o que não está incluído). */
  observacoes: z.string().nullable(),
  /** Recados para a equipe conferir antes de enviar. Nunca vão para o PDF. */
  pendencias: z.array(z.string()),
  /** Títulos dos documentos realmente usados (pode ser vazio). */
  fontes: z.array(z.string()),
});

export type RascunhoDaIA = z.infer<typeof esquemaRascunhoProposta>;
