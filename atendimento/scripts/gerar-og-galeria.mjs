#!/usr/bin/env node
// Gera a versão JPG 1200x630 de cada foto da galeria (public/marca/galeria/og/),
// usada como imagem de prévia (Open Graph) do link da proposta. O WhatsApp e
// outros apps mostram melhor JPG leve nessa proporção do que o .webp grande.
//
// Uso (na pasta atendimento/): node scripts/gerar-og-galeria.mjs
// Rode de novo sempre que entrar foto nova na galeria.

import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PASTA = path.resolve("public/marca/galeria");
const SAIDA = path.join(PASTA, "og");
mkdirSync(SAIDA, { recursive: true });

let total = 0;
for (const nome of readdirSync(PASTA)) {
  if (!/\.(webp|jpe?g|png)$/i.test(nome)) continue;
  const destino = path.join(SAIDA, nome.replace(/\.[^.]+$/, ".jpg"));
  await sharp(path.join(PASTA, nome))
    .resize(1200, 630, { fit: "cover", position: "attention" })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
    .toFile(destino);
  total += 1;
  console.log(`${nome} -> og/${path.basename(destino)} (${Math.round(statSync(destino).size / 1024)} KB)`);
}
console.log(`${total} imagens de prévia geradas em ${SAIDA}`);
