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
};

export default nextConfig;
