# AR1 Atendimento

Painel web para o atendimento da AR1 Films pelo WhatsApp. As mensagens chegam
por um webhook, ficam guardadas no Supabase, cada conversa é analisada por IA
(tipo de contato, serviço, urgência, resumo, dados extraídos e uma resposta
sugerida) e a equipe aprova, edita ou descarta a resposta antes de enviar.

**A IA nunca envia nada sozinha.** Toda mensagem que sai passa por alguém da
equipe. No funil vale o mesmo: a IA sugere etapa, valor, probabilidade e
próxima ação, e nada muda sem o clique de uma pessoa. Na proposta também: a IA
monta o rascunho, a pessoa revisa, gera o PDF e decide se envia. A única
mensagem automática é o resumo diário, que é interno (vai para o dono).

Projeto Next.js separado do site, dentro da pasta `atendimento/` do repositório.
Na Vercel, é um projeto próprio com **Root Directory = `atendimento`**.

## O que o app faz

| Tela | Para quê |
| --- | --- |
| `/login` | Entrar com e-mail e senha (sem cadastro público). |
| `/` Fila | Atendimentos abertos, com abas por status, busca, selos da IA, não lidas, "Resposta sugerida pronta" e responsável. Atualiza em tempo real. |
| `/atendimento/[id]` Conversa | Linha do tempo (texto, imagem, áudio, vídeo, documento, figurinha, localização, contato), status, assumir, encerrar, painel da IA, **contexto deste cliente** (textos e documentos do contato), resposta sugerida (enviar / descartar / pedir outra), composer livre e **oportunidade do funil** (criar, resumo e sugestões da IA com Aceitar). No desktop, a fila fica ao lado. |
| `/funil` Funil | Quadro por etapas (Novo, Qualificado, Em contato, Proposta, Negociação, Ganho, Perdido), total em aberto, previsão ponderada, filtros e "Nova oportunidade". No desktop, arrastar e soltar; no celular, uma etapa por vez e "Mover para…" no cartão. |
| `/funil/[id]` Oportunidade | Campos comerciais, notas internas, próxima ação, histórico simples, "Abrir conversa", leitura e sugestões da IA, **Montar proposta** e histórico de propostas em PDF. Em tela larga abre como painel ao lado do quadro. |
| `/retomar` Retomar | Conversas paradas com a mensagem de retomada pronta: enviar, adiar (1, 3 ou 7 dias) ou descartar. Botão "Gerar agora". |
| `/contatos` | Buscar contatos, corrigir nome/empresa, observações (a IA lê) e bloquear spam. |
| `/configuracoes` | Estado do WhatsApp, QR code, instruções e serviços usados pela IA, **dias sem retorno para sugerir retomada**, **resumo diário** (ligar, telefones, prévia, enviar agora), **base de conhecimento da AR1**, lista da equipe. |

Rotas de servidor:

| Rota | Função |
| --- | --- |
| `POST /api/whatsapp/webhook/[segredo]` | Recebe eventos da ponte local **ou** da Z-API (mesmo webhook; detecta pelo campo `type`). |
| `POST /api/ia/analisar` | Analisa um atendimento (sessão da equipe ou `x-internal-secret`). |
| `POST /api/transcrever` | Transcreve o áudio de uma mensagem (`{ "message_id": "…" }`), grava em `transcript` e devolve o texto (sessão da equipe ou `x-internal-secret`). |
| `POST /api/whatsapp/enviar` | Envia texto: enfileira para a ponte (`bridge`) ou chama a Z-API (`zapi`). Com `followup_id`, marca a retomada como enviada. Com `proposal_id`, marca a proposta como enviada. |
| `POST /api/followups/gerar` | Gera as sugestões de retomada (sessão da equipe, `x-internal-secret` ou `Authorization: Bearer CRON_SECRET`). `GET` só para o cron e chamadas internas. |
| `GET /api/whatsapp/status` | Estado da conexão. |
| `GET /api/whatsapp/qr` | QR code para conectar o aparelho. |
| `GET /api/midia?path=…` | Redireciona para a URL assinada (1 h) de um arquivo do bucket privado `ar1-wa-media`. |
| `GET /api/equipe` | Equipe com e-mails. |
| `POST /api/contexto/upload-url` | Valida o arquivo e devolve caminho + token para enviar direto ao bucket `ar1-context`. |
| `GET /api/contexto?escopo=…` | Lista os documentos (base da AR1 ou de um contato), sem o texto inteiro. |
| `POST /api/contexto` | Cria um documento: texto digitado, ou arquivo já enviado (lê e extrai o texto). |
| `GET / PATCH / DELETE /api/contexto/[id]` | Texto completo, alteração (título, texto, "usar na IA") e exclusão (linha + arquivo). |
| `GET /api/contexto/[id]/arquivo` | Redireciona para a URL assinada (10 min) do arquivo original. |
| `POST /api/propostas/rascunho` | A IA monta o rascunho estruturado da proposta (`{ oportunidade_id, atendimento_id?, sem_ia? }`). Não grava nada. |
| `GET /api/propostas?oportunidade=…` | Histórico de propostas da oportunidade. |
| `POST /api/propostas` | Gera o PDF da proposta revisada, guarda no Storage e registra no histórico. |
| `GET /api/propostas/[id]/arquivo` | Redireciona para a URL assinada (10 min) do PDF. |
| `POST /api/propostas/[id]/link` | Cria o link assinado de 7 dias e o texto sugerido da mensagem. Não envia. |
| `GET / POST /api/resumo/diario` | Resumo diário do dono. `GET` só para o cron e chamadas internas; `POST` também aceita sessão da equipe (`{ modo: "previa" \| "enviar", forcar, texto }`). |

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
| `OPENROUTER_API_KEY` | Chave da OpenRouter (quando `AI_PROVIDER=openrouter`). Também é a chave da transcrição de áudio, sempre. |
| `AI_AUDIO_MODEL` | Modelo com entrada de áudio usado na transcrição. Padrão `google/gemini-3.5-flash-lite`. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Só quando `AI_PROVIDER=anthropic`. |
| `WHATSAPP_PROVIDER` | `bridge` (padrão, ponte local) ou `zapi`. |
| `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` | Só quando `WHATSAPP_PROVIDER=zapi`. |
| `WEBHOOK_SECRET` | Segmento secreto da URL do webhook e cabeçalho `x-internal-secret`. |
| `CRON_SECRET` | Segredo do cron da Vercel (retomadas às 08:00 e resumo diário às 08:10). Sem ele o cron recebe 401: as retomadas só saem pelo botão "Gerar agora" e o resumo só pelo "Enviar agora". |
| `APP_URL` | Opcional. URL pública do app (o webhook usa para agendar a análise). Na Vercel usa `VERCEL_PROJECT_PRODUCTION_URL` quando vazio. |

