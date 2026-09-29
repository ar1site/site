#!/usr/bin/env node
// Ponte local AR1 Films: Evolution API (WhatsApp espelhado, em Docker neste PC)
// <-> painel AR1 Atendimento (Vercel + Supabase).
//
// O que faz:
//   1. Na partida garante a instância na Evolution, registra o webhook por
//      instância (com base64), consulta o estado e, se não conectado, salva
//      o QR em PNG, sobe no Storage e abre na tela.
//   2. Servidor HTTP em 127.0.0.1:PORTA (POST /evolution) recebe os eventos da
//      Evolution, normaliza (normalizar.mjs), sobe mídia no Storage e repassa
//      ao painel (bridge.message / bridge.status / bridge.qr).
//   3. A cada 3 s lê a fila ar1_wa_outbox (status queued) e envia pelo WhatsApp.
//   4. Heartbeat a cada 5 min (connectionState -> bridge.status).
//
// Node 24, sem dependências externas. Configuração em
// %LOCALAPPDATA%\SistemaACM\ar1-ponte.env (ou PONTE_ENV). Nunca registra segredos.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  BUCKET,
  CAMINHO_QR,
  acharInstancia,
  chaveDeDuplicidade,
  erroCurto,
  idDaRespostaDeEnvio,
  normalizarEvento,
  payloadMensagem,
  payloadQr,
  qrDaResposta,
  statusDaConsulta,
} from "./normalizar.mjs";

// ================================================================ configuração

const PASTA_LOCAL = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || ".", "AppData", "Local"), "SistemaACM");
const ARQUIVO_ENV = process.env.PONTE_ENV || path.join(PASTA_LOCAL, "ar1-ponte.env");
const ARQUIVO_LOG = path.join(PASTA_LOCAL, "ar1-ponte.log");
const ARQUIVO_QR = path.join(PASTA_LOCAL, "ar1-qr.png");
const LOG_MAX_BYTES = 5 * 1024 * 1024;

const INTERVALO_FILA_MS = 3_000;
const INTERVALO_HEARTBEAT_MS = 5 * 60_000;
const INTERVALO_RECONEXAO_MS = 20_000;
const INTERVALO_STATUS_REPETIDO_MS = 60_000;
const INTERVALO_MIN_STATUS_MS = 15_000;
const INTERVALO_MIN_CONNECT_MS = 120_000;
const LIMITE_STATUS_POR_MINUTO = 300;
const INTERVALO_MIN_REINICIO_MS = 15 * 60_000;
const CONTAINER_EVOLUTION = process.env.EVOLUTION_CONTAINER || "ar1-evolution";
const TENTATIVAS_MAX_ENVIO = 3;
const LIMITE_CORPO_BYTES = 80 * 1024 * 1024; // mídia em base64 pode ser grande
const TIMEOUT_HTTP_MS = 45_000;

const EVENTOS_WEBHOOK = ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

function lerEnv(arquivo) {
  const cfg = {};
  let bruto;
  try {
    bruto = fs.readFileSync(arquivo, "utf8");
  } catch (e) {
    throw new Error(`Não consegui ler a configuração em ${arquivo}: ${e.message}`);
  }
  for (const linhaBruta of bruto.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const i = linha.indexOf("=");
    if (i <= 0) continue;
    const chave = linha.slice(0, i).trim();
    let valor = linha.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    cfg[chave] = valor;
  }
  return cfg;
}

function montarConfig() {
  const env = lerEnv(ARQUIVO_ENV);
  const obrig = (k) => {
    const v = (env[k] ?? "").trim();
    if (!v) throw new Error(`Falta ${k} em ${ARQUIVO_ENV}`);
    return v;
  };
  const semBarra = (u) => u.replace(/\/+$/, "");
  const porta = Number(env.PORTA || 3901);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error(`PORTA inválida: ${env.PORTA}`);
  return {
    supabaseUrl: semBarra(obrig("SUPABASE_URL")),
    serviceRole: obrig("SUPABASE_SERVICE_ROLE_KEY"),
    evolutionUrl: semBarra(env.EVOLUTION_URL || "http://127.0.0.1:8080"),
    evolutionApiKey: obrig("EVOLUTION_APIKEY"),
    instancia: (env.EVOLUTION_INSTANCE || "ar1").trim(),
    webhookUrl: obrig("WEBHOOK_URL"),
    porta,
    // URL que a Evolution (dentro do Docker) usa para chegar nesta ponte.
    urlDaPonteParaDocker: (env.PONTE_URL_DOCKER || `http://host.docker.internal:${porta}/evolution`).trim(),
    // ABRIR_QR=0 desliga a abertura automática do PNG na tela (útil em testes).
    abrirQr: (env.ABRIR_QR ?? "1").trim() !== "0",
  };
}

