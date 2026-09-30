// Rotina do resumo diário, sem banco nem IA: recebe "portas" (o que lê, o que
// escreve, quem envia) e decide a ordem das coisas. As portas de verdade ficam
// em `executar.ts`; os testes usam portas de mentira.

import {
  decidirEnvio,
  type MotivoDeNaoEnviar,
  type UltimoEnvio,
} from "./ajustes";
import { calcularResumo, diaDeBrasilia, type EntradaResumo, type NumerosDoResumo } from "./numeros";
import { conferirTextoDaIA, textoReserva } from "./texto";

export type OrigemDoResumo = "cron" | "interno" | "equipe";

export interface AjustesDoResumo {
  ativo: boolean;
  destinatarios: string[];
  ultimoEnvio: UltimoEnvio | null;
}

export type DadosDoResumo = Omit<EntradaResumo, "agora" | "telefonesInternos">;

export interface ResultadoDoEnvio {
  telefone: string;
  ok: boolean;
  erro?: string;
}

export interface Portas {
  lerAjustes(): Promise<AjustesDoResumo>;
  lerDados(agora: Date): Promise<DadosDoResumo>;
  /** Pede o texto à IA. Pode lançar erro: a rotina usa o texto de reserva. */
  escreverComIA(numeros: NumerosDoResumo): Promise<string>;
  /**
   * Reserva o dia (grava o último envio) de forma atômica. Devolve false
   * quando o dia já estava reservado por outra execução.
   */
  reservarDia(envio: UltimoEnvio, forcar: boolean): Promise<boolean>;
  /** Desfaz a reserva quando nenhum envio deu certo. */
  devolverDia(anterior: UltimoEnvio | null): Promise<void>;
  enviar(telefone: string, texto: string, usuarioId: string | null): Promise<ResultadoDoEnvio>;
}

export interface PedidoDoResumo {
  origem: OrigemDoResumo;
  /** "previa" só monta o texto; "enviar" também envia. */
  modo: "previa" | "enviar";
  /** Só com sessão de equipe: passa por cima do desligado e da trava do dia. */
  forcar?: boolean;
  /** Texto que a pessoa viu na prévia (e talvez editou). Só com sessão de equipe. */
  texto?: string | null;
  usuarioId?: string | null;
  agora?: Date;
}

export type OrigemDoTexto = "ia" | "reserva" | "equipe";

export interface ResultadoDoResumo {
  enviado: boolean;
  /** Por que não enviou (quando `enviado` é false e não houve erro). */
  motivo?: MotivoDeNaoEnviar | "previa" | "falha_no_envio";
  mensagem?: string;
  texto: string | null;
  origemDoTexto: OrigemDoTexto | null;
  /** Por que o texto da IA não foi usado. */
  avisoDaIA?: string;
  numeros: NumerosDoResumo | null;
  envios: ResultadoDoEnvio[];
  ultimoEnvio: UltimoEnvio | null;
}

/** Limite da coluna ar1_wa_outbox.text é 5000; o resumo é curto. */
export const TAMANHO_MAXIMO_DO_TEXTO_EDITADO = 1500;

async function montarTexto(
  portas: Portas,
  numeros: NumerosDoResumo,
): Promise<{ texto: string; origem: OrigemDoTexto; aviso?: string }> {
  try {
    const conferido = conferirTextoDaIA(await portas.escreverComIA(numeros), numeros);
    if (conferido.ok) return { texto: conferido.texto, origem: "ia" };
    return { texto: textoReserva(numeros), origem: "reserva", aviso: `Texto da IA recusado: ${conferido.motivo}.` };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    return { texto: textoReserva(numeros), origem: "reserva", aviso: `A IA falhou: ${erro}` };
  }
}

export async function rodarResumo(portas: Portas, pedido: PedidoDoResumo): Promise<ResultadoDoResumo> {
  const agora = pedido.agora ?? new Date();
  const daEquipe = pedido.origem === "equipe";
  const forcar = daEquipe && pedido.forcar === true;
  const ajustes = await portas.lerAjustes();

  const vazio = { texto: null, origemDoTexto: null, numeros: null, envios: [], ultimoEnvio: ajustes.ultimoEnvio };

  if (pedido.modo === "enviar") {
    const decisao = decidirEnvio({ ...ajustes, agora, forcar });
    if (!decisao.enviar) {
      return { ...vazio, enviado: false, motivo: decisao.motivo, mensagem: decisao.mensagem };
    }
  }

  const dados = await portas.lerDados(agora);
  const numeros = calcularResumo({ ...dados, agora, telefonesInternos: ajustes.destinatarios });

  const editado = daEquipe ? (pedido.texto ?? "").trim().slice(0, TAMANHO_MAXIMO_DO_TEXTO_EDITADO) : "";
  const montado: { texto: string; origem: OrigemDoTexto; aviso?: string } = editado
    ? { texto: editado, origem: "equipe" }
    : await montarTexto(portas, numeros);

  const base = {
    texto: montado.texto,
    origemDoTexto: montado.origem,
    avisoDaIA: montado.aviso,
    numeros,
  };

  if (pedido.modo === "previa") {
    return { ...base, enviado: false, motivo: "previa", envios: [], ultimoEnvio: ajustes.ultimoEnvio };
  }

  // Reserva o dia ANTES de enviar: duas execuções ao mesmo tempo não enviam em dobro.
  const envio: UltimoEnvio = {
    dia: diaDeBrasilia(agora),
    enviado_em: agora.toISOString(),
    destinatarios: ajustes.destinatarios,
    origem: pedido.origem,
  };
  const reservou = await portas.reservarDia(envio, forcar);
  if (!reservou) {
    return {
      ...base,
      enviado: false,
      motivo: "ja_enviado",
      mensagem: "O resumo de hoje já foi enviado.",
      envios: [],
      ultimoEnvio: ajustes.ultimoEnvio,
    };
  }

  const envios: ResultadoDoEnvio[] = [];
  for (const telefone of ajustes.destinatarios) {
    try {
      envios.push(await portas.enviar(telefone, montado.texto, pedido.usuarioId ?? null));
    } catch (e) {
      envios.push({ telefone, ok: false, erro: e instanceof Error ? e.message : "erro desconhecido" });
    }
  }

  if (!envios.some((e) => e.ok)) {
    // Nada saiu: devolve o dia para a próxima tentativa poder enviar.
    await portas.devolverDia(ajustes.ultimoEnvio);
    return {
      ...base,
      enviado: false,
      motivo: "falha_no_envio",
      mensagem: `Não foi possível enviar o resumo: ${envios.map((e) => e.erro).filter(Boolean).join("; ") || "erro desconhecido"}`,
      envios,
      ultimoEnvio: ajustes.ultimoEnvio,
    };
  }

  return { ...base, enviado: true, envios, ultimoEnvio: envio };
}
