"use client";

import { useCallback, useEffect, useState } from "react";
import { useEquipe } from "@/lib/equipe";
import {
  CHAVE_DIAS_SEM_RETORNO,
  DIAS_SEM_RETORNO_MAX,
  DIAS_SEM_RETORNO_MIN,
  DIAS_SEM_RETORNO_PADRAO,
  HORAS_UTEIS_SEM_RESPOSTA,
  lerDiasSemRetorno,
} from "@/lib/followups/candidatos";
import { dataHora, tempoRelativo } from "@/lib/formato";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import { ContextoDocs } from "./ContextoDocs";
import { SecaoResumoDiario } from "./ResumoDiario";
import { SecaoTabelaDePrecos } from "./TabelaDePrecos";
import { useUsuarioAtual } from "./Shell";

interface StatusResposta {
  ok: boolean;
  provedor?: "bridge" | "zapi";
  connected?: boolean | null;
  state?: string | null;
  phone?: string | null;
  checked_at?: string | null;
  error?: string | null;
  erro?: string;
}

interface QrResposta {
  ok: boolean;
  provedor?: "bridge" | "zapi";
  imagem?: string | null;
  atualizado_em?: string | null;
  erro?: string;
}

export function Configuracoes() {
  const usuario = useUsuarioAtual();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-4 lg:py-6">
      <h1 className="text-xl">Configurações</h1>
      <SecaoWhatsapp />
      <SecaoInstrucoes podeEditar={usuario.role === "admin"} />
      <SecaoRetomadas podeEditar={usuario.role === "admin"} />
      <SecaoResumoDiario podeEditar={usuario.role === "admin"} />
      <SecaoTabelaDePrecos podeEditar={usuario.role === "admin"} />
      <SecaoBaseDeConhecimento />
      <SecaoEquipe />
    </div>
  );
}

// ---------------------------------------------------------------- WhatsApp

async function consultarStatus(): Promise<StatusResposta> {
  try {
    const r = await fetch("/api/whatsapp/status", { cache: "no-store" });
    return (await r.json()) as StatusResposta;
  } catch {
    return { ok: false, erro: "Não foi possível consultar o estado." };
  }
}

