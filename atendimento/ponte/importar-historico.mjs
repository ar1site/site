#!/usr/bin/env node
// Importa as conversas recentes do WhatsApp (já sincronizadas pela Evolution API no
// pareamento) para o painel AR1 Atendimento.
//
// Lê as mensagens direto do Postgres da Evolution (container ar1-evolution-db, via
// `docker exec`), escolhe as N conversas mais recentes (só pessoas; grupos, status e
// newsletters ficam de fora), manda as últimas M mensagens de cada uma ao webhook do
// painel marcadas como histórico (não disparam análise automática) e, no fim, pede uma
// análise da IA por conversa e zera o contador de não lidas.
//
// Uso:  node importar-historico.mjs [--conversas 20] [--mensagens 30] [--dias 180] [--sem-ia] [--simular]
// Pode rodar de novo à vontade: o painel ignora mensagens repetidas (external_id).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { BUCKET, erroCurto, normalizarMensagem, payloadMensagem } from "./normalizar.mjs";

const PASTA_LOCAL = path.join(process.env.LOCALAPPDATA || ".", "SistemaACM");
const ARQUIVO_ENV = process.env.PONTE_ENV || path.join(PASTA_LOCAL, "ar1-ponte.env");
const CONTAINER_DB = process.env.EVOLUTION_DB_CONTAINER || "ar1-evolution-db";
const LIMITE_MIDIA_BYTES = 20 * 1024 * 1024;

function opcao(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return padrao;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}
const N_CONVERSAS = Number(opcao("conversas", 20));
const N_MENSAGENS = Number(opcao("mensagens", 30));
const DIAS = Number(opcao("dias", 180));
const SEM_IA = opcao("sem-ia", false) === true;
const SIMULAR = opcao("simular", false) === true;

function lerEnv(arquivo) {
  const cfg = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const l = linha.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i > 0) cfg[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return cfg;
}
const env = lerEnv(ARQUIVO_ENV);
const obrig = (k) => {
  if (!env[k]) throw new Error(`Falta ${k} em ${ARQUIVO_ENV}`);
  return env[k];
};
const cfg = {
  supabaseUrl: obrig("SUPABASE_URL").replace(/\/+$/, ""),
  serviceRole: obrig("SUPABASE_SERVICE_ROLE_KEY"),
  evolutionUrl: (env.EVOLUTION_URL || "http://127.0.0.1:8080").replace(/\/+$/, ""),
  evolutionApiKey: obrig("EVOLUTION_APIKEY"),
  instancia: env.EVOLUTION_INSTANCE || "ar1",
  webhookUrl: obrig("WEBHOOK_URL"),
};
const segredo = cfg.webhookUrl.split("/").filter(Boolean).pop();
const painelUrl = cfg.webhookUrl.replace(/\/api\/whatsapp\/webhook\/.*$/, "");

const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

// ------------------------------------------------------------------ Evolution DB

function consultarEvolution(sql) {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER_DB, "psql", "-U", "evolution", "-d", "evolution", "-At", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql falhou: ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
  const saida = r.stdout.trim();
  return saida ? JSON.parse(saida) : [];
}

function lerMensagensRecentes() {
  const desde = Math.floor(Date.now() / 1000) - DIAS * 86400;
  // Só chats de pessoas (@s.whatsapp.net / @lid). Ordem decrescente para pegar o recente primeiro.
  const sql = `select coalesce(json_agg(t), '[]'::json) from (
    select m."key", m."pushName", m."message", m."messageType", m."messageTimestamp"
    from "Message" m join "Instance" i on i.id = m."instanceId"
    where i.name = '${cfg.instancia.replace(/'/g, "''")}'
      and m."messageTimestamp" >= ${desde}
      and (m."key"->>'remoteJid') not like '%@g.us'
      and (m."key"->>'remoteJid') not like '%@newsletter'
      and (m."key"->>'remoteJid') <> 'status@broadcast'
    order by m."messageTimestamp" desc
    limit 20000
  ) t`;
  return consultarEvolution(sql);
}

// ------------------------------------------------------------------ HTTP

async function chamar(url, { metodo = "GET", headers = {}, body, timeoutMs = 60_000 } = {}) {
  const init = { method: metodo, headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) };
  if (body !== undefined) {
    if (Buffer.isBuffer(body)) init.body = body;
    else {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
  }
  const resp = await fetch(url, init);
  const txt = await resp.text();
  let dados = txt;
  try {
    dados = txt ? JSON.parse(txt) : null;
  } catch {}
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${erroCurto(dados, 200)}`);
  return dados;
}
const sb = (caminho, o = {}) =>
  chamar(`${cfg.supabaseUrl}/rest/v1/${caminho}`, { ...o, headers: { apikey: cfg.serviceRole, Authorization: `Bearer ${cfg.serviceRole}`, ...(o.headers || {}) } });
const evo = (caminho, o = {}) => chamar(`${cfg.evolutionUrl}${caminho}`, { ...o, headers: { apikey: cfg.evolutionApiKey, ...(o.headers || {}) } });

async function subirMidia(midia) {
  let base64 = midia.base64;
  let mime = midia.mime;
  if (!base64) {
    const r = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instancia)}`, {
      metodo: "POST",
      body: { message: { key: midia.key }, convertToMp4: false },
      timeoutMs: 120_000,
    });
    base64 = typeof r?.base64 === "string" ? r.base64 : null;
    if (typeof r?.mimetype === "string") mime = r.mimetype.split(";")[0].trim();
  }
  if (!base64) throw new Error("sem base64");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > LIMITE_MIDIA_BYTES) throw new Error(`tamanho ${buffer.length}`);
  const url = `${cfg.supabaseUrl}/storage/v1/object/${BUCKET}/${midia.caminho.split("/").map(encodeURIComponent).join("/")}`;
  await chamar(url, {
    metodo: "POST",
    headers: { apikey: cfg.serviceRole, Authorization: `Bearer ${cfg.serviceRole}`, "x-upsert": "true", "Content-Type": mime || "application/octet-stream" },
    body: buffer,
    timeoutMs: 120_000,
  });
}

