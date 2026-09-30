"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { usePendentesDeRetomada } from "@/lib/followups/dados";
import { supabaseNoNavegador } from "@/lib/supabase/browser";

export interface UsuarioAtual {
  id: string;
  email: string;
  role: "admin" | "commercial";
}

const ContextoUsuario = createContext<UsuarioAtual | null>(null);

export function useUsuarioAtual(): UsuarioAtual {
  const u = useContext(ContextoUsuario);
  if (!u) throw new Error("useUsuarioAtual fora do Shell");
  return u;
}

const LINKS = [
  { href: "/", rotulo: "Fila", icone: IconeFila },
  { href: "/funil", rotulo: "Funil", icone: IconeFunil },
  { href: "/propostas", rotulo: "Propostas", icone: IconePropostas },
  { href: "/retomar", rotulo: "Retomar", icone: IconeRetomar },
  { href: "/contatos", rotulo: "Contatos", icone: IconeContatos },
  { href: "/configuracoes", rotulo: "Ajustes", icone: IconeAjustes },
] as const;

/**
 * No celular a barra de baixo tem no máximo 5 botões (6 ficariam apertados,
 * com rótulos cortados). Ficam à vista as telas do dia a dia de vendas (Fila,
 * Funil, Propostas, Retomar); Contatos e Ajustes, de uso ocasional, vão para "Mais".
 */
const EM_MAIS: readonly string[] = ["/contatos", "/configuracoes"];
const NA_BARRA = LINKS.filter((l) => !EM_MAIS.includes(l.href));
const NO_MAIS = LINKS.filter((l) => EM_MAIS.includes(l.href));

/** Contador das retomadas pendentes: "9+" acima de nove, para caber no celular. */
function Contador({ total, className = "" }: { total: number; className?: string }) {
  if (total <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-cobre px-1 text-[10px] font-bold leading-[1.15rem] text-white ${className}`}
      aria-label={`${total} ${total === 1 ? "retomada pendente" : "retomadas pendentes"}`}
    >
      {total > 9 ? "9+" : total}
    </span>
  );
}

export function Shell({ usuario, children }: { usuario: UsuarioAtual; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const naConversa = pathname.startsWith("/atendimento/");
  const pendentes = usePendentesDeRetomada();
  const [maisAberto, setMaisAberto] = useState(false);

  async function sair() {
    await supabaseNoNavegador().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function ativo(href: string) {
    if (href === "/") return pathname === "/" || naConversa;
    return pathname.startsWith(href);
  }

  return (
    <ContextoUsuario.Provider value={usuario}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        {/* Barra lateral (desktop) */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-borda bg-superficie-2 lg:flex">
          <div className="px-5 pb-4 pt-6">
            <p className="titulo text-lg leading-tight">AR1 Films</p>
            <p className="text-xs text-apoio">Atendimento</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  ativo(l.href)
                    ? "bg-cobre/15 text-cobre-claro"
                    : "text-apoio hover:bg-superficie hover:text-texto"
                }`}
              >
                <l.icone />
                <span className="flex-1">{l.rotulo}</span>
                {l.href === "/retomar" && <Contador total={pendentes} />}
              </Link>
            ))}
          </nav>
          <div className="border-t border-borda px-5 py-4">
            <p className="truncate text-xs text-apoio" title={usuario.email}>
              {usuario.email}
            </p>
            <button onClick={sair} className="mt-2 text-xs text-apoio underline hover:text-texto">
              Sair
            </button>
          </div>
        </aside>

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Cabeçalho (celular) */}
          {!naConversa && (
            <header className="flex items-center justify-between border-b border-borda bg-superficie-2 px-4 py-3 lg:hidden">
              <p className="titulo text-base">AR1 Atendimento</p>
              <button onClick={sair} className="text-xs text-apoio underline">
                Sair
              </button>
            </header>
          )}
          <main className={`flex-1 ${naConversa ? "" : "pb-20 lg:pb-0"}`}>{children}</main>
        </div>

        {/* Navegação inferior (celular): 4 telas do dia a dia + "Mais" */}
        {!naConversa && (
          <>
            {maisAberto && (
              <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setMaisAberto(false)} aria-hidden />
            )}
            {maisAberto && (
              <div
                id="menu-mais"
                className="fixed inset-x-3 z-20 overflow-hidden rounded-xl border border-borda bg-superficie-2 shadow-2xl lg:hidden"
                style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
              >
                {NO_MAIS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setMaisAberto(false)}
                    aria-current={ativo(l.href) ? "page" : undefined}
                    className={`flex items-center gap-3 border-b border-borda px-4 py-3 text-sm font-medium last:border-b-0 ${
                      ativo(l.href) ? "text-cobre-claro" : "text-texto"
                    }`}
                  >
                    <l.icone />
                    {l.rotulo}
                  </Link>
                ))}
                <p className="truncate border-t border-borda px-4 py-2 text-[11px] text-apoio">{usuario.email}</p>
              </div>
            )}
            <nav
              className="fixed inset-x-0 bottom-0 z-20 flex border-t border-borda bg-superficie-2 lg:hidden"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {NA_BARRA.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMaisAberto(false)}
                  aria-current={ativo(l.href) ? "page" : undefined}
                  className={`flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5 py-2 text-[10.5px] font-medium leading-tight ${
                    ativo(l.href) ? "text-cobre-claro" : "text-apoio"
                  }`}
                >
                  <span className="relative">
                    <l.icone />
                    {l.href === "/retomar" && <Contador total={pendentes} className="absolute -right-3 -top-1.5" />}
                  </span>
                  <span className="max-w-full truncate">{l.rotulo}</span>
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setMaisAberto((a) => !a)}
                aria-expanded={maisAberto}
                aria-controls="menu-mais"
                className={`flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 px-0.5 py-2 text-[10.5px] font-medium leading-tight ${
                  maisAberto || NO_MAIS.some((l) => ativo(l.href)) ? "text-cobre-claro" : "text-apoio"
                }`}
              >
                <IconeMais />
                <span className="max-w-full truncate">Mais</span>
              </button>
            </nav>
          </>
        )}
      </div>
    </ContextoUsuario.Provider>
  );
}

function IconeFila() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconeFunil() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
    </svg>
  );
}
function IconePropostas() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 12l3-3 2 2 4-4" />
    </svg>
  );
}
function IconeMais() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}
function IconeRetomar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}
function IconeContatos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconeAjustes() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
