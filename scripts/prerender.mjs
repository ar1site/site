import pageSeo from "../src/config/seo.json" with { type: "json" };
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = await readFile(join(root, "dist", "index.html"), "utf8");
const origin = "https://ar1films.com";

const routes = Object.entries(pageSeo).map(([path, meta]) => [path.slice(1), meta.title, meta.description, meta.heroImage]);

const escapeAttribute = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

for (const [route, title, description, heroImage] of routes) {
  const url = `${origin}/${route}`;
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(" \/>)/, `$1${escapeAttribute(description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${escapeAttribute(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(" \/>)/, `$1${escapeAttribute(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(" \/>)/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(" \/>)/, `$1${escapeAttribute(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(" \/>)/, `$1${escapeAttribute(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${url}$2`);
  if (heroImage) html = html.replace(/(<link rel="preload" as="image" href=")[^"]*(" fetchpriority="high" \/>)/, `$1${heroImage}$2`);

  if (route === "filmagem-com-drone") {
    const content = await readFile(join(root, "src", "pages", "drone-content.html"), "utf8");
    // O conteúdo editorial permanece legível antes da montagem do React e sem JavaScript.
    const contact = `<section id="contato" class="contact section-dark"><div class="page-shell"><h2>Conte o que você precisa mostrar.</h2><p>Informe o local e o objetivo da gravação para receber uma proposta da AR1.</p><a class="button primary" href="https://wa.me/5562981252338?text=Quero%20um%20or%C3%A7amento%20para%20filmagem%20com%20drone">Pedir orçamento pelo WhatsApp</a></div></section>`;
    html = html.replace('<div id="root"></div>', `<div id="root"><main id="conteudo"><div class="drone-page">${content}</div>${contact}</main></div>`)
      .replace(/<meta name="keywords"[^>]*>\s*/, "")
      .replace(/(<meta (?:property="og:image"|name="twitter:image") content=")[^"]*(" \/>)/g, `$1${origin}${heroImage}$2`);
    const droneSchema = { "@context": "https://schema.org", "@graph": [
      { "@type": "Service", "@id": `${url}#service`, name: "Filmagem com drone e produção audiovisual", serviceType: "Captação aérea e produção audiovisual", url, provider: { "@id": `${origin}/#organization` }, areaServed: [{ "@type": "City", name: "Goiânia" }, { "@type": "State", name: "Goiás" }] },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Início", item: `${origin}/` }, { "@type": "ListItem", position: 2, name: "Filmagem com drone", item: url }] },
    ] };
    html = html.replace("</head>", `<script type="application/ld+json">${JSON.stringify(droneSchema)}</script>\n</head>`);
  }

  const routeSchema = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: title, description, url, inLanguage: "pt-BR", isPartOf: { "@id": `${origin}/#website` } });
  html = html.replace("</head>", `    <script type="application/ld+json">${routeSchema}</script>\n  </head>`);
  const destination = join(root, "dist", route, "index.html");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html, "utf8");
  if (!route) continue;
  const cleanUrlDestination = join(root, "dist", `${route}.html`);
  await mkdir(dirname(cleanUrlDestination), { recursive: true });
  await writeFile(cleanUrlDestination, html, "utf8");
}

console.log(`Static metadata generated for ${routes.length} routes.`);
