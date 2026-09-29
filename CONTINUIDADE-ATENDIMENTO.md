# Continuidade — AR1 Atendimento (WhatsApp + IA)

Atualizado em 28/09/2026. Leia isto antes de retomar o trabalho no sistema de atendimento. As decisões abaixo foram tomadas por Alessandro (proprietário) nesta data; o que está marcado como pendente ainda não foi verificado.

## Decisões do proprietário
- Número dos Estúdios SOBI está no **WhatsApp Business** e continua no celular.
- Conexão **espelhada** (não oficial). Primeira versão: **Evolution API rodando em Docker neste computador** (custo zero, sem conta nova), com uma **ponte** local que fala com a Vercel. Depois pode migrar para um servidor pequeno ou para Z-API sem mudar o painel.
- IA **organiza e sugere**; uma pessoa aprova e envia. Nunca responde sozinha.
- Sistema **próprio da AR1**, nas contas novas: GitHub `ar1site/site` (pasta `atendimento/`), Vercel time AR1 FILMS (projeto `ar1-atendimento`, domínio reservado `atendimento.ar1films.com`, CNAME `atendimento` → `8fce98223df3f090.vercel-dns-017.com` ainda não criado na Squarespace), Supabase projeto "site ar1" (`oflpynhhbcnhcugjxgah`).
- IA via **OpenRouter** (chave única, cartão), não pelo console da Anthropic. Modelo padrão: um Claude Sonnet via OpenRouter (ver `AI_MODEL`).
- Alessandro pediu que o máximo seja feito de forma autônoma; só ele faz o que exige celular (ler QR), cartão ou identidade.

## Estado
- Banco: migrações escritas em `supabase/migrations/20260928100000_ar1_atendimento.sql` (contatos, atendimentos, mensagens, sugestões, configurações, eventos, gatilhos, RLS, realtime) e `20260928110000_ar1_wa_ponte.sql` (fila de envio `ar1_wa_outbox` + bucket privado `ar1-wa-media`). **Aplicadas em 28/09/2026** pela Management API (12 tabelas ar1_* e buckets ar1-client-files/ar1-wa-media conferidos). Cadastro público desligado (disable_signup). Usuários criados: rui@ar1films.com e adm.ar1films@gmail.com (ambos admin em ar1_staff); senhas em `%LOCALAPPDATA%\SistemaACM\ar1-atendimento-acessos.txt`. Service role guardada em `%LOCALAPPDATA%\SistemaACM\ar1-service-role.txt` e na Vercel. O token pessoal do Supabase usado deve ser revogado pelo proprietário.
- Vercel: projeto `ar1-atendimento` criado; variáveis enviadas por CLI (conferir com `vercel env ls` numa pasta ligada ao projeto): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_MODEL`, `WHATSAPP_PROVIDER=bridge`, `WEBHOOK_SECRET` (valor em `%LOCALAPPDATA%\SistemaACM\ar1-webhook-secret.txt`). Também definidas: `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY` (válida, limite US$ 5), `AI_PROVIDER=openrouter`, `AI_MODEL=anthropic/claude-sonnet-5.5`.
- App: um agente estava construindo `atendimento/` (Next.js) com a especificação da seção abaixo. Se a pasta existir parcialmente, revisar `atendimento/LEIA-ME.md` e o que compila antes de continuar.
- Ponte local (`atendimento/ponte/`): **no ar desde 28/09/2026 (noite)**. Evolution API v2.3.7 + Postgres em Docker (containers ar1-evolution / ar1-evolution-db, restart unless-stopped); instância `ar1` conectada ao número (62) 9835-4354 (antigo Estúdios SOBI). Ponte roda pela tarefa agendada `AR1-Ponte-WhatsApp` (logon, reinício automático); Docker abre pela tarefa `AR1-Docker-Desktop`. Config em `%LOCALAPPDATA%\SistemaACM\ar1-ponte.env` e `atendimento/ponte/.env` (fora do Git). Saúde: `http://127.0.0.1:3901/saude`; log `%LOCALAPPDATA%\SistemaACM\ar1-ponte.log`.
- Painel publicado em https://ar1-atendimento.vercel.app (APP_URL fixada nisso até o CNAME `atendimento` existir). Teste ponta a ponta com mensagem simulada: entrada → análise em ~45 s → sugestão pendente (OK).
- Decisão 28/09: o site manda para (62) 98125-2338, que NÃO está ligado ao sistema; Alessandro escolheu deixar assim por enquanto. Ligar esse número depois = segunda instância na Evolution (ou trocar o site). Docker Desktop estava fechado; Alessandro ia reiniciar o PC para ligá-lo.
- Usuários do painel: criar no Supabase (Authentication → Users) para `rui@ar1films.com` e o e-mail de Alessandro; o gatilho da migração torna todo usuário criado membro da equipe (`ar1_staff`). Desligar cadastro público em Authentication → Providers → Email.