// ======================================================================== log

let segredos = [];

function ocultar(texto) {
  let s = String(texto);
  for (const seg of segredos) {
    if (seg && seg.length >= 6) s = s.split(seg).join("***");
  }
  return s;
}

function rotacionarLogSePreciso() {
  try {
    const st = fs.statSync(ARQUIVO_LOG);
    if (st.size > LOG_MAX_BYTES) {
      const antigo = `${ARQUIVO_LOG}.1`;
      try {
        fs.rmSync(antigo, { force: true });
      } catch {}
      fs.renameSync(ARQUIVO_LOG, antigo);
    }
  } catch {
    // arquivo ainda não existe
  }
}

function registrar(nivel, mensagem, extra) {
  const hora = new Date().toISOString();
  let linha = `${hora} [${nivel}] ${ocultar(mensagem)}`;
  if (extra !== undefined) {
    let e;
    try {
      e = typeof extra === "string" ? extra : JSON.stringify(extra);
    } catch {
      e = String(extra);
    }
    linha += ` ${ocultar(e).slice(0, 2000)}`;
  }
  const saida = nivel === "ERRO" || nivel === "AVISO" ? console.error : console.log;
  saida(linha);
  try {
    fs.mkdirSync(PASTA_LOCAL, { recursive: true });
    rotacionarLogSePreciso();
    fs.appendFileSync(ARQUIVO_LOG, `${linha}\n`);
  } catch {
    // sem disco, sem drama: o console ainda tem o registro
  }
}
const log = {
  info: (m, x) => registrar("INFO", m, x),
  aviso: (m, x) => registrar("AVISO", m, x),
  erro: (m, x) => registrar("ERRO", m, x),
};

// ================================================================ HTTP básico

class ErroHttp extends Error {
  constructor(status, corpo, url) {
    super(`HTTP ${status} em ${url}: ${erroCurto(corpo, 200)}`);
    this.status = status;
    this.corpo = corpo;
  }
}

async function chamar(url, { metodo = "GET", headers = {}, body, timeoutMs = TIMEOUT_HTTP_MS, esperaJson = true } = {}) {
  const init = { method: metodo, headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) };
  if (body !== undefined) {
    if (Buffer.isBuffer(body) || typeof body === "string") init.body = body;
    else {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = init.headers["Content-Type"] || "application/json";
    }
  }
  const resp = await fetch(url, init);
  const textoResp = await resp.text();
  let dados = textoResp;
  if (esperaJson && textoResp) {
    try {
      dados = JSON.parse(textoResp);
    } catch {
      dados = textoResp;
    }
  }
  if (!resp.ok) throw new ErroHttp(resp.status, dados, url.replace(/\?.*$/, ""));
  return dados;
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================ clientes remotos

let cfg;

function evo(caminho, opcoes = {}) {
  return chamar(`${cfg.evolutionUrl}${caminho}`, {
    ...opcoes,
    headers: { apikey: cfg.evolutionApiKey, ...(opcoes.headers || {}) },
  });
}

function sbHeaders(extra = {}) {
  return { apikey: cfg.serviceRole, Authorization: `Bearer ${cfg.serviceRole}`, ...extra };
}

function sbRest(caminho, opcoes = {}) {
  return chamar(`${cfg.supabaseUrl}/rest/v1/${caminho}`, { ...opcoes, headers: sbHeaders(opcoes.headers || {}) });
}

/** Sobe um arquivo no bucket privado (upsert). `caminho` sem o prefixo do bucket. */
async function subirNoStorage(caminho, buffer, contentType) {
  const url = `${cfg.supabaseUrl}/storage/v1/object/${BUCKET}/${caminho.split("/").map(encodeURIComponent).join("/")}`;
  await chamar(url, {
    metodo: "POST",
    headers: sbHeaders({ "x-upsert": "true", "Content-Type": contentType || "application/octet-stream" }),
    body: buffer,
    timeoutMs: 120_000,
  });
  return `${BUCKET}/${caminho}`;
}

