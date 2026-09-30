# Plano de execução — AR1 Atendimento (para o próximo Claude)

Escrito em 29/09/2026, 23h, por Claude (Fable 5.1) a pedido de Alessandro Cerrano Moreira, proprietário da AR1 Films. Este documento é autossuficiente: com ele, uma sessão nova (Opus) consegue retomar, terminar o que está em andamento e executar os próximos blocos sem perguntar nada que já foi decidido.

Leia nesta ordem: este arquivo → `CONTINUIDADE-ATENDIMENTO.md` (histórico e incidentes) → `atendimento/LEIA-ME.md` (o app) → `atendimento/ponte/LEIA-ME.md` (a ponte).

---

## 1. Como trabalhar com Alessandro

- Fale em **português do Brasil, simples, sem jargão**. Ele não é programador. Explique o que cada coisa faz para o negócio, não como é feita.
- **Autonomia máxima.** Ele reclamou de receber listas de tarefas. Antes de pedir algo, esgote CLI, API e arquivos. Peça só o que exige o celular dele (ler QR, mandar áudio de teste), cartão ou identidade, e peça tudo de uma vez.
- **Não pare para pedir "continue".** Avance pelo plano. Pare só para decisão do proprietário (dinheiro, marca, risco jurídico).
- Depois de cada entrega, **teste com evidência real** (captura, suíte, chamada ao serviço). Sonda HTML não basta. Quando não der para testar (ver §5), diga com clareza o que ficou sem teste.
- Reporte falhas sem enfeitar. Se algo quebrou, diga o que foi, o que fez e o que falta.
- Ele aprovou este plano em ordem e a frase dele é: "quero nível premium de tudo" e "um CRM de IA 2027, sempre à frente da concorrência".

## 2. O que existe (estado em 29/09/2026, 23h)

### Contas e endereços
| Peça | Onde |
|---|---|
| Site público | https://ar1films.com (Vercel, projeto `ar1films`, time `ar-1-films`; publica sozinho a cada push na `main`) |
| Painel de atendimento | https://ar1-atendimento.vercel.app (Vercel, projeto `ar1-atendimento`, mesmo time; **deploy pela CLI** a partir de `atendimento/`; domínio `atendimento.ar1films.com` reservado, CNAME ainda não criado na Squarespace) |
| Código | GitHub `ar1site/site`, branch `main`. Pasta local: `E:\CLIENTES\AR1 STUDIOS\ar1studios-site` (site na raiz; painel em `atendimento/`; ponte em `atendimento/ponte/`) |
| Banco | Supabase projeto "site ar1", ref `oflpynhhbcnhcugjxgah`, org "aite_ar1", plano Free (nano) |
| IA | OpenRouter (chave na Vercel: `OPENROUTER_API_KEY`). Modelos: `AI_MODEL=anthropic/claude-sonnet-5.5` (rotina), `AI_AUDIO_MODEL=google/gemini-3.5-flash-lite` (áudio), propostas devem usar `anthropic/claude-opus-5.5` (`AI_MODEL_PROPOSTAS`). Fable 5.1 custa 5× o Opus; só usar se o proprietário pedir |
| WhatsApp | Número (62) 9835-4354 (antigo Estúdios SOBI, app WhatsApp Business) espelhado pela **Evolution API v2.3.7 em Docker neste PC** (containers `ar1-evolution`, `ar1-evolution-db`) + ponte local `ponte.mjs` (tarefa agendada `AR1-Ponte-WhatsApp`; Docker abre pela tarefa `AR1-Docker-Desktop`). O site manda leads para (62) 98125-2338, que **não** está ligado ao sistema (decisão dele: deixar assim por enquanto) |
| Logins do painel | `adm.ar1films@gmail.com` e `rui@ar1films.com`; senhas em `%LOCALAPPDATA%\SistemaACM\ar1-atendimento-acessos.txt` |
| E-mail | Google Workspace; `contato@ar1films.com` é alias de `rui@ar1films.com` |
| Domínio | `ar1films.com` na Squarespace Domains (vence 21/09/2027). `ar1studios.com.br` e `ar1films.com.br` **não existem** |

### Segredos (fora do Git, em `%LOCALAPPDATA%\SistemaACM\`)
`ar1-supabase-token.txt` (token pessoal do Supabase — ele autorizou manter ativo; use para migrações via Management API), `ar1-service-role.txt`, `ar1-webhook-secret.txt`, `ar1-cron-secret.txt`, `ar1-ponte.env` (config da ponte, inclui `FFMPEG=`), `ar1-atendimento-acessos.txt`. Na pasta `atendimento/ponte/.env`: `EVOLUTION_APIKEY`, `POSTGRES_PASSWORD`. Nunca cole segredos no chat nem em arquivos do repositório.

