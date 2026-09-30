#!/usr/bin/env node
// Tira capturas das telas do painel com DADOS SIMULADOS (scripts/simular-supabase.mjs).
// Usa o Chrome (ou Edge) instalado, sem dependências. Não toca no banco real.
//
// Uso (com o simulador e o painel já no ar):
//   node scripts/capturar-telas.mjs --saida <pasta> [--app http://127.0.0.1:3100] [--supabase http://127.0.0.1:54999]
//
// O painel precisa ter sido COMPILADO apontando para o simulador (as variáveis
// NEXT_PUBLIC_* entram na compilação) e iniciado com `next start`.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

function opcao(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}

const APP = opcao("app", "http://127.0.0.1:3100").replace(/\/$/, "");
const SUPABASE = opcao("supabase", "http://127.0.0.1:54999").replace(/\/$/, "");
const SAIDA = path.resolve(opcao("saida", "capturas"));
const ESPERA_MS = Number(opcao("espera", "3500"));
mkdirSync(SAIDA, { recursive: true });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Sessão de mentira, entregue pelo simulador.
const sessao = await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST" })).json();
const ref = new URL(SUPABASE).hostname.split(".")[0];
const cookie = {
  name: `sb-${ref}-auth-token`,
  value: `base64-${Buffer.from(JSON.stringify(sessao)).toString("base64url")}`,
};

const chrome = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) {
  console.error("Chrome ou Edge não encontrado. Informe o caminho na variável CHROME.");
  process.exit(1);
}

const porta = 9347;
const perfil = path.join(SAIDA, ".perfil-temporario");
const navegador = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${porta}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let versao;
for (let i = 0; i < 80 && !versao; i += 1) {
  try {
    versao = await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json();
  } catch {
    await espera(250);
  }
}
if (!versao) {
  navegador.kill();
  throw new Error("O Chrome não respondeu.");
}

const ws = new WebSocket(versao.webSocketDebuggerUrl);
await new Promise((ok, falha) => {
  ws.onopen = ok;
  ws.onerror = falha;
});
let seq = 0;
const pendentes = new Map();
const erros = [];
ws.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (j.id && pendentes.has(j.id)) {
    const { ok, falha } = pendentes.get(j.id);
    pendentes.delete(j.id);
    if (j.error) falha(new Error(j.error.message));
    else ok(j.result);
  } else if (j.method === "Runtime.exceptionThrown") {
    erros.push(j.params?.exceptionDetails?.exception?.description ?? "exceção");
  }
};
const enviar = (method, params = {}, sessionId) =>
  new Promise((ok, falha) => {
    seq += 1;
    pendentes.set(seq, { ok, falha });
    ws.send(JSON.stringify({ id: seq, method, params, sessionId }));
  });

const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
const { sessionId } = await enviar("Target.attachToTarget", { targetId, flatten: true });
const cdp = (method, params) => enviar(method, params, sessionId);
await cdp("Page.enable");
await cdp("Network.enable");
await cdp("Runtime.enable");
await cdp("Network.setCookie", { ...cookie, domain: new URL(APP).hostname, path: "/" });

const DESKTOP = { nome: "desktop", w: 1440, h: 900, celular: false };
const CELULAR = { nome: "celular", w: 390, h: 844, celular: true };

/** Escolhe uma opção num <select> como uma pessoa faria (o React enxerga a mudança). */
const escolher = (seletor, valor) => `(() => {
  const s = document.querySelector(${JSON.stringify(seletor)});
  if (!s) return "select não encontrado";
  const definir = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  definir.call(s, ${JSON.stringify(valor)});
  s.dispatchEvent(new Event("change", { bubbles: true }));
  return "ok";
})()`;
const clicar = (texto) => `(() => {
  const b = [...document.querySelectorAll("button, summary, a")].find((e) => e.offsetParent !== null && e.textContent.trim().startsWith(${JSON.stringify(texto)}));
  if (!b) return "não encontrado";
  b.click();
  return "ok";
})()`;
const rolar = (seletor) => `(() => {
  const e = [...document.querySelectorAll("h2, h3, p")].find(
    (h) => h.offsetParent !== null && h.textContent.trim() === ${JSON.stringify(seletor)},
  );
  if (!e) return "não encontrado";
  e.scrollIntoView({ block: "start" });
  window.scrollBy(0, -12);
  return "ok";
})()`;
/** Espera um texto aparecer na tela (resposta do servidor, da IA simulada…). */
const esperarTexto = (texto, limiteMs = 20000) => `(async () => {
  // Sem diferenciar maiúsculas (títulos saem em caixa alta) e olhando também os campos de texto.
  const alvo = ${JSON.stringify(texto)}.toLowerCase();
  const naTela = () =>
    [document.body.innerText, ...[...document.querySelectorAll("textarea, input")].map((c) => c.value)]
      .join("\\n")
      .toLowerCase();
  const fim = Date.now() + ${limiteMs};
  while (Date.now() < fim) {
    if (naTela().includes(alvo)) return "ok";
    await new Promise((r) => setTimeout(r, 200));
  }
  return "não apareceu: " + ${JSON.stringify(texto)};
})()`;
/** Retângulo (na página inteira) da seção que tem este título, para recortar a captura. */
const retanguloDaSecao = (titulo) => `(() => {
  const h = [...document.querySelectorAll("h2")].find(
    (e) => e.offsetParent !== null && e.textContent.trim() === ${JSON.stringify(titulo)},
  );
  const s = h?.closest("section");
  if (!s) return null;
  const r = s.getBoundingClientRect();
  return JSON.stringify({ x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height });
})()`;