/** Envia um payload ao painel. Tenta 3 vezes; nunca lança. */
async function enviarAoPainel(payload) {
  const tipo = payload?.type ?? "?";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      await chamar(cfg.webhookUrl, { metodo: "POST", body: payload, timeoutMs: 30_000 });
      return true;
    } catch (e) {
      const status = e instanceof ErroHttp ? e.status : null;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        log.erro(`painel recusou ${tipo} (${status}); não vou repetir`, erroCurto(e));
        return false;
      }
      log.aviso(`painel indisponível para ${tipo} (tentativa ${tentativa}/3): ${erroCurto(e)}`);
      if (tentativa < 3) await dormir(2_000 * tentativa);
    }
  }
  return false;
}

// ================================================================ estado vivo

const estado = {
  conectado: false,
  estadoConexao: "desconhecido",
  telefone: null,
  qrAbertoNestaExecucao: false,
  ultimoQrEm: 0,
  encerrando: false,
  filaOcupada: false,
  avisoFilaDesconectadaEm: 0,
  ultimoStatusEnviadoEm: 0, // freio dos avisos de estado ao painel
  statusSuprimidos: 0,
  statusPendente: null,
  timerStatus: null,
  verificacaoAgendada: false,
  ultimoConnectEm: 0,
  statusNoMinuto: 0,
  minutosOscilando: 0,
  ultimoReinicioEm: 0,
  mapaOutbox: new Map(), // key.id (WhatsApp) -> outbox.id
  vistos: new Map(), // chave de duplicidade -> timestamp
  timers: [],
};

function lembrarOutbox(externalId, outboxId) {
  if (!externalId || !outboxId) return;
  estado.mapaOutbox.set(externalId, outboxId);
  if (estado.mapaOutbox.size > 2000) {
    const primeira = estado.mapaOutbox.keys().next().value;
    estado.mapaOutbox.delete(primeira);
  }
}

function jaVisto(chave) {
  if (!chave) return false;
  const agora = Date.now();
  for (const [k, t] of estado.vistos) if (agora - t > 10 * 60_000) estado.vistos.delete(k);
  if (estado.vistos.has(chave)) return true;
  estado.vistos.set(chave, agora);
  return false;
}

function aplicarStatus(status) {
  estado.conectado = status.connected === true;
  estado.estadoConexao = status.state;
  if (status.phone) estado.telefone = status.phone;
}

// ====================================================================== QR

async function tratarQr(base64, origem) {
  try {
    const png = Buffer.from(base64, "base64");
    const ehPng = png.length > 32 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
    if (!ehPng) {
      log.aviso(`QR (${origem}) não é um PNG válido (${png.length} bytes); ignorado`);
      return;
    }
    fs.mkdirSync(PASTA_LOCAL, { recursive: true });
    fs.writeFileSync(ARQUIVO_QR, png);
    estado.ultimoQrEm = Date.now();
    log.info(`QR novo (${origem}) salvo em ${ARQUIVO_QR}`);

    try {
      await subirNoStorage(CAMINHO_QR.slice(BUCKET.length + 1), png, "image/png");
    } catch (e) {
      log.erro(`falha ao subir o QR no Storage: ${erroCurto(e)}`);
    }
    await enviarAoPainel(payloadQr());

    if (!estado.qrAbertoNestaExecucao && cfg.abrirQr) {
      estado.qrAbertoNestaExecucao = true;
      abrirNaTela(ARQUIVO_QR);
    }
  } catch (e) {
    log.erro(`erro ao tratar QR: ${erroCurto(e)}`);
  }
}

function abrirNaTela(arquivo) {
  try {
    if (process.platform === "win32") {
      // `start` é interno do cmd; a string vazia é o título obrigatório.
      const p = spawn("cmd.exe", ["/c", "start", "", arquivo], { detached: true, stdio: "ignore", windowsHide: true });
      p.on("error", (e) => log.aviso(`não abri o QR na tela: ${erroCurto(e)}`));
      p.unref();
    } else {
      const p = spawn(process.platform === "darwin" ? "open" : "xdg-open", [arquivo], { detached: true, stdio: "ignore" });
      p.on("error", () => {});
      p.unref();
    }
    log.info("QR aberto na tela. Leia com o celular: WhatsApp > Dispositivos conectados > Conectar dispositivo.");
  } catch (e) {
    log.aviso(`não abri o QR na tela: ${erroCurto(e)}`);
  }
}

