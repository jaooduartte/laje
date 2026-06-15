ALTER TABLE public.sports
  ADD COLUMN IF NOT EXISTS default_match_duration_minutes INTEGER;

UPDATE public.sports
SET default_match_duration_minutes = CASE
  WHEN lower(public.normalize_sport_name(name)) = 'beach soccer' THEN 30
  WHEN lower(public.normalize_sport_name(name)) = 'beach tennis' THEN 35
  WHEN lower(public.normalize_sport_name(name)) = 'volei de praia' THEN 45
  WHEN lower(public.normalize_sport_name(name)) = 'futevolei' THEN 40
  WHEN lower(public.normalize_sport_name(name)) = 'futebol society' THEN 30
  ELSE COALESCE(default_match_duration_minutes, 35)
END
WHERE default_match_duration_minutes IS NULL;

ALTER TABLE public.sports
  ALTER COLUMN default_match_duration_minutes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sports_default_match_duration_positive'
      AND conrelid = 'public.sports'::regclass
  ) THEN
    ALTER TABLE public.sports
      ADD CONSTRAINT sports_default_match_duration_positive
      CHECK (default_match_duration_minutes > 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.sports.default_match_duration_minutes IS 'Duração padrão da partida em minutos para a modalidade.';

UPDATE public.championship_sports AS championship_sports_table
SET default_match_duration_minutes = sports_table.default_match_duration_minutes
FROM public.sports AS sports_table
WHERE sports_table.id = championship_sports_table.sport_id
  AND championship_sports_table.default_match_duration_minutes IS DISTINCT FROM sports_table.default_match_duration_minutes;

ALTER TABLE public.championship_sports
  ALTER COLUMN default_match_duration_minutes DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.apply_sport_default_match_duration_to_championship_sport()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.default_match_duration_minutes IS NULL THEN
    SELECT sports_table.default_match_duration_minutes
    INTO NEW.default_match_duration_minutes
    FROM public.sports AS sports_table
    WHERE sports_table.id = NEW.sport_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS championship_sports_apply_sport_default_match_duration_before_write
  ON public.championship_sports;

CREATE TRIGGER championship_sports_apply_sport_default_match_duration_before_write
BEFORE INSERT OR UPDATE OF sport_id, default_match_duration_minutes
ON public.championship_sports
FOR EACH ROW
EXECUTE FUNCTION public.apply_sport_default_match_duration_to_championship_sport();

CREATE OR REPLACE FUNCTION public.sync_sport_default_match_duration_to_championship_sports()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.championship_sports
  SET default_match_duration_minutes = NEW.default_match_duration_minutes
  WHERE sport_id = NEW.id
    AND default_match_duration_minutes IS DISTINCT FROM NEW.default_match_duration_minutes;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sports_sync_default_match_duration_to_championship_sports_after_update
  ON public.sports;

CREATE TRIGGER sports_sync_default_match_duration_to_championship_sports_after_update
AFTER UPDATE OF default_match_duration_minutes
ON public.sports
FOR EACH ROW
WHEN (OLD.default_match_duration_minutes IS DISTINCT FROM NEW.default_match_duration_minutes)
EXECUTE FUNCTION public.sync_sport_default_match_duration_to_championship_sports();
