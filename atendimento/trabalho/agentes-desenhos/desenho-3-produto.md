# Desenho 3 - angulo: Observabilidade e custo em primeiro lugar: cada chamada de IA (texto e áudio) vira uma linha auditável com tokens por tipo, custo estimado e informado, latência, situação e erro. O consumo diário agregado cabe no Supabase Free e o dono tem controle por agente (liga/desliga, modelo, limites, alerta mensal) sem mudar o comportamento atual.

## Resumo
Desenho completo do Bloco 9. O centro é uma função única com duas entradas, executarIA (saída estruturada) e executarTranscricao (áudio), em src/lib/agentes/servidor.ts. As duas se apoiam num executor puro com portas (executarAgente), no mesmo molde de resumo/rotina.ts. A cada chamada, o executor lê os ajustes do agente em ar1_settings, resolve o modelo (ajuste > variável da Vercel > padrão do código, com lista fechada validada também no banco), aplica o disjuntor (execuções por hora e US$ por dia) e grava um run em duas fases: um INSERT 'rodando' disparado em paralelo com a IA, sem somar latência, e um UPDATE final. O executor relança sempre a mesma instância de erro, para os catch atuais continuarem funcionando.

Hoje ia.ts descarta o uso de tokens. A mudança nele é só aditiva e fica para depois do commit do bloco 8: passa a devolver uma telemetria com tokens por tipo (texto, áudio, leitura e escrita de cache, saída, raciocínio), o modelo que atendeu, o modo (json_schema, tools ou sdk) e as tentativas. Essa telemetria também vai anexada ao ErroIA quando a falha vem depois de uma resposta já cobrada. A transcrição ganha um callback aoTelemetria sem mudar o retorno, que é conferido com toEqual.

Custo:
- estimado pela tabela em código, com a versão dos preços registrada;
- informado pela OpenRouter (usage.cost) quando vier;
- nunca 0 quando desconhecido.

Banco (migração 20260930120000):
- ar1_agent_runs: sem texto de cliente, fora do Realtime, retenção de 90 dias e teto de 50 mil linhas;
- ar1_agent_usage_daily: mantida por gatilho, guardada sem prazo, publicada no Realtime; serve de 'campainha' do painel;
- ar1_agent_config_log: histórico de quem mudou modelo, instruções, liga/desliga e limites;
- ar1_kb_suggestions: sugestões do Bibliotecário;
- colunas agent_run_id sem chave estrangeira;
- função de manutenção chamada pela rotina diária.

Primeira entrega, sem mudar o comportamento:
- os modelos padrão continuam os de hoje;
- Recepção e Qualificação seguem numa chamada só;
- os prompts ficam idênticos byte a byte (testes golden);
- as instruções editáveis são só um bloco adicional; as regras fixas ficam no código.

Telas: /agentes com custo do mês, saldo da OpenRouter, alertas, cartões por agente e linha do tempo com filtros e paginação por id; /agentes/[id] com modelo (e custo simulado pela média real de tokens), limites, editor de instruções e histórico. O Bibliotecário grava sugestões numa tabela própria; só a aprovação humana cria documento.

Ordem: puros e testes, depois a migração, depois ia.ts e os chamadores um a um, depois as telas e por fim o Bibliotecário. Rollback por chave AGENTES_REGISTRO=desligado, revert por commit e script de volta do banco.

## Agentes
- **recepcao / Recepção** (Sonnet 5.5, via AI_MODEL (o mesmo de hoje); chave agente.recepcao.modelo sobrescreve): Lê a conversa do WhatsApp, classifica (tipo, serviço, urgência), resume, extrai dados e sugere a próxima resposta com as fontes usadas. É dona da chamada combinada 'analise_atendimento': o run fica em nome da Recepção, com agents_included={qualificacao}.. Gatilhos: Webhook: 40 s depois da última mensagem do contato, via /api/ia/analisar com origem 'webhook'. Botões Analisar agora, Reanalisar e Pedir outra (origem 'equipe', com usuário). Importador de histórico (origem 'importador').. Absorve: src/lib/analise/executar.ts (analisarAtendimento), src/lib/analise/contexto.ts (montarContexto). Continua uma chamada só, combinada com a Qualificação; o pós-processamento atual passa a rodar dentro de processar().. Sozinho: Gravar ai_kind, ai_service, ai_urgency, ai_summary, ai_extracted, ai_analyzed_at e ai_error no atendimento. Criar sugestão 'pendente' em ar1_ai_suggestions (com agent_run_id) e marcar a anterior como 'substituida'. Zerar ai_analysis_due_at.. Aprovacao: Qualquer envio ao cliente (Enviar pelo painel, com sessão). Editar a resposta. Mudar status ou desfecho da conversa.
- **qualificacao / Qualificação** (Na análise usa o modelo da Recepção (chamada combinada; o seletor fica desativado para essa tarefa). Na tarefa própria 'pedido_da_conversa', Sonnet 5.5 via AI_MODEL (igual a hoje).): Leitura comercial da conversa: serviço, data, local e orçamento, e as sugestões de etapa, valor, probabilidade e próxima ação. Também preenche o pedido da proposta ('Puxar da conversa').. Gatilhos: Junto com a Recepção, a cada análise. Botão 'Puxar da conversa' na Nova proposta (origem 'equipe').. Absorve: Campo 'oportunidade' de esquemaAnalise, src/lib/analise/oportunidade.ts e oportunidade-esquema.ts, src/lib/funil/sugestoes.ts (regra sem IA) e src/lib/propostas/premium/servidor.ts puxarPedidoDaConversa (integrar só depois do commit do bloco 8).. Sozinho: Gravar ai_extracted.oportunidade (sugestão) e ai_notes (texto 'Leitura da IA em …') na oportunidade ligada. Devolver o pedido ao formulário, sem gravar.. Aprovacao: Etapa, valor estimado, probabilidade e próxima ação (Aceitar campo a campo), além do conteúdo do formulário da proposta. Desligada: a análise segue, mas o código descarta a leitura comercial e não grava ai_notes.
- **redator / Redator de propostas** (Opus 5.5 via AI_MODEL_PROPOSTAS na premium. Sonnet 5.5 via AI_MODEL no rascunho antigo. Com agente.redator.modelo definido, as duas tarefas usam o mesmo modelo.): Escreve a proposta premium completa em JSON. A IA escolhe itens da tabela de preços e quantidades, e o servidor recalcula os valores. Também escreve o rascunho da proposta simples em PDF (fluxo antigo).. Gatilhos: Botão 'Gerar proposta com a IA' em Nova proposta e rota do rascunho em PDF (origem 'equipe', com usuário).. Absorve: src/lib/propostas/premium/servidor.ts criarPropostaPremium (+ prompt.ts, esquema.ts, investimento.ts) e src/lib/propostas/servidor.ts prepararRascunho (+ rascunho.ts). Integrar por último, depois do commit do bloco 8.. Sozinho: Gravar a proposta com valores recalculados pela tabela (com agent_run_id) e devolver pendências e avisos internos.. Aprovacao: Enviar link ou PDF, marcar como enviada, aceita ou recusada, mudar preço (tabela) e mudar etapa. O resolverBase (criar ou mover a oportunidade para 'proposal') é ação do clique humano, fica fora do agente e é registrado como tal.
- **cobranca / Cobrança** (Sonnet 5.5 via AI_MODEL (o mesmo de hoje)): Sugere mensagens de retomada para conversas paradas e ações vencidas. Numa fase posterior, também cobra o retorno de propostas enviadas.. Gatilhos: Rotina diária às 11:00 UTC (/api/agentes/diario, que substitui o caminho do cron), botão 'Gerar agora' (origem 'equipe') e chamada interna.. Absorve: src/lib/followups/gerar.ts (gerarFollowups/preparar), candidatos.ts (regras puras, sem mudança) e prompt.ts (+ orientações opcionais).. Sozinho: Criar retomadas 'pendente' em ar1_followups (com agent_run_id e kind) e reativar retomadas adiadas vencidas (regra sem IA, já existe). A última rodada fica em agente.cobranca.ultima_rodada.. Aprovacao: Enviar, editar, adiar ou descartar a retomada. Incluir link de proposta.
- **analista / Analista** (Sonnet 5.5 via AI_MODEL (o mesmo de hoje). O plano prevê Opus 5.5; a troca fica para o dono decidir, com o custo simulado no painel e maxTokens a rever, porque o Opus sempre pensa antes de responder.): Escreve o resumo diário a partir dos números calculados pelo código. O texto passa por conferência; se for recusado, vai o texto de reserva. No painel, mostra sinais e recomendações só para leitura.. Gatilhos: Cron às 11:10 UTC e, em Ajustes, os botões 'Ver prévia' e 'Enviar agora' (origem 'equipe'; cada prévia gasta IA e aparece no registro).. Absorve: src/lib/resumo/* (numeros, texto, ajustes, rotina e executar). escreverComIA passa por executarIA e a conferência define o status 'ok' ou 'recusado_pelo_codigo'.. Sozinho: Enviar o resumo diário ao dono. É a única exceção aprovada, e só para telefones de resumo.destinatarios; a porta enviar passa a recusar qualquer outro. Liga e desliga em dois interruptores: 'Usar IA no texto' (agente.analista.ativo) e 'Enviar o resumo' (resumo.ativo, que já existe).. Aprovacao: Todo o resto: as recomendações apontam para os fluxos que já existem (Retomar, Aceitar do funil, mover para Ganho) e não gravam nada.
- **bibliotecario / Bibliotecário** (Sonnet 5.5 via AI_MODEL): Uma vez por semana, lê as conversas recentes e sugere perguntas frequentes com resposta, lacunas ('perguntam X e não há documento') e atualizações de documentos da base.. Gatilhos: Segunda-feira, disparado pela rotina diária (/api/agentes/diario → POST interno em /api/agentes/bibliotecario/gerar, com trava semanal). Botão 'Rodar agora' em /agentes/bibliotecario (admin).. Absorve: Novo: src/lib/agentes/bibliotecario/*. Reaproveita descreverMensagem, aplicarOrcamento, prepararDocumento, filtrarFontes, valorTemBase e validarNovoDocumento.. Sozinho: Gravar sugestões 'pendente' em ar1_kb_suggestions e a reserva da semana em ar1_settings.. Aprovacao: Qualquer escrita em ar1_context_docs. Aprovar cria o texto (ou o acrescenta ao documento 'Perguntas frequentes'); uma lacuna exige que a pessoa escreva a resposta.
- **transcricao / Transcrição (serviço)** (Gemini 3.5 Flash-Lite via AI_AUDIO_MODEL, sempre pela OpenRouter. O ajuste da tela só aceita modelos com entrada de áudio.): Transcreve os áudios do WhatsApp para a Recepção e os demais agentes lerem. É um serviço de dados: não fala com o cliente e as instruções não são editáveis, porque o código depende de SEM_FALA e da regra contra instruções gravadas no áudio.. Gatilhos: Webhook (áudio novo no bucket, antes da análise; origem 'webhook'), botão 'Transcrever' (origem 'equipe') e chamada interna.. Absorve: src/lib/transcricao.ts: transcreverMensagem passa por executarTranscricao; pedirTranscricao ganha o callback aoTelemetria sem mudar o retorno.. Sozinho: Gravar ar1_wa_messages.transcript. Desligada, o áudio entra como '[áudio sem transcrição]'.. Aprovacao: Não se aplica: não produz nada para o cliente. Refazer uma transcrição que já existe continua exigindo 'forcar'.

## Especificacao
# Bloco 9: camada de agentes de IA

Foco deste desenho: ver e controlar o que cada agente faz e quanto custa.

> Escrito em 30/09/2026 depois de ler `PLANO-EXECUCAO-OPUS.md` §5, `atendimento/LEIA-ME.md`, `ia.ts`, `env.ts`, `transcricao.ts`, `analise/*`, `followups/*`, `resumo/*`, as migrações e o mapa dos 9 leitores. Esta etapa foi só de leitura: nenhum arquivo foi alterado e nenhum comando git foi rodado.
>
> Arquivos do bloco 8 ainda em mudança: `ia.ts`, `env.ts`, `tipos.ts`, `Shell.tsx`, `Configuracoes.tsx`, `propostas/premium/*`, `precos/*`, `app/p/*` e `api/propostas/*`. O desenho abaixo só encosta neles **depois do commit do bloco 8**, e sempre acrescentando, nunca refatorando.

## 0. Decisões centrais

| # | Decisão | Motivo |
|---|---|---|
| D1 | **A função única tem duas entradas**, as duas em `src/lib/agentes/servidor.ts`: `executarIA` (saída estruturada) e `executarTranscricao` (áudio). Ambas usam o executor puro `executarAgente(portas, pedido)`. Só `agentes/servidor.ts` pode importar `gerarEstruturado` e `transcreverArquivo`, e um teste estático garante isso. | A promessa "todas as chamadas passam por uma função única" vira regra verificável. Isso inclui o áudio, que hoje tem `fetch` próprio. |
| D2 | **Uma linha por chamada, gravada em duas fases.** O INSERT com status `rodando` sai **em paralelo** com a chamada à IA: a promessa é criada e só é aguardada depois, então não soma latência. Ao terminar, um UPDATE fecha a linha. | Uma execução cortada pela Vercel em 60 s aparece como `interrompido` em vez de sumir. Redator e Bibliotecário ganham o estado "rodando" na tela. |
| D3 | **Tokens separados por tipo, dois custos.** Os tokens são guardados por tipo (texto, áudio, leitura de cache, escrita de cache, saída, raciocínio). O custo **estimado** pela tabela do código é sempre gravado. O custo **informado** pela OpenRouter (`usage.cost`) é gravado quando vier. Custo desconhecido é `null`, nunca 0. O uso também é gravado quando a resposta foi cobrada e mesmo assim falhou (cortada, esquema inválido, recusa). | O painel precisa acertar justamente nos casos ruins. |
| D4 | **Consumo diário agregado por gatilho** em `ar1_agent_usage_daily` (dia de Brasília × agente × tarefa × modelo), guardado sem prazo. `ar1_agent_runs` tem retenção de 90 dias e teto de 50 mil linhas. **O Realtime liga só o agregado**; os runs ficam fora. | Cabe no plano Free. O custo do mês não depende de somar mais de 1000 linhas no Node (teto do PostgREST) e sobrevive à limpeza e à exclusão de contatos. O painel não sofre avalanche de eventos quando a limpeza apaga em lote. |
| D5 | **A primeira entrega não muda comportamento.** O modelo padrão de cada tarefa continua o de hoje (variáveis da Vercel). Recepção e Qualificação continuam numa chamada só. Com as instruções padrão, os prompts ficam idênticos byte a byte, verificado por testes golden. | Segue o plano. Trocas como Analista em Opus viram decisões do dono, com o custo simulado pelo próprio painel. |
| D6 | **Instruções editáveis são aditivas.** O bloco "Orientações da equipe para este agente" entra logo depois das instruções gerais (`atendimento.instrucoes`), apenas quando tem conteúdo. As regras fixas ficam no código e aparecem na tela só para leitura. Padrão = vazio. "Restaurar padrão" apaga a chave. | Ninguém consegue apagar a REGRA DE SEGURANÇA, a REGRA DOS VALORES nem o formato que `conferirTextoDaIA` confere. |
| D7 | **Modelo escolhido de uma lista fechada de famílias**: `sonnet-5.5`, `opus-5.5`, `fable-5.1`, `gemini-3.5-flash-lite`. É validado no código e também no banco (CHECK em `ar1_settings`) e traduzido para o nome do provedor na hora da chamada. Precedência: ajuste da tela > variável da Vercel (`AI_MODEL`, `AI_MODEL_PROPOSTAS`, `AI_AUDIO_MODEL`) > padrão do código. | Um nome digitado à mão quebra quando `AI_PROVIDER` muda. Com essa precedência, trocar `AI_AUDIO_MODEL` na Vercel continua sendo o caminho de correção documentado. |
| D8 | **Liga/desliga, limites e alertas por agente.** Liga/desliga e limites (execuções por hora e US$ por dia) funcionam como disjuntor antes da chamada. Há também um alerta de gasto mensal e o saldo da OpenRouter no painel. | O dono controla o gasto sem abrir o painel da OpenRouter. |
| D9 | **Histórico de ajustes** (`ar1_agent_config_log`), gravado por gatilho em `ar1_settings`, mais um `instructions_hash` em cada execução. | Liga mudança de custo ou de comportamento a quem mudou o quê e quando. |

## 1. Pré-condições e convivência com o bloco 8

1. **Antes de tocar em arquivo compartilhado.** Conferir `git status` e só seguir se `ia.ts`, `env.ts`, `tipos.ts`, `Shell.tsx`, `Configuracoes.tsx`, `propostas/premium/*`, `precos/*` e `api/propostas/*` já estiverem commitados. Enquanto não estiverem, trabalhar só nos arquivos novos (`src/lib/agentes/*`, testes, migração, telas novas).
2. **Migração do bloco 8.** Rodar `SELECT to_regclass('public.ar1_price_items')` para saber se `20260930110000` já foi aplicada. A `20260930120000` **não depende** dela: só precisa de `ar1_proposals(id)`, que existe desde `20260930100000`.
3. **O que tolerar no bloco 8:**
   - `PedidoEstruturado` pode ganhar campos (`modelo` já entrou; talvez `effort` ou streaming). Se entrar streaming para o Opus, o uso passa a vir de `finalMessage().usage`, e a extração de telemetria deve estar no mesmo ponto.
   - `premium/servidor.ts` pode mudar timeouts, `maxTokens` e assinaturas. Só envolver a chamada à IA e mover o pós-processamento para `processar`.
   - As rotas `/propostas/*` ainda não existem. O `SeloAgente` do Redator aponta para `/funil/<oportunidade>` até existirem.
   - Não pôr tipos em `tipos.ts`: todos os tipos novos ficam em `src/lib/agentes/`.
4. **Arquivos em que nunca mexer:** as proteções do webhook contra aviso de conexão repetido, a ponte e a ordem transcrever → esperar → analisar (`pos-mensagem.ts`).

## 2. Agentes e tarefas

| Tarefa (`task` = `nomeEsquema`) | Agente dono | Agentes incluídos | Chamador | Modelo padrão (fonte) | maxTokens | Timeout |
|---|---|---|---|---|---|---|
| `analise_atendimento` | recepcao | {qualificacao} se ligada | `analise/executar.ts` | `env.aiModel` (rotina) | 4096 | 50 s (padrão de ia.ts) |
| `transcricao_audio` | transcricao | — | `transcricao.ts` | `env.aiAudioModel` (audio) | 8192 | 50 s |
| `pedido_da_conversa` | qualificacao | — | `premium/servidor.ts` | `env.aiModel` (rotina) | 3000 | 55 s |
| `proposta_premium` | redator | — | `premium/servidor.ts` | `env.aiModelPropostas` (propostas) | 12000 | 55 s |
| `rascunho_de_proposta` | redator | — | `propostas/servidor.ts` | `env.aiModel` (rotina) | 6000 | 50 s |
| `retomada_whatsapp` | cobranca | — | `followups/gerar.ts` | `env.aiModel` (rotina) | 1500 | 18 s |
| `resumo_diario` | analista | — | `resumo/executar.ts` | `env.aiModel` (rotina) | 1200 | 25 s |
| `base_semanal` | bibliotecario | — | `agentes/bibliotecario/gerar.ts` | `env.aiModel` (rotina) | 4000 | 45 s |

Regras de atribuição:

- A chamada combinada gera **uma** linha, com `agent_id='recepcao'` e `agents_included='{qualificacao}'`. O custo conta **uma vez**, na Recepção. O cartão da Qualificação mostra "roda junto com a Recepção: N análises hoje, custo contado lá", e soma à parte apenas `pedido_da_conversa`.
- Os timeouts continuam onde estão hoje: nas constantes `TIMEOUT_IA_MS` de cada módulo. O catálogo não os repete.

## 3. Módulos e assinaturas

### 3.1 `src/lib/agentes/catalogo.ts`

Módulo puro que o navegador também importa: não usa zod nem `server-only`.

```ts
import type { FamiliaModelo } from "./modelos";

export type IdAgente = "recepcao" | "qualificacao" | "redator" | "cobranca" | "analista" | "bibliotecario" | "transcricao";
export type IdTarefa =
  | "analise_atendimento" | "transcricao_audio" | "pedido_da_conversa" | "proposta_premium"
  | "rascunho_de_proposta" | "retomada_whatsapp" | "resumo_diario" | "base_semanal";
export type FonteDoModeloPadrao = "rotina" | "propostas" | "audio"; // env.aiModel | env.aiModelPropostas | env.aiAudioModel
export type Gatilho = "webhook" | "equipe" | "cron" | "interno" | "importador";

/** O que o agente pode gravar sem pessoa. Qualquer coisa fora desta lista é proibida (teste). */
export type Efeito =
  | "analise_conversa"      // ar1_atendimentos.ai_*
  | "sugestao_resposta"     // ar1_ai_suggestions 'pendente'
  | "notas_oportunidade"    // ar1_quote_requests.ai_notes (só texto)
  | "retomada_pendente"     // ar1_followups 'pendente' + reativação de adiadas
  | "proposta_gerada"       // ar1_proposals (valores recalculados pela tabela)
  | "transcricao"           // ar1_wa_messages.transcript
  | "sugestao_base"         // ar1_kb_suggestions 'pendente'
  | "resumo_para_dono";     // ar1_wa_outbox na conversa interna (exceção aprovada)

