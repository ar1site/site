#!/usr/bin/env node
// Supabase de mentira, só para ver as telas com dados simulados.
//
// Sobe um servidor local que responde como o Supabase (login, tabelas) com
// dados inventados que ficam só na memória. Não fala com o banco real, não
// fala com a IA e não envia WhatsApp.
//
// Também responde como uma IA de mentira em /anthropic (texto fixo), para
// testar as retomadas, o rascunho da proposta e o resumo diário sem gastar
// nem sair da máquina:
//   AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=simulado
//   ANTHROPIC_BASE_URL=http://127.0.0.1:54999/anthropic
//
// E guarda arquivos na memória como o Storage (enviar, assinar e baixar), para
// o PDF da proposta poder ser gerado e baixado.
//
// Uso:
//   node scripts/simular-supabase.mjs [porta]        (padrão: 54999)
//
// Depois, numa cópia do projeto, compile e suba o painel apontando para ele:
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54999
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=simulado
//   SUPABASE_SERVICE_ROLE_KEY=simulado
//   WEBHOOK_SECRET=simulado
// e use scripts/capturar-telas.mjs para tirar as capturas.

import { createServer } from "node:http";
import { PRECOS_INICIAIS } from "./precos-iniciais.mjs";

const PORTA = Number(process.argv[2] || process.env.PORTA_SIMULADOR || 54999);
const AGORA = Date.now();
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const ha = (ms) => new Date(AGORA - ms).toISOString();
const em = (ms) => new Date(AGORA + ms).toISOString();