// ------------------------------------------------------------------ principal

async function principal() {
  log(`lendo mensagens dos últimos ${DIAS} dias na Evolution (${CONTAINER_DB})…`);
  const linhas = lerMensagensRecentes();
  log(`${linhas.length} mensagens brutas`);

  const porTelefone = new Map();
  let ignoradas = 0;
  for (const d of linhas) {
    const r = normalizarMensagem(d);
    if (r.tipo !== "mensagem") {
      ignoradas++;
      continue;
    }
    const lista = porTelefone.get(r.mensagem.phone) ?? [];
    lista.push(r);
    porTelefone.set(r.mensagem.phone, lista);
  }
  // Conversas ordenadas pela mensagem mais recente (as listas já vêm em ordem decrescente).
  const conversas = [...porTelefone.entries()]
    .map(([phone, lista]) => ({ phone, lista, ultima: lista[0].mensagem.sent_at, nome: lista.find((x) => !x.mensagem.from_me)?.mensagem.sender_name ?? null }))
    .sort((a, b) => (a.ultima < b.ultima ? 1 : -1))
    .slice(0, N_CONVERSAS);
  log(`${porTelefone.size} conversas encontradas (${ignoradas} mensagens ignoradas); importando ${conversas.length}`);

  if (SIMULAR) {
    for (const c of conversas) log(`  ${c.phone} ${c.nome ?? ""} — ${Math.min(c.lista.length, N_MENSAGENS)} msgs, última ${c.ultima}`);
    return;
  }

  let enviadas = 0;
  let comMidia = 0;
  let semMidia = 0;
  for (const c of conversas) {
    const recorte = c.lista.slice(0, N_MENSAGENS).reverse(); // mais antiga primeiro
    for (const r of recorte) {
      const { mensagem, midia } = r;
      if (midia) {
        try {
          await subirMidia(midia);
          comMidia++;
        } catch (e) {
          semMidia++;
          mensagem.media_path = null;
          mensagem.body = mensagem.body ?? `[${mensagem.kind}: mídia não recuperada]`;
        }
      }
      const payload = payloadMensagem(mensagem);
      payload.message.history = true;
      try {
        await chamar(cfg.webhookUrl, { metodo: "POST", body: payload, timeoutMs: 30_000 });
        enviadas++;
      } catch (e) {
        log(`  falha ao enviar ${mensagem.external_id} de ${c.phone}: ${erroCurto(e)}`);
      }
    }
    log(`  ${c.phone} ${c.nome ?? ""}: ${recorte.length} mensagens`);
  }
  log(`${enviadas} mensagens enviadas ao painel (${comMidia} mídias salvas, ${semMidia} sem arquivo)`);

  // Atendimentos criados/afetados: zera não lidas e pede uma análise por conversa.
  const telefones = conversas.map((c) => c.phone);
  const contatos = await sb(`ar1_wa_contacts?select=id,phone&phone=in.(${telefones.join(",")})`);
  const ids = contatos.map((x) => x.id);
  if (!ids.length) return;
  const atendimentos = await sb(`ar1_atendimentos?select=id,contact_id&status=neq.fechado&contact_id=in.(${ids.join(",")})`);
  await sb(`ar1_atendimentos?id=in.(${atendimentos.map((a) => a.id).join(",")})`, {
    metodo: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: { unread_count: 0 },
  });
  log(`${atendimentos.length} atendimentos com não lidas zeradas`);

  if (SEM_IA) return;
  let analisados = 0;
  for (const a of atendimentos) {
    try {
      await chamar(`${painelUrl}/api/ia/analisar`, {
        metodo: "POST",
        headers: { "x-internal-secret": segredo },
        body: { atendimento_id: a.id },
        timeoutMs: 90_000,
      });
      analisados++;
    } catch (e) {
      log(`  análise falhou para ${a.id}: ${erroCurto(e)}`);
    }
  }
  log(`${analisados}/${atendimentos.length} conversas analisadas pela IA`);
}

principal().catch((e) => {
  console.error(`[ERRO] ${erroCurto(e, 400)}`);
  process.exit(1);
});
