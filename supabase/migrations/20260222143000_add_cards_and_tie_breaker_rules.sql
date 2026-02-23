DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_sport_tie_breaker_rule'
  ) THEN
    CREATE TYPE public.championship_sport_tie_breaker_rule AS ENUM (
      'STANDARD',
      'POINTS_AVERAGE',
      'BEACH_SOCCER',
      'BEACH_TENNIS'
    );
  END IF;
END
$$;

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS supports_cards BOOLEAN,
  ADD COLUMN IF NOT EXISTS tie_breaker_rule public.championship_sport_tie_breaker_rule;

UPDATE public.championship_sports AS championship_sports_table
SET
  supports_cards = CASE
    WHEN lower(sports_table.name) LIKE '%beach soccer%' THEN true
    ELSE false
  END,
  tie_breaker_rule = CASE
    WHEN lower(sports_table.name) LIKE '%beach soccer%' THEN 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
    WHEN lower(sports_table.name) LIKE '%beach tennis%' THEN 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
    WHEN lower(sports_table.name) LIKE '%vôlei de praia%' THEN 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
    WHEN lower(sports_table.name) LIKE '%volei de praia%' THEN 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
    WHEN lower(sports_table.name) LIKE '%futevôlei%' THEN 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
    WHEN lower(sports_table.name) LIKE '%futevolei%' THEN 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
    ELSE 'STANDARD'::public.championship_sport_tie_breaker_rule
  END
FROM public.sports AS sports_table
WHERE championship_sports_table.sport_id = sports_table.id
  AND (
    championship_sports_table.supports_cards IS NULL
    OR championship_sports_table.tie_breaker_rule IS NULL
  );

UPDATE public.championship_sports
SET supports_cards = false
WHERE supports_cards IS NULL;

UPDATE public.championship_sports
SET tie_breaker_rule = 'STANDARD'::public.championship_sport_tie_breaker_rule
WHERE tie_breaker_rule IS NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN supports_cards SET DEFAULT false;

ALTER TABLE public.championship_sports
  ALTER COLUMN supports_cards SET NOT NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN tie_breaker_rule SET DEFAULT 'STANDARD'::public.championship_sport_tie_breaker_rule;

ALTER TABLE public.championship_sports
  ALTER COLUMN tie_breaker_rule SET NOT NULL;

COMMENT ON COLUMN public.championship_sports.supports_cards IS 'Define se a modalidade aceita cartões amarelos e vermelhos.';
COMMENT ON COLUMN public.championship_sports.tie_breaker_rule IS 'Regra de desempate aplicada na classificação da modalidade.';

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS supports_cards BOOLEAN,
  ADD COLUMN IF NOT EXISTS home_yellow_cards INTEGER,
  ADD COLUMN IF NOT EXISTS home_red_cards INTEGER,
  ADD COLUMN IF NOT EXISTS away_yellow_cards INTEGER,
  ADD COLUMN IF NOT EXISTS away_red_cards INTEGER;

UPDATE public.matches AS matches_table
SET supports_cards = championship_sports_table.supports_cards
FROM public.championship_sports AS championship_sports_table
WHERE championship_sports_table.championship_id = matches_table.championship_id
  AND championship_sports_table.sport_id = matches_table.sport_id
  AND matches_table.supports_cards IS NULL;

UPDATE public.matches
SET supports_cards = false
WHERE supports_cards IS NULL;

UPDATE public.matches
SET home_yellow_cards = 0
WHERE home_yellow_cards IS NULL;

UPDATE public.matches
SET home_red_cards = 0
WHERE home_red_cards IS NULL;

UPDATE public.matches
SET away_yellow_cards = 0
WHERE away_yellow_cards IS NULL;

UPDATE public.matches
SET away_red_cards = 0
WHERE away_red_cards IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN supports_cards SET DEFAULT false;

ALTER TABLE public.matches
  ALTER COLUMN supports_cards SET NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN home_yellow_cards SET DEFAULT 0;

