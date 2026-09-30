import type { NextConfig } from "next";
import path from "node:path";

/** Fontes e logo que o PDF em pdf-lib lê do disco (proposta simples e reserva da premium). */
const ARQUIVOS_DO_PDF = ["./recursos/propostas/fontes/*.ttf", "./public/marca/ar1-films-logo.png"];

const nextConfig: NextConfig = {
  // Este app vive dentro do repositório do site (que tem o próprio lockfile);
  // fixa a raiz para o Turbopack não se confundir.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Fotos de perfil do WhatsApp e mídias vêm de domínios variados; usamos <img> direto.
  images: { unoptimized: true },
  // O PDF da proposta lê as fontes e a logo do disco: garante que esses
  // arquivos vão junto com as funções que geram PDF (a simples e a reserva da premium).
  outputFileTracingIncludes: {
    "/api/propostas": ARQUIVOS_DO_PDF,
    "/api/propostas/[id]/pdf": ARQUIVOS_DO_PDF,
  },
  // Página pública da proposta: não pode ser embutida em outro site (o botão de
  // aceite fica protegido), não passa o endereço com o token adiante e não entra
  // em buscadores.
  async headers() {
    return [
      {
        source: "/p/:token*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/api/p/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
