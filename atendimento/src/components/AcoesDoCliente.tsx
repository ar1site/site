"use client";

// Botões da página pública da proposta: "Aceitar proposta" (grava o aceite
// com o nome digitado) e "Falar no WhatsApp" (número comercial com texto pronto).
// Também avisa o servidor que a página abriu no navegador (conta a visita do
// cliente; robôs de prévia de link não rodam este script).

import { useEffect, useState } from "react";
import { linkDoWhatsapp } from "@/lib/propostas/premium/publico";
import { diaPorExtenso } from "@/lib/propostas/proposta";

function avisarVisita(token: string): void {
  const chave = `ar1.visita.${token}`;
  try {
    // Uma visita por sessão do navegador (recarregar a página não soma de novo).
    if (window.sessionStorage.getItem(chave)) return;
    window.sessionStorage.setItem(chave, "1");
  } catch {
    // navegação privada sem armazenamento: conta assim mesmo
  }
  fetch(`/api/p/${encodeURIComponent(token)}/visita`, { method: "POST", keepalive: true, cache: "no-store" }).catch(
    () => undefined,
  );
}

export function AcoesDoCliente({
  token,
  numero,
  titulo,
  aceitaPor,
  linkAtivo,
  encerrada = false,
  emPreparacao = false,
  venceuEm = null,
  contarVisita = false,
}: {
  token: string;
  numero: string;
  titulo: string;
  /** Nome de quem já aceitou (null = ainda não). */
  aceitaPor: string | null;
  linkAtivo: boolean;
  /** A equipe marcou a proposta como recusada. */
  encerrada?: boolean;
  /** Rascunho: ainda não pode ser aceita. */
  emPreparacao?: boolean;
  /** Dia (AAAA-MM-DD) em que a validade da proposta acabou; null = ainda vale. */
  venceuEm?: string | null;
  /** Conta a visita do cliente ao abrir (só na apresentação com link ativo). */
  contarVisita?: boolean;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aceita, setAceita] = useState<string | null>(aceitaPor);

  useEffect(() => {
    if (contarVisita && linkAtivo) avisarVisita(token);
  }, [contarVisita, linkAtivo, token]);

  async function aceitar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) {
      setErro("Digite seu nome para aceitar.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/p/${encodeURIComponent(token)}/aceitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string; nome?: string };
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? "Não foi possível registrar o aceite. Tente de novo.");
        return;
      }
      setAceita(j.nome ?? nome.trim());
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const whatsapp = (
    <a className="ap-botao ap-botao--contorno" href={linkDoWhatsapp(numero, titulo)} target="_blank" rel="noopener noreferrer">
      Falar no WhatsApp
    </a>
  );

  const soWhatsapp = (texto: string) => (
    <div className="ap-acoes" style={{ flexDirection: "column", alignItems: "flex-start" }}>
      <p className="ap-aviso">{texto}</p>
      {whatsapp}
    </div>
  );

  if (aceita) {
    return (
      <div className="ap-acoes" style={{ flexDirection: "column", alignItems: "flex-start" }}>
        <p className="ap-texto" style={{ color: "var(--ap-cobre-claro)", fontWeight: 600 }}>
          Proposta aceita por {aceita}. Obrigado! A equipe da AR1 entra em contato para os próximos passos.
        </p>
        {whatsapp}
      </div>
    );
  }

  if (!linkAtivo) return soWhatsapp("Este link já venceu. Fale com a gente para receber uma proposta atualizada.");
  if (encerrada) return soWhatsapp("Esta proposta foi encerrada. Fale com a gente se quiser retomar a conversa.");
  if (emPreparacao) return soWhatsapp("Esta proposta ainda está em preparação pela equipe da AR1.");
  if (venceuEm) {
    return soWhatsapp(
      `A validade desta proposta terminou em ${diaPorExtenso(venceuEm)}. Fale com a gente para receber os valores atualizados.`,
    );
  }

  if (!abrindo) {
    return (
      <div className="ap-acoes">
        <button type="button" className="ap-botao ap-botao--cobre" onClick={() => setAbrindo(true)}>
          Aceitar proposta
        </button>
        {whatsapp}
      </div>
    );
  }

  return (
    <form onSubmit={aceitar} className="ap-acoes" style={{ flexDirection: "column", alignItems: "flex-start" }}>
      <label className="ap-texto" htmlFor="nome-aceite" style={{ fontSize: "1rem" }}>
        Digite seu nome para confirmar o aceite da proposta {numero}.
      </label>
      <input
        id="nome-aceite"
        className="ap-campo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Seu nome completo"
        maxLength={200}
        autoComplete="name"
        autoFocus
      />
      {erro && (
        <p className="ap-aviso" role="alert" style={{ color: "#d9605a" }}>
          {erro}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
        <button type="submit" className="ap-botao ap-botao--cobre" disabled={enviando}>
          {enviando ? "Registrando…" : "Confirmar aceite"}
        </button>
        <button type="button" className="ap-botao ap-botao--contorno" onClick={() => setAbrindo(false)} disabled={enviando}>
          Voltar
        </button>
      </div>
    </form>
  );
}
