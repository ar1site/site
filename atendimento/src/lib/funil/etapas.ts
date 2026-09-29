// Regras do funil de vendas. Puro (sem banco, sem React), testável.

import type { EtapaFunil, Oportunidade, OrigemOportunidade } from "../tipos";

export const ETAPAS: readonly EtapaFunil[] = [
  "new",
  "qualified",
  "contacting",
  "proposal",
  "negotiating",
  "won",
  "lost",
] as const;

export const ETAPAS_ABERTAS: readonly EtapaFunil[] = [
  "new",
  "qualified",
  "contacting",
  "proposal",
  "negotiating",
] as const;

export const ETAPAS_FECHADAS: readonly EtapaFunil[] = ["won", "lost"] as const;

export const ROTULO_ETAPA: Record<EtapaFunil, string> = {
  new: "Novo",
  qualified: "Qualificado",
  contacting: "Em contato",
  proposal: "Proposta",
  negotiating: "Negociação",
  won: "Ganho",
  lost: "Perdido",
};

export const ORIGENS: readonly OrigemOportunidade[] = ["site", "whatsapp", "indicacao", "outro"] as const;

export const ROTULO_ORIGEM: Record<OrigemOportunidade, string> = {
  site: "Site",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  outro: "Outro",
};

/**
 * Probabilidade usada na previsão quando a oportunidade não tem uma
 * probabilidade preenchida. Na tela aparece marcada como "padrão da etapa".
 */
export const PROBABILIDADE_PADRAO: Record<EtapaFunil, number> = {
  new: 10,
  qualified: 25,
  contacting: 40,
  proposal: 60,
  negotiating: 80,
  won: 100,
  lost: 0,
};

/** Ganho e Perdido mostram só o que fechou nos últimos N dias. */
export const DIAS_FECHADOS_RECENTES = 30;

const DIA_MS = 24 * 60 * 60 * 1000;

export function ehEtapa(valor: unknown): valor is EtapaFunil {
  return typeof valor === "string" && (ETAPAS as readonly string[]).includes(valor);
}

export function ehOrigem(valor: unknown): valor is OrigemOportunidade {
  return typeof valor === "string" && (ORIGENS as readonly string[]).includes(valor);
}

export function etapaAberta(etapa: EtapaFunil): boolean {
  return etapa !== "won" && etapa !== "lost";
}

/** numeric do Postgres pode chegar como número ou texto; devolve número válido ou null. */
export function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** R$ 4.800 (sem centavos quando é valor redondo) ou R$ 4.800,50. */
export function formatarReais(valor: number | null | undefined): string {
  const n = numeroOuNull(valor);
  if (n === null) return "sem valor";
  const redondo = Math.abs(n - Math.round(n)) < 0.005;
  const texto = n.toLocaleString("pt-BR", {
    minimumFractionDigits: redondo ? 0 : 2,
    maximumFractionDigits: redondo ? 0 : 2,
  });
  return `R$ ${texto}`;
}

type ParaPrevisao = Pick<Oportunidade, "status" | "estimated_value" | "probability">;

/** Probabilidade que vale para a conta: a preenchida ou a padrão da etapa. */
export function probabilidadeEfetiva(o: Pick<Oportunidade, "status" | "probability">): {
  valor: number;
  padrao: boolean;
} {
  const p = numeroOuNull(o.probability);
  if (p === null) return { valor: PROBABILIDADE_PADRAO[o.status], padrao: true };
  return { valor: Math.min(100, Math.max(0, p)), padrao: false };
}

export interface TotalDaEtapa {
  quantidade: number;
  /** Soma dos valores estimados (quem não tem valor conta como zero). */
  soma: number;
  /** Quantas não têm valor estimado. */
  semValor: number;
}

export interface ResumoDoFunil {
  porEtapa: Record<EtapaFunil, TotalDaEtapa>;
  /** Oportunidades nas etapas abertas. */
  quantidadeEmAberto: number;
  /** Soma dos valores das etapas abertas. */
  totalEmAberto: number;
  /** Soma de valor × probabilidade das etapas abertas. */
  previsaoPonderada: number;
}

function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function resumoDoFunil(lista: ParaPrevisao[]): ResumoDoFunil {
  const porEtapa = Object.fromEntries(
    ETAPAS.map((e) => [e, { quantidade: 0, soma: 0, semValor: 0 }]),
  ) as Record<EtapaFunil, TotalDaEtapa>;
  let quantidadeEmAberto = 0;
  let totalEmAberto = 0;
  let previsaoPonderada = 0;

  for (const o of lista) {
    const total = porEtapa[o.status];
    if (!total) continue; // etapa desconhecida: ignora
    const valor = numeroOuNull(o.estimated_value);
    total.quantidade += 1;
    if (valor === null) total.semValor += 1;
    else total.soma += valor;
    if (etapaAberta(o.status)) {
      quantidadeEmAberto += 1;
      if (valor !== null) {
        totalEmAberto += valor;
        previsaoPonderada += (valor * probabilidadeEfetiva(o).valor) / 100;
      }
    }
  }
  for (const e of ETAPAS) porEtapa[e].soma = centavos(porEtapa[e].soma);
  return {
    porEtapa,
    quantidadeEmAberto,
    totalEmAberto: centavos(totalEmAberto),
    previsaoPonderada: centavos(previsaoPonderada),
  };
}

/** Dias inteiros desde que a oportunidade entrou na etapa atual. */
export function diasNaEtapa(stageChangedAt: string | null | undefined, agora: number): number {
  if (!stageChangedAt) return 0;
  const t = new Date(stageChangedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / DIA_MS));
}

