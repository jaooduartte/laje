DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sports'
  ) THEN
    RAISE EXCEPTION 'Tabela public.sports não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
  ) THEN
    RAISE EXCEPTION 'Tabela public.championship_sports não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_sport_tie_breaker_rule'
  ) THEN
    RAISE EXCEPTION 'Enum public.championship_sport_tie_breaker_rule não encontrado.';
  END IF;
END
$$;

INSERT INTO public.sports (name)
SELECT platform_sports_table.name
FROM (
  VALUES
    ('Beach Soccer'),
    ('Beach Tennis'),
    ('Futevôlei'),
    ('Vôlei de Praia')
) AS platform_sports_table(name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sports AS sports_table
  WHERE lower(sports_table.name) = lower(platform_sports_table.name)
);

CREATE OR REPLACE FUNCTION public.resolve_championship_sport_supports_cards(sport_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_sport_name TEXT;
BEGIN
  normalized_sport_name := lower(
    translate(
      COALESCE(sport_name, ''),
      'ÁÀÃÂÉÈÊÍÌÎÓÒÕÔÚÙÛÇáàãâéèêíìîóòõôúùûç',
      'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
    )
  );

  RETURN normalized_sport_name LIKE '%beach soccer%';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_championship_sport_tie_breaker_rule(sport_name TEXT)
RETURNS public.championship_sport_tie_breaker_rule
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_sport_name TEXT;
BEGIN
  normalized_sport_name := lower(
    translate(
      COALESCE(sport_name, ''),
      'ÁÀÃÂÉÈÊÍÌÎÓÒÕÔÚÙÛÇáàãâéèêíìîóòõôúùûç',
      'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
    )
  );

  IF normalized_sport_name LIKE '%beach soccer%' THEN
    RETURN 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule;
  END IF;

  IF normalized_sport_name LIKE '%beach tennis%' THEN
    RETURN 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule;
  END IF;

  IF normalized_sport_name LIKE '%volei de praia%' THEN
    RETURN 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
  END IF;

  IF normalized_sport_name LIKE '%futevolei%' THEN
    RETURN 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
  END IF;

  RETURN 'STANDARD'::public.championship_sport_tie_breaker_rule;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_championship_sport_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_sport_name TEXT;
BEGIN
  SELECT sports_table.name
  INTO championship_sport_name
  FROM public.sports AS sports_table
  WHERE sports_table.id = NEW.sport_id
  LIMIT 1;

  IF championship_sport_name IS NULL THEN
    RAISE EXCEPTION 'Modalidade inválida para configuração de regras.';
  END IF;

  NEW.supports_cards := public.resolve_championship_sport_supports_cards(championship_sport_name);
  NEW.tie_breaker_rule := public.resolve_championship_sport_tie_breaker_rule(championship_sport_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_championship_sport_rules_trigger ON public.championship_sports;

CREATE TRIGGER sync_championship_sport_rules_trigger
BEFORE INSERT OR UPDATE OF sport_id ON public.championship_sports
FOR EACH ROW
EXECUTE FUNCTION public.sync_championship_sport_rules();

UPDATE public.championship_sports AS championship_sports_table
SET
  supports_cards = public.resolve_championship_sport_supports_cards(sports_table.name),
  tie_breaker_rule = public.resolve_championship_sport_tie_breaker_rule(sports_table.name)
FROM public.sports AS sports_table
WHERE sports_table.id = championship_sports_table.sport_id;

UPDATE public.matches AS matches_table
SET
  supports_cards = championship_sports_table.supports_cards,
  home_yellow_cards = CASE WHEN championship_sports_table.supports_cards THEN COALESCE(matches_table.home_yellow_cards, 0) ELSE 0 END,
  home_red_cards = CASE WHEN championship_sports_table.supports_cards THEN COALESCE(matches_table.home_red_cards, 0) ELSE 0 END,
  away_yellow_cards = CASE WHEN championship_sports_table.supports_cards THEN COALESCE(matches_table.away_yellow_cards, 0) ELSE 0 END,
  away_red_cards = CASE WHEN championship_sports_table.supports_cards THEN COALESCE(matches_table.away_red_cards, 0) ELSE 0 END
FROM public.championship_sports AS championship_sports_table
WHERE championship_sports_table.championship_id = matches_table.championship_id
  AND championship_sports_table.sport_id = matches_table.sport_id;

NOTIFY pgrst, 'reload schema';
