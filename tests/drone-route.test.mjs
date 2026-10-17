import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const page = () => read("dist/filmagem-com-drone.html");

test("drone route ships readable content and contact without JavaScript", async () => {
  const html = await page();
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Filmagem com drone em Goiânia/);
  assert.match(html, /Uma produtora completa/);
  assert.match(html, /id="contato"/);
  assert.match(html, /https:\/\/wa\.me\/5562981252338/);
  assert.doesNotMatch(html, /DJI|Mavic|Avata|Mini 5|Quatro drones|chatgpt\.site|noindex/);
  assert.equal(await read("dist/filmagem-com-drone/index.html"), html);
});

test("canonical, structured service and sitemap use the production domain", async () => {
  const html = await page();
  assert.match(html, /rel="canonical" href="https:\/\/ar1films\.com\/filmagem-com-drone"/);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const entries = schemas.flatMap((schema) => schema["@graph"] || [schema]);
  assert(entries.some((entry) => entry["@type"] === "Service" && entry.provider?.["@id"] === "https://ar1films.com/#organization"));
  assert(entries.some((entry) => entry["@type"] === "BreadcrumbList"));
  assert.match(await read("dist/sitemap.xml"), /<loc>https:\/\/ar1films\.com\/filmagem-com-drone<\/loc>/);
});

test("all illustrative media and local anchors resolve in the built page", async () => {
  const html = await page();
  const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(images.filter((image) => image.startsWith("/media/drones/")).length, 5);
  for (const image of images) {
    if (image.startsWith("/")) await access(new URL(join("dist", image.slice(1)), root));
  }
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(anchor), `Missing #${anchor}`);
  assert.equal((html.match(/class="illustration-badge"/g) || []).length, 5);
});
