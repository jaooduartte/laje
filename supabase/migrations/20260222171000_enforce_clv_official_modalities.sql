DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'championships'
  ) THEN
    RAISE EXCEPTION 'Tabela public.championships não encontrada.';
  END IF;

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
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'naipe_mode'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.naipe_mode não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'points_win'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.points_win não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'points_draw'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.points_draw não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'points_loss'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.points_loss não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'supports_cards'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.supports_cards não encontrada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'tie_breaker_rule'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.tie_breaker_rule não encontrada.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.normalize_sport_name(sport_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN trim(
    lower(
      translate(
        COALESCE(sport_name, ''),
        'ÁÀÃÂÉÈÊÍÌÎÓÒÕÔÚÙÛÇáàãâéèêíìîóòõôúùûç',
        'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
      )
    )
  );
END;
$$;

INSERT INTO public.sports (name)
SELECT official_sports_table.name
FROM (
  VALUES
    ('Beach Soccer'),
    ('Beach Tennis'),
    ('Futevôlei'),
    ('Vôlei de Praia')
) AS official_sports_table(name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sports AS sports_table
  WHERE public.normalize_sport_name(sports_table.name) = public.normalize_sport_name(official_sports_table.name)
);

CREATE OR REPLACE FUNCTION public.sync_championship_sport_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_code public.championship_code;
  championship_sport_name TEXT;
  normalized_championship_sport_name TEXT;
BEGIN
  SELECT championships_table.code
  INTO championship_code
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id
  LIMIT 1;

  SELECT sports_table.name
  INTO championship_sport_name
  FROM public.sports AS sports_table
  WHERE sports_table.id = NEW.sport_id
  LIMIT 1;

  IF championship_code IS NULL OR championship_sport_name IS NULL THEN
    RAISE EXCEPTION 'Configuração inválida de modalidade para campeonato.';
  END IF;

  normalized_championship_sport_name := public.normalize_sport_name(championship_sport_name);

  IF normalized_championship_sport_name = 'beach soccer' THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule;
  ELSIF normalized_championship_sport_name = 'beach tennis' THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule;
  ELSIF normalized_championship_sport_name = 'futevolei' OR normalized_championship_sport_name = 'volei de praia' THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
  ELSE
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'STANDARD'::public.championship_sport_tie_breaker_rule;
  END IF;

  IF championship_code = 'CLV'::public.championship_code THEN
    IF normalized_championship_sport_name = 'beach soccer' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 1;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'beach tennis' THEN
      NEW.naipe_mode := 'MISTO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'futevolei' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'volei de praia' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSE
      RAISE EXCEPTION 'No CLV, somente modalidades oficiais do regulamento podem ser vinculadas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_championship_sport_rules_trigger ON public.championship_sports;

CREATE TRIGGER sync_championship_sport_rules_trigger
BEFORE INSERT OR UPDATE ON public.championship_sports
FOR EACH ROW
EXECUTE FUNCTION public.sync_championship_sport_rules();

DO $$
DECLARE
  clv_championship_id UUID;
BEGIN
  SELECT championships_table.id
  INTO clv_championship_id
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'CLV'
  LIMIT 1;

  IF clv_championship_id IS NULL THEN
    RAISE EXCEPTION 'Campeonato CLV não encontrado.';
  END IF;

  DELETE FROM public.championship_sports AS championship_sports_table
  USING public.sports AS sports_table
  WHERE championship_sports_table.championship_id = clv_championship_id
    AND sports_table.id = championship_sports_table.sport_id
    AND public.normalize_sport_name(sports_table.name) NOT IN (
      'beach soccer',
      'beach tennis',
      'futevolei',
      'volei de praia'
    );

  INSERT INTO public.championship_sports (
    championship_id,
    sport_id
  )
  SELECT
    clv_championship_id,
    sports_table.id
  FROM public.sports AS sports_table
  WHERE public.normalize_sport_name(sports_table.name) IN (
    'beach soccer',
    'beach tennis',
    'futevolei',
    'volei de praia'
  )
  ON CONFLICT (championship_id, sport_id)
  DO UPDATE SET sport_id = EXCLUDED.sport_id;
END
$$;

UPDATE public.championship_sports
SET championship_id = championship_id;

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

UPDATE public.matches AS matches_table
SET naipe = 'MISTO'::public.match_naipe
FROM public.championships AS championships_table,
     public.sports AS sports_table
WHERE championships_table.id = matches_table.championship_id
  AND sports_table.id = matches_table.sport_id
  AND championships_table.code = 'CLV'
  AND public.normalize_sport_name(sports_table.name) = 'beach tennis'
  AND matches_table.naipe != 'MISTO'::public.match_naipe;

UPDATE public.matches AS matches_table
SET naipe = 'MASCULINO'::public.match_naipe
FROM public.championships AS championships_table,
     public.sports AS sports_table
WHERE championships_table.id = matches_table.championship_id
  AND sports_table.id = matches_table.sport_id
  AND championships_table.code = 'CLV'
  AND public.normalize_sport_name(sports_table.name) IN ('beach soccer', 'futevolei', 'volei de praia')
  AND matches_table.naipe = 'MISTO'::public.match_naipe;

NOTIFY pgrst, 'reload schema';
