-- AR1 Films: propostas premium (apresentação para o cliente, página pública /p/<token>,
-- PDF pelo Chrome) e tabela de preços (ar1_price_items).
-- Depende de 20260930100000_ar1_propostas.sql (ar1_proposals), 20260929110000_ar1_funil.sql
-- (ar1_quote_requests como oportunidade) e 20260929100000_ar1_contexto.sql (bucket ar1-context).
--
-- O que faz:
--   1. Cria public.ar1_price_items (tabela de preços): a equipe lê, só administradores
--      alteram (mesma regra de ar1_settings). Insere a tabela inicial: 31 itens com valores
--      SUGERIDOS para Goiânia / Brasil central em 2026, todos com confirmed = false (a equipe
--      confirma cada item em Ajustes → Tabela de preços). A lista vem de
--      atendimento/scripts/precos-iniciais.mjs (--sql gera o INSERT, --conferir compara).
--   2. Amplia public.ar1_proposals para a proposta premium: tipo, situação, serviço, token da
--      página pública com validade, visualizações, aceite, decisão da equipe, aviso interno de
--      valores não confirmados e como o PDF foi gerado. O PDF passa a ser opcional só para a
--      premium (a proposta em PDF antiga continua exigindo o arquivo).
--   3. Função ar1_register_proposal_view(id): conta a visita do cliente num único UPDATE
--      (duas visitas ao mesmo tempo não se perdem). Só a chave de serviço executa.
--   4. Oportunidade sem telefone: a proposta para cliente digitado (sem WhatsApp) cria a
--      oportunidade com phone NULL. O telefone, quando existe, continua com 8 a 32 caracteres.
--   5. Libera imagens (logo e fotos do cliente) no bucket privado ar1-context, em
--      propostas/<id da proposta>/, acrescentando PNG, JPG e WebP aos tipos aceitos.
--
-- Transacional. Pode ser aplicada de novo sem estragar nada: tudo usa IF NOT EXISTS /
-- OR REPLACE / DROP ... IF EXISTS, e a tabela inicial só entra se a tabela de preços estiver
-- vazia (preços já editados pela equipe nunca são sobrescritos).
-- Realtime: ar1_proposals já está na publicação supabase_realtime (20260930100000), e as
-- colunas novas vão junto. A tabela de preços fica fora (nenhuma tela escuta).
BEGIN;

-- 1. Tabela de preços --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ar1_price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL CHECK (service IN (
    'Podcast gravado', 'Podcast ao vivo', 'Podcast itinerante', 'Transmissão ao vivo', 'Leilão 360',
    'Filme de Legado', 'Filme de marca', 'Fotografia', 'Shows/DVDs/clipes', 'Conteúdo recorrente',
    'Consultoria de estúdio', 'Locação do Haras SOBI', 'Teleprompter'
  )),                                                                   -- = SERVICOS em src/lib/precos/precos.ts
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 600),
  unit text NOT NULL CHECK (unit IN ('por episódio', 'por dia', 'por projeto', 'por mês', 'por hora', 'por evento')),
  price numeric(12,2) NOT NULL CHECK (price >= 0),                      -- em reais
  min_qty integer NOT NULL DEFAULT 1 CHECK (min_qty BETWEEN 1 AND 1000),
  includes jsonb NOT NULL DEFAULT '[]'::jsonb,                          -- "o que inclui": lista de textos (check abaixo)
  active boolean NOT NULL DEFAULT true,                                 -- false = some das propostas novas
  confirmed boolean NOT NULL DEFAULT false,                             -- false = valor inicial sugerido, confirmar
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Check recriado pelo nome (vale também onde uma versão anterior deste arquivo já rodou).
ALTER TABLE public.ar1_price_items DROP CONSTRAINT IF EXISTS ar1_price_items_includes_check;
ALTER TABLE public.ar1_price_items ADD CONSTRAINT ar1_price_items_includes_check CHECK (
  CASE WHEN jsonb_typeof(includes) = 'array' THEN jsonb_array_length(includes) <= 12 ELSE false END
);                                                                      -- até 12 linhas (LIMITES_PRECO.inclui)
CREATE INDEX IF NOT EXISTS ar1_price_items_service_idx ON public.ar1_price_items(service, sort_order);

