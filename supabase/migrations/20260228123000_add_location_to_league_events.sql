DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'league_events'
  ) THEN
    RAISE EXCEPTION 'Tabela public.league_events não encontrada.';
  END IF;
END
$$;

ALTER TABLE public.league_events
  ADD COLUMN IF NOT EXISTS location TEXT;

UPDATE public.league_events
SET location = 'A definir'
WHERE location IS NULL
  OR trim(location) = '';

ALTER TABLE public.league_events
  ALTER COLUMN location SET NOT NULL;
