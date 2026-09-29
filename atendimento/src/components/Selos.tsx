import {
  classeKind,
  classeUrgencia,
  ROTULO_KIND,
  ROTULO_STATUS,
  ROTULO_URGENCIA,
} from "@/lib/formato";
import { ROTULO_ETAPA, ROTULO_ORIGEM } from "@/lib/funil/etapas";
import type {
  AiKind,
  AiUrgency,
  EtapaFunil,
  OrigemOportunidade,
  PrioridadeFollowup,
  StatusAtendimento,
} from "@/lib/tipos";

export function SeloKind({ kind }: { kind: AiKind | null }) {
  if (!kind) return null;
  return <span className={`selo ${classeKind(kind)}`}>{ROTULO_KIND[kind]}</span>;
}

export function SeloUrgencia({ urgencia }: { urgencia: AiUrgency | null }) {
  if (!urgencia) return null;
  return <span className={`selo ${classeUrgencia(urgencia)}`}>{ROTULO_URGENCIA[urgencia]}</span>;
}

export function SeloServico({ servico }: { servico: string | null }) {
  if (!servico) return null;
  return <span className="selo">{servico}</span>;
}

const CLASSE_STATUS: Record<StatusAtendimento, string> = {
  novo: "border-cobre/70 text-cobre-claro",
  em_atendimento: "border-alerta/60 text-alerta",
  aguardando_cliente: "border-apoio/50 text-apoio",
  fechado: "border-borda text-apoio/70",
};

export function SeloStatus({ status }: { status: StatusAtendimento }) {
  return <span className={`selo ${CLASSE_STATUS[status]}`}>{ROTULO_STATUS[status]}</span>;
}

const CLASSE_ETAPA: Record<EtapaFunil, string> = {
  new: "border-cobre/70 text-cobre-claro",
  qualified: "border-apoio/60 text-texto",
  contacting: "border-apoio/60 text-texto",
  proposal: "border-alerta/60 text-alerta",
  negotiating: "border-alerta/60 text-alerta",
  won: "border-ok/60 text-ok",
  lost: "border-erro/60 text-erro",
};

export function SeloEtapa({ etapa, prefixo }: { etapa: EtapaFunil | null | undefined; prefixo?: string }) {
  if (!etapa || !ROTULO_ETAPA[etapa]) return null;
  return (
    <span className={`selo ${CLASSE_ETAPA[etapa]}`}>
      {prefixo ? `${prefixo} ` : ""}
      {ROTULO_ETAPA[etapa]}
    </span>
  );
}

export function SeloOrigem({ origem }: { origem: OrigemOportunidade | null | undefined }) {
  if (!origem || !ROTULO_ORIGEM[origem]) return null;
  return <span className="selo">{ROTULO_ORIGEM[origem]}</span>;
}

const ROTULO_PRIORIDADE: Record<PrioridadeFollowup, string> = {
  alta: "Prioridade alta",
  media: "Prioridade média",
  baixa: "Prioridade baixa",
};
const CLASSE_PRIORIDADE: Record<PrioridadeFollowup, string> = {
  alta: "border-erro/60 text-erro",
  media: "border-alerta/60 text-alerta",
  baixa: "border-apoio/50 text-apoio",
};

export function SeloPrioridade({ prioridade }: { prioridade: PrioridadeFollowup }) {
  return (
    <span className={`selo ${CLASSE_PRIORIDADE[prioridade] ?? ""}`}>
      {ROTULO_PRIORIDADE[prioridade] ?? prioridade}
    </span>
  );
}

export function Avatar({ nome, foto, tamanho = 40 }: { nome: string; foto?: string | null; tamanho?: number }) {
  const letras = nome
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
  if (foto) {
    // Foto externa (WhatsApp): sem otimização do Next para não depender de domínios.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" width={tamanho} height={tamanho} className="shrink-0 rounded-full object-cover" style={{ width: tamanho, height: tamanho }} />;
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-cobre/25 text-sm font-bold text-cobre-claro"
      style={{ width: tamanho, height: tamanho }}
      aria-hidden
    >
      {letras}
    </div>
  );
}