DROP TRIGGER IF EXISTS ar1_price_items_updated ON public.ar1_price_items;
CREATE TRIGGER ar1_price_items_updated BEFORE UPDATE ON public.ar1_price_items
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();

-- Quem alterou é sempre quem está logado (o navegador não escolhe o updated_by). Pela chave
-- de serviço (sem usuário), fica o que veio.
CREATE OR REPLACE FUNCTION ar1_private.stamp_price_item_author() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $func$
DECLARE autor uuid := (SELECT auth.uid());
BEGIN
  IF autor IS NOT NULL THEN
    NEW.updated_by := autor;
  END IF;
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION ar1_private.stamp_price_item_author() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ar1_price_items_author ON public.ar1_price_items;
CREATE TRIGGER ar1_price_items_author BEFORE INSERT OR UPDATE ON public.ar1_price_items
  FOR EACH ROW EXECUTE FUNCTION ar1_private.stamp_price_item_author();

ALTER TABLE public.ar1_price_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ar1_price_items_staff ON public.ar1_price_items;       -- rascunho anterior desta migração
DROP POLICY IF EXISTS ar1_price_items_staff_read ON public.ar1_price_items;
DROP POLICY IF EXISTS ar1_price_items_admin_write ON public.ar1_price_items;
CREATE POLICY ar1_price_items_staff_read ON public.ar1_price_items FOR SELECT TO authenticated
  USING ((SELECT ar1_private.is_staff()));
CREATE POLICY ar1_price_items_admin_write ON public.ar1_price_items FOR ALL TO authenticated
  USING ((SELECT ar1_private.is_admin())) WITH CHECK ((SELECT ar1_private.is_admin()));
REVOKE ALL ON TABLE public.ar1_price_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ar1_price_items TO authenticated;
GRANT ALL ON TABLE public.ar1_price_items TO service_role;

COMMENT ON TABLE public.ar1_price_items IS
  'Tabela de preços da AR1. A IA das propostas só escolhe o item e a quantidade; o servidor calcula os valores daqui. confirmed = false: valor sugerido que a equipe ainda não confirmou.';

