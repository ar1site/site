"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabaseNoNavegador } from "@/lib/supabase/browser";

function mensagemDeErro(codigo: string | undefined, mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (codigo === "invalid_credentials" || m.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (m.includes("email not confirmed")) {
    return "Este e-mail ainda não foi confirmado. Fale com o administrador.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Sem conexão com o servidor. Verifique a internet.";
  }
  return "Não foi possível entrar. Tente de novo.";
}

export function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(
    params.get("erro") === "sem-acesso"
      ? "Sua conta não faz parte da equipe. Fale com o administrador."
      : null,
  );
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const supabase = supabaseNoNavegador();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error) {
      setErro(mensagemDeErro(error.code, error.message));
      setEnviando(false);
      return;
    }
    const voltar = params.get("voltar");
    router.replace(voltar && voltar.startsWith("/") ? voltar : "/");
    router.refresh();
  }

  return (
    <form onSubmit={entrar} className="cartao space-y-4 p-5">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-apoio">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="campo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="senha" className="mb-1 block text-sm text-apoio">
          Senha
        </label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          className="campo"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>
      {erro && (
        <p role="alert" className="rounded-lg border border-erro/50 bg-erro/10 px-3 py-2 text-sm text-erro">
          {erro}
        </p>
      )}
      <button type="submit" className="botao botao-primario w-full" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center text-xs text-apoio">
        Sem cadastro por aqui: o acesso é criado pelo administrador.
      </p>
    </form>
  );
}