### Comandos que funcionam
```powershell
# migração no banco (Management API)
$tok=(Get-Content "$env:LOCALAPPDATA\SistemaACM\ar1-supabase-token.txt" -Raw).Trim()
$sql=[IO.File]::ReadAllText("<caminho da migração>.sql")
$b=@{query=$sql}|ConvertTo-Json -Compress -Depth 3
Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/oflpynhhbcnhcugjxgah/database/query" -Headers @{Authorization="Bearer $tok";'Content-Type'='application/json'} -Body ([Text.Encoding]::UTF8.GetBytes($b))

# painel: checar e publicar (na pasta atendimento/)
npm run lint; npm test; npx tsc --noEmit   # ignore 4 erros antigos PageProps/LayoutProps/RouteContext se .next não existir
vercel deploy --prod --yes --scope ar-1-films
vercel env add NOME production --force --scope ar-1-films   # valor pelo stdin

# git (o repo não tem identidade configurada)
git -c user.name="opensobi-maker" -c user.email="adm.r1produtora@gmail.com" commit -q -m "..."
git push ar1site main      # remote "ar1site" = ar1site/site; "origin" é o repositório antigo, não use

# ponte
curl http://127.0.0.1:3901/saude
Get-Content "$env:LOCALAPPDATA\SistemaACM\ar1-ponte.log" | Select-Object -Last 20
Stop-ScheduledTask AR1-Ponte-WhatsApp; <matar node ponte.mjs>; Start-ScheduledTask AR1-Ponte-WhatsApp   # reiniciar com código novo
cd atendimento\ponte; npm test   # node --test
```
Commits terminam com a linha `Co-Authored-By: Claude <modelo> <noreply@anthropic.com>`. Antes de `git add`, confira `git status`: agentes em segundo plano deixam arquivos pela metade; adicione só o que foi revisado.

### Regras técnicas aprendidas
- **Classificador do Claude Code (modo auto) bloqueia**: (a) scripts meus que gravam em produção usando o login do proprietário; (b) `docker compose up`, `docker restart`, `logout` de instância em serviço em produção — mesmo com "pode" dele. Saída: preparar um `.ps1` e ele roda com `powershell -ExecutionPolicy Bypass -File "<caminho>"`. Reiniciar a **ponte** pela tarefa agendada foi permitido; `docker restart ar1-evolution` foi permitido uma vez como reparo.
- `logout` da Evolution não derruba a sessão; para reparear, ele desconecta pelo celular (Dispositivos conectados → Desconectar) e a ponte abre o QR novo na tela sozinha.
- **Histórico do WhatsApp veio em formato LID** (sem telefone); não dá para importar sem tradução. `importar-historico.mjs` fica pronto para quando houver. Mensagens ao vivo chegam com telefone e funcionam.
- Drive E: exige `git config --global --add safe.directory`. Git Bash: `MSYS_NO_PATHCONV=1` ao passar rotas começando com `/`.
- Incidente 29/09: queda de internet → Evolution em ciclo `connecting` com conexões duplicadas (`conflict: replaced`), 48 mil eventos em 30 min derrubaram o Supabase Free. Proteções já no código: ponte agrupa avisos (1 a cada 15 s), não pede `connect` em duplicidade, e **autorreparo** (`vigiarOscilacao`: 300+ eventos/min por 2 min → `docker restart`, máx. 1 a cada 15 min); painel ignora aviso de conexão repetido. **Não remova essas proteções.** Se oscilar com frequência, o caminho é a API oficial da Meta.
- Testes de webhook em produção com payload simulado (`scripts/simular-webhook.mjs` ou POST direto com `history`/telefones fictícios) foram permitidos; apague os dados de teste depois (`ar1_wa_contacts` por telefone; o resto vai em cascata).

## 3. O que está publicado (funciona) e o que ainda não foi testado com dados reais

Publicado no painel (391 testes passando em 29/09 20h): fila de atendimentos com análise da IA e resposta sugerida (pessoa aprova), contexto para a IA (base de conhecimento com 4 documentos iniciais em `atendimento/base-inicial/` + contexto por cliente, PDF/DOCX/TXT), funil de vendas (7 etapas, previsão ponderada, sugestões da IA com Aceitar), retomadas (cron 11:00 UTC), transcrição de áudio (ponte converte para MP3; painel transcreve antes da análise), proposta em PDF simples (pdf-lib), resumo diário para o WhatsApp do dono (cron 11:10 UTC, destinatário `556281069562`, chave `resumo.ativo`), formulário do site gravando no funil (`api/proposta.ts` na raiz do site; testado em produção).

