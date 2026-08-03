ALTER TABLE public.sports
  ADD COLUMN IF NOT EXISTS code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sports_code_key
  ON public.sports (code)
  WHERE code IS NOT NULL;

WITH official_sports AS (
  SELECT *
  FROM (
    VALUES
      ('Basquetebol', 'BASQUETE', 35),
      ('Futsal', 'FUTSAL', 35),
      ('Handebol', 'HANDEBOL', 35),
      ('Voleibol', 'VOLEIBOL', 35),
      ('Atletismo', 'ATLETISMO', 35),
      ('Natação', 'NATACAO', 35)
  ) AS official_sports_table(name, code, default_match_duration_minutes)
)
INSERT INTO public.sports (name, code, default_match_duration_minutes)
SELECT
  official_sports.name,
  official_sports.code,
  official_sports.default_match_duration_minutes
FROM official_sports
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sports AS sports_table
  WHERE public.normalize_sport_name(sports_table.name) = public.normalize_sport_name(official_sports.name)
);

WITH official_sports AS (
  SELECT *
  FROM (
    VALUES
      ('Beach Soccer', 'BEACH_SOCCER'),
      ('Beach Tennis', 'BEACH_TENNIS'),
      ('Futevôlei', 'FUTEVOLEI'),
      ('Vôlei de Praia', 'VOLEI_PRAIA'),
      ('Futebol Society', 'FUTEBOL_SOCIETY'),
      ('Basquetebol', 'BASQUETE'),
      ('Futsal', 'FUTSAL'),
      ('Handebol', 'HANDEBOL'),
      ('Voleibol', 'VOLEIBOL'),
      ('Atletismo', 'ATLETISMO'),
      ('Natação', 'NATACAO')
  ) AS official_sports_table(name, code)
)
UPDATE public.sports AS sports_table
SET code = official_sports.code
FROM official_sports
WHERE public.normalize_sport_name(sports_table.name) = public.normalize_sport_name(official_sports.name)
  AND sports_table.code IS DISTINCT FROM official_sports.code;

CREATE OR REPLACE FUNCTION public.sync_championship_sport_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
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

  NEW.supports_individual_awards := false;
  NEW.awards_include_knockout_phase := false;

  IF normalized_championship_sport_name = 'beach soccer' THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name = 'beach tennis' THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'SETS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name IN ('futevolei', 'volei de praia', 'voleibol') THEN
    NEW.supports_cards := false;
    NEW.tie_breaker_rule := 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'SETS'::public.championship_sport_result_rule;
  ELSIF normalized_championship_sport_name IN ('futebol society', 'futsal') THEN
    NEW.supports_cards := true;
    NEW.tie_breaker_rule := 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
  ELSE
    NEW.supports_cards := normalized_championship_sport_name = 'handebol';
    NEW.tie_breaker_rule := 'STANDARD'::public.championship_sport_tie_breaker_rule;
    NEW.result_rule := 'POINTS'::public.championship_sport_result_rule;
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
    ELSIF normalized_championship_sport_name IN ('futevolei', 'volei de praia') THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSE
      RAISE EXCEPTION 'No CLV, somente modalidades oficiais do regulamento podem ser vinculadas.';
    END IF;
  ELSIF championship_code = 'SOCIETY'::public.championship_code THEN
    IF normalized_championship_sport_name <> 'futebol society' THEN
      RAISE EXCEPTION 'Na Copa Laje Society, somente Futebol Society pode ser vinculado.';
    END IF;

    NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
    NEW.points_win := 3;
    NEW.points_draw := 1;
    NEW.points_loss := 0;
    NEW.supports_individual_awards := true;
    NEW.awards_include_knockout_phase := true;
  ELSIF championship_code = 'INTERLAJE'::public.championship_code THEN
    IF normalized_championship_sport_name = 'basquetebol' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 1;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'futsal' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 1;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'handebol' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 1;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name = 'voleibol' THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 3;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSIF normalized_championship_sport_name IN ('natacao', 'atletismo') THEN
      NEW.naipe_mode := 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;
      NEW.points_win := 24;
      NEW.points_draw := 0;
      NEW.points_loss := 0;
    ELSE
      RAISE EXCEPTION 'No Interlaje, somente modalidades oficiais do regulamento podem ser vinculadas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

