"use client";

// Propostas da oportunidade: "Montar proposta" (a IA rascunha, a pessoa edita
// e gera o PDF), o histórico, o envio do link pelo WhatsApp e as sugestões
// que aparecem depois de gerar. Nada sai para o cliente sem o clique de alguém.

import { useCallback, useEffect, useState } from "react";
import { useEquipe } from "@/lib/equipe";
import { atualizarOportunidade } from "@/lib/funil/dados";
import { diaCurto, diaEHora } from "@/lib/funil/datas";
import { validarTransicao } from "@/lib/funil/etapas";
import type { SugestaoDeCampo } from "@/lib/funil/sugestoes";
import {
  apagarRascunhoLocal,
  buscarPropostas,
  enviarLink,
  lerRascunhoLocal,
  pedirLink,
  pedirRascunho,
  type RascunhoRecebido,
} from "@/lib/propostas/dados";
import { paraEditor } from "@/lib/propostas/editor";
import { textoTemLink } from "@/lib/propostas/mensagem";
import { diaPorExtenso, textoDoTotal } from "@/lib/propostas/proposta";
import { sugestoesAposProposta } from "@/lib/propostas/sugestoes";
import type { Oportunidade, PropostaRegistro } from "@/lib/tipos";
import { Dialogo } from "./DialogosFunil";
import { EditorProposta, type AberturaDoEditor } from "./EditorProposta";

type Aviso = { tipo: "erro" | "ok"; texto: string } | null;

/** Rascunho "de origem" de uma proposta já gerada, para abrir o editor como nova versão. */
function rascunhoDoHistorico(p: PropostaRegistro): RascunhoRecebido {
  return {
    proposta: p.content,
    origens: {
      titulo: "vazio",
      cliente: "vazio",
      resumo_do_pedido: "vazio",
      escopo: "vazio",
      entregas: "vazio",
      cronograma: "vazio",
      investimento: "vazio",
      condicoes: "vazio",
      validade_dias: "vazio",
      observacoes: "vazio",
    },
    pendencias: [],
    fontesDosValores: [],
    fontes: [`Proposta ${p.number}`, ...p.sources],
    avisos: [],
    valoresSemBase: 0,
    modelo: p.model,
    atendimento_id: p.atendimento_id,
  };
}

function totalDoRegistro(p: PropostaRegistro): string {
  return textoDoTotal({
    total: p.total ?? 0,
    itensComValor: p.total === null ? 0 : 1,
    itensADefinir: p.pending_items,
  });
}

