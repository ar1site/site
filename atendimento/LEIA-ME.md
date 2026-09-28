# AR1 Atendimento

Painel web para o atendimento da AR1 Films pelo WhatsApp. As mensagens chegam
por um webhook, ficam guardadas no Supabase, cada conversa é analisada por IA
(tipo de contato, serviço, urgência, resumo, dados extraídos e uma resposta
sugerida) e a equipe aprova, edita ou descarta a resposta antes de enviar.

**A IA nunca envia nada sozinha.** Toda mensagem que sai passa por alguém da
equipe.

Projeto Next.js separado do site, dentro da pasta `atendimento/` do repositório.
Na Vercel, é um projeto próprio com **Root Directory = `atendimento`**.

## O que o app faz

| Tela | Para quê |
| --- | --- |
| `/login` | Entrar com e-mail e senha (sem cadastro público). |
| `/` Fila | Atendimentos abertos, com abas por status, busca, selos da IA, não lidas, "Resposta sugerida pronta" e responsável. Atualiza em tempo real. |
| `/atendimento/[id]` Conversa | Linha do tempo (texto, imagem, áudio, vídeo, documento, figurinha, localização, contato), status, assumir, encerrar, painel da IA, resposta sugerida (enviar / descartar / pedir outra), composer livre e "Criar pedido de orçamento". No desktop, a fila fica ao lado. |
| `/contatos` | Buscar contatos, corrigir nome/empresa, observações (a IA lê) e bloquear spam. |
| `/configuracoes` | Estado do WhatsApp, QR code, instruções e serviços usados pela IA, lista da equipe. |

Rotas de servidor:

| Rota | Função |
| --- | --- |
| `POST /api/whatsapp/webhook/[segredo]` | Recebe eventos da ponte local **ou** da Z-API (mesmo webhook; detecta pelo campo `type`). |
| `POST /api/ia/analisar` | Analisa um atendimento (sessão da equipe ou `x-internal-secret`). |
| `POST /api/whatsapp/enviar` | Envia texto: enfileira para a ponte (`bridge`) ou chama a Z-API (`zapi`). |
| `GET /api/whatsapp/status` | Estado da conexão. |
| `GET /api/whatsapp/qr` | QR code para conectar o aparelho. |
| `GET /api/midia?path=…` | Redireciona para a URL assinada (1 h) de um arquivo do bucket privado `ar1-wa-media`. |
| `GET /api/equipe` | Equipe com e-mails. |

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha. Nunca coloque segredos no
repositório: `.env.local` já está no `.gitignore`.

