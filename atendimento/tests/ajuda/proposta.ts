// Proposta de exemplo usada nos testes e na imagem de conferência do PDF.

import type { Proposta } from "@/lib/propostas/proposta";

export const PROPOSTA_EXEMPLO: Proposta = {
  titulo: "Podcast itinerante na feira de noivas",
  cliente: { nome: "Maria Souza", empresa: "Souza Eventos" },
  resumo_do_pedido:
    "A Souza Eventos quer um podcast itinerante durante a feira de noivas, nos dias 24 e 25 de outubro, no Centro " +
    "de Convenções de Goiânia. A gravação acontece no estande, com convidados da própria feira, e o conteúdo " +
    "será publicado nas redes da organização.",
  escopo: [
    {
      item: "Pré-produção",
      descricao: "Reunião de alinhamento, roteiro de pautas com a organização e visita técnica ao pavilhão.",
    },
    {
      item: "Gravação no evento",
      descricao: "Dois dias de gravação com três câmeras, iluminação, captação de áudio e direção no local.",
    },
    {
      item: "Pós-produção",
      descricao: "Edição, correção de cor, tratamento de áudio e cortes verticais para divulgação.",
    },
  ],
  entregas: [
    "Até 8 episódios editados em 4K",
    "3 cortes verticais por episódio",
    "Transmissão ao vivo opcional, a confirmar com a organização",
  ],
  cronograma: [
    { etapa: "Reunião de alinhamento", prazo: "até 10/10/2026" },
    { etapa: "Gravação na feira", prazo: "24 e 25/10/2026" },
    { etapa: "Entrega dos episódios", prazo: "a definir" },
  ],
  investimento: [
    { descricao: "Podcast itinerante: diária de gravação (2 dias)", valor: 5600 },
    { descricao: "Cortes verticais para redes sociais", valor: 1250.5 },
    { descricao: "Transmissão ao vivo", valor: null },
  ],
  condicoes: [
    "Pagamento de 50% na aprovação e 50% na entrega.",
    "Deslocamento em Goiânia incluído; fora da região metropolitana, orçado à parte.",
  ],
  validade_dias: 15,
  observacoes: "Confirmar com a organização a posição do estande e o horário de montagem.",
};
