"use client";

// Sugestões da IA para a oportunidade, uma por linha, cada uma com Aceitar.
// Aceitar aplica só aquele campo. Sem clique, nada muda.

import { useState } from "react";
import { temSugestao } from "@/lib/analise/oportunidade";
import { atualizarOportunidade } from "@/lib/funil/dados";
import { transicaoPede, validarTransicao, type CamposDaTransicao } from "@/lib/funil/etapas";
import { sugestoesParaOportunidade, type SugestaoDeCampo } from "@/lib/funil/sugestoes";
import { tempoRelativo } from "@/lib/formato";
import type { Oportunidade, OportunidadeIA } from "@/lib/tipos";
import { DialogoDeEtapa, type PedidoDeEtapa } from "./DialogosFunil";

export function SugestoesIA({
  oportunidade,
  ia,
  aoAplicar,
  compacto = false,
}: {
  oportunidade: Oportunidade;
  ia: OportunidadeIA | null;
  /** Chamado depois que um campo foi gravado (para a tela recarregar). */
  aoAplicar: (campos: Partial<Oportunidade>) => void;
  compacto?: boolean;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedido, setPedido] = useState<PedidoDeEtapa | null>(null);

  const linhas = sugestoesParaOportunidade(ia, oportunidade);

  async function gravar(chave: string, campos: Partial<Oportunidade>) {
    setOcupado(chave);
    setErro(null);
    const r = await atualizarOportunidade(oportunidade.id, campos);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.erro);
      return false;
    }
    aoAplicar(campos);
    return true;
  }

  function aceitar(linha: SugestaoDeCampo) {
    if (linha.campo !== "etapa") {
      void gravar(linha.campo, linha.campos);
      return;
    }
    const para = linha.etapa!;
    if (transicaoPede(para)) {
      // Ganho pede o valor final e Perdido pede o motivo: quem confirma é a pessoa.
      setPedido({ oportunidade, para, motivoInicial: para === "lost" ? (ia?.motivo ?? "") : undefined });
      return;
    }
    const r = validarTransicao({ de: oportunidade.status, para });
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    void gravar("etapa", r.campos);
  }

  async function confirmarEtapa(campos: CamposDaTransicao) {
    const ok = await gravar("etapa", campos);
    if (ok) setPedido(null);
  }

  if (!ia || (!temSugestao(ia) && !ia.motivo)) {
    return compacto ? null : (
      <p className="text-xs text-apoio">
        Ainda não há leitura da IA para esta oportunidade. Ela aparece depois que a conversa ligada é analisada.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {linhas.length === 0 ? (
        <p className="text-xs text-apoio">Nenhuma sugestão pendente: a oportunidade já está como a IA leu.</p>
      ) : (
        <ul className="space-y-1.5">
          {linhas.map((l) => (
            <li
              key={l.campo}
              className="flex items-center justify-between gap-2 rounded-lg border border-cobre/40 bg-cobre/10 px-3 py-2"
            >
              <span className="min-w-0 break-words text-xs leading-snug">{l.texto}</span>
              <button
                type="button"
                className="botao botao-primario shrink-0 px-3 py-1 text-xs"
                onClick={() => aceitar(l)}
                disabled={ocupado !== null}
              >
                {ocupado === l.campo ? "…" : "Aceitar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ia.motivo && <p className="text-xs leading-snug text-apoio">Por quê: {ia.motivo}</p>}
      {ia.analisada_em && (
        <p className="text-[11px] text-apoio/80">Leitura feita {tempoRelativo(ia.analisada_em)}. Nada muda sem o seu clique.</p>
      )}
      {erro && <p className="text-xs text-erro">{erro}</p>}

      {pedido && (
        <DialogoDeEtapa
          pedido={pedido}
          ocupado={ocupado === "etapa"}
          aoConfirmar={confirmarEtapa}
          aoCancelar={() => setPedido(null)}
        />
      )}
    </div>
  );
}
