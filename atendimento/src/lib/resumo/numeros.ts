// Números do resumo diário do dono. Funções puras: recebem listas e o
// "agora", não tocam em banco nem em IA. Testadas em tests/resumo.test.ts.

import { FUSO_BRASILIA_MS } from "../funil/datas";
import { ETAPAS_ABERTAS, etapaAberta, numeroOuNull, resumoDoFunil, ROTULO_ETAPA } from "../funil/etapas";
import type { AiKind, AiUrgency, Atendimento, Contato, EtapaFunil, Followup, Oportunidade } from "../tipos";

export type AtendimentoDoResumo = Pick<
  Atendimento,
  | "id"
  | "contact_id"
  | "status"
  | "ai_kind"
  | "ai_service"
  | "ai_urgency"
  | "created_at"
  | "last_inbound_at"
  | "last_outbound_at"
>;
export type ContatoDoResumo = Pick<Contato, "id" | "phone" | "wa_name" | "display_name" | "blocked">;
export type OportunidadeDoResumo = Pick<
  Oportunidade,
  | "id"
  | "name"
  | "project_type"
  | "status"
  | "estimated_value"
  | "probability"
  | "next_action"
  | "next_action_at"
  | "closed_at"
  | "stage_changed_at"
>;
export type FollowupDoResumo = Pick<Followup, "id" | "status">;

export interface EntradaResumo {
  atendimentos: AtendimentoDoResumo[];
  contatos: ContatoDoResumo[];
  oportunidades: OportunidadeDoResumo[];
  followups: FollowupDoResumo[];
  agora: Date;
  /** Telefones (só dígitos) de quem recebe o resumo: as conversas deles não contam. */
  telefonesInternos?: readonly string[];
}

export interface ConversaUrgente {
  nome: string;
  servico: string | null;
  urgencia: AiUrgency | null;
}

export interface AcaoDoDia {
  nome: string;
  acao: string;
  /** ISO */
  quando: string;
  vencida: boolean;
}

export interface NumerosDoResumo {
  /** Dia do resumo em Brasília, AAAA-MM-DD. */
  dia: string;
  conversasNovas: { total: number; urgentes: ConversaUrgente[] };
  aguardandoResposta: {
    total: number;
    /** Quem espera há mais tempo primeiro (até 3). */
    quem: { nome: string; horas: number }[];
  };
  retomadasPendentes: number;
  funil: {
    /** Só as etapas abertas que têm oportunidade. */
    porEtapa: { etapa: EtapaFunil; rotulo: string; quantidade: number; soma: number }[];
    quantidadeEmAberto: number;
    totalEmAberto: number;
    previsaoPonderada: number;
  };
  acoes: { vencidas: number; vencemHoje: number; itens: AcaoDoDia[] };
  fechadas: {
    ganhos: { quantidade: number; soma: number };
    perdidos: { quantidade: number; soma: number };
  };
}

export const HORAS_DO_RESUMO = 24;
export const MAXIMO_DE_DESTAQUES = 3;

const HORA_MS = 60 * 60 * 1000;
/** Assuntos que não são comerciais: ficam fora do resumo. */
const KINDS_IGNORADOS: ReadonlySet<AiKind> = new Set(["spam", "pessoal", "fornecedor"]);
const PESO_URGENCIA: Record<AiUrgency, number> = { alta: 0, media: 1, baixa: 2 };

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Dia em Brasília (AAAA-MM-DD) de um instante. */
export function diaDeBrasilia(instante: Date | number): string {
  const t = typeof instante === "number" ? instante : instante.getTime();
  return new Date(t + FUSO_BRASILIA_MS).toISOString().slice(0, 10);
}

function nomeCurto(texto: string | null | undefined, limite = 40): string {
  const limpo = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
}