-- Tabela inicial (valores sugeridos, confirmed = false). Só entra com a tabela vazia. Os ids
-- são fixos para o simulador e os testes usarem os mesmos (scripts/precos-iniciais.mjs).
DO $seed$
BEGIN
IF NOT EXISTS (SELECT 1 FROM public.ar1_price_items) THEN
INSERT INTO public.ar1_price_items (id, service, name, description, unit, price, min_qty, includes, confirmed, sort_order) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Podcast gravado', 'Episódio gravado e editado no estúdio', 'Gravação no estúdio da AR1 com até 4 pessoas na bancada, edição completa e entrega pronta para publicar.', 'por episódio', 1200.00, 1, '["Estúdio com cenário, luz e áudio tratado","3 câmeras com operação","Sincronização de áudio e correção de cor","Edição do episódio completo","Entrega em 4K e versão para YouTube"]'::jsonb, false, 10),
  ('10000000-0000-4000-8000-000000000002', 'Podcast gravado', 'Pacote mensal: 4 episódios gravados e editados', 'Quatro episódios por mês com data fixa no estúdio, para quem quer cadência.', 'por mês', 4000.00, 1, '["4 gravações no estúdio","Edição completa de cada episódio","Agenda fixa mensal","Postagem opcional, combinada à parte"]'::jsonb, false, 20),
  ('10000000-0000-4000-8000-000000000003', 'Podcast gravado', 'Pacote de 5 cortes verticais por episódio', 'Cortes curtos (Reels, Shorts, TikTok) com legenda e identidade do programa.', 'por episódio', 350.00, 1, '["5 cortes de até 90 segundos","Legendas dinâmicas","Capa e título de cada corte"]'::jsonb, false, 30),
  ('10000000-0000-4000-8000-000000000004', 'Podcast ao vivo', 'Episódio ao vivo dirigido', 'Transmissão ao vivo dirigida em tempo real, com gravação simultânea para reaproveitar.', 'por episódio', 1900.00, 1, '["Direção de corte ao vivo","Troca de câmeras, telas e vinhetas","Transmissão para YouTube, Instagram ou plataforma do cliente","Gravação completa em alta qualidade"]'::jsonb, false, 40),
  ('10000000-0000-4000-8000-000000000005', 'Podcast ao vivo', 'Pacote mensal: 4 episódios ao vivo', 'Quatro programas ao vivo por mês, com a mesma equipe e o mesmo cenário.', 'por mês', 6800.00, 1, '["4 transmissões dirigidas","Gravação de todas as edições","Agenda fixa mensal"]'::jsonb, false, 50),
  ('10000000-0000-4000-8000-000000000006', 'Podcast itinerante', 'Diária do estúdio itinerante em evento', 'Estúdio montado dentro da feira, congresso ou evento: cenário, luz, áudio, câmeras e equipe para gravar em série.', 'por dia', 4500.00, 1, '["Cenário com a identidade do evento ou patrocinador","3 câmeras, iluminação e áudio profissional","Equipe de direção e operação no local","Fila de convidados organizada com a produção"]'::jsonb, false, 60),
  ('10000000-0000-4000-8000-000000000007', 'Podcast itinerante', 'Montagem e desmontagem do estúdio no local', 'Transporte, montagem antes do evento e desmontagem ao final.', 'por evento', 2500.00, 1, '["Transporte em Goiânia e região","Montagem no dia anterior","Desmontagem ao final do evento"]'::jsonb, false, 70),
  ('10000000-0000-4000-8000-000000000008', 'Podcast itinerante', 'Edição de episódio gravado no evento', 'Edição de cada conversa gravada no evento, com abertura e identidade.', 'por episódio', 600.00, 1, '["Edição completa","Correção de cor e tratamento de áudio","Entrega para as redes do evento"]'::jsonb, false, 80),
  ('10000000-0000-4000-8000-000000000009', 'Transmissão ao vivo', 'Transmissão ao vivo com 2 câmeras', 'Para palestras, cultos, aulas e eventos de médio porte.', 'por dia', 4800.00, 1, '["2 câmeras com operação","Mesa de corte e inserção de slides","Áudio integrado à mesa do evento","Gravação completa"]'::jsonb, false, 90),
  ('10000000-0000-4000-8000-000000000010', 'Transmissão ao vivo', 'Transmissão ao vivo com 4 câmeras e direção', 'Congressos, shows e eventos corporativos com direção de corte ao vivo.', 'por dia', 8500.00, 1, '["4 câmeras com operação","Direção de corte ao vivo","Inserção de slides, telões e vinhetas","Planejamento técnico de sinal e conexão","Gravação completa"]'::jsonb, false, 100),
  ('10000000-0000-4000-8000-000000000011', 'Transmissão ao vivo', 'Câmera adicional com operador', 'Mais um ponto de vista na transmissão ou na gravação.', 'por dia', 1200.00, 1, '["Câmera e operador por dia"]'::jsonb, false, 110),
  ('10000000-0000-4000-8000-000000000012', 'Leilão 360', 'Leilão 360: pacote base', 'O leilão começa antes do primeiro lote e continua depois do último: aquecimento, transmissão e melhores momentos.', 'por evento', 18000.00, 1, '["Antes: agenda de conteúdo e aquecimento dos lotes","Durante: transmissão multicâmera com direção de corte (1 dia)","Depois: melhores momentos e conteúdos para o próximo ano","Equipe completa no local"]'::jsonb, false, 120),
  ('10000000-0000-4000-8000-000000000013', 'Leilão 360', 'Conteúdo dos lotes antes do leilão (diária de captação)', 'Diária na fazenda para gravar os lotes e os bastidores usados no aquecimento.', 'por dia', 3500.00, 1, '["Captação em campo com 2 câmeras e drone","Edição dos vídeos dos lotes"]'::jsonb, false, 130),
  ('10000000-0000-4000-8000-000000000014', 'Leilão 360', 'Dia extra de transmissão do leilão', 'Para leilões com mais de um dia de pista.', 'por dia', 6500.00, 1, '["Transmissão multicâmera com direção","Gravação completa"]'::jsonb, false, 140),
  ('10000000-0000-4000-8000-000000000015', 'Filme de Legado', 'Filme de Legado: pesquisa, escuta e roteiro', 'Levantamento da história, entrevistas preliminares e roteiro do documentário.', 'por projeto', 9000.00, 1, '["Pesquisa e escuta com a família ou a empresa","Organização do acervo existente","Roteiro e plano de gravação"]'::jsonb, false, 150),
  ('10000000-0000-4000-8000-000000000016', 'Filme de Legado', 'Filme de Legado: diária de captação e entrevistas', 'Gravação dirigida das entrevistas e das imagens do filme.', 'por dia', 4200.00, 1, '["Equipe de direção, câmera e áudio","Iluminação de entrevista","Drone quando o local permitir"]'::jsonb, false, 160),
  ('10000000-0000-4000-8000-000000000017', 'Filme de Legado', 'Filme de Legado: edição, cor e finalização', 'Montagem do filme final para acervo, eventos e relacionamento.', 'por projeto', 14000.00, 1, '["Montagem e narrativa","Correção de cor e mixagem","Trilha licenciada","Versão completa e versão curta"]'::jsonb, false, 170),
  ('10000000-0000-4000-8000-000000000018', 'Filme de marca', 'Filme institucional de marca', 'Filme de até 3 minutos com roteiro, captação em 2 diárias e finalização.', 'por projeto', 16000.00, 1, '["Planejamento e roteiro","2 diárias de captação","Entrevistas e depoimentos","Edição, cor e mixagem","Versões para site e redes"]'::jsonb, false, 180),
  ('10000000-0000-4000-8000-000000000019', 'Filme de marca', 'Diária de captação adicional', 'Mais um dia de gravação com a equipe completa.', 'por dia', 3800.00, 1, '["Equipe de câmera, áudio e direção","Iluminação"]'::jsonb, false, 190),
  ('10000000-0000-4000-8000-000000000020', 'Fotografia', 'Diária de fotografia', 'Fotografia de produto, equipe, evento ou propriedade, com tratamento.', 'por dia', 2400.00, 1, '["Fotógrafo com equipamento profissional","Até 80 fotos tratadas","Entrega em alta e para redes"]'::jsonb, false, 200),
  ('10000000-0000-4000-8000-000000000021', 'Shows/DVDs/clipes', 'Gravação de show ou DVD multicâmera', 'Captação multicâmera do show, bastidores e edição do produto final.', 'por evento', 22000.00, 1, '["Até 6 câmeras com operação","Captação de áudio multipista","Bastidores e entrevistas","Edição e finalização do DVD ou especial"]'::jsonb, false, 210),
  ('10000000-0000-4000-8000-000000000022', 'Shows/DVDs/clipes', 'Clipe musical', 'Clipe com roteiro, 1 diária de captação e finalização.', 'por projeto', 12000.00, 1, '["Roteiro e direção","1 diária de captação","Edição, cor e efeitos","Versões horizontal e vertical"]'::jsonb, false, 220),
  ('10000000-0000-4000-8000-000000000023', 'Conteúdo recorrente', 'Plano mensal de conteúdo: 4 vídeos e cortes', 'Método e cadência para organizações que têm conhecimento relevante para compartilhar.', 'por mês', 5500.00, 1, '["Diagnóstico editorial e calendário","1 diária de captação por mês","4 vídeos editados","8 cortes verticais","Fotos de apoio"]'::jsonb, false, 230),
  ('10000000-0000-4000-8000-000000000024', 'Consultoria de estúdio', 'Consultoria: diagnóstico', 'Objetivo, público, formatos, equipe e espaço: o que o estúdio precisa ser.', 'por projeto', 3500.00, 1, '["Reunião de diagnóstico","Visita ao espaço","Relatório com recomendações"]'::jsonb, false, 240),
  ('10000000-0000-4000-8000-000000000025', 'Consultoria de estúdio', 'Consultoria: projeto técnico e especificação', 'Arquitetura técnica, acústica, luz, áudio e vídeo, com a lista de equipamentos para decisão de compra.', 'por projeto', 7500.00, 1, '["Projeto técnico do estúdio","Especificação de equipamentos e softwares","Aproveitamento do que o cliente já tem"]'::jsonb, false, 250),
  ('10000000-0000-4000-8000-000000000026', 'Consultoria de estúdio', 'Consultoria: implantação, testes e treinamento', 'Acompanhamento da montagem, testes e treinamento da equipe do cliente.', 'por projeto', 9000.00, 1, '["Acompanhamento da implantação","Testes de gravação e transmissão","Treinamento da equipe","Suporte no primeiro mês"]'::jsonb, false, 260),
  ('10000000-0000-4000-8000-000000000027', 'Locação do Haras SOBI', 'Diária: cenários externos (bosque, lago e pista)', 'Locação dos cenários externos para gravações e ensaios.', 'por dia', 6000.00, 1, '["Acesso aos cenários externos","Apoio da equipe do Haras","Estacionamento e apoio elétrico"]'::jsonb, false, 270),
  ('10000000-0000-4000-8000-000000000028', 'Locação do Haras SOBI', 'Diária: área coberta e salão de eventos', 'Área coberta e salão para eventos, gravações e transmissões.', 'por dia', 12000.00, 1, '["Área coberta e salão","Lounge coberto com cenografia","Apoio da equipe do Haras"]'::jsonb, false, 280),
  ('10000000-0000-4000-8000-000000000029', 'Locação do Haras SOBI', 'Diária: locação completa do Haras', 'Todos os cenários, a área coberta para até 4 mil pessoas e a pista de laço.', 'por dia', 20000.00, 1, '["Mais de 20 cenários em uma única locação","Área coberta e pista de laço","Apoio da equipe do Haras"]'::jsonb, false, 290),
  ('10000000-0000-4000-8000-000000000030', 'Teleprompter', 'Teleprompter: diária avulsa', 'Equipamento profissional com tela de alto brilho e software intuitivo.', 'por dia', 450.00, 1, '["Teleprompter e suporte","Software e tablet","Entrega e retirada em Goiânia"]'::jsonb, false, 300),
  ('10000000-0000-4000-8000-000000000031', 'Teleprompter', 'Teleprompter: diária com operador', 'O equipamento com um operador da AR1 durante toda a gravação ou transmissão.', 'por dia', 900.00, 1, '["Teleprompter e suporte","Operador durante o uso","Preparação do texto"]'::jsonb, false, 310)
