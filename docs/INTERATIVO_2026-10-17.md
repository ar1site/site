# Interativo no site oficial

A experiência está em https://ar1films.com/interativo, acessível pelo item **Interativo** do cabeçalho e do menu móvel. A home institucional continua na raiz. O aplicativo é servido como conteúdo estático no próprio domínio, sem exigir conta ou senha do ChatGPT.

## Arquivos

- `public/interativo/`: versão integrada da experiência aprovada, com imagens, fontes, PDF e os 180 quadros AVIF. Não inclui credenciais, arquivos da hospedagem Sites nem funções de administração.
- `public/interativo/src/ar1-data.js`: serviços, textos, contatos, imagens e respostas preparadas.
- `public/interativo/src/ar1-app.js`: navegação e guia local de serviços.
- `public/interativo/src/site-paths.js`: conversão entre as rotas internas e o prefixo `/interativo`.
- `public/interativo/src/scene-engine.js`: cena animada e bibliotecas preservadas da referência.
- `scripts/build-interactive.mjs`: gera as 12 entradas HTML para abertura direta e recarga, incluindo os nove serviços e o contato.

Imagens, PDF, fontes e quadros estão isolados sob `/interativo/`; não substituem recursos das páginas institucionais. O guia usa respostas preparadas e histórico de sessão local, sem backend de IA. Orçamentos e disponibilidade continuam sendo confirmados pela equipe.

Origem: versão AR1 adaptada no projeto `SITE_INTERATIVO_AR1`, commit `beb0c1003c72f76a32203fbce0948f28039f1ad2`. As únicas adaptações estruturais foram o prefixo de rotas e recursos, as entradas estáticas e o canonical do domínio oficial. A publicação anterior em Sites permanece independente, com sua audiência preservada.

## Validar e publicar

Executar `npm run build`, `npm run test:site` e `npx oxlint src scripts tests`. Conferir o link do menu em desktop e celular, abrir um serviço pelo guia e recarregar sua URL. Não enviar propostas de teste à API de produção.

O projeto GitHub `ar1site/site` publica a branch `main` na Vercel, projeto `ar1films`. Antes desta integração, a versão de origem estava no commit `4655585`. Para desfazer, reverter o commit da integração; a experiência não contém migrações nem altera o formulário.