Na Vercel, cadastre as mesmas variáveis em Settings → Environment Variables.

## Banco de dados

As tabelas vêm das migrações em `../supabase/migrations/`:

- `20260831140000_ar1_foundation.sql` — equipe (`ar1_staff`), clientes, pedidos de orçamento.
- `20260928100000_ar1_atendimento.sql` — contatos, atendimentos, mensagens, sugestões da IA, configurações, log de eventos, gatilhos e RLS.
- `20260928110000_ar1_wa_ponte.sql` — fila de envio (`ar1_wa_outbox`) e bucket privado `ar1-wa-media`.
- `20260929100000_ar1_contexto.sql` — documentos de contexto (`ar1_context_docs`) e bucket privado `ar1-context`.
- `20260929110000_ar1_funil.sql` — funil sobre `ar1_quote_requests` (etapas, valor, probabilidade, próxima ação, origem, leitura da IA, gatilho de etapa) e retomadas (`ar1_followups`).
- `20260930100000_ar1_propostas.sql` — propostas em PDF (`ar1_proposals`): número, conteúdo aprovado, total, validade, caminho do arquivo, quem gerou e quando o link foi enviado. **Precisa ser aplicada** para gerar PDF; sem ela a tela avisa "falta aplicar a migração" e o restante do painel funciona igual. O resumo diário não pede migração.

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
    "media_mime": "audio/mpeg",
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
- Áudio: a ponte converte para MP3 antes de subir, então chega `<id>.mp3` com
  `media_mime: "audio/mpeg"`. Se a conversão falhar, chega o arquivo original
  (`<id>.ogg`, `audio/ogg`). O caminho e o mime são sempre os do arquivo salvo.
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
   Configurações, as observações do contato e os documentos de contexto
   (base da AR1 + documentos do contato; veja "Contexto para a IA"). O
   conteúdo das mensagens e dos documentos é tratado como dado, não como
   instrução.
4. O resultado atualiza o atendimento e, se houver resposta, cria uma sugestão
   pendente. Se a última mensagem já foi nossa, não há sugestão (a não ser
   que a equipe peça uma com instrução).
5. Erros ficam em `ai_error` e aparecem no painel; "Reanalisar" tenta de novo.

Se a análise em segundo plano não rodar (por exemplo, o app hibernou), o
botão "Analisar agora" na conversa faz o mesmo trabalho.

## Transcrição de áudio

Todo áudio do WhatsApp vira texto, para a equipe ler sem ouvir e para a IA
considerar o que foi dito.

### Como funciona

1. **Ponte**: ao receber um áudio, converte para **MP3 mono, 16 kHz, ~48 kbps**
   com o `ffmpeg` e sobe o `.mp3` no bucket `ar1-wa-media`. MP3 toca em
   qualquer navegador (o iPhone não toca o ogg/opus das notas de voz) e é
   aceito pelos modelos de áudio. Sem `ffmpeg`, ou se a conversão falhar, sobe o
   arquivo original. Detalhes em `ponte/LEIA-ME.md`.
2. **Webhook**: quando chega um áudio novo guardado no bucket, o painel
   responde à ponte na hora e, em segundo plano, **primeiro transcreve e grava
   `ar1_wa_messages.transcript`; depois espera e analisa**. Assim a análise
   sempre enxerga a transcrição. O tempo gasto transcrevendo é descontado da
   espera de 40 s.
