"use client";

// Propostas da oportunidade: o botão "Nova proposta" leva ao fluxo premium
// (/propostas/nova já preenchida), o histórico lista as propostas premium e
// as em PDF antigas, com envio do link pelo WhatsApp e as sugestões que
// aparecem depois de gerar. Nada sai para o cliente sem o clique de alguém.

import Link from "next/link";
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
  type RascunhoRecebido,
} from "@/lib/propostas/dados";
import { paraEditor } from "@/lib/propostas/editor";
import { textoTemLink } from "@/lib/propostas/mensagem";
import { ehPremium } from "@/lib/propostas/premium/conteudo";
import { textoDoTotalPremium } from "@/lib/propostas/premium/investimento";
import { ROTULO_STATUS_PROPOSTA } from "@/lib/propostas/premium/publico";
import { diaPorExtenso, textoDoTotal, type Proposta } from "@/lib/propostas/proposta";
import { sugestoesAposProposta } from "@/lib/propostas/sugestoes";
import type { Oportunidade, PropostaRegistro } from "@/lib/tipos";
import { Dialogo } from "./DialogosFunil";
import { EditorProposta, type AberturaDoEditor } from "./EditorProposta";

type Aviso = { tipo: "erro" | "ok"; texto: string } | null;

/** Rascunho "de origem" de uma proposta em PDF já gerada, para abrir o editor antigo como nova versão. */
function rascunhoDoHistorico(p: PropostaRegistro, conteudo: Proposta): RascunhoRecebido {
  return {
    proposta: conteudo,
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

export function totalDoRegistro(p: PropostaRegistro): string {
  if (ehPremium(p.content)) return textoDoTotalPremium(p.content.investimento);
  return textoDoTotal({
    total: p.total ?? 0,
    itensComValor: p.total === null ? 0 : 1,
    itensADefinir: p.pending_items,
  });
}

export function SeloSituacao({ p, agora }: { p: PropostaRegistro; agora: number }) {
  if (p.status === "aceita") {
    return (
      <span className="selo border-ok/60 text-ok">
        Aceita{p.accepted_at ? ` em ${diaCurto(p.accepted_at, agora)}` : ""}
      </span>
    );
  }
  if (p.status === "recusada") return <span className="selo border-erro/60 text-erro">Recusada</span>;
  if (p.sent_at) return <span className="selo border-cobre/60 text-cobre-claro">Enviada em {diaCurto(p.sent_at, agora)}</span>;
  return <span className="selo">{ROTULO_STATUS_PROPOSTA[p.status] ?? "Gerada"}</span>;
}

export function Propostas({
  oportunidade,
  atendimentoId,
  compacto = false,
  aoMudar,
}: {
  oportunidade: Oportunidade;
  /** Conversa do WhatsApp: por onde o link é enviado. */
  atendimentoId: string | null;
  compacto?: boolean;
  /** Chamado depois que uma sugestão foi aceita (para a tela recarregar). */
  aoMudar: () => void | Promise<void>;
}) {
  const { nomeDe } = useEquipe();
  const [lista, setLista] = useState<PropostaRegistro[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [avisoDeMigracao, setAvisoDeMigracao] = useState<string | null>(null);
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
    if (ehPremium(p.content)) return;
    setAbertura({
      original: rascunhoDoHistorico(p, p.content),
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

  return (
    <div className="space-y-3">
      {!compacto && (
        <p className="text-xs leading-relaxed text-apoio">
          A proposta nasce de um formulário curto: a IA escreve a apresentação com os valores da tabela de preços, você
          revisa no editor e decide se envia. Nada é enviado ao cliente sem o seu clique.
        </p>
      )}

      {avisoDeMigracao && (
        <p className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
          {avisoDeMigracao}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/propostas/nova?oportunidade=${oportunidade.id}`}
          className={`botao botao-primario ${compacto ? "w-full py-1.5 text-xs" : "w-full sm:w-auto"}`}
        >
          Nova proposta
        </Link>
        {temLocal && (
          <button
            type="button"
            className={`botao botao-secundario ${compacto ? "w-full py-1.5 text-xs" : "w-full sm:w-auto"}`}
            onClick={continuar}
          >
            Continuar rascunho em PDF
          </button>
        )}
      </div>
      {temLocal && (
        <p className="text-[11px] text-apoio/80">
          Há um rascunho de proposta em PDF guardado neste aparelho.{" "}
          <button type="button" className="underline hover:text-texto" onClick={descartarLocal}>
            Descartar
          </button>
        </p>
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
                  <span className="text-sm font-semibold tracking-wide">
                    {p.number}
                    {p.kind === "premium" ? "" : <span className="ml-1.5 text-[10px] font-normal text-apoio">PDF</span>}
                  </span>
                  <SeloSituacao p={p} agora={agora} />
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
                  {p.kind === "premium" && (
                    <>
                      <dt className="text-apoio">Visualizações</dt>
                      <dd>
                        {p.views}
                        {p.last_viewed_at ? ` · última ${diaCurto(p.last_viewed_at, agora)}` : ""}
                      </dd>
                    </>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.kind === "premium" ? (
                    <Link href={`/propostas/${p.id}`} className="botao botao-secundario flex-1 py-1.5 text-xs sm:flex-none">
                      Abrir
                    </Link>
                  ) : (
                    <a
                      href={`/api/propostas/${p.id}/arquivo`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="botao botao-secundario flex-1 py-1.5 text-xs sm:flex-none"
                    >
                      Baixar
                    </a>
                  )}
                  <button
                    type="button"
                    className="botao botao-primario flex-1 py-1.5 text-xs sm:flex-none"
                    onClick={() => setEnvio(p)}
                    disabled={!atendimentoId}
                    title={atendimentoId ? undefined : "Esta oportunidade não tem conversa no WhatsApp"}
                  >
                    Enviar pelo WhatsApp
                  </button>
                  {p.kind !== "premium" && (
                    <button
                      type="button"
                      className="botao botao-secundario w-full py-1.5 text-xs sm:w-auto"
                      onClick={() => novaVersao(p)}
                    >
                      Editar e gerar nova versão
                    </button>
                  )}
                </div>
                {!atendimentoId && (
                  <p className="mt-2 text-[11px] text-apoio/80">
                    Sem conversa no WhatsApp ligada a esta oportunidade: copie o link na proposta e envie por outro canal.
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

export function EnvioDaProposta({
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
  const premium = proposta.kind === "premium";

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
          {premium
            ? `O cliente recebe uma mensagem com o link da apresentação. O link vale por ${proposta.public_days} dias e pode ser renovado. Edite o texto à vontade, mantendo o link.`
            : "O cliente recebe uma mensagem de texto com o link do PDF. O link vale por 7 dias. Edite o texto à vontade, mantendo o link."}
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