export const EFEITOS_PROIBIDOS = [
  "enviar_cliente", "mudar_etapa", "mudar_valor", "mudar_probabilidade", "mudar_proxima_acao", "criar_documento_base",
] as const;

export interface TarefaDoAgente { id: IdTarefa; nome: string; fonteModelo: FonteDoModeloPadrao }
export interface LimitesDoAgente { porHora: number; usdPorDia: number }

export interface Agente {
  id: IdAgente;
  tipo: "agente" | "servico";
  nome: string;
  iniciais: string;               // monograma do selo
  papel: string;                  // 1 frase, linguagem simples
  tarefas: TarefaDoAgente[];
  efeitos: Efeito[];
  pode: string[];                 // texto do cartão ("Só sugere")
  precisaAprovacao: string[];
  familiasPermitidas: FamiliaModelo[];
  instrucoesEditaveis: boolean;   // transcricao: false
  registrarQuandoDesligado: boolean; // true só para tarefas de cron (analista, cobranca, bibliotecario)
  limitesPadrao: LimitesDoAgente;
  combinadoCom?: IdAgente;        // qualificacao → "recepcao"
  gatilhos: string[];
}

export const AGENTES: readonly Agente[];
export function agentePorId(id: string): Agente | null;
export function tarefaPorId(id: string): { agente: Agente; tarefa: TarefaDoAgente } | null;
```

Limites padrão. São uma rede de segurança contra laço ou abuso e ficam bem acima do uso normal estimado (§5.4):

| Agente | Execuções por hora | US$ por dia |
|---|---|---|
| recepcao | 120 | 3,00 |
| qualificacao | 30 | 1,00 |
| redator | 20 | 3,00 |
| cobranca | 40 | 1,00 |
| analista | 10 | 0,50 |
| bibliotecario | 4 | 1,00 |
| transcricao | 120 | 1,00 |

### 3.2 `src/lib/agentes/modelos.ts`

Módulo puro.

```ts
import type { ProvedorIA } from "../env";   // só tipo: não arrasta nada para o navegador
import type { Agente, TarefaDoAgente } from "./catalogo";

export type FamiliaModelo = "sonnet-5.5" | "opus-5.5" | "fable-5.1" | "gemini-3.5-flash-lite";
export interface InfoModelo {
  familia: FamiliaModelo; nome: string;
  openrouter: string; anthropic: string | null;
  audio: boolean; aviso: string | null;
}
export const MODELOS: Record<FamiliaModelo, InfoModelo> = {
  "sonnet-5.5": { familia: "sonnet-5.5", nome: "Sonnet 5.5", openrouter: "anthropic/claude-sonnet-5.5", anthropic: "claude-sonnet-5-5", audio: false, aviso: null },
  "opus-5.5":   { familia: "opus-5.5", nome: "Opus 5.5", openrouter: "anthropic/claude-opus-5.5", anthropic: "claude-opus-5-5", audio: false,
                  aviso: "Pensa sempre antes de responder: mais lento, e o raciocínio é cobrado como saída." },
  "fable-5.1":  { familia: "fable-5.1", nome: "Fable 5.1", openrouter: "anthropic/claude-fable-5.1" /* CONFERIR slug */, anthropic: "claude-fable-5-1", audio: false,
                  aviso: "Custa 2,5× o Opus 5.5 por token. Só com pedido do dono." },
  "gemini-3.5-flash-lite": { familia: "gemini-3.5-flash-lite", nome: "Gemini 3.5 Flash-Lite", openrouter: "google/gemini-3.5-flash-lite", anthropic: null, audio: true, aviso: null },
};

/** "anthropic/claude-opus-5.5", "claude-opus-5-5", "claude-opus-5-5-2026…", "…:beta" → "opus-5.5"; desconhecido → null. */
export function familiaDoModelo(id: string | null | undefined): FamiliaModelo | null;
export function idNoProvedor(f: FamiliaModelo, provedor: ProvedorIA): string | null;

export interface ModelosDoAmbiente { rotina: string; propostas: string; audio: string }
export interface ModeloResolvido {
  id: string;                        // o que vai para a API
  familia: FamiliaModelo | null;     // null = fora da tabela de preços (custo null)
  origem: "ajuste" | "ambiente";
  avisoAjusteIgnorado?: string;      // ajuste inválido para o agente ou o provedor
}
/** Precedência: ajuste válido (na lista do agente e existente no provedor) > variável da Vercel. */
export function resolverModelo(e: {
  agente: Agente; tarefa: TarefaDoAgente; provedor: ProvedorIA;
  ajuste: FamiliaModelo | null; ambiente: ModelosDoAmbiente;
}): ModeloResolvido;
```

Notas:

- A transcrição sempre usa o nome da OpenRouter, qualquer que seja o `AI_PROVIDER`.
- Com `AI_PROVIDER=anthropic` e um ajuste `gemini` num agente de texto, o ajuste é ignorado e o aviso aparece no cartão.
- O plano diz que o "Fable custa 5× o Opus". Pelos preços dados (US$10/50 contra US$4/20), a diferença é **2,5×**. O aviso usa o número correto.

### 3.3 `src/lib/agentes/uso.ts` e `src/lib/agentes/custos.ts`

Os dois são módulos puros.

```ts
// uso.ts: formato comum de uso e telemetria, e leitura das respostas dos dois provedores
export type ModoChamada = "json_schema" | "tools" | "sdk" | "audio";
export interface UsoNormalizado {
  entradaTexto: number;      // entrada sem cache e sem áudio
  entradaAudio: number;
  cacheLeitura: number;
  cacheEscrita: number;
  saida: number;             // inclui o raciocínio
  raciocinio: number | null; // parte da saída, só para informação
  custoInformadoUSD: number | null; // usage.cost da OpenRouter
  estimado: boolean;         // true quando os tokens foram estimados (áudio pelos bytes)
}
export interface TelemetriaIA {
  provedor: "openrouter" | "anthropic";
  modeloPedido: string;
  modeloAtendeu: string | null;     // dados.model (OpenRouter) / resposta.model (Anthropic)
  modo: ModoChamada;
  tentativasHttp: number;           // 2 quando caiu no fallback 400 → tools
  motivoPrimeiro400?: string | null;// 200 caracteres
  fim?: string | null;              // finish_reason / stop_reason
  idGeracao?: string | null;        // gen-… / msg_…
  uso: UsoNormalizado | null;
  iteracoes?: { modelo: string | null; uso: UsoNormalizado }[]; // fallback de servidor da Anthropic
}
/** OpenRouter: prompt_tokens JÁ INCLUI cached/audio; separa em categorias disjuntas. */
export function usoDaRespostaOpenRouter(corpo: unknown): UsoNormalizado | null;
/** Anthropic: input_tokens NÃO inclui cache; lê iterations[] quando houver fallback. */
export function usoDaMensagemAnthropic(usage: unknown): Pick<TelemetriaIA, "uso" | "iteracoes">;
export function somarUso(a: UsoNormalizado | null, b: UsoNormalizado | null): UsoNormalizado | null;
export function estimarUsoDeAudio(bytes: number, formato: "mp3" | "ogg" | "wav" | "m4a"): UsoNormalizado;
```

Normalização:

- **OpenRouter.** Seja `P = usage.prompt_tokens`, `C = prompt_tokens_details.cached_tokens`, `W = prompt_tokens_details.cache_write_tokens` (CONFERIR o nome) e `A = prompt_tokens_details.audio_tokens`. Então `entradaTexto = max(P − C − W − A, 0)`, `saida = completion_tokens`, `raciocinio = completion_tokens_details.reasoning_tokens` e `custoInformadoUSD = usage.cost`.
- **Anthropic.** `entradaTexto = input_tokens`, `cacheEscrita = cache_creation_input_tokens`, `cacheLeitura = cache_read_input_tokens`, `saida = output_tokens`. Se houver `iterations[]` com modelo e uso por entrada (entradas `type:"fallback_message"`; formato a CONFERIR), cada iteração é cobrada pelo preço do modelo que a atendeu.

Estimativa de áudio quando a OpenRouter não informa o uso:

- Duração estimada pelos bytes: mp3 ≈ 6.000 B/s (MP3 da ponte, cerca de 48 kbps), ogg/opus ≈ 2.000 B/s, m4a ≈ 8.000 B/s, wav ≈ 32.000 B/s.
- Tokens de áudio ≈ 32 por segundo.
- O resultado sai com `estimado: true`.

```ts
// custos.ts
export const VERSAO_PRECOS = "2026-09-29";
export interface PrecoPorMilhao { entrada: number; saida: number; cacheLeitura: number | null; cacheEscrita: number | null; audio: number | null }
export const PRECOS: Record<FamiliaModelo, PrecoPorMilhao> = {
  "sonnet-5.5": { entrada: 2,    saida: 10,  cacheLeitura: 0.20, cacheEscrita: 2.50,  audio: null },
  "opus-5.5":   { entrada: 4,    saida: 20,  cacheLeitura: 0.20, cacheEscrita: 5.00,  audio: null },
  "fable-5.1":  { entrada: 10,   saida: 50,  cacheLeitura: 0.25, cacheEscrita: 12.50, audio: null },
  "gemini-3.5-flash-lite": { entrada: 0.30, saida: 2.50, cacheLeitura: null, cacheEscrita: null, audio: 0.30 },
};
export function calcularCustoUSD(uso: UsoNormalizado | null, familia: FamiliaModelo | null): number | null;
export function custoParaMostrar(r: { cost_usd: number | null; cost_reported_usd: number | null }): { valor: number | null; aproximado: boolean };
export function simularCustoUSD(media: Pick<UsoNormalizado, "entradaTexto" | "cacheLeitura" | "cacheEscrita" | "entradaAudio" | "saida">, familia: FamiliaModelo): number;
export function formatarUSD(v: number | null): string; // "US$ 0,0213" (< 1) · "US$ 12,40" · "—"
```

Sobre os preços:

- As entradas, as saídas, a leitura de cache (US$0,20 no Sonnet 5.5 e no Opus 5.5; US$0,25 no Fable 5.1) e o fato de o Opus 5.5 não aceitar `temperature` foram conferidos na referência da API da Anthropic (skill claude-api, preços de 25/09/2026).
- A escrita de cache é **1,25× a entrada** (TTL de 5 minutos).
- O Gemini não tem preço de cache. Tokens de cache nele são cobrados como entrada (limite superior) e a linha fica marcada como estimada.
- Se a OpenRouter cobrar diferente da Anthropic direta, o painel mostra o valor informado por ela e mantém a estimativa ao lado.

### 3.4 `src/lib/agentes/ajustes.ts`

Módulo puro.

```ts
export const LIMITE_INSTRUCOES = 4000;
export type CampoAjuste = "ativo" | "modelo" | "instrucoes" | "limites";
export function chaveAjuste(id: IdAgente, campo: CampoAjuste | "ultima_rodada" | "ultima_semana"): string; // "agente.recepcao.modelo"
export interface AjustesDoAgente {
  ativo: boolean;                         // ausente ou lixo → true
  modelo: FamiliaModelo | null;           // ausente ou fora da lista → null (usa ambiente)
  instrucoes: string;                     // ausente → "" (padrão); corta em 4000
  limites: LimitesDoAgente;               // ausente → limitesPadrao; porHora 1..500; usdPorDia 0,1..100
  personalizadoEm: string | null; personalizadoPor: string | null; // updated_at/updated_by da chave instrucoes
}
export function lerAjustesDoAgente(agente: Agente, linhas: { key: string; value: unknown; updated_at?: string; updated_by?: string | null }[]): AjustesDoAgente;
/** FNV-1a 64 bits (BigInt), 16 hex; "" → null. */
export function hashInstrucoes(texto: string): string | null;
export function decidirLimite(consumo: { ultimaHora: number; custoHojeUSD: number } | null, limites: LimitesDoAgente): string | null; // mensagem ou null
```

### 3.5 `src/lib/agentes/erros.ts`

Módulo puro.

```ts
export type CodigoErro =
  | "tempo_esgotado" | "conexao" | "chave" | "sem_credito" | "limite_provedor" | "pedido_recusado"
  | "provedor" | "cortada" | "filtro" | "recusa_seguranca" | "formato" | "sem_resposta"
  | "arquivo_grande" | "formato_audio" | "gravacao" | "desligado" | "limite_agente" | "desconhecido";