WITH official_interlaje_sports AS (
  SELECT *
  FROM (
    VALUES
      ('Basquetebol', 'BASQUETE', 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode, 3, 1, 0, false, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS'::public.championship_sport_result_rule),
      ('Futsal', 'FUTSAL', 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode, 3, 1, 0, true, 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule, 'POINTS'::public.championship_sport_result_rule),
      ('Handebol', 'HANDEBOL', 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode, 3, 1, 0, true, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS'::public.championship_sport_result_rule),
      ('Voleibol', 'VOLEIBOL', 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode, 3, 0, 0, false, 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule, 'SETS'::public.championship_sport_result_rule),
      ('Atletismo', 'ATLETISMO', 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode, 24, 0, 0, false, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS'::public.championship_sport_result_rule),
      ('Natação', 'NATACAO', 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode, 24, 0, 0, false, 'STANDARD'::public.championship_sport_tie_breaker_rule, 'POINTS'::public.championship_sport_result_rule)
  ) AS official_interlaje_sports_table(
    name,
    code,
    naipe_mode,
    points_win,
    points_draw,
    points_loss,
    supports_cards,
    tie_breaker_rule,
    result_rule
  )
),
interlaje_championship AS (
  SELECT championships_table.id
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'INTERLAJE'::public.championship_code
  LIMIT 1
)
INSERT INTO public.championship_sports (
  championship_id,
  sport_id,
  naipe_mode,
  points_win,
  points_draw,
  points_loss,
  supports_cards,
  tie_breaker_rule,
  result_rule,
  default_match_duration_minutes,
  awards_include_knockout_phase,
  supports_individual_awards
)
SELECT
  interlaje_championship.id,
  sports_table.id,
  official_interlaje_sports.naipe_mode,
  official_interlaje_sports.points_win,
  official_interlaje_sports.points_draw,
  official_interlaje_sports.points_loss,
  official_interlaje_sports.supports_cards,
  official_interlaje_sports.tie_breaker_rule,
  official_interlaje_sports.result_rule,
  COALESCE(sports_table.default_match_duration_minutes, 35),
  false,
  false
FROM interlaje_championship
JOIN official_interlaje_sports
  ON true
JOIN public.sports AS sports_table
  ON public.normalize_sport_name(sports_table.name) = public.normalize_sport_name(official_interlaje_sports.name)
ON CONFLICT (championship_id, sport_id) DO UPDATE
SET
  naipe_mode = EXCLUDED.naipe_mode,
  points_win = EXCLUDED.points_win,
  points_draw = EXCLUDED.points_draw,
  points_loss = EXCLUDED.points_loss,
  supports_cards = EXCLUDED.supports_cards,
  tie_breaker_rule = EXCLUDED.tie_breaker_rule,
  result_rule = EXCLUDED.result_rule,
  default_match_duration_minutes = EXCLUDED.default_match_duration_minutes,
  awards_include_knockout_phase = false,
  supports_individual_awards = false;

UPDATE public.championship_sports AS championship_sports_table
SET
  supports_individual_awards = CASE
    WHEN championships_table.code = 'SOCIETY'::public.championship_code
      AND public.normalize_sport_name(sports_table.name) = 'futebol society'
    THEN true
    ELSE false
  END,
  awards_include_knockout_phase = CASE
    WHEN championships_table.code = 'SOCIETY'::public.championship_code
      AND public.normalize_sport_name(sports_table.name) = 'futebol society'
    THEN true
    ELSE false
  END
FROM public.championships AS championships_table
   , public.sports AS sports_table
WHERE championships_table.id = championship_sports_table.championship_id
  AND sports_table.id = championship_sports_table.sport_id;

UPDATE public.championship_sports AS championship_sports_table
SET championship_id = championship_sports_table.championship_id
WHERE EXISTS (
  SELECT 1
  FROM public.championships AS championships_table
  WHERE championships_table.id = championship_sports_table.championship_id
    AND championships_table.code = 'INTERLAJE'::public.championship_code
);
