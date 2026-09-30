"use client";

// Ajustes → Resumo diário: ligar e desligar, telefones, prévia do texto e
// "Enviar agora". O resumo é interno (vai para o dono), nunca para clientes.

import { useEffect, useState } from "react";
import { formatarTelefone } from "@/lib/formato";
import { diaEHora } from "@/lib/funil/datas";
import {
  CHAVE_ATIVO,
  CHAVE_DESTINATARIOS,
  CHAVE_ULTIMO_ENVIO,
  CHAVES_DO_RESUMO,
  jaEnviouHoje,
  lerAtivo,
  lerDestinatarios,
  lerTelefonesDigitados,
  lerUltimoEnvio,
  MAXIMO_DE_DESTINATARIOS,
  type UltimoEnvio,
} from "@/lib/resumo/ajustes";
import { TAMANHO_DO_RESUMO } from "@/lib/resumo/texto";
import { supabaseNoNavegador } from "@/lib/supabase/browser";

interface RespostaDoResumo {
  ok: boolean;
  enviado?: boolean;
  motivo?: string | null;
  mensagem?: string | null;
  erro?: string;
  texto?: string | null;
  origem_do_texto?: "ia" | "reserva" | "equipe" | null;
  aviso_da_ia?: string | null;
  envios?: { telefone: string; ok: boolean; erro?: string }[];
  ultimo_envio?: unknown;
}

interface Previa {
  texto: string;
  origem: "ia" | "reserva" | "equipe" | null;
  avisoDaIA: string | null;
}

