import type { Metadata } from "next";
import { Suspense } from "react";
import { FormularioLogin } from "@/components/FormularioLogin";

export const metadata: Metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="titulo text-2xl tracking-widest">AR1 Films</p>
          <p className="mt-1 text-sm text-apoio">Atendimento por WhatsApp</p>
        </div>
        <Suspense>
          <FormularioLogin />
        </Suspense>
      </div>
    </main>
  );
}
