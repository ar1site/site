# AR1 Studios

Site institucional estático da AR1 Studios, voltado à solicitação de proposta. O ponto de partida atualizado está em [docs/ESTADO_ATUAL_SITE_AR1_STUDIOS_2026-09-01.md](docs/ESTADO_ATUAL_SITE_AR1_STUDIOS_2026-09-01.md).

## Como editar

- Textos, ofertas, contatos, jornadas e links sociais: `src/content.ts`
- Estrutura das páginas, rotas, menu e formulário: `src/App.tsx`
- Cores, tipografia, layout e responsividade: `src/App.css`
- Eventos preparados para mensuração: `src/analytics.ts`
- Imagens e logo: `public/media/`
- SEO: `index.html`, `scripts/prerender.mjs`, `public/sitemap.xml` e `public/robots.txt`

A estrutura é deliberadamente simples para ser modificada por qualquer IA ou desenvolvedor sem dependência de CMS.

## Contatos pendentes de confirmação

Abra `src/content.ts` e preencha:

```ts
whatsappNumber: "5562999999999",
instagramUrl: "https://instagram.com/...",
youtubeUrl: "https://youtube.com/...",
linkedinUrl: "https://linkedin.com/company/...",
```

O número deve conter DDI + DDD + telefone, sem `+`, espaços ou traços. Enquanto estiver vazio, o formulário abre um e-mail para `contato@ar1films.com`.

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Teste de produção

```bash
npm run build
npm run preview
```

## Publicar na Vercel

O projeto já está conectado à Vercel pela branch `main`. Para manutenção normal, valide localmente, faça commit e envie a alteração aprovada para `main`.

- Framework preset: Vite;
- build: `npm run build`;
- saída: `dist`;
- domínio oficial: `ar1films.com` (sem www como canônico) — em 27/09/2026 o domínio oficial passou de `ar1studios.com.br` para `ar1films.com`, junto com a marca AR1 Films; confirmar DNS e vinculação na Vercel antes de divulgar.

O arquivo `vercel.json` mantém as rotas `/leilao-360` e `/filme-de-legado` funcionando ao abrir diretamente.

## Supabase

A base Supabase foi criada em 31/08/2026, com tabelas, RLS e bucket privado. O site publicado continua estático e ainda não está conectado ao banco: o formulário não salva solicitações e login/painel não foram implementados. Consulte `supabase/README.md` para o estado da base.

## Continuidade por outra IA ou desenvolvedor

Leia [o estado atual do site](docs/ESTADO_ATUAL_SITE_AR1_STUDIOS_2026-09-01.md) e [o manual técnico de continuidade](DOCUMENTACAO_CONTINUIDADE_IA_AR1_STUDIOS.md). Eles reúnem o estado atual, caminhos, modelos de páginas, publicação, segurança, Supabase e pendências. A referência documental v1.1 está preservada como snapshot e não deve substituir estes documentos.
