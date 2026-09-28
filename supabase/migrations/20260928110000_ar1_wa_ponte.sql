-- AR1 Films: fila de envio (outbox) e mídia do WhatsApp para a ponte local (Evolution API).
-- Depende de 20260928100000_ar1_atendimento.sql.
BEGIN;

-- 1. Fila de envio: o painel enfileira, a ponte envia pelo WhatsApp e devolve o resultado ------------
CREATE TABLE public.ar1_wa_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id uuid NOT NULL REFERENCES public.ar1_atendimentos(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.ar1_wa_contacts(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^[0-9]{8,20}$'),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 5000),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  error text CHECK (char_length(error) <= 1000),
  external_id text CHECK (char_length(external_id) <= 200),           -- id da mensagem no WhatsApp após o envio
  suggestion_id uuid REFERENCES public.ar1_ai_suggestions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX ar1_wa_outbox_status_idx ON public.ar1_wa_outbox(status, created_at) WHERE status IN ('queued', 'sending');
CREATE INDEX ar1_wa_outbox_atend_idx ON public.ar1_wa_outbox(atendimento_id, created_at DESC);
CREATE TRIGGER ar1_wa_outbox_updated BEFORE UPDATE ON public.ar1_wa_outbox
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();

ALTER TABLE public.ar1_wa_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar1_wa_outbox_staff ON public.ar1_wa_outbox FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
REVOKE ALL ON TABLE public.ar1_wa_outbox FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ar1_wa_outbox TO authenticated;
GRANT ALL ON TABLE public.ar1_wa_outbox TO service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ar1_wa_outbox;

-- 2. Mídia recebida/enviada (fotos, áudios, documentos) em espaço privado --------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ar1-wa-media', 'ar1-wa-media', false, 26214400, NULL);
CREATE POLICY ar1_wa_media_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ar1-wa-media' AND ar1_private.is_staff());

COMMIT;
