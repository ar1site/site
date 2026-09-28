import {
  classeKind,
  classeUrgencia,
  ROTULO_KIND,
  ROTULO_STATUS,
  ROTULO_URGENCIA,
} from "@/lib/formato";
import type { AiKind, AiUrgency, StatusAtendimento } from "@/lib/tipos";

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
