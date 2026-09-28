"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatarTelefone, nomeDoContato, somenteDigitos } from "@/lib/formato";
import { supabaseNoNavegador } from "@/lib/supabase/browser";
import type { Contato } from "@/lib/tipos";
import { Avatar } from "./Selos";

async function buscarContatos(): Promise<{ lista: Contato[] } | { erro: string }> {
  const { data, error } = await supabaseNoNavegador()
    .from("ar1_wa_contacts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) return { erro: "Não foi possível carregar os contatos." };
  return { lista: (data ?? []) as Contato[] };
}

export function Contatos() {
  const [lista, setLista] = useState<Contato[] | null>(null);
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    return buscarContatos().then((r) => {
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setLista(r.lista);
    });
  }, []);

  useEffect(() => {
    let ativo = true;
    buscarContatos().then((r) => {
      if (!ativo) return;
      if ("erro" in r) setErro(r.erro);
      else setLista(r.lista);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const termo = busca.trim().toLowerCase();
    const digitos = somenteDigitos(termo);
    if (!termo) return lista;
    return lista.filter((c) => {
      const nome = nomeDoContato(c).toLowerCase();
      return (
        nome.includes(termo) ||
        (c.wa_name ?? "").toLowerCase().includes(termo) ||
        (c.company ?? "").toLowerCase().includes(termo) ||
        (digitos.length >= 3 && c.phone.includes(digitos))
      );
    });
  }, [lista, busca]);

  async function salvar(id: string, campos: Partial<Contato>) {
    const { error } = await supabaseNoNavegador().from("ar1_wa_contacts").update(campos).eq("id", id);
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`);
      return false;
    }
    await carregar();
    return true;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 lg:py-6">
      <h1 className="mb-3 text-xl">Contatos</h1>
      <input
        type="search"
        className="campo mb-3"
        placeholder="Buscar por nome, empresa ou telefone"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar contatos"
      />
      {erro && <p className="mb-2 text-sm text-erro">{erro}</p>}
      {lista === null && <p className="py-8 text-center text-sm text-apoio">Carregando…</p>}
      {lista !== null && filtrados.length === 0 && (
        <p className="py-8 text-center text-sm text-apoio">Nenhum contato encontrado.</p>
      )}
      <ul className="space-y-2">
        {filtrados.map((c) => (
          <li key={c.id} className={`cartao ${c.blocked ? "opacity-70" : ""}`}>
            <button
              type="button"
              className="flex w-full items-center gap-3 p-3 text-left"
              onClick={() => setAbertoId(abertoId === c.id ? null : c.id)}
              aria-expanded={abertoId === c.id}
            >
              <Avatar nome={nomeDoContato(c)} foto={c.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {nomeDoContato(c)}
                  {c.blocked && <span className="selo ml-2 border-erro/60 text-erro">Bloqueado</span>}
                </p>
                <p className="truncate text-xs text-apoio">
                  {formatarTelefone(c.phone)}
                  {c.company ? ` · ${c.company}` : ""}
                </p>
              </div>
            </button>
            {abertoId === c.id && <FormContato contato={c} aoSalvar={(campos) => salvar(c.id, campos)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormContato({ contato, aoSalvar }: { contato: Contato; aoSalvar: (c: Partial<Contato>) => Promise<boolean> }) {
  const [nome, setNome] = useState(contato.display_name ?? "");
  const [empresa, setEmpresa] = useState(contato.company ?? "");
  const [notas, setNotas] = useState(contato.notes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const ok = await aoSalvar({
      display_name: nome.trim() || null,
      company: empresa.trim() || null,
      notes: notas.trim() || null,
    });
    setSalvando(false);
    if (ok) {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    }
  }

  return (
    <form onSubmit={submeter} className="space-y-3 border-t border-borda p-3">
      <p className="text-xs text-apoio">
        Nome no WhatsApp: {contato.wa_name || "(não informado)"}
        {" · "}
        <Link href={`/?busca=${encodeURIComponent(contato.phone)}`} className="underline">
          ver na fila
        </Link>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-apoio">Nome</span>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder={contato.wa_name ?? ""} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-apoio">Empresa</span>
          <input className="campo" value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={200} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-apoio">Observações (a IA lê isto)</span>
        <textarea className="campo min-h-20" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={5000} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="botao botao-primario" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {salvo && <span className="text-xs text-ok">Salvo.</span>}
        <span className="flex-1" />
        {contato.blocked ? (
          <button type="button" className="botao botao-secundario" onClick={() => aoSalvar({ blocked: false })}>
            Desbloquear
          </button>
        ) : (
          <button
            type="button"
            className="botao botao-perigo"
            onClick={() => {
              if (confirm("Bloquear este contato? Mensagens novas dele não vão mais abrir atendimento.")) {
                aoSalvar({ blocked: true });
              }
            }}
          >
            Bloquear
          </button>
        )}
      </div>
    </form>
  );
}