3. **Transcrição** (`src/lib/transcricao.ts`): baixa o arquivo com a chave de
   serviço e chama a OpenRouter (`/chat/completions`) com o modelo de
   `AI_AUDIO_MODEL`, mandando a instrução e o áudio em base64
   (`input_audio`, formato `mp3`, `ogg`, `wav` ou `m4a`), com `temperature: 0`.
4. **Análise**: na conversa enviada à IA, a linha do áudio vira
   `[áudio] <transcrição>`. Sem transcrição, continua `[áudio sem transcrição]`.
5. **Tela**: embaixo do player aparece o texto, com o rótulo "Transcrição".
   Sem texto, aparece o botão **Transcrever**, que chama `POST /api/transcrever`.

| Áudio | Transcreve sozinho | Dispara análise |
| --- | --- | --- |
| Recebido do contato | sim | sim |
| Enviado por nós (celular) | sim | não |
| Histórico importado | não (use o botão) | não |
| Anterior a este recurso, ou que falhou | não (use o botão) | não |
| Z-API (arquivo fora do bucket) | não | sim |

A instrução pede transcrição fiel em português do Brasil, sem resumir nem
corrigir o sentido, com pontuação natural, `[inaudível]` onde não der para
entender e `[sem fala]` quando o áudio não tem fala. O que é dito no áudio é
tratado como conteúdo: ordens gravadas são só transcritas.

### Se a transcrição falhar

A análise segue normalmente (o áudio entra como `[áudio sem transcrição]`), o
motivo vai para o log do servidor e o botão **Transcrever** continua na
mensagem. O botão mostra o erro em português: chave recusada, conta sem
créditos, modelo não encontrado, modelo que não aceita áudio, limite de uso,
tempo esgotado, arquivo grande demais ou arquivo não encontrado.

### Limites

| Limite | Valor |
| --- | --- |
| Tamanho do arquivo | 20 MB (cerca de 55 minutos no MP3 da ponte) |
| Tempo de espera pela IA | 50 s |
| Texto gravado | 20.000 caracteres (o que passar é cortado) |
| Formatos aceitos | MP3, OGG, WAV, M4A |
| Conversão na ponte | 60 s por áudio |

O formato é decidido pelo começo do arquivo; se não der para reconhecer, pelo
mime e depois pela extensão. Áudio em outro formato (AAC solto, AMR) não é
transcrito.

Se dois áudios chegarem em sequência, cada um é transcrito no próprio pedido.
Um áudio muito longo pode terminar de transcrever depois que a análise
disparada pela mensagem seguinte já rodou; "Reanalisar" resolve.

### Custo aproximado

A cobrança é por token, na mesma conta da OpenRouter. Um modelo Gemini conta
cerca de 32 tokens por segundo de áudio, ou seja, perto de 2.000 tokens por
minuto, mais o texto devolvido. Nos modelos "flash-lite" isso dá, em ordem de
grandeza, **menos de US$ 0,002 por minuto de áudio** (100 áudios de 1 minuto
custam centavos de dólar). É uma estimativa: o preço vigente está na página do
modelo na OpenRouter, e outro modelo em `AI_AUDIO_MODEL` muda a conta.

### Trocar o modelo

`AI_AUDIO_MODEL` aceita qualquer modelo da OpenRouter com entrada de áudio. A
chamada é sempre pela OpenRouter, mesmo com `AI_PROVIDER=anthropic`, então
`OPENROUTER_API_KEY` precisa existir.

## Contexto para a IA

A IA analisa e sugere respostas usando dois conjuntos de documentos:

| Onde cadastrar | O que é | Vale para |
| --- | --- | --- |
| Configurações → **Base de conhecimento da AR1** | Serviços e preços, condições comerciais, apresentação/portfólio, perguntas frequentes. | Todas as conversas. |
| Conversa → **Contexto deste cliente** | Briefing, proposta enviada, combinados daquele contato. | Só as conversas daquele contato. |

Em cada lugar dá para **Adicionar texto** (título + texto) ou **Enviar
documento**: PDF, Word (.docx), .txt, .md ou .csv, até 25 MB, vários de uma
vez. Cada documento tem a chave **Usar na IA**; desligada, ele fica guardado
mas não entra na análise.

### Como o arquivo é processado

1. O navegador pede `POST /api/contexto/upload-url`, que valida tipo e tamanho
   e devolve caminho e token.
2. O arquivo vai **do navegador direto para o Storage** (`uploadToSignedUrl`),
   no bucket privado `ar1-context`, caminho `<global|id do contato>/<uuid>-<nome>`.
   Não passa pelo servidor porque funções da Vercel limitam o corpo a ~4,5 MB.
3. O navegador chama `POST /api/contexto`; o servidor baixa o arquivo, extrai o
   texto (`src/lib/contexto/extrair.ts`: `unpdf` para PDF, `mammoth` para
   .docx, leitura direta para texto, com UTF-8 e retorno a latin1) e grava a
   linha em `ar1_context_docs`.
4. O texto guardado tem no máximo **300.000 caracteres**; acima disso é cortado
   e a lista avisa.

