# Ponte local do WhatsApp — AR1 Atendimento

Esta pasta liga o **WhatsApp dos Estúdios SOBI** ao **painel de atendimento** (o site na Vercel). Ela roda **neste computador**.

## O que a ponte faz

```
celular (WhatsApp Business)
   │  conexão espelhada ("Dispositivos conectados")
   ▼
Evolution API  ── Docker neste PC (porta 8080, só local)
   │  avisa cada mensagem/estado (webhook)
   ▼
ponte.mjs      ── Node neste PC (porta 3901, só local)
   │  1. traduz os eventos e manda para o painel
   │  2. guarda fotos/áudios/arquivos no Storage do Supabase
   │     (áudio é convertido para MP3 antes de subir)
   │  3. a cada 3 s pega o que o painel mandou enviar (fila) e envia
   ▼
painel na Vercel + banco Supabase
```

- Mensagens **recebidas** e **enviadas pelo celular** aparecem no painel.
- Quando alguém aprova uma resposta no painel, ela entra numa **fila** (`ar1_wa_outbox`); a ponte envia pelo WhatsApp e avisa o painel que saiu.
- A cada 5 minutos a ponte informa ao painel se o WhatsApp está conectado.
- Grupos, status e canais são **ignorados**.

## Limitação importante

**Só funciona com este PC ligado**, com o Docker Desktop aberto e a ponte rodando. Se o PC desligar, o painel para de receber mensagens (elas não se perdem: quando tudo voltar, a Evolution sincroniza e manda o que ficou pendente, mas o histórico muito longo pode não vir inteiro).

Para tirar essa dependência depois: copie esta pasta para um servidor Linux pequeno (qualquer VPS com Docker), suba o `docker-compose.yml` lá, rode `node ponte.mjs` como serviço (systemd) com o mesmo `ar1-ponte.env`, e leia o QR de novo no celular. O painel não muda nada.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `docker-compose.yml` | Evolution API v2.3.7 + Postgres 16 (banco só da Evolution). |
| `.env.example` → `.env` | Chave da Evolution (`EVOLUTION_APIKEY`). O `.env` não é versionado. |
| `ponte.mjs` | O programa da ponte. |
| `normalizar.mjs` | Tradução dos eventos da Evolution para o formato do painel (puro, testado). |
| `audio.mjs` | Conversão de áudio para MP3 com o `ffmpeg` e decisão do arquivo final (testado). |
| `normalizar.test.mjs`, `audio.test.mjs` | Testes: `npm test` (ou `node --test normalizar.test.mjs audio.test.mjs`). |
| `importar-historico.mjs` | Importa conversas antigas da Evolution para o painel (também converte áudio). |
| `Subir-Docker.ps1` | Sobe/para a Evolution (`docker compose up -d`). |
| `Instalar-Ponte.ps1` | Cria a tarefa agendada `AR1-Ponte-WhatsApp` (inicia com o Windows, sem janela, reinicia se cair). |
| `iniciar-oculto.vbs` | Usado pela tarefa para rodar o Node sem janela. |

## Onde ficam configuração, log e QR

Tudo fora do repositório, em `%LOCALAPPDATA%\SistemaACM\` (normalmente `C:\Users\<você>\AppData\Local\SistemaACM\`):

| Arquivo | O que é |
|---|---|
| `ar1-ponte.env` | Configuração da ponte (chaves). **Nunca** copie para o Git. |
| `ar1-ponte.log` | Log (gira ao passar de 5 MB; o anterior vira `ar1-ponte.log.1`). |
| `ar1-qr.png` | Último QR code gerado. |

Conteúdo do `ar1-ponte.env` (formato `CHAVE=valor`, uma por linha):

```
SUPABASE_URL=https://oflpynhhbcnhcugjxgah.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<chave service_role do Supabase>
EVOLUTION_URL=http://127.0.0.1:8080
EVOLUTION_APIKEY=<o mesmo valor do .env desta pasta>
EVOLUTION_INSTANCE=ar1
WEBHOOK_URL=https://atendimento.ar1films.com/api/whatsapp/webhook/<WEBHOOK_SECRET>
PORTA=3901
```

Opcionais: `FFMPEG` (caminho do programa que converte áudio; padrão `ffmpeg` do PATH), `ABRIR_QR=0` (não abrir o PNG do QR na tela) e `PONTE_URL_DOCKER` (URL que o container usa para achar a ponte; padrão `http://host.docker.internal:3901/evolution`). A variável de ambiente `PONTE_ENV` aponta para outro arquivo de configuração, se precisar.

## Áudio em MP3

Antes de subir um áudio ao Storage, a ponte converte para **MP3 mono, 16 kHz, ~48 kbps** (cerca de 360 KB por minuto). Motivos: MP3 toca em qualquer navegador (o iPhone não toca o ogg/opus das notas de voz do WhatsApp) e é aceito pelos modelos que transcrevem o áudio no painel.

