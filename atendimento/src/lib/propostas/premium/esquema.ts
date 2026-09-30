// Esquemas (Zod) do que a IA devolve na proposta premium. Só o servidor e os
// testes importam. Sem limites no esquema (a saída estruturada estrita não
// aceita mínimo/máximo); os limites ficam em `conteudo.ts` e `investimento.ts`.

import { z } from "zod";

/** A proposta escrita pela IA. Os valores NÃO vêm daqui: só item e quantidade. */
export const esquemaPropostaPremium = z.object({
  titulo: z.string(),
  subtitulo: z.string(),
  capa: z.object({
    frase: z.string(),
    /** Nome de um arquivo da galeria. */
    imagem: z.string().nullable(),
  }),
  /** 2 a 3 parágrafos separados por linha em branco. */
  entendimento: z.string(),
  por_que_ar1: z.array(z.string()),
  solucao: z.array(
    z.object({
      titulo: z.string(),
      descricao: z.string(),
      imagem: z.string().nullable(),
    }),
  ),
  escopo_detalhado: z.array(
    z.object({
      item: z.string(),
      descricao: z.string(),
      quantidade: z.number().nullable(),
      unidade: z.string().nullable(),
    }),
  ),
  entregas: z.array(z.string()),
  cronograma: z.array(z.object({ etapa: z.string(), prazo: z.string() })),
  investimento: z.object({
    itens: z.array(
      z.object({
        descricao: z.string(),
        quantidade: z.number(),
        /** id de um item ATIVO da tabela de preços; null = sob consulta. */
        price_item_id: z.string().nullable(),
      }),
    ),
    condicoes_pagamento: z.string(),
  }),
  proximos_passos: z.array(z.string()),
  validade_dias: z.number().nullable(),
  observacoes: z.string().nullable(),
  /** Recados para a equipe (nunca vão para o cliente). */
  pendencias: z.array(z.string()),
});

export type PropostaPremiumDaIA = z.infer<typeof esquemaPropostaPremium>;

/** O formulário do pedido preenchido a partir da conversa do WhatsApp. */
export const esquemaPedidoDaConversa = z.object({
  servico: z.string(),
  servicos_adicionais: z.array(z.string()),
  descricao: z.string(),
  data_periodo: z.string(),
  local: z.string(),
  publico_objetivo: z.string(),
  quantidades: z.string(),
  observacoes: z.string(),
  cidade: z.string().nullable(),
  empresa: z.string().nullable(),
  email: z.string().nullable(),
});

export type PedidoDaIA = z.infer<typeof esquemaPedidoDaConversa>;
