// O que o webhook faz DEPOIS de responder, para cada mensagem gravada: transcrever o
// áudio e, em seguida, esperar e pedir a análise. Puro (sem banco nem rede): as
// ações chegam por parâmetro, para a ordem ser testável.

export interface MensagemParaPlano {
  kind: string;
  fromMe: boolean;
  /** "storage:ar1-wa-media/<caminho>" (ponte) ou URL http(s) (Z-API). */
  mediaUrl: string | null;
  /** Mensagem antiga importada do histórico. */
  historico?: boolean;
}

export interface GravacaoParaPlano {
  situacao: "gravada" | "duplicada" | "bloqueado";
  atendimentoId: string | null;
  mensagemId: string | null;
  /** true quando a mensagem é do contato. */
  entrada: boolean;
}

export interface PlanoPosMensagem {
  /** Transcrever o áudio desta mensagem. */
  transcrever: boolean;
  /** Esperar a rajada e pedir a análise da IA. */
  analisar: boolean;
}

const PREFIXO_BUCKET = "storage:ar1-wa-media/";

/**
 * Decide o que fazer depois de gravar a mensagem:
 *   - análise: só para mensagem nova do contato, fora do histórico (como já era);
 *   - transcrição: áudio novo guardado no bucket, recebido ou enviado por nós,
 *     fora do histórico. Áudio nosso é transcrito, mas não dispara análise.
 */
export function planejarPosMensagem(m: MensagemParaPlano, r: GravacaoParaPlano): PlanoPosMensagem {
  if (r.situacao !== "gravada" || m.historico) return { transcrever: false, analisar: false };
  const analisar = r.entrada && Boolean(r.atendimentoId);
  const transcrever =
    m.kind === "audio" && Boolean(r.mensagemId) && Boolean(m.mediaUrl?.startsWith(PREFIXO_BUCKET));
  return { transcrever, analisar };
}

/**
 * Quanto ainda falta esperar antes da análise. A espera junta uma rajada de
 * mensagens e conta a partir da chegada: o tempo gasto transcrevendo é descontado,
 * para o total caber no tempo máximo da função.
 */
export function esperaRestante(esperaTotalMs: number, decorridoMs: number): number {
  if (!Number.isFinite(decorridoMs) || decorridoMs <= 0) return Math.max(0, esperaTotalMs);
  return Math.max(0, esperaTotalMs - decorridoMs);
}

export interface AcoesPosMensagem {
  /** Transcreve e grava `transcript`. Pode lançar: a análise segue mesmo assim. */
  transcrever: () => Promise<unknown>;
  /** Espera `esperaMs` e pede a análise (se nada mais novo tiver chegado). */
  esperarEAnalisar: (esperaMs: number) => Promise<unknown>;
  /** Chamado quando a transcrição falha (registro em log). */
  aoFalharTranscricao?: (erro: unknown) => void;
  agora?: () => number;
}

/**
 * Executa o plano na ordem certa: primeiro a transcrição, depois a espera e a
 * análise. Assim a análise sempre enxerga o texto do áudio. Falha na transcrição
 * não impede a análise.
 */
export async function executarPosMensagem(
  plano: PlanoPosMensagem,
  esperaTotalMs: number,
  acoes: AcoesPosMensagem,
): Promise<void> {
  const agora = acoes.agora ?? Date.now;
  const inicio = agora();

  if (plano.transcrever) {
    try {
      await acoes.transcrever();
    } catch (e) {
      acoes.aoFalharTranscricao?.(e);
    }
  }

  if (plano.analisar) {
    await acoes.esperarEAnalisar(esperaRestante(esperaTotalMs, agora() - inicio));
  }
}
