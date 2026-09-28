import { redirect } from "next/navigation";
import { sessaoDaEquipe } from "@/lib/auth";
import { supabaseNoServidor } from "@/lib/supabase/server";
import { Shell } from "@/components/Shell";

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const sessao = await sessaoDaEquipe();
  if (!sessao) {
    // Logado mas fora da equipe: encerra a sessão e explica.
    const supabase = await supabaseNoServidor();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/login?erro=sem-acesso" : "/login");
  }

  return (
    <Shell usuario={{ id: sessao.user.id, email: sessao.user.email ?? "", role: sessao.role }}>
      {children}
    </Shell>
  );
}