export function textoDiasNaEtapa(stageChangedAt: string | null | undefined, agora: number): string {
  const d = diasNaEtapa(stageChangedAt, agora);
  if (d === 0) return "hoje nesta etapa";
  if (d === 1) return "há 1 dia nesta etapa";
  return `há ${d} dias nesta etapa`;
}

/** A próxima ação está vencida? (só vale para etapas abertas) */
export function acaoVencida(
  o: Pick<Oportunidade, "status" | "next_action_at">,
  agora: number,
): boolean {
  if (!etapaAberta(o.status) || !o.next_action_at) return false;
  const t = new Date(o.next_action_at).getTime();
  return !Number.isNaN(t) && t < agora;
}

/** Fechou (ganho ou perdido) nos últimos `dias` dias? */
export function fechouRecentemente(
  o: Pick<Oportunidade, "closed_at" | "stage_changed_at">,
  agora: number,
  dias = DIAS_FECHADOS_RECENTES,
): boolean {
  const ref = o.closed_at || o.stage_changed_at;
  if (!ref) return true;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return true;
  return agora - t <= dias * DIA_MS;
}

export interface FiltrosDoFunil {
  origem: OrigemOportunidade | "todas";
  /** user_id, "todos" ou "sem" (sem responsável). */
  responsavel: string;
  busca: string;
}

export const FILTROS_PADRAO: FiltrosDoFunil = { origem: "todas", responsavel: "todos", busca: "" };

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function filtrarOportunidades<
  T extends Pick<Oportunidade, "name" | "company" | "source" | "assigned_to">,
>(lista: T[], filtros: FiltrosDoFunil): T[] {
  const termo = semAcento(filtros.busca.trim());
  return lista.filter((o) => {
    if (filtros.origem !== "todas" && o.source !== filtros.origem) return false;
    if (filtros.responsavel === "sem" && o.assigned_to) return false;
    if (
      filtros.responsavel !== "todos" &&
      filtros.responsavel !== "sem" &&
      o.assigned_to !== filtros.responsavel
    ) {
      return false;
    }
    if (termo) {
      const alvo = semAcento(`${o.name ?? ""} ${o.company ?? ""}`);
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

/** Dentro da coluna: ação vencida primeiro, depois a ação mais próxima, depois a mais recente na etapa. */
export function ordenarCartoes<
  T extends Pick<Oportunidade, "status" | "next_action_at" | "stage_changed_at">,
>(lista: T[], agora: number): T[] {
  const tempo = (iso: string | null) => {
    if (!iso) return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  return [...lista].sort((a, b) => {
    const va = acaoVencida(a, agora) ? 0 : 1;
    const vb = acaoVencida(b, agora) ? 0 : 1;
    if (va !== vb) return va - vb;
    const ta = tempo(a.next_action_at);
    const tb = tempo(b.next_action_at);
    if (ta !== tb) return ta - tb;
    return tempo(b.stage_changed_at) - tempo(a.stage_changed_at);
  });
}

// ------------------------------------------------------------- mudar de etapa

export interface PedidoDeTransicao {
  de: EtapaFunil;
  para: EtapaFunil;
  /** Obrigatório quando `para` é "lost". */
  motivo?: string | null;
  /** Obrigatório quando `para` é "won": o valor final confirmado. */
  valorFinal?: number | null;
}

export type CamposDaTransicao = Partial<
  Pick<Oportunidade, "status" | "lost_reason" | "estimated_value" | "probability">
>;

export type ResultadoTransicao =
  | { ok: true; campos: CamposDaTransicao }
  | { ok: false; erro: string };

export const LIMITE_MOTIVO = 500;
/** numeric(12,2) */
export const VALOR_MAXIMO = 9_999_999_999.99;

/** A mudança pede alguma informação antes de gravar? */
export function transicaoPede(para: EtapaFunil): "motivo" | "valor" | null {
  if (para === "lost") return "motivo";
  if (para === "won") return "valor";
  return null;
}

/**
 * Valida a mudança de etapa e devolve só os campos a gravar.
 *   - Perdido exige motivo.
 *   - Ganho exige o valor final confirmado e leva a probabilidade a 100.
 *   - Sair de Perdido limpa o motivo.
 * stage_changed_at e closed_at são cuidados pelo gatilho do banco.
 */
export function validarTransicao(pedido: PedidoDeTransicao): ResultadoTransicao {
  const { de, para } = pedido;
  if (!ehEtapa(de) || !ehEtapa(para)) return { ok: false, erro: "Etapa inválida." };
  if (de === para) return { ok: false, erro: "A oportunidade já está nesta etapa." };

  if (para === "lost") {
    const motivo = (pedido.motivo ?? "").trim();
    if (!motivo) return { ok: false, erro: "Informe o motivo da perda." };
    if (motivo.length > LIMITE_MOTIVO) {
      return { ok: false, erro: `O motivo é longo demais (máximo ${LIMITE_MOTIVO} caracteres).` };
    }
    return { ok: true, campos: { status: "lost", lost_reason: motivo } };
  }

  if (para === "won") {
    const valor = pedido.valorFinal;
    if (valor === null || valor === undefined || !Number.isFinite(valor)) {
      return { ok: false, erro: "Confirme o valor final do negócio." };
    }
    if (valor < 0) return { ok: false, erro: "O valor não pode ser negativo." };
    if (valor > VALOR_MAXIMO) return { ok: false, erro: "O valor é alto demais." };
    const campos: CamposDaTransicao = {
      status: "won",
      estimated_value: centavos(valor),
      probability: 100,
    };
    if (de === "lost") campos.lost_reason = null;
    return { ok: true, campos };
  }

  const campos: CamposDaTransicao = { status: para };
  if (de === "lost") campos.lost_reason = null;
  return { ok: true, campos };
}