export function Propostas({
  oportunidade,
  atendimentoId,
  compacto = false,
  aoMudar,
}: {
  oportunidade: Oportunidade;
  /** Conversa do WhatsApp: de onde a IA lê as mensagens e por onde o link é enviado. */
  atendimentoId: string | null;
  compacto?: boolean;
  /** Chamado depois que uma sugestão foi aceita (para a tela recarregar). */
  aoMudar: () => void | Promise<void>;
}) {
  const { nomeDe } = useEquipe();
  const [lista, setLista] = useState<PropostaRegistro[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [avisoDeMigracao, setAvisoDeMigracao] = useState<string | null>(null);
  const [montando, setMontando] = useState<"ia" | "sem_ia" | null>(null);
  const [erroRascunho, setErroRascunho] = useState<string | null>(null);
  const [abertura, setAbertura] = useState<AberturaDoEditor | null>(null);
  const [temLocal, setTemLocal] = useState(() => lerRascunhoLocal(oportunidade.id) !== null);
  const [envio, setEnvio] = useState<PropostaRegistro | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [aceitando, setAceitando] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 4000 : 8000);
  }, []);

  const carregar = useCallback(async () => {
    const r = await buscarPropostas(oportunidade.id);
    if (r.ok) {
      setLista(r.propostas);
      setErroLista(null);
      setAvisoDeMigracao(null);
    } else if (r.faltaMigracao) {
      setLista([]);
      setErroLista(null);
      setAvisoDeMigracao(r.erro);
    } else {
      setErroLista(r.erro);
    }
    setAgora(Date.now());
  }, [oportunidade.id]);

  useEffect(() => {
    let ativo = true;
    buscarPropostas(oportunidade.id).then((r) => {
      if (!ativo) return;
      if (r.ok) setLista(r.propostas);
      else if (r.faltaMigracao) {
        setLista([]);
        setAvisoDeMigracao(r.erro);
      } else setErroLista(r.erro);
    });
    return () => {
      ativo = false;
    };
  }, [oportunidade.id]);

  async function montar(semIA: boolean) {
    setMontando(semIA ? "sem_ia" : "ia");
    setErroRascunho(null);
    const r = await pedirRascunho({ oportunidadeId: oportunidade.id, atendimentoId, semIA });
    setMontando(null);
    if (!r.ok) {
      setErroRascunho(r.erro);
      return;
    }
    setAbertura({
      original: r.rascunho,
      estado: paraEditor(r.rascunho.proposta, r.rascunho.fontesDosValores),
      editados: [],
      vindoDe: semIA ? "sem_ia" : "ia",
    });
  }

  function continuar() {
    const local = lerRascunhoLocal(oportunidade.id);
    if (!local) {
      setTemLocal(false);
      return;
    }
    setAbertura({
      original: local.original,
      estado: local.estado,
      editados: local.editados,
      vindoDe: "aparelho",
      salvoEm: local.salvoEm,
    });
  }

  function novaVersao(p: PropostaRegistro) {
    setAbertura({
      original: rascunhoDoHistorico(p),
      estado: paraEditor(p.content),
      editados: [],
      vindoDe: "historico",
    });
  }

  function descartarLocal() {
    apagarRascunhoLocal(oportunidade.id);
    setTemLocal(false);
  }

  const fecharEditor = useCallback(() => {
    setAbertura(null);
    setTemLocal(lerRascunhoLocal(oportunidade.id) !== null);
  }, [oportunidade.id]);

  async function aoGerar(p: PropostaRegistro) {
    setAbertura(null);
    setTemLocal(false);
    mostrar("ok", `Proposta ${p.number} gerada. Baixe o PDF ou envie o link pelo WhatsApp.`);
    await carregar();
  }

  async function aceitar(s: SugestaoDeCampo) {
    let campos: Partial<Oportunidade> = s.campos;
    if (s.campo === "etapa" && s.etapa) {
      const r = validarTransicao({ de: oportunidade.status, para: s.etapa });
      if (!r.ok) {
        mostrar("erro", r.erro);
        return;
      }
      campos = r.campos;
    }
    setAceitando(s.campo);
    const r = await atualizarOportunidade(oportunidade.id, campos);
    setAceitando(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    mostrar("ok", "Sugestão aplicada.");
    await aoMudar();
  }

  const maisRecente = lista?.[0] ?? null;
  const sugestoes = sugestoesAposProposta(oportunidade, maisRecente?.created_at, agora);
  const ocupado = montando !== null;

  return (
    <div className="space-y-3">
      {!compacto && (
        <p className="text-xs leading-relaxed text-apoio">
          A IA monta o rascunho com a conversa, os dados da oportunidade e a base de conhecimento. Você revisa, edita e
          gera o PDF. Nada é enviado ao cliente sem o seu clique.
        </p>
      )}

      {avisoDeMigracao && (
        <p className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
          {avisoDeMigracao}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`botao botao-primario ${compacto ? "w-full py-1.5 text-xs" : "w-full sm:w-auto"}`}
          onClick={() => montar(false)}
          disabled={ocupado}
        >
          {montando === "ia" ? "A IA está montando o rascunho…" : "Montar proposta"}
        </button>
        {temLocal && (
          <button
            type="button"
            className={`botao botao-secundario ${compacto ? "w-full py-1.5 text-xs" : "w-full sm:w-auto"}`}
            onClick={continuar}
            disabled={ocupado}
          >
            Continuar rascunho
          </button>
        )}
      </div>
      {montando === "ia" && (
        <p className="text-xs text-apoio">Lendo a conversa e os documentos. Costuma levar de 10 a 40 segundos.</p>
      )}
      {temLocal && !ocupado && (
        <p className="text-[11px] text-apoio/80">
          Há um rascunho guardado neste aparelho.{" "}
          <button type="button" className="underline hover:text-texto" onClick={descartarLocal}>
            Descartar
          </button>
        </p>
      )}

      {erroRascunho && (
        <div className="space-y-2 rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-xs text-erro" role="alert">
          <p>{erroRascunho}</p>
          <button type="button" className="botao botao-secundario py-1 text-xs" onClick={() => montar(true)} disabled={ocupado}>
            {montando === "sem_ia" ? "Abrindo…" : "Montar sem a IA"}
          </button>
        </div>
      )}

      {aviso && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs ${
            aviso.tipo === "erro" ? "border-erro/50 bg-erro/10 text-erro" : "border-ok/50 bg-ok/10 text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {sugestoes.length > 0 && (
        <ul className="space-y-1.5">
          {sugestoes.map((s) => (
            <li
              key={s.campo}
              className="flex items-center justify-between gap-2 rounded-lg border border-cobre/40 bg-cobre/10 px-3 py-2"
            >
              <span className="min-w-0 break-words text-xs leading-snug">{s.texto}</span>
              <button
                type="button"
                className="botao botao-primario shrink-0 px-3 py-1 text-xs"
                onClick={() => aceitar(s)}
                disabled={aceitando !== null}
              >
                {aceitando === s.campo ? "…" : "Aceitar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Histórico */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-apoio">
          Histórico de propostas{lista && lista.length > 0 ? ` (${lista.length})` : ""}
        </p>
        {erroLista && <p className="text-xs text-erro">{erroLista}</p>}
        {lista === null && !erroLista && <p className="text-xs text-apoio">Buscando propostas…</p>}
        {lista !== null && lista.length === 0 && !avisoDeMigracao && (
          <p className="text-xs text-apoio">Nenhuma proposta gerada para esta oportunidade.</p>
        )}
        {lista !== null && lista.length > 0 && (
          <ul className="space-y-2">
            {lista.map((p) => (
              <li key={p.id} className="rounded-lg border border-borda bg-superficie-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold tracking-wide">{p.number}</span>
                  {p.sent_at ? (
                    <span className="selo border-ok/60 text-ok">Link enviado em {diaCurto(p.sent_at, agora)}</span>
                  ) : (
                    <span className="selo">Ainda não enviada</span>
                  )}
                </div>
                <p className="mt-0.5 break-words text-xs">{p.title}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-apoio">Gerada em</dt>
                  <dd>{diaEHora(p.created_at)}</dd>
                  <dt className="text-apoio">Total</dt>
                  <dd className="font-semibold">{totalDoRegistro(p)}</dd>
                  <dt className="text-apoio">Quem gerou</dt>
                  <dd>{nomeDe(p.created_by) || "equipe"}</dd>
                  <dt className="text-apoio">Válida até</dt>
                  <dd>{diaPorExtenso(p.valid_until)}</dd>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/api/propostas/${p.id}/arquivo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="botao botao-secundario flex-1 py-1.5 text-xs sm:flex-none"
                  >
                    Baixar
                  </a>
                  <button
                    type="button"
                    className="botao botao-primario flex-1 py-1.5 text-xs sm:flex-none"
                    onClick={() => setEnvio(p)}
                    disabled={!atendimentoId}
                    title={atendimentoId ? undefined : "Esta oportunidade não tem conversa no WhatsApp"}
                  >
                    Enviar pelo WhatsApp
                  </button>
                  <button
                    type="button"
                    className="botao botao-secundario w-full py-1.5 text-xs sm:w-auto"
                    onClick={() => novaVersao(p)}
                    disabled={ocupado}
                  >
                    Editar e gerar nova versão
                  </button>
                </div>
                {!atendimentoId && (
                  <p className="mt-2 text-[11px] text-apoio/80">
                    Sem conversa no WhatsApp ligada a esta oportunidade: baixe o PDF e envie por outro canal.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {abertura && (
        <EditorProposta
          oportunidadeId={oportunidade.id}
          atendimentoId={atendimentoId}
          abertura={abertura}
          avisoDeMigracao={avisoDeMigracao}
          aoFechar={fecharEditor}
          aoGerar={aoGerar}
        />
      )}

      {envio && atendimentoId && (
        <EnvioDaProposta
          proposta={envio}
          atendimentoId={atendimentoId}
          aoFechar={() => setEnvio(null)}
          aoEnviar={async (modo) => {
            setEnvio(null);
            mostrar("ok", modo === "fila" ? "Mensagem com o link na fila de envio." : "Mensagem com o link enviada.");
            await carregar();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------ enviar pelo WhatsApp

function EnvioDaProposta({
  proposta,
  atendimentoId,
  aoFechar,
  aoEnviar,
}: {
  proposta: PropostaRegistro;
  atendimentoId: string;
  aoFechar: () => void;
  aoEnviar: (modo: "fila" | "direto") => void | Promise<void>;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    pedirLink(proposta.id).then((r) => {
      if (!ativo) return;
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setLink(r.link);
      setTexto(r.texto);
    });
    return () => {
      ativo = false;
    };
  }, [proposta.id]);

  const semLink = link !== null && !textoTemLink(texto, link);

  async function enviar() {
    if (!link || !texto.trim() || semLink) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarLink({ atendimentoId, texto: texto.trim(), propostaId: proposta.id });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    await aoEnviar(r.modo);
  }

  return (
    <Dialogo titulo={`Enviar a proposta ${proposta.number}`} aoFechar={aoFechar}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-apoio">
          O cliente recebe uma mensagem de texto com o link do PDF. O link vale por 7 dias. Edite o texto à vontade,
          mantendo o link.
        </p>
        {link === null && !erro && <p className="text-sm text-apoio">Preparando o link…</p>}
        {link !== null && (
          <textarea
            className="campo min-h-56 text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={5000}
            aria-label="Mensagem para o cliente"
          />
        )}
        {semLink && (
          <p className="text-xs text-erro" role="alert">
            O texto ficou sem o link da proposta. Feche e abra de novo para recuperar o link.
          </p>
        )}
        {erro && (
          <p className="text-xs text-erro" role="alert">
            {erro}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="botao botao-primario flex-1"
            onClick={enviar}
            disabled={enviando || link === null || !texto.trim() || semLink}
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
          <button type="button" className="botao botao-secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
