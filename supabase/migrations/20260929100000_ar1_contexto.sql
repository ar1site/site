-- AR1 Films: contexto para a IA (base de conhecimento da empresa + contexto por cliente).
-- Depende de 20260928100000_ar1_atendimento.sql.
BEGIN;

CREATE TABLE public.ar1_context_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'contact')),          -- global = base da AR1; contact = só deste cliente
  contact_id uuid REFERENCES public.ar1_wa_contacts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('text', 'file')),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 300000),  -- texto digitado ou extraído do arquivo
  content_truncated boolean NOT NULL DEFAULT false,                    -- o arquivo era maior que o limite
  file_path text CHECK (char_length(file_path) <= 500),                -- caminho no bucket ar1-context
  file_name text CHECK (char_length(file_name) <= 300),
  file_mime text CHECK (char_length(file_mime) <= 150),
  file_size integer CHECK (file_size IS NULL OR file_size >= 0),
  active boolean NOT NULL DEFAULT true,                                -- usar na IA
  created_by uuid REFERENCES public.ar1_staff(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'contact') = (contact_id IS NOT NULL)),
  CHECK ((kind = 'file') = (file_path IS NOT NULL))
);
CREATE INDEX ar1_context_docs_scope_idx ON public.ar1_context_docs(scope, active, updated_at DESC);
CREATE INDEX ar1_context_docs_contact_idx ON public.ar1_context_docs(contact_id) WHERE contact_id IS NOT NULL;
CREATE TRIGGER ar1_context_docs_updated BEFORE UPDATE ON public.ar1_context_docs
  FOR EACH ROW EXECUTE FUNCTION ar1_private.touch_updated_at();

ALTER TABLE public.ar1_context_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar1_context_docs_staff ON public.ar1_context_docs FOR ALL TO authenticated
  USING (ar1_private.is_staff()) WITH CHECK (ar1_private.is_staff());
REVOKE ALL ON TABLE public.ar1_context_docs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ar1_context_docs TO authenticated;
GRANT ALL ON TABLE public.ar1_context_docs TO service_role;

-- Arquivos originais (PDF, Word, texto) em espaço privado; o envio passa pelo servidor.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ar1-context', 'ar1-context', false, 26214400, ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/markdown', 'text/csv'
]);
CREATE POLICY ar1_context_files_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ar1-context' AND ar1_private.is_staff());

COMMIT;
