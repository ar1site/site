// Quem merece uma retomada (follow-up)? Funções puras: recebem listas e o
// "agora", não tocam em banco nem em IA. Testadas em tests/followups.test.ts.

import { FUSO_BRASILIA_MS } from "../funil/datas";
import { etapaAberta } from "../funil/etapas";
import type {
  AiKind,
  Atendimento,
  Contato,
  EtapaFunil,
  Followup,
  Oportunidade,
  Outcome,
  PrioridadeFollowup,
} from "../tipos";

// ------------------------------------------------------------------ regras

/** Cliente esperando resposta há mais de N horas úteis vira retomada urgente. */
export const HORAS_UTEIS_SEM_RESPOSTA = 4;
/** Padrão de ar1_settings['followup.dias_sem_retorno']. */
export const DIAS_SEM_RETORNO_PADRAO = 2;
export const DIAS_SEM_RETORNO_MIN = 1;
export const DIAS_SEM_RETORNO_MAX = 30;
export const CHAVE_DIAS_SEM_RETORNO = "followup.dias_sem_retorno";
/** Quem já tem retomada descartada ou enviada há menos de N horas fica de fora. */
export const HORAS_DE_DESCANSO = 48;
/** Máximo de retomadas novas por execução. */
export const LIMITE_POR_EXECUCAO = 15;
/** Conversas paradas há mais que isso não voltam sozinhas (evita ressuscitar histórico antigo). */
export const DIAS_MAXIMOS_PARADA = 30;
/** Depois de N retomadas enviadas sem o cliente responder, a IA para de sugerir. */
export const MAXIMO_SEM_RESPOSTA = 3;

/** Expediente em horário de Brasília: segunda a sexta, das 9 h às 18 h. */
export const EXPEDIENTE = { inicio: 9, fim: 18, dias: [1, 2, 3, 4, 5] } as const;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

const KINDS_IGNORADOS: ReadonlySet<AiKind> = new Set(["spam", "pessoal", "fornecedor"]);
const OUTCOMES_IGNORADOS: ReadonlySet<Outcome> = new Set(["sem_interesse", "spam"]);

const PESO: Record<PrioridadeFollowup, number> = { alta: 0, media: 1, baixa: 2 };

// -------------------------------------------------------------- horas úteis

/**
 * Horas de expediente entre dois instantes (segunda a sexta, 9 h–18 h de
 * Brasília). Feriados não são considerados.
 */
export function horasUteisEntre(inicio: Date, fim: Date): number {
  const a = inicio.getTime() + FUSO_BRASILIA_MS;
  const b = fim.getTime() + FUSO_BRASILIA_MS;
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;

  const primeiro = new Date(a);
  let dia = Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), primeiro.getUTCDate());
  let total = 0;
  // Limite de segurança: no máximo 2 anos de dias percorridos.
  for (let i = 0; i < 731 && dia <= b; i += 1, dia += DIA_MS) {
    const semana = new Date(dia).getUTCDay();
    if (!(EXPEDIENTE.dias as readonly number[]).includes(semana)) continue;
    const abre = dia + EXPEDIENTE.inicio * HORA_MS;
    const fecha = dia + EXPEDIENTE.fim * HORA_MS;
    const de = Math.max(a, abre);
    const ate = Math.min(b, fecha);
    if (ate > de) total += ate - de;
  }
  return total / HORA_MS;
}

// ------------------------------------------------------------ configuração

/** Lê o valor de ar1_settings (jsonb: número ou texto) com padrão e limites. */
export function lerDiasSemRetorno(valor: unknown): number {
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.trim()) : Number.NaN;
  if (!Number.isFinite(n)) return DIAS_SEM_RETORNO_PADRAO;
  return Math.min(DIAS_SEM_RETORNO_MAX, Math.max(DIAS_SEM_RETORNO_MIN, Math.round(n)));
}

// --------------------------------------------------------------- candidatos

export type TipoCandidato = "aguardando_resposta" | "sem_retorno" | "acao_vencida";

export interface Candidato {
  tipo: TipoCandidato;
  contact_id: string;
  atendimento_id: string;
  quote_request_id: string | null;
  prioridade: PrioridadeFollowup;
  /** Motivo pela regra (a IA acrescenta a leitura dela). */
  motivo: string;
  /** Desde quando está parado (ISO): ordena "mais antigos primeiro". */
  desde: string;
}

export type AtendimentoParaRetomada = Pick<
  Atendimento,
  | "id"
  | "contact_id"
  | "status"
  | "outcome"
  | "ai_kind"
  | "quote_request_id"
  | "last_message_at"
  | "last_inbound_at"
  | "last_outbound_at"
>;
export type ContatoParaRetomada = Pick<Contato, "id" | "blocked">;
export type OportunidadeParaRetomada = Pick<
  Oportunidade,
  "id" | "contact_id" | "status" | "next_action" | "next_action_at"