- Usa o `ffmpeg` do PATH. Para apontar outro, coloque `FFMPEG=C:\caminho\ffmpeg.exe` no `ar1-ponte.env`.
- O áudio entra pelo stdin e sai pelo stdout do `ffmpeg`; nada é gravado em disco. Tempo limite: 60 s por áudio.
- O painel recebe o caminho e o tipo do arquivo realmente salvo: `<id>.mp3` e `audio/mpeg`.
- **Se o `ffmpeg` não existir ou a conversão falhar**, sobe o arquivo original (`<id>.ogg`, `audio/ogg`) e o log registra um aviso, **uma vez por execução**. Os áudios seguintes continuam subindo no formato original; a linha `mídia audio salva em …` mostra a extensão de cada um.
- Áudio em M4A/MP4 pode não converter pelo stdin (o `ffmpeg` precisa voltar no arquivo para ler o índice). Nesse caso sobe o original, que também toca no iPhone e é aceito na transcrição.
- Imagens, vídeos e documentos não são convertidos.
- A mudança vale para os áudios que chegarem depois de reiniciar a ponte. Os que já estão no Storage continuam em ogg.

Conferir: `ffmpeg -version` no PowerShell e, no log, linhas como `mídia audio salva em ar1-wa-media/5562…/ABC.mp3 (12 KB, convertida de 8 KB)`.

## Como subir (primeira vez)

1. **Docker Desktop** aberto e com "Engine running".
2. Nesta pasta, copie `.env.example` para `.env` e preencha `EVOLUTION_APIKEY` (uma senha longa e aleatória). Use o **mesmo** valor em `ar1-ponte.env`.
3. Crie `%LOCALAPPDATA%\SistemaACM\ar1-ponte.env` como mostrado acima.
4. No PowerShell, nesta pasta:
   ```powershell
   .\Subir-Docker.ps1          # sobe Evolution + Postgres
   npm test                    # confere o normalizador (opcional)
   node ponte.mjs              # roda a ponte na frente, para ver o log
   ```
5. A ponte cria a instância `ar1`, salva o QR em `ar1-qr.png` e **abre a imagem na tela**. Leia o QR (passo abaixo). Quando aparecer `conexão: ... -> open` no log, está conectado.
6. Feche a ponte (Ctrl+C) e instale como tarefa do Windows para ela subir sozinha:
   ```powershell
   .\Instalar-Ponte.ps1
   ```
   A partir daí ela inicia junto com a sessão do Windows e reinicia se cair. Para remover: `.\Instalar-Ponte.ps1 -Remover`.

## Como ler o QR

No celular dos Estúdios SOBI: **WhatsApp Business → ⋮ (menu) → Dispositivos conectados → Conectar dispositivo** e aponte a câmera para o QR.

O QR aparece de três jeitos (é o mesmo):
- a imagem que a ponte abre na tela na primeira vez;
- o arquivo `%LOCALAPPDATA%\SistemaACM\ar1-qr.png`;
- no painel (a ponte sobe o QR para o Storage e o painel mostra em *WhatsApp → conectar*).

O QR muda a cada ~30 segundos; a ponte salva sempre o mais novo. Se expirar, é só abrir o arquivo de novo (ou olhar no painel).

## Como conferir se está conectado

- **Saúde da ponte** (responde só neste PC):
  ```powershell
  Invoke-RestMethod http://127.0.0.1:3901/saude
  ```
  Mostra `conectado: True/False`, o estado (`open`, `close`, `connecting`) e o número.
- **Direto na Evolution** (troque a chave):
  ```powershell
  Invoke-RestMethod http://127.0.0.1:8080/instance/connectionState/ar1 -Headers @{ apikey = "<EVOLUTION_APIKEY>" }
  ```
  `state: open` = conectado.
- **No painel**: o indicador do WhatsApp usa o último `bridge.status` que a ponte enviou (renovado a cada 5 min e a cada mudança).
- **Log**: `Get-Content $env:LOCALAPPDATA\SistemaACM\ar1-ponte.log -Tail 50 -Wait`.
- **Tarefa do Windows**: `Get-ScheduledTask AR1-Ponte-WhatsApp | Get-ScheduledTaskInfo`.
- **Containers**: `docker compose ps` nesta pasta; logs: `docker compose logs -f evolution-api`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `Evolution API ainda não responde` repetindo no log | Docker Desktop fechado ou containers parados: `.\Subir-Docker.ps1`. |
| `não consegui abrir a porta 3901` | Já existe uma ponte rodando (tarefa agendada). Pare com `Stop-ScheduledTask AR1-Ponte-WhatsApp` antes de rodar na mão. |
| `Falta ... em ar1-ponte.env` | Complete o arquivo de configuração. |
| `painel recusou ... (404)` | `WEBHOOK_URL` com segredo errado ou domínio ainda não apontado. |
| Estado `close` com motivo 401 | A sessão foi encerrada no celular. A ponte gera um QR novo; leia de novo. |
| Mensagens ficam `queued` no painel | WhatsApp desconectado (veja o log: `fila: ... não está conectado`). |
| `não converti o áudio para MP3 (ffmpeg não encontrado …)` | Instale o `ffmpeg` ou aponte `FFMPEG` no `ar1-ponte.env`, e reinicie a ponte. Enquanto isso os áudios sobem em ogg. |
| Mídia sem arquivo (`[image: mídia não recuperada]`) | A Evolution não devolveu o conteúdo; o texto foi, o arquivo não. Veja o log para o motivo. |

## Segurança

- A Evolution (8080) e a ponte (3901) só aceitam conexões de `127.0.0.1`.
- A chave de serviço do Supabase fica só no `ar1-ponte.env`. O log nunca mostra chaves.
- O bucket `ar1-wa-media` é privado; o painel gera links temporários para exibir.
