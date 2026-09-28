-- AR1 Films: atendimento por WhatsApp com apoio de IA.
-- Depende de 20260831140000_ar1_foundation.sql (ar1_staff, ar1_clients, ar1_quote_requests, ar1_private.*).
-- Transacional; falha se algum objeto já existir, em vez de sobrescrever.
BEGIN;

-- 1. Contatos do WhatsApp -------------------------------------------------------
CREATE TABLE public.ar1_wa_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{8,20}$'),          -- só dígitos, com DDI (5562...)
  wa_name text CHECK (char_length(wa_name) <= 200),                    -- nome que o contato usa no WhatsApp
  display_name text CHECK (char_length(display_name) <= 200),          -- nome corrigido pela equipe
  company text CHECK (char_length(company) <= 200),
  photo_url text CHECK (char_length(photo_url) <= 1000),
  client_id uuid REFERENCES public.ar1_clients(id) ON DELETE SET NULL,
  notes text CHECK (char_length(notes) <= 5000),
  blocked boolean NOT NULL DEFAULT false,                              -- spam: não cria atendimento
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Atendimentos (uma conversa aberta por contato) ------------------------------
CREATE TABLE public.ar1_atendimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.ar1_wa_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'em_atendimento', 'aguardando_cliente', 'fechado')),
  outcome text CHECK (outcome IN ('orcamento', 'agendado', 'sem_interesse', 'spam', 'outro')),
  assigned_to uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  quote_request_id uuid REFERENCES public.ar1_quote_requests(id) ON DELETE SET NULL,
  -- análise da IA
  ai_kind text CHECK (ai_kind IN ('lead', 'cliente', 'fornecedor', 'pessoal', 'spam', 'indefinido')),
  ai_service text CHECK (char_length(ai_service) <= 100),
  ai_urgency text CHECK (ai_urgency IN ('alta', 'media', 'baixa')),
  ai_summary text CHECK (char_length(ai_summary) <= 2000),
  ai_extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_analyzed_at timestamptz,
  ai_analysis_due_at timestamptz,                                      -- agendamento com espera curta
  ai_error text CHECK (char_length(ai_error) <= 1000),
  -- contadores mantidos por gatilho
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ar1_atendimentos_open_idx ON public.ar1_atendimentos(contact_id) WHERE status <> 'fechado';
CREATE INDEX ar1_atendimentos_status_idx ON public.ar1_atendimentos(status, last_message_at DESC);
CREATE INDEX ar1_atendimentos_due_idx ON public.ar1_atendimentos(ai_analysis_due_at) WHERE ai_analysis_due_at IS NOT NULL;

-- 3. Mensagens -----------------------------------------------------------------
CREATE TABLE public.ar1_wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid NOT NULL REFERENCES public.ar1_atendimentos(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.ar1_wa_contacts(id) ON DELETE CASCADE,
  external_id text UNIQUE CHECK (char_length(external_id) <= 200),    -- id da mensagem no WhatsApp
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  sent_by text NOT NULL DEFAULT 'contato' CHECK (sent_by IN ('contato', 'celular', 'sistema')),
  sent_by_user uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'text'
    CHECK (kind IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'other')),
  body text CHECK (char_length(body) <= 20000),                        -- texto ou legenda
  media_url text CHECK (char_length(media_url) <= 2000),
  media_mime text CHECK (char_length(media_mime) <= 100),
  media_name text CHECK (char_length(media_name) <= 300),
  transcript text CHECK (char_length(transcript) <= 20000),            -- áudio transcrito (fase 2)
  sent_at timestamptz NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ar1_wa_messages_atend_idx ON public.ar1_wa_messages(atendimento_id, sent_at);
CREATE INDEX ar1_wa_messages_contact_idx ON public.ar1_wa_messages(contact_id, sent_at DESC);

