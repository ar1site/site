// Orçamento de caracteres dos documentos que entram no prompt da análise.
// Puro (sem banco), testável.

/** Caracteres para a base de conhecimento da AR1 (documentos globais). */
export const ORCAMENTO_BASE = 60_000;
/** Caracteres para o contexto do cliente (documentos do contato). */
export const ORCAMENTO_CLIENTE = 40_000;
/** Piso por documento quando é preciso cortar. */
export const MINIMO_POR_DOCUMENTO = 1_500;
export const MARCA_CORTE = "[… trecho cortado …]";

export interface DocParaPrompt {
  titulo: string;
  texto: string;
}

export interface DocNoPrompt {
  titulo: string;
  /** Texto que vai para o prompt (pode estar cortado). */
  texto: string;
  /** Tamanho do texto original. */
  original: number;
  cortado: boolean;
}

export interface SecaoMontada {
  /** Documentos incluídos, na ordem recebida (mais recentes primeiro). */
  documentos: DocNoPrompt[];
  /** Títulos que ficaram de fora por falta de espaço. */
  omitidos: string[];
}

/**
 * Divide o orçamento entre os documentos (na ordem recebida: mais recentes
 * primeiro). Devolve quantos caracteres cada um pode usar; 0 = fica de fora.
 *
 * - Se tudo cabe, cada documento usa o próprio tamanho.
 * - Se não cabe, a divisão é proporcional ao tamanho, com piso de `minimo`
 *   por documento (ou o tamanho dele, se for menor).
 * - Se nem os pisos cabem, entram os mais recentes e os demais ficam de fora.
 */
export function distribuirOrcamento(
  tamanhos: number[],
  orcamento: number,
  minimo = MINIMO_POR_DOCUMENTO,
): number[] {
  const tam = tamanhos.map((t) => Math.max(0, Math.floor(t)));
  const total = tam.reduce((a, b) => a + b, 0);
  if (total <= orcamento) return tam;

  const piso = tam.map((t) => Math.min(t, minimo));
  const cotas = tam.map(() => 0);

  // Quem entra: na ordem, enquanto o piso couber.
  const pendentes: number[] = [];
  let reservado = 0;
  for (let i = 0; i < tam.length; i++) {
    if (tam[i] === 0) continue;
    if (reservado + piso[i] > orcamento) continue;
    reservado += piso[i];
    pendentes.push(i);
  }

  // Divisão proporcional; quem ficaria abaixo do piso recebe o piso e sai da conta.
  let restante = orcamento;
  let abertos = pendentes;
  while (abertos.length > 0) {
    const soma = abertos.reduce((a, i) => a + tam[i], 0);
    const abaixo = abertos.filter((i) => (restante * tam[i]) / soma < piso[i]);
    if (abaixo.length === 0) {
      for (const i of abertos) cotas[i] = Math.min(tam[i], Math.floor((restante * tam[i]) / soma));
      break;
    }
    for (const i of abaixo) {
      cotas[i] = piso[i];
      restante -= piso[i];
    }
    abertos = abertos.filter((i) => !abaixo.includes(i));
  }
  return cotas;
}

/** Recua até uma quebra de linha ou espaço próximo, para não partir palavras. */
function fimLimpo(texto: string, fim: number): number {
  const janela = Math.min(200, Math.floor(fim / 4));
  const trecho = texto.slice(fim - janela, fim);
  const quebra = Math.max(trecho.lastIndexOf("\n"), trecho.lastIndexOf(" "));
  return quebra > 0 ? fim - janela + quebra : fim;
}

function inicioLimpo(texto: string, inicio: number): number {
  const janela = Math.min(200, Math.floor((texto.length - inicio) / 4));
  const trecho = texto.slice(inicio, inicio + janela);
  const candidatos = [trecho.indexOf("\n"), trecho.indexOf(" ")].filter((p) => p >= 0);
  return candidatos.length ? inicio + Math.min(...candidatos) + 1 : inicio;
}

/**
 * Corta o texto para caber em `limite` caracteres (marca incluída). Guarda o
 * começo (3/4) e o fim (1/4) do documento, com a marca de corte no meio.
 */
export function cortarTexto(texto: string, limite: number): { texto: string; cortado: boolean } {
  if (texto.length <= limite) return { texto, cortado: false };
  const marca = `\n${MARCA_CORTE}\n`;
  const util = limite - marca.length;
  if (util < 40) {
    const cabeca = texto.slice(0, Math.max(0, limite - MARCA_CORTE.length - 1)).trimEnd();
    return { texto: `${cabeca}\n${MARCA_CORTE}`, cortado: true };
  }
  const tamanhoFim = Math.floor(util / 4);
  const tamanhoInicio = util - tamanhoFim;
  const inicio = texto.slice(0, fimLimpo(texto, tamanhoInicio)).trimEnd();
  const fim = texto.slice(inicioLimpo(texto, texto.length - tamanhoFim)).trimStart();
  return { texto: `${inicio}${marca}${fim}`, cortado: true };
}

/** Aplica o orçamento a uma lista de documentos (mais recentes primeiro). */
export function aplicarOrcamento(
  documentos: DocParaPrompt[],
  orcamento: number,
  minimo = MINIMO_POR_DOCUMENTO,
): SecaoMontada {
  const comTexto = documentos
    .map((d) => ({ titulo: d.titulo.trim() || "Sem título", texto: d.texto.trim() }))
    .filter((d) => d.texto.length > 0);
  const cotas = distribuirOrcamento(
    comTexto.map((d) => d.texto.length),
    orcamento,
    minimo,
  );
  const incluidos: DocNoPrompt[] = [];
  const omitidos: string[] = [];
  comTexto.forEach((d, i) => {
    if (cotas[i] <= 0) {
      omitidos.push(d.titulo);
      return;
    }
    const { texto, cortado } = cortarTexto(d.texto, cotas[i]);
    incluidos.push({ titulo: d.titulo, texto, original: d.texto.length, cortado });
  });
  return { documentos: incluidos, omitidos };
}