ON CONFLICT (id) DO NOTHING;
END IF;
END
$seed$;

-- 2. Propostas premium -------------------------------------------------------------------
ALTER TABLE public.ar1_proposals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf', 'premium')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'gerada'
    CHECK (status IN ('rascunho', 'gerada', 'enviada', 'aceita', 'recusada')),
  ADD COLUMN IF NOT EXISTS service text CHECK (service IS NULL OR char_length(service) <= 100),
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE,                  -- /p/<token>: 43 caracteres base64url (check abaixo)
  ADD COLUMN IF NOT EXISTS public_days smallint NOT NULL DEFAULT 30 CHECK (public_days BETWEEN 1 AND 365),
  ADD COLUMN IF NOT EXISTS public_expires_at timestamptz,             -- NULL = link sem vencimento
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,                   -- aceite pela página pública
  ADD COLUMN IF NOT EXISTS accepted_name text CHECK (accepted_name IS NULL OR char_length(accepted_name) <= 200),
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,                    -- aceita/recusada marcada pela equipe
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unconfirmed_prices boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_engine text CHECK (pdf_engine IS NULL OR pdf_engine IN ('chrome', 'pdf-lib')),
  ADD COLUMN IF NOT EXISTS pdf_error text CHECK (pdf_error IS NULL OR char_length(pdf_error) <= 500),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- O PDF passa a ser opcional só para a premium (nasce sem PDF; "Gerar PDF" é um passo à parte).
