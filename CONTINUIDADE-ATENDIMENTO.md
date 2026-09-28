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
- Banco: migrações escritas em `supabase/migrations/20260928100000_ar1_atendimento.sql` (contatos, atendimentos, mensagens, sugestões, configurações, eventos, gatilhos, RLS, realtime) e `20260928110000_ar1_wa_ponte.sql` (fila de envio `ar1_wa_outbox` + bucket privado `ar1-wa-media`). **Ainda não aplicadas**: falta acesso ao banco (token pessoal do Supabase ou senha do banco). Para aplicar sem o proprietário: Management API `POST /v1/projects/{ref}/database/query` com o token, ou `supabase db push`.
- Vercel: projeto `ar1-atendimento` criado; variáveis enviadas por CLI (conferir com `vercel env ls` numa pasta ligada ao projeto): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_MODEL`, `WHATSAPP_PROVIDER=bridge`, `WEBHOOK_SECRET` (valor em `%LOCALAPPDATA%\SistemaACM\ar1-webhook-secret.txt`). Faltam: `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `AI_MODEL`, `AI_PROVIDER=openrouter`.
- App: um agente estava construindo `atendimento/` (Next.js) com a especificação da seção abaixo. Se a pasta existir parcialmente, revisar `atendimento/LEIA-ME.md` e o que compila antes de continuar.
- Ponte local (`atendimento/ponte/`): **não começada**. Docker Desktop estava fechado; Alessandro ia reiniciar o PC para ligá-lo.
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
1. Token pessoal do Supabase (Account → Access Tokens) **ou** senha do banco — desbloqueia migrações, service role, usuários e ajustes de autenticação.
2. Chave do OpenRouter (openrouter.ai → Keys) com crédito.
3. Ler o QR com o celular dos Estúdios SOBI quando a ponte subir.
4. (Opcional) CNAME `atendimento` na Squarespace.
5. Fase 2: transcrição de áudio (Whisper/Deepgram), migração para API oficial da Meta, hospedar a ponte fora deste PC.