**Sem teste com dados reais** (o classificador me impediu; o proprietário disse que testaria): contexto + reanalisar, criar oportunidade, retomar "Gerar agora", transcrição com áudio real (não se sabe se `gemini-3.5-flash-lite` aceita `input_audio` mp3 pela OpenRouter — se recusar, trocar `AI_AUDIO_MODEL` na Vercel), montar proposta, resumo diário "Enviar agora". **Primeira coisa a fazer numa sessão nova: perguntar a ele o que testou e o que apareceu, ou pedir que rode esses cinco testes.** Se ele autorizar por escrito um teste seu que grava dados com o usuário dele, tente; se o classificador bloquear, ele executa.

## 4. Em andamento agora: aba Propostas premium (bloco 8)

Um agente estava construindo, em `atendimento/`, quando este documento foi escrito. **Verifique `git status`**: arquivos não commitados em `atendimento/public/marca/galeria/`, `src/lib/propostas/`, `src/lib/precos/`, `src/app/(app)/propostas/`, `src/app/p/[token]/`, `src/app/api/propostas/*`, `supabase/migrations/20260930110000_ar1_propostas_premium.sql` e mudanças em `Shell.tsx`, `Configuracoes.tsx`, `ia.ts`, `env.ts`. Se o agente não concluiu, termine a partir da especificação abaixo; se concluiu, revise, rode lint/test/build, aplique a migração, publique e informe.