-- A premium tem uma lâmina por seção: o limite de páginas sobe de 3 para 60.
ALTER TABLE public.ar1_proposals ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE public.ar1_proposals DROP CONSTRAINT IF EXISTS ar1_proposals_pdf_file_check;
ALTER TABLE public.ar1_proposals ADD CONSTRAINT ar1_proposals_pdf_file_check
  CHECK (kind = 'premium' OR file_path IS NOT NULL);
-- Token só com os caracteres que a página aceita (TOKEN_VALIDO em premium/publico.ts). Check
-- recriado pelo nome, como o de páginas.
ALTER TABLE public.ar1_proposals DROP CONSTRAINT IF EXISTS ar1_proposals_public_token_check;
ALTER TABLE public.ar1_proposals ADD CONSTRAINT ar1_proposals_public_token_check
  CHECK (public_token IS NULL OR public_token ~ '^[A-Za-z0-9_-]{32,128}$');
ALTER TABLE public.ar1_proposals DROP CONSTRAINT IF EXISTS ar1_proposals_pages_check;
ALTER TABLE public.ar1_proposals ADD CONSTRAINT ar1_proposals_pages_check
  CHECK (pages IS NULL OR pages BETWEEN 1 AND 60);

-- Propostas em PDF já enviadas pelo WhatsApp: situação "enviada" (as demais ficam "gerada").
UPDATE public.ar1_proposals SET status = 'enviada'
WHERE kind = 'pdf' AND status = 'gerada' AND sent_at IS NOT NULL;

