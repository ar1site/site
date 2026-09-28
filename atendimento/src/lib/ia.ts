import "server-only";

// Camada de IA com provedor configurável (AI_PROVIDER):
//   - "openrouter" (padrão): API compatível com OpenAI, via fetch, sem SDK.
//   - "anthropic": SDK oficial da Anthropic com saída estruturada.
// As duas implementações devolvem o mesmo resultado: um objeto validado pelo
// esquema Zod informado.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "./env";

export class ErroIA extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "ErroIA";
  }
}

export interface PedidoEstruturado<T extends z.ZodType> {
  system: string;
  user: string;
  esquema: T;
  /** Nome curto do esquema (a-z, 0-9, _). */
  nomeEsquema: string;
  maxTokens?: number;
}

export interface RespostaEstruturada<T> {
  dados: T;
  modelo: string;
  provedor: "openrouter" | "anthropic";
}

export function modeloAtual(): string {
  return env.aiModel;
}

/** Gera uma resposta estruturada com o provedor configurado. */
export async function gerarEstruturado<T extends z.ZodType>(
  pedido: PedidoEstruturado<T>,
): Promise<RespostaEstruturada<z.infer<T>>> {
  if (env.aiProvider === "anthropic") return viaAnthropic(pedido);
  return viaOpenRouter(pedido);
}

// ------------------------------------------------------------------ utilidades

function validar<T extends z.ZodType>(esquema: T, bruto: unknown): z.infer<T> {
  const r = esquema.safeParse(bruto);
  if (!r.success) {
    throw new ErroIA(
      "A IA respondeu em um formato inesperado. Tente de novo. " +
        `(${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; ")})`,
    );
  }
  return r.data;
}

/** Extrai JSON de um texto que pode vir com ```json ... ``` ou prosa em volta. */
function extrairJson(textoBruto: string): unknown {
  const t = textoBruto.trim();
  const tentativas = [t];
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (cerca?.[1]) tentativas.unshift(cerca[1].trim());
  const ini = t.indexOf("{");
  const fim = t.lastIndexOf("}");
  if (ini >= 0 && fim > ini) tentativas.push(t.slice(ini, fim + 1));
  for (const c of tentativas) {
    try {
      return JSON.parse(c);
    } catch {
      // tenta a próxima
    }
  }
  throw new ErroIA("A IA não devolveu um JSON válido. Tente de novo.");
}

function jsonSchemaDe(esquema: z.ZodType): Record<string, unknown> {
  // Zod 4 gera um JSON Schema com additionalProperties:false e required
  // completo, que é o que o modo strict da OpenAI/OpenRouter exige.
  const js = z.toJSONSchema(esquema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

// ------------------------------------------------------------------ OpenRouter

interface RespostaChat {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string;
  }[];
  error?: { message?: string; code?: number | string };
}

async function chamarOpenRouter(body: Record<string, unknown>): Promise<RespostaChat> {
  let resposta: Response;
  try {
    resposta = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://atendimento.ar1films.com",
        "X-Title": "AR1 Atendimento",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError"
      ? "A IA demorou demais para responder. Tente de novo."
      : "Não foi possível falar com a IA (OpenRouter). Verifique a conexão e tente de novo.";
    throw new ErroIA(msg);
  }

  const textoResposta = await resposta.text();
  let dados: RespostaChat = {};
  try {
    dados = textoResposta ? (JSON.parse(textoResposta) as RespostaChat) : {};
  } catch {
    throw new ErroIA(`A OpenRouter respondeu algo inesperado (HTTP ${resposta.status}).`);
  }

  if (!resposta.ok || dados.error) {
    const detalhe = dados.error?.message || textoResposta.slice(0, 300);
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroIA("A chave da OpenRouter foi recusada. Confira OPENROUTER_API_KEY.", 502);
    }
    if (resposta.status === 402) {
      throw new ErroIA("A conta da OpenRouter está sem créditos.", 502);
    }
    if (resposta.status === 429) {
      throw new ErroIA("A IA está ocupada no momento (limite de uso). Tente de novo em instantes.", 502);
    }
    if (resposta.status === 400) {
      throw new ErroIA(`A IA recusou o pedido: ${detalhe}`, 400);
    }
    throw new ErroIA(`Erro da IA (${resposta.status}): ${detalhe}`, 502);
  }
  return dados;
}

