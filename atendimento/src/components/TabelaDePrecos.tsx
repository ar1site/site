"use client";

// Ajustes → Tabela de preços: os itens que as propostas usam. Lista por
// serviço, edição em linha, confirmar, ativar/desativar, adicionar e remover.
// Os valores iniciais são sugeridos e ficam marcados até alguém confirmar.

import { useCallback, useEffect, useState } from "react";
import { alterarItemDePreco, buscarItensDePreco, criarItemDePreco, removerItemDePreco } from "@/lib/precos/dados";
import {
  agruparPorServico,
  AVISO_VALORES_INICIAIS,
  itemVazio,
  paraFormulario,
  precoComUnidade,
  SERVICOS,
  UNIDADES,
  validarItem,
  type ItemDePreco,
  type ItemNoFormulario,
  type Servico,
} from "@/lib/precos/precos";
import { Campo } from "./DialogosFunil";
import { useUsuarioAtual } from "./Shell";

type Aviso = { tipo: "erro" | "ok"; texto: string } | null;

export function SecaoTabelaDePrecos({ podeEditar }: { podeEditar: boolean }) {
  const usuario = useUsuarioAtual();
  const [itens, setItens] = useState<ItemDePreco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [faltaMigracao, setFaltaMigracao] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [novoEm, setNovoEm] = useState<Servico | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const mostrar = useCallback((tipo: "erro" | "ok", texto: string) => {
    setAviso({ tipo, texto });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), tipo === "ok" ? 3000 : 7000);
  }, []);

  useEffect(() => {
    let ativo = true;
    buscarItensDePreco().then((r) => {
      if (!ativo) return;
      if (r.ok) setItens(r.itens);
      else {
        setItens([]);
        setErro(r.erro);
        setFaltaMigracao(r.faltaMigracao === true);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  function trocar(item: ItemDePreco) {
    setItens((lista) => (lista ?? []).map((i) => (i.id === item.id ? item : i)));
  }

  async function marcar(item: ItemDePreco, campos: Partial<Pick<ItemDePreco, "active" | "confirmed">>) {
    setOcupado(item.id);
    const r = await alterarItemDePreco(item.id, campos, usuario.id);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    trocar(r.item);
  }

  async function remover(item: ItemDePreco) {
    if (!window.confirm(`Remover "${item.name}" da tabela? Propostas já geradas não mudam.`)) return;
    setOcupado(item.id);
    const r = await removerItemDePreco(item.id);
    setOcupado(null);
    if (!r.ok) {
      mostrar("erro", r.erro);
      return;
    }
    setItens((lista) => (lista ?? []).filter((i) => i.id !== item.id));
    mostrar("ok", "Item removido.");
  }

  const naoConfirmados = (itens ?? []).filter((i) => !i.confirmed && i.active).length;
  const grupos = agruparPorServico((itens ?? []).filter((i) => mostrarInativos || i.active));

  return (
    <section className="cartao p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm">Tabela de preços</h2>
        <label className="flex items-center gap-1.5 text-xs text-apoio">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          mostrar inativos
        </label>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-apoio">
        As propostas só usam valores desta tabela: a IA escolhe o item e a quantidade, o sistema faz a conta. Item
        desativado não entra em propostas novas.
      </p>
      {naoConfirmados > 0 && (
        <p className="mb-3 rounded-lg border border-alerta/60 bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
          <strong>{AVISO_VALORES_INICIAIS}</strong> {naoConfirmados}{" "}
          {naoConfirmados === 1 ? "item ainda não foi confirmado" : "itens ainda não foram confirmados"}. Propostas que os
          usam recebem um aviso interno.
        </p>
      )}
      {erro && (
        <p className={`mb-3 rounded-lg border px-3 py-2 text-xs ${faltaMigracao ? "border-alerta/60 bg-alerta/10 text-alerta" : "border-erro/50 bg-erro/10 text-erro"}`}>
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className={`mb-3 rounded-lg border px-3 py-2 text-xs ${aviso.tipo === "erro" ? "border-erro/50 bg-erro/10 text-erro" : "border-ok/50 bg-ok/10 text-ok"}`}>
          {aviso.texto}
        </p>
      )}
      {itens === null && <p className="text-sm text-apoio">Carregando a tabela…</p>}

      {itens !== null && !faltaMigracao && (
        <div className="space-y-4">
          {SERVICOS.map((servico) => {
            const grupo = grupos.find((g) => g.servico === servico);
            const lista = grupo?.itens ?? [];
            if (!lista.length && novoEm !== servico && !mostrarInativos) {
              // Serviço sem item ativo: só o botão de adicionar.
              return (
                <div key={servico} className="flex items-center justify-between gap-2 border-t border-borda pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-apoio">{servico}</p>
                  {podeEditar && (
                    <button type="button" className="text-xs text-cobre-claro underline" onClick={() => setNovoEm(servico)}>
                      + adicionar
                    </button>
                  )}
                </div>
              );
            }
            return (
              <div key={servico} className="border-t border-borda pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-apoio">{servico}</p>
                  {podeEditar && novoEm !== servico && (
                    <button type="button" className="text-xs text-cobre-claro underline" onClick={() => setNovoEm(servico)}>
                      + adicionar
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {lista.map((item) =>
                    editando === item.id ? (
                      <li key={item.id}>
                        <FormularioDoItem
                          inicial={paraFormulario(item)}
                          ocupado={ocupado === item.id}
                          aoCancelar={() => setEditando(null)}
                          aoSalvar={async (f) => {
                            const v = validarItem(f);
                            if (!v.ok) return v.erros;
                            setOcupado(item.id);
                            const r = await alterarItemDePreco(item.id, v.campos, usuario.id);
                            setOcupado(null);
                            if (!r.ok) {
                              mostrar("erro", r.erro);
                              return {};
                            }
                            trocar(r.item);
                            setEditando(null);
                            mostrar("ok", "Item salvo.");
                            return null;
                          }}
                        />
                      </li>
                    ) : (
                      <li key={item.id} className={`rounded-lg border border-borda bg-superficie-2 p-3 ${item.active ? "" : "opacity-60"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-snug">{item.name}</p>
                            {item.description && <p className="mt-0.5 text-xs leading-relaxed text-apoio">{item.description}</p>}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-cobre-claro">{precoComUnidade(item)}</p>
                            {item.min_qty > 1 && <p className="text-[11px] text-apoio">mínimo {item.min_qty}</p>}
                          </div>
                        </div>
                        {item.includes.length > 0 && (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-apoio">
                            <span className="font-semibold text-texto">Inclui:</span> {item.includes.join(" · ")}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {item.confirmed ? (
                            <span className="selo border-ok/60 text-ok">Confirmado</span>
                          ) : (
                            <span className="selo border-alerta/60 text-alerta">Valor sugerido, confirmar</span>
                          )}
                          {!item.active && <span className="selo border-erro/60 text-erro">Inativo</span>}
                          <span className="flex-1" />
                          {podeEditar && (
                            <>
                              {!item.confirmed && (
                                <button type="button" className="botao botao-primario px-2.5 py-1 text-xs" onClick={() => marcar(item, { confirmed: true })} disabled={ocupado === item.id}>
                                  Confirmar
                                </button>
                              )}
                              <button type="button" className="botao botao-secundario px-2.5 py-1 text-xs" onClick={() => setEditando(item.id)} disabled={ocupado === item.id}>
                                Editar
                              </button>
                              <button type="button" className="botao botao-secundario px-2.5 py-1 text-xs" onClick={() => marcar(item, { active: !item.active })} disabled={ocupado === item.id}>
                                {item.active ? "Desativar" : "Ativar"}
                              </button>
                              <button type="button" className="botao botao-perigo px-2.5 py-1 text-xs" onClick={() => remover(item)} disabled={ocupado === item.id}>
                                Remover
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ),
                  )}
                  {novoEm === servico && (
                    <li>
                      <FormularioDoItem
                        inicial={itemVazio(servico)}
                        ocupado={ocupado === "novo"}
                        aoCancelar={() => setNovoEm(null)}
                        aoSalvar={async (f) => {
                          const v = validarItem(f);
                          if (!v.ok) return v.erros;
                          setOcupado("novo");
                          const r = await criarItemDePreco(v.campos, usuario.id);
                          setOcupado(null);
                          if (!r.ok) {
                            mostrar("erro", r.erro);
                            return {};
                          }
                          setItens((lista) => [...(lista ?? []), r.item]);
                          setNovoEm(null);
                          mostrar("ok", "Item adicionado (marcado como sugerido até você confirmar).");
                          return null;
                        }}
                      />
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {!podeEditar && <p className="mt-3 text-xs text-apoio">Só administradores alteram a tabela.</p>}
    </section>
  );
}

function FormularioDoItem({
  inicial,
  ocupado,
  aoSalvar,
  aoCancelar,
}: {
  inicial: ItemNoFormulario;
  ocupado: boolean;
  /** Devolve os erros por campo, {} para erro geral já avisado, ou null quando salvou. */
  aoSalvar: (f: ItemNoFormulario) => Promise<Record<string, string> | null>;
  aoCancelar: () => void;
}) {
  const [f, setF] = useState(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const mudar = (campo: keyof ItemNoFormulario, valor: string) => setF((a) => ({ ...a, [campo]: valor }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const r = await aoSalvar(f);
    if (r) setErros(r);
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-lg border border-cobre/50 bg-superficie-2 p-3" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Serviço" erro={erros.service}>
          <select className="campo text-sm" value={f.service} onChange={(e) => mudar("service", e.target.value)}>
            {SERVICOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Nome do item" erro={erros.name}>
          <input className="campo text-sm" value={f.name} onChange={(e) => mudar("name", e.target.value)} maxLength={120} autoComplete="off" />
        </Campo>
        <Campo rotulo="Preço (R$)" erro={erros.price}>
          <input className="campo text-sm" inputMode="decimal" value={f.price} onChange={(e) => mudar("price", e.target.value)} placeholder="2800 ou 2.800,50" autoComplete="off" />
        </Campo>
        <Campo rotulo="Unidade" erro={erros.unit}>
          <select className="campo text-sm" value={f.unit} onChange={(e) => mudar("unit", e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Quantidade mínima" erro={erros.min_qty}>
          <input className="campo text-sm" inputMode="numeric" value={f.min_qty} onChange={(e) => mudar("min_qty", e.target.value)} autoComplete="off" />
        </Campo>
      </div>
      <Campo rotulo="Descrição (o cliente lê)" erro={erros.description}>
        <textarea className="campo min-h-16 text-sm" value={f.description} onChange={(e) => mudar("description", e.target.value)} maxLength={600} />
      </Campo>
      <Campo rotulo="O que inclui (uma linha por item)" erro={erros.includes}>
        <textarea className="campo min-h-20 text-sm" value={f.includes} onChange={(e) => mudar("includes", e.target.value)} />
      </Campo>
      <div className="flex gap-2">
        <button type="submit" className="botao botao-primario" disabled={ocupado}>
          {ocupado ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="botao botao-secundario" onClick={aoCancelar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
