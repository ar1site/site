import type {
  AiKind,
  AiUrgency,
  Contato,
  Outcome,
  StatusAtendimento,
} from "./tipos";

/** Deixa só os dígitos de um telefone. */
export function somenteDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D+/g, "");
}

/** 5562999998888 -> +55 (62) 99999-8888. Outros formatos: melhor esforço. */
export function formatarTelefone(phone: string | null | undefined): string {
  const d = somenteDigitos(phone);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const parte1 = resto.slice(0, resto.length - 4);
    const parte2 = resto.slice(-4);
    return `+55 (${ddd}) ${parte1}-${parte2}`;
  }
  return `+${d}`;
}

export function nomeDoContato(
  contato: Pick<Contato, "display_name" | "wa_name" | "phone"> | null | undefined,
): string {
  if (!contato) return "Contato";
  return (
    contato.display_name?.trim() ||
    contato.wa_name?.trim() ||
    formatarTelefone(contato.phone) ||
    "Contato"
  );
}

export function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  const letras = partes
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return letras || "?";
}

/** "há 5 min", "há 2 h", "ontem", "há 3 dias". */
export function tempoRelativo(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((agora - t) / 1000));
  if (s < 45) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const meses = Math.round(d / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.round(meses / 12);
  return `há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}

export function horaCurta(iso: string): string {
  const data = new Date(iso);
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataCurta(iso: string): string {
  const data = new Date(iso);
  return data.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const data = new Date(iso);
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ROTULO_STATUS: Record<StatusAtendimento, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando cliente",
  fechado: "Fechado",
};

export const ROTULO_OUTCOME: Record<Outcome, string> = {
  orcamento: "Virou orçamento",
  agendado: "Agendado",
  sem_interesse: "Sem interesse",
  spam: "Spam",
  outro: "Outro",
};

export const ROTULO_KIND: Record<AiKind, string> = {
  lead: "Possível cliente",
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  pessoal: "Pessoal",
  spam: "Spam",
  indefinido: "Indefinido",
};

export const ROTULO_URGENCIA: Record<AiUrgency, string> = {
  alta: "Urgente",
  media: "Normal",
  baixa: "Sem pressa",
};

export const ROTULO_EXTRAIDO: Record<string, string> = {
  nome: "Nome",
  empresa: "Empresa",
  cidade: "Cidade",
  data_prevista: "Data prevista",
  orcamento_estimado: "Orçamento",
  detalhes: "Detalhes",
};

export function classeUrgencia(urgencia: AiUrgency | null): string {
  if (urgencia === "alta") return "border-erro/60 text-erro";
  if (urgencia === "media") return "border-alerta/60 text-alerta";
  if (urgencia === "baixa") return "border-ok/60 text-ok";
  return "";
}

export function classeKind(kind: AiKind | null): string {
  if (kind === "lead") return "border-cobre/70 text-cobre-claro";
  if (kind === "cliente") return "border-ok/60 text-ok";
  if (kind === "spam") return "border-erro/60 text-erro";
  return "";
}

/** Data ISO (aaaa-mm-dd) -> dd/mm/aaaa. Outros textos voltam como estão. */
export function formatarDataPrevista(valor: string | null | undefined): string {
  if (!valor) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return valor;
}