export class ErroAgente extends Error {
  constructor(message: string, public readonly status: 409 | 429, public readonly codigo: "desligado" | "limite") { super(message); this.name = "ErroAgente"; }
}
/** Usa e.codigo (ErroIA novo) quando existe; senão nome (TimeoutError/AbortError), status (ErroTranscricao) e, por último, o texto. */
export function classificarErro(e: unknown, fase: "ia" | "processar"): { codigo: CodigoErro; status: "erro" | "tempo_esgotado"; mensagem: string };
```

O classificador também pega o `DOMException TimeoutError` que pode escapar de `resposta.text()` em ia.ts (linha 134, fora do try). Esse defeito fica só registrado aqui: corrigi-lo muda a mensagem mostrada, então é uma correção à parte.

### 3.6 `src/lib/agentes/executar.ts`

Executor puro com portas, testável sem banco.

```ts
export interface RefsDoRun { contatoId?: string | null; atendimentoId?: string | null; oportunidadeId?: string | null; propostaId?: string | null; mensagemId?: string | null }
export interface ContextoDoRun { gatilho: Gatilho; usuarioId?: string | null; refs?: RefsDoRun }

export interface ConfigDaChamada { modelo: string; familia: FamiliaModelo | null; orientacoes: string }
export interface ChamadaIA<D, P> { dados: D; modelo: string; telemetria?: TelemetriaIA; prompt: P; promptChars?: number }
export interface InfoDaExecucao<P> { runId: number | null; modelo: string; prompt: P }
export interface Processado<R> {
  resultado: R;
  saidaResumo: string;                 // ≤ 1000, SEM texto de cliente
  status?: "ok" | "recusado_pelo_codigo";
  outputRef?: string | null;           // "ar1_ai_suggestions:<uuid>"
  refs?: RefsDoRun;                    // ex.: propostaId que só nasce aqui
  meta?: Record<string, unknown>;
}
export interface PedidoAgente<D, R, P> {
  agente: IdAgente; tarefa: IdTarefa; contexto: ContextoDoRun;
  agentesIncluidos?: IdAgente[];
  entradaResumo: string;               // ≤ 500, só metadados
  chamar: (c: ConfigDaChamada) => Promise<ChamadaIA<D, P>>;
  processar: (dados: D, info: InfoDaExecucao<P>) => Promise<Processado<R>> | Processado<R>;
}
export interface ResultadoAgente<R> { resultado: R; runId: number | null; modelo: string; custoUSD: number | null }

export interface LinhaDoRun { /* espelho das colunas de ar1_agent_runs em camelCase */ }
export interface PortasAgente {
  agora(): number;                                     // monotônico (performance.now)
  agoraIso(): string;
  provedor(): ProvedorIA;
  ambiente(): ModelosDoAmbiente;
  lerAjustes(agente: Agente): Promise<AjustesDoAgente>;          // falha → padrão (ligado)
  lerConsumo(agente: IdAgente): Promise<{ ultimaHora: number; custoHojeUSD: number } | null>;
  iniciarRun(linha: LinhaDoRun): Promise<number | null>;        // INSERT 'rodando'
  concluirRun(id: number, fim: Partial<LinhaDoRun>): Promise<void>; // UPDATE … WHERE id AND status='rodando'
  inserirFinal(linha: LinhaDoRun): Promise<void>;               // bloqueado/desligado, ou se o início falhou
}

export async function executarAgente<D, R, P>(portas: PortasAgente, pedido: PedidoAgente<D, R, P>): Promise<ResultadoAgente<R>>;
/** Monta a linha final (pura): status, erro, telemetria vinda da chamada OU de (erro as {telemetria}).telemetria, custo, durações. */
export function montarFimDoRun(e: {…}): Partial<LinhaDoRun>;
```

Fluxo interno. Toda falha de porta é engolida e vai para o log com `console.error('[agentes] …')`; nunca muda o retorno nem o erro.

1. `ajustes = lerAjustes(agente)`, com cache de 30 s por instância. Se falhar, vale o padrão (ligado, sem ajuste).
2. `modelo = resolverModelo(...)`.
3. Se o agente estiver desligado: grava uma linha `desligado` apenas quando `registrarQuandoDesligado` é verdadeiro, e depois `throw new ErroAgente("<Nome> está desligado em Agentes.", 409, "desligado")`.
4. `consumo = lerConsumo(agente)`, com cache de 15 s. Se `decidirLimite` bloquear: `inserirFinal({status:'bloqueado_limite', error_code:'limite_agente'})` e depois `throw new ErroAgente(msg, 429, "limite")`.
5. `const pInicio = seguro(() => portas.iniciarRun(base))`. **Sem `await`**: o INSERT roda em paralelo com a IA.
6. `chamada = await pedido.chamar({ modelo: modelo.id, familia, orientacoes: ajustes.instrucoes })`, medindo `ai_duration_ms`.
7. `runId = await pInicio`, e em seguida `processado = await pedido.processar(chamada.dados, { runId, modelo, prompt })`.
8. `finally`:
   - se houver `runId`, chama `concluirRun(runId, montarFimDoRun(...))`;
   - senão, chama `inserirFinal(...)`. Se a tabela não existir (42P01/PGRST205), a porta desliga a gravação por 5 minutos e avisa no log uma única vez;
   - se houve erro, **relança a mesma instância**.
9. A falha em `processar` (gravação do negócio) vira `status='erro'` e `error_code='gravacao'`, com o uso da IA preservado, e o erro original é relançado.

### 3.7 `src/lib/agentes/servidor.ts`

Módulo com `import "server-only"`. É o único que importa `gerarEstruturado` e `transcreverArquivo`.

```ts
export interface PedidoIA<T extends z.ZodType, R, P extends { system: string; user: string }> {
  agente: IdAgente; tarefa: IdTarefa; contexto: ContextoDoRun; agentesIncluidos?: IdAgente[];
  montarPrompt: (orientacoes: string) => P;      // o builder puro recebe as orientações
  esquema: T; nomeEsquema: string; maxTokens: number; timeoutMs?: number;
  entradaResumo: string;
  processar: (dados: z.infer<T>, info: InfoDaExecucao<P>) => Promise<Processado<R>> | Processado<R>;
}
export function executarIA<T extends z.ZodType, R, P extends { system: string; user: string }>(p: PedidoIA<T, R, P>): Promise<ResultadoAgente<R>>;

export function executarTranscricao(p: {
  contexto: ContextoDoRun;
  arquivo: { caminho: string; mime: string | null };
  timeoutMs?: number;
}): Promise<ResultadoAgente<ResultadoTranscricao>>;

export function agenteLigado(id: IdAgente): Promise<boolean>;            // para rotinas de cron checarem antes de ler dados
export function lerAjustesParaTela(): Promise<Record<IdAgente, AjustesDoAgente>>;
export function manutencaoDiaria(): Promise<Record<string, unknown> | null>; // rpc('ar1_agentes_manutencao'), 5 s, falha → null
export function lerSaldoOpenRouter(): Promise<{ saldoUSD: number | null; usadoUSD: number | null; limiteUSD: number | null; lidoEm: string } | null>;
export const PORTAS_REAIS: PortasAgente;
```

As portas reais usam `supabaseServico()`:

- **`iniciarRun`**: `.insert(cols).select('id').abortSignal(AbortSignal.timeout(2000)).single()`.
- **`concluirRun`**: `.update(cols).eq('id', id).eq('status','rodando').abortSignal(AbortSignal.timeout(3000))`. O filtro `status='rodando'` impede sobrescrever uma linha que a manutenção já marcou como `interrompido`.
- **`lerConsumo`**:
  - execuções da última hora: `select('id',{count:'exact',head:true}).eq('agent_id',id).gte('created_at',haUmaHora).not('status','in','(bloqueado_limite,desligado)')`;
  - custo do dia: `ar1_agent_usage_daily.select('cost_usd').eq('day',hojeBRT).eq('agent_id',id)`.
- **`lerAjustes`**: `ar1_settings.select('key,value,updated_at,updated_by').like('key','agente.<id>.%')`.

**Chave geral:** com `AGENTES_REGISTRO=desligado` (getter novo em env.ts, depois do bloco 8), as portas não leem nem gravam nada e os ajustes voltam ao padrão. É exatamente o comportamento de hoje.

### 3.8 Mudanças em `src/lib/ia.ts`

Só acréscimos, e só depois do commit do bloco 8.

```ts
import { usoDaMensagemAnthropic, usoDaRespostaOpenRouter, type TelemetriaIA } from "./agentes/uso";

export type CodigoErroIA = "tempo_esgotado" | "conexao" | "chave" | "sem_credito" | "limite_provedor"
  | "pedido_recusado" | "provedor" | "cortada" | "filtro" | "recusa_seguranca" | "formato" | "sem_resposta";

export class ErroIA extends Error {
  /** Uso já cobrado, quando o erro veio depois de uma resposta (opcional). */
  telemetria?: TelemetriaIA;
  codigo?: CodigoErroIA;
  constructor(message: string, public readonly status = 502) { super(message); this.name = "ErroIA"; } // igual
}
function erroIA(msg: string, status: number, codigo: CodigoErroIA, t?: TelemetriaIA): ErroIA; // mesma mensagem e status de hoje

interface RespostaChat { id?: string; model?: string; usage?: unknown; choices?: …; error?: … }  // + 3 campos
export interface RespostaEstruturada<T> { dados: T; modelo: string; provedor: "openrouter" | "anthropic"; telemetria?: TelemetriaIA } // + 1 campo
```

**Em `viaOpenRouter`:**

- Contar `tentativas` e `modo`. Quando o `catch` do 400 dispara o fallback, fica `tentativas = 2`, `modo = "tools"` e `motivoPrimeiro400 = e.message.slice(0, 200)`.
- Logo depois do `chamarOpenRouter` que deu certo, montar `telemetria` com `dados.model`, `dados.id`, `finish_reason` e `usoDaRespostaOpenRouter(dados)`.
- Nos `throw` de `length`, `content_filter` e "sem resposta", usar `erroIA(<mesma mensagem>, 502, codigo, telemetria)`.
- Envolver `extrairJson` e `validar` num `try/catch` que preenche `e.telemetria ??= telemetria` e `e.codigo ??= "formato"`, e relança o erro.
- O retorno `modelo` **continua sendo o modelo pedido**. É ele que vai para `ar1_ai_suggestions.model` e similares. O modelo que atendeu vai só na telemetria.
- Nos `throw` de `chamarOpenRouter` (timeout, conexão, 401/403, 402, 429, 400, 5xx), acrescentar apenas o `codigo`.
- Pedir `usage: { include: true }` no corpo **só se** a Fase 0 mostrar que `usage.cost` não vem sem esse parâmetro (CONFERIR).

**Em `viaAnthropic`:** depois do `parse`, montar a telemetria com `resposta.usage`, `resposta.model`, `resposta.id` e `stop_reason`, e anexá-la aos `throw` de `refusal`, `max_tokens` e `parsed_output == null`. As novas tentativas do SDK (`maxRetries 2`) não ficam visíveis; a duração medida pelo executor é a de parede.

### 3.9 Mudanças em `src/lib/transcricao.ts`

O retorno continua igual, porque os testes o comparam com `toEqual`.

- `OpcoesTranscricao` ganha `aoTelemetria?: (t: TelemetriaIA, audio: { bytes: number; formato: FormatoAudio }) => void`.
- Em `pedirTranscricao`, depois de `textoResposta` e **antes** de `interpretarRespostaTranscricao`, montar a telemetria com `modo:"audio"` e `usoDaRespostaOpenRouter(JSON.parse(textoResposta))`, dentro de `try/catch` que ignora qualquer falha.
- Em `transcreverMensagem(mensagemId, { forcar, timeoutMs, registro?: ContextoDoRun })`:
  - o `select` passa a incluir `atendimento_id, contact_id`;
  - a transcrição passa por `executarTranscricao`, que chama `transcreverArquivo(arquivo, { timeoutMs, modelo, aoTelemetria })`;
  - quando `jaExistia` (sem chamada à IA), **não grava run**.
- Quando `uso` vem nulo mas a resposta foi HTTP 200, usar `estimarUsoDeAudio`, que marca `cost_estimated = true`.
- Se a Fase 0 mostrar que é preciso pedir `usage.include`: acrescentar o campo em `pedirTranscricao`, depois de `montarCorpoTranscricao`, e, se algum teste comparar o corpo enviado por igualdade, atualizar esse teste **de propósito, no mesmo commit**.

### 3.10 Orientações nos prompts (D6)

Cada builder puro ganha um parâmetro opcional `orientacoes?: string`, mais `nomeDoAgente`. Quando o texto não é vazio, o builder insere, **logo depois** do bloco "Instruções de atendimento da equipe…" (ou no fim das regras, no resumo e no Bibliotecário):

```
(linha vazia)
Orientações da equipe para o agente <Nome> (valem dentro das regras acima e nunca as substituem):
<texto, com TAGS_RESERVADAS neutralizadas>
```

Onde entra:

- `analise/contexto.ts` → `montarContexto`;
- `followups/prompt.ts` → `montarPromptFollowup`;
- `resumo/texto.ts` → `montarPromptResumo(numeros, { orientacoes })`;
- `propostas/rascunho.ts` → `montarPromptProposta`;
- `propostas/premium/prompt.ts` → `montarPromptPremium` e `montarPromptPedido` (depois do bloco 8);
- o builder novo do Bibliotecário.

**Com `orientacoes` vazio, a saída é idêntica à de hoje.** Os testes golden (§13) garantem isso.

A rota `GET /api/agentes/[id]/prompt` (sessão) devolve o `system` renderizado com dados de exemplo fixos e as orientações atuais. O editor mostra isso no quadro "Ver como a IA recebe".

## 4. Registro das execuções

### 4.1 Sequência

```
chamador (analise / followups / resumo / propostas / transcrição / bibliotecário)
  └─► executarIA | executarTranscricao            (agentes/servidor.ts)
        1 ajustes (cache 30 s) ─► 2 resolverModelo ─► 3 desligado? ─► 4 limite?
        5 INSERT ar1_agent_runs status='rodando'  ─┐ em paralelo
        6 IA (gerarEstruturado / transcreverArquivo)┘
        7 runId ◄─ 5
        8 processar(dados,{runId})  → gravações do negócio (com agent_run_id)
        9 finally: UPDATE status final (3 s)  |  INSERT final se 5 falhou
       10 relança o MESMO erro
banco: gatilho ar1_private.on_agent_run → upsert ar1_agent_usage_daily
       → Realtime (só essa tabela) → /agentes recarrega cartões e a 1ª página da linha do tempo
