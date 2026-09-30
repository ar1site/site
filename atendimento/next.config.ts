import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Este app vive dentro do repositório do site (que tem o próprio lockfile);
  // fixa a raiz para o Turbopack não se confundir.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Fotos de perfil do WhatsApp e mídias vêm de domínios variados; usamos <img> direto.
  images: { unoptimized: true },
  // O PDF da proposta lê as fontes e a logo do disco: garante que esses
  // arquivos vão junto com a função que gera o PDF.
  outputFileTracingIncludes: {
    "/api/propostas": ["./recursos/propostas/fontes/*.ttf", "./public/marca/ar1-films-logo.png"],
  },
};

export default nextConfig;