// ============================================================ Evolution: setup

async function garantirInstancia() {
  let lista = null;
  try {
    lista = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instancia)}`);
  } catch (e) {
    if (!(e instanceof ErroHttp && e.status === 404)) throw e;
  }
  let inst = acharInstancia(lista, cfg.instancia);
  if (!inst && lista !== null) {
    // Sem o filtro, o retorno traz todas as instâncias.
    try {
      const todas = await evo("/instance/fetchInstances");
      inst = acharInstancia(todas, cfg.instancia);
    } catch {}
  }
  if (inst) {
    log.info(`instância "${cfg.instancia}" já existe (estado: ${inst.estado ?? "?"}${inst.telefone ? `, número ${inst.telefone}` : ""})`);
    if (inst.telefone) estado.telefone = inst.telefone;
    return;
  }

  log.info(`instância "${cfg.instancia}" não existe; criando`);
  const resposta = await evo("/instance/create", {
    metodo: "POST",
    body: {
      instanceName: cfg.instancia,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      // CONFERIR: na v2.3.x o webhook por instância vai aninhado em `webhook`
      // (src/api/dto/instance.dto.ts). Também registramos via /webhook/set logo abaixo.
      webhook: {
        enabled: true,
        url: cfg.urlDaPonteParaDocker,
        byEvents: false,
        base64: true,
        events: EVENTOS_WEBHOOK,
      },
    },
  });
  log.info("instância criada");
  const qr = qrDaResposta(resposta);
  if (qr) await tratarQr(qr, "criação da instância");
}

/**
 * Registra/atualiza o webhook por instância com base64 ligado. O webhook global
 * do docker-compose não tem opção de base64, por isso este passo importa.
 */
async function garantirWebhookDaInstancia() {
  const corpo = {
    enabled: true,
    url: cfg.urlDaPonteParaDocker,
    byEvents: false,
    base64: true,
    events: EVENTOS_WEBHOOK,
  };
  const caminho = `/webhook/set/${encodeURIComponent(cfg.instancia)}`;
  try {
    // CONFERIR: o schema da v2.3.x (webhook.schema.ts) espera { webhook: {...} };
    // a doc pública mostra o corpo plano. Tentamos aninhado e caímos para plano.
    await evo(caminho, { metodo: "POST", body: { webhook: corpo } });
    log.info("webhook da instância configurado (base64 ligado)");
  } catch (e1) {
    if (e1 instanceof ErroHttp && e1.status === 400) {
      try {
        await evo(caminho, { metodo: "POST", body: corpo });
        log.info("webhook da instância configurado (formato plano, base64 ligado)");
        return;
      } catch (e2) {
        log.aviso(`não configurei o webhook da instância: ${erroCurto(e2)}. Mídia será buscada pela API.`);
        return;
      }
    }
    log.aviso(`não configurei o webhook da instância: ${erroCurto(e1)}. Mídia será buscada pela API.`);
  }
}

async function consultarEstado() {
  const r = await evo(`/instance/connectionState/${encodeURIComponent(cfg.instancia)}`);
  const status = statusDaConsulta(r);
  if (!status.phone && estado.telefone) status.phone = estado.telefone;
  return status;
}

/** Pede o QR quando não está conectado. */
async function buscarQrSeDesconectado() {
  if (estado.conectado) return;
  // "connecting": a Evolution já está tentando. Pedir outra conexão abre sessões em duplicidade,
  // que se derrubam umas às outras e geram um ciclo open/connecting.
  if (estado.estadoConexao === "connecting") return;
  if (Date.now() - estado.ultimoConnectEm < INTERVALO_MIN_CONNECT_MS) return;
  estado.ultimoConnectEm = Date.now();
  try {
    const r = await evo(`/instance/connect/${encodeURIComponent(cfg.instancia)}`);
    const qr = qrDaResposta(r);
    if (qr) await tratarQr(qr, "connect");
    else log.info(`connect não devolveu QR (estado ${r?.instance?.state ?? "?"}); aguardando evento qrcode.updated`);
  } catch (e) {
    log.aviso(`não obtive o QR: ${erroCurto(e)}`);
  }
}

async function verificarConexao(motivo) {
  try {
    const status = await consultarEstado();
    aplicarStatus(status);
    log.info(`estado da conexão (${motivo}): ${status.state}${status.phone ? ` (${status.phone})` : ""}`);
    await enviarAoPainel(status);
    if (!status.connected) await buscarQrSeDesconectado();
  } catch (e) {
    log.erro(`falha ao consultar a Evolution (${motivo}): ${erroCurto(e)}`);
    if (estado.conectado) {
      estado.conectado = false;
      estado.estadoConexao = "close";
      await enviarAoPainel({
        type: "bridge.status",
        provider: "evolution",
        connected: false,
        state: "close",
        phone: estado.telefone,
        checked_at: new Date().toISOString(),
        error: `Evolution API fora do ar: ${erroCurto(e, 120)}`,
      });
    }
  }
}

// ========================================================= eventos recebidos

async function obterBase64DaMidia(key) {
  // CONFERIR: corpo { message: { key }, convertToMp4 } e retorno
  // { mediaType, fileName, caption, size, mimetype, base64 } (chat.dto.ts /
  // whatsapp.baileys.service.ts da v2.3.x).
  const r = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instancia)}`, {
    metodo: "POST",
    body: { message: { key }, convertToMp4: false },
    timeoutMs: 120_000,
  });
  const base64 = typeof r?.base64 === "string" ? r.base64 : null;
  if (!base64) throw new Error("resposta sem base64");
  return { base64, mime: typeof r?.mimetype === "string" ? r.mimetype.split(";")[0].trim() : null };
}

