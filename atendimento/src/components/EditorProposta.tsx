"use client";

// Editor da proposta: a IA entrega o rascunho, a pessoa confere e edita cada
// campo, e só então gera o PDF. Abre em tela cheia (no celular e no desktop),
// fora do formulário da oportunidade. Nada vai para o cliente por aqui.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tempoRelativo } from "@/lib/formato";
import {
  apagarRascunhoLocal,
  gerarPdf,
  guardarRascunhoLocal,
  type RascunhoRecebido,
} from "@/lib/propostas/dados";
import {
  doEditor,
  SECAO_DO_CAMPO,
  totalDoEditor,
  type PropostaNoEditor,
  type SecaoDoEditor,
} from "@/lib/propostas/editor";
import {
  diaPorExtenso,
  lerValidade,
  LIMITES,
  TEXTO_A_DEFINIR,
  textoDoTotal,
  validaAte,
  VALIDADE_MAXIMA_DIAS,
  VALIDADE_MINIMA_DIAS,
  type CampoDaProposta,
} from "@/lib/propostas/proposta";
import { ROTULO_ORIGEM_DO_CAMPO, type OrigemDoCampo } from "@/lib/propostas/rascunho";
import type { PropostaRegistro } from "@/lib/tipos";

export interface AberturaDoEditor {
  /** O rascunho como chegou (IA, oportunidade ou proposta anterior). */
  original: RascunhoRecebido;
  estado: PropostaNoEditor;
  editados: string[];
  vindoDe: "ia" | "sem_ia" | "aparelho" | "historico";
  /** Quando o rascunho foi guardado neste aparelho (ISO). */
  salvoEm?: string;
}

const CAMPO_DA_SECAO = Object.fromEntries(
  Object.entries(SECAO_DO_CAMPO).map(([campo, secao]) => [secao, campo]),
) as Record<SecaoDoEditor, CampoDaProposta>;

function trocar<T>(lista: T[], i: number, novo: T): T[] {
  return lista.map((x, k) => (k === i ? novo : x));
}

function tirar<T>(lista: T[], i: number): T[] {
  return lista.filter((_, k) => k !== i);
}