const OPORTUNIDADE = "b0000000-0000-4000-8000-000000000001";
const CONVERSA = "d0000000-0000-4000-8000-000000000001";

const capturas = [
  { arquivo: "01-funil-desktop", rota: "/funil", modo: DESKTOP },
  { arquivo: "02-funil-celular", rota: "/funil", modo: CELULAR },
  { arquivo: "03-funil-celular-proposta", rota: "/funil", modo: CELULAR, acoes: [clicar("Proposta2")] },
  {
    arquivo: "04-funil-celular-mover-para-perdido",
    rota: "/funil",
    modo: CELULAR,
    acoes: [clicar("Proposta2"), escolher("article select", "lost")],
  },
  {
    arquivo: "05-funil-desktop-mover-para-ganho",
    rota: "/funil",
    modo: DESKTOP,
    acoes: [escolher("section[aria-label='Negociação'] article select", "won")],
  },
  { arquivo: "06-funil-desktop-nova-oportunidade", rota: "/funil", modo: DESKTOP, acoes: [clicar("+ Nova oportunidade")] },
  { arquivo: "07-detalhe-celular", rota: `/funil/${OPORTUNIDADE}`, modo: CELULAR },
  { arquivo: "08-detalhe-celular-comercial", rota: `/funil/${OPORTUNIDADE}`, modo: CELULAR, acoes: [rolar("Comercial")] },
  { arquivo: "09-detalhe-desktop-painel", rota: `/funil/${OPORTUNIDADE}`, modo: DESKTOP },
  { arquivo: "10-retomar-celular", rota: "/retomar", modo: CELULAR },
  // Página inteira: a barra de baixo é fixa e por isso aparece no meio da imagem.
  { arquivo: "11-retomar-celular-pagina-inteira", rota: "/retomar", modo: CELULAR, paginaInteira: true },
  { arquivo: "12-retomar-desktop", rota: "/retomar", modo: DESKTOP },
  { arquivo: "13-fila-celular-selo-do-funil", rota: "/", modo: CELULAR },
  { arquivo: "14-conversa-celular-oportunidade", rota: `/atendimento/${CONVERSA}`, modo: CELULAR, acoes: [clicar("Análise da IA"), rolar("Oportunidade")] },
  { arquivo: "15-conversa-desktop-oportunidade", rota: `/atendimento/${CONVERSA}`, modo: { ...DESKTOP, w: 1600 } },
  { arquivo: "16-ajustes-celular-retomadas", rota: "/configuracoes", modo: CELULAR, acoes: [rolar("Retomadas")] },

  // Propostas em PDF -----------------------------------------------------------
  {
    arquivo: "17-propostas-historico-celular",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: CELULAR,
    acoes: [esperarTexto("Histórico de propostas (2)"), rolar("Propostas")],
  },
  {
    arquivo: "18-propostas-historico-desktop",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: DESKTOP,
    acoes: [esperarTexto("Histórico de propostas (2)"), rolar("Propostas")],
  },
  {
    arquivo: "19-proposta-editor-desktop",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: DESKTOP,
    acoes: [clicar("Montar proposta"), esperarTexto("Rascunho da IA")],
  },
  {
    arquivo: "20-proposta-editor-desktop-investimento",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: DESKTOP,
    acoes: [clicar("Montar proposta"), esperarTexto("Rascunho da IA"), rolar("Cronograma")],
  },
  {
    arquivo: "21-proposta-editor-celular",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: CELULAR,
    acoes: [clicar("Montar proposta"), esperarTexto("Rascunho da IA")],
  },
  {
    arquivo: "22-proposta-editor-celular-investimento",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: CELULAR,
    acoes: [clicar("Montar proposta"), esperarTexto("Rascunho da IA"), rolar("Investimento")],
  },
  {
    // Gera o PDF de verdade (pela rota do painel), guardado no Storage simulado.
    arquivo: "23-proposta-gerada-celular",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: CELULAR,
    acoes: [
      clicar("Montar proposta"),
      esperarTexto("Rascunho da IA"),
      clicar("Gerar PDF"),
      esperarTexto("Histórico de propostas (3)"),
      rolar("Propostas"),
    ],
  },
  {
    arquivo: "24-proposta-enviar-whatsapp-celular",
    rota: `/funil/${OPORTUNIDADE}`,
    modo: CELULAR,
    acoes: [esperarTexto("Histórico de propostas (3)"), clicar("Enviar pelo WhatsApp"), esperarTexto("Segue a proposta")],
  },
  {
    arquivo: "25-conversa-desktop-propostas",
    rota: `/atendimento/${CONVERSA}`,
    modo: { ...DESKTOP, w: 1600 },
    acoes: [esperarTexto("Histórico de propostas (3)"), rolar("Oportunidade")],
  },

  // Resumo diário ----------------------------------------------------------------
  {
    arquivo: "26-ajustes-resumo-diario-celular",
    rota: "/configuracoes",
    modo: CELULAR,
    acoes: [rolar("Resumo diário"), clicar("Ver prévia"), esperarTexto("Prévia do texto"), rolar("Resumo diário")],
    secao: "Resumo diário",
  },
  {
    arquivo: "27-ajustes-resumo-diario-desktop",
    rota: "/configuracoes",
    modo: DESKTOP,
    acoes: [rolar("Resumo diário"), clicar("Ver prévia"), esperarTexto("Prévia do texto"), rolar("Resumo diário")],
    secao: "Resumo diário",
  },
];