async function viaOpenRouter<T extends z.ZodType>(
  pedido: PedidoEstruturado<T>,
): Promise<RespostaEstruturada<z.infer<T>>> {
  const modelo = env.aiModel;
  const schema = jsonSchemaDe(pedido.esquema);
  const base = {
    model: modelo,
    max_tokens: pedido.maxTokens ?? 4096,
    temperature: 0.2,
    messages: [
      { role: "system", content: pedido.system },
      { role: "user", content: pedido.user },
    ],
  };

  // 1ª tentativa: saída estruturada por response_format (json_schema, strict).
  let dados: RespostaChat;
  try {
    dados = await chamarOpenRouter({
      ...base,
      response_format: {
        type: "json_schema",
        json_schema: { name: pedido.nomeEsquema, strict: true, schema },
      },
    });
  } catch (e) {
    // CONFERIR: nem todo modelo/provedor na OpenRouter aceita response_format.
    // Se recusar (400), tentamos por function calling com tool_choice "auto"
    // (o "forçado" é rejeitado por alguns modelos Claude recentes).
    if (!(e instanceof ErroIA && e.status === 400)) throw e;
    dados = await chamarOpenRouter({
      ...base,
      tools: [
        {
          type: "function",
          function: {
            name: pedido.nomeEsquema,
            description: "Registra a análise estruturada. Chame esta função exatamente uma vez.",
            parameters: schema,
          },
        },
      ],
      tool_choice: "auto",
      messages: [
        {
          role: "system",
          content: `${pedido.system}\n\nResponda SOMENTE chamando a função ${pedido.nomeEsquema}.`,
        },
        { role: "user", content: pedido.user },
      ],
    });
  }

  const escolha = dados.choices?.[0];
  if (!escolha) throw new ErroIA("A IA não devolveu resposta.");
  if (escolha.finish_reason === "length") {
    throw new ErroIA("A resposta da IA ficou grande demais e foi cortada. Tente de novo.");
  }
  if (escolha.finish_reason === "content_filter") {
    throw new ErroIA("A IA não conseguiu analisar esta conversa (filtro de conteúdo).");
  }

  const chamada = escolha.message?.tool_calls?.find(
    (c) => c.function?.name === pedido.nomeEsquema,
  );
  const bruto = chamada?.function?.arguments
    ? extrairJson(chamada.function.arguments)
    : extrairJson(escolha.message?.content ?? "");

  return { dados: validar(pedido.esquema, bruto), modelo, provedor: "openrouter" };
}

// ------------------------------------------------------------------- Anthropic

let anthropic: Anthropic | null = null;
function clienteAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 50_000 });
  }
  return anthropic;
}

function mensagemAnthropic(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "A IA está ocupada no momento (limite de uso). Tente de novo em instantes.";
  }
  if (e instanceof Anthropic.BadRequestError) {
    return `A IA recusou o pedido: ${e.message}`;
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "Não foi possível falar com a IA (Anthropic). Verifique a conexão e tente de novo.";
  }
  if (e instanceof Anthropic.APIError) {
    return `Erro da IA (${e.status ?? "?"}): ${e.message}`;
  }
  if (e instanceof Error) return e.message;
  return "Erro desconhecido na IA.";
}

async function viaAnthropic<T extends z.ZodType>(
  pedido: PedidoEstruturado<T>,
): Promise<RespostaEstruturada<z.infer<T>>> {
  const modelo = env.aiModel;
  try {
    const resposta = await clienteAnthropic().beta.messages.parse({
      model: modelo,
      max_tokens: pedido.maxTokens ?? 4096,
      // Fallback automático por categoria caso os classificadores de segurança
      // recusem a resposta (só na API da Anthropic).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(pedido.esquema),
      },
      system: [{ type: "text", text: pedido.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: pedido.user }],
    });

    if (resposta.stop_reason === "refusal") {
      throw new ErroIA("A IA não conseguiu analisar esta conversa (recusa de segurança).");
    }
    if (resposta.stop_reason === "max_tokens") {
      throw new ErroIA("A resposta da IA ficou grande demais e foi cortada. Tente de novo.");
    }
    if (resposta.parsed_output == null) {
      throw new ErroIA("A IA respondeu em um formato inesperado. Tente de novo.");
    }
    return {
      dados: validar(pedido.esquema, resposta.parsed_output),
      modelo: resposta.model || modelo,
      provedor: "anthropic",
    };
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    throw new ErroIA(mensagemAnthropic(e));
  }
}