```

### 4.2 Situações de um run

| status | Quando | Conta no agregado como |
|---|---|---|
| `rodando` | INSERT inicial | só atualiza `last_started_at`, que funciona como "campainha" |
| `ok` | IA respondeu e `processar` gravou | ok |
| `recusado_pelo_codigo` | Resposta válida descartada pelo código: resumo reprovado na conferência, retomada vazia, pendente duplicada (23505), que hoje some em silêncio | rejected |
| `erro` | Falha da IA ou da gravação | errors |
| `tempo_esgotado` | Timeout (TimeoutError/AbortError ou "demorou demais") | timeouts |
| `interrompido` | A manutenção marca como interrompido o run que está `rodando` há mais de 10 min (Vercel cortou a função). Na tela, mais de 3 min já aparece como "provavelmente interrompido" | errors |
| `bloqueado_limite` / `desligado` | Não houve chamada à IA | blocked (sem latência nem custo) |

### 4.3 O que vai em cada linha (sem texto de cliente)

- **`input_summary`** (até 500 caracteres), por tarefa:
  - Recepção: `"40 msgs (3 áudios) · base 4 docs/9 mil car. · cliente 1 doc · oportunidade: proposal · instrução da equipe: sim"`
  - Cobrança: `"sem_retorno · 30 msgs · base 4 docs"`
  - Analista: `"números de 29/09 · 12 conversas · funil R$ 80.000 · modo prévia"`
  - Redator: `"premium · 3 itens pedidos · 60 msgs · galeria 12"`
  - Transcrição: `"mp3 · 312 KB · ~52 s"`
  - Bibliotecário: `"38 conversas · base 5 docs"`
- **`output_summary`** (até 1000 caracteres), por exemplo:
  - `"lead · Filme de marca · urgência média · resposta sugerida (312 car.) · leitura comercial: proposal, R$ 16.000, 60%"`
  - `"texto recusado: sem linha 'Comece por'"`
  - `"PRO-2026-014 · total R$ 18.000 · 1 item sob consulta · valores não confirmados"`
  - `"1.240 caracteres"`
  - `"6 sugestões (4 FAQ, 2 lacunas)"`
- **`meta`** (até 4 KB): `{ modo, tentativas, motivo_400, fim, id_geracao, iteracoes, fallback, modo_resumo:'previa', duplicada:true, qualificacao_ligada, ... }`.
- **Referências**: `contact_id`, `atendimento_id`, `quote_request_id`, `proposal_id` e `message_id`. `output_ref` vale, por exemplo, `ar1_ai_suggestions:<uuid>`, `ar1_followups:<uuid>`, `ar1_proposals:<uuid>` ou `ar1_wa_messages:<uuid>`.
- **Ligação inversa**: `agent_run_id` é gravado em `ar1_ai_suggestions`, `ar1_followups` e `ar1_proposals`, **só quando `runId != null`**. A migração que cria `ar1_agent_runs` também cria essas colunas, então um `runId` existente garante que a coluna existe. Com a migração ausente, nada muda.

### 4.4 Volume e tempo

- **Volume:** cerca de 100 a 400 chamadas por dia, com 2 escritas cada, mais 2 upserts no agregado, contra os 27 inserts por segundo do incidente.
- **Duração:** o INSERT inicial não soma tempo. O UPDATE final soma no máximo 3 s. A leitura de ajustes e de consumo usa cache, então é uma leitura curta a cada 15–30 s por instância.
- **Caminho quente do webhook:** a transcrição ganha um INSERT e um UPDATE dentro dos 40 s de espera. **Aviso de conexão não gera nada**, porque só há run quando há chamada à IA.
- **Redator premium** (55 s de IA dentro de 60 s): o UPDATE final pode ser cortado. Nesse caso a manutenção marca o run como `interrompido`. O risco já existe hoje e o painel passa a mostrá-lo.

## 5. Cálculo de custo

### 5.1 Fórmula

```
custo = ( entradaTexto × p.entrada + entradaAudio × p.audio(ou entrada) + cacheLeitura × p.cacheLeitura(ou entrada)
        + cacheEscrita × p.cacheEscrita(ou 1,25 × entrada) + saida × p.saida ) / 1.000.000
```

Regras:

- O valor é arredondado em 6 casas.
- Família desconhecida ou uso ausente dá `null`.
- Com `iteracoes` (fallback da Anthropic), soma-se o custo de cada iteração pelo preço do modelo dela.
- Para exibir, vale o custo informado pela OpenRouter quando existir. Senão vale o estimado, mostrado com "≈".
- O agregado soma `COALESCE(cost_reported_usd, cost_usd)` e conta à parte as execuções sem custo.

### 5.2 Exemplos (casos de teste)

| Caso | Tokens | Custo (US$) |
|---|---|---|
| Sonnet 5.5 | entrada 10.000, saída 1.000 | 0,020 + 0,010 = **0,030000** |
| Opus 5.5 com cache | entrada 2.000, leitura de cache 8.000, escrita 1.000, saída 3.000 | 0,008 + 0,0016 + 0,005 + 0,060 = **0,074600** |
| Gemini, áudio | texto 300, áudio 1.920, saída 250 | 0,00009 + 0,000576 + 0,000625 = **0,001291** |
| Fable 5.1 | entrada 1.000, saída 1.000 | 0,010 + 0,050 = **0,060000** |

Leitura de uma resposta da OpenRouter: com `prompt_tokens=12.000`, `cached_tokens=8.000`, `completion_tokens=900`, `reasoning_tokens=300` e `cost=0,0266`, o resultado é `entradaTexto` 4.000, `cacheLeitura` 8.000, `saida` 900, `raciocinio` 300 e custo informado 0,0266.

### 5.3 Simulação de troca de modelo

A tela do agente calcula a média de tokens por execução dos últimos 30 dias a partir do agregado (`input_tokens/runs`, etc.) e aplica `simularCustoUSD` a cada família permitida. Exemplo: "Trocar para Opus 5.5: ≈ US$ 0,040 por análise (hoje ≈ US$ 0,020); no ritmo atual, +US$ 18/mês". Quando a execução tem pensamento (Opus), a tela avisa que a saída real pode ser maior.

### 5.4 Ordem de grandeza

Estimativa a confirmar pelo painel. A base atual tem cerca de 9 mil caracteres (≈ 2,5 mil tokens).

| Tarefa | Tokens por execução (entrada / saída) | US$ por execução | Cenário | US$ por mês |
|---|---|---|---|---|
| Recepção (Sonnet) | ~6.000 / ~800 | ~0,020 | 40 análises/dia | ~24 |
| Cobrança (Sonnet) | ~5.000 / ~250 | ~0,0125 | 10/dia | ~3,75 |
| Redator premium (Opus) | ~12.000 / ~6.000 | ~0,17 | 20/mês | ~3,4 |
| Puxar da conversa (Sonnet) | ~6.000 / ~600 | ~0,018 | 20/mês | ~0,4 |
| Transcrição (Gemini) | 1 min de áudio | ~0,001 | 20/dia | ~0,6 |
| Analista (Sonnet) | ~2.500 / ~400 | ~0,009 | 1/dia | ~0,3 (Opus: ~0,6 a 1) |
| Bibliotecário (Sonnet) | ~15.000 / ~3.000 | ~0,06 | 1/semana | ~0,25 |

**Total: cerca de US$ 30 por mês, cerca de 75% na Recepção.** A maior alavanca de economia é a Recepção: análises repetidas do mesmo atendimento e cache de prompt. O painel vai mostrar isso com números reais. Se o Sonnet 5.5 estiver pensando por padrão na OpenRouter, a coluna `reasoning_tokens` revela, e o custo sobe.

## 6. Configuração em `ar1_settings`

| Chave | Valor | Padrão (chave ausente) | Quem grava |
|---|---|---|---|
| `agente.<id>.ativo` | boolean | `true` | admin (tela) |
| `agente.<id>.modelo` | `"sonnet-5.5" \| "opus-5.5" \| "fable-5.1" \| "gemini-3.5-flash-lite"` | variável da Vercel da tarefa | admin |
| `agente.<id>.instrucoes` | string com até 4000 caracteres | `""` (sem bloco extra) | admin; "Restaurar padrão" = DELETE |
| `agente.<id>.limites` | `{ "por_hora": int, "usd_por_dia": number }` | `limitesPadrao` do catálogo | admin |
| `agente.cobranca.ultima_rodada` | `{ em, gatilho, candidatos, criados, para_depois, falhas, reativados, duracao_ms }` | — | servidor |
| `agente.bibliotecario.ultima_semana` | `{ semana: "2026-W40", em, run_id }` (trava semanal) | — | servidor |
| `agente.bibliotecario.ultima_rodada` | `{ em, sugestoes, descartes }` | — | servidor |
| `agentes.alerta_usd_mes` | number | 30 | admin |
| `agentes.retencao_dias` | number (30–365) | 90 | admin |
| `agentes.saldo_openrouter` | `{ saldo_usd, usado_usd, limite_usd, lido_em }` (cache de 10 min) | — | servidor |
| `agentes.manutencao` | `{ em, interrompidos, apagados, excedentes }` | — | servidor |
| `resumo.ativo` (já existe) | boolean | true | admin; continua controlando o **envio** do resumo |

Regras gerais:

- **Proteção no banco:** CHECK em `ar1_settings` para as chaves `agente.*` (tipo, lista fechada de modelos, tamanho das instruções).
- **Autoria automática:** gatilho `BEFORE` preenche `updated_at` e `updated_by = auth.uid()`, o que permite mostrar "Personalizado em dd/mm por Fulano".
- **Histórico:** gatilho `AFTER` grava em `ar1_agent_config_log` as chaves `agente.*.(ativo|modelo|instrucoes|limites)`, `agentes.(alerta_usd_mes|retencao_dias)`, `atendimento.instrucoes` e `resumo.ativo`.
- **Hash das instruções:** `instructions_hash` em cada run é o hash das orientações do agente. A mudança de `atendimento.instrucoes` aparece pelo histórico.

## 7. Integração por chamador

Cada item é um commit à parte, com os testes golden e sem mudar o retorno.

1. **Resumo** (`resumo/executar.ts`, `resumo/rotina.ts`)
   - `Portas.escreverComIA(numeros, ctx?: { origem, modo, usuarioId })`: o segundo parâmetro é opcional e o `mundo()` dos testes continua valendo.
   - `rodarResumo` repassa `pedido.origem`, `pedido.modo` e `pedido.usuarioId`.
   - `escreverComIA` chama `executarIA({ agente:'analista', tarefa:'resumo_diario', montarPrompt:o=>montarPromptResumo(numeros,{orientacoes:o}), … processar:(d)=>{ const c=conferirTextoDaIA(d.texto,numeros); return { resultado:d.texto, status:c.ok?'ok':'recusado_pelo_codigo', saidaResumo: c.ok?`texto aceito (${c.texto.length} car.)`:`recusado: ${c.motivo}` } } })`.
   - A conferência continua em `montarTexto` (é pura, então repetir custa quase nada).
   - Analista desligado lança `ErroAgente`; o `catch` de `montarTexto` usa a reserva, e o aviso diz "Analista desligado em Agentes".
   - Endurecimento: `enviar` recusa telefone fora de `lerDestinatarios`.
2. **Cobrança** (`followups/gerar.ts`)
   - Assinatura: `gerarFollowups({ agora?, gatilho?, usuarioId? })`.
   - No início: `if (!(await agenteLigado('cobranca')))` → reativa as adiadas (regra que já existe) e devolve `{ desligado: true }`.
   - `preparar()` passa a usar `executarIA`, e `processar` faz o INSERT em `ar1_followups` com `.select('id').single()`, `agent_run_id` e `kind`.
   - A duplicata 23505 vira `recusado_pelo_codigo` com `meta.duplicada = true`: o custo, antes invisível, aparece.
   - No fim, grava `agente.cobranca.ultima_rodada`.
3. **Análise** (`analise/executar.ts`, `api/ia/analisar/route.ts`, webhook)
   - Assinatura: `analisarAtendimento(id, instrucaoExtra?, registro?: { gatilho, usuarioId })`.
   - O pós-processamento atual inteiro vai para `processar`, com a sugestão gravada com `agent_run_id`.
   - Qualificação desligada: `oportunidade = null`, sem `ai_notes`, `agentesIncluidos = []`.
   - No `catch`:
     - `ErroAnalise` é relançado como hoje;
     - `ErroAgente` com código `desligado` faz `update({ ai_analysis_due_at: null })` e lança `ErroAnalise(msg, 409)`;
     - os demais seguem como hoje: gravam `ai_error` e lançam `ErroAnalise(msg, status)`.
   - Rota: com o segredo interno, `origem ∈ {webhook, importador}` vem do corpo (padrão `interno`); com sessão, `equipe` e `sessao.user.id`. Com a Recepção desligada, a rota responde 200 `{ ok:false, desligado:true }` para chamada interna e 409 para a equipe.
   - Webhook: `agendarAnalise` acrescenta `origem: "webhook"` ao corpo do fetch, e `transcrever` passa `registro: { gatilho: "webhook" }`. Nada mais muda no webhook.
4. **Transcrição** (`api/transcrever/route.ts`): passa `registro: { gatilho: interno ? 'interno' : 'equipe', usuarioId }`. Desligada, devolve 409.
5. **Rascunho em PDF antigo** (`propostas/servidor.ts`): usa `executarIA` na tarefa `rascunho_de_proposta`.
6. **Propostas premium e Puxar da conversa**, depois do bloco 8: `criarPropostaPremium` usa `executarIA` na tarefa `proposta_premium`, e `processar` faz `aplicarRespostaPremium`, o INSERT com `agent_run_id` e devolve `refs.propostaId` e `outputRef`. `puxarPedidoDaConversa` roda com `agente: 'qualificacao'`. O `resolverBase` fica **fora** do agente: é o clique da pessoa, registrado com `meta.efeitos_humanos = ['oportunidade_criada' | 'oportunidade_movida_para_proposal']` e `triggered_by`. Redator desligado devolve 409 "use Criar em branco (sem IA)".
7. **Rotina diária** (`api/agentes/diario/route.ts`, que substitui o caminho do cron das 11:00 em `vercel.json`, ainda com 2 crons)
   - Autoriza com `origemAutorizada` e roda `gerarFollowups({ gatilho })`.
   - Chama `manutencaoDiaria()`.
   - Às segundas (Brasília), dispara no início, sem aguardar, `POST /api/agentes/bibliotecario/gerar` com `x-internal-secret`, e aguarda só até o tempo que sobrar. A função chamada continua sozinha; o webhook → `/api/ia/analisar` já depende disso (CONFERIR na Vercel).
   - `/api/followups/gerar` continua para o botão e para chamadas internas.

## 8. Liga/desliga e limites, por agente

| Agente | Desligado | Limite atingido |
|---|---|---|
| Recepção | Webhook: não chama a IA, zera `ai_analysis_due_at` e não grava `ai_error`. Botão: 409 "A Recepção está desligada. Ligue em Agentes." O painel troca "Análise agendada" por "Recepção desligada". | `ai_error` com a mensagem do limite (aparece na Conversa). Run `bloqueado_limite`. |
| Qualificação | A análise segue; o código descarta a leitura comercial e não grava `ai_notes`. "Puxar da conversa": 409. | 429 no puxar. |
| Redator | 409 com "use Criar em branco (sem IA)". | 429. |
| Cobrança | Cron: 200 `{ desligado: true }`, com a reativação das adiadas mantida. Botão: 409. Tela Retomar: "Cobrança desligada". | Os candidatos que sobrarem vão para `para_depois`. |
| Analista | Texto de reserva (sem IA). `resumo.ativo` continua mandando no envio. Os dois aparecem no cartão. | Reserva. |
| Bibliotecário | Não roda às segundas. Botão: 409. | 429. |
| Transcrição | Áudio fica "[áudio sem transcrição]". Botão: 409. | Mesmo comportamento. |

Os limites são aproximados (cache de 15 s por instância): podem passar um pouco, nunca muito. Para ter observabilidade sem avalanche, `bloqueado_limite` grava uma linha por tentativa, e o volume já fica limitado pelo intervalo de 40 s por atendimento.

## 9. Bibliotecário

**Arquivos:**

- `agentes/bibliotecario/conversas.ts` (puro):
  - `selecionarConversas(atendimentos, contatos, destinatariosDoResumo)` exclui a conversa interna (`ehConversaInterna`), os telefones do dono, os contatos bloqueados e `ai_kind` spam/pessoal/fornecedor;
  - `montarBlocoDeConversas(porConversa, { porConversa: 3000, total: 50000 })` junta as perguntas do contato e as respostas da AR1 no formato `[dd/mm hh:mm] CONTATO|AR1: …`, usando `descreverMensagem` e `rotuloDeQuem`, com índice numérico por conversa.
- `agentes/bibliotecario/prompt.ts` (puro):
  - `MARCA_PROMPT_BIBLIOTECARIO = "BIBLIOTECÁRIO DA AR1"` (o simulador reconhece o pedido por ela);
  - `montarPromptBibliotecario({ conversas, base, pendentes, descartadas, orientacoes, agora })`;
  - REGRA DE SEGURANÇA sobre `<conversas_da_semana>`, `<base_de_conhecimento>` e `<sugestoes_existentes>`, com essas tags acrescentadas a `TAGS_RESERVADAS`. Nas mensagens, trocar `<` por `‹`.
- `agentes/bibliotecario/esquema.ts` (zod estrito, sem mín./máx.): `{ sugestoes: [{ tipo:'faq'|'lacuna'|'atualizacao', titulo, pergunta, resposta: string|null, documento_relacionado: string|null, conversas: number[], frequencia: number }] }`.
- `agentes/bibliotecario/regras.ts` (puro): `aplicarRegrasBibliotecario(bruto, ctx) → { sugestoes, descartes }`, com estas regras:
  - no máximo 8 sugestões;
  - só valem as `conversas` realmente enviadas;
  - `documento_relacionado` passa por `filtrarFontes`;
  - todo valor ou número de dinheiro na resposta precisa aparecer na base ou numa resposta da própria AR1 (`numerosDoTexto` e `valorTemBase`); se não aparecer, o trecho é retirado, a nota fica em `notes` e a sugestão vira lacuna quando sobra vazia;
  - telefones, e-mails e nomes de contatos enviados são removidos;
  - lacuna sai sempre com `content = ''`;
  - `impressaoDigital(titulo)` (minúsculas, sem acento, sem pontuação, palavras ordenadas) descarta repetidas contra as pendentes e as descartadas dos últimos 180 dias.
- `agentes/bibliotecario/gerar.ts` (server-only, portas): `gerarSugestoesDaBase({ gatilho, usuarioId, forcar })`:
  - reserva a semana no padrão de `reservarDia` (insert, depois update condicional `value->>semana <> semana`);
  - lê até 40 atendimentos com `last_message_at` nos últimos 7 dias e 30 mensagens de cada (lotes de 8 em paralelo);
  - lê a base global numa função dedicada (`.eq('scope','global')`, em vez do truque do UUID zero);
  - chama `executarIA` (`base_semanal`, 4000 tokens, 45 s);
  - no `processar`, faz o INSERT em `ar1_kb_suggestions` com `run_id` e `model`.

**Rotas:**

- `POST /api/agentes/bibliotecario/gerar`: sessão de admin ou chamada interna.
- `POST /api/agentes/bibliotecario/sugestoes/[id]` com `{ acao: 'aprovar'|'descartar', titulo?, conteudo? }`: sessão de admin (ponto de decisão do dono, porque hoje qualquer membro edita a base).

**Aprovar:**

- `faq`/`lacuna`: acrescenta ao documento de texto global "Perguntas frequentes (Bibliotecário)", ou o cria. Isso passa por uma função `criarDocumentoTexto`/`acrescentarAoDocumento` extraída de `contexto/servidor.ts`, que usa `validarNovoDocumento`/`validarAlteracao`.
- `atualizacao`: marca a sugestão como aprovada e abre o documento relacionado para a pessoa editar.
- Em seguida: `UPDATE … WHERE id AND status='pendente'`. Se nada for atualizado, desfaz o acréscimo.

**Tela** (`/agentes/bibliotecario` e contador no cartão):

- título, pergunta e resposta editável;
- "Perguntado em N conversas", com links;
- avisos, por exemplo "valor retirado por não ter base";
- impacto no orçamento da base, calculado com `aplicarOrcamento`: "a base passa de 9,0 para 10,2 mil caracteres de 60 mil; nenhum documento será cortado";
- botões Aprovar e Descartar. Na lacuna, o Aprovar só libera depois que alguém escreve a resposta.

## 10. Extensões do plano

Depois da camada, e com decisão do dono onde indicado:

- **Cobrança de retorno de propostas** (tipo `proposta_sem_retorno`). Depende da migração premium aplicada.
  - Função pura `candidatosDePropostas()` com a regra: a proposta mais recente da oportunidade, `status='enviada'` ou `sent_at` preenchido, oportunidade aberta, nenhuma versão aceita ou recusada, contato válido e com conversa, mais de 3 dias úteis sem mensagem do cliente, no máximo 2 cobranças por proposta.
  - Grava `kind` e `proposal_id`. Suprime `sem_retorno` e `acao_vencida` quando a proposta foi aceita.
  - O prompt proíbe citar as visualizações e os valores.
  - `/api/whatsapp/enviar` devolve 409 se a proposta já foi decidida.
- **Sinais do Analista.** Função pura `resumo/sinais.ts` para leads esfriando, propostas vistas sem resposta, taxa de resposta e aproveitamento das sugestões. Aparecem no painel. Pôr no WhatsApp muda o texto e a conferência, portanto é decisão do dono.
- **Gasto de IA no resumo diário** ("IA ontem: US$ 0,84 · mês: US$ 12,30"): opcional, decisão do dono. Exige incluir o valor em `valoresPermitidos`.

## 11. Telas

As telas seguem o padrão do painel: página de servidor enxuta, componente de cliente, tokens do `globals.css` e textos em linguagem simples.

### 11.1 `/agentes`

Arquivos `src/app/(app)/agentes/page.tsx` → `components/Agentes.tsx`.

- **Cabeçalho:** "Agentes", com a linha "Eles sugerem. Você aprova."
- **Faixa de números** (`grid-cols-2 lg:grid-cols-4`):
  - **Custo do mês ≈ US$** com uma barra contra `agentes.alerta_usd_mes`: âmbar a partir de 80%, vermelho a partir de 100%. Acrescenta "+N execuções sem preço" quando houver.
  - **Saldo da OpenRouter**, vindo de `/api/agentes/saldo` com cache de 10 min: "dura ~N dias no ritmo dos últimos 7". Fica vermelho abaixo de US$ 2 ou com menos de 7 dias.
  - **Ações hoje**: ok + recusadas pelo código.
  - **Erros em 24 h**, em porcentagem.
- **Alertas** (`alertasDoPainel`, função pura):
  - custo acima do alerta;
  - saldo baixo;
  - agente com mais de 20% de erro em 24 h (mínimo de 5 execuções);
  - transcrição com 100% de `pedido_recusado`: "O modelo de áudio recusou o arquivo; troque AI_AUDIO_MODEL na Vercel";
  - mais de 50% das chamadas em modo `tools` (a saída estruturada está sendo recusada; só o admin vê);
  - execuções sem preço;
  - "rodando" há mais de 3 min.
- **Gráfico:** custo diário dos últimos 30 dias, barras empilhadas por agente, a partir do agregado. Seguir a skill `dataviz` na hora de implementar.
- **Cartões por agente** (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`):
  - monograma, nome, papel;
  - selos: modelo, "Ligado/Desligado", "Personalizado";
  - hoje, semana e mês;
  - custo do mês e custo médio por execução;
  - taxa de erro em 7 dias e latência média da IA (com p90 aproximado pelas faixas de latência);
  - última atividade (`tempoRelativo`) e "rodando agora";
  - linha fixa "Só sugere". No Analista: "Manda o resumo só para o dono". Na Qualificação: "Roda junto com a Recepção".
  - Borda `border-erro/40` quando o último status foi erro.
  - Interruptor Ligar/Desligar (admin; checkbox no padrão atual).
