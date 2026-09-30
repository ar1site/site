-- AR1 Films: propostas comerciais em PDF (rascunho da IA, revisão de uma pessoa, PDF guardado).
-- Depende de 20260929110000_ar1_funil.sql (ar1_quote_requests como oportunidade) e de
-- 20260929100000_ar1_contexto.sql (bucket privado ar1-context, que já aceita application/pdf).
-- Os arquivos ficam em ar1-context, no caminho propostas/<oportunidade>/<numero>.pdf.
-- Transacional; falha se algum objeto já existir, em vez de sobrescrever.
BEGIN;

CREATE TABLE public.ar1_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id uuid NOT NULL REFERENCES public.ar1_quote_requests(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.ar1_wa_contacts(id) ON DELETE SET NULL,
  atendimento_id uuid REFERENCES public.ar1_atendimentos(id) ON DELETE SET NULL,
  number text NOT NULL UNIQUE CHECK (number ~ '^AR1-[0-9]{8}-[0-9]{4}$'),      -- AR1-AAAAMMDD-XXXX
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  content jsonb NOT NULL,                                                       -- conteúdo aprovado, como saiu no PDF
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,                                   -- "Baseado em: ..."
  total numeric(12,2) CHECK (total IS NULL OR total >= 0),                      -- soma dos itens com valor; NULL = a definir
  pending_items smallint NOT NULL DEFAULT 0 CHECK (pending_items >= 0),         -- itens "a definir"
  valid_until date NOT NULL,
  file_path text NOT NULL UNIQUE CHECK (char_length(file_path) BETWEEN 1 AND 500), -- caminho no bucket ar1-context
  file_size integer CHECK (file_size IS NULL OR file_size >= 0),
  pages smallint CHECK (pages IS NULL OR pages BETWEEN 1 AND 3),
  model text CHECK (char_length(model) <= 100),                                 -- modelo do rascunho; NULL = sem IA
  created_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,                                                          -- link enviado pelo WhatsApp
  sent_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  outbox_id uuid REFERENCES public.ar1_wa_outbox(id) ON DELETE SET NULL
);
CREATE INDEX ar1_proposals_quote_idx ON public.ar1_proposals(quote_request_id, created_at DESC);
CREATE INDEX ar1_proposals_contact_idx ON public.ar1_proposals(contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE public.ar1_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar1_proposals_staff ON public.ar1_proposals FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
REVOKE ALL ON TABLE public.ar1_proposals FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ar1_proposals TO authenticated;
GRANT ALL ON TABLE public.ar1_proposals TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.ar1_proposals;

COMMIT;
