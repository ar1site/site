// Esquema (Zod) da leitura comercial da IA. Só o servidor e os testes importam.

import { z } from "zod";
import type { OportunidadeIABruta } from "./oportunidade";

/**
 * Esquema que a IA preenche. Sem limites numéricos no esquema (a saída
 * estruturada estrita não aceita mínimo/máximo); os limites são aplicados em
 * `normalizarOportunidadeIA`.
 */
export const esquemaOportunidadeIA = z.object({
  etapa_sugerida: z
    .enum(["new", "qualified", "contacting", "proposal", "negotiating", "won", "lost"])
    .nullable(),
  valor_estimado: z.number().nullable(),
  probabilidade: z.number().nullable(),
  proxima_acao: z.string().nullable(),
  proxima_acao_em: z.string().nullable(),
  motivo: z.string(),
}) satisfies z.ZodType<OportunidadeIABruta>;
