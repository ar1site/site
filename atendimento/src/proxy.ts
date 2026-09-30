import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão do Supabase a cada pedido e protege as telas: quem não
 * está logado vai para /login. As rotas /api cuidam da própria autorização
 * (o webhook usa o segredo na URL; as demais exigem sessão).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() valida o token no servidor do Supabase (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const ehLogin = pathname === "/login";

  if (!user && !ehLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("voltar", pathname);
    return NextResponse.redirect(url);
  }

  if (user && ehLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo, exceto rotas de API, a página pública da proposta (/p/<token>), arquivos estáticos e imagens.
    "/((?!api|p/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
};
