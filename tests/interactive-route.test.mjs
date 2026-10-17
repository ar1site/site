import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("interactive navigation stays under its own path", async () => {
  const { appPath, sitePath } = await import("../public/interativo/src/site-paths.js");
  assert.equal(appPath("/interativo"), "/");
  assert.equal(appPath("/interativo/"), "/");
  assert.equal(appPath("/interativo/servicos/shows-dvds/"), "/servicos/shows-dvds");
  assert.equal(appPath("/interativo-outro/servicos"), null);
  assert.equal(sitePath("/"), "/interativo");
  assert.equal(sitePath("/servicos/podcast"), "/interativo/servicos/podcast");
});

test("interactive entry and service reloads use the official domain", async () => {
  const { services } = await import("../public/interativo/src/ar1-data.js");
  for (const route of ["", "/servicos", "/contato", ...services.map((s) => `/servicos/${s.id}`)]) {
    const html = await read(`dist/interativo${route}.html`);
    assert.match(html, /lang="pt-BR"/);
    assert.match(html, /src="\/interativo\/src\/scene-engine.js"/);
    assert(html.includes(`rel="canonical" href="https://ar1films.com/interativo${route}"`));
    assert.doesNotMatch(html, /chatgpt\.site|Authorization|Bearer/);
    assert.equal(await read(`dist/interativo${route}/index.html`), html);
  }
});

test("interactive assets do not collide with institutional assets", async () => {
  const { services, company } = await import("../public/interativo/src/ar1-data.js");
  for (const path of [company.pdf, ...services.flatMap((s) => [s.image, ...s.gallery.map(([src]) => src)])]) {
    assert(path.startsWith("/interativo/"));
    await access(new URL(`dist${path}`, root));
  }
  for (let frame = 1; frame <= 180; frame++) {
    await access(new URL(`dist/interativo/Hero/frames/avif/frame_${String(frame).padStart(4, "0")}.avif`, root));
  }
  const engine = await read("dist/interativo/src/scene-engine.js");
  assert.match(engine, /\/interativo\/Hero\/frames\/avif/);
  assert.doesNotMatch(engine, /["'`]\/Hero\//);
  assert.doesNotMatch(await read("dist/interativo/assets/portfolio.css"), /url\(["']?\/assets\//);
});