## Contrato da ponte (bridge) ↔ painel
Webhook do painel: `POST /api/whatsapp/webhook/<WEBHOOK_SECRET>`.
- Mensagem: `{"type":"bridge.message","provider":"evolution","message":{"external_id","phone" (só dígitos),"from_me":bool,"sender_name","sent_at" (ISO),"kind":"text|image|audio|video|document|sticker|location|contact|other","body","media_path" ("ar1-wa-media/<phone>/<id>.<ext>" ou null),"media_mime","media_name","is_group":bool,"outbox_id" (uuid ou null)}}`.
- Estado: `{"type":"bridge.status","provider":"evolution","connected":bool,"state":"open|close|connecting","phone","checked_at"}`; QR: `{"type":"bridge.qr","media_path":"ar1-wa-media/_sistema/qr.png","updated_at"}` → o painel guarda em `ar1_settings` (`whatsapp.status`, `whatsapp.qr`).
- Envio: o painel insere em `ar1_wa_outbox` (status `queued`); a ponte consulta a fila (service role, a cada ~3 s), marca `sending`, envia pela Evolution (`POST /message/sendText/{instancia}`), grava `sent` + `external_id` (ou `failed` + `error`). A mensagem enviada volta pelo webhook como `from_me: true` com `outbox_id`; o painel então grava `sent_by='sistema'`, `sent_by_user = outbox.created_by` e liga `suggestion.message_id`.
- Mídia: a ponte baixa/recebe base64 da Evolution, sobe no bucket `ar1-wa-media` e manda só o caminho; o painel gera URL assinada (1 h) ao exibir. `media_url` na tabela guarda `storage:ar1-wa-media/<caminho>`.
- Z-API continua aceita no mesmo webhook (payload `type: ReceivedCallback` etc.) como alternativa futura; `WHATSAPP_PROVIDER=zapi` usa envio direto.

