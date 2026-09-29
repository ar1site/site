#!/usr/bin/env node
// Supabase de mentira, só para ver as telas com dados simulados.
//
// Sobe um servidor local que responde como o Supabase (login, tabelas) com
// dados inventados que ficam só na memória. Não fala com o banco real, não
// fala com a IA e não envia WhatsApp.
//
// Também responde como uma IA de mentira em /anthropic (texto fixo), para
// testar a rotina das retomadas sem gastar nem sair da máquina:
//   AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=simulado
//   ANTHROPIC_BASE_URL=http://127.0.0.1:54999/anthropic
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
    stage_changed_at: ha(20 * DIA), closed_at: ha(20 * DIA),
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
  ar1_context_docs: [],
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
  ],
};

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
    resultado = resultado.filter((l) => comparar(l[chave], operador, alvo) !== negar);
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

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  const texto = Buffer.concat(partes).toString("utf8");
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
    const texto = JSON.stringify(pedido ?? {});
    const retomada = texto.includes("motivo_da_retomada");
    const resposta = retomada
      ? {
          texto: "Oi! Passando para retomar a nossa conversa. Posso ajudar em mais alguma coisa? Equipe AR1 Films",
          motivo: "Resposta fixa do simulador.",
          prioridade: "media",
        }
      : { erro: "O simulador só responde pedidos de retomada." };
    return responder(res, retomada ? 200 : 400, retomada
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
      : { type: "error", error: { type: "invalid_request_error", message: resposta.erro } });
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

    if (req.method === "DELETE") return responder(res, 204);
  }

  // Tempo real, arquivos e o resto: não existem no simulador.
  return responder(res, 404, { message: "Não existe no simulador." });
});

servidor.listen(PORTA, "127.0.0.1", () => {
  console.log(`Supabase simulado em http://127.0.0.1:${PORTA} (dados só na memória)`);
});
