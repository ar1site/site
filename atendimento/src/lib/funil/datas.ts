// Datas do funil. O painel trabalha no horário de Brasília (UTC−03:00, sem
// horário de verão desde 2019). Puro, testável.

export const FUSO_BRASILIA_MS = -3 * 60 * 60 * 1000;

/** Hora (de Brasília) em que vence uma ação marcada só com o dia. */
export const HORA_DO_VENCIMENTO = 18;

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataValida(ano: number, mes: number, dia: number): boolean {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** "2026-10-02" (dia em Brasília) -> ISO do fim do expediente daquele dia. */
export function diaParaIso(dia: string | null | undefined): string | null {
  const m = SO_DATA.exec((dia ?? "").trim());
  if (!m) return null;
  const [ano, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!dataValida(ano, mes, d)) return null;
  const utc = Date.UTC(ano, mes - 1, d, HORA_DO_VENCIMENTO) - FUSO_BRASILIA_MS;
  return new Date(utc).toISOString();
}

/** ISO -> "2026-10-02" (o dia em Brasília), para campos <input type="date">. */
export function isoParaDia(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + FUSO_BRASILIA_MS).toISOString().slice(0, 10);
}

/** ISO -> "02/10" (ou "02/10/2027" quando o ano não é o atual), em Brasília. */
export function diaCurto(iso: string | null | undefined, agora: number = Date.now()): string {
  const dia = isoParaDia(iso);
  if (!dia) return "";
  const [ano, mes, d] = dia.split("-");
  const anoAtual = new Date(agora + FUSO_BRASILIA_MS).getUTCFullYear();
  return Number(ano) === anoAtual ? `${d}/${mes}` : `${d}/${mes}/${ano}`;
}

/** ISO -> "02/10/2026", em Brasília. */
export function diaCompleto(iso: string | null | undefined): string {
  const dia = isoParaDia(iso);
  if (!dia) return "";
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** ISO -> "02/10/2026 14:32", em Brasília. */
export function diaEHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const local = new Date(t + FUSO_BRASILIA_MS).toISOString();
  return `${diaCompleto(iso)} ${local.slice(11, 16)}`;
}

/**
 * Normaliza uma data vinda da IA ou de um formulário: aceita só o dia
 * ("2026-10-02", vence às 18 h de Brasília) ou um ISO completo. Devolve ISO
 * em UTC ou null quando não dá para entender.
 */
export function normalizarDataHora(valor: string | null | undefined): string | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;
  if (SO_DATA.test(texto)) return diaParaIso(texto);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(texto)) return null;
  // Sem fuso explícito, o horário é de Brasília.
  const comFuso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto) ? texto : `${texto.replace(" ", "T")}-03:00`;
  const t = new Date(comFuso.replace(" ", "T")).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/** ISO de daqui a N dias (para adiar uma retomada). */
export function daquiADias(dias: number, agora: Date = new Date()): string {
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}