async function pedirResumo(corpo: {
  modo: "previa" | "enviar";
  forcar?: boolean;
  texto?: string;
}): Promise<RespostaDoResumo> {
  try {
    const r = await fetch("/api/resumo/diario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => ({}))) as RespostaDoResumo;
    if (!r.ok && !j.erro) return { ok: false, erro: "Não foi possível montar o resumo. Tente de novo." };
    return j;
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Tente de novo." };
  }
}

const ROTULO_DA_ORIGEM: Record<string, string> = {
  cron: "envio automático",
  interno: "chamada interna",
  equipe: "botão Enviar agora",
};

function emLinhas(telefones: string[]): string {
  return telefones.map(formatarTelefone).join("\n");
}

export function SecaoResumoDiario({ podeEditar }: { podeEditar: boolean }) {
  const [ativo, setAtivo] = useState(true);
  const [telefones, setTelefones] = useState("");
  const [ultimo, setUltimo] = useState<UltimoEnvio | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState<"previa" | "enviar" | null>(null);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [agora] = useState(() => new Date());

  useEffect(() => {
    supabaseNoNavegador()
      .from("ar1_settings")
      .select("key, value")
      .in("key", [...CHAVES_DO_RESUMO])
      .then(({ data }) => {
        const valor = (chave: string): unknown => (data ?? []).find((l) => l.key === chave)?.value;
        setAtivo(lerAtivo(valor(CHAVE_ATIVO)));
        setTelefones(emLinhas(lerDestinatarios(valor(CHAVE_DESTINATARIOS))));
        setUltimo(lerUltimoEnvio(valor(CHAVE_ULTIMO_ENVIO)));
        setCarregado(true);
      });
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const lidos = lerTelefonesDigitados(telefones);
    if (!lidos.ok) {
      setAviso(lidos.erro);
      return;
    }
    setSalvando(true);
    setAviso(null);
    const quando = new Date().toISOString();
    const { error } = await supabaseNoNavegador()
      .from("ar1_settings")
      .upsert(
        [
          { key: CHAVE_ATIVO, value: ativo, updated_at: quando },
          { key: CHAVE_DESTINATARIOS, value: lidos.telefones, updated_at: quando },
        ],
        { onConflict: "key" },
      );
    setSalvando(false);
    if (error) {
      setAviso(`Não foi possível salvar: ${error.message}`);
      return;
    }
    setTelefones(emLinhas(lidos.telefones));
    setAviso("Salvo.");
  }

  async function verPrevia() {
    setOcupado("previa");
    setResultado(null);
    setConfirmando(false);
    const r = await pedirResumo({ modo: "previa" });
    setOcupado(null);
    if (!r.ok || !r.texto) {
      setResultado({ tipo: "erro", texto: r.erro || r.mensagem || "Não foi possível montar a prévia." });
      return;
    }
    setPrevia({ texto: r.texto, origem: r.origem_do_texto ?? null, avisoDaIA: r.aviso_da_ia ?? null });
  }

  const enviadoHoje = jaEnviouHoje(ultimo, agora);

  async function enviarAgora() {
    // Já saiu hoje: pede a confirmação antes de mandar de novo.
    if (enviadoHoje && !confirmando) {
      setConfirmando(true);
      return;
    }
    setOcupado("enviar");
    setResultado(null);
    setConfirmando(false);
    const r = await pedirResumo({ modo: "enviar", forcar: true, texto: previa?.texto.trim() || undefined });
    setOcupado(null);
    if (!r.ok || !r.enviado) {
      setResultado({ tipo: "erro", texto: r.erro || r.mensagem || "O resumo não foi enviado." });
      return;
    }
    setUltimo(lerUltimoEnvio(r.ultimo_envio));
    if (r.texto) setPrevia({ texto: r.texto, origem: r.origem_do_texto ?? null, avisoDaIA: r.aviso_da_ia ?? null });
    const certos = (r.envios ?? []).filter((e) => e.ok);
    const falhas = (r.envios ?? []).filter((e) => !e.ok);
    setResultado({
      tipo: falhas.length ? "erro" : "ok",
      texto:
        `Resumo na fila de envio para ${certos.map((e) => formatarTelefone(e.telefone)).join(", ")}.` +
        (falhas.length
          ? ` Não saiu para ${falhas.map((e) => `${formatarTelefone(e.telefone)} (${e.erro ?? "erro"})`).join(", ")}.`
          : ""),
    });
  }

  return (
    <section className="cartao p-4">
      <h2 className="mb-1 text-sm">Resumo diário</h2>
      <p className="mb-3 text-xs leading-relaxed text-apoio">
        Todo dia às 8h10 o painel manda para o seu WhatsApp um resumo curto: conversas novas, clientes aguardando
        resposta, retomadas pendentes, funil, ações do dia e o que fechou. É uma mensagem interna, só para os telefones
        abaixo. Nunca vai para clientes.
      </p>

      <form onSubmit={salvar} className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-cobre)]"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            disabled={!carregado || !podeEditar}
          />
          <span className="text-sm">Enviar o resumo todo dia</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-apoio">Telefones que recebem (um por linha, com DDD)</span>
          <textarea
            className="campo min-h-20 text-sm"
            value={telefones}
            onChange={(e) => setTelefones(e.target.value)}
            disabled={!carregado || !podeEditar}
            placeholder="62 98106-9562"
            inputMode="tel"
          />
          <span className="mt-1 block text-[11px] text-apoio/80">
            Até {MAXIMO_DE_DESTINATARIOS} telefones. O número precisa ter WhatsApp.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="botao botao-primario" disabled={salvando || !carregado || !podeEditar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {aviso && <span className={`text-xs ${aviso === "Salvo." ? "text-ok" : "text-erro"}`}>{aviso}</span>}
          {!podeEditar && <span className="text-xs text-apoio">Só administradores alteram.</span>}
        </div>
      </form>

      <div className="mt-4 space-y-3 border-t border-borda pt-4">
        <p className="text-xs text-apoio">
          {ultimo
            ? `Último envio: ${diaEHora(ultimo.enviado_em)} (${ROTULO_DA_ORIGEM[ultimo.origem] ?? ultimo.origem}), para ${
                ultimo.destinatarios.length === 1 ? "1 telefone" : `${ultimo.destinatarios.length} telefones`
              }.`
            : "Nenhum resumo enviado ainda."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="botao botao-secundario flex-1 sm:flex-none"
            onClick={verPrevia}
            disabled={ocupado !== null}
          >
            {ocupado === "previa" ? "Montando a prévia…" : previa ? "Atualizar prévia" : "Ver prévia"}
          </button>
          <button
            type="button"
            className="botao botao-primario flex-1 sm:flex-none"
            onClick={enviarAgora}
            disabled={ocupado !== null || !carregado}
          >
            {ocupado === "enviar" ? "Enviando…" : confirmando ? "Confirmar novo envio" : "Enviar agora"}
          </button>
        </div>
        {confirmando && (
          <p className="text-xs text-alerta">
            O resumo de hoje já foi enviado. Toque em &ldquo;Confirmar novo envio&rdquo; para mandar de novo.
          </p>
        )}
        {enviadoHoje && !confirmando && (
          <p className="text-[11px] text-apoio/80">O resumo de hoje já saiu. O envio automático só volta amanhã.</p>
        )}

        {previa && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-apoio">Prévia do texto</p>
              <span
                className={`text-[11px] ${previa.texto.length > TAMANHO_DO_RESUMO ? "text-alerta" : "text-apoio/80"}`}
              >
                {previa.texto.length} de {TAMANHO_DO_RESUMO} caracteres
              </span>
            </div>
            <textarea
              className="campo min-h-64 text-sm leading-relaxed"
              value={previa.texto}
              onChange={(e) => setPrevia({ ...previa, texto: e.target.value, origem: "equipe" })}
              maxLength={1500}
              aria-label="Prévia do resumo diário"
            />
            <p className="text-[11px] leading-snug text-apoio/80">
              {previa.origem === "ia" && "Texto escrito pela IA com os números de agora. "}
              {previa.origem === "reserva" &&
                `Texto montado pelo sistema, com os mesmos números. ${previa.avisoDaIA ? `${previa.avisoDaIA} ` : ""}`}
              {previa.origem === "equipe" && "Texto editado por você. "}
              &ldquo;Enviar agora&rdquo; manda exatamente o que está aqui.
            </p>
          </div>
        )}

        {resultado && (
          <p
            role="status"
            className={`rounded-lg border px-3 py-2 text-xs ${
              resultado.tipo === "erro" ? "border-erro/50 bg-erro/10 text-erro" : "border-ok/50 bg-ok/10 text-ok"
            }`}
          >
            {resultado.texto}
          </p>
        )}
      </div>
    </section>
  );
}