- **Linha do tempo** (`components/LinhaDoTempoAgentes.tsx`):
  - chips de agente, situação (todos, erros, recusados, rodando) e período (hoje, 7 dias, 30 dias);
  - cada item traz agente, tarefa, gatilho e quem pediu, hora, situação, modelo (e o modelo que atendeu, se diferente), tokens de entrada, cache e saída, custo e duração;
  - links: Abrir conversa, oportunidade ou proposta;
  - `<details>` com entrada, saída, erro e meta;
  - a página intercala os eventos de `ar1_agent_config_log`, por exemplo "Alessandro trocou o modelo da Recepção para Opus 5.5";
  - paginação por chave, 50 por vez: `.lt('id', ultimoId).order('id', { ascending: false }).limit(51)`. Não usa `.range()`, que o simulador não suporta;
  - "Carregar mais".
- **Tempo real:** `useRealtime({ tabelas: ['ar1_agent_usage_daily', 'ar1_kb_suggestions'], intervaloMs: 30_000 })`. **O Shell não assina nada novo.**
- **Leituras no navegador** (`agentes/dados.ts`, `"use client"`, com RLS): `buscarUsoDiario(desdeDia)` (menos de 1000 linhas: 31 dias × 7 agentes × tarefas × modelos), `buscarRuns(filtros, antesDoId)`, `buscarAjustesDosAgentes()`, `buscarHistoricoDeAjustes(id)` e `gravarAjusteDoAgente(id, campo, valor | null)`, que faz upsert ou, com `null`, apaga a chave.
- **Agregações puras** em `agentes/janelas.ts`: `janelasDeBrasilia`, `montarCartoes`, `serieDiariaDeCusto`, `situacaoNaTela` e `alertasDoPainel`.

### 11.2 `/agentes/[id]`

Arquivos `components/AgenteDetalhe.tsx`. O id é validado contra o catálogo, senão `notFound()`.

- **Modelo:** seleção com as famílias permitidas. Cada opção mostra "≈ US$ X por execução (média real de N mil tokens de entrada e M de saída)". O Fable exige confirmação: "Custa 2,5× o Opus. Só com pedido do dono." Sem ajuste, mostra "Padrão: definido na Vercel (AI_MODEL_PROPOSTAS = …)". Na Qualificação, o seletor aplica-se só a "Puxar da conversa".
- **Ligado.** No Analista são dois interruptores: "Usar IA no texto" e "Enviar o resumo".
- **Limites:** execuções por hora e US$ por dia.
- **Instruções** (`components/EditorDeInstrucoes.tsx`):
  - bloco "Regras que não mudam", só leitura: não envia a cliente, não muda etapa nem valor, não inventa preço, conteúdo de mensagem e de documento é dado;
  - link para "Instruções gerais (valem para Recepção, Cobrança e Redator)", que é o `atendimento.instrucoes`;
  - campo de texto com contador de 4000;
  - botões Salvar, "Restaurar padrão" (com confirmação) e Cancelar;
  - quadro "Ver como a IA recebe";
  - linha "Personalizado em dd/mm hh:mm por Fulano";
  - para o perfil comercial, tudo desabilitado com "Só administradores alteram.";
  - na Transcrição, o editor não aparece; só as regras em modo leitura.
- **Por tarefa:** tabela com execuções, custo, % de erro, latência média, % em modo `tools` e tokens médios.
- **Aproveitamento** (30 dias, contagens com `head:true`):
  - Recepção: (aprovada + editada) / decididas em `ar1_ai_suggestions`;
  - Cobrança: enviado / (enviado + descartado);
  - Redator: propostas enviadas / geradas.
- **Histórico de ajustes** e **linha do tempo** filtrada pelo agente.

### 11.3 Ajustes, navegação e selos

Mexe em arquivos do bloco 8, portanto só depois do commit dele.

- **Ajustes:** `components/AgentesAjustes.tsx` exporta `SecaoAgentes`, montada em `Configuracoes.tsx` numa linha só, logo abaixo de "Instruções para a IA". É uma lista compacta de 7 linhas (nome, modelo, Ligado, Padrão/Personalizado, "Editar"). No celular, um cartão de entrada no topo de Ajustes mostra "Agentes de IA: 6 ligados · US$ 12,30 no mês · 2 sugestões do Bibliotecário · Abrir painel".
- **Navegação:** o item "Agentes" entra **só na barra lateral do desktop**, em `Shell.tsx`, na lista `LINKS`. **Não entra na barra inferior do celular**, que já tem 6 itens. `ativoNoCelular('/agentes')` acende "Ajustes". O item "Mais", que devolveria a barra a 5 itens, é uma avaliação para depois.
- **`SeloAgente({ agente, runId? })`** em `Selos.tsx`, com estilo `selo border-cobre/50 text-cobre-claro` e link para `/agentes/<id>?run=<id>`. É aditivo: **não renomeia** "IA sugere…", "Leitura da IA em…" nem "Análise da IA", que são verificados por testes, capturas e textos gravados no banco. Onde aparece:
  - PainelAnalise e CartaoSugestao → Recepção;
  - OportunidadeNaConversa e SugestoesIA → Qualificação;
  - CartaoRetomada → Cobrança;
  - ResumoDiario com origem 'ia' → Analista;
  - ListaPropostas → Redator.
  - **Nunca** em `ApresentacaoPremium` nem em `/p/[token]`.

### 11.4 Rotas novas

| Rota | Método e acesso | Função |
|---|---|---|
| `/api/agentes/diario` | GET, cron ou interno | Rotina diária (§7.7) |
| `/api/agentes/saldo` | GET, sessão | Saldo da OpenRouter; endpoints `/api/v1/credits` e/ou `/api/v1/key` a CONFERIR |
| `/api/agentes/[id]/prompt` | GET, sessão | Prompt renderizado para "Ver como a IA recebe" |
| `/api/agentes/bibliotecario/gerar` | POST, admin ou interno | Roda o Bibliotecário |
| `/api/agentes/bibliotecario/sugestoes/[id]` | POST, admin | Aprova ou descarta sugestão |

Todas com `runtime: "nodejs"` e `dynamic: "force-dynamic"`; as que chamam IA, com `maxDuration: 60`.

## 12. Retenção e agregação no plano Free

- **`ar1_agent_runs`:** linha de ~0,6 a 1 KB. Com 100 a 400 por dia × 90 dias, dá cerca de 9 a 36 mil linhas, **~10 a 45 MB** somando os índices. O teto de 50 mil linhas limita a ~60 MB, cerca de 12% dos 500 MB do Free.
- **`ar1_agent_usage_daily`:** cerca de 10 a 15 linhas por dia, **~4 mil por ano**, guardada sem prazo.
- **`ar1_agent_config_log`:** poucas linhas, guardadas por 2 anos.
- **`ar1_kb_suggestions`:** as decididas ficam 180 dias. As descartadas servem para não sugerir de novo.
- **Limpeza:** `public.ar1_agentes_manutencao()`, que só a `service_role` executa, é chamada pela rotina diária.
  - Marca como `interrompido` o que está `rodando` há mais de 10 min.
  - Apaga até 20 mil linhas vencidas por vez.
  - Aplica o teto.
  - Tudo isso fora do Realtime, sem gerar eventos no painel.
- **Sem `pg_cron`:** menos permissões e uma peça a menos. Se um dia a rotina diária falhar, basta uma chamada à mesma função pela Management API.
- **Exclusão de contato de teste:** apaga os runs dele em cascata (LGPD). O agregado fica, então o custo não se perde.
- **Sem chave estrangeira:** `agent_run_id` em `ar1_ai_suggestions`, `ar1_followups` e `ar1_proposals` não tem FK, para a limpeza não gerar UPDATE nessas tabelas, que estão no Realtime. A tela trata um run já apagado como "registro apagado (mais de 90 dias)".
- **Fora do escopo:** `ar1_wa_events` e `ar1_wa_messages.raw` crescem sem limpeza, o que é um risco para o Free, mas é outra decisão.

## 13. Testes

Todos com vitest, sem `vi.mock` de módulo, com injeção por portas no padrão de `tests/resumo.test.ts`.

1. **`tests/agentes-custos.test.ts`:**
   - os 4 exemplos da §5.2;
   - modelo desconhecido e uso ausente dão `null`;
   - arredondamento em 6 casas;
   - `custoParaMostrar` prefere o custo informado;
   - `simularCustoUSD`;
   - `estimarUsoDeAudio` para mp3 (312 KB ≈ 52 s ≈ 1.664 tokens) e ogg;
   - `formatarUSD`.
2. **`tests/agentes-uso.test.ts`:**
   - OpenRouter com e sem `cost`, com `cached_tokens`, `audio_tokens` e `reasoning_tokens`;
   - Anthropic com cache de leitura e de escrita;
   - `iterations` de fallback cobradas por modelo;
   - `somarUso`.
3. **`tests/agentes-modelos.test.ts`:**
   - `familiaDoModelo` para as 8 grafias (OpenRouter, Anthropic, com data, `:beta`, desconhecida);
   - `idNoProvedor`;
   - `resolverModelo`:
     - precedência ajuste > variável da Vercel;
     - ajuste fora da lista do agente é ignorado, com aviso;
     - Gemini num agente de texto é ignorado;
     - Fable é aceito só onde permitido;
     - a transcrição usa sempre o nome da OpenRouter;
     - `AI_MODEL` desconhecido dá família `null`.
4. **`tests/agentes-ajustes.test.ts`:**
   - leitores tolerantes (lixo vira padrão);
   - instruções cortadas em 4000;
   - ausência da chave vira padrão ("restaurar padrão");
   - limites dentro das faixas;
   - `hashInstrucoes` estável;
   - `decidirLimite`.
5. **`tests/agentes-executar.test.ts`** (portas falsas em `tests/ajuda/portas-agente.ts`, com `mundo()`, relógio controlado e runs em memória):
   - run `ok` com custo calculado e duração pelo relógio injetado;
   - o INSERT inicial acontece **antes** do fim da IA (paralelo);
   - erro da IA com telemetria no erro dá run `erro` com tokens e custo, e **a mesma instância** é relançada;
   - `TimeoutError` (DOMException) dá `tempo_esgotado`;
   - `processar` que lança dá `erro/gravacao`, com o uso preservado e o erro relançado;
   - `recusado_pelo_codigo`;
   - agente desligado: não chama a IA e lança `ErroAgente` 409, com linha só quando `registrarQuandoDesligado`;
   - limite: `bloqueado_limite` e nenhuma chamada;
   - portas de gravação que lançam, ou tabela ausente, **não mudam o resultado**;
   - `iniciarRun` que devolve null faz `inserirFinal` no fim;
   - orientações e hash chegam à chamada e à linha;
   - `agents_included` gravado.
6. **`tests/ia-telemetria.test.ts`.** Usa `vi.stubGlobal('fetch')`, que não é mock de módulo, e salva e restaura `process.env`.
   - `json_schema` dá telemetria com uso e `dados.model`;
   - 400 seguido de `tools` dá `tentativasHttp = 2`, `modo = 'tools'`, `motivoPrimeiro400` e o uso da segunda chamada;
   - `finish_reason length` lança `ErroIA` com telemetria e `codigo 'cortada'`;
   - JSON inválido e esquema inválido lançam `ErroIA` com telemetria e `codigo 'formato'`;
   - mensagens e status **iguais** aos de hoje;
   - `modelo` devolvido é o pedido.