PDF escaneado (só imagem) não tem texto para extrair: o documento é guardado,
a lista mostra "Não consegui ler texto deste arquivo (parece imagem
escaneada)" e a IA não o usa. Não há OCR.

### Como entra no prompt

No prompt do usuário, antes da conversa, entram duas seções:
`BASE DE CONHECIMENTO DA AR1` e `CONTEXTO DESTE CLIENTE`, cada documento como
`### título` + texto. Sem documentos, a seção aparece com "(nenhum documento)".

| Seção | Orçamento |
| --- | --- |
| Base de conhecimento da AR1 | 60.000 caracteres |
| Contexto deste cliente | 40.000 caracteres |

Quando os documentos ativos de uma seção passam do orçamento
(`src/lib/contexto/orcamento.ts`):

- o espaço é dividido **proporcionalmente** ao tamanho de cada documento, com
  piso de **1.500 caracteres** por documento;
- cada documento cortado guarda o começo (3/4) e o fim (1/4), com a marca
  `[… trecho cortado …]` no meio;
- se nem os pisos couberem (mais de 40 documentos na base, por exemplo), entram
  os **mais recentes** e o prompt lista os títulos que ficaram de fora.

Por isso vale mais ter documentos curtos e objetivos do que um PDF enorme.

### Regras que a IA recebe

- Os documentos são a fonte de verdade sobre a AR1 e sobre o cliente; ela não
  deve inventar fatos, preços ou prazos que não estejam neles ou na conversa.