ALTER TABLE public.matches
  ALTER COLUMN home_yellow_cards SET NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN home_red_cards SET DEFAULT 0;

ALTER TABLE public.matches
  ALTER COLUMN home_red_cards SET NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN away_yellow_cards SET DEFAULT 0;

ALTER TABLE public.matches
  ALTER COLUMN away_yellow_cards SET NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN away_red_cards SET DEFAULT 0;

ALTER TABLE public.matches
  ALTER COLUMN away_red_cards SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_home_yellow_cards_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_home_yellow_cards_non_negative
      CHECK (home_yellow_cards >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_home_red_cards_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_home_red_cards_non_negative
      CHECK (home_red_cards >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_away_yellow_cards_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_away_yellow_cards_non_negative
      CHECK (away_yellow_cards >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_away_red_cards_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_away_red_cards_non_negative
      CHECK (away_red_cards >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.matches.supports_cards IS 'Define se a partida usa controle de cartões.';
COMMENT ON COLUMN public.matches.home_yellow_cards IS 'Total de cartões amarelos do time da casa.';
COMMENT ON COLUMN public.matches.home_red_cards IS 'Total de cartões vermelhos do time da casa.';
COMMENT ON COLUMN public.matches.away_yellow_cards IS 'Total de cartões amarelos do time visitante.';
COMMENT ON COLUMN public.matches.away_red_cards IS 'Total de cartões vermelhos do time visitante.';

ALTER TABLE public.standings
  ADD COLUMN IF NOT EXISTS yellow_cards INTEGER,
  ADD COLUMN IF NOT EXISTS red_cards INTEGER;

UPDATE public.standings
SET yellow_cards = 0
WHERE yellow_cards IS NULL;

UPDATE public.standings
SET red_cards = 0
WHERE red_cards IS NULL;

ALTER TABLE public.standings
  ALTER COLUMN yellow_cards SET DEFAULT 0;

ALTER TABLE public.standings
  ALTER COLUMN yellow_cards SET NOT NULL;

ALTER TABLE public.standings
  ALTER COLUMN red_cards SET DEFAULT 0;

ALTER TABLE public.standings
  ALTER COLUMN red_cards SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'standings_yellow_cards_non_negative'
      AND conrelid = 'public.standings'::regclass
  ) THEN
    ALTER TABLE public.standings
      ADD CONSTRAINT standings_yellow_cards_non_negative
      CHECK (yellow_cards >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'standings_red_cards_non_negative'
      AND conrelid = 'public.standings'::regclass
  ) THEN
    ALTER TABLE public.standings
      ADD CONSTRAINT standings_red_cards_non_negative
      CHECK (red_cards >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.standings.yellow_cards IS 'Total acumulado de cartões amarelos da equipe na classificação.';
COMMENT ON COLUMN public.standings.red_cards IS 'Total acumulado de cartões vermelhos da equipe na classificação.';

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  championship_code public.championship_code;
  championship_sport_naipe_mode public.championship_sport_naipe_mode;
  championship_sport_supports_cards BOOLEAN;
  home_team_division public.team_division;
  away_team_division public.team_division;
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Confronto inválido: os times devem ser diferentes.';
  END IF;

  IF NEW.championship_id IS NULL THEN
    SELECT championships_table.id
    INTO NEW.championship_id
    FROM public.championships AS championships_table
    WHERE championships_table.code = 'CLV'
    LIMIT 1;
  END IF;

  IF NEW.naipe IS NULL THEN
    NEW.naipe := 'MASCULINO'::public.match_naipe;
  END IF;

  SELECT
    championships_table.uses_divisions,
    championships_table.code
  INTO
    championship_uses_divisions,
    championship_code
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id;

  IF championship_uses_divisions IS NULL OR championship_code IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido para a partida.';
  END IF;

  SELECT
    championship_sports_table.naipe_mode,
    championship_sports_table.supports_cards
  INTO
    championship_sport_naipe_mode,
    championship_sport_supports_cards
  FROM public.championship_sports AS championship_sports_table
  WHERE championship_sports_table.championship_id = NEW.championship_id
    AND championship_sports_table.sport_id = NEW.sport_id
  LIMIT 1;

  IF championship_sport_naipe_mode IS NULL THEN
    RAISE EXCEPTION 'Modalidade não vinculada ao campeonato selecionado.';
  END IF;

  IF championship_sport_naipe_mode = 'MISTO'::public.championship_sport_naipe_mode
    AND NEW.naipe != 'MISTO'::public.match_naipe THEN
    RAISE EXCEPTION 'Esta modalidade é mista e deve usar naipe Misto.';
  END IF;

  IF championship_sport_naipe_mode = 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
    AND NEW.naipe = 'MISTO'::public.match_naipe THEN
    RAISE EXCEPTION 'Esta modalidade aceita apenas naipes Masculino ou Feminino.';
  END IF;

  NEW.supports_cards := COALESCE(championship_sport_supports_cards, false);

  IF NEW.supports_cards THEN
    NEW.home_yellow_cards := GREATEST(0, COALESCE(NEW.home_yellow_cards, 0));
    NEW.home_red_cards := GREATEST(0, COALESCE(NEW.home_red_cards, 0));
    NEW.away_yellow_cards := GREATEST(0, COALESCE(NEW.away_yellow_cards, 0));
    NEW.away_red_cards := GREATEST(0, COALESCE(NEW.away_red_cards, 0));
  ELSE
    NEW.home_yellow_cards := 0;
    NEW.home_red_cards := 0;
    NEW.away_yellow_cards := 0;
    NEW.away_red_cards := 0;
  END IF;

  SELECT teams_table.division
  INTO home_team_division
  FROM public.teams AS teams_table
  WHERE teams_table.id = NEW.home_team_id;

  SELECT teams_table.division
  INTO away_team_division
  FROM public.teams AS teams_table
  WHERE teams_table.id = NEW.away_team_id;

  IF home_team_division IS NULL OR away_team_division IS NULL THEN
    RAISE EXCEPTION 'Os times precisam ter divisão cadastrada para criar partidas.';
  END IF;

  IF championship_uses_divisions THEN
    IF home_team_division != away_team_division THEN
      RAISE EXCEPTION 'Confronto inválido: em campeonatos com divisão, os times devem ser da mesma série.';
    END IF;

    NEW.division := home_team_division;
  ELSE
    NEW.division := NULL;
  END IF;

  IF championship_code != 'CLV'::public.championship_code AND EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND matches_table.location = NEW.location
      AND matches_table.start_time < NEW.end_time
      AND matches_table.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: já existe um jogo neste local no período informado.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_standings_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  home_team_division public.team_division;
  away_team_division public.team_division;
  match_division public.team_division;
  match_naipe public.match_naipe;
  match_home_yellow_cards INTEGER := 0;
  match_home_red_cards INTEGER := 0;
  match_away_yellow_cards INTEGER := 0;
  match_away_red_cards INTEGER := 0;
  points_for_win INTEGER := 3;
  points_for_draw INTEGER := 1;
  points_for_loss INTEGER := 0;
BEGIN
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
    match_naipe := COALESCE(NEW.naipe, 'MASCULINO'::public.match_naipe);
    match_home_yellow_cards := GREATEST(0, COALESCE(NEW.home_yellow_cards, 0));
    match_home_red_cards := GREATEST(0, COALESCE(NEW.home_red_cards, 0));
    match_away_yellow_cards := GREATEST(0, COALESCE(NEW.away_yellow_cards, 0));
    match_away_red_cards := GREATEST(0, COALESCE(NEW.away_red_cards, 0));

    SELECT championships_table.uses_divisions
    INTO championship_uses_divisions
    FROM public.championships AS championships_table
    WHERE championships_table.id = NEW.championship_id;

    IF championship_uses_divisions IS NULL THEN
      RAISE EXCEPTION 'Campeonato inválido para cálculo de classificação.';
    END IF;

    IF championship_uses_divisions THEN
      SELECT teams_table.division
      INTO home_team_division
      FROM public.teams AS teams_table
      WHERE teams_table.id = NEW.home_team_id;

      SELECT teams_table.division
      INTO away_team_division
      FROM public.teams AS teams_table
      WHERE teams_table.id = NEW.away_team_id;

      IF home_team_division IS NULL OR away_team_division IS NULL THEN
        RAISE EXCEPTION 'Times sem divisão definida em campeonato com divisão.';
      END IF;

      IF home_team_division != away_team_division THEN
        RAISE EXCEPTION 'Confronto inválido para classificação: divisões diferentes.';
      END IF;

      match_division := home_team_division;
    ELSE
      match_division := NULL;
    END IF;

    SELECT
      championship_sports_table.points_win,
      championship_sports_table.points_draw,
      championship_sports_table.points_loss
    INTO
      points_for_win,
      points_for_draw,
      points_for_loss
    FROM public.championship_sports AS championship_sports_table
    WHERE championship_sports_table.championship_id = NEW.championship_id
      AND championship_sports_table.sport_id = NEW.sport_id
    LIMIT 1;

    points_for_win := COALESCE(points_for_win, 3);
    points_for_draw := COALESCE(points_for_draw, 1);
    points_for_loss := COALESCE(points_for_loss, 0);

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings AS standings_table
      WHERE standings_table.championship_id = NEW.championship_id
        AND standings_table.sport_id = NEW.sport_id
        AND standings_table.naipe = match_naipe
        AND standings_table.team_id = NEW.home_team_id
        AND standings_table.division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        naipe,
        team_id,
        division,
        yellow_cards,
        red_cards
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        match_naipe,
        NEW.home_team_id,
        match_division,
        0,
        0
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings AS standings_table
      WHERE standings_table.championship_id = NEW.championship_id
        AND standings_table.sport_id = NEW.sport_id
        AND standings_table.naipe = match_naipe
        AND standings_table.team_id = NEW.away_team_id
        AND standings_table.division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        naipe,
        team_id,
        division,
        yellow_cards,
        red_cards
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        match_naipe,
        NEW.away_team_id,
        match_division,
        0,
        0
      );
    END IF;

    UPDATE public.standings
    SET
      played = played + 1,
      goals_for = goals_for + NEW.home_score,
      goals_against = goals_against + NEW.away_score,
      goal_diff = goal_diff + NEW.home_score - NEW.away_score,
      wins = wins + CASE WHEN NEW.home_score > NEW.away_score THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.home_score < NEW.away_score THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.home_score > NEW.away_score THEN points_for_win
        WHEN NEW.home_score = NEW.away_score THEN points_for_draw
        ELSE points_for_loss
      END,
      yellow_cards = yellow_cards + match_home_yellow_cards,
      red_cards = red_cards + match_home_red_cards,
      updated_at = now()
    WHERE championship_id = NEW.championship_id
      AND sport_id = NEW.sport_id
      AND naipe = match_naipe
      AND team_id = NEW.home_team_id
      AND division IS NOT DISTINCT FROM match_division;

    UPDATE public.standings
    SET
      played = played + 1,
      goals_for = goals_for + NEW.away_score,
      goals_against = goals_against + NEW.home_score,
      goal_diff = goal_diff + NEW.away_score - NEW.home_score,
      wins = wins + CASE WHEN NEW.away_score > NEW.home_score THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.away_score < NEW.home_score THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.away_score > NEW.home_score THEN points_for_win
        WHEN NEW.home_score = NEW.away_score THEN points_for_draw
        ELSE points_for_loss
      END,
      yellow_cards = yellow_cards + match_away_yellow_cards,
      red_cards = red_cards + match_away_red_cards,
      updated_at = now()
    WHERE championship_id = NEW.championship_id
      AND sport_id = NEW.sport_id
      AND naipe = match_naipe
      AND team_id = NEW.away_team_id
      AND division IS NOT DISTINCT FROM match_division;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
