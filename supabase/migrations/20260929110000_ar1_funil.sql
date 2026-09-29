-- AR1 Films: funil de vendas (oportunidades) e follow-ups sugeridos pela IA.
-- Reaproveita public.ar1_quote_requests como "oportunidade": o pedido do site e o do WhatsApp caem no mesmo funil.
-- Depende de 20260928100000_ar1_atendimento.sql.
BEGIN;

-- 1. Oportunidades: novas etapas e campos comerciais ---------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ar1_quote_requests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%' AND pg_get_constraintdef(oid) ILIKE '%contacting%'
  LOOP
    EXECUTE format('ALTER TABLE public.ar1_quote_requests DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ar1_quote_requests
  ADD CONSTRAINT ar1_quote_requests_status_check
    CHECK (status IN ('new', 'qualified', 'contacting', 'proposal', 'negotiating', 'won', 'lost'));

ALTER TABLE public.ar1_quote_requests
  ADD COLUMN contact_id uuid REFERENCES public.ar1_wa_contacts(id) ON DELETE SET NULL,
  ADD COLUMN source text NOT NULL DEFAULT 'site' CHECK (source IN ('site', 'whatsapp', 'indicacao', 'outro')),
  ADD COLUMN estimated_value numeric(12,2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  ADD COLUMN probability smallint CHECK (probability IS NULL OR probability BETWEEN 0 AND 100),
  ADD COLUMN next_action text CHECK (char_length(next_action) <= 500),
  ADD COLUMN next_action_at timestamptz,
  ADD COLUMN lost_reason text CHECK (char_length(lost_reason) <= 500),
  ADD COLUMN ai_notes text CHECK (char_length(ai_notes) <= 2000),          -- leitura da IA sobre a oportunidade
  ADD COLUMN stage_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN closed_at timestamptz;
UPDATE public.ar1_quote_requests SET source = 'whatsapp' WHERE source_path = 'whatsapp';
CREATE INDEX ar1_quotes_contact_idx ON public.ar1_quote_requests(contact_id);
CREATE INDEX ar1_quotes_next_action_idx ON public.ar1_quote_requests(next_action_at) WHERE next_action_at IS NOT NULL;

CREATE FUNCTION ar1_private.on_quote_stage() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $func$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.stage_changed_at := now();
    NEW.closed_at := CASE WHEN NEW.status IN ('won', 'lost') THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$func$;
CREATE TRIGGER ar1_quotes_stage BEFORE UPDATE ON public.ar1_quote_requests
  FOR EACH ROW EXECUTE FUNCTION ar1_private.on_quote_stage();
REVOKE ALL ON FUNCTION ar1_private.on_quote_stage() FROM PUBLIC, anon, authenticated;

-- 2. Follow-ups: quem ficou sem resposta e a mensagem pronta para aprovar ------------------------------
CREATE TABLE public.ar1_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.ar1_wa_contacts(id) ON DELETE CASCADE,
  atendimento_id uuid REFERENCES public.ar1_atendimentos(id) ON DELETE CASCADE,
  quote_request_id uuid REFERENCES public.ar1_quote_requests(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),      -- por que a IA sugere retomar
  suggested_text text NOT NULL CHECK (char_length(suggested_text) BETWEEN 1 AND 5000),
  priority text NOT NULL DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baixa')),
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'adiado', 'descartado')),
  final_text text CHECK (char_length(final_text) <= 5000),
  outbox_id uuid REFERENCES public.ar1_wa_outbox(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  decided_at timestamptz,
  model text CHECK (char_length(model) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ar1_followups_status_idx ON public.ar1_followups(status, due_at);
CREATE UNIQUE INDEX ar1_followups_one_pending_idx ON public.ar1_followups(contact_id) WHERE status = 'pendente';
CREATE TRIGGER ar1_followups_updated BEFORE UPDATE ON public.ar1_followups
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();

ALTER TABLE public.ar1_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar1_followups_staff ON public.ar1_followups FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
REVOKE ALL ON TABLE public.ar1_followups FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ar1_followups TO authenticated;
GRANT ALL ON TABLE public.ar1_followups TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.ar1_quote_requests, public.ar1_followups;

COMMIT;