// --so <texto>: tira só as capturas cujo nome contém o texto (ex.: --so proposta).
const SO = opcao("so", "");

const relatorio = [];
for (const c of capturas.filter((x) => !SO || x.arquivo.includes(SO))) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: c.modo.w,
    height: c.modo.h,
    deviceScaleFactor: c.modo.celular ? 2 : 1,
    mobile: c.modo.celular,
  });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: c.modo.celular });
  erros.length = 0;
  await cdp("Page.navigate", { url: APP + c.rota });
  await espera(ESPERA_MS);
  // Se a tela ainda estiver buscando dados, espera mais um pouco (até 10 s).
  for (let i = 0; i < 20; i += 1) {
    const { result: estado } = await cdp("Runtime.evaluate", {
      expression: `document.readyState === "complete" && !/Carregando/.test(document.body.innerText)`,
      returnByValue: true,
    });
    if (estado.value) break;
    await espera(500);
  }
  const acoes = [];
  for (const acao of c.acoes ?? []) {
    const { result } = await cdp("Runtime.evaluate", { expression: acao, returnByValue: true, awaitPromise: true });
    acoes.push(result.value);
    await espera(700);
  }
  const { result } = await cdp("Runtime.evaluate", {
    expression: `JSON.stringify({
      titulo: document.title,
      rota: location.pathname,
      larguraDoc: document.documentElement.scrollWidth,
      larguraJanela: innerWidth,
      alturaDoc: document.documentElement.scrollHeight,
      carregando: /Carregando/.test(document.body.innerText),
    })`,
    returnByValue: true,
  });
  const info = JSON.parse(result.value);
  const parametros = { format: "png" };
  if (c.paginaInteira) {
    parametros.captureBeyondViewport = true;
    parametros.clip = { x: 0, y: 0, width: c.modo.w, height: Math.min(info.alturaDoc, 6000), scale: 1 };
  }
  if (c.secao) {
    // A seção inteira, mesmo que seja mais alta que a tela: a janela cresce até
    // ela caber (assim a barra fixa de baixo não fica no meio da imagem).
    const medir = async () => {
      const { result: r } = await cdp("Runtime.evaluate", { expression: retanguloDaSecao(c.secao), returnByValue: true });
      return r.value ? JSON.parse(r.value) : null;
    };
    const antes = await medir();
    if (antes) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width: c.modo.w,
        height: Math.min(Math.ceil(antes.height) + 160, 5000),
        deviceScaleFactor: c.modo.celular ? 2 : 1,
        mobile: c.modo.celular,
      });
      await espera(400);
      await cdp("Runtime.evaluate", { expression: rolar(c.secao), returnByValue: true });
      await espera(400);
    }
  }
  const { data } = await cdp("Page.captureScreenshot", parametros);
  writeFileSync(path.join(SAIDA, `${c.arquivo}.png`), Buffer.from(data, "base64"));
  const linha = {
    arquivo: `${c.arquivo}.png`,
    ...info,
    rolagemHorizontal: info.larguraDoc > info.larguraJanela,
    acoes,
    erros: [...erros],
  };
  relatorio.push(linha);
  console.log(
    `${linha.arquivo}  ${info.rota}  ${c.modo.nome}` +
      `${linha.rolagemHorizontal ? "  ATENÇÃO: rolagem horizontal" : ""}` +
      `${info.carregando ? "  ATENÇÃO: ainda carregando" : ""}` +
      `${acoes.some((a) => a !== "ok") ? `  ATENÇÃO: ação falhou (${acoes.join(", ")})` : ""}` +
      `${erros.length ? `  ERROS: ${erros.length}` : ""}`,
  );
}

writeFileSync(path.join(SAIDA, "relatorio.json"), JSON.stringify(relatorio, null, 2));
ws.close();
navegador.kill();
await espera(800);
try {
  rmSync(perfil, { recursive: true, force: true });
} catch {
  // o Chrome ainda pode estar soltando os arquivos; o perfil temporário pode ser apagado depois
}
console.log(`Capturas em ${SAIDA}`);