function SecaoWhatsapp() {
  const [status, setStatus] = useState<StatusResposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [qr, setQr] = useState<QrResposta | null>(null);
  const [mostrandoQr, setMostrandoQr] = useState(false);

  const consultar = useCallback(() => {
    setCarregando(true);
    return consultarStatus().then((s) => {
      setStatus(s);
      setCarregando(false);
    });
  }, []);

  useEffect(() => {
    let ativo = true;
    consultarStatus().then((s) => {
      if (ativo) setStatus(s);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function buscarQr() {
    setMostrandoQr(true);
    setQr(null);
    try {
      const r = await fetch("/api/whatsapp/qr", { cache: "no-store" });
      setQr((await r.json()) as QrResposta);
    } catch {
      setQr({ ok: false, erro: "Não foi possível obter o QR code." });
    }
  }

  // Enquanto o QR está visível, atualiza a cada 20 s (ele expira rápido).
  useEffect(() => {
    if (!mostrandoQr) return;
    const t = setInterval(() => {
      buscarQr();
      consultar();
    }, 20_000);
    return () => clearInterval(t);
  }, [mostrandoQr, consultar]);

  const conectado = status?.ok ? status.connected : null;
  const ponte = status?.provedor === "bridge";

  return (
    <section className="cartao p-4">
      <h2 className="mb-3 text-sm">WhatsApp</h2>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            conectado === true ? "bg-ok" : conectado === false ? "bg-erro" : "bg-apoio/50"
          }`}
          aria-hidden
        />
        <p className="text-sm">
          {status === null && "Consultando…"}
          {status && !status.ok && (status.erro || "Não foi possível consultar.")}
          {status?.ok && conectado === true && "Conectado"}
          {status?.ok && conectado === false && "Desconectado"}
          {status?.ok && conectado === null && (ponte ? "Sem informação ainda (a ponte não reportou)" : "Sem informação")}
          {status?.ok && status.phone ? ` · ${status.phone}` : ""}
        </p>
        <span className="flex-1" />
        <button type="button" className="botao botao-secundario py-1 text-xs" onClick={consultar} disabled={carregando}>
          {carregando ? "…" : "Atualizar"}
        </button>
      </div>
      {status?.ok && status.checked_at && (
        <p className="mt-1 text-xs text-apoio">
          Verificado {tempoRelativo(status.checked_at)} ({dataHora(status.checked_at)})
          {status.error ? ` · ${status.error}` : ""}
        </p>
      )}

      <div className="mt-4 border-t border-borda pt-4">
        {!mostrandoQr ? (
          <button type="button" className="botao botao-secundario" onClick={buscarQr}>
            Mostrar QR code
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button type="button" className="botao botao-secundario py-1 text-xs" onClick={buscarQr}>
                Atualizar QR
              </button>
              <button type="button" className="text-xs text-apoio underline" onClick={() => setMostrandoQr(false)}>
                esconder
              </button>
            </div>
            {qr === null && <p className="text-sm text-apoio">Buscando QR code…</p>}
            {qr && qr.imagem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.imagem} alt="QR code para conectar o WhatsApp" className="h-64 w-64 rounded-lg bg-white p-2" />
            )}
            {qr && !qr.imagem && (
              <p className="text-sm text-apoio">
                {qr.erro ||
                  (ponte
                    ? "Nenhum QR code disponível agora. Ele aparece aqui quando a ponte local estiver rodando e o WhatsApp estiver desconectado."
                    : "Nenhum QR code disponível agora.")}
              </p>
            )}
            {qr?.atualizado_em && <p className="text-xs text-apoio">QR gerado {tempoRelativo(qr.atualizado_em)}.</p>}
          </div>
        )}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-apoio">
          <li>No celular, abra o WhatsApp Business.</li>
          <li>Toque em ⋮ (menu) → Dispositivos conectados → Conectar dispositivo.</li>
          <li>Aponte a câmera para o QR code acima.</li>
        </ol>
        {ponte && (
          <p className="mt-2 text-xs text-apoio">
            Este painel usa a ponte local (computador da AR1). Se ela estiver desligada, mensagens novas não chegam e o QR não aparece.
          </p>
        )}
      </div>
    </section>
  );
}

// -------------------------------------------------------------- instruções

function SecaoInstrucoes({ podeEditar }: { podeEditar: boolean }) {
  const [instrucoes, setInstrucoes] = useState("");
  const [servicos, setServicos] = useState("");
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    supabaseNoNavegador()
      .from("ar1_settings")
      .select("key, value")
      .in("key", ["atendimento.instrucoes", "atendimento.servicos"])
      .then(({ data }) => {
        for (const l of data ?? []) {
          if (l.key === "atendimento.instrucoes" && typeof l.value === "string") setInstrucoes(l.value);
          if (l.key === "atendimento.servicos" && Array.isArray(l.value)) setServicos((l.value as string[]).join("\n"));
        }
        setCarregado(true);
      });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setAviso(null);
    const lista = servicos
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const supabase = supabaseNoNavegador();
    const agora = new Date().toISOString();
    const { error } = await supabase.from("ar1_settings").upsert(
      [
        { key: "atendimento.instrucoes", value: instrucoes.trim(), updated_at: agora },
        { key: "atendimento.servicos", value: lista, updated_at: agora },
      ],
      { onConflict: "key" },
    );
    setSalvando(false);
    setAviso(error ? `Não foi possível salvar: ${error.message}` : "Salvo.");
  }

  return (
    <section className="cartao p-4">
      <h2 className="mb-1 text-sm">Instruções para a IA</h2>
      <p className="mb-3 text-xs text-apoio">
        A IA usa este texto para escrever as respostas sugeridas (tom, o que pode e o que não pode prometer, assinatura).
      </p>
      <form onSubmit={salvar} className="space-y-3">
        <textarea
          className="campo min-h-40 text-sm"
          value={instrucoes}
          onChange={(e) => setInstrucoes(e.target.value)}
          disabled={!carregado || !podeEditar}
          aria-label="Instruções de atendimento"
        />
        <label className="block">
          <span className="mb-1 block text-xs text-apoio">Serviços oferecidos (um por linha)</span>
          <textarea
            className="campo min-h-32 text-sm"
            value={servicos}
            onChange={(e) => setServicos(e.target.value)}
            disabled={!carregado || !podeEditar}
          />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="botao botao-primario" disabled={salvando || !carregado || !podeEditar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {aviso && <span className={`text-xs ${aviso === "Salvo." ? "text-ok" : "text-erro"}`}>{aviso}</span>}
          {!podeEditar && <span className="text-xs text-apoio">Só administradores alteram.</span>}
        </div>
      </form>
    </section>
  );
}

// --------------------------------------------------------------- retomadas

function SecaoRetomadas({ podeEditar }: { podeEditar: boolean }) {
  const [dias, setDias] = useState(String(DIAS_SEM_RETORNO_PADRAO));
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    supabaseNoNavegador()
      .from("ar1_settings")
      .select("value")
      .eq("key", CHAVE_DIAS_SEM_RETORNO)
      .maybeSingle()
      .then(({ data }) => {
        setDias(String(lerDiasSemRetorno(data?.value)));
        setCarregado(true);
      });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(dias);
    if (!Number.isInteger(n) || n < DIAS_SEM_RETORNO_MIN || n > DIAS_SEM_RETORNO_MAX) {
      setAviso(`Use um número inteiro de ${DIAS_SEM_RETORNO_MIN} a ${DIAS_SEM_RETORNO_MAX}.`);
      return;
    }
    setSalvando(true);
    setAviso(null);
    const { error } = await supabaseNoNavegador()
      .from("ar1_settings")
      .upsert(
        { key: CHAVE_DIAS_SEM_RETORNO, value: n, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    setSalvando(false);
    setAviso(error ? `Não foi possível salvar: ${error.message}` : "Salvo.");
  }

  return (
    <section className="cartao p-4">
      <h2 className="mb-1 text-sm">Retomadas</h2>
      <p className="mb-3 text-xs text-apoio">
        Todo dia às 8 h a IA procura conversas paradas e deixa a mensagem pronta na tela Retomar. Ela só sugere:
        quem envia é você. Cliente esperando resposta há mais de {HORAS_UTEIS_SEM_RESPOSTA} horas úteis entra sempre.
      </p>
      <form onSubmit={salvar} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-apoio">Dias sem retorno para sugerir retomada</span>
          <input
            type="number"
            inputMode="numeric"
            min={DIAS_SEM_RETORNO_MIN}
            max={DIAS_SEM_RETORNO_MAX}
            step={1}
            className="campo w-28 text-sm"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            disabled={!carregado || !podeEditar}
          />
          <span className="mt-1 block text-[11px] text-apoio/80">
            Vale para conversas em &ldquo;Aguardando cliente&rdquo;. Padrão: {DIAS_SEM_RETORNO_PADRAO} dias.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" className="botao botao-primario" disabled={salvando || !carregado || !podeEditar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {aviso && <span className={`text-xs ${aviso === "Salvo." ? "text-ok" : "text-erro"}`}>{aviso}</span>}
          {!podeEditar && <span className="text-xs text-apoio">Só administradores alteram.</span>}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------- base de conhecimento

function SecaoBaseDeConhecimento() {
  return (
    <section className="cartao p-4">
      <ContextoDocs
        escopo="global"
        titulo="Base de conhecimento da AR1"
        descricao="Coloque aqui o que a IA precisa saber sobre a AR1: serviços e preços, condições comerciais, apresentação e portfólio, perguntas frequentes. Vale para todas as conversas. As instruções acima continuam mandando: se elas disserem para não passar preço, a IA não passa."
      />
    </section>
  );
}

// ------------------------------------------------------------------ equipe

function SecaoEquipe() {
  const { membros, eu, recarregar } = useEquipe();
  return (
    <section className="cartao p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm">Equipe</h2>
        <button type="button" className="text-xs text-apoio underline" onClick={recarregar}>
          atualizar
        </button>
      </div>
      {membros.length === 0 ? (
        <p className="text-sm text-apoio">Carregando…</p>
      ) : (
        <ul className="divide-y divide-borda text-sm">
          {membros.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 py-2">
              <span className="truncate">
                {m.email || m.user_id}
                {m.user_id === eu && <span className="ml-1 text-xs text-apoio">(você)</span>}
              </span>
              <span className="flex gap-1">
                <span className="selo">{m.role === "admin" ? "Administrador" : "Comercial"}</span>
                {!m.active && <span className="selo border-erro/60 text-erro">Inativo</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-apoio">
        Para adicionar alguém: no painel do Supabase, em Authentication → Users → Add user (com e-mail e senha). A pessoa entra na equipe automaticamente.
      </p>
    </section>
  );
}