-- 4. Sugestões da IA -------------------------------------------------------------
CREATE TABLE public.ar1_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid NOT NULL REFERENCES public.ar1_atendimentos(id) ON DELETE CASCADE,
  reply text NOT NULL CHECK (char_length(reply) BETWEEN 1 AND 5000),
  rationale text CHECK (char_length(rationale) <= 2000),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'editada', 'descartada', 'substituida')),
  final_text text CHECK (char_length(final_text) <= 5000),
  decided_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  decided_at timestamptz,
  message_id uuid REFERENCES public.ar1_wa_messages(id) ON DELETE SET NULL,
  model text CHECK (char_length(model) <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ar1_ai_suggestions_atend_idx ON public.ar1_ai_suggestions(atendimento_id, created_at DESC);

-- 5. Configurações e registro de eventos -----------------------------------------
CREATE TABLE public.ar1_settings (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 100),
  value jsonb NOT NULL,
  updated_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ar1_settings (key, value) VALUES
  ('atendimento.instrucoes', to_jsonb(
    'Você atende pela AR1 Films, produtora audiovisual de Goiânia (GO) que atende todo o Brasil. ' ||
    'Tom: direto, cordial, profissional, sem gírias e sem emojis em excesso. Trate por "você". ' ||
    'Nunca prometa preço, data ou disponibilidade: diga que a equipe confirma. ' ||
    'Quando faltar informação para orçar, pergunte o essencial em uma mensagem curta: qual serviço, data prevista, cidade/local e para quem é o conteúdo. ' ||
    'Assine como "Equipe AR1 Films".'::text)),
  ('atendimento.servicos', '["Gravação de podcast (gravado ou ao vivo)","Podcast itinerante em evento","Transmissão ao vivo","Leilão 360","Filme de marca ou legado","Shows, DVDs e clipes","Fotografia e vídeo","Consultoria e implantação de estúdio","Locação do Haras SOBI","Aluguel de teleprompter","Conteúdo recorrente","Outro"]'::jsonb),
  ('whatsapp.status', '{"connected": null, "checked_at": null}'::jsonb);

CREATE TABLE public.ar1_wa_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (char_length(kind) <= 100),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ar1_wa_events_created_idx ON public.ar1_wa_events(created_at DESC);

-- 6. Gatilhos --------------------------------------------------------------------
CREATE TRIGGER ar1_wa_contacts_updated BEFORE UPDATE ON public.ar1_wa_contacts
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();
CREATE TRIGGER ar1_atendimentos_updated BEFORE UPDATE ON public.ar1_atendimentos
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();

-- Cada mensagem nova atualiza o atendimento: contadores, "de quem é a vez" e agendamento da análise.
CREATE FUNCTION ar1_private.on_wa_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
BEGIN
  IF NEW.direction = 'in' THEN
    UPDATE public.ar1_atendimentos SET
      last_message_at = GREATEST(COALESCE(last_message_at, NEW.sent_at), NEW.sent_at),
      last_inbound_at = GREATEST(COALESCE(last_inbound_at, NEW.sent_at), NEW.sent_at),
      unread_count = unread_count + 1,
      status = CASE WHEN status = 'aguardando_cliente' THEN 'em_atendimento' ELSE status END,
      ai_analysis_due_at = now() + interval '40 seconds'
    WHERE id = NEW.atendimento_id;
  ELSE
    UPDATE public.ar1_atendimentos SET
      last_message_at = GREATEST(COALESCE(last_message_at, NEW.sent_at), NEW.sent_at),
      last_outbound_at = GREATEST(COALESCE(last_outbound_at, NEW.sent_at), NEW.sent_at),
      unread_count = 0,
      status = CASE WHEN status IN ('novo', 'em_atendimento') THEN 'aguardando_cliente' ELSE status END
    WHERE id = NEW.atendimento_id;
    -- resposta enviada (pelo celular ou pelo sistema) torna obsoleta a sugestão pendente
    UPDATE public.ar1_ai_suggestions SET status = 'substituida'
    WHERE atendimento_id = NEW.atendimento_id AND status = 'pendente' AND (NEW.sent_by = 'celular' OR message_id IS NULL);
  END IF;
  RETURN NEW;
END;
$func$;
CREATE TRIGGER ar1_wa_messages_after_insert AFTER INSERT ON public.ar1_wa_messages
  FOR EACH ROW EXECUTE FUNCTION ar1_private.on_wa_message();

-- Todo usuário criado no painel do Supabase vira equipe (o cadastro público fica desligado).
CREATE FUNCTION ar1_private.on_auth_user_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $func$
BEGIN
  INSERT INTO public.ar1_staff (user_id, role, active) VALUES (NEW.id, 'admin', true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$func$;
CREATE TRIGGER ar1_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION ar1_private.on_auth_user_created();
-- Usuários que já existiam antes deste gatilho:
INSERT INTO public.ar1_staff (user_id, role, active)
  SELECT id, 'admin', true FROM auth.users ON CONFLICT (user_id) DO NOTHING;

REVOKE ALL ON FUNCTION ar1_private.on_wa_message(), ar1_private.on_auth_user_created() FROM PUBLIC, anon, authenticated;

-- 7. Permissões: só equipe lê e escreve; visitante anônimo não vê nada ----------------
ALTER TABLE public.ar1_wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar1_wa_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar1_wa_contacts_staff ON public.ar1_wa_contacts FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
CREATE POLICY ar1_atendimentos_staff ON public.ar1_atendimentos FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
CREATE POLICY ar1_wa_messages_staff ON public.ar1_wa_messages FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
CREATE POLICY ar1_ai_suggestions_staff ON public.ar1_ai_suggestions FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
CREATE POLICY ar1_settings_staff_read ON public.ar1_settings FOR SELECT TO authenticated
  USING (ar1_private.is_staff());
CREATE POLICY ar1_settings_admin_write ON public.ar1_settings FOR ALL TO authenticated
  USING (ar1_private.is_admin()) WITH CHECK (ar1_private.is_admin());
CREATE POLICY ar1_wa_events_admin_read ON public.ar1_wa_events FOR SELECT TO authenticated
  USING (ar1_private.is_admin());

REVOKE ALL ON TABLE public.ar1_wa_contacts, public.ar1_atendimentos, public.ar1_wa_messages,
  public.ar1_ai_suggestions, public.ar1_settings, public.ar1_wa_events FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ar1_wa_contacts, public.ar1_atendimentos,
  public.ar1_wa_messages, public.ar1_ai_suggestions, public.ar1_settings TO authenticated;
GRANT SELECT ON TABLE public.ar1_wa_events TO authenticated;
GRANT ALL ON TABLE public.ar1_wa_contacts, public.ar1_atendimentos, public.ar1_wa_messages,
  public.ar1_ai_suggestions, public.ar1_settings, public.ar1_wa_events TO service_role;

-- 8. Tempo real para o painel ---------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.ar1_atendimentos, public.ar1_wa_messages, public.ar1_ai_suggestions;

COMMIT;