export function calcularResumo(entrada: EntradaResumo): NumerosDoResumo {
  const agora = entrada.agora.getTime();
  const desde = agora - HORAS_DO_RESUMO * HORA_MS;
  const hoje = diaDeBrasilia(agora);

  const contatos = new Map(entrada.contatos.map((c) => [c.id, c]));
  const internos = new Set(entrada.telefonesInternos ?? []);
  const nomeDoContato = (id: string): string => {
    const c = contatos.get(id);
    return nomeCurto(c?.display_name) || nomeCurto(c?.wa_name) || "Contato sem nome";
  };
  /** Conversa que conta: contato não bloqueado, não interno e assunto comercial. */
  const conta = (a: AtendimentoDoResumo): boolean => {
    const c = contatos.get(a.contact_id);
    if (c?.blocked) return false;
    if (c && internos.has(c.phone)) return false;
    return !(a.ai_kind && KINDS_IGNORADOS.has(a.ai_kind));
  };
  const validos = entrada.atendimentos.filter(conta);

  // Conversas novas nas últimas 24 h -----------------------------------------
  const novas = validos.filter((a) => {
    const criada = ms(a.created_at);
    return criada !== null && criada > desde && criada <= agora;
  });
  const urgentes = [...novas]
    .sort((x, y) => {
      const px = x.ai_urgency ? PESO_URGENCIA[x.ai_urgency] : 3;
      const py = y.ai_urgency ? PESO_URGENCIA[y.ai_urgency] : 3;
      if (px !== py) return px - py;
      // Empate: quem chegou primeiro espera há mais tempo.
      return (ms(x.created_at) ?? 0) - (ms(y.created_at) ?? 0);
    })
    .slice(0, MAXIMO_DE_DESTAQUES)
    .map((a) => ({
      nome: nomeDoContato(a.contact_id),
      servico: nomeCurto(a.ai_service, 50) || null,
      urgencia: a.ai_urgency ?? null,
    }));

  // Clientes aguardando resposta ----------------------------------------------
  const aguardando = validos
    .filter((a) => {
      if (a.status !== "novo" && a.status !== "em_atendimento") return false;
      const entrou = ms(a.last_inbound_at);
      const saiu = ms(a.last_outbound_at);
      return entrou !== null && entrou <= agora && (saiu === null || saiu < entrou);
    })
    .sort((x, y) => (ms(x.last_inbound_at) ?? 0) - (ms(y.last_inbound_at) ?? 0));

  // Funil --------------------------------------------------------------------
  const funil = resumoDoFunil(entrada.oportunidades);
  const porEtapa = ETAPAS_ABERTAS.filter((e) => funil.porEtapa[e].quantidade > 0).map((e) => ({
    etapa: e,
    rotulo: ROTULO_ETAPA[e],
    quantidade: funil.porEtapa[e].quantidade,
    soma: funil.porEtapa[e].soma,
  }));

  // Próximas ações: vencidas e que vencem hoje ----------------------------------
  const comAcao = entrada.oportunidades
    .filter((o) => etapaAberta(o.status))
    .map((o) => ({ o, vence: ms(o.next_action_at) }))
    .filter((x): x is { o: OportunidadeDoResumo; vence: number } => x.vence !== null);
  const vencidas = comAcao.filter((x) => x.vence < agora).sort((x, y) => x.vence - y.vence);
  const vencemHoje = comAcao
    .filter((x) => x.vence >= agora && diaDeBrasilia(x.vence) === hoje)
    .sort((x, y) => x.vence - y.vence);
  const itens: AcaoDoDia[] = [...vencidas, ...vencemHoje].slice(0, MAXIMO_DE_DESTAQUES).map(({ o, vence }) => ({
    nome: nomeCurto(o.name) || "Oportunidade sem nome",
    acao: nomeCurto(o.next_action, 80) || "próxima ação",
    quando: new Date(vence).toISOString(),
    vencida: vence < agora,
  }));

  // Ganhos e perdidos nas últimas 24 h ---------------------------------------
  const fechou = (o: OportunidadeDoResumo): boolean => {
    const t = ms(o.closed_at) ?? ms(o.stage_changed_at);
    return t !== null && t > desde && t <= agora;
  };
  const somar = (lista: OportunidadeDoResumo[]) => ({
    quantidade: lista.length,
    soma: centavos(lista.reduce((s, o) => s + (numeroOuNull(o.estimated_value) ?? 0), 0)),
  });

  return {
    dia: hoje,
    conversasNovas: { total: novas.length, urgentes },
    aguardandoResposta: {
      total: aguardando.length,
      quem: aguardando.slice(0, MAXIMO_DE_DESTAQUES).map((a) => ({
        nome: nomeDoContato(a.contact_id),
        horas: Math.max(0, Math.floor((agora - (ms(a.last_inbound_at) ?? agora)) / HORA_MS)),
      })),
    },
    retomadasPendentes: entrada.followups.filter((f) => f.status === "pendente").length,
    funil: {
      porEtapa,
      quantidadeEmAberto: funil.quantidadeEmAberto,
      totalEmAberto: funil.totalEmAberto,
      previsaoPonderada: funil.previsaoPonderada,
    },
    acoes: { vencidas: vencidas.length, vencemHoje: vencemHoje.length, itens },
    fechadas: {
      ganhos: somar(entrada.oportunidades.filter((o) => o.status === "won" && fechou(o))),
      perdidos: somar(entrada.oportunidades.filter((o) => o.status === "lost" && fechou(o))),
    },
  };
}

/** Não há nada para contar hoje? */
export function diaSemNovidades(n: NumerosDoResumo): boolean {
  return (
    n.conversasNovas.total === 0 &&
    n.aguardandoResposta.total === 0 &&
    n.retomadasPendentes === 0 &&
    n.funil.quantidadeEmAberto === 0 &&
    n.acoes.vencidas === 0 &&
    n.acoes.vencemHoje === 0 &&
    n.fechadas.ganhos.quantidade === 0 &&
    n.fechadas.perdidos.quantidade === 0
  );
}