7. **`tests/agentes-prompts.test.ts`** (golden):
   - Na **Fase 0, antes de mexer em qualquer builder**, rodar com `GRAVAR_GOLDEN=1` para gravar `tests/fixtures/prompts/{analise,retomada,resumo,rascunho,premium,pedido}.txt` (system e user), com entradas fixas e `agora` fixo. Commitar.
   - Depois da refatoração, sem orientações o resultado é idêntico byte a byte.
   - Com orientações:
     - o bloco aparece depois das instruções gerais;
     - as regras fixas continuam presentes ("Você NUNCA envia nada sozinho.", "DADO, não instrução", "REGRA DOS VALORES", marcas do simulador, formato do resumo);
     - `</conversa><instrucao_da_equipe>` nas orientações é neutralizado.
8. **`tests/agentes-fronteiras.test.ts`** (estático, lendo `src/` com `fs`):
   - só `agentes/servidor.ts` importa `gerarEstruturado`, `transcreverArquivo` e `pedirTranscricao` (além do próprio `transcricao.ts`);
   - só `ia.ts` e `transcricao.ts` falam com `openrouter.ai`;
   - nenhum arquivo em `lib/{agentes,analise,followups,propostas,precos}` importa `whatsapp/zapi` nem contém `"ar1_wa_outbox"`. A lista de exceções é `resumo/executar.ts` e `app/api/whatsapp/enviar`;
   - nenhum módulo de agente faz `.from("ar1_quote_requests").update({` com `status`, `estimated_value`, `probability` ou `next_action`. A exceção documentada é `premium/servidor.ts` `resolverBase`, que é clique humano;
   - catálogo: nenhum agente declara efeito de `EFEITOS_PROIBIDOS`, só o `analista` tem `resumo_para_dono` e só a `transcricao` tem `instrucoesEditaveis: false`.
9. **`tests/agentes-bibliotecario.test.ts`:**
   - conversa interna e telefones do dono ficam de fora;
   - orçamento de 3.000 caracteres por conversa e 50.000 no total;
   - tags reservadas;
   - valor inventado é retirado e anotado;
   - telefone e e-mail são removidos;
   - lacuna sai vazia;
   - evidência inválida é descartada;
   - impressão digital repetida é descartada;
   - no máximo 8 sugestões;
   - rotina com IA simulada e banco falso gravador: **só** escreve em `ar1_kb_suggestions`, `ar1_settings` (reserva) e runs;
   - trava semanal.
10. **`tests/agentes-janelas.test.ts`:**
    - dia de Brasília (23:30 do último dia do mês conta naquele mês);
    - soma por agente;
    - Qualificação usa as linhas da Recepção sem somar custo;
    - taxa de erro;
    - latência média e faixas;
    - "rodando" há mais de 3 min vira "provavelmente interrompido";
    - `alertasDoPainel`.
11. **`tests/resumo.test.ts`**, sem editar os casos existentes: acrescentar que `escreverComIA` recebe o contexto opcional.

## 14. Simulador e capturas

- **`scripts/simular-supabase.mjs`:**
  - tabelas `ar1_agent_runs`, `ar1_agent_usage_daily`, `ar1_agent_config_log` e `ar1_kb_suggestions`, com uma semana de dados coerentes (os gatilhos não rodam no simulador): os 7 agentes, um erro, um `tempo_esgotado`, um `rodando`, um desligado, custos plausíveis, 3 sugestões do Bibliotecário;
  - chaves `agente.*` em `ar1_settings`;
  - ids no grupo `'2'`, conferindo antes que o bloco 8 não o usa;
  - IA simulada reconhece `MARCA_PROMPT_PREMIUM`, `MARCA_PROMPT_PEDIDO` e `MARCA_PROMPT_BIBLIOTECARIO` **antes** de `'REGRA DOS VALORES'`;
  - `usage` realista por marca, com leitura e escrita de cache no caminho Anthropic;
  - `rpc` responde 404, e a manutenção falha em silêncio, como previsto.
- **`scripts/capturar-telas.mjs`:**
  - `NN-agentes-desktop` (1440) e `NN-agentes-celular` (390);
  - `NN-agentes-linha-do-tempo-erros`;
  - `NN-agente-recepcao-editor`;
  - `NN-agente-bibliotecario`;
  - `NN-ajustes-agentes` (celular);
  - uma captura extra em 320 px.
  - Títulos em `h2` dentro de `<section>`, sem "Carregando" permanente com a lista vazia e sem rolagem horizontal.

## 15. Ordem de implementação

Cada fase fecha com lint, test, `tsc` e commit próprio.

- **Fase 0: preparação (sem produção, sem custo).**
  - Conferir o `git status` do bloco 8.
  - Gravar os golden dos prompts com o código atual.
  - Pedir ao proprietário autorização para **uma** chamada real barata à OpenRouter (Sonnet, prompt curto, ≈ US$ 0,001), para conferir três coisas:
    - se `usage` traz `cost`, `cached_tokens` e `reasoning_tokens` sem `usage.include`;
    - qual `model` volta;
    - se `temperature: 0.2` provoca 400 em `json_schema` (se provocar, toda chamada hoje cai em `tools`; registrar e deixar a decisão para o dono).
- **Fase 1: módulos puros e testes.** `catalogo`, `modelos`, `uso`, `custos`, `ajustes`, `erros`, `janelas` e `executar`, com os testes 1–5 e 10. Nenhum efeito em produção.
- **Fase 2: banco.**
  - Aplicar `20260930120000_ar1_agentes.sql` pela Management API.
  - Conferir: `to_regclass` das 4 tabelas, `pg_policies`, `pg_publication_tables`, o CHECK de `ar1_settings` e os 3 gatilhos.
  - Teste com a service role:
    1. INSERT de um run 'teste' em `rodando`;
    2. UPDATE para `ok` com custo 0,01;
    3. conferir o agregado (runs 1, cost 0,01);
    4. apagar o run e a linha do agregado.
  - Rodar `select public.ar1_agentes_manutencao()`.
  - Atualizar o simulador.
- **Fase 3: ligação com o que já existe.**
  - Depois do commit do bloco 8: `ia.ts` (aditivo), teste 6 e `env.ts` (`AGENTES_REGISTRO`).
  - Depois `transcricao.ts`.
  - Depois os chamadores, nesta ordem, cada um com o golden: resumo → cobrança (mais `/api/agentes/diario` e `vercel.json`) → análise (rota e webhook) → transcrição (rota e webhook) → rascunho em PDF → premium e puxar.
  - Teste 8 (fronteiras).
  - Publicar, e conferir linhas reais aparecendo nos primeiros dias, com o proprietário testando os cinco fluxos do §3 do plano.
- **Fase 4: telas.**
  - `/agentes`, `/agentes/[id]`, `EditorDeInstrucoes`, `SeloAgente`, as rotas de saldo e de prompt.
  - Depois do bloco 8: `AgentesAjustes` em Configuracoes (1 linha) e o item no Shell (desktop).
  - Capturas.
- **Fase 5: Bibliotecário.** Arquivos, rotas, tela de aprovação, disparo às segundas e teste 9.
- **Fase 6: com números do painel e decisão do dono.**
  - Analista em Opus (subir maxTokens para cerca de 3000).
  - Cache de prompt: levar a data para o `user` e deixar a base num prefixo estável. **Muda os golden de propósito.**
  - Cobrança de propostas.
  - Sinais do Analista.
  - Reivindicação atômica de `ai_analysis_due_at`, para acabar com análises repetidas e com a corrida.
  - Corrigir o timeout fora do `try` em ia.ts.
  - Tirar `temperature` para os Claude 5.x, se a Fase 0 confirmar o 400.

## 16. Plano de rollback

1. **Rápido, sem mexer no banco:** `vercel env add AGENTES_REGISTRO production` com o valor `desligado`, e redeploy. As portas passam a não ler nem gravar nada e os agentes voltam ao comportamento de hoje: todos ligados, modelos da Vercel, sem limites.
2. **Código:** cada chamador integrado é um commit; basta reverter o do chamador com problema. O `vercel.json` volta com o cron em `/api/followups/gerar`.
3. **Banco:** o código tolera a ausência das tabelas (42P01/PGRST205 vão só para o log). Primeiro reverter ou desligar o código, e só depois rodar:

```sql
BEGIN;
ALTER PUBLICATION supabase_realtime DROP TABLE public.ar1_agent_usage_daily, public.ar1_kb_suggestions;
DROP TRIGGER ar1_settings_log ON public.ar1_settings;
DROP TRIGGER ar1_settings_touch ON public.ar1_settings;
ALTER TABLE public.ar1_settings DROP CONSTRAINT ar1_settings_agentes_check;
DROP FUNCTION public.ar1_agentes_manutencao();
DROP FUNCTION ar1_private.agentes_manutencao();
DROP TABLE public.ar1_kb_suggestions, public.ar1_agent_config_log, public.ar1_agent_usage_daily, public.ar1_agent_runs;
DROP FUNCTION ar1_private.on_agent_run(), ar1_private.on_settings_log(), ar1_private.on_settings_write();
ALTER TABLE public.ar1_ai_suggestions DROP COLUMN agent_run_id;
ALTER TABLE public.ar1_followups DROP COLUMN agent_run_id, DROP COLUMN kind, DROP COLUMN proposal_id;
ALTER TABLE public.ar1_proposals DROP COLUMN agent_run_id;
DELETE FROM public.ar1_settings WHERE key LIKE 'agente.%' OR key LIKE 'agentes.%';
COMMIT;
```

4. **Dados:** os runs são descartáveis. Os ajustes voltam ao padrão apagando as chaves.

## 17. Pontos a conferir e decisões do proprietário

**A conferir** (em chamada real, com autorização, ou na documentação atual):

- campos de `usage` da OpenRouter (`cost`, `cache_write_tokens`, `audio_tokens`, `reasoning_tokens`) e se `usage.include` ainda é necessário;
- se `temperature` gera 400 no Sonnet 5.5 e no Opus 5.5 pela OpenRouter (pela referência da Anthropic, o Opus 5.5 recusa `temperature` e o Sonnet 5.5 recusa valor diferente do padrão);
- formato de `usage.iterations` no fallback da Anthropic;
- slug do Fable 5.1 na OpenRouter;
- endpoint de saldo da OpenRouter;
- se a função chamada por fetch continua quando a chamadora termina, na Vercel;
- limite de crons do plano Hobby;
- se `gemini-3.5-flash-lite` aceita mp3 por `input_audio`. O painel vai mostrar como `pedido_recusado`.

**Decisões do proprietário** (o painel dá os números):

- Analista em Opus;
- limites e alerta mensal (padrões propostos na §3.1 e alerta de US$ 30);
- aprovação de sugestões do Bibliotecário só por admin;
- linha de gasto de IA no resumo diário;
- cobrança de propostas;
- "Pedir outra" só pela Recepção (hoje refaz a análise inteira);
- cache de prompt.

