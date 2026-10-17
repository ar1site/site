# Revisão do site publicado — 17/10/2026

Site: https://ar1films.com. Base da auditoria: commit `01b37f22b8481b41b565336464f5d06d046ac292`.

## Cobertura e resultado

| Área | Verificação | Resultado |
| --- | --- | --- |
| Páginas | 16 URLs do sitemap | Todas responderam HTTP 200 |
| SEO | Títulos, descrições, canonical, robots, sitemap e JSON-LD | Metadados presentes; divergências entre HTML inicial e React corrigidas |
| Links | 50 destinos internos e imagens, além das âncoras das 16 páginas | Nenhum retorno de erro ou âncora sem destino |
| Redirecionamento | Antiga rota de consultoria | HTTP 308 para a página atual |
| URL inexistente | Caminho de auditoria sem página | HTTP 404 |
| Responsividade | 16 páginas em 320, 390, 768 e 1280 px | Sem rolagem horizontal ou elementos principais cortados nas verificações |
| Estrutura | H1, IDs e textos alternativos no DOM | Um H1 por página, sem IDs duplicados ou imagens sem atributo alt |
| Menu | Abertura mobile, foco e fechamento por Escape | Funcionamento confirmado; foco retorna ao botão |
| Formulário | Campos obrigatórios, telefone, e-mail e interesse inicial | Validação reforçada; serviço de podcast itinerante corrigido |
| Falha de envio | Simulação local sem integrações externas | Mensagem de erro, dados preservados e botão liberado para tentar novamente |
| Sucesso de envio | Simulação local e um envio real autorizado | Mensagem de recebimento e limpeza dos campos, preservando o interesse |
| Dependências | Auditoria de dependências de produção | Nenhuma vulnerabilidade reportada |

## Correções implementadas

1. `src/config/seo.json` passa a ser a fonte compartilhada de títulos, descrições e imagem principal para o HTML de build e para o React. A home e as páginas de serviços deixam de apresentar metadados diferentes após carregar JavaScript.
2. Cada página antecipa sua própria imagem principal, evitando o download antecipado da fachada em páginas que usam outra imagem.
3. O formulário bloqueia nomes/empresas compostos apenas por espaços e telefones sem a quantidade mínima de dígitos. A API rejeita telefone inválido, e-mail inválido preenchido, JSON nulo e arrays antes de acessar as integrações.
4. O interesse da página de podcast itinerante passa a corresponder ao serviço oferecido.
5. O evento de conversão do formulário identifica o canal como `site`, coerente com o registro no funil.
6. A suíte passou a cobrir as 16 rotas e os cenários de validação, sucesso, falha, limite de solicitações, origem inválida, honeypot e configuração ausente da API. São nove testes automatizados, com rede e e-mail isolados nos testes da API.

## Teste real autorizado

Foi enviado pelo navegador um único formulário com o nome **TESTE TÉCNICO — desconsiderar**, empresa **AR1 Films — teste autorizado do site**, telefone público da AR1 e interesse em filmagem com drone. O briefing identifica expressamente o registro como teste, sem finalidade comercial.

O site exibiu a confirmação de recebimento, limpou os campos e manteve o serviço selecionado. A configuração de produção contém as variáveis do funil; SMTP não está configurado. A auditoria confirmou o resultado pelo fluxo público e pela lógica da API, sem consultar diretamente a linha criada no banco. Não excluir automaticamente o registro de teste.

## Melhorias ainda recomendadas

- **Renderização inicial:** a página de drones entrega conteúdo completo no HTML. As outras 15 páginas entregam metadados no HTML, mas dependem de JavaScript para o conteúdo principal. Isso não significa que estejam impedidas de indexar, mas a geração estática do conteúdo reduziria essa dependência. É uma evolução da arquitetura, fora das correções pontuais desta revisão. Referência: [Google — fundamentos de SEO para JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
- **Mensuração:** `VITE_GA4_ID` não está configurado no ambiente de produção. O código prepara eventos, mas falta associar uma propriedade GA4 real. Não foi criado um identificador fictício.
- **Portfólio:** substituir progressivamente as imagens ilustrativas da página de drones por vídeos e trabalhos reais, mantendo as identificações até a substituição.
- **Dados de busca:** indexação efetiva, consultas, posições e Core Web Vitals de usuários reais precisam ser conferidos no Search Console/CrUX. Não foram presumidos resultados de ranqueamento nem uma pontuação de Lighthouse nesta auditoria.

## Repetição dos testes

Executar `npm run build`, `npm run test:site` e `npx oxlint src api scripts tests`. Para atualizar o SEO, editar `src/config/seo.json`. Para testar o formulário em produção novamente, combinar previamente o registro identificado e o contato usado; testes automatizados usam integrações simuladas e não acessam o banco real.
