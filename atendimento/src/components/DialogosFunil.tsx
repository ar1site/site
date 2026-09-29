"use client";

// Janelas do funil: mudar de etapa (motivo em Perdido, valor em Ganho) e o
// formulário curto de oportunidade. No celular abrem como folha, de baixo.

import { useEffect, useId, useState, type ReactNode } from "react";
import { useEquipe, nomeCurto } from "@/lib/equipe";
import { useServicos } from "@/lib/funil/dados";
import { isoParaDia } from "@/lib/funil/datas";
import {
  formatarReais,
  ORIGENS,
  ROTULO_ETAPA,
  ROTULO_ORIGEM,
  transicaoPede,
  validarTransicao,
  type CamposDaTransicao,
} from "@/lib/funil/etapas";
import {
  lerValor,
  validarOportunidade,
  valorParaCampo,
  type CamposNovaOportunidade,
  type EntradaOportunidade,
} from "@/lib/funil/formulario";
import type { EtapaFunil, Oportunidade } from "@/lib/tipos";

export function Dialogo({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const idTitulo = useId();
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="cartao max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-4 sm:max-w-md sm:rounded-b-xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={idTitulo} className="text-sm">
            {titulo}
          </h2>
          <button type="button" className="-m-1 p-1 text-apoio hover:text-texto" onClick={aoFechar} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({
  rotulo,
  erro,
  ajuda,
  children,
  className = "",
}: {
  rotulo: string;
  erro?: string;
  ajuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-apoio">{rotulo}</span>
      {children}
      {ajuda && !erro && <span className="mt-1 block text-[11px] text-apoio/80">{ajuda}</span>}
      {erro && <span className="mt-1 block text-xs text-erro">{erro}</span>}
    </label>
  );
}

// ------------------------------------------------------------ mudar de etapa

export interface PedidoDeEtapa {
  oportunidade: Pick<Oportunidade, "id" | "name" | "status" | "estimated_value">;
  para: EtapaFunil;
  /** Texto inicial do motivo (por exemplo, a leitura da IA). A pessoa pode trocar. */
  motivoInicial?: string;
}

/**
 * Pede o que falta para mudar de etapa. Só aparece para Ganho (confirma o
 * valor final) e Perdido (motivo obrigatório).
 */
export function DialogoDeEtapa({
  pedido,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  pedido: PedidoDeEtapa;
  ocupado: boolean;
  aoConfirmar: (campos: CamposDaTransicao) => void;
  aoCancelar: () => void;
}) {
  const { oportunidade, para } = pedido;
  const pede = transicaoPede(para);
  const [motivo, setMotivo] = useState(pedido.motivoInicial ?? "");
  const [valor, setValor] = useState(valorParaCampo(oportunidade.estimated_value));
  const [erro, setErro] = useState<string | null>(null);

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const valorLido = lerValor(valor);
    const r = validarTransicao({
      de: oportunidade.status,
      para,
      motivo,
      valorFinal: valorLido === null ? null : valorLido,
    });
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    aoConfirmar(r.campos);
  }

  return (
    <Dialogo titulo={`Mover para ${ROTULO_ETAPA[para]}`} aoFechar={aoCancelar}>
      <form onSubmit={confirmar} className="space-y-3">
        <p className="text-sm text-apoio">
          <span className="text-texto">{oportunidade.name}</span> sai de {ROTULO_ETAPA[oportunidade.status]} e vai para{" "}
          {ROTULO_ETAPA[para]}.
        </p>

        {pede === "motivo" && (
          <Campo rotulo="Por que foi perdida? (obrigatório)">
            <textarea
              autoFocus
              className="campo min-h-24 text-sm"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              placeholder="Ex.: fechou com outra produtora, sem verba, mudou a data"
            />
          </Campo>
        )}

        {pede === "valor" && (
          <Campo
            rotulo="Valor final do negócio (R$)"
            ajuda={`Valor estimado até agora: ${formatarReais(oportunidade.estimated_value)}. A probabilidade passa a 100%.`}
          >
            <input
              autoFocus
              className="campo text-sm"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex.: 4800"
            />
          </Campo>
        )}

        {erro && <p className="text-xs text-erro">{erro}</p>}

        <div className="flex gap-2">
          <button type="submit" className="botao botao-primario flex-1" disabled={ocupado}>
            {ocupado ? "Salvando…" : para === "won" ? "Confirmar ganho" : para === "lost" ? "Marcar como perdida" : "Mover"}
          </button>
          <button type="button" className="botao botao-secundario" onClick={aoCancelar} disabled={ocupado}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

// ------------------------------------------------- formulário de oportunidade

export type ValoresIniciais = Partial<
  Pick<
    Oportunidade,
    | "name"
    | "phone"
    | "company"
    | "project_type"
    | "source"
    | "estimated_value"
    | "probability"
    | "next_action"
    | "next_action_at"
    | "assigned_to"
    | "message"
    | "expected_date"
  >
>;

/**
 * Formulário curto. `fixos` esconde campos que já vêm definidos (na conversa,
 * telefone e origem são os do contato do WhatsApp).
 */
export function FormularioOportunidade({
  inicial,
  fixos = [],
  avisoIA = false,
  rotuloSalvar = "Criar oportunidade",
  aoSalvar,
  aoCancelar,
}: {
  inicial: ValoresIniciais;
  fixos?: ("telefone" | "origem" | "responsavel")[];
  /** Mostra o aviso de que valor, probabilidade e próxima ação vieram da IA. */
  avisoIA?: boolean;
  rotuloSalvar?: string;
  aoSalvar: (campos: CamposNovaOportunidade) => Promise<string | null>;
  aoCancelar: () => void;
}) {
  const { membros, eu } = useEquipe();
  const servicos = useServicos();
  const idLista = useId();
  const [dados, setDados] = useState<EntradaOportunidade>(() => ({
    nome: inicial.name ?? "",
    telefone: inicial.phone ?? "",
    empresa: inicial.company ?? "",
    servico: inicial.project_type ?? "",
    origem: inicial.source ?? "indicacao",
    valor: valorParaCampo(inicial.estimated_value),
    probabilidade: inicial.probability === null || inicial.probability === undefined ? "" : String(inicial.probability),
    proximaAcao: inicial.next_action ?? "",
    proximaAcaoDia: isoParaDia(inicial.next_action_at),
    responsavel: inicial.assigned_to ?? null,
    mensagem: inicial.message ?? null,
    dataPrevista: inicial.expected_date ?? null,
  }));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const responsavel = dados.responsavel ?? eu ?? "";

  function mudar<K extends keyof EntradaOportunidade>(campo: K, valor: EntradaOportunidade[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    const r = validarOportunidade({ ...dados, responsavel: responsavel || null });
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setErros({});
    setErroGeral(null);
    setSalvando(true);
    const erro = await aoSalvar(r.campos);
    setSalvando(false);
    if (erro) setErroGeral(erro);
  }

  return (
    <form onSubmit={submeter} className="space-y-3" noValidate>
      {avisoIA && (
        <p className="rounded-lg border border-cobre/50 bg-cobre/10 px-3 py-2 text-xs">
          Valor, probabilidade e próxima ação vieram da leitura da IA. Confira e ajuste antes de salvar.
        </p>
      )}
      <Campo rotulo="Nome" erro={erros.nome}>
        <input className="campo text-sm" value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} maxLength={200} autoComplete="off" />
      </Campo>
      {!fixos.includes("telefone") && (
        <Campo rotulo="Telefone (com DDD)" erro={erros.telefone}>
          <input className="campo text-sm" inputMode="tel" value={dados.telefone} onChange={(e) => mudar("telefone", e.target.value)} maxLength={32} placeholder="(62) 99999-8888" autoComplete="off" />
        </Campo>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Empresa" erro={erros.empresa}>
          <input className="campo text-sm" value={dados.empresa} onChange={(e) => mudar("empresa", e.target.value)} maxLength={200} autoComplete="off" />
        </Campo>
        <Campo rotulo="Serviço" erro={erros.servico}>
          <input className="campo text-sm" list={idLista} value={dados.servico} onChange={(e) => mudar("servico", e.target.value)} maxLength={100} placeholder="A definir" autoComplete="off" />
          <datalist id={idLista}>
            {servicos.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor estimado (R$)" erro={erros.valor}>
          <input className="campo text-sm" inputMode="decimal" value={dados.valor} onChange={(e) => mudar("valor", e.target.value)} placeholder="sem valor" autoComplete="off" />
        </Campo>
        <Campo rotulo="Probabilidade (%)" erro={erros.probabilidade}>
          <input className="campo text-sm" inputMode="numeric" value={dados.probabilidade} onChange={(e) => mudar("probabilidade", e.target.value)} placeholder="0 a 100" maxLength={4} autoComplete="off" />
        </Campo>
      </div>
      <Campo rotulo="Próxima ação" erro={erros.proximaAcao}>
        <input className="campo text-sm" value={dados.proximaAcao} onChange={(e) => mudar("proximaAcao", e.target.value)} maxLength={500} placeholder="Ex.: enviar proposta" autoComplete="off" />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Até quando" erro={erros.proximaAcaoDia}>
          <input type="date" className="campo text-sm" value={dados.proximaAcaoDia} onChange={(e) => mudar("proximaAcaoDia", e.target.value)} />
        </Campo>
        {!fixos.includes("origem") && (
          <Campo rotulo="Origem">
            <select className="campo text-sm" value={dados.origem} onChange={(e) => mudar("origem", e.target.value)}>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {ROTULO_ORIGEM[o]}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>
      {!fixos.includes("responsavel") && (
        <Campo rotulo="Responsável">
          <select className="campo text-sm" value={responsavel} onChange={(e) => mudar("responsavel", e.target.value)}>
            <option value="">Sem responsável</option>
            {membros
              .filter((m) => m.active || m.user_id === responsavel)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_id === eu ? `${nomeCurto(m.email)} (você)` : nomeCurto(m.email)}
                </option>
              ))}
          </select>
        </Campo>
      )}

      {erroGeral && <p className="text-xs text-erro">{erroGeral}</p>}

      <div className="flex gap-2">
        <button type="submit" className="botao botao-primario flex-1" disabled={salvando}>
          {salvando ? "Salvando…" : rotuloSalvar}
        </button>
        <button type="button" className="botao botao-secundario" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