## Migracao SQL proposta
```sql
-- AR1 Films: agentes de IA (bloco 9). Registro de atividade e custo de cada chamada de IA,
-- consumo diário por agente, histórico dos ajustes dos agentes, sugestões do Bibliotecário
-- para a base de conhecimento e rotina de limpeza.
-- Depende de 20260928100000_ar1_atendimento.sql, 20260929100000_ar1_contexto.sql,
-- 20260929110000_ar1_funil.sql e 20260930100000_ar1_propostas.sql. NÃO usa as colunas de
-- 20260930110000_ar1_propostas_premium.sql: pode ser aplicada antes ou depois dela.
--
-- O que faz:
--   1. public.ar1_agent_runs: uma linha por chamada de IA (agente, tarefa, gatilho, quem pediu,
--      referências, resumos curtos SEM texto de cliente, modelo pedido e o que atendeu, tokens por
--      tipo, custo estimado pela tabela do código e custo informado pelo provedor, duração, situação
--      e erro). Nasce 'rodando' e é fechada no fim; a manutenção marca as presas como 'interrompido'.
--      Só a equipe lê; só o servidor (service_role) grava.
--   2. public.ar1_agent_usage_daily: consumo por dia de Brasília × agente × tarefa × modelo, mantido
--      por gatilho. Guardado sem prazo (cerca de 4 mil linhas por ano) e publicado no Realtime: é o
--      "sinal" do painel /agentes. ar1_agent_runs fica FORA do Realtime (a limpeza apaga em lote).
--   3. public.ar1_agent_config_log: histórico das mudanças de ajustes dos agentes e das instruções
--      gerais, gravado por gatilho em ar1_settings.
--   4. ar1_settings: gatilho que preenche updated_at/updated_by e validação das chaves agente.*.
--   5. public.ar1_kb_suggestions: sugestões do Bibliotecário (pendente/aprovada/descartada).
--   6. Rastreio: agent_run_id em ar1_ai_suggestions, ar1_followups e ar1_proposals (sem chave
--      estrangeira, para a limpeza não gerar UPDATE em tabelas do Realtime); kind e proposal_id em
--      ar1_followups (cobrança de retorno de propostas).
--   7. public.ar1_agentes_manutencao(): marca execuções presas como interrompidas e aplica a retenção
--      (agentes.retencao_dias, padrão 90, entre 30 e 365; teto de 50 mil linhas). Só a service_role
--      executa; a rotina diária (/api/agentes/diario) chama.
-- Pensado para o Supabase Free (nano), que caiu no incidente de 29/09: nada de prompt, áudio ou
-- texto de cliente no registro; poucas escritas por chamada; nenhuma escrita sem chamada de IA.
-- Transacional; falha se algum objeto já existir, em vez de sobrescrever.
BEGIN;

-- 1. Registro de execuções ------------------------------------------------------------------
CREATE TABLE public.ar1_agent_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id text NOT NULL CHECK (agent_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  task text NOT NULL CHECK (task ~ '^[a-z][a-z0-9_]{1,59}$'),
  agents_included text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(agents_included) <= 6),
  trigger_source text NOT NULL CHECK (trigger_source IN ('webhook', 'equipe', 'cron', 'interno', 'importador')),
  triggered_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.ar1_wa_contacts(id) ON DELETE CASCADE,        -- apagar o contato apaga os runs dele
  atendimento_id uuid REFERENCES public.ar1_atendimentos(id) ON DELETE SET NULL,
  quote_request_id uuid REFERENCES public.ar1_quote_requests(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.ar1_proposals(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.ar1_wa_messages(id) ON DELETE SET NULL,
  output_ref text CHECK (output_ref IS NULL OR char_length(output_ref) <= 120),     -- ex.: 'ar1_ai_suggestions:<uuid>'
  input_summary text CHECK (input_summary IS NULL OR char_length(input_summary) <= 500),     -- só metadados
  output_summary text CHECK (output_summary IS NULL OR char_length(output_summary) <= 1000), -- sem texto de cliente
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(meta) = 'object' AND pg_column_size(meta) <= 4096),
  provider text CHECK (provider IS NULL OR provider IN ('openrouter', 'anthropic')),
  model_family text CHECK (model_family IS NULL OR model_family ~ '^[a-z0-9][a-z0-9.-]{1,39}$'), -- família pedida (chave do consumo)
  model_requested text CHECK (model_requested IS NULL OR char_length(model_requested) <= 100),
  model_served text CHECK (model_served IS NULL OR char_length(model_served) <= 100),
  call_mode text CHECK (call_mode IS NULL OR call_mode IN ('json_schema', 'tools', 'sdk', 'audio')),
  http_attempts smallint CHECK (http_attempts IS NULL OR http_attempts BETWEEN 0 AND 10),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),              -- entrada sem cache e sem áudio
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),           -- inclui raciocínio
  cache_read_tokens integer CHECK (cache_read_tokens IS NULL OR cache_read_tokens >= 0),
  cache_write_tokens integer CHECK (cache_write_tokens IS NULL OR cache_write_tokens >= 0),
  audio_tokens integer CHECK (audio_tokens IS NULL OR audio_tokens >= 0),
  reasoning_tokens integer CHECK (reasoning_tokens IS NULL OR reasoning_tokens >= 0),  -- parte da saída
  cost_usd numeric(12,6) CHECK (cost_usd IS NULL OR cost_usd >= 0),                    -- estimado pela tabela do código
  cost_reported_usd numeric(12,6) CHECK (cost_reported_usd IS NULL OR cost_reported_usd >= 0), -- usage.cost da OpenRouter
  cost_estimated boolean NOT NULL DEFAULT false,                                        -- tokens estimados (ex.: áudio pelos bytes)
  price_version text CHECK (price_version IS NULL OR char_length(price_version) <= 20),
  instructions_hash text CHECK (instructions_hash IS NULL OR instructions_hash ~ '^[0-9a-f]{1,16}$'),
  prompt_chars integer CHECK (prompt_chars IS NULL OR prompt_chars >= 0),
  status text NOT NULL DEFAULT 'rodando' CHECK (status IN (
    'rodando', 'ok', 'recusado_pelo_codigo', 'erro', 'tempo_esgotado', 'interrompido', 'bloqueado_limite', 'desligado'
  )),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z_]{1,40}$'),
  error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 500),
  ai_duration_ms integer CHECK (ai_duration_ms IS NULL OR ai_duration_ms >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'rodando') = (finished_at IS NULL))
);
CREATE INDEX ar1_agent_runs_agent_idx ON public.ar1_agent_runs(agent_id, created_at DESC);
CREATE INDEX ar1_agent_runs_created_idx ON public.ar1_agent_runs(created_at DESC);
CREATE INDEX ar1_agent_runs_running_idx ON public.ar1_agent_runs(created_at) WHERE status = 'rodando';
CREATE INDEX ar1_agent_runs_problems_idx ON public.ar1_agent_runs(created_at DESC)
  WHERE status IN ('erro', 'tempo_esgotado', 'interrompido', 'bloqueado_limite', 'recusado_pelo_codigo');
CREATE INDEX ar1_agent_runs_contact_idx ON public.ar1_agent_runs(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX ar1_agent_runs_atendimento_idx ON public.ar1_agent_runs(atendimento_id, created_at DESC) WHERE atendimento_id IS NOT NULL;
CREATE INDEX ar1_agent_runs_quote_idx ON public.ar1_agent_runs(quote_request_id) WHERE quote_request_id IS NOT NULL;
CREATE INDEX ar1_agent_runs_proposal_idx ON public.ar1_agent_runs(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX ar1_agent_runs_message_idx ON public.ar1_agent_runs(message_id) WHERE message_id IS NOT NULL;

-- 2. Consumo diário (dia de Brasília × agente × tarefa × modelo) -----------------------------
CREATE TABLE public.ar1_agent_usage_daily (
  day date NOT NULL,
  agent_id text NOT NULL CHECK (char_length(agent_id) <= 40),
  task text NOT NULL CHECK (char_length(task) <= 60),
  model text NOT NULL CHECK (char_length(model) <= 40),
  runs integer NOT NULL DEFAULT 0 CHECK (runs >= 0),
  ok integer NOT NULL DEFAULT 0 CHECK (ok >= 0),
  rejected integer NOT NULL DEFAULT 0 CHECK (rejected >= 0),     -- recusado pelo código
  errors integer NOT NULL DEFAULT 0 CHECK (errors >= 0),         -- erro + interrompido
  timeouts integer NOT NULL DEFAULT 0 CHECK (timeouts >= 0),
  blocked integer NOT NULL DEFAULT 0 CHECK (blocked >= 0),       -- bloqueado por limite ou desligado (sem IA)
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  cache_write_tokens bigint NOT NULL DEFAULT 0,
  audio_tokens bigint NOT NULL DEFAULT 0,
  reasoning_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(14,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0), -- informado quando houver, senão estimado
  cost_unknown_runs integer NOT NULL DEFAULT 0 CHECK (cost_unknown_runs >= 0),
  duration_ms_total bigint NOT NULL DEFAULT 0,
  duration_ms_max integer NOT NULL DEFAULT 0,
  timed_runs integer NOT NULL DEFAULT 0,                          -- execuções com duração válida
  lat_ate_5s integer NOT NULL DEFAULT 0,
  lat_5_a_15s integer NOT NULL DEFAULT 0,
  lat_15_a_30s integer NOT NULL DEFAULT 0,
  lat_30_a_50s integer NOT NULL DEFAULT 0,
  lat_acima_50s integer NOT NULL DEFAULT 0,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text CHECK (last_status IS NULL OR char_length(last_status) <= 30),
  last_run_id bigint,
  PRIMARY KEY (day, agent_id, task, model)
);
CREATE INDEX ar1_agent_usage_daily_agent_idx ON public.ar1_agent_usage_daily(agent_id, day DESC);

CREATE FUNCTION ar1_private.on_agent_run() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE
  v_dia date;
  v_modelo text;
  v_custo numeric;
  v_sem_ia boolean;
  v_com_lat boolean;
  v_dur integer;
BEGIN
  -- Só interessa o INSERT e a passagem de 'rodando' para a situação final.
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'rodando' AND NEW.status <> 'rodando') THEN
    RETURN NULL;
  END IF;

  v_dia := (NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_modelo := COALESCE(NEW.model_family, '(desconhecido)');

  IF NEW.status = 'rodando' THEN
    -- Início: só marca a atividade (o painel escuta esta tabela).
    INSERT INTO public.ar1_agent_usage_daily AS u (day, agent_id, task, model, last_started_at)
    VALUES (v_dia, NEW.agent_id, NEW.task, v_modelo, NEW.created_at)
    ON CONFLICT (day, agent_id, task, model) DO UPDATE
      SET last_started_at = GREATEST(u.last_started_at, EXCLUDED.last_started_at);
    RETURN NULL;
  END IF;

  v_custo := COALESCE(NEW.cost_reported_usd, NEW.cost_usd);
  v_sem_ia := NEW.status IN ('bloqueado_limite', 'desligado');
  v_com_lat := NOT v_sem_ia AND NEW.status <> 'interrompido' AND NEW.duration_ms IS NOT NULL;
  v_dur := CASE WHEN v_com_lat THEN NEW.duration_ms ELSE 0 END;

  INSERT INTO public.ar1_agent_usage_daily AS u (
    day, agent_id, task, model,
    runs, ok, rejected, errors, timeouts, blocked,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, audio_tokens, reasoning_tokens,
    cost_usd, cost_unknown_runs,
    duration_ms_total, duration_ms_max, timed_runs,
    lat_ate_5s, lat_5_a_15s, lat_15_a_30s, lat_30_a_50s, lat_acima_50s,
    last_started_at, last_finished_at, last_status, last_run_id)
  VALUES (
    v_dia, NEW.agent_id, NEW.task, v_modelo,
    1,
    (NEW.status = 'ok')::int,
    (NEW.status = 'recusado_pelo_codigo')::int,
    (NEW.status IN ('erro', 'interrompido'))::int,
    (NEW.status = 'tempo_esgotado')::int,
    v_sem_ia::int,
    COALESCE(NEW.input_tokens, 0), COALESCE(NEW.output_tokens, 0),
    COALESCE(NEW.cache_read_tokens, 0), COALESCE(NEW.cache_write_tokens, 0),
    COALESCE(NEW.audio_tokens, 0), COALESCE(NEW.reasoning_tokens, 0),
    COALESCE(v_custo, 0),
    (v_custo IS NULL AND NOT v_sem_ia)::int,
    v_dur, v_dur, v_com_lat::int,
    (v_com_lat AND v_dur < 5000)::int,
    (v_com_lat AND v_dur >= 5000 AND v_dur < 15000)::int,
    (v_com_lat AND v_dur >= 15000 AND v_dur < 30000)::int,
    (v_com_lat AND v_dur >= 30000 AND v_dur < 50000)::int,
    (v_com_lat AND v_dur >= 50000)::int,
    NEW.created_at, COALESCE(NEW.finished_at, now()), NEW.status, NEW.id)
  ON CONFLICT (day, agent_id, task, model) DO UPDATE SET
    runs = u.runs + 1,
    ok = u.ok + EXCLUDED.ok,
    rejected = u.rejected + EXCLUDED.rejected,
    errors = u.errors + EXCLUDED.errors,
    timeouts = u.timeouts + EXCLUDED.timeouts,
    blocked = u.blocked + EXCLUDED.blocked,
    input_tokens = u.input_tokens + EXCLUDED.input_tokens,
    output_tokens = u.output_tokens + EXCLUDED.output_tokens,
    cache_read_tokens = u.cache_read_tokens + EXCLUDED.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + EXCLUDED.cache_write_tokens,
    audio_tokens = u.audio_tokens + EXCLUDED.audio_tokens,
    reasoning_tokens = u.reasoning_tokens + EXCLUDED.reasoning_tokens,
    cost_usd = u.cost_usd + EXCLUDED.cost_usd,
    cost_unknown_runs = u.cost_unknown_runs + EXCLUDED.cost_unknown_runs,
    duration_ms_total = u.duration_ms_total + EXCLUDED.duration_ms_total,
    duration_ms_max = GREATEST(u.duration_ms_max, EXCLUDED.duration_ms_max),
    timed_runs = u.timed_runs + EXCLUDED.timed_runs,
    lat_ate_5s = u.lat_ate_5s + EXCLUDED.lat_ate_5s,
    lat_5_a_15s = u.lat_5_a_15s + EXCLUDED.lat_5_a_15s,
    lat_15_a_30s = u.lat_15_a_30s + EXCLUDED.lat_15_a_30s,
    lat_30_a_50s = u.lat_30_a_50s + EXCLUDED.lat_30_a_50s,
    lat_acima_50s = u.lat_acima_50s + EXCLUDED.lat_acima_50s,
    last_started_at = GREATEST(u.last_started_at, EXCLUDED.last_started_at),
    last_finished_at = GREATEST(u.last_finished_at, EXCLUDED.last_finished_at),
    last_status = EXCLUDED.last_status,
    last_run_id = EXCLUDED.last_run_id;
  RETURN NULL;
END;
$func$;
CREATE TRIGGER ar1_agent_runs_usage AFTER INSERT OR UPDATE OF status ON public.ar1_agent_runs
  FOR EACH ROW EXECUTE FUNCTION ar1_private.on_agent_run();

-- 3. Histórico dos ajustes dos agentes -------------------------------------------------------
CREATE TABLE public.ar1_agent_config_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  old_value jsonb,
  new_value jsonb,
  changed_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ar1_agent_config_log_key_idx ON public.ar1_agent_config_log(key, changed_at DESC);
CREATE INDEX ar1_agent_config_log_changed_idx ON public.ar1_agent_config_log(changed_at DESC);

-- 4. ar1_settings: autoria automática, validação das chaves agente.* e histórico -------------
CREATE FUNCTION ar1_private.on_settings_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $func$
BEGIN
  NEW.updated_at := now();
  -- Pelo painel (sessão), grava quem mudou; pelo servidor (service_role), mantém o que veio.
  NEW.updated_by := COALESCE((SELECT auth.uid()), NEW.updated_by);
  RETURN NEW;
END;
$func$;
CREATE TRIGGER ar1_settings_touch BEFORE INSERT OR UPDATE ON public.ar1_settings
  FOR EACH ROW EXECUTE FUNCTION ar1_private.on_settings_write();

-- Modelo só da lista fechada; instruções até 4000 caracteres; tipos certos. Chaves que não começam
-- com 'agente.' não são afetadas (nenhuma das existentes começa).
ALTER TABLE public.ar1_settings ADD CONSTRAINT ar1_settings_agentes_check CHECK (
  key NOT LIKE 'agente.%'
  OR (key ~ '^agente\.[a-z_]{2,40}\.ativo$' AND jsonb_typeof(value) = 'boolean')
  OR (key ~ '^agente\.[a-z_]{2,40}\.modelo$' AND jsonb_typeof(value) = 'string'
      AND (value #>> '{}') IN ('sonnet-5.5', 'opus-5.5', 'fable-5.1', 'gemini-3.5-flash-lite'))
  OR (key ~ '^agente\.[a-z_]{2,40}\.instrucoes$' AND jsonb_typeof(value) = 'string'
      AND char_length(value #>> '{}') <= 4000)
  OR (key ~ '^agente\.[a-z_]{2,40}\.limites$' AND jsonb_typeof(value) = 'object')
  OR (key ~ '^agente\.[a-z_]{2,40}\.(ultima_rodada|ultima_semana)$' AND jsonb_typeof(value) = 'object')
);

CREATE FUNCTION ar1_private.on_settings_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE
  v_key text;
  v_antes jsonb;
  v_depois jsonb;
  v_quem uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_key := OLD.key; v_antes := OLD.value; v_depois := NULL; v_quem := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_key := NEW.key; v_antes := OLD.value; v_depois := NEW.value; v_quem := NEW.updated_by;
  ELSE
    v_key := NEW.key; v_antes := NULL; v_depois := NEW.value; v_quem := NEW.updated_by;
  END IF;

  IF v_key !~ '^(agente\.[a-z_]{2,40}\.(ativo|modelo|instrucoes|limites)|agentes\.(alerta_usd_mes|retencao_dias)|atendimento\.instrucoes|resumo\.ativo)$' THEN
    RETURN NULL;
  END IF;
  IF v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ar1_agent_config_log (key, old_value, new_value, changed_by)
  VALUES (v_key, v_antes, v_depois, COALESCE((SELECT auth.uid()), v_quem));
  RETURN NULL;
END;
$func$;
CREATE TRIGGER ar1_settings_log AFTER INSERT OR UPDATE OR DELETE ON public.ar1_settings
  FOR EACH ROW EXECUTE FUNCTION ar1_private.on_settings_log();

-- 5. Sugestões do Bibliotecário para a base de conhecimento ----------------------------------
CREATE TABLE public.ar1_kb_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('faq', 'lacuna', 'atualizacao')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  question text CHECK (question IS NULL OR char_length(question) <= 1000),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 20000),   -- lacuna nasce vazia
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),           -- avisos internos (ex.: valor retirado)
  related_doc_id uuid REFERENCES public.ar1_context_docs(id) ON DELETE SET NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb                                -- só ids de atendimento e contagens
    CHECK (jsonb_typeof(evidence) = 'array' AND pg_column_size(evidence) <= 4096),
  occurrences smallint NOT NULL DEFAULT 1 CHECK (occurrences BETWEEN 1 AND 1000),
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'descartada')),
  context_doc_id uuid REFERENCES public.ar1_context_docs(id) ON DELETE SET NULL, -- documento criado/alterado na aprovação
  run_id bigint,                                                             -- sem FK: a retenção apaga runs
  model text CHECK (model IS NULL OR char_length(model) <= 100),
  decided_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pendente') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX ar1_kb_suggestions_one_pending_idx ON public.ar1_kb_suggestions(fingerprint) WHERE status = 'pendente';
CREATE INDEX ar1_kb_suggestions_status_idx ON public.ar1_kb_suggestions(status, created_at DESC);
CREATE INDEX ar1_kb_suggestions_fingerprint_idx ON public.ar1_kb_suggestions(fingerprint, decided_at DESC);
CREATE TRIGGER ar1_kb_suggestions_updated BEFORE UPDATE ON public.ar1_kb_suggestions
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();

-- 6. Rastreio do agente nas saídas que já existem -------------------------------------------
-- Sem chave estrangeira de propósito: a retenção apaga runs sem gerar UPDATE nessas tabelas,
-- que estão no Realtime. O painel trata run inexistente como "registro já apagado".
ALTER TABLE public.ar1_ai_suggestions ADD COLUMN agent_run_id bigint;
ALTER TABLE public.ar1_followups
  ADD COLUMN agent_run_id bigint,
  ADD COLUMN kind text CHECK (kind IS NULL OR kind IN ('aguardando_resposta', 'sem_retorno', 'acao_vencida', 'proposta_sem_retorno')),
  ADD COLUMN proposal_id uuid REFERENCES public.ar1_proposals(id) ON DELETE SET NULL;
CREATE INDEX ar1_followups_proposal_idx ON public.ar1_followups(proposal_id) WHERE proposal_id IS NOT NULL;
ALTER TABLE public.ar1_proposals ADD COLUMN agent_run_id bigint;

-- 7. Manutenção (retenção e execuções presas) ------------------------------------------------
CREATE FUNCTION ar1_private.agentes_manutencao() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
DECLARE
  v_dias integer := 90;
  v_bruto text;
  v_corte bigint;
  v_interrompidos integer := 0;
  v_apagados integer := 0;
  v_excedentes integer := 0;
  v_sugestoes integer := 0;
  v_historico integer := 0;
BEGIN
  SELECT value #>> '{}' INTO v_bruto FROM public.ar1_settings WHERE key = 'agentes.retencao_dias';
  IF v_bruto ~ '^\d{1,3}$' THEN
    v_dias := LEAST(GREATEST(v_bruto::integer, 30), 365);
  END IF;

  -- Execuções que a função perdeu no meio (tempo máximo da Vercel, queda): viram 'interrompido'
  -- e entram no consumo como erro, pelo gatilho.
  UPDATE public.ar1_agent_runs
     SET status = 'interrompido',
         error_code = 'interrompido',
         error_message = 'A execução parou antes de terminar (tempo máximo da função ou queda).',
         finished_at = now()
   WHERE status = 'rodando' AND created_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_interrompidos = ROW_COUNT;

  DELETE FROM public.ar1_agent_runs
   WHERE id IN (SELECT id FROM public.ar1_agent_runs
                 WHERE created_at < now() - make_interval(days => v_dias)
                 ORDER BY id
                 LIMIT 20000);
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  -- Teto rígido: mantém no máximo as 50 mil execuções mais recentes.
  SELECT id INTO v_corte FROM public.ar1_agent_runs ORDER BY id DESC OFFSET 50000 LIMIT 1;
  IF v_corte IS NOT NULL THEN
    DELETE FROM public.ar1_agent_runs WHERE id <= v_corte;
    GET DIAGNOSTICS v_excedentes = ROW_COUNT;
  END IF;

  DELETE FROM public.ar1_kb_suggestions
   WHERE status <> 'pendente' AND decided_at < now() - interval '180 days';
  GET DIAGNOSTICS v_sugestoes = ROW_COUNT;

  DELETE FROM public.ar1_agent_config_log WHERE changed_at < now() - interval '730 days';
  GET DIAGNOSTICS v_historico = ROW_COUNT;

  RETURN jsonb_build_object(
    'em', now(), 'retencao_dias', v_dias, 'interrompidos', v_interrompidos,
    'apagados', v_apagados, 'excedentes', v_excedentes,
    'sugestoes_apagadas', v_sugestoes, 'historico_apagado', v_historico);
END;
$func$;

-- Porta para o servidor chamar por RPC (o schema ar1_private não é exposto pela API).
CREATE FUNCTION public.ar1_agentes_manutencao() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $func$
  SELECT ar1_private.agentes_manutencao();
$func$;

-- 8. Permissões: equipe só lê; só o servidor grava ------------------------------------------
ALTER TABLE public.ar1_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_agent_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_agent_config_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_kb_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar1_agent_runs_staff_read ON public.ar1_agent_runs FOR SELECT TO authenticated
  USING ((SELECT ar1_private.is_staff()));
CREATE POLICY ar1_agent_usage_daily_staff_read ON public.ar1_agent_usage_daily FOR SELECT TO authenticated
  USING ((SELECT ar1_private.is_staff()));
CREATE POLICY ar1_agent_config_log_staff_read ON public.ar1_agent_config_log FOR SELECT TO authenticated
  USING ((SELECT ar1_private.is_staff()));
CREATE POLICY ar1_kb_suggestions_staff_read ON public.ar1_kb_suggestions FOR SELECT TO authenticated
  USING ((SELECT ar1_private.is_staff()));

REVOKE ALL ON TABLE public.ar1_agent_runs, public.ar1_agent_usage_daily, public.ar1_agent_config_log,
  public.ar1_kb_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ar1_agent_runs, public.ar1_agent_usage_daily, public.ar1_agent_config_log,
  public.ar1_kb_suggestions TO authenticated;
GRANT ALL ON TABLE public.ar1_agent_runs, public.ar1_agent_usage_daily, public.ar1_agent_config_log,
  public.ar1_kb_suggestions TO service_role;

REVOKE ALL ON FUNCTION ar1_private.on_agent_run(), ar1_private.on_settings_write(),
  ar1_private.on_settings_log(), ar1_private.agentes_manutencao() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ar1_agentes_manutencao() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ar1_agentes_manutencao() TO service_role;

-- 9. Tempo real: só o consumo diário (pequeno, uma atualização por início/fim de execução) e as
-- sugestões do Bibliotecário (semanais). ar1_agent_runs fica de fora de propósito.
ALTER PUBLICATION supabase_realtime ADD TABLE public.ar1_agent_usage_daily, public.ar1_kb_suggestions;

COMMIT;
```