| Variável | O que é |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave publicável (`sb_publishable_…`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço. Só no servidor. |
| `AI_PROVIDER` | `openrouter` (padrão) ou `anthropic`. |
| `AI_MODEL` | Modelo. Padrão `anthropic/claude-sonnet-5.5` (OpenRouter) ou `claude-sonnet-5-5` (Anthropic). |
| `OPENROUTER_API_KEY` | Chave da OpenRouter (quando `AI_PROVIDER=openrouter`). |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Só quando `AI_PROVIDER=anthropic`. |
| `WHATSAPP_PROVIDER` | `bridge` (padrão, ponte local) ou `zapi`. |
| `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` | Só quando `WHATSAPP_PROVIDER=zapi`. |
| `WEBHOOK_SECRET` | Segmento secreto da URL do webhook e cabeçalho `x-internal-secret`. |
| `APP_URL` | Opcional. URL pública do app (o webhook usa para agendar a análise). Na Vercel usa `VERCEL_PROJECT_PRODUCTION_URL` quando vazio. |

Na Vercel, cadastre as mesmas variáveis em Settings → Environment Variables.

## Banco de dados

As tabelas vêm das migrações em `../supabase/migrations/`:

- `20260831140000_ar1_foundation.sql` — equipe (`ar1_staff`), clientes, pedidos de orçamento.
- `20260928100000_ar1_atendimento.sql` — contatos, atendimentos, mensagens, sugestões da IA, configurações, log de eventos, gatilhos e RLS.
- `20260928110000_ar1_wa_ponte.sql` — fila de envio (`ar1_wa_outbox`) e bucket privado `ar1-wa-media`.

O app não altera o esquema. Os gatilhos do banco cuidam de contadores, troca de
status ("de quem é a vez"), agendamento da análise (`ai_analysis_due_at`) e de
marcar sugestões pendentes como substituídas quando sai resposta pelo celular.

## Como criar usuários

1. Painel do Supabase → **Authentication → Users → Add user**.
2. Informe e-mail e senha (marque "Auto Confirm User").
3. Um gatilho coloca a pessoa em `ar1_staff` como administradora. Para
   deixar como "comercial" (não edita as instruções da IA), altere `role` na
   tabela `ar1_staff`.

Não existe cadastro pela tela de login.

## Ponte local (Evolution API) — contrato

Com `WHATSAPP_PROVIDER=bridge`, o WhatsApp fica conectado a uma **ponte** que
roda no computador da AR1 (Evolution API em Docker). A ponte fala com o painel
por três caminhos:

### 1. Ponte → painel: webhook

`POST https://SEU-DOMINIO/api/whatsapp/webhook/<WEBHOOK_SECRET>` com JSON.
O painel responde sempre `200 {"ok":true}`.

**Mensagem (recebida ou enviada):**

```json
{
  "type": "bridge.message",
  "provider": "evolution",
  "message": {
    "external_id": "id da mensagem no WhatsApp",
    "phone": "5562999998888",
    "from_me": false,
    "sender_name": "Maria Souza",
    "sent_at": "2026-09-28T12:00:00.000Z",
    "kind": "text",
    "body": "texto ou legenda, ou null",
    "media_path": "ar1-wa-media/5562999998888/<id>.<ext>",
    "media_mime": "audio/ogg",
    "media_name": "briefing.pdf",
    "is_group": false,
    "outbox_id": null
  }
}
```

- `kind`: `text | image | audio | video | document | sticker | location | contact | other`.
- `media_path`: caminho do arquivo que a ponte subiu no bucket privado
  `ar1-wa-media` (ou `null`). O painel grava `media_url = storage:ar1-wa-media/<caminho>`
  e serve o arquivo por `/api/midia`.
- `from_me: true` + `outbox_id`: a mensagem saiu pelo painel. O painel grava
  `sent_by = 'sistema'`, `sent_by_user = outbox.created_by`, marca a linha da
  `ar1_wa_outbox` como `sent` (com `external_id`) e liga a sugestão da IA à
  mensagem. `from_me: true` sem `outbox_id` = enviada pelo celular.
- `is_group: true` é ignorado (só fica no log de eventos).
- Mensagens repetidas (mesmo `external_id`) são descartadas.

**Estado da conexão:**

```json
{ "type": "bridge.status", "provider": "evolution", "connected": true,
  "state": "open", "phone": "5562981252338", "checked_at": "2026-09-28T12:00:00.000Z" }
```

`state`: `open | close | connecting`. Vai para `ar1_settings['whatsapp.status']`.

**QR code:**

```json
{ "type": "bridge.qr", "media_path": "ar1-wa-media/_sistema/qr.png",
  "updated_at": "2026-09-28T12:00:00.000Z" }
```

A ponte sobe a imagem no bucket e avisa; vai para `ar1_settings['whatsapp.qr']`
e aparece em Configurações → "Mostrar QR code".

### 2. Painel → ponte: fila de envio

Quando alguém envia pelo painel, uma linha entra em `public.ar1_wa_outbox` com
`status = 'queued'`. A ponte deve:

1. Observar a tabela (Realtime ou consulta periódica) por `status in ('queued')`.
2. Marcar `sending` (e incrementar `attempts`), enviar `text` para `phone`.
3. Se der certo: mandar o `bridge.message` com `from_me: true` e o `outbox_id`
   (o painel marca `sent`). Se preferir, também pode marcar `sent` direto.
4. Se falhar: `status = 'failed'`, `error = '<motivo curto>'`. A tela mostra
   o erro e um botão "Tentar de novo" (volta para `queued`).

### 3. Mídia

Arquivos vão para o bucket privado `ar1-wa-media`, caminho
`<telefone>/<id>.<ext>` (o QR fica em `_sistema/qr.png`). O painel só lê;
a ponte usa a chave de serviço para gravar.

## Z-API (alternativa)

Com `WHATSAPP_PROVIDER=zapi`, o painel fala direto com a Z-API:

1. Crie uma instância no painel da Z-API. Anote **Instance ID**, **Token** e o
   **Client-Token** (Segurança → Token de segurança da conta).
2. Em Configurações → "Mostrar QR code", leia o QR com o WhatsApp Business
   (⋮ → Dispositivos conectados → Conectar dispositivo). Ou leia direto no
   painel da Z-API.
3. Em **Webhooks** da instância, configure:
   - **Ao receber**: `https://SEU-DOMINIO/api/whatsapp/webhook/<WEBHOOK_SECRET>`
     e ligue **"Notificar mensagens enviadas por mim"** (assim as respostas
     dadas pelo celular também aparecem no painel).
   - **Ao conectar** e **Ao desconectar**: a mesma URL.
   - Os demais (entrega, status) podem apontar para a mesma URL; só ficam no log.

Os campos do payload que ainda merecem conferência contra a Z-API real estão
marcados com `// CONFERIR` em `src/lib/whatsapp/parser.ts` e `src/lib/whatsapp/zapi.ts`.

## Como a análise da IA acontece

1. Cada mensagem recebida faz o gatilho do banco marcar
   `ai_analysis_due_at = agora + 40 s`.
2. O webhook responde na hora e, em segundo plano, espera 40 s. Se nenhuma
   mensagem nova do contato chegou nesse meio-tempo, chama `/api/ia/analisar`
   (uma rajada de mensagens gera uma análise só).
3. A análise lê as últimas 40 mensagens, as instruções e os serviços de
   Configurações e as observações do contato. O conteúdo das mensagens é
   tratado como dado, não como instrução.
4. O resultado atualiza o atendimento e, se houver resposta, cria uma sugestão
   pendente. Se a última mensagem já foi nossa, não há sugestão (a não ser
   que a equipe peça uma com instrução).
5. Erros ficam em `ai_error` e aparecem no painel; "Reanalisar" tenta de novo.

Se a análise em segundo plano não rodar (por exemplo, o app hibernou), o
botão "Analisar agora" na conversa faz o mesmo trabalho.

## Rodar localmente

```bash
cd atendimento
npm install
cp .env.example .env.local   # e preencha
npm run dev                  # http://localhost:3000
```

Checagens:

```bash
npm run lint
npm test
npm run build
```

## Testar com o simulador

O script `scripts/simular-webhook.mjs` envia payloads de exemplo para o webhook:

```bash
# ponte local (padrão): texto
node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO

# todos os cenários da ponte (texto, imagem, áudio, documento, enviada, grupo, status, qr)
node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO --cenario todos

# formato Z-API
node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO --formato zapi --cenario todos

# telefone e texto próprios
node scripts/simular-webhook.mjs http://localhost:3000/api/whatsapp/webhook/SEGREDO \
  --telefone 5562988887777 --nome "João" --texto "Quero gravar um podcast em outubro"
```

Depois de ~40 s a análise da IA aparece na conversa (com a chave da IA
configurada). Para testar o envio sem WhatsApp real, use `WHATSAPP_PROVIDER=bridge`:
a mensagem entra na fila (`ar1_wa_outbox`) e aparece como "enviando…" até a
ponte processar.

## Estrutura

```
src/
  proxy.ts                    sessão + proteção das telas
  app/
    login/                    tela de login
    (app)/                    telas protegidas: fila, conversa, contatos, configurações
    api/                      rotas de servidor
  components/                 Fila, Conversa, Balao, Contatos, Configuracoes, Shell…
  lib/
    ia.ts                     camada de IA (OpenRouter | Anthropic)
    analise/contexto.ts       monta o contexto da conversa (puro, testado)
    analise/executar.ts       roda a análise e grava no banco
    whatsapp/parser.ts        interpreta webhooks (ponte e Z-API; puro, testado)
    whatsapp/processar.ts     contato → atendimento → mensagem
    whatsapp/zapi.ts          cliente da Z-API
    supabase/                 clientes (navegador, servidor, serviço)
tests/                        vitest
scripts/simular-webhook.mjs   simulador
```