async function buscarOutboxPorExternalId(externalId) {
  try {
    const r = await sbRest(`ar1_wa_outbox?select=id&external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
    const id = Array.isArray(r) && r[0]?.id ? String(r[0].id) : null;
    if (id) lembrarOutbox(externalId, id);
    return id;
  } catch (e) {
    log.aviso(`consulta da outbox por external_id falhou: ${erroCurto(e)}`);
    return null;
  }
}

async function tratarMensagem(resultado) {
  const { mensagem, midia } = resultado;

  if (midia) {
    try {
      let base64 = midia.base64;
      let mime = midia.mime;
      if (!base64) {
        const r = await obterBase64DaMidia(midia.key);
        base64 = r.base64;
        if (r.mime) mime = r.mime;
      }
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) throw new Error("mídia vazia");
      await subirNoStorage(midia.caminho, buffer, mime);
      log.info(`mídia ${mensagem.kind} salva em ${mensagem.media_path} (${Math.round(buffer.length / 1024)} KB)`);
    } catch (e) {
      log.erro(`não consegui salvar a mídia de ${mensagem.external_id}: ${erroCurto(e)}`);
      mensagem.media_path = null; // a mensagem vai sem o arquivo; body/mime ficam
      mensagem.body = mensagem.body ?? `[${mensagem.kind}: mídia não recuperada]`;
    }
  }

  if (mensagem.from_me && !mensagem.outbox_id) {
    mensagem.outbox_id = await buscarOutboxPorExternalId(mensagem.external_id);
  }

  const ok = await enviarAoPainel(payloadMensagem(mensagem));
  log.info(
    `${mensagem.from_me ? "enviada" : "recebida"} ${mensagem.kind} ${mensagem.external_id} ${mensagem.from_me ? "para" : "de"} ${mensagem.phone}` +
      `${mensagem.outbox_id ? " (outbox)" : ""}${ok ? "" : " — painel NÃO confirmou"}`,
  );
}

/**
 * Autorreparo. Quando a Evolution acumula conexões duplicadas da mesma sessão ("conflict:
 * replaced"), ela oscila entre open e connecting centenas de vezes por minuto e só um
 * reinício do container resolve. Se a oscilação durar 2 minutos seguidos, reinicia sozinha
 * (no máximo uma vez a cada 15 minutos).
 */
function vigiarOscilacao() {
  const eventos = estado.statusNoMinuto;
  estado.statusNoMinuto = 0;
  estado.minutosOscilando = eventos >= LIMITE_STATUS_POR_MINUTO ? estado.minutosOscilando + 1 : 0;
  if (estado.minutosOscilando < 2) return;
  if (Date.now() - estado.ultimoReinicioEm < INTERVALO_MIN_REINICIO_MS) return;
  estado.ultimoReinicioEm = Date.now();
  estado.minutosOscilando = 0;
  log.aviso(`conexão oscilando (${eventos} eventos de estado no último minuto); reiniciando o container ${CONTAINER_EVOLUTION}`);
  try {
    const p = spawn("docker", ["restart", CONTAINER_EVOLUTION], { stdio: "ignore", windowsHide: true });
    p.on("error", (e) => log.erro(`não consegui reiniciar a Evolution: ${erroCurto(e)}`));
    p.on("exit", (codigo) => {
      if (codigo === 0) {
        log.info("Evolution reiniciada pelo autorreparo");
        agendar(() => verificarConexao("após autorreparo"), 60_000);
      } else log.erro(`docker restart terminou com código ${codigo}`);
    });
  } catch (e) {
    log.erro(`não consegui reiniciar a Evolution: ${erroCurto(e)}`);
  }
}

/** Envia ao painel o último estado conhecido (um aviso só, mesmo depois de uma rajada). */
async function despacharStatus(descricao) {
  const status = estado.statusPendente;
  if (!status) return;
  estado.statusPendente = null;
  const agrupados = estado.statusSuprimidos;
  estado.statusSuprimidos = 0;
  estado.ultimoStatusEnviadoEm = Date.now();
  log.info(`conexão (${descricao}): ${status.state}${agrupados ? ` [${agrupados} avisos agrupados]` : ""}`);
  await enviarAoPainel(status);
  if (status.state === "close" && !estado.verificacaoAgendada) {
    // Se ficou fechada (ex.: sessão encerrada no celular), confere e pede um QR novo.
    estado.verificacaoAgendada = true;
    agendar(async () => {
      estado.verificacaoAgendada = false;
      await verificarConexao("após close");
    }, INTERVALO_RECONEXAO_MS);
  }
}

async function processarEvento(envelope) {
  const resultado = normalizarEvento(envelope, { outboxIdPara: (id) => estado.mapaOutbox.get(id) });
  const chave = chaveDeDuplicidade(resultado, envelope);
  if (jaVisto(chave)) return;

  switch (resultado.tipo) {
    case "mensagem":
      await tratarMensagem(resultado);
      break;
    case "status": {
      estado.statusNoMinuto++;
      // Em instabilidade a Evolution dispara centenas de eventos de estado por minuto (repetidos
      // ou alternando open/connecting). Em 29/09/2026 isso gravou 48 mil eventos em 30 min e
      // derrubou o banco por alguns minutos. Regras: o estado local sempre acompanha; ao painel
      // vai no máximo um aviso a cada 15 s (o último estado), e estado repetido a cada 60 s.
      const antes = estado.estadoConexao;
      if (!resultado.status.phone && estado.telefone) resultado.status.phone = estado.telefone;
      aplicarStatus(resultado.status);
      estado.statusPendente = resultado.status;
      const desdeUltimo = Date.now() - estado.ultimoStatusEnviadoEm;
      const mudou = resultado.status.state !== antes;
      if (!mudou && desdeUltimo < INTERVALO_STATUS_REPETIDO_MS) {
        estado.statusSuprimidos++;
        break;
      }
      if (desdeUltimo < INTERVALO_MIN_STATUS_MS) {
        estado.statusSuprimidos++;
        if (!estado.timerStatus) {
          estado.timerStatus = agendar(async () => {
            estado.timerStatus = null;
            await despacharStatus("agrupado");
          }, INTERVALO_MIN_STATUS_MS - desdeUltimo);
        }
        break;
      }
      await despacharStatus(`${antes} -> ${resultado.status.state}`);
      break;
    }
    case "qr":
      await tratarQr(resultado.base64, "qrcode.updated");
      break;
    case "ignorar":
      log.info(`evento ${resultado.evento ?? "?"} ignorado: ${resultado.motivo}`);
      break;
    default:
      log.info(`evento ${resultado.evento} sem tratamento`);
  }
}

// ============================================================ servidor HTTP

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > LIMITE_CORPO_BYTES) {
        reject(new Error("corpo grande demais"));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

function responder(res, status, corpo) {
  const json = JSON.stringify(corpo);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(json) });
  res.end(json);
}

function criarServidor() {
  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/saude")) {
        responder(res, 200, {
          ok: true,
          instancia: cfg.instancia,
          conectado: estado.conectado,
          estado: estado.estadoConexao,
          telefone: estado.telefone,
          ultimo_qr_em: estado.ultimoQrEm ? new Date(estado.ultimoQrEm).toISOString() : null,
          fila_em_memoria: estado.mapaOutbox.size,
        });
        return;
      }
      if (req.method === "POST" && url.pathname.startsWith("/evolution")) {
        let envelope = null;
        try {
          const corpo = await lerCorpo(req);
          envelope = corpo.length ? JSON.parse(corpo.toString("utf8")) : null;
        } catch (e) {
          log.aviso(`corpo do webhook inválido: ${erroCurto(e)}`);
        }
        responder(res, 200, { ok: true }); // sempre 200: a Evolution não deve reenviar
        if (envelope) {
          processarEvento(envelope).catch((e) => log.erro(`erro ao processar evento: ${erroCurto(e)}`));
        }
        return;
      }
      responder(res, 404, { ok: false });
    } catch (e) {
      log.erro(`erro no servidor: ${erroCurto(e)}`);
      try {
        responder(res, 200, { ok: true });
      } catch {}
    }
  });
  servidor.keepAliveTimeout = 65_000;
  return servidor;
}

// ================================================================ fila de envio

async function atualizarOutbox(id, campos) {
  await sbRest(`ar1_wa_outbox?id=eq.${encodeURIComponent(id)}`, {
    metodo: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: campos,
  });
}

async function enviarItem(item) {
  const tentativas = (Number(item.attempts) || 0) + 1;
  await atualizarOutbox(item.id, { status: "sending", attempts: tentativas, error: null });

  try {
    // CONFERIR: corpo do sendText na v2 é plano { number, text } (sendMessage.dto.ts);
    // a doc pública ainda mostra o formato v1 { number, textMessage: { text } }.
    const r = await evo(`/message/sendText/${encodeURIComponent(cfg.instancia)}`, {
      metodo: "POST",
      body: { number: item.phone, text: item.text },
      timeoutMs: 60_000,
    });
    const externalId = idDaRespostaDeEnvio(r);
    if (externalId) lembrarOutbox(externalId, item.id);
    await atualizarOutbox(item.id, {
      status: "sent",
      external_id: externalId,
      sent_at: new Date().toISOString(),
      error: null,
    });
    log.info(`fila: item ${item.id} enviado para ${item.phone}${externalId ? ` (id ${externalId})` : " (sem id na resposta)"}`);
  } catch (e) {
    const status = e instanceof ErroHttp ? e.status : null;
    const definitivo = (status !== null && status >= 400 && status < 500) || tentativas >= TENTATIVAS_MAX_ENVIO;
    const msg = erroCurto(e, 300);
    if (definitivo) {
      await atualizarOutbox(item.id, { status: "failed", error: msg });
      log.erro(`fila: item ${item.id} falhou de vez (tentativa ${tentativas}): ${msg}`);
    } else {
      await atualizarOutbox(item.id, { status: "queued", error: msg });
      log.aviso(`fila: item ${item.id} voltou para a fila (tentativa ${tentativas}): ${msg}`);
    }
  }
}

async function processarFila() {
  if (estado.filaOcupada || estado.encerrando) return;
  estado.filaOcupada = true;
  try {
    const itens = await sbRest("ar1_wa_outbox?select=id,phone,text,attempts&status=eq.queued&order=created_at.asc&limit=5");
    if (!Array.isArray(itens) || itens.length === 0) return;

    if (!estado.conectado) {
      if (Date.now() - estado.avisoFilaDesconectadaEm > 60_000) {
        estado.avisoFilaDesconectadaEm = Date.now();
        log.aviso(`fila: ${itens.length} mensagem(ns) aguardando, mas o WhatsApp não está conectado (${estado.estadoConexao})`);
      }
      return;
    }

    for (const item of itens) {
      if (estado.encerrando) break;
      try {
        await enviarItem(item);
      } catch (e) {
        log.erro(`fila: erro inesperado no item ${item?.id}: ${erroCurto(e)}`);
      }
    }
  } catch (e) {
    log.aviso(`fila: não consegui consultar a outbox: ${erroCurto(e)}`);
  } finally {
    estado.filaOcupada = false;
  }
}

// ===================================================================== timers

function agendar(fn, ms) {
  const t = setTimeout(() => {
    estado.timers = estado.timers.filter((x) => x !== t);
    Promise.resolve()
      .then(fn)
      .catch((e) => log.erro(`tarefa agendada falhou: ${erroCurto(e)}`));
  }, ms);
  estado.timers.push(t);
  return t;
}

function repetir(fn, ms) {
  const t = setInterval(() => {
    Promise.resolve()
      .then(fn)
      .catch((e) => log.erro(`tarefa periódica falhou: ${erroCurto(e)}`));
  }, ms);
  estado.timers.push(t);
  return t;
}

// ===================================================================== partida

async function esperarEvolution() {
  for (let i = 1; ; i++) {
    try {
      await evo("/", { timeoutMs: 5_000 });
      return;
    } catch (e) {
      if (i === 1 || i % 6 === 0) log.aviso(`Evolution API ainda não responde em ${cfg.evolutionUrl} (${erroCurto(e, 80)}); tentando de novo`);
      await dormir(10_000);
      if (estado.encerrando) return;
    }
  }
}

async function iniciarEvolution() {
  await esperarEvolution();
  if (estado.encerrando) return;
  try {
    await garantirInstancia();
    await garantirWebhookDaInstancia();
    await verificarConexao("partida");
  } catch (e) {
    log.erro(`falha na preparação da Evolution: ${erroCurto(e)}; tento de novo em 30 s`);
    agendar(iniciarEvolution, 30_000);
  }
}

let servidor = null;

function encerrar(sinal) {
  if (estado.encerrando) return;
  estado.encerrando = true;
  log.info(`encerrando (${sinal})`);
  for (const t of estado.timers) clearTimeout(t), clearInterval(t);
  estado.timers = [];
  const sair = () => process.exit(0);
  if (servidor) {
    servidor.close(sair);
    setTimeout(sair, 3_000).unref();
  } else sair();
}

async function principal() {
  try {
    cfg = montarConfig();
  } catch (e) {
    console.error(`[ERRO] ${e.message}`);
    console.error("Crie o arquivo com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_APIKEY e WEBHOOK_URL (veja LEIA-ME.md).");
    process.exit(2);
  }
  // Nada disto pode ir para o log.
  const segredoDoWebhook = cfg.webhookUrl.split("/").filter(Boolean).pop();
  segredos = [cfg.serviceRole, cfg.evolutionApiKey, segredoDoWebhook].filter((s) => s && s.length >= 6);

  log.info(`ponte iniciando — instância "${cfg.instancia}", Evolution ${cfg.evolutionUrl}, porta ${cfg.porta}`);
  log.info(`log em ${ARQUIVO_LOG}; QR em ${ARQUIVO_QR}`);

  servidor = criarServidor();
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(cfg.porta, "127.0.0.1", resolve);
  }).catch((e) => {
    log.erro(`não consegui abrir a porta ${cfg.porta}: ${erroCurto(e)} (outra ponte já está rodando?)`);
    process.exit(3);
  });
  log.info(`ouvindo em http://127.0.0.1:${cfg.porta}/evolution`);

  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));
  process.on("SIGBREAK", () => encerrar("SIGBREAK"));
  process.on("uncaughtException", (e) => log.erro(`exceção não tratada: ${erroCurto(e)}`, e?.stack));
  process.on("unhandledRejection", (e) => log.erro(`promessa rejeitada sem tratamento: ${erroCurto(e)}`));

  repetir(processarFila, INTERVALO_FILA_MS);
  repetir(() => verificarConexao("heartbeat"), INTERVALO_HEARTBEAT_MS);
  repetir(vigiarOscilacao, 60_000);
  await iniciarEvolution();
}

principal().catch((e) => {
  log.erro(`falha fatal na partida: ${erroCurto(e)}`, e?.stack);
  process.exit(1);
});