export function EditorProposta({
  oportunidadeId,
  atendimentoId,
  abertura,
  avisoDeMigracao,
  aoFechar,
  aoGerar,
}: {
  oportunidadeId: string;
  atendimentoId: string | null;
  abertura: AberturaDoEditor;
  /** Preenchido quando a tabela das propostas ainda não existe no banco. */
  avisoDeMigracao: string | null;
  aoFechar: () => void;
  aoGerar: (proposta: PropostaRegistro) => void;
}) {
  const { original } = abertura;
  const [estado, setEstado] = useState<PropostaNoEditor>(abertura.estado);
  const [editados, setEditados] = useState<Set<string>>(() => new Set(abertura.editados));
  const [erro, setErro] = useState<{ secao: SecaoDoEditor | null; texto: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [agora] = useState(() => new Date());
  const corpo = useRef<HTMLDivElement>(null);

  // Guarda o rascunho neste aparelho a cada mudança (com uma pequena espera).
  useEffect(() => {
    const t = setTimeout(() => {
      guardarRascunhoLocal(oportunidadeId, {
        estado,
        original,
        editados: [...editados],
        salvoEm: new Date().toISOString(),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [estado, editados, original, oportunidadeId]);

  // Tela cheia: trava a rolagem do fundo e fecha com Esc (o rascunho fica guardado).
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aoFechar]);

  function mudar(secao: SecaoDoEditor, novo: Partial<PropostaNoEditor>) {
    setEstado((e) => ({ ...e, ...novo }));
    setEditados((atual) => (atual.has(secao) ? atual : new Set(atual).add(secao)));
    setErro((e) => (e && (e.secao === secao || e.secao === null) ? null : e));
  }

  function mostrarErro(secao: SecaoDoEditor | null, texto: string) {
    setErro({ secao, texto });
    if (secao) {
      requestAnimationFrame(() => {
        corpo.current?.querySelector(`[data-secao="${secao}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }

  async function gerar() {
    const r = doEditor(estado);
    if (!r.ok) {
      mostrarErro(SECAO_DO_CAMPO[r.campo], r.erro);
      return;
    }
    setGerando(true);
    setErro(null);
    const resposta = await gerarPdf({
      oportunidadeId,
      atendimentoId: original.atendimento_id ?? atendimentoId,
      proposta: r.proposta,
      fontes: original.fontes,
      modelo: original.modelo,
    });
    setGerando(false);
    if (!resposta.ok) {
      const campo = resposta.campo as CampoDaProposta | undefined;
      mostrarErro(campo && SECAO_DO_CAMPO[campo] ? SECAO_DO_CAMPO[campo] : null, resposta.erro);
      return;
    }
    apagarRascunhoLocal(oportunidadeId);
    aoGerar(resposta.proposta);
  }

  const total = totalDoEditor(estado.investimento);
  const validade = lerValidade(estado.validade);
  const origemDe = (secao: SecaoDoEditor): OrigemDoCampo =>
    abertura.vindoDe === "historico" ? "vazio" : (original.origens[CAMPO_DA_SECAO[secao]] ?? "vazio");

  const secao = (nome: SecaoDoEditor, titulo: string, filhos: ReactNode, ajuda?: string) => (
    <Secao
      nome={nome}
      titulo={titulo}
      origem={origemDe(nome)}
      editado={editados.has(nome)}
      erro={erro?.secao === nome ? erro.texto : null}
      ajuda={ajuda}
    >
      {filhos}
    </Secao>
  );

  const janela = (
    <div className="fixed inset-0 z-50 flex flex-col bg-fundo" role="dialog" aria-modal="true" aria-label="Editor da proposta">
      <header className="flex items-center gap-3 border-b border-borda bg-superficie-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm leading-tight">Montar proposta</h2>
          <p className="truncate text-xs text-apoio">
            {estado.empresa.trim() || estado.nome.trim() || "Cliente"} · revise tudo antes de gerar o PDF
          </p>
        </div>
        <button type="button" className="botao botao-secundario px-3 py-1.5 text-xs" onClick={aoFechar} disabled={gerando}>
          Fechar
        </button>
      </header>

      <div ref={corpo} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
          {avisoDeMigracao && (
            <p className="rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
              {avisoDeMigracao} Você pode editar à vontade: o rascunho fica guardado neste aparelho, mas o PDF só é
              gerado depois que a migração for aplicada.
            </p>
          )}

          <div className="rounded-lg border border-cobre/50 bg-cobre/10 px-3 py-2 text-xs leading-relaxed">
            {abertura.vindoDe === "ia" && (
              <p>
                <span className="font-semibold text-cobre-claro">Rascunho da IA.</span> Os campos marcados com{" "}
                <span className="selo border-cobre/70 text-cobre-claro">IA</span> foram escritos por ela. Confira e
                ajuste: o PDF sai com o que estiver nesta tela.
              </p>
            )}
            {abertura.vindoDe === "sem_ia" && (
              <p>
                <span className="font-semibold text-cobre-claro">Rascunho sem IA.</span> Só os dados da oportunidade
                foram preenchidos. Escreva o restante.
              </p>
            )}
            {abertura.vindoDe === "aparelho" && (
              <p>
                <span className="font-semibold text-cobre-claro">Rascunho guardado neste aparelho</span>
                {abertura.salvoEm ? ` ${tempoRelativo(abertura.salvoEm)}` : ""}. Continue de onde parou.
              </p>
            )}
            {abertura.vindoDe === "historico" && (
              <p>
                <span className="font-semibold text-cobre-claro">Nova versão.</span> O texto veio de uma proposta já
                gerada. O PDF novo recebe outro número; o anterior continua no histórico.
              </p>
            )}
            {original.fontes.length > 0 && (
              <p className="mt-1 text-apoio">
                <span className="font-semibold text-texto">Baseado em:</span> {original.fontes.join("; ")}
              </p>
            )}
          </div>

          {original.avisos.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
              {original.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          {(original.pendencias ?? []).length > 0 && (
            <div className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-xs leading-relaxed">
              <p className="font-semibold">Antes de enviar, confira (só a equipe vê; não sai no PDF):</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-apoio">
                {(original.pendencias ?? []).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {secao(
            "titulo",
            "Título",
            <input
              className="campo text-sm"
              value={estado.titulo}
              onChange={(e) => mudar("titulo", { titulo: e.target.value })}
              maxLength={LIMITES.titulo}
              placeholder="Ex.: Podcast itinerante na feira de noivas"
              aria-label="Título da proposta"
              autoComplete="off"
            />,
          )}

          {secao(
            "cliente",
            "Cliente",
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-apoio">Nome</span>
                <input className="campo text-sm" value={estado.nome} onChange={(e) => mudar("cliente", { nome: e.target.value })} maxLength={LIMITES.nome} autoComplete="off" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-apoio">Empresa</span>
                <input className="campo text-sm" value={estado.empresa} onChange={(e) => mudar("cliente", { empresa: e.target.value })} maxLength={LIMITES.empresa} placeholder="opcional" autoComplete="off" />
              </label>
            </div>,
          )}

          {secao(
            "resumo",
            "Resumo do pedido",
            <textarea
              className="campo min-h-28 text-sm"
              value={estado.resumo}
              onChange={(e) => mudar("resumo", { resumo: e.target.value })}
              maxLength={LIMITES.resumo}
              aria-label="Resumo do pedido"
            />,
          )}

          {secao(
            "escopo",
            "Escopo",
            <Lista
              vazio="Nenhum item de escopo."
              rotuloAdicionar="Adicionar item"
              cheio={estado.escopo.length >= LIMITES.itensDeEscopo}
              aoAdicionar={() => mudar("escopo", { escopo: [...estado.escopo, { item: "", descricao: "" }] })}
            >
              {estado.escopo.map((e, i) => (
                <Linha key={i} aoRemover={() => mudar("escopo", { escopo: tirar(estado.escopo, i) })} rotuloRemover={`Remover item ${i + 1} do escopo`}>
                  <input
                    className="campo text-sm font-semibold"
                    value={e.item}
                    onChange={(ev) => mudar("escopo", { escopo: trocar(estado.escopo, i, { ...e, item: ev.target.value }) })}
                    maxLength={LIMITES.itemDeEscopo}
                    placeholder="Item (ex.: Gravação no evento)"
                    aria-label={`Item ${i + 1} do escopo`}
                    autoComplete="off"
                  />
                  <textarea
                    className="campo mt-2 min-h-16 text-sm"
                    value={e.descricao}
                    onChange={(ev) => mudar("escopo", { escopo: trocar(estado.escopo, i, { ...e, descricao: ev.target.value }) })}
                    maxLength={LIMITES.descricaoDeEscopo}
                    placeholder="O que está incluído"
                    aria-label={`Descrição do item ${i + 1} do escopo`}
                  />
                </Linha>
              ))}
            </Lista>,
          )}

          {secao(
            "entregas",
            "Entregas",
            <Lista
              vazio="Nenhuma entrega."
              rotuloAdicionar="Adicionar entrega"
              cheio={estado.entregas.length >= LIMITES.entregas}
              aoAdicionar={() => mudar("entregas", { entregas: [...estado.entregas, ""] })}
            >
              {estado.entregas.map((e, i) => (
                <Linha key={i} aoRemover={() => mudar("entregas", { entregas: tirar(estado.entregas, i) })} rotuloRemover={`Remover entrega ${i + 1}`}>
                  <input
                    className="campo text-sm"
                    value={e}
                    onChange={(ev) => mudar("entregas", { entregas: trocar(estado.entregas, i, ev.target.value) })}
                    maxLength={LIMITES.entrega}
                    placeholder="Ex.: 8 episódios editados em 4K"
                    aria-label={`Entrega ${i + 1}`}
                    autoComplete="off"
                  />
                </Linha>
              ))}
            </Lista>,
          )}

          {secao(
            "cronograma",
            "Cronograma",
            <Lista
              vazio="Nenhuma etapa."
              rotuloAdicionar="Adicionar etapa"
              cheio={estado.cronograma.length >= LIMITES.etapas}
              aoAdicionar={() => mudar("cronograma", { cronograma: [...estado.cronograma, { etapa: "", prazo: "" }] })}
            >
              {estado.cronograma.map((e, i) => (
                <Linha key={i} aoRemover={() => mudar("cronograma", { cronograma: tirar(estado.cronograma, i) })} rotuloRemover={`Remover etapa ${i + 1}`}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_12rem]">
                    <input
                      className="campo text-sm"
                      value={e.etapa}
                      onChange={(ev) => mudar("cronograma", { cronograma: trocar(estado.cronograma, i, { ...e, etapa: ev.target.value }) })}
                      maxLength={LIMITES.etapa}
                      placeholder="Etapa"
                      aria-label={`Etapa ${i + 1}`}
                      autoComplete="off"
                    />
                    <input
                      className="campo text-sm"
                      value={e.prazo}
                      onChange={(ev) => mudar("cronograma", { cronograma: trocar(estado.cronograma, i, { ...e, prazo: ev.target.value }) })}
                      maxLength={LIMITES.prazo}
                      placeholder={`Prazo (vazio = ${TEXTO_A_DEFINIR})`}
                      aria-label={`Prazo da etapa ${i + 1}`}
                      autoComplete="off"
                    />
                  </div>
                </Linha>
              ))}
            </Lista>,
          )}

          {secao(
            "investimento",
            "Investimento",
            <>
              <Lista
                vazio="Nenhum item de investimento."
                rotuloAdicionar="Adicionar item"
                cheio={estado.investimento.length >= LIMITES.itensDeInvestimento}
                aoAdicionar={() =>
                  mudar("investimento", { investimento: [...estado.investimento, { descricao: "", valor: "", fonte: null }] })
                }
              >
                {estado.investimento.map((item, i) => (
                  <Linha
                    key={i}
                    aoRemover={() => mudar("investimento", { investimento: tirar(estado.investimento, i) })}
                    rotuloRemover={`Remover item ${i + 1} do investimento`}
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem]">
                      <input
                        className="campo text-sm"
                        value={item.descricao}
                        onChange={(ev) =>
                          mudar("investimento", {
                            investimento: trocar(estado.investimento, i, { ...item, descricao: ev.target.value }),
                          })
                        }
                        maxLength={LIMITES.descricaoDeInvestimento}
                        placeholder="Descrição"
                        aria-label={`Descrição do item ${i + 1} do investimento`}
                        autoComplete="off"
                      />
                      <label className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-apoio">R$</span>
                        <input
                          className="campo text-right text-sm"
                          inputMode="decimal"
                          value={item.valor}
                          onChange={(ev) =>
                            mudar("investimento", {
                              // Valor digitado por uma pessoa deixa de ter a fonte da IA.
                              investimento: trocar(estado.investimento, i, { ...item, valor: ev.target.value, fonte: null }),
                            })
                          }
                          placeholder={TEXTO_A_DEFINIR}
                          aria-label={`Valor do item ${i + 1} em reais`}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    <p className="mt-1 text-[11px] text-apoio/90">
                      {item.valor.trim()
                        ? item.fonte
                          ? `Valor encontrado em: ${item.fonte}`
                          : "Valor informado pela equipe."
                        : `Sem valor: sai como "${TEXTO_A_DEFINIR}" no PDF.`}
                    </p>
                  </Linha>
                ))}
              </Lista>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-borda bg-superficie-2 px-3 py-2">
                <span className="titulo text-xs">{total.itensADefinir > 0 && total.itensComValor > 0 ? "Total parcial" : "Total"}</span>
                <span className="text-right text-sm font-semibold">{textoDoTotal(total)}</span>
              </div>
            </>,
            "A IA só preenche valor que está escrito nos documentos, na conversa ou na oportunidade. O resto fica a definir.",
          )}

          {secao(
            "condicoes",
            "Condições",
            <Lista
              vazio="Nenhuma condição."
              rotuloAdicionar="Adicionar condição"
              cheio={estado.condicoes.length >= LIMITES.condicoes}
              aoAdicionar={() => mudar("condicoes", { condicoes: [...estado.condicoes, ""] })}
            >
              {estado.condicoes.map((c, i) => (
                <Linha key={i} aoRemover={() => mudar("condicoes", { condicoes: tirar(estado.condicoes, i) })} rotuloRemover={`Remover condição ${i + 1}`}>
                  <input
                    className="campo text-sm"
                    value={c}
                    onChange={(ev) => mudar("condicoes", { condicoes: trocar(estado.condicoes, i, ev.target.value) })}
                    maxLength={LIMITES.condicao}
                    placeholder="Ex.: 50% na aprovação e 50% na entrega"
                    aria-label={`Condição ${i + 1}`}
                    autoComplete="off"
                  />
                </Linha>
              ))}
            </Lista>,
          )}

          {secao(
            "validade",
            "Validade",
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={VALIDADE_MINIMA_DIAS}
                  max={VALIDADE_MAXIMA_DIAS}
                  step={1}
                  className="campo w-24 text-sm"
                  value={estado.validade}
                  onChange={(e) => mudar("validade", { validade: e.target.value })}
                  aria-label="Validade em dias"
                />
                <span className="text-sm">dias</span>
              </label>
              <span className="text-xs text-apoio">Gerando hoje, vale até {diaPorExtenso(validaAte(agora, validade))}.</span>
            </div>,
          )}

          {secao(
            "observacoes",
            "Observações",
            <textarea
              className="campo min-h-24 text-sm"
              value={estado.observacoes}
              onChange={(e) => mudar("observacoes", { observacoes: e.target.value })}
              maxLength={LIMITES.observacoes}
              placeholder="Texto que o cliente lê no fim da proposta (opcional)."
              aria-label="Observações"
            />,
            "As observações saem no PDF, para o cliente ler. Recado interno não entra aqui.",
          )}
        </div>
      </div>

      <footer
        className="border-t border-borda bg-superficie-2 px-4 py-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {erro && erro.secao === null ? (
              <p className="text-xs text-erro" role="alert">
                {erro.texto}
              </p>
            ) : erro ? (
              <p className="text-xs text-erro" role="alert">
                Confira o campo marcado em vermelho.
              </p>
            ) : (
              <p className="truncate text-xs text-apoio">
                Total: <span className="font-semibold text-texto">{textoDoTotal(total)}</span> · o rascunho fica guardado
                neste aparelho
              </p>
            )}
          </div>
          <button type="button" className="botao botao-primario w-full sm:w-auto" onClick={gerar} disabled={gerando}>
            {gerando ? "Gerando PDF…" : "Gerar PDF"}
          </button>
        </div>
      </footer>
    </div>
  );

  return createPortal(janela, document.body);
}

// ------------------------------------------------------------------ partes

function SeloDeOrigem({ origem, editado }: { origem: OrigemDoCampo; editado: boolean }) {
  if (editado) return <span className="selo">editado por você</span>;
  if (origem === "vazio") return null;
  return (
    <span className={`selo ${origem === "ia" ? "border-cobre/70 text-cobre-claro" : ""}`}>
      {ROTULO_ORIGEM_DO_CAMPO[origem]}
    </span>
  );
}

function Secao({
  nome,
  titulo,
  origem,
  editado,
  erro,
  ajuda,
  children,
}: {
  nome: SecaoDoEditor;
  titulo: string;
  origem: OrigemDoCampo;
  editado: boolean;
  erro: string | null;
  ajuda?: string;
  children: ReactNode;
}) {
  return (
    <section data-secao={nome} className={`cartao space-y-3 p-4 ${erro ? "border-erro/70" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm">{titulo}</h3>
        <SeloDeOrigem origem={origem} editado={editado} />
      </div>
      {children}
      {ajuda && !erro && <p className="text-[11px] leading-snug text-apoio/80">{ajuda}</p>}
      {erro && (
        <p className="text-xs text-erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}

function Lista({
  vazio,
  rotuloAdicionar,
  cheio,
  aoAdicionar,
  children,
}: {
  vazio: string;
  rotuloAdicionar: string;
  cheio: boolean;
  aoAdicionar: () => void;
  children: ReactNode[];
}) {
  return (
    <div className="space-y-2">
      {children.length === 0 ? <p className="text-xs text-apoio">{vazio}</p> : <ul className="space-y-2">{children}</ul>}
      <button type="button" className="botao botao-secundario w-full py-1.5 text-xs sm:w-auto" onClick={aoAdicionar} disabled={cheio}>
        + {rotuloAdicionar}
      </button>
    </div>
  );
}

function Linha({
  aoRemover,
  rotuloRemover,
  children,
}: {
  aoRemover: () => void;
  rotuloRemover: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-borda bg-superficie-2 p-2">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        className="mt-1 shrink-0 rounded-md p-1.5 text-apoio hover:bg-superficie hover:text-erro"
        onClick={aoRemover}
        aria-label={rotuloRemover}
        title="Remover"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