const id = (grupo, n) => `${grupo}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USUARIO = { id: id("a", 1), email: "alessandro@exemplo.com" };
const RUI = { id: id("a", 2), email: "rui@exemplo.com" };

// ------------------------------------------------------------------- dados

const contato = (n, nome, empresa, telefone, extra = {}) => ({
  id: id("c", n),
  phone: telefone,
  wa_name: nome,
  display_name: null,
  company: empresa,
  photo_url: null,
  client_id: null,
  notes: null,
  blocked: false,
  created_at: ha(40 * DIA),
  updated_at: ha(2 * DIA),
  ...extra,
});

const contatos = [
  contato(1, "Maria Souza", "Souza Eventos", "5562999110001"),
  contato(2, "João Pedro Alves", "Haras Boa Vista", "5562999110002"),
  contato(3, "Carla Mendes", "Clínica Vitta", "5562999110003"),
  contato(4, "Rafael Lima", "Lima Agro", "5564999110004"),
  contato(5, "Fernanda Rocha", "Rocha Imóveis", "5562999110005"),
  contato(6, "Bruno Tavares", null, "5561999110006"),
  contato(7, "Patrícia Gomes", "Instituto Crescer", "5562999110007"),
  contato(8, "Diego Martins", "DM Motors", "5562999110008"),
];

const oportunidade = (n, campos) => ({
  id: id("b", n),
  name: "",
  phone: "+55 (62) 99911-0000",
  company: "Não informada",
  email: null,
  project_type: "A definir",
  expected_date: null,
  message: null,
  source_path: "whatsapp",
  status: "new",
  internal_notes: null,
  assigned_to: USUARIO.id,
  client_id: null,
  contact_id: null,
  source: "whatsapp",
  estimated_value: null,
  probability: null,
  next_action: null,
  next_action_at: null,
  lost_reason: null,
  ai_notes: null,
  stage_changed_at: ha(2 * DIA),
  closed_at: null,
  created_at: ha(10 * DIA),
  updated_at: ha(1 * DIA),
  ...campos,
});

const oportunidades = [
  oportunidade(1, {
    name: "Maria Souza", company: "Souza Eventos", project_type: "Podcast itinerante em evento",
    status: "proposal", contact_id: id("c", 1), source: "whatsapp", estimated_value: 4800, probability: 60,
    next_action: "Enviar proposta revisada", next_action_at: em(2 * DIA), stage_changed_at: ha(3 * DIA),
    expected_date: "2026-10-24",
    message: "Quer um podcast itinerante na feira de noivas, dois dias de gravação.",
    internal_notes: "Indicou que o orçamento fecha com a diretoria na primeira semana de outubro.",
    ai_notes:
      "Leitura da IA em 29/09/2026 09:12.\nMaria confirmou as datas da feira e pediu a proposta com dois dias de gravação.\n" +
      "Sugestões: etapa Negociação; valor R$ 5.600; probabilidade 70%; próxima ação: ligar para alinhar o segundo dia até 01/10.\n" +
      "Motivo: Ela pediu para incluir o segundo dia, o que muda o valor da tabela de R$ 4.800 para R$ 5.600.",
  }),
  oportunidade(2, {
    name: "João Pedro Alves", company: "Haras Boa Vista", project_type: "Leilão 360",
    status: "negotiating", contact_id: id("c", 2), source: "indicacao", source_path: "painel",
    estimated_value: 18500, probability: 75, assigned_to: RUI.id,
    next_action: "Confirmar data do leilão", next_action_at: em(1 * DIA), stage_changed_at: ha(6 * DIA),
  }),
  oportunidade(3, {
    name: "Carla Mendes", company: "Clínica Vitta", project_type: "Conteúdo recorrente",
    status: "contacting", contact_id: id("c", 3), source: "site", source_path: "/contato",
    estimated_value: 3200, probability: null,
    next_action: "Entender quantos vídeos por mês", next_action_at: em(3 * DIA), stage_changed_at: ha(4 * DIA),
  }),
  oportunidade(4, {
    name: "Rafael Lima", company: "Lima Agro", project_type: "Filme de marca ou legado",
    status: "proposal", contact_id: id("c", 4), source: "whatsapp", estimated_value: 27000, probability: 50,
    next_action: "Cobrar retorno da proposta", next_action_at: ha(2 * DIA), stage_changed_at: ha(9 * DIA),
  }),
  oportunidade(5, {
    name: "Fernanda Rocha", company: "Rocha Imóveis", project_type: "Fotografia e vídeo",
    status: "qualified", contact_id: id("c", 5), source: "site", source_path: "/orcamento",
    estimated_value: 2400, probability: 30, assigned_to: RUI.id,
    next_action: "Marcar visita ao empreendimento", next_action_at: em(5 * DIA), stage_changed_at: ha(1 * DIA),
  }),
  oportunidade(6, {
    name: "Bruno Tavares", project_type: "Gravação de podcast (gravado ou ao vivo)",
    status: "new", contact_id: id("c", 6), source: "whatsapp", assigned_to: null,
    stage_changed_at: ha(5 * HORA), created_at: ha(5 * HORA),
  }),
  oportunidade(7, {
    name: "Patrícia Gomes", company: "Instituto Crescer", project_type: "Transmissão ao vivo",
    status: "new", contact_id: id("c", 7), source: "site", source_path: "/contato",
    estimated_value: 6500, probability: null, stage_changed_at: ha(1 * DIA),
    next_action: "Responder o formulário do site", next_action_at: ha(6 * HORA),
  }),
  oportunidade(8, {
    name: "Diego Martins", company: "DM Motors", project_type: "Shows, DVDs e clipes",
    status: "qualified", contact_id: id("c", 8), source: "indicacao", source_path: "painel",
    estimated_value: 12000, probability: 35,
    next_action: "Pedir o roteiro do evento", next_action_at: em(4 * DIA), stage_changed_at: ha(3 * DIA),
  }),
  oportunidade(9, {
    name: "Luciana Prado", company: "Prado Arquitetura", project_type: "Filme de marca ou legado",
    status: "contacting", source: "indicacao", source_path: "painel", estimated_value: 15000, probability: 45,
    assigned_to: RUI.id, next_action: "Enviar portfólio", next_action_at: em(1 * DIA), stage_changed_at: ha(2 * DIA),
  }),
  oportunidade(10, {
    name: "Marcos Vieira", company: "Vieira Leilões", project_type: "Leilão 360",
    status: "negotiating", source: "whatsapp", estimated_value: 22000, probability: 85,
    next_action: "Ajustar contrato", next_action_at: em(2 * DIA), stage_changed_at: ha(1 * DIA),
  }),
  oportunidade(11, {
    name: "Estúdio Aurora", company: "Estúdio Aurora", project_type: "Consultoria e implantação de estúdio",
    status: "won", source: "site", source_path: "/consultoria", estimated_value: 38000, probability: 100,
    stage_changed_at: ha(8 * DIA), closed_at: ha(8 * DIA),
  }),
  oportunidade(12, {
    name: "Tiago Nunes", company: "Nunes Contabilidade", project_type: "Gravação de podcast (gravado ou ao vivo)",
    status: "won", source: "whatsapp", estimated_value: 3600, probability: 100, assigned_to: RUI.id,
    stage_changed_at: ha(20 * HORA), closed_at: ha(20 * HORA),
  }),
  oportunidade(13, {
    name: "Colégio Horizonte", company: "Colégio Horizonte", project_type: "Transmissão ao vivo",
    status: "lost", source: "site", source_path: "/contato", estimated_value: 5400, probability: 40,
    lost_reason: "Fechou com fornecedor da própria cidade.", stage_changed_at: ha(12 * DIA), closed_at: ha(12 * DIA),
  }),
  oportunidade(14, {
    name: "Festival do Cerrado", company: "Cerrado Produções", project_type: "Shows, DVDs e clipes",
    status: "won", source: "indicacao", source_path: "painel", estimated_value: 52000, probability: 100,
    stage_changed_at: ha(75 * DIA), closed_at: ha(75 * DIA),
  }),
];

const atendimento = (n, campos) => ({
  id: id("d", n),
  contact_id: id("c", n),
  status: "em_atendimento",
  outcome: null,
  assigned_to: USUARIO.id,
  quote_request_id: null,
  ai_kind: "lead",
  ai_service: null,
  ai_urgency: "media",
  ai_summary: null,
  ai_extracted: {},
  ai_analyzed_at: ha(3 * HORA),
  ai_analysis_due_at: null,
  ai_error: null,
  last_message_at: ha(3 * HORA),
  last_inbound_at: ha(3 * HORA),
  last_outbound_at: ha(1 * DIA),
  unread_count: 0,
  closed_at: null,
  created_at: ha(10 * DIA),
  updated_at: ha(3 * HORA),
  ...campos,
});

const atendimentos = [
  atendimento(1, {
    quote_request_id: id("b", 1), status: "em_atendimento", ai_urgency: "alta", unread_count: 2,
    ai_service: "Podcast itinerante em evento",
    ai_summary:
      "Maria confirmou as datas da feira de noivas e pediu a proposta com dois dias de gravação. Aguarda o valor atualizado.",
    ai_extracted: {
      nome: "Maria Souza", empresa: "Souza Eventos", cidade: "Goiânia", data_prevista: "2026-10-24",
      orcamento_estimado: null, detalhes: "Dois dias de gravação na feira de noivas.",
      oportunidade: {
        etapa_sugerida: "negotiating", valor_estimado: 5600, probabilidade: 70,
        proxima_acao: "ligar para alinhar o segundo dia", proxima_acao_em: em(2 * DIA),
        motivo: "Ela pediu para incluir o segundo dia, o que muda o valor da tabela de R$ 4.800 para R$ 5.600.",
        analisada_em: ha(3 * HORA),
      },
    },
    last_message_at: ha(7 * HORA), last_inbound_at: ha(7 * HORA), last_outbound_at: ha(1 * DIA),
  }),
  atendimento(2, {
    quote_request_id: id("b", 2), status: "aguardando_cliente", assigned_to: RUI.id, ai_service: "Leilão 360",
    ai_summary: "João negocia o pacote do leilão de novembro; falta confirmar a data.",
    last_message_at: ha(1 * DIA), last_inbound_at: ha(2 * DIA), last_outbound_at: ha(1 * DIA),
  }),
  atendimento(3, {
    quote_request_id: id("b", 3), status: "aguardando_cliente", ai_service: "Conteúdo recorrente",
    ai_summary: "Carla quer vídeos mensais para a clínica; a AR1 perguntou a quantidade e ela não respondeu.",
    last_message_at: ha(3 * DIA), last_inbound_at: ha(4 * DIA), last_outbound_at: ha(3 * DIA),
  }),
  atendimento(4, {
    quote_request_id: id("b", 4), status: "aguardando_cliente", ai_service: "Filme de marca ou legado", ai_urgency: "alta",
    ai_summary: "Rafael recebeu a proposta do filme institucional e ficou de avaliar com os sócios.",
    last_message_at: ha(5 * DIA), last_inbound_at: ha(6 * DIA), last_outbound_at: ha(5 * DIA),
  }),
  atendimento(6, {
    status: "novo", assigned_to: null, ai_service: "Gravação de podcast (gravado ou ao vivo)", unread_count: 1,
    quote_request_id: id("b", 6),
    created_at: ha(5 * HORA),
    ai_summary: "Bruno perguntou como funciona a gravação de podcast no estúdio.",
    last_message_at: ha(5 * HORA), last_inbound_at: ha(5 * HORA), last_outbound_at: null,
  }),
];

const mensagem = (n, atendimentoN, direcao, texto, quando) => ({
  id: id("e", n),
  atendimento_id: id("d", atendimentoN),
  contact_id: id("c", atendimentoN),
  external_id: `sim-${n}`,
  direction: direcao,
  sent_by: direcao === "in" ? "contato" : "sistema",
  sent_by_user: direcao === "in" ? null : USUARIO.id,
  kind: "text",
  body: texto,
  media_url: null,
  media_mime: null,
  media_name: null,
  transcript: null,
  sent_at: quando,
  raw: null,
  created_at: quando,
});

const mensagens = [
  mensagem(1, 1, "in", "Oi! A feira vai ser nos dias 24 e 25 de outubro, no Centro de Convenções.", ha(2 * DIA)),
  mensagem(2, 1, "out", "Perfeito, Maria. Vou montar a proposta com a estrutura para o evento.", ha(1 * DIA)),
  mensagem(3, 1, "in", "Consegue incluir os dois dias de gravação? Quero o valor atualizado para levar à diretoria.", ha(7 * HORA)),
  mensagem(4, 3, "in", "Queremos começar a postar vídeos da clínica todo mês.", ha(4 * DIA)),
  mensagem(5, 3, "out", "Que bom, Carla! Quantos vídeos por mês vocês imaginam e para quais redes?", ha(3 * DIA)),
  mensagem(6, 4, "in", "Recebi a proposta, vou apresentar aos sócios na reunião de sexta.", ha(6 * DIA)),
  mensagem(7, 4, "out", "Combinado, Rafael. Fico à disposição se surgir alguma dúvida.", ha(5 * DIA)),
  mensagem(8, 6, "in", "Boa tarde, como funciona a gravação de podcast aí no estúdio?", ha(5 * HORA)),
  mensagem(9, 2, "in", "O leilão deve ser na segunda quinzena de novembro.", ha(2 * DIA)),
  mensagem(10, 2, "out", "Ótimo, João. Assim que fechar a data eu reservo a equipe.", ha(1 * DIA)),
];

const followup = (n, campos) => ({
  id: id("f", n),
  contact_id: id("c", n),
  atendimento_id: id("d", n),
  quote_request_id: null,
  reason: "",
  suggested_text: "",
  priority: "media",
  due_at: ha(2 * HORA),
  status: "pendente",
  final_text: null,
  outbox_id: null,
  decided_by: null,
  decided_at: null,
  model: "simulado",
  created_at: ha(2 * HORA),
  updated_at: ha(2 * HORA),
  ...campos,
});

const followups = [
  followup(1, {
    quote_request_id: id("b", 1), priority: "alta",
    reason:
      "Cliente aguardando resposta há 5 horas úteis. Maria pediu o valor com os dois dias de gravação para levar à diretoria.",
    suggested_text:
      "Oi, Maria! Desculpe a demora. Já estou ajustando a proposta com os dois dias de gravação na feira e a equipe confirma os detalhes com você ainda hoje. Equipe AR1 Films",
  }),
  followup(4, {
    quote_request_id: id("b", 4), priority: "alta",
    reason:
      "Próxima ação vencida há 2 dias: Cobrar retorno da proposta. Rafael ia apresentar o filme institucional aos sócios na sexta.",
    suggested_text:
      "Oi, Rafael, tudo bem? Como foi a conversa com os sócios sobre o filme da Lima Agro? Se quiserem ajustar algum ponto do escopo, é só me dizer. Equipe AR1 Films",
  }),
  followup(3, {
    quote_request_id: id("b", 3), priority: "media",
    reason: "Sem retorno do cliente há 3 dias. A conversa parou na pergunta sobre a quantidade de vídeos por mês.",
    suggested_text:
      "Oi, Carla! Passando para saber se vocês já têm uma ideia de quantos vídeos por mês gostariam para a clínica. Se preferir, posso sugerir um formato para começar. Equipe AR1 Films",
  }),
  followup(2, {
    quote_request_id: id("b", 2), priority: "media", status: "adiado", due_at: em(3 * DIA),
    decided_by: USUARIO.id, decided_at: ha(1 * DIA),
    reason: "Sem retorno do cliente há 2 dias.",
    suggested_text: "Oi, João! Conseguiu fechar a data do leilão? Equipe AR1 Films",
  }),
];

// Documentos da base de conhecimento (para o rascunho da proposta ter fontes).
const documento = (n, titulo, texto) => ({
  id: id("5", n), scope: "global", contact_id: null, title: titulo, kind: "text", content: texto,
  content_truncated: false, file_path: null, file_name: null, file_mime: null, file_size: null, active: true,
  created_by: USUARIO.id, created_at: ha(20 * DIA), updated_at: ha(20 * DIA),
});

const documentos = [
  documento(
    1,
    "Tabela de serviços 2026",
    "Podcast itinerante em evento: diária de gravação a R$ 2.800,00 (três câmeras, áudio e direção no local).\n" +
      "Cortes verticais para redes sociais: R$ 150,00 por corte.\n" +
      "Gravação de podcast em estúdio: R$ 900,00 por episódio.",
  ),
  documento(
    2,
    "Condições comerciais",
    "Pagamento: 50% na aprovação e 50% na entrega. Deslocamento em Goiânia incluído; fora da região " +
      "metropolitana, orçado à parte. Propostas valem por 15 dias.",
  ),
];

// Propostas já geradas (histórico da oportunidade 1).
const FUSO_BRASILIA = -3 * HORA;
const diaNumero = (ms) => new Date(AGORA - ms + FUSO_BRASILIA).toISOString().slice(0, 10).replace(/-/g, "");
const diaIso = (ms) => new Date(AGORA + ms + FUSO_BRASILIA).toISOString().slice(0, 10);

const conteudoDaProposta = (investimento) => ({
  titulo: "Podcast itinerante na feira de noivas",
  cliente: { nome: "Maria Souza", empresa: "Souza Eventos" },
  resumo_do_pedido:
    "A Souza Eventos quer um podcast itinerante durante a feira de noivas, nos dias 24 e 25 de outubro, no Centro " +
    "de Convenções de Goiânia.",
  escopo: [
    { item: "Pré-produção", descricao: "Reunião de alinhamento e roteiro de pautas com a organização." },
    { item: "Gravação no evento", descricao: "Gravação com três câmeras, áudio e direção no local." },
    { item: "Pós-produção", descricao: "Edição, correção de cor e cortes verticais para divulgação." },
  ],
  entregas: ["Episódios editados em 4K", "3 cortes verticais por episódio"],
  cronograma: [
    { etapa: "Gravação na feira", prazo: "24 e 25/10/2026" },
    { etapa: "Entrega dos episódios", prazo: "a definir" },
  ],
  investimento,
  condicoes: ["Pagamento: 50% na aprovação e 50% na entrega."],
  validade_dias: 15,
  observacoes: null,
});

const proposta = (n, campos) => ({
  id: id("8", n),
  quote_request_id: id("b", 1),
  contact_id: id("c", 1),
  atendimento_id: id("d", 1),
  title: "Podcast itinerante na feira de noivas",
  sources: ["Tabela de serviços 2026", "Conversa do WhatsApp", "Dados da oportunidade"],
  pending_items: 0,
  file_size: 401200,
  pages: 2,
  model: "simulado",
  created_by: USUARIO.id,
  sent_at: null,
  sent_by: null,
  outbox_id: null,
  ...campos,
});

const propostas = [
  proposta(1, {
    number: `AR1-${diaNumero(3 * DIA)}-0002`,
    content: conteudoDaProposta([
      { descricao: "Podcast itinerante: diária de gravação (1 dia)", valor: 2800 },
      { descricao: "Cortes verticais", valor: 2000 },
    ]),
    total: 4800,
    valid_until: diaIso(12 * DIA),
    file_path: `propostas/${id("b", 1)}/AR1-${diaNumero(3 * DIA)}-0002.pdf`,
    created_at: ha(3 * DIA),
    sent_at: ha(3 * DIA - HORA),
    sent_by: USUARIO.id,
  }),
  proposta(2, {
    number: `AR1-${diaNumero(1 * DIA)}-0001`,
    content: conteudoDaProposta([
      { descricao: "Podcast itinerante: diária de gravação (2 dias)", valor: 5600 },
      { descricao: "Transmissão ao vivo", valor: null },
    ]),
    total: 5600,
    pending_items: 1,
    valid_until: diaIso(14 * DIA),
    file_path: `propostas/${id("b", 1)}/AR1-${diaNumero(1 * DIA)}-0001.pdf`,
    created_by: RUI.id,
    created_at: ha(1 * DIA),
  }),
];

// Colunas da migração premium nas propostas em PDF antigas.
for (const p of propostas) {
  Object.assign(p, {
    kind: "pdf", status: p.sent_at ? "enviada" : "gerada", service: "Podcast itinerante", public_token: null,
    public_days: 30, public_expires_at: null, views: 0, first_viewed_at: null, last_viewed_at: null,
    accepted_at: null, accepted_name: null, decided_at: null, decided_by: null, unconfirmed_prices: false,
    pdf_engine: "pdf-lib", pdf_error: null, updated_at: p.created_at,
  });
}

// Tabela de preços: a mesma da migração (valores sugeridos). Alguns itens já
// confirmados pela equipe, para a tela mostrar os dois selos.
const idDoPreco = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CONFIRMADOS = new Set([1, 3, 6, 7, 8, 12].map(idDoPreco));
const itensDePreco = PRECOS_INICIAIS.map((i) => ({
  ...i,
  confirmed: CONFIRMADOS.has(i.id),
  updated_by: CONFIRMADOS.has(i.id) ? USUARIO.id : null,
  created_at: ha(20 * DIA),
  updated_at: CONFIRMADOS.has(i.id) ? ha(2 * DIA) : ha(20 * DIA),
}));
const precoDe = (n) => itensDePreco.find((i) => i.id === idDoPreco(n));

/** Investimento como o servidor grava: valores da tabela, desconto limitado ao subtotal. */
function investimentoSimulado(linhas, desconto = null, condicoes = "") {
  const itens = linhas.map(([n, quantidade, descricao]) => {
    const item = n ? precoDe(n) : null;
    return item
      ? {
          descricao: descricao ?? item.name, quantidade, unidade: item.unit, valor_unitario: item.price,
          valor_total: Math.round(item.price * quantidade * 100) / 100, price_item_id: item.id, nao_confirmado: !item.confirmed,
        }
      : { descricao, quantidade, unidade: "por projeto", valor_unitario: null, valor_total: null, price_item_id: null, nao_confirmado: false };
  });
  const subtotal = itens.reduce((soma, i) => soma + (i.valor_total ?? 0), 0);
  const d = desconto ? Math.min(desconto, subtotal) : null;
  return {
    itens, subtotal, desconto: d, total: subtotal - (d ?? 0), condicoes_pagamento: condicoes,
    sob_consulta: itens.filter((i) => i.price_item_id === null).length,
  };
}

const ORDEM = ["capa", "entendimento", "por_que_ar1", "solucao", "escopo", "entregas", "cronograma", "investimento", "proximos_passos", "observacoes"];

function conteudoPremium(campos) {
  return {
    versao: 2, subtitulo: "", logo_cliente: null, observacoes: null, validade_dias: 30, ordem_secoes: ORDEM,
    por_que_ar1: [
      "Experiência de estrada: mais de 4 mil episódios gravados e transmitidos com equipe própria.",
      "Estrutura completa: estúdio em Goiânia, estúdio itinerante e o Haras SOBI com mais de 20 cenários.",
      "Conteúdo que continua trabalhando: cortes, melhores momentos e acervo pensados desde a pauta.",
    ],
    ...campos,
  };
}

/** Token fixo de 43 caracteres (como o do servidor), para abrir /p/<token> no simulador. */
const tokenSimulado = (letra) => letra.repeat(8) + "Simulado_" + "x".repeat(26);

const numeroDoDia = (ms, seq) => "AR1-" + diaNumero(ms) + "-" + String(seq).padStart(4, "0");

const propostasPremium = [
  proposta(3, {
    quote_request_id: id("b", 1), contact_id: id("c", 1), atendimento_id: id("d", 1),
    number: numeroDoDia(6 * HORA, 3), title: "Podcast itinerante na Feira de Noivas",
    sources: [], file_path: null, file_size: null, pages: null, created_at: ha(6 * HORA),
    kind: "premium", status: "enviada", service: "Podcast itinerante", total: 11800, pending_items: 1,
    sent_at: ha(5 * HORA), sent_by: USUARIO.id, valid_until: diaIso(30 * DIA - 6 * HORA),
    public_token: tokenSimulado("A"), public_days: 30, public_expires_at: em(30 * DIA - 6 * HORA),
    views: 3, first_viewed_at: ha(4 * HORA), last_viewed_at: ha(40 * 60 * 1000),
    accepted_at: null, accepted_name: null, decided_at: null, decided_by: null,
    unconfirmed_prices: false, pdf_engine: null, pdf_error: null, updated_at: ha(5 * HORA), model: "simulado",
    content: conteudoPremium({
      titulo: "Podcast itinerante na Feira de Noivas",
      subtitulo: "Souza Eventos · dois dias de conversas gravadas dentro do pavilhão",
      cliente: { nome: "Maria Souza", empresa: "Souza Eventos" },
      capa: { frase: "Cada conversa na feira vira conteúdo para o ano inteiro.", imagem: { origem: "galeria", arquivo: "haras-lounge-coberto-2026-v1.webp" } },
      entendimento:
        "A Souza Eventos quer gravar um podcast dentro da Feira de Noivas, nos dias 24 e 25 de outubro, no Centro de Convenções de Goiânia.\n\n" +
        "O objetivo é transformar expositores e noivas em conteúdo: conversas curtas, com cara de programa, que alimentam as redes da feira antes, durante e depois do evento.",
      solucao: [
        { titulo: "Estúdio dentro da feira", descricao: "Montamos o estúdio itinerante com cenário da feira, três câmeras, luz e áudio profissional.", imagem: { origem: "galeria", arquivo: "podcast-entrevista-v1.webp" } },
        { titulo: "Fila de convidados organizada", descricao: "A produção combina com a organização a agenda de expositores e convidados, sem atrasar a programação.", imagem: { origem: "galeria", arquivo: "evento-palco-camera.webp" } },
        { titulo: "Edição para as redes", descricao: "Cada conversa sai editada, com abertura e identidade, pronta para publicar.", imagem: { origem: "galeria", arquivo: "edit-suite.webp" } },
      ],
      escopo_detalhado: [
        { item: "Estúdio itinerante", descricao: "Cenário, luz, áudio e três câmeras com operação.", quantidade: 2, unidade: "dias" },
        { item: "Montagem e desmontagem", descricao: "Transporte, montagem na véspera e desmontagem ao final.", quantidade: 1, unidade: "evento" },
        { item: "Edição dos episódios", descricao: "Edição completa com correção de cor e tratamento de áudio.", quantidade: 12, unidade: "episódios" },
      ],
      entregas: ["12 episódios editados em 4K", "Versões para YouTube e Instagram", "Arquivos brutos das gravações"],
      cronograma: [
        { etapa: "Alinhamento de pautas com a organização", prazo: "até 17/10" },
        { etapa: "Montagem do estúdio", prazo: "23/10" },
        { etapa: "Gravação na feira", prazo: "24 e 25/10" },
        { etapa: "Entrega dos episódios", prazo: "até 10 dias úteis após a feira" },
      ],
      investimento: investimentoSimulado(
        [[6, 2], [7, 1], [8, 12], [null, 1, "Transmissão ao vivo do palco principal"]],
        1000,
        "50% na aprovação e 50% na entrega.",
      ),
      proximos_passos: ["Aprovar a proposta", "Alinhar a lista de convidados", "Assinar o contrato e pagar o sinal"],
      observacoes: "A transmissão ao vivo depende da internet disponível no pavilhão.",
    }),
  }),
  proposta(4, {
    quote_request_id: id("b", 2), contact_id: id("c", 2), atendimento_id: id("d", 2),
    number: numeroDoDia(2 * DIA, 1), title: "Leilão 360 do Haras Boa Vista",
    sources: [], file_path: "propostas/" + id("b", 2) + "/" + numeroDoDia(2 * DIA, 1) + ".pdf", file_size: 2310000, pages: 11,
    created_at: ha(2 * DIA), created_by: RUI.id,
    kind: "premium", status: "aceita", service: "Leilão 360", total: 21500, pending_items: 0,
    sent_at: ha(2 * DIA - HORA), sent_by: RUI.id, valid_until: diaIso(28 * DIA),
    public_token: tokenSimulado("B"), public_days: 30, public_expires_at: em(28 * DIA),
    views: 5, first_viewed_at: ha(2 * DIA - 2 * HORA), last_viewed_at: ha(3 * HORA),
    accepted_at: ha(3 * HORA), accepted_name: "João Pedro Alves", decided_at: null, decided_by: null,
    unconfirmed_prices: false, pdf_engine: "chrome", pdf_error: null, updated_at: ha(3 * HORA), model: "simulado",
    content: conteudoPremium({
      titulo: "Leilão 360 do Haras Boa Vista",
      subtitulo: "Antes, durante e depois do leilão de novembro",
      cliente: { nome: "João Pedro Alves", empresa: "Haras Boa Vista" },
      capa: { frase: "O leilão começa antes do primeiro lote.", imagem: { origem: "galeria", arquivo: "camera-auction.webp" } },
      entendimento: "O Haras Boa Vista fará o leilão anual na segunda quinzena de novembro e quer aquecer os compradores com conteúdo dos lotes.",
      solucao: [
        { titulo: "Aquecimento dos lotes", descricao: "Diária de captação na fazenda para gravar os lotes e os bastidores.", imagem: { origem: "galeria", arquivo: "cattle-rays.webp" } },
        { titulo: "Transmissão com direção", descricao: "Multicâmera com direção de corte ao vivo durante todo o leilão.", imagem: { origem: "galeria", arquivo: "producao-campo-equipe.webp" } },
      ],
      escopo_detalhado: [],
      entregas: ["Vídeos dos lotes", "Transmissão completa gravada", "Melhores momentos"],
      cronograma: [{ etapa: "Captação dos lotes", prazo: "início de novembro" }, { etapa: "Leilão", prazo: "a definir" }],
      investimento: investimentoSimulado([[12, 1], [13, 1]], null, "30% na assinatura e 70% até o dia do leilão."),
      proximos_passos: ["Confirmar a data do leilão", "Assinar o contrato"],
    }),
  }),
  proposta(5, {
    quote_request_id: id("b", 3), contact_id: id("c", 3), atendimento_id: id("d", 3),
    number: numeroDoDia(3 * HORA, 4), title: "Conteúdo mensal da Clínica Vitta",
    sources: [], file_path: null, file_size: null, pages: null, created_at: ha(3 * HORA),
    kind: "premium", status: "gerada", service: "Conteúdo recorrente", total: 16500, pending_items: 0,
    sent_at: null, sent_by: null, valid_until: diaIso(30 * DIA - 3 * HORA),
    public_token: tokenSimulado("C"), public_days: 30, public_expires_at: em(30 * DIA - 3 * HORA),
    views: 0, first_viewed_at: null, last_viewed_at: null,
    accepted_at: null, accepted_name: null, decided_at: null, decided_by: null,
    unconfirmed_prices: true, pdf_engine: null, pdf_error: null, updated_at: ha(3 * HORA), model: "simulado",
    internal_notes: {
      pendencias: ["Confirmar com a Carla quantos vídeos por mês e para quais redes."],
      avisos: ["Esta proposta usa valores não confirmados da tabela de preços. Confirme os itens em Ajustes → Tabela de preços antes de enviar."],
      atualizado_em: ha(3 * HORA),
    },
    content: conteudoPremium({
      titulo: "Conteúdo mensal da Clínica Vitta",
      subtitulo: "Vídeos e cortes todo mês, com método e cadência",
      cliente: { nome: "Carla Mendes", empresa: "Clínica Vitta" },
      capa: { frase: "Conhecimento de quem cuida, em vídeo, todo mês.", imagem: { origem: "galeria", arquivo: "consultoria-hero-estudio-v1.webp" } },
      entendimento: "A Clínica Vitta quer começar a publicar vídeos todos os meses, com a equipe médica explicando temas de saúde.",
      solucao: [{ titulo: "Plano editorial", descricao: "Diagnóstico, calendário e uma diária de captação por mês.", imagem: null }],
      escopo_detalhado: [],
      entregas: ["4 vídeos por mês", "8 cortes verticais"],
      cronograma: [{ etapa: "Diagnóstico editorial", prazo: "primeira semana" }],
      investimento: investimentoSimulado([[23, 3, "Plano mensal de conteúdo (3 meses)"]]),
      proximos_passos: ["Aprovar o plano", "Agendar a primeira diária"],
    }),
  }),
];
propostas.push(...propostasPremium);

/** Arquivos guardados na memória: "bucket/caminho" -> { bytes, tipo }. */
const arquivos = new Map();

const tabelas = {
  ar1_staff: [
    { user_id: USUARIO.id, role: "admin", active: true, created_at: ha(60 * DIA) },
    { user_id: RUI.id, role: "admin", active: true, created_at: ha(60 * DIA) },
  ],
  ar1_wa_contacts: contatos,
  ar1_quote_requests: oportunidades,
  ar1_atendimentos: atendimentos,
  ar1_wa_messages: mensagens,
  ar1_followups: followups,
  ar1_ai_suggestions: [
    {
      id: id("9", 1), atendimento_id: id("d", 1), status: "pendente", final_text: null, decided_by: null,
      decided_at: null, message_id: null, model: "simulado", created_at: ha(3 * HORA),
      reply:
        "Oi, Maria! Consigo sim. Vou atualizar a proposta com os dois dias de gravação e a equipe confirma o valor com você. Equipe AR1 Films",
      rationale: "Ela pediu o valor com os dois dias; as instruções não permitem passar preço.\nFontes: Tabela de serviços 2026",
    },
  ],
  ar1_wa_outbox: [],
  ar1_context_docs: documentos,
  ar1_proposals: propostas,
  ar1_price_items: itensDePreco,
  ar1_settings: [
    { key: "atendimento.instrucoes", value: "Tom direto e cordial. Não prometa preço nem data. Assine como Equipe AR1 Films." },
    {
      key: "atendimento.servicos",
      value: [
        "Gravação de podcast (gravado ou ao vivo)", "Podcast itinerante em evento", "Transmissão ao vivo", "Leilão 360",
        "Filme de marca ou legado", "Shows, DVDs e clipes", "Fotografia e vídeo", "Consultoria e implantação de estúdio",
        "Conteúdo recorrente", "Outro",
      ],
    },
    { key: "whatsapp.status", value: { connected: true, checked_at: ha(2 * 60 * 1000), state: "open", phone: "556298354354" } },
    { key: "followup.dias_sem_retorno", value: 2 },
    { key: "resumo.ativo", value: true },
    { key: "resumo.destinatarios", value: ["556281069562"] },
    {
      key: "resumo.ultimo_envio",
      value: { dia: diaIso(-1 * DIA), enviado_em: ha(1 * DIA), destinatarios: ["556281069562"], origem: "cron" },
    },
  ],
};

// ---------------------------------------------------------- IA de mentira

const RESPOSTA_RETOMADA = {
  texto: "Oi! Passando para retomar a nossa conversa. Posso ajudar em mais alguma coisa? Equipe AR1 Films",
  motivo: "Resposta fixa do simulador.",
  prioridade: "media",
};

// Um valor está na tabela (R$ 2.800), um foi "inventado" (R$ 3.500, que não
// está escrito em lugar nenhum) e um veio nulo: serve para ver a regra dos
// valores funcionando na tela.
const RESPOSTA_PROPOSTA = {
  titulo: "Podcast itinerante na feira de noivas",
  cliente: { nome: "Maria Souza", empresa: "Souza Eventos" },
  resumo_do_pedido:
    "A Souza Eventos quer um podcast itinerante durante a feira de noivas, nos dias 24 e 25 de outubro, no Centro " +
    "de Convenções. A cliente pediu o valor com os dois dias de gravação para levar à diretoria.",
  escopo: [
    { item: "Pré-produção", descricao: "Reunião de alinhamento e roteiro de pautas com a organização da feira." },
    { item: "Gravação no evento", descricao: "Dois dias de gravação com três câmeras, áudio e direção no local." },
    { item: "Pós-produção", descricao: "Edição dos episódios e cortes verticais para divulgação." },
  ],
  entregas: ["Episódios editados", "Cortes verticais para redes sociais"],
  cronograma: [
    { etapa: "Gravação na feira", prazo: "24 e 25 de outubro" },
    { etapa: "Entrega dos episódios", prazo: "a definir" },
  ],
  investimento: [
    {
      descricao: "Podcast itinerante: diária de gravação (valor por dia)",
      valor: 2800,
      fonte_do_valor: "Tabela de serviços 2026",
    },
    { descricao: "Transmissão ao vivo do evento", valor: 3500, fonte_do_valor: "conversa" },
    { descricao: "Cortes verticais (quantidade a combinar)", valor: null, fonte_do_valor: null },
  ],
  condicoes: [
    "Pagamento: 50% na aprovação e 50% na entrega.",
    "Deslocamento em Goiânia incluído; fora da região metropolitana, orçado à parte.",
  ],
  validade_dias: 15,
  observacoes: "A transmissão ao vivo depende da internet disponível no pavilhão.",
  pendencias: [
    "Confirmar com a cliente quantos episódios serão gravados por dia.",
    "Confirmar o horário de montagem no pavilhão.",
  ],
  fontes: ["Tabela de serviços 2026", "Condições comerciais"],
};

function textoDoPedido(pedido) {
  return (pedido?.messages ?? [])
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join("\n");
}

/** Resumo escrito com os números que vieram no próprio pedido. */
function respostaDoResumo(pedido) {
  let n = {};
  try {
    n = JSON.parse(/<numeros>([\s\S]*?)<\/numeros>/.exec(textoDoPedido(pedido))?.[1] ?? "{}");
  } catch {
    // pedido fora do formato: segue com zeros
  }
  const dia = String(n.dia ?? "").split("-").reverse().slice(0, 2).join("/");
  const espera = n.quem_espera_ha_mais_tempo?.[0];
  return {
    texto: [
      `*Resumo AR1 · ${dia}*`,
      `• Conversas novas nas últimas 24 h: ${n.conversas_novas_24h ?? 0}. Clientes aguardando resposta: ${n.clientes_aguardando_resposta ?? 0}.`,
      `• Retomadas pendentes na tela Retomar: ${n.retomadas_pendentes ?? 0}.`,
      `• Funil: ${n.funil?.oportunidades_abertas ?? 0} oportunidades abertas, ${n.funil?.total_em_aberto ?? "R$ 0"} em aberto e previsão de ${n.funil?.previsao_ponderada ?? "R$ 0"}.`,
      `• Próximas ações vencidas: ${n.proximas_acoes?.vencidas ?? 0}. Para hoje: ${n.proximas_acoes?.vencem_hoje ?? 0}.`,
      `• Últimas 24 h: ganhos ${n.ultimas_24h?.ganhos ?? 0} (${n.ultimas_24h?.valor_ganho ?? "R$ 0"}), perdidos ${n.ultimas_24h?.perdidos ?? 0}.`,
      espera
        ? `Comece por responder ${espera.nome}, que espera há ${espera.horas} h.`
        : "Comece por revisar as próximas ações do funil.",
    ].join("\n"),
  };
}

// Proposta premium: escolhe itens da tabela por id (o servidor recalcula os
// valores) e "esquece" um valor em reais nas condições, para ver o código
// tirando o trecho e avisando a equipe.
const RESPOSTA_PREMIUM = {
  titulo: "Podcast itinerante na Feira de Noivas",
  subtitulo: "Souza Eventos · dois dias de conversas gravadas dentro do pavilhão",
  capa: { frase: "Cada conversa na feira vira conteúdo para o ano inteiro.", imagem: "haras-lounge-coberto-2026-v1.webp" },
  entendimento:
    "A Souza Eventos quer gravar um podcast dentro da Feira de Noivas, nos dias 24 e 25 de outubro, no Centro de Convenções de Goiânia.\n\n" +
    "O objetivo é transformar expositores e noivas em conteúdo para as redes da feira antes, durante e depois do evento.",
  por_que_ar1: [
    "Experiência de estrada: mais de 4 mil episódios gravados e transmitidos com equipe própria.",
    "Estrutura completa: estúdio itinerante montado dentro do evento, com cenário e três câmeras.",
    "Conteúdo que continua trabalhando: cada conversa sai pronta para as redes.",
  ],
  solucao: [
    { titulo: "Estúdio dentro da feira", descricao: "Montamos o estúdio itinerante com cenário da feira, três câmeras, luz e áudio profissional.", imagem: "podcast-entrevista-v1.webp" },
    { titulo: "Fila de convidados organizada", descricao: "A produção combina a agenda de expositores com a organização.", imagem: null },
    { titulo: "Edição para as redes", descricao: "Cada conversa sai editada, com abertura e identidade.", imagem: "edit-suite.webp" },
  ],
  escopo_detalhado: [
    { item: "Estúdio itinerante", descricao: "Cenário, luz, áudio e três câmeras com operação.", quantidade: 2, unidade: "dias" },
    { item: "Edição dos episódios", descricao: "Edição completa com correção de cor.", quantidade: 12, unidade: "episódios" },
  ],
  entregas: ["12 episódios editados em 4K", "Versões para YouTube e Instagram"],
  cronograma: [
    { etapa: "Montagem do estúdio", prazo: "23/10" },
    { etapa: "Gravação na feira", prazo: "24 e 25/10" },
  ],
  investimento: {
    itens: [
      { descricao: "Diária do estúdio itinerante", quantidade: 2, price_item_id: "10000000-0000-4000-8000-000000000006" },
      { descricao: "Montagem e desmontagem", quantidade: 1, price_item_id: "10000000-0000-4000-8000-000000000007" },
      { descricao: "Edição de episódio gravado no evento", quantidade: 12, price_item_id: "10000000-0000-4000-8000-000000000008" },
      { descricao: "Transmissão ao vivo do palco principal", quantidade: 1, price_item_id: null },
    ],
    condicoes_pagamento: "50% na aprovação e 50% na entrega. Sinal de R$ 2.000 para reservar a data.",
  },
  proximos_passos: ["Aprovar a proposta", "Alinhar a lista de convidados", "Assinar o contrato"],
  validade_dias: null,
  observacoes: "A transmissão ao vivo depende da internet disponível no pavilhão.",
  pendencias: ["Confirmar quantos episódios serão gravados por dia."],
};

const RESPOSTA_PEDIDO = {
  servico: "Podcast itinerante",
  servicos_adicionais: ["Transmissão ao vivo"],
  descricao: "Podcast itinerante durante a Feira de Noivas, com dois dias de gravação e o valor atualizado para a diretoria.",
  data_periodo: "24 e 25 de outubro",
  local: "Centro de Convenções de Goiânia",
  publico_objetivo: "Noivas e expositores da feira",
  quantidades: "2 dias de gravação",
  observacoes: "A cliente leva a proposta para a diretoria na primeira semana de outubro.",
  cidade: "Goiânia",
  empresa: "Souza Eventos",
  email: null,
};

function respostaDaIA(pedido) {
  const texto = JSON.stringify(pedido ?? {});
  if (texto.includes("PROPOSTA PREMIUM DA AR1")) return RESPOSTA_PREMIUM;
  if (texto.includes("PREENCHER O PEDIDO A PARTIR DA CONVERSA")) return RESPOSTA_PEDIDO;
  if (texto.includes("motivo_da_retomada")) return RESPOSTA_RETOMADA;
  if (texto.includes("REGRA DOS VALORES")) return RESPOSTA_PROPOSTA;
  if (texto.includes("<numeros>")) return respostaDoResumo(pedido);
  return null;
}

// --------------------------------------------------------------- PostgREST

function comparar(valor, operador, alvo) {
  const texto = valor === null || valor === undefined ? null : String(valor);
  switch (operador) {
    case "eq": return texto === alvo;
    case "neq": return texto !== alvo;
    case "lt": return texto !== null && texto < alvo;
    case "lte": return texto !== null && texto <= alvo;
    case "gt": return texto !== null && texto > alvo;
    case "gte": return texto !== null && texto >= alvo;
    case "is": return alvo === "null" ? texto === null : texto === alvo;
    case "in":
      return alvo.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, "")).includes(texto ?? "");
    case "like":
    case "ilike": {
      const padrao = alvo.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*");
      return texto !== null && new RegExp(`^${padrao}$`, operador === "ilike" ? "i" : "").test(texto);
    }
    default: return true;
  }
}

function filtrar(linhas, parametros) {
  let resultado = linhas;
  for (const [chave, bruto] of parametros) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns", "or", "and"].includes(chave)) continue;
    if (chave.includes(".")) continue; // filtro de tabela embutida
    let expressao = bruto;
    let negar = false;
    if (expressao.startsWith("not.")) {
      negar = true;
      expressao = expressao.slice(4);
    }
    const ponto = expressao.indexOf(".");
    const operador = expressao.slice(0, ponto);
    const alvo = expressao.slice(ponto + 1);
    // "value->>dia": campo de dentro de um JSON.
    const [coluna, campo] = chave.split("->>");
    const ler = (l) => (campo ? l[coluna]?.[campo] : l[coluna]);
    resultado = resultado.filter((l) => comparar(ler(l), operador, alvo) !== negar);
  }
  const ordem = parametros.get("order");
  if (ordem) {
    const [coluna, sentido] = ordem.split(",")[0].split(".");
    resultado = [...resultado].sort((a, b) => {
      const x = a[coluna] ?? "";
      const y = b[coluna] ?? "";
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sentido === "desc" ? -c : c;
    });
  }
  const limite = Number(parametros.get("limit"));
  if (Number.isFinite(limite) && limite > 0) resultado = resultado.slice(0, limite);
  return resultado;
}

function embutir(tabela, linhas, select) {
  if (tabela !== "ar1_atendimentos" || !select) return linhas;
  return linhas.map((l) => {
    const copia = { ...l };
    if (select.includes("contato:ar1_wa_contacts")) {
      copia.contato = contatos.find((c) => c.id === l.contact_id) ?? null;
    }
    if (select.includes("sugestoes_pendentes:ar1_ai_suggestions")) {
      copia.sugestoes_pendentes = tabelas.ar1_ai_suggestions
        .filter((s) => s.atendimento_id === l.id && s.status === "pendente")
        .map((s) => ({ id: s.id }));
    }
    return copia;
  });
}

// -------------------------------------------------------------------- HTTP

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Range, Range",
  "Access-Control-Max-Age": "600",
};

function responder(res, status, corpo, cabecalhos = {}) {
  const texto = corpo === undefined ? "" : JSON.stringify(corpo);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS, ...cabecalhos });
  res.end(texto);
}

async function lerBytes(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

async function lerCorpo(req) {
  const texto = (await lerBytes(req)).toString("utf8");
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function usuarioCompleto() {
  return {
    id: USUARIO.id,
    aud: "authenticated",
    role: "authenticated",
    email: USUARIO.email,
    email_confirmed_at: ha(60 * DIA),
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: ha(60 * DIA),
    updated_at: ha(1 * DIA),
  };
}

function base64url(objeto) {
  return Buffer.from(JSON.stringify(objeto)).toString("base64url");
}

/** Sessão de mentira (o token não é assinado de verdade: só o simulador aceita). */
function sessaoSimulada() {
  const expira = Math.floor(AGORA / 1000) + 24 * 3600;
  const token = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ sub: USUARIO.id, email: USUARIO.email, role: "authenticated", aud: "authenticated", exp: expira }),
    "assinatura-simulada",
  ].join(".");
  return {
    access_token: token,
    refresh_token: "renovacao-simulada",
    token_type: "bearer",
    expires_in: 24 * 3600,
    expires_at: expira,
    user: usuarioCompleto(),
  };
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
  const caminho = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // Login ---------------------------------------------------------------
  if (caminho === "/auth/v1/user") return responder(res, 200, usuarioCompleto());
  if (caminho === "/auth/v1/token") return responder(res, 200, sessaoSimulada());
  if (caminho === "/auth/v1/logout") return responder(res, 204);
  if (caminho === "/auth/v1/admin/users") {
    return responder(res, 200, {
      users: [usuarioCompleto(), { ...usuarioCompleto(), id: RUI.id, email: RUI.email }],
      aud: "authenticated",
    });
  }

  // IA de mentira (formato da API de mensagens da Anthropic) ---------------
  if (caminho === "/anthropic/v1/messages" && req.method === "POST") {
    const pedido = await lerCorpo(req);
    const resposta = respostaDaIA(pedido);
    return responder(res, resposta ? 200 : 400, resposta
      ? {
          id: "msg_simulada",
          type: "message",
          role: "assistant",
          model: pedido?.model ?? "simulado",
          content: [{ type: "text", text: JSON.stringify(resposta) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }
      : {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "O simulador só responde pedidos de retomada, de proposta (simples e premium), de pedido e de resumo diário.",
          },
        });
  }

  // Arquivos (Storage) ----------------------------------------------------
  const assinar = /^\/storage\/v1\/object\/sign\/(.+)$/.exec(caminho);
  if (assinar) {
    if (req.method === "POST") {
      await lerBytes(req);
      return responder(res, 200, { signedURL: `/object/sign/${assinar[1]}?token=simulado` });
    }
    const arquivo = arquivos.get(decodeURIComponent(assinar[1]));
    if (!arquivo) {
      return responder(res, 404, {
        message: "Este arquivo não existe no simulador (só os PDFs gerados nesta sessão).",
      });
    }
    const nome = url.searchParams.get("download");
    res.writeHead(200, {
      "Content-Type": arquivo.tipo,
      "Content-Length": arquivo.bytes.length,
      ...(nome ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}` } : {}),
      ...CORS,
    });
    res.end(arquivo.bytes);
    return;
  }
  const objeto = /^\/storage\/v1\/object\/(.+)$/.exec(caminho);
  if (objeto && (req.method === "POST" || req.method === "PUT")) {
    const chaveDoArquivo = decodeURIComponent(objeto[1]);
    arquivos.set(chaveDoArquivo, {
      bytes: await lerBytes(req),
      tipo: String(req.headers["content-type"] ?? "application/octet-stream"),
    });
    return responder(res, 200, { Key: chaveDoArquivo, Id: id("6", arquivos.size) });
  }

  // Tabelas -------------------------------------------------------------
  const m = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(caminho);
  if (m) {
    const tabela = m[1];
    const linhas = tabelas[tabela];
    if (!linhas) return responder(res, 404, { code: "PGRST205", message: `Could not find the table 'public.${tabela}'` });
    const umObjeto = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const prefere = String(req.headers.prefer ?? "");
    const chave = tabela === "ar1_settings" ? "key" : tabela === "ar1_staff" ? "user_id" : "id";

    if (req.method === "GET" || req.method === "HEAD") {
      const achadas = embutir(tabela, filtrar(linhas, url.searchParams), url.searchParams.get("select"));
      const faixa = { "Content-Range": `${achadas.length ? `0-${achadas.length - 1}` : "*"}/${achadas.length}` };
      if (req.method === "HEAD") {
        res.writeHead(200, { ...CORS, ...faixa });
        res.end();
        return;
      }
      if (umObjeto) {
        if (achadas.length !== 1) {
          return responder(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        }
        return responder(res, 200, achadas[0], faixa);
      }
      return responder(res, 200, achadas, faixa);
    }

    const corpo = await lerCorpo(req);

    if (req.method === "PATCH") {
      const alvo = filtrar(linhas, url.searchParams);
      for (const l of alvo) {
        const etapaAntes = l.status;
        Object.assign(l, corpo ?? {}, { updated_at: new Date().toISOString() });
        // O que os gatilhos do banco fazem com a oportunidade.
        if (tabela === "ar1_quote_requests" && corpo?.status && corpo.status !== etapaAntes) {
          l.stage_changed_at = new Date().toISOString();
          l.closed_at = ["won", "lost"].includes(l.status) ? l.stage_changed_at : null;
        }
      }
      if (!prefere.includes("return=representation")) return responder(res, 204);
      return responder(res, 200, umObjeto ? (alvo[0] ?? null) : alvo);
    }

    if (req.method === "POST") {
      const entradas = Array.isArray(corpo) ? corpo : [corpo ?? {}];
      const novas = entradas.map((e) => {
        const existente = linhas.find((l) => e[chave] !== undefined && l[chave] === e[chave]);
        if (existente) return Object.assign(existente, e);
        const agora = new Date().toISOString();
        const nova = { [chave]: id("7", linhas.length + 1), created_at: agora, updated_at: agora, ...e };
        if (tabela === "ar1_quote_requests") {
          Object.assign(nova, { stage_changed_at: agora, closed_at: null, ai_notes: null, lost_reason: null, ...e });
        }
        linhas.push(nova);
        return nova;
      });
      if (!prefere.includes("return=representation")) return responder(res, 201);
      return responder(res, 201, umObjeto ? novas[0] : novas);
    }

    if (req.method === "DELETE") {
      // Como no PostgREST: sem filtro, nada é apagado.
      const temFiltro = [...url.searchParams.keys()].some((k) => !["select", "order", "limit", "offset"].includes(k));
      if (temFiltro) {
        for (const l of filtrar(linhas, url.searchParams)) linhas.splice(linhas.indexOf(l), 1);
      }
      return responder(res, 204);
    }
  }

  // Tempo real e o resto: não existem no simulador.
  return responder(res, 404, { message: "Não existe no simulador." });
});

servidor.listen(PORTA, "127.0.0.1", () => {
  console.log(`Supabase simulado em http://127.0.0.1:${PORTA} (dados só na memória)`);
});
