import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';
import seo from '../src/config/seo.json' with { type: 'json' };

test('all sitemap pages share the same canonical metadata before and after JavaScript', async () => {
  const sitemap = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(urls.length, Object.keys(seo).length);
  const titles = new Set();
  for (const url of urls) {
    const path = new URL(url).pathname;
    const meta = seo[path];
    assert(meta, `Missing metadata for ${path}`);
    const file = path === '/' ? 'index.html' : `${path.slice(1)}.html`;
    const html = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
    assert(html.includes(`<title>${meta.title}</title>`), `Title mismatch for ${path}`);
    assert(html.includes(`rel="canonical" href="${url}"`));
    assert(html.includes(`content="${meta.description}"`));
    assert(html.includes(`rel="preload" as="image" href="${meta.heroImage}"`));
    await access(new URL(`../public${meta.heroImage}`, import.meta.url));
    assert(!titles.has(meta.title), `Duplicate title: ${meta.title}`);
    titles.add(meta.title);
  }
});