- As **instruções de atendimento continuam valendo**: se elas mandarem não
  prometer preço, a IA não promete, mesmo que o preço esteja num documento.
  Para liberar, escreva isso nas instruções (ex.: "pode informar os preços da
  tabela").
- Se um documento do cliente disser algo diferente da base (um valor combinado
  numa proposta), vale o do cliente para aquele contato.
- Conteúdo de documentos e de mensagens é dado, não ordem.

### Fontes

A IA devolve o campo `fontes` (títulos dos documentos que usou). O servidor só
aceita títulos de documentos que de fato foram enviados no prompt e grava no
fim do `rationale` da sugestão: `\nFontes: A; B`. A tela mostra como
"Baseado em: A; B" no painel da análise e no cartão da resposta sugerida.

Depois de adicionar, alterar ou apagar um documento na conversa, aparece o
aviso com o botão **Reanalisar com o novo contexto**. Mudanças na base da AR1
valem a partir da próxima análise de cada conversa.

## Funil de vendas

A oportunidade é a linha de `ar1_quote_requests`. O pedido do site e a
conversa do WhatsApp caem no mesmo funil (`source`: site, whatsapp, indicacao,
outro).

| Etapa no banco | Na tela |
| --- | --- |
| `new` | Novo |
| `qualified` | Qualificado |
| `contacting` | Em contato |
| `proposal` | Proposta |
| `negotiating` | Negociação |
| `won` | Ganho |
| `lost` | Perdido |

Regras (em `src/lib/funil/etapas.ts`, testadas):

- **Total em aberto**: soma dos valores das cinco etapas abertas.
- **Previsão ponderada**: soma de valor × probabilidade das etapas abertas.
  Oportunidade sem probabilidade preenchida usa a padrão da etapa (Novo 10,
  Qualificado 25, Em contato 40, Proposta 60, Negociação 80); no cartão ela
  aparece como "(padrão)". Oportunidade sem valor não entra na conta.
- **Mover para Perdido** exige o motivo (`lost_reason`). **Mover para Ganho**
  pede a confirmação do valor final e leva a probabilidade a 100. Sair de
  Perdido limpa o motivo. `stage_changed_at` e `closed_at` são do gatilho do banco.
- **Ganho e Perdido** ficam recolhidos e mostram só o que fechou nos últimos
  30 dias ("Mostrar mais antigas" abre o resto).
- **Próxima ação** marcada só com o dia vence às 18 h de Brasília; vencida,
  fica em vermelho.
- Na tela, datas e horas são de Brasília (UTC−03:00).

O quadro atualiza em tempo real (Realtime em `ar1_quote_requests`) e recarrega
a cada 60 s por segurança.

### Conversa e oportunidade

Na conversa, **Criar oportunidade** abre um formulário curto já preenchido com
o que a IA leu (valor, probabilidade, próxima ação e data), editável antes de
salvar. A oportunidade nasce em Novo, com `contact_id`, `source = 'whatsapp'` e
ligada à conversa (`ar1_atendimentos.quote_request_id`). Se o contato já tem
uma oportunidade aberta, a tela oferece ligar a conversa a ela. Depois de
ligada, a conversa mostra etapa, valor e próxima ação, com link para o funil, e
o cartão da fila ganha o selo "Funil: etapa".

### IA no funil

A análise da conversa devolve também o campo `oportunidade`
(`src/lib/analise/oportunidade-esquema.ts`):

```json
{
  "etapa_sugerida": "proposal",
  "valor_estimado": 4800,
  "probabilidade": 60,
  "proxima_acao": "enviar proposta",
  "proxima_acao_em": "2026-10-02T18:00:00-03:00",
  "motivo": "Pediu orçamento; valor da tabela de preços."
}
```

O campo é obrigatório, mas tudo dentro dele pode vir nulo. `valor_estimado` só
vem quando há base nos documentos ou na conversa. O código aplica os limites
(probabilidade de 0 a 100, valor positivo, textos de até 500 caracteres, data
válida) e descarta a leitura comercial quando o contato é spam, pessoal ou
fornecedor.

Onde fica guardado, sem mudar o esquema:

- `ar1_atendimentos.ai_extracted.oportunidade` — a sugestão em si.
- `ar1_quote_requests.ai_notes` — quando a conversa tem oportunidade ligada,
  um texto curto com a leitura e a data ("Leitura da IA" no detalhe).

Na conversa e no detalhe, cada sugestão é uma linha com **Aceitar** ("IA
sugere mover para Proposta", "IA sugere valor de R$ 4.800"…). Aceitar grava só
aquele campo. Sugestão de Ganho ou Perdido abre a mesma janela de confirmação
(valor final ou motivo). Oportunidade fechada não recebe sugestão.

## Retomadas (follow-ups)

`POST /api/followups/gerar` procura conversas paradas e grava, para cada uma,
uma sugestão em `ar1_followups` com status `pendente`. Nada é enviado por essa
rota. Roda todo dia às 08:00 de Brasília (`vercel.json`: `0 11 * * *`, em UTC)
e pelo botão **Gerar agora**.

Quem entra (`src/lib/followups/candidatos.ts`, funções puras e testadas):

| Caso | Regra | Prioridade |
| --- | --- | --- |
| Cliente aguardando resposta | Conversa `novo` ou `em_atendimento`, última mensagem do cliente há mais de **4 horas úteis** sem resposta nossa. | alta |
| Sem retorno | Conversa `aguardando_cliente`, nossa última mensagem há mais de **N dias** e nada do cliente depois. N vem de Configurações (`ar1_settings['followup.dias_sem_retorno']`, padrão 2, de 1 a 30). | média |
| Ação vencida | Oportunidade aberta com `next_action_at` vencida. | Proposta e Negociação: alta. Qualificado e Em contato: média. Novo: baixa. |

Horas úteis: segunda a sexta, das 9 h às 18 h de Brasília (feriados não contam
como folga).

Quem fica de fora:

- contato bloqueado; atendimento fechado (na regra da ação vencida, a conversa
  encerrada ainda serve para enviar, menos quando fechou como "sem interesse"
  ou "spam");
- `ai_kind` spam, pessoal ou fornecedor;
- contato que já tem retomada `pendente` ou `adiado`, ou que teve uma
  `descartado` ou `enviado` nas últimas **48 h**;
- conversa parada há mais de **30 dias** (não ressuscita histórico antigo);
- contato que já recebeu **3 retomadas** depois da última mensagem dele;
- oportunidade sem contato do WhatsApp ou sem nenhuma conversa (não há por
  onde enviar).

No máximo **15 por execução**, os parados há mais tempo primeiro, um por
contato. Retomadas `adiado` com prazo vencido voltam a `pendente` no começo de
cada execução.

Para cada candidato a IA recebe as instruções de atendimento, a base de
conhecimento, o contexto do cliente, a oportunidade e as últimas 30 mensagens,
e devolve `{ texto, motivo, prioridade }`: mensagem curta, no tom das
instruções, sem pressão e sem prometer preço ou data. A IA pode subir a
prioridade da regra, nunca baixar. As chamadas rodam 5 por vez; se o tempo da
rota (60 s) apertar, o que faltou fica para a próxima execução.

Na tela **Retomar**: **Enviar** usa o mesmo fluxo de envio da conversa (fila da
ponte) e grava `final_text`, `outbox_id`, `decided_by`, `decided_at` e status
`enviado`; **Adiar** (1, 3 ou 7 dias) e **Descartar** gravam a decisão. Se
chegou mensagem nova depois que a sugestão foi escrita, o cartão avisa.

### Cron na Vercel

`vercel.json` já traz os dois agendamentos (retomadas às 11:00 UTC e resumo
diário às 11:10 UTC). Falta cadastrar `CRON_SECRET` em Settings → Environment
Variables e publicar. A Vercel envia `Authorization: Bearer <CRON_SECRET>`; sem
a variável, a rota responde 401. No plano Hobby a Vercel não garante o minuto:
o cron roda em algum momento dentro da hora marcada.

## Proposta em PDF

Na oportunidade (`/funil/[id]`) e no cartão da oportunidade dentro da conversa
há o botão **Montar proposta**. São quatro passos, e nada sai para o cliente
sem o clique de alguém.

### 1. Rascunho da IA

`POST /api/propostas/rascunho` lê a oportunidade, o contato, as últimas 60
mensagens da conversa (com as transcrições dos áudios), as instruções de
atendimento, a base de conhecimento e o contexto do cliente, e pede à IA um
rascunho estruturado (`src/lib/propostas/esquema.ts`):

```json
{
  "titulo": "Podcast itinerante na feira de noivas",
  "cliente": { "nome": "Maria Souza", "empresa": "Souza Eventos" },
  "resumo_do_pedido": "…",
  "escopo": [{ "item": "Gravação no evento", "descricao": "…" }],
  "entregas": ["Episódios editados"],
  "cronograma": [{ "etapa": "Gravação", "prazo": "24 e 25/10/2026" }],
  "investimento": [{ "descricao": "Diária de gravação", "valor": 2800, "fonte_do_valor": "Tabela de serviços 2026" }],
  "condicoes": ["50% na aprovação e 50% na entrega."],
  "validade_dias": 15,
  "observacoes": null,
  "pendencias": ["Confirmar o horário de montagem."],
  "fontes": ["Tabela de serviços 2026"]
}
```

`fonte_do_valor`, `pendencias` e `fontes` são só do rascunho: ajudam quem
revisa e não fazem parte da proposta.

**Regra dos valores** (no prompt e no código, `src/lib/propostas/valores.ts` e
`rascunho.ts`, testados): um valor só fica no rascunho se for o valor estimado
da oportunidade (`estimated_value`) ou se o mesmo número estiver escrito em
algum texto que a IA leu (documento, contexto do cliente, conversa,
observações do contato, pedido e notas da oportunidade). Qualquer outro valor
vira `null`, a tela mostra "a definir" e avisa quantos valores foram
retirados. Isso inclui conta feita pela IA: se a tabela diz R$ 2.800 por
diária e a IA devolve R$ 5.600 para dois dias, o valor sai (ninguém escreveu
5.600) e a pessoa digita. Datas, horas, telefones, percentuais e CPF/CNPJ não
contam como valor escrito.

O que mais o código garante, seja qual for a resposta do modelo:

- nome e empresa do cliente vêm do cadastro (oportunidade e contato), não da IA;
- limites de tamanho e de quantidade por campo;
- validade: a da IA só vale se estiver entre 1 e 180 dias; senão entra a
  padrão (15 dias), marcada como "padrão";
- só valem como fonte os documentos que foram de fato enviados à IA;
- `pendencias` (recados para a equipe) nunca vão para o PDF.

Prazo e condição não têm como ser conferidos por código: a regra fica no
prompt ("só com base nos documentos ou na conversa") e na revisão de quem edita.

Se a IA falhar, a tela oferece **Montar sem a IA** (rascunho só com os dados
da oportunidade).

### 2. Editor

Abre em tela cheia, no celular e no desktop. Todos os campos são editáveis, com
adicionar e remover itens, valores em reais (`4800`, `4.800,50`; vazio =
"a definir") e total calculado na hora (soma dos itens com valor; os "a
definir" são contados à parte). Cada seção mostra de onde veio: **IA**, **da
oportunidade**, **padrão** ou **editado por você**. No alto fica o "Baseado
em: …" e, em cada valor, "Valor encontrado em: …". O rascunho fica guardado no
aparelho (`localStorage`) enquanto a pessoa edita; fechar a janela não perde
nada ("Continuar rascunho").

### 3. PDF

`POST /api/propostas` valida o que veio do editor e gera o PDF no servidor com
`pdf-lib` (sem navegador, roda na função da Vercel):

- A4 retrato, de 1 a 3 páginas. Passou de 3, a rota recusa com a mensagem
  "A proposta ficou com N páginas…" e nada é gravado.
- Fundo claro para impressão, detalhes em cobre `#b86b45` e preto `#111315`,
  títulos em caixa alta. A logo da AR1 é clara (feita para fundo escuro), então
  a primeira página tem uma faixa preta no alto com a logo.
- Número `AR1-AAAAMMDD-XXXX` (dia de Brasília + sequência do dia), data de
  emissão, "válida até", paginação e rodapé com os contatos em todas as
  páginas.
- As tabelas de cronograma e de investimento não se dividem entre páginas.
- Fontes embutidas: Montserrat (títulos) e Inter (texto), em
  `recursos/propostas/fontes/` (licença OFL junto). A logo fica em
  `public/marca/`. `next.config.ts` (`outputFileTracingIncludes`) garante que
  esses arquivos vão junto com a função.
- Caractere que a fonte não desenha (emoji) é retirado do texto.

Sobre as fontes: a Inter vai inteira e a Montserrat em subconjunto. O
subconjunto do `pdf-lib` perde letras da Inter, e a Montserrat ExtraBold
inteira erra o cifrão. O arquivo fica com cerca de 0,4 MB. Ao trocar de fonte
ou de versão do `pdf-lib`, confira de novo com uma imagem do PDF (o teste de
leitura do texto não enxerga letra que sumiu do desenho).

### 4. Histórico, download e envio

O PDF fica no bucket privado `ar1-context`, em
`propostas/<oportunidade>/<número>.pdf`, e a proposta entra em
`ar1_proposals`. A oportunidade lista número, data, total, quem gerou e
validade, com os botões:

- **Baixar**: URL assinada de 10 minutos.
- **Enviar pelo WhatsApp**: cria um **link assinado de 7 dias** e abre a
  mensagem pronta para editar. O envio usa `POST /api/whatsapp/enviar` (o mesmo
  fluxo das outras mensagens) e marca a proposta como enviada. Se o texto
  ficar sem o link, o botão Enviar trava.
- **Editar e gerar nova versão**: abre o editor com o conteúdo daquela
  proposta; o PDF novo recebe outro número e o anterior continua no histórico.

**Limite atual:** a ponte só envia texto, então o cliente recebe o link, não o
arquivo. Enviar o PDF como documento do WhatsApp é um passo futuro da ponte
(`ponte/`): ela precisaria aceitar um item da fila com arquivo e chamar o envio
de mídia da Evolution. Depois de 7 dias o link para de abrir; basta enviar de
novo para criar outro.

Depois de gerar, aparecem duas sugestões com **Aceitar**, no mesmo formato das
sugestões da IA (`src/lib/propostas/sugestoes.ts`):

- mover a oportunidade para **Proposta** (só se ela estiver em Novo,
  Qualificado ou Em contato);
- próxima ação **"Cobrar retorno da proposta"** em 3 dias (vence às 18 h).

Elas somem quando aceitas, quando a oportunidade fecha ou 7 dias depois da
proposta.

## Resumo diário

Todo dia às 08:10 de Brasília (`vercel.json`: `10 11 * * *`, logo depois das
retomadas) a rota `/api/resumo/diario` monta um resumo e manda para o WhatsApp
do dono. É a única mensagem que sai sem aprovação, e ela é **interna**: vai só
para os telefones cadastrados, nunca para clientes.

### O que entra

Tudo calculado por funções puras (`src/lib/resumo/numeros.ts`, testadas):

| Bloco | Regra |
| --- | --- |
| Conversas novas | Atendimentos criados nas últimas 24 h. As 3 mais urgentes (alta, média, baixa; no empate, a mais antiga) com nome e serviço. |
| Aguardando resposta | Conversas `novo` ou `em_atendimento` em que a última mensagem é do cliente. Quem espera há mais tempo primeiro. |
| Retomadas pendentes | `ar1_followups` com status `pendente`. |
| Funil | Oportunidades por etapa aberta, total em aberto e previsão ponderada (as mesmas contas do quadro). |
| Próximas ações | Oportunidades abertas com a ação vencida ou que vence hoje (dia de Brasília). |
| Últimas 24 h | Ganhos e perdidos fechados nas últimas 24 h, com a soma dos valores. |

Ficam de fora: contato bloqueado, conversas classificadas como spam, pessoal ou
fornecedor e as conversas de quem recebe o resumo.

### O texto

A IA recebe só os números e escreve a mensagem: até 900 caracteres, no máximo
5 marcadores e uma recomendação do dia que começa com "Comece por". O código
confere o que volta (`conferirTextoDaIA`): texto vazio, com mais de 1.000
caracteres, com mais de 5 marcadores, sem a recomendação (ou com duas) ou com
valor em reais que não está nos números é recusado. Se a IA falhar ou for
recusada, vai o **texto de reserva**, montado por código com os mesmos números.

### O envio

- Destinatários: `ar1_settings['resumo.destinatarios']`, lista de telefones só
  com dígitos. Sem a chave, o padrão é `["556281069562"]`. Lista vazia = ninguém
  recebe.
- Só envia com `ar1_settings['resumo.ativo']` verdadeiro (padrão: verdadeiro).
- **Uma vez por dia**: o dia do envio fica em
  `ar1_settings['resumo.ultimo_envio']`. A reserva do dia é feita antes de
  enviar, com a condição dentro do próprio `UPDATE`, então duas execuções ao
  mesmo tempo não enviam em dobro. Se nenhum envio der certo, a reserva é
  desfeita e a próxima tentativa pode enviar.
- O envio usa a mesma fila das mensagens da equipe (`ar1_wa_outbox`). Com
  `WHATSAPP_PROVIDER=zapi`, chama a Z-API direto.

**Conversa interna.** A fila exige `atendimento_id` e `contact_id`. Para cada
destinatário o painel usa o contato daquele telefone (cria se não existir, com
o nome "Resumo diário (dono)") e uma conversa própria, criada **já fechada**,
com `ai_kind = 'pessoal'` e o resumo "Conversa interna do painel…". Assim ela
não aparece na Fila aberta, não entra no funil e não vira retomada. Quando a
ponte confirma o envio, o webhook grava a mensagem nessa mesma conversa
(`src/lib/whatsapp/processar.ts`); sem isso, cada resumo abriria um atendimento
novo. Se o dono responder ao resumo, a resposta abre uma conversa comum, como
qualquer mensagem recebida.

### Em Ajustes

A seção **Resumo diário** tem a chave de ligar e desligar, os telefones, o
último envio, **Ver prévia** (monta o texto sem enviar, e dá para editar) e
**Enviar agora** (manda o texto da prévia; se o resumo do dia já saiu, pede
confirmação). Só o botão, com sessão da equipe, passa por cima da trava do dia
e do "desligado". O cron e as chamadas internas nunca passam.

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

## Ver as telas com dados simulados

Para conferir o visual sem tocar no banco real:

```bash
# 1. Supabase de mentira (dados só na memória)
node scripts/simular-supabase.mjs 54999

# 2. Numa CÓPIA do projeto, com .env.local apontando para o simulador:
#      NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54999
#      NEXT_PUBLIC_SUPABASE_ANON_KEY=simulado
#      SUPABASE_SERVICE_ROLE_KEY=simulado
#      WEBHOOK_SECRET=simulado
npx next build && npx next start -p 3100 -H 127.0.0.1

# 3. Capturas (Chrome ou Edge instalado)
node scripts/capturar-telas.mjs --saida capturas/minha-rodada
# só algumas: --so proposta   |   --so resumo
```

Para ver o rascunho da proposta e o resumo diário sem gastar com IA, acrescente
ao `.env.local` da cópia a IA de mentira do simulador:

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=simulado
ANTHROPIC_BASE_URL=http://127.0.0.1:54999/anthropic
CRON_SECRET=simulado-cron
```

O simulador também guarda arquivos na memória, então "Gerar PDF" funciona de
ponta a ponta e o PDF pode ser baixado. Para guardar um PDF de exemplo gerado
pelos testes: `PDF_EXEMPLO_SAIDA=<pasta> npm test`.

Use uma cópia com a própria `node_modules` (o Turbopack não aceita
`node_modules` por atalho) e nunca o `.env.local` de verdade. A pasta
`capturas/` fica fora do Git.

## Estrutura

```
src/
  proxy.ts                    sessão + proteção das telas
  app/
    login/                    tela de login
    (app)/                    telas protegidas: fila, conversa, funil, retomar, contatos, configurações
    api/                      rotas de servidor
  components/                 Fila, Conversa, Funil, OportunidadeDetalhe, Propostas, EditorProposta, ResumoDiario, Retomar…
  lib/
    ia.ts                     camada de IA (OpenRouter | Anthropic)
    transcricao.ts            transcrição de áudio pela OpenRouter (só servidor, testado)
    analise/contexto.ts       monta o prompt: documentos + conversa (puro, testado)
    analise/executar.ts       roda a análise e grava no banco
    analise/oportunidade.ts   leitura comercial da IA: limites e textos (puro, testado)
    funil/etapas.ts           etapas, totais, previsão e regras de transição (puro, testado)
    funil/sugestoes.ts        sugestões da IA -> campos da oportunidade (puro, testado)
    funil/formulario.ts       validação dos formulários do funil (puro, testado)
    funil/datas.ts            datas em horário de Brasília (puro, testado)
    followups/candidatos.ts   quem recebe retomada, horas úteis (puro, testado)
    followups/prompt.ts       prompt e resposta da retomada (puro, testado)
    followups/gerar.ts        rotina das retomadas (banco + IA)
    propostas/proposta.ts     conteúdo, limites, total, numeração, validade e validação (puro, testado)
    propostas/valores.ts      regra dos valores: o número precisa estar escrito (puro, testado)
    propostas/rascunho.ts     prompt do rascunho e regras aplicadas à resposta da IA (puro, testado)
    propostas/editor.ts       estado do editor e conversão para a proposta (puro, testado)
    propostas/sugestoes.ts    sugestões depois de gerar a proposta (puro, testado)
    propostas/mensagem.ts     mensagem do WhatsApp com o link (puro, testado)
    propostas/pdf.ts          PDF com a marca AR1 Films (pdf-lib; só servidor, testado)
    propostas/servidor.ts     rascunho com a IA e geração da proposta (banco + Storage)
    propostas/registro.ts     histórico, link assinado e marca de enviada (banco + Storage)
    resumo/numeros.ts         números do resumo diário (puro, testado)
    resumo/texto.ts           texto de reserva, prompt e conferência do texto da IA (puro, testado)
    resumo/ajustes.ts         telefones, ligar e desligar, trava de um envio por dia (puro, testado)
    resumo/rotina.ts          ordem das coisas no resumo, com portas trocáveis (puro, testado)
    resumo/executar.ts        portas de verdade: banco, IA e fila de envio
    resumo/conversa-interna.ts  a conversa fechada usada para mandar o resumo (puro, testado)
    contexto/extrair.ts       texto de PDF, Word e texto puro (só servidor, testado)
    contexto/orcamento.ts     orçamento de caracteres e cortes (puro, testado)
    contexto/validar.ts       validação das entradas das rotas (puro, testado)
    contexto/fontes.ts        fontes no rationale da sugestão (puro, testado)
    whatsapp/parser.ts        interpreta webhooks (ponte e Z-API; puro, testado)
    whatsapp/processar.ts     contato → atendimento → mensagem
    whatsapp/pos-mensagem.ts  depois de gravar: transcrever e então analisar (puro, testado)
    whatsapp/zapi.ts          cliente da Z-API
    supabase/                 clientes (navegador, servidor, serviço)
recursos/propostas/fontes/    Montserrat e Inter (TTF, licença OFL) usadas no PDF
public/marca/                 logo da AR1 Films usada no PDF
tests/                        vitest
scripts/simular-webhook.mjs   simulador do webhook
scripts/simular-supabase.mjs  Supabase, Storage e IA de mentira para ver as telas
scripts/capturar-telas.mjs    capturas com dados simulados
```