## Arquivos novos
- supabase/migrations/20260930120000_ar1_agentes.sql
- atendimento/src/lib/agentes/catalogo.ts
- atendimento/src/lib/agentes/modelos.ts
- atendimento/src/lib/agentes/uso.ts
- atendimento/src/lib/agentes/custos.ts
- atendimento/src/lib/agentes/ajustes.ts
- atendimento/src/lib/agentes/erros.ts
- atendimento/src/lib/agentes/resumos.ts
- atendimento/src/lib/agentes/janelas.ts
- atendimento/src/lib/agentes/executar.ts
- atendimento/src/lib/agentes/servidor.ts
- atendimento/src/lib/agentes/dados.ts
- atendimento/src/lib/agentes/bibliotecario/conversas.ts
- atendimento/src/lib/agentes/bibliotecario/prompt.ts
- atendimento/src/lib/agentes/bibliotecario/esquema.ts
- atendimento/src/lib/agentes/bibliotecario/regras.ts
- atendimento/src/lib/agentes/bibliotecario/gerar.ts
- atendimento/src/app/(app)/agentes/page.tsx
- atendimento/src/app/(app)/agentes/[id]/page.tsx
- atendimento/src/app/api/agentes/diario/route.ts
- atendimento/src/app/api/agentes/saldo/route.ts
- atendimento/src/app/api/agentes/[id]/prompt/route.ts
- atendimento/src/app/api/agentes/bibliotecario/gerar/route.ts
- atendimento/src/app/api/agentes/bibliotecario/sugestoes/[id]/route.ts
- atendimento/src/components/Agentes.tsx
- atendimento/src/components/CartaoAgente.tsx
- atendimento/src/components/AgenteDetalhe.tsx
- atendimento/src/components/LinhaDoTempoAgentes.tsx
- atendimento/src/components/EditorDeInstrucoes.tsx
- atendimento/src/components/GraficoCustosAgentes.tsx
- atendimento/src/components/SugestoesBibliotecario.tsx
- atendimento/src/components/AgentesAjustes.tsx
- atendimento/tests/ajuda/portas-agente.ts
- atendimento/tests/agentes-custos.test.ts
- atendimento/tests/agentes-uso.test.ts
- atendimento/tests/agentes-modelos.test.ts
- atendimento/tests/agentes-ajustes.test.ts
- atendimento/tests/agentes-executar.test.ts
- atendimento/tests/agentes-prompts.test.ts
- atendimento/tests/agentes-fronteiras.test.ts
- atendimento/tests/agentes-bibliotecario.test.ts
- atendimento/tests/agentes-janelas.test.ts
- atendimento/tests/ia-telemetria.test.ts
- atendimento/tests/fixtures/prompts/analise.system.txt
- atendimento/tests/fixtures/prompts/analise.user.txt
- atendimento/tests/fixtures/prompts/retomada.system.txt
- atendimento/tests/fixtures/prompts/retomada.user.txt
- atendimento/tests/fixtures/prompts/resumo.system.txt
- atendimento/tests/fixtures/prompts/resumo.user.txt
- atendimento/tests/fixtures/prompts/rascunho.system.txt
- atendimento/tests/fixtures/prompts/rascunho.user.txt
- atendimento/tests/fixtures/prompts/premium.system.txt
- atendimento/tests/fixtures/prompts/premium.user.txt
- atendimento/tests/fixtures/prompts/pedido.system.txt
- atendimento/tests/fixtures/prompts/pedido.user.txt

## Arquivos alterados
- atendimento/src/lib/ia.ts (aditivo, só depois do commit do bloco 8: TelemetriaIA em RespostaEstruturada e ErroIA, código de erro, id/model/usage em RespostaChat; mensagens, status e o 'modelo' devolvido ficam iguais)
- atendimento/src/lib/env.ts (depois do bloco 8: getter agentesRegistro, a partir de AGENTES_REGISTRO)
- atendimento/src/lib/transcricao.ts (callback opcional aoTelemetria em pedirTranscricao; transcreverMensagem com registro opcional e select com atendimento_id/contact_id, passando por executarTranscricao)
- atendimento/src/lib/analise/executar.ts (executarIA; 3º parâmetro opcional registro; pós-processamento dentro de processar; agent_run_id; Qualificação desligada; ErroAgente)
- atendimento/src/lib/analise/contexto.ts (parâmetro opcional orientacoes; TAGS_RESERVADAS ampliadas para as tags do Bibliotecário)
- atendimento/src/lib/followups/gerar.ts (executarIA; opções gatilho/usuarioId; checa se o agente está ligado; insert com select('id'), agent_run_id e kind; 23505 visível; ultima_rodada)
- atendimento/src/lib/followups/prompt.ts (parâmetro opcional orientacoes)
- atendimento/src/lib/resumo/executar.ts (escreverComIA via executarIA com a conferência definindo o status; enviar recusa telefone fora de resumo.destinatarios)
- atendimento/src/lib/resumo/rotina.ts (Portas.escreverComIA recebe 2º parâmetro opcional {origem, modo, usuarioId})
- atendimento/src/lib/resumo/texto.ts (montarPromptResumo com orientacoes opcional)
- atendimento/src/lib/propostas/servidor.ts (prepararRascunho via executarIA)
- atendimento/src/lib/propostas/rascunho.ts (orientacoes opcional)
- atendimento/src/lib/propostas/premium/servidor.ts (depois do bloco 8: criarPropostaPremium e puxarPedidoDaConversa via executarIA; resolverBase fica fora do agente)
- atendimento/src/lib/propostas/premium/prompt.ts (depois do bloco 8: orientacoes opcional em montarPromptPremium e montarPromptPedido)
- atendimento/src/lib/contexto/servidor.ts (extrair criarDocumentoTexto e acrescentarAoDocumento para a aprovação do Bibliotecário)
- atendimento/src/app/api/ia/analisar/route.ts (origem webhook/importador/interno/equipe, usuarioId, resposta para agente desligado)
- atendimento/src/app/api/whatsapp/webhook/[secret]/route.ts (só acrescenta origem:'webhook' no corpo do fetch de análise e registro {gatilho:'webhook'} na transcrição; proteções intactas)
- atendimento/src/app/api/transcrever/route.ts (gatilho e usuarioId; 409 com agente desligado)
- atendimento/src/app/api/followups/gerar/route.ts (gatilho e usuarioId; desligado 200/409)
- atendimento/src/app/api/resumo/diario/route.ts (repassa usuarioId e origem para o registro)
- atendimento/src/app/api/propostas/rascunho/route.ts (usuarioId)
- atendimento/src/app/api/propostas/premium/route.ts (depois do bloco 8: usuarioId; 409 com Redator desligado)
- atendimento/src/app/api/propostas/premium/puxar/route.ts (depois do bloco 8: usuarioId; 409 com Qualificação desligada)
- atendimento/src/components/Shell.tsx (depois do bloco 8: item 'Agentes' só na barra lateral do desktop; ativoNoCelular)
- atendimento/src/components/Configuracoes.tsx (depois do bloco 8: uma linha montando SecaoAgentes e o cartão de entrada no celular)
- atendimento/src/components/Selos.tsx (SeloAgente, aditivo)
- atendimento/src/components/Conversa.tsx (SeloAgente em PainelAnalise e CartaoSugestao; texto 'Recepção desligada' em vez de 'Análise agendada')
- atendimento/src/components/Retomar.tsx (SeloAgente; estado 'Cobrança desligada')
- atendimento/src/components/ResumoDiario.tsx (SeloAgente do Analista; mostra os dois interruptores)
- atendimento/src/components/SugestoesIA.tsx e OportunidadeNaConversa.tsx (SeloAgente da Qualificação)
- atendimento/src/components/ListaPropostas.tsx (depois do bloco 8: SeloAgente do Redator; nunca em ApresentacaoPremium nem em /p/[token])
- atendimento/vercel.json (cron das 11:00 passa para /api/agentes/diario; continuam 2 crons)
- atendimento/scripts/simular-supabase.mjs (tabelas novas com uma semana de dados, chaves agente.*, marcas do premium/pedido/bibliotecário antes de 'REGRA DOS VALORES', usage realista)
- atendimento/scripts/capturar-telas.mjs (capturas de /agentes, /agentes/recepcao, editor, bibliotecário, Ajustes; 1440, 390 e 320)
- atendimento/ponte/importar-historico.mjs (opcional: origem 'importador' no corpo)
- atendimento/LEIA-ME.md (camada de agentes, chaves, rollback)
- CONTINUIDADE-ATENDIMENTO.md (registro da entrega)

## Riscos
- ia.ts, env.ts, Shell.tsx, Configuracoes.tsx, tipos.ts e propostas/premium/* estão sendo editados pelo agente do bloco 8. Mexer neles antes do commit gera conflito ou sobrescreve trabalho pela metade. Por isso a Fase 1 e a Fase 2 usam só arquivos novos, e as mudanças nesses arquivos são apenas acréscimos.
- A OpenRouter pode não devolver usage.cost, cache_write_tokens ou audio_tokens sem opt-in, e os nomes dos campos precisam ser conferidos. Sem isso, o custo informado fica nulo e só a estimativa aparece (marcada com ≈). Antes de fechar o desenho é preciso uma chamada real barata, autorizada pelo dono.
- Pela referência da API da Anthropic, o Opus 5.5 recusa temperature e o Sonnet 5.5 recusa valor diferente do padrão, e ia.ts manda 0.2 pela OpenRouter. Se ela repassar o parâmetro, toda chamada hoje recebe 400 e cai no fallback por tools. O registro vai revelar isso (call_mode, motivo_400); corrigir muda comportamento e fica para o dono decidir.
- O modelo cobrado pode não ser o pedido: o fallback de servidor da Anthropic usa outro modelo, e a OpenRouter devolve em dados.model qual atendeu. O custo usa quem atendeu, mas o consumo diário agrupa pela família pedida. Um fallback caro pode aparecer somado na linha do modelo mais barato.
- O Opus 5.5 sempre pensa antes de responder, e esse raciocínio é cobrado como saída e consome o maxTokens. Trocar o Analista (1200 tokens, 25 s) ou manter o Redator (12000, 55 s) em Opus aumenta o risco de 'cortada', 'tempo_esgotado' e texto de reserva. O painel mede isso, mas a troca do Analista deve ser uma decisão explícita.
- Na proposta premium, 55 s de IA dentro de uma função de 60 s pode matar a execução antes do UPDATE final. O run fica 'rodando' até a manutenção marcá-lo como 'interrompido', e o resolverBase já terá criado ou movido a oportunidade. O problema já existe hoje; agora ele aparece no painel.
- Gravar a execução soma até 3 s no fim de cada chamada (o INSERT inicial roda em paralelo) e duas leituras curtas com cache. Em lotes apertados (retomadas com corte em 36 s, resumo com 25 s) a folga diminui. As portas têm timeout curto e nunca derrubam o fluxo.
- Os limites por agente são aproximados (cache de 15 s por instância) e podem passar um pouco. Limites padrão mal calibrados podem bloquear análises reais: ficam altos na primeira entrega e o dono ajusta com os números do painel.
- As instruções editáveis são aditivas, mas ainda podem contradizer o formato que o código confere (resumo). Nesse caso sai o texto de reserva todos os dias; o painel mostra como 'recusado_pelo_codigo' e dá o motivo.
- O CHECK em ar1_settings fecha a lista de modelos no banco: um modelo novo exige migração, além da tabela de preços no código. Os gatilhos novos em ar1_settings (updated_by/updated_at e o histórico) mudam levemente o comportamento de gravação; o código atual já grava updated_at e não é afetado.
- A limpeza apaga em lote. ar1_agent_runs fica fora do Realtime de propósito, o que contraria o plano ('realtime' nos runs): o painel escuta ar1_agent_usage_daily. agent_run_id nas tabelas existentes não tem chave estrangeira, para não gerar UPDATE em tabelas publicadas.
- Recepção e Qualificação continuam numa chamada só. O modelo da Qualificação vale apenas para 'Puxar da conversa', e o custo da análise conta só na Recepção. Separar em duas chamadas dobraria custo e tempo.
- Defeitos atuais que o painel vai expor mas este bloco não corrige, para não mudar comportamento: análises repetidas do mesmo atendimento (mensagens no mesmo segundo); corrida que zera ai_analysis_due_at; timeout fora do try em ia.ts; data e hora no fim do system, que impede cache e no caminho Anthropic paga escrita de cache (+25%) sem nunca ler.
- O simulador não tem /rpc, offset nem gatilhos. As telas precisam de dados de exemplo coerentes entre runs e consumo diário, e a linha do tempo pagina por id em vez de .range(). A manutenção falha em silêncio no simulador, como esperado.
- O Bibliotecário lê conversas de clientes e escreve texto que vira 'fonte de verdade' em todos os prompts. Os riscos são injeção, vazamento de dados de um cliente para outro e valores inventados. As regras no código (evidência, valor com base, remoção de telefone e e-mail, lacuna vazia) e a aprovação humana são obrigatórias; aprovar só por admin fica para o dono decidir.
- A rotina diária dispara o Bibliotecário por fetch e não espera o fim. Isso depende de a Vercel manter viva a função chamada quando a chamadora termina, o mesmo pressuposto do webhook → /api/ia/analisar (CONFERIR). O limite de crons do plano Hobby também precisa ser conferido antes de acrescentar outro.
- Custo estimado da primeira entrega: cerca de US$ 30/mês no cenário de 40 análises por dia, com cerca de 75% na Recepção. Se o Sonnet 5.5 estiver pensando por padrão na OpenRouter, o custo real sobe; o alerta mensal e o saldo da OpenRouter no painel servem para pegar isso cedo.
