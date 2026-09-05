ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_updated_at_timestamp_on_matches ON public.matches;

CREATE TRIGGER set_updated_at_timestamp_on_matches
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();