-- Lista da aba Propostas (filtro por situação, mais novas primeiro). O token já tem o índice
-- do UNIQUE; um índice parcial a mais só custaria escrita.
CREATE INDEX IF NOT EXISTS ar1_proposals_status_idx ON public.ar1_proposals(status, created_at DESC);
DROP INDEX IF EXISTS public.ar1_proposals_token_idx;                    -- rascunho anterior desta migração

-- updated_at = última alteração da proposta. A visita do cliente (views, first/last_viewed_at)
-- não conta como alteração.
CREATE OR REPLACE FUNCTION ar1_private.touch_proposal_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $func$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['views', 'first_viewed_at', 'last_viewed_at', 'updated_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['views', 'first_viewed_at', 'last_viewed_at', 'updated_at']) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION ar1_private.touch_proposal_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ar1_proposals_updated ON public.ar1_proposals;
CREATE TRIGGER ar1_proposals_updated BEFORE UPDATE ON public.ar1_proposals
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_proposal_updated_at();

COMMENT ON COLUMN public.ar1_proposals.unconfirmed_prices IS
  'Aviso INTERNO: a proposta usa itens da tabela de preços ainda não confirmados. Nunca mostrar ao cliente.';
COMMENT ON COLUMN public.ar1_proposals.pdf_error IS
  'Motivo INTERNO da falha do Chrome quando o PDF saiu pela reserva (pdf-lib). Nunca mostrar ao cliente.';
COMMENT ON COLUMN public.ar1_proposals.public_token IS
  'Token da página pública /p/<token> (sem login). A página é servida pelo servidor com a chave de serviço; anon não lê a tabela.';

-- 3. Visita do cliente, contada num único UPDATE ------------------------------------------
-- Uso no servidor: supabaseServico().rpc('ar1_register_proposal_view', { p_id: proposta.id }).
-- Devolve o total de visitas depois desta (NULL se o id não for de uma proposta premium).
CREATE OR REPLACE FUNCTION public.ar1_register_proposal_view(p_id uuid) RETURNS integer
LANGUAGE sql SET search_path = '' AS $func$
  UPDATE public.ar1_proposals
  SET views = views + 1,
      first_viewed_at = COALESCE(first_viewed_at, now()),
      last_viewed_at = now()
  WHERE id = p_id AND kind = 'premium'
  RETURNING views;
$func$;
REVOKE ALL ON FUNCTION public.ar1_register_proposal_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ar1_register_proposal_view(uuid) TO service_role;

-- 4. Oportunidade sem telefone (cliente digitado na Nova proposta, sem WhatsApp) ----------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ar1_quote_requests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%phone%'
  LOOP
    EXECUTE format('ALTER TABLE public.ar1_quote_requests DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ar1_quote_requests ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.ar1_quote_requests ADD CONSTRAINT ar1_quote_requests_phone_check
  CHECK (phone IS NULL OR char_length(btrim(phone)) BETWEEN 8 AND 32);

-- 5. Imagens da proposta (logo e fotos do cliente) no bucket privado ar1-context ----------
-- Acrescenta os tipos que faltam, sem tirar nenhum dos que já estão lá.
UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY(
  SELECT m FROM unnest(ARRAY['image/png', 'image/jpeg', 'image/webp']) AS m
  WHERE m <> ALL (allowed_mime_types)
)
WHERE id = 'ar1-context' AND allowed_mime_types IS NOT NULL;

COMMIT;