### Especificação (o que ele pediu: "como se tivesse sido feita pelo gamma.app")
1. **Tabela de preços** (`ar1_price_items`, tela em Ajustes): ~25 itens por serviço (podcast gravado/ao vivo/itinerante, transmissão, Leilão 360, filme de legado, filme de marca, fotografia, shows/DVDs, conteúdo recorrente, consultoria de estúdio, locação do Haras, teleprompter) com unidade, preço, "o que inclui", `confirmed=false` nos valores iniciais sugeridos (ele não passou preços reais; a tela avisa "confirme antes de usar"). Editar em linha, ativar/desativar, confirmar.
2. **Aba Propostas** (`/propostas`, menu entre Funil e Retomar): lista com situação (rascunho/gerada/enviada/aceita/recusada); **Nova proposta** em passos: cliente (buscar contato do WhatsApp ou digitar; cria oportunidade e contato se não existirem) → pedido (serviço, adicionais, quantidades, data, local, objetivo; botão "Puxar da conversa" preenche pela IA) → a IA (Opus 5.5) monta o conteúdo completo em JSON (capa, entendimento, por que a AR1, solução, escopo, entregas, cronograma, investimento, condições, próximos passos, validade) → editor visual com prévia.
3. **Regra de valores**: a IA só escolhe `price_item_id` e quantidades; o servidor recalcula tudo pela tabela. Item não confirmado gera aviso interno. Sem item aplicável: "sob consulta". Nunca inventar preço.
4. **Galeria** em `atendimento/public/marca/galeria/` (fotos reais do site: haras, podcast, estúdio, campo, fachada) com tags por serviço em `src/lib/propostas/galeria.ts`; a IA escolhe, o editor troca; envio de logo/imagem do cliente para o bucket `ar1-context`.
5. **Página do cliente** `/p/[token]` (pública, token 32+ chars, validade 30 dias): apresentação rolável em tela cheia, imagens de fundo, tipografia grande, tabela de investimento, botões "Aceitar proposta" (grava aceite) e "Falar no WhatsApp" ((62) 98125-2338), contagem de visualizações, Open Graph com a capa.
6. **PDF premium** da mesma página com Chrome headless na Vercel (`@sparticuz/chromium-min` + `puppeteer-core`, `CHROMIUM_PACK_URL`, `maxDuration=60`), lâmina por seção; reserva automática no gerador `pdf-lib` se o Chrome falhar. Guardar no bucket e listar no histórico.
7. O botão "Montar proposta" da oportunidade passa a abrir `/propostas/nova?oportunidade=<id>`.
8. Visual: marca AR1 Films (fundo #111315 e #292d30, texto #f2efe8, cobre #b86b45, Montserrat 800 caixa alta, Inter). Sem clichês de câmera/claquete/microfone.
9. Variáveis novas na Vercel: `AI_MODEL_PROPOSTAS=anthropic/claude-opus-5.5`, `CHROMIUM_PACK_URL` (URL do pacote do chromium-min compatível com a versão instalada).

Depois de publicar: contar a ele em linguagem simples o que a aba faz e pedir os preços reais.

## 5. Próximo bloco: Agentes de IA (bloco 9)

Objetivo dele: "adicione agentes de IA no sistema", nível premium. Desenho aprovado:

- **Registro de agentes** em `src/lib/agentes/`: cada agente tem `id`, nome, papel, instruções (editáveis em Ajustes → Agentes, guardadas em `ar1_settings` chave `agente.<id>.instrucoes`), modelo (`ar1_settings` chave `agente.<id>.modelo`, padrão por agente), ferramentas que pode usar e limites. Refatore os prompts existentes para dentro dos agentes sem mudar comportamento:
  - **Recepção** (análise de conversa e resposta sugerida; Sonnet 5.5) — hoje em `src/lib/analise/`.
  - **Qualificação** (extrai serviço/data/local/orçamento, propõe etapa/valor/próxima ação; Sonnet 5.5) — hoje parte de `analise` + `funil/sugestoes`.
  - **Redator de propostas** (Opus 5.5) — bloco 8.
  - **Cobrança** (retomadas e cobrança de retorno de propostas; Sonnet 5.5) — hoje `src/lib/followups/`.
  - **Analista** (resumo diário, sinais: leads esfriando, propostas paradas, taxa de resposta; recomendações; Opus 5.5) — hoje `src/lib/resumo/`.
  - **Bibliotecário** (novo; Sonnet 5.5): semanalmente lê as conversas recentes e sugere para a base de conhecimento perguntas frequentes com respostas e lacunas ("clientes perguntam X e não há documento"); cada sugestão vira um documento proposto com botão Aprovar (entra em `ar1_context_docs`) ou Descartar.
- **Registro de atividade**: tabela `ar1_agent_runs` (agent_id, gatilho, referências: atendimento/oportunidade/proposta, entrada resumida, saída resumida, modelo, tokens de entrada/saída, custo estimado em US$, duração, status, erro, created_at). Todas as chamadas de IA passam por uma função única que grava isso.
- **Tela `/agentes`**: cartão por agente (o que faz, modelo, quantas ações hoje/semana, custo do mês, última atividade, ligar/desligar), linha do tempo de ações com filtro, e o editor de instruções com "restaurar padrão". Custos por modelo: tabela em código com os preços da OpenRouter (Sonnet 5.5 US$2/10 por milhão; Opus 5.5 US$4/20; Gemini 3.5 Flash-Lite US$0,30/2,50 e áudio 0,30; Fable 5.1 US$10/50).
- **Princípio fixo**: agente sugere, pessoa aprova. Nenhum agente envia mensagem a cliente, muda etapa ou valor sozinho. Exceção já aprovada: o resumo diário para o próprio dono.
- Migração: `supabase/migrations/20260930120000_ar1_agentes.sql` (tabela de runs + índices + RLS equipe + realtime). Testes: registro de run com custo calculado, editor de instruções com padrão, bibliotecário com IA simulada, nenhum agente escreve em cliente sem aprovação.

## 6. Blocos seguintes (ordem sugerida)
1. **Galeria com Higgsfield**: quando o conector `mcp__higgsfield__*` estiver disponível na sessão, gerar cenas que faltam (transmissão ao vivo, leilão, DVD/show, filme de legado, consultoria) no padrão "Terra Cinema" (luz de cinema, terra e bruma, sem clichês) e salvar em `atendimento/public/marca/galeria/` com tags. Ele autorizou usar o Higgsfield para isso. Se ele salvar imagens em `Z:\CLIENTES\AR1 FILMS OFICIAL\PORTFOLIO\imagens`, incorporar.
2. **Segunda instância** para o número comercial (62) 98125-2338 (mesma Evolution, instância `ar1-comercial`, mesma ponte com mapa de instâncias) — só se ele pedir; hoje decidiu deixar como está.
3. **CNAME `atendimento`** na Squarespace → `8fce98223df3f090.vercel-dns-017.com` (ele faz; depois trocar `APP_URL` na Vercel).
4. **Mover a ponte para um servidor** (VPS pequeno) ou **API oficial da Meta** se a oscilação voltar.
5. Portfólio em PDF (`Z:\CLIENTES\AR1 FILMS OFICIAL\PORTFOLIO`): faltam as 33 fotos (códigos IMG-01…33) e o Instagram; `node gerar-pdf.mjs` gera de novo.

## 7. Barra de qualidade para cada entrega
- Lint, testes e build passando; tipos sem erro novo.
- Capturas com dados simulados (desktop 1440 e celular 390) para conferir o visual; nada com rolagem horizontal.
- Migração aplicada e conferida (tabelas, RLS, buckets) antes de publicar código que dependa dela.
- Publicar, conferir rotas no ar (401/307 sem login), atualizar `CONTINUIDADE-ATENDIMENTO.md`, commit e push.
- Relatar ao proprietário: o que entrou, o que não foi testado, o que depende dele (o mínimo).

## 8. Memória do Claude Code nesta máquina
`C:\Users\cerra\.claude\projects\c--ALESSANDRO-CERRANO-MOREIRA-OFICIAL-SISTEMA-ACM\memory\` tem `project-ar1-atendimento.md` e `reference-site-ar1studios.md` com o resumo do que está aqui. O SISTEMA-ACM (pasta principal deste workspace) é o sistema pessoal dele; não misturar com a AR1.