## Ponte local (a construir em `atendimento/ponte/`)
- `docker-compose.yml`: `evolution-api` (v2) + `postgres:16` locais; `AUTHENTICATION_API_KEY` gerada; webhook global para `http://host.docker.internal:3901/evolution` com eventos `MESSAGES_UPSERT`, `SEND_MESSAGE`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`, base64 ligado.
- `ponte.mjs` (Node 24, sem dependências pesadas): servidor em 127.0.0.1:3901; normaliza eventos da Evolution para o contrato acima; sobe mídia no Storage; consome `ar1_wa_outbox`; heartbeat de estado a cada 5 min; na partida cria a instância se não existir, salva o QR em PNG (`%LOCALAPPDATA%\SistemaACM\ar1-qr.png`) e abre na tela.
- Configuração fora do repositório: `%LOCALAPPDATA%\SistemaACM\ar1-ponte.env` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_INSTANCE, WEBHOOK_URL com o segredo).
- Execução: tarefa agendada do Windows `AR1-Ponte-WhatsApp` ao iniciar sessão, reinício automático.

## Pendências com o proprietário
1. Revogar o token pessoal `claude-ar1` no Supabase (já usado).
2. OpenRouter: chave aplicada; subir o limite de US$ 5 quando o uso crescer.
3. Ler o QR com o celular dos Estúdios SOBI quando a ponte subir.
4. (Opcional) CNAME `atendimento` na Squarespace.
5. Fase 2: transcrição de áudio (Whisper/Deepgram), migração para API oficial da Meta, hospedar a ponte fora deste PC.

## Histórico do WhatsApp (28–29/09/2026)
- Re-pareamento feito com `DATABASE_SAVE_DATA_HISTORIC=true`: a Evolution v2.3.7 recebeu 4.552 mensagens / 1.100 chats. Porém **1.682 mensagens de pessoas vêm com `remoteJid` em formato `@lid`** (identificador novo do WhatsApp) sem `remoteJidAlt`, e no histórico o `pushName` é o próprio LID — não há como traduzir para telefone (só 2 arquivos `lid-mapping-*` na sessão; `/chat/whatsappNumbers` não devolve lid; Contact/Chat não têm mapa). Só 1 de 218 chats recentes resolveu.
- Mensagens **ao vivo** chegam com `remoteJidAlt` (telefone) e funcionam normalmente (teste real 28/09 23:35: recebida → sugestão → aprovada no painel → enviada pela outbox → entregue).
- `importar-historico.mjs` está pronto e funciona quando o telefone é resolvível; por ora importa quase nada. Decisão pendente do proprietário: deixar o histórico de lado (recomendado) ou testar Evolution mais nova (2.4+/latest, Baileys com suporte a LID) em nova instância + novo QR.
- Logout pela API (`DELETE /instance/logout`) não derruba a sessão nesta versão (reconecta); para reparear é preciso desconectar pelo celular (Dispositivos conectados → Desconectar). Script `Reparear-Com-Historico.ps1` cobre o resto (rodar com `-ExecutionPolicy Bypass`).
- O classificador do Claude Code bloqueia `docker compose up`/logout em serviço em produção mesmo com autorização verbal; o proprietário executa esses passos.
## Evolução para "CRM de IA" (29/09/2026)
Pedido do proprietário: campo de contexto (textos e documentos) junto da Análise da IA e, no geral, transformar o painel numa ferramenta comercial de IA. Plano aprovado por ele, nesta ordem:
1. **Contexto para a IA** — por cliente (na conversa) e base de conhecimento global (Configurações); leitor de PDF/DOCX/TXT; resposta mostra "Baseado em: …". Migração `20260929100000_ar1_contexto.sql` **aplicada**; base inicial (4 documentos de `atendimento/base-inicial/`) **carregada** em `ar1_context_docs`; telas/rotas em construção por agente.
2. **Funil de vendas** sobre `ar1_quote_requests` (etapas new, qualified, contacting, proposal, negotiating, won, lost; valor estimado, probabilidade, próxima ação, origem site/whatsapp). Migração `20260929110000_ar1_funil.sql` **aplicada**; telas a construir.
3. **Follow-up sugerido** (tabela `ar1_followups` aplicada): rotina diária que lista quem ficou sem resposta e deixa a mensagem pronta para aprovar.
4. **Transcrição de áudio** pela mesma chave do OpenRouter (modelo com entrada de áudio), preenchendo `ar1_wa_messages.transcript`.
5. **Proposta em PDF** gerada pela IA com a marca AR1 Films.
6. **Resumo diário** no WhatsApp do proprietário.
7. **Formulário do site** gravando no mesmo funil (`source = 'site'`).

Acesso ao banco: token pessoal do Supabase guardado em `%LOCALAPPDATA%\SistemaACM\ar1-supabase-token.txt` (proprietário concordou em mantê-lo ativo para as próximas migrações). Aplicar migrações pela Management API (`POST /v1/projects/oflpynhhbcnhcugjxgah/database/query`).
## Incidente 29/09/2026 ~16h50 (enxurrada de avisos de estado)
- A internet deste PC caiu por alguns minutos. A Evolution entrou em ciclo de `connecting` e a ponte repassou cada evento ao painel: 47.996 eventos em 30 min (108.525 no total) em `ar1_wa_events`. O Supabase (plano Free) respondeu 521/525 por alguns minutos; voltou sozinho. O WhatsApp reconectou sozinho.
- Correção na origem (commit 206311e): a ponte só repassa estado igual uma vez a cada 60 s (`INTERVALO_STATUS_REPETIDO_MS`). Ponte reiniciada pela tarefa agendada. Linhas repetidas apagadas (mantidas as 200 mais recentes).
- **Pendente**: no painel, o webhook não deve gravar `bridge.status` em `ar1_wa_events` quando o estado não mudou (segunda barreira). Fazer depois que o agente do funil terminar, para não publicar trabalho pela metade.- **Segunda ocorrência, 29/09 17:55** (internet normal): Evolution com `stream:error conflict type=replaced` em ciclo, ~70 eventos de estado por segundo, container a 102% de CPU e 3,6 GB. Causa: conexões duplicadas da mesma sessão dentro da Evolution; a ponte agravava chamando `/instance/connect` a cada estado não conectado. Resolvido com `docker restart ar1-evolution` (voltou a 0,01% CPU, 264 MB, uma conexão). Correções na ponte (commit ccc0ef6): aviso ao painel no máximo a cada 15 s (agrupado), `connect` só com estado `close` e no máximo a cada 2 min, e **autorreparo** (`vigiarOscilacao`): 300+ eventos de estado por minuto durante 2 minutos seguidos → `docker restart` do container, no máximo a cada 15 min.
- Risco a observar: oscilação prolongada pode levar o WhatsApp a restringir o número. Se o autorreparo disparar com frequência, migrar para versão mais nova da Evolution ou para a API oficial.
## Estado em 29/09/2026, 18h15
- **Publicados** (commit 3a75e69, https://ar1-atendimento.vercel.app): contexto para a IA (base + por cliente), funil de vendas (`/funil`, `/funil/[id]`), retomadas (`/retomar`, rota `/api/followups/gerar`, cron diário 11:00 UTC = 08:00 de Brasília, `CRON_SECRET` na Vercel e em `%LOCALAPPDATA%\SistemaACM\ar1-cron-secret.txt`), barreira no webhook contra aviso de conexão repetido. 219 testes.
- Regras escolhidas pelo agente do funil (o proprietário pode mudar): probabilidade padrão por etapa 10/25/40/60/80; horas úteis seg–sex 9–18h de Brasília; "cliente aguardando" após 4 h úteis; "sem retorno" após 2 dias (configurável); janela de 30 dias; teto de 3 retomadas sem resposta; máximo 15 sugestões por execução.
- **Não verificado com dados reais**: gravação de documentos de contexto pelo painel, geração real de retomadas, Realtime das tabelas novas. O classificador bloqueia testes meus que gravam em produção com o usuário do proprietário; ele testa pelo painel.
- **Em construção**: transcrição de áudio (ponte converte para MP3 com ffmpeg; painel transcreve via OpenRouter, `AI_AUDIO_MODEL=google/gemini-3.5-flash-lite` já definido na Vercel). Depois: proposta em PDF, resumo diário no WhatsApp do proprietário, formulário do site no funil.
## Estado em 29/09/2026, 19h
- **Transcrição de áudio publicada e ponte reiniciada** (commit 8bae1c7): ponte converte áudio para MP3 com ffmpeg (`FFMPEG` no `ar1-ponte.env`), painel transcreve via OpenRouter antes da análise, botão Transcrever no balão. 278 testes no painel, 46 na ponte. **Ainda sem teste com áudio real** (falta alguém mandar um áudio para o número); não se sabe se `google/gemini-3.5-flash-lite` aceita `input_audio` em mp3 — se recusar, trocar `AI_AUDIO_MODEL` na Vercel.
- **Formulário do site no funil** (commit c949c96): `api/proposta.ts` grava em `ar1_quote_requests` (`source='site'`, etapa `new`), liga ao contato do WhatsApp se o telefone já existir, limite de 5 pedidos por telefone por hora, e-mail opcional. Variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no projeto Vercel `ar1films`. Testado em produção com envio identificado como teste (caiu no funil e foi apagado). O formulário não depende mais da senha de app do Google.
- **Em construção**: proposta em PDF e resumo diário no WhatsApp do proprietário (agente). Atenção ao commitar: adicionar só os arquivos do que foi revisado.