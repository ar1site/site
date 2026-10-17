import { readFile, mkdir, writeFile } from "node:fs/promises";
import { services } from "../public/interativo/src/ar1-data.js";

const root = new URL("../dist/", import.meta.url);
const template = await readFile(new URL("interativo/index.html", root), "utf8");
const routes = ["", "/servicos", "/contato", ...services.map((service) => `/servicos/${service.id}`)];

// Assim como as páginas institucionais, cada rota pode ser aberta ou recarregada diretamente.
for (const route of routes) {
  const pathname = `interativo${route}`;
  const html = template.replace('href="https://ar1films.com/interativo"', `href="https://ar1films.com/${pathname}"`);
  await mkdir(new URL(`${pathname}/`, root), { recursive: true });
  await writeFile(new URL(`${pathname}/index.html`, root), html);
  await writeFile(new URL(`${pathname}.html`, root), html);
}

console.log(`Interativo preparado em ${routes.length} rotas no domínio oficial.`);