>;
export type FollowupExistente = Pick<
  Followup,
  "id" | "contact_id" | "status" | "due_at" | "decided_at" | "updated_at"
>;

export interface EntradaSelecao {
  atendimentos: AtendimentoParaRetomada[];
  contatos: ContatoParaRetomada[];
  oportunidades: OportunidadeParaRetomada[];
  followups: FollowupExistente[];
  agora: Date;
  diasSemRetorno?: number;
  limite?: number;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Prioridade da retomada de uma ação vencida, conforme a etapa do funil. */
export function prioridadeDaEtapa(etapa: EtapaFunil): PrioridadeFollowup {
  if (etapa === "proposal" || etapa === "negotiating") return "alta";
  if (etapa === "qualified" || etapa === "contacting") return "media";
  return "baixa";
}

export function prioridadeMaisAlta(a: PrioridadeFollowup, b: PrioridadeFollowup): PrioridadeFollowup {
  return PESO[a] <= PESO[b] ? a : b;
}

/** Follow-ups adiados cujo prazo venceu: voltam a pendente. */
export function adiadosParaReativar(followups: FollowupExistente[], agora: Date): string[] {
  const t = agora.getTime();
  return followups
    .filter((f) => f.status === "adiado" && (ms(f.due_at) ?? Number.POSITIVE_INFINITY) <= t)
    .map((f) => f.id);
}

/**
 * Contatos que não devem receber nova sugestão agora: já têm uma pendente,
 * têm uma adiada (que volta sozinha no prazo) ou tiveram uma descartada ou
 * enviada nas últimas 48 h.
 */
export function contatosEmDescanso(followups: FollowupExistente[], agora: Date): Set<string> {
  const t = agora.getTime();
  const fora = new Set<string>();
  for (const f of followups) {
    if (f.status === "pendente" || f.status === "adiado") {
      fora.add(f.contact_id);
      continue;
    }
    const decidido = ms(f.decided_at) ?? ms(f.updated_at);
    if (decidido !== null && t - decidido < HORAS_DE_DESCANSO * HORA_MS) fora.add(f.contact_id);
  }
  return fora;
}

/** Retomadas enviadas ao contato depois da última mensagem dele. */
function enviadasSemResposta(
  followups: FollowupExistente[],
  contactId: string,
  ultimaDoCliente: number | null,
): number {
  return followups.filter((f) => {
    if (f.contact_id !== contactId || f.status !== "enviado") return false;
    const quando = ms(f.decided_at) ?? ms(f.updated_at);
    if (quando === null) return false;
    return ultimaDoCliente === null || quando > ultimaDoCliente;
  }).length;
}

/**
 * Seleciona quem recebe sugestão de retomada, no máximo `limite` por execução,
 * os parados há mais tempo primeiro. Um candidato por contato.
 */
export function selecionarCandidatos(entrada: EntradaSelecao): Candidato[] {
  const agora = entrada.agora.getTime();
  const diasSemRetorno = lerDiasSemRetorno(entrada.diasSemRetorno ?? DIAS_SEM_RETORNO_PADRAO);
  const limite = Math.max(0, entrada.limite ?? LIMITE_POR_EXECUCAO);
  const antigoDemais = agora - DIAS_MAXIMOS_PARADA * DIA_MS;

  const contatos = new Map(entrada.contatos.map((c) => [c.id, c]));
  const emDescanso = contatosEmDescanso(entrada.followups, entrada.agora);

  const contatoServe = (id: string | null | undefined): id is string => {
    if (!id) return false;
    const c = contatos.get(id);
    // Contato desconhecido fica de fora: sem saber se está bloqueado, não sugerimos.
    if (!c || c.blocked) return false;
    return !emDescanso.has(id);
  };
  const kindServe = (a: AtendimentoParaRetomada) => !(a.ai_kind && KINDS_IGNORADOS.has(a.ai_kind));

  const porContato = new Map<string, Candidato>();
  const propor = (c: Candidato) => {
    const atual = porContato.get(c.contact_id);
    if (!atual) {
      porContato.set(c.contact_id, c);
      return;
    }
    // Mesmo contato em mais de uma regra: fica a de maior prioridade (empate: a mais antiga),
    // levando junto a oportunidade, se a outra tiver.
    const melhor =
      PESO[c.prioridade] < PESO[atual.prioridade] ||
      (PESO[c.prioridade] === PESO[atual.prioridade] && c.desde < atual.desde)
        ? c
        : atual;
    const outro = melhor === c ? atual : c;
    porContato.set(c.contact_id, {
      ...melhor,
      quote_request_id: melhor.quote_request_id ?? outro.quote_request_id,
    });
  };

  // a) e b): conversas abertas ---------------------------------------------
  for (const a of entrada.atendimentos) {
    if (a.status === "fechado") continue;
    if (!contatoServe(a.contact_id) || !kindServe(a)) continue;
    const entrou = ms(a.last_inbound_at);
    const saiu = ms(a.last_outbound_at);

    if (a.status === "novo" || a.status === "em_atendimento") {
      // a) a última mensagem é do cliente e ninguém respondeu
      if (entrou === null || (saiu !== null && saiu >= entrou)) continue;
      if (entrou < antigoDemais) continue;
      const horas = horasUteisEntre(new Date(entrou), entrada.agora);
      if (horas <= HORAS_UTEIS_SEM_RESPOSTA) continue;
      propor({
        tipo: "aguardando_resposta",
        contact_id: a.contact_id,
        atendimento_id: a.id,
        quote_request_id: a.quote_request_id,
        prioridade: "alta",
        motivo: `Cliente aguardando resposta há ${plural(Math.floor(horas), "hora útil", "horas úteis")}.`,
        desde: new Date(entrou).toISOString(),
      });
      continue;
    }

    if (a.status === "aguardando_cliente") {
      // b) nós falamos por último e o cliente não voltou
      if (saiu === null || (entrou !== null && entrou > saiu)) continue;
      if (saiu < antigoDemais) continue;
      if (agora - saiu <= diasSemRetorno * DIA_MS) continue;
      if (enviadasSemResposta(entrada.followups, a.contact_id, entrou) >= MAXIMO_SEM_RESPOSTA) continue;
      const dias = Math.floor((agora - saiu) / DIA_MS);
      propor({
        tipo: "sem_retorno",
        contact_id: a.contact_id,
        atendimento_id: a.id,
        quote_request_id: a.quote_request_id,
        prioridade: "media",
        motivo: `Sem retorno do cliente há ${plural(dias, "dia", "dias")}.`,
        desde: new Date(saiu).toISOString(),
      });
    }
  }

  // c) oportunidades abertas com a próxima ação vencida --------------------
  const atendimentosDoContato = new Map<string, AtendimentoParaRetomada[]>();
  for (const a of entrada.atendimentos) {
    const lista = atendimentosDoContato.get(a.contact_id) ?? [];
    lista.push(a);
    atendimentosDoContato.set(a.contact_id, lista);
  }
  const recente = (a: AtendimentoParaRetomada) => ms(a.last_message_at) ?? 0;

  for (const o of entrada.oportunidades) {
    if (!etapaAberta(o.status)) continue;
    const vence = ms(o.next_action_at);
    if (vence === null || vence >= agora) continue;
    if (!contatoServe(o.contact_id)) continue;

    // A conversa usada para enviar: a aberta do contato; se não houver, a
    // última encerrada (desde que não tenha fechado como sem interesse ou spam).
    const conversas = (atendimentosDoContato.get(o.contact_id) ?? []).slice().sort((x, y) => recente(y) - recente(x));
    const aberta = conversas.find((a) => a.status !== "fechado");
    const ligada = conversas.find((a) => a.quote_request_id === o.id);
    const conversa = aberta ?? ligada ?? conversas[0];
    if (!conversa || !kindServe(conversa)) continue;
    if (conversa.status === "fechado" && conversa.outcome && OUTCOMES_IGNORADOS.has(conversa.outcome)) continue;
    if (
      enviadasSemResposta(entrada.followups, o.contact_id, ms(conversa.last_inbound_at)) >= MAXIMO_SEM_RESPOSTA
    ) {
      continue;
    }

    const dias = Math.floor((agora - vence) / DIA_MS);
    const acao = (o.next_action ?? "").replace(/\s+/g, " ").trim();
    const atraso = dias === 0 ? "desde hoje" : `há ${plural(dias, "dia", "dias")}`;
    propor({
      tipo: "acao_vencida",
      contact_id: o.contact_id,
      atendimento_id: conversa.id,
      quote_request_id: o.id,
      prioridade: prioridadeDaEtapa(o.status),
      motivo: acao
        ? `Próxima ação vencida ${atraso}: ${acao.slice(0, 200)}.`
        : `Próxima ação da oportunidade vencida ${atraso}.`,
      desde: new Date(vence).toISOString(),
    });
  }

  return [...porContato.values()]
    .sort((x, y) => (x.desde < y.desde ? -1 : x.desde > y.desde ? 1 : PESO[x.prioridade] - PESO[y.prioridade]))
    .slice(0, limite);
}

/** Ordem da tela: prioridade alta primeiro; dentro dela, as mais antigas primeiro. */
export function ordenarParaTela<T extends Pick<Followup, "priority" | "due_at" | "created_at">>(
  lista: T[],
): T[] {
  return [...lista].sort((a, b) => {
    const p = (PESO[a.priority] ?? 9) - (PESO[b.priority] ?? 9);
    if (p !== 0) return p;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  });
}
