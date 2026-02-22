DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'match_naipe'
  ) THEN
    CREATE TYPE public.match_naipe AS ENUM ('MASCULINO', 'FEMININO', 'MISTO');
  END IF;
END
$$;

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS naipe public.match_naipe;

UPDATE public.championship_sports AS championship_sports_table
SET naipe = CASE
  WHEN lower(sports_table.name) LIKE '%femin%' THEN 'FEMININO'::public.match_naipe
  WHEN lower(sports_table.name) LIKE '%misto%' THEN 'MISTO'::public.match_naipe
  ELSE 'MASCULINO'::public.match_naipe
END
FROM public.sports AS sports_table
WHERE championship_sports_table.sport_id = sports_table.id
  AND championship_sports_table.naipe IS NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN naipe SET DEFAULT 'MASCULINO'::public.match_naipe;

UPDATE public.championship_sports
SET naipe = 'MASCULINO'::public.match_naipe
WHERE naipe IS NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN naipe SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_sports_championship_id_sport_id_key'
      AND conrelid = 'public.championship_sports'::regclass
  ) THEN
    ALTER TABLE public.championship_sports
      DROP CONSTRAINT championship_sports_championship_id_sport_id_key;
  END IF;
END
$$;

DROP INDEX IF EXISTS championship_sports_championship_id_sport_id_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS championship_sports_championship_id_sport_id_naipe_unique_idx
  ON public.championship_sports (championship_id, sport_id, naipe);

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS naipe public.match_naipe;

UPDATE public.matches AS matches_table
SET naipe = (
  SELECT championship_sports_table.naipe
  FROM public.championship_sports AS championship_sports_table
  WHERE championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  ORDER BY championship_sports_table.created_at ASC
  LIMIT 1
)
WHERE matches_table.naipe IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.championship_sports AS championship_sports_table
    WHERE championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
  );

UPDATE public.matches
SET naipe = CASE
  WHEN sports_table.name ILIKE '%femin%' THEN 'FEMININO'::public.match_naipe
  WHEN sports_table.name ILIKE '%misto%' THEN 'MISTO'::public.match_naipe
  ELSE 'MASCULINO'::public.match_naipe
END
FROM public.sports AS sports_table
WHERE public.matches.sport_id = sports_table.id
  AND public.matches.naipe IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN naipe SET DEFAULT 'MASCULINO'::public.match_naipe;

UPDATE public.matches
SET naipe = 'MASCULINO'::public.match_naipe
WHERE naipe IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN naipe SET NOT NULL;

ALTER TABLE public.standings
  ADD COLUMN IF NOT EXISTS naipe public.match_naipe;

UPDATE public.standings AS standings_table
SET naipe = (
  SELECT matches_table.naipe
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = standings_table.championship_id
    AND matches_table.sport_id = standings_table.sport_id
    AND matches_table.division IS NOT DISTINCT FROM standings_table.division
    AND (
      matches_table.home_team_id = standings_table.team_id
      OR matches_table.away_team_id = standings_table.team_id
    )
    AND matches_table.naipe IS NOT NULL
  ORDER BY matches_table.start_time DESC
  LIMIT 1
)
WHERE standings_table.naipe IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = standings_table.championship_id
      AND matches_table.sport_id = standings_table.sport_id
      AND matches_table.division IS NOT DISTINCT FROM standings_table.division
      AND (
        matches_table.home_team_id = standings_table.team_id
        OR matches_table.away_team_id = standings_table.team_id
      )
      AND matches_table.naipe IS NOT NULL
  );

UPDATE public.standings
SET naipe = CASE
  WHEN sports_table.name ILIKE '%femin%' THEN 'FEMININO'::public.match_naipe
  WHEN sports_table.name ILIKE '%misto%' THEN 'MISTO'::public.match_naipe
  ELSE 'MASCULINO'::public.match_naipe
END
FROM public.sports AS sports_table
WHERE public.standings.sport_id = sports_table.id
  AND public.standings.naipe IS NULL;

ALTER TABLE public.standings
  ALTER COLUMN naipe SET DEFAULT 'MASCULINO'::public.match_naipe;

UPDATE public.standings
SET naipe = 'MASCULINO'::public.match_naipe
WHERE naipe IS NULL;

ALTER TABLE public.standings
  ALTER COLUMN naipe SET NOT NULL;

DROP INDEX IF EXISTS standings_championship_sport_team_division_unique_idx;
DROP INDEX IF EXISTS standings_championship_sport_team_without_division_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS standings_championship_sport_naipe_team_division_unique_idx
  ON public.standings (championship_id, sport_id, naipe, team_id, division)
  WHERE division IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS standings_championship_sport_naipe_team_without_division_unique_idx
  ON public.standings (championship_id, sport_id, naipe, team_id)
  WHERE division IS NULL;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  home_team_division public.team_division;
  away_team_division public.team_division;
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Confronto inválido: os times devem ser diferentes.';
  END IF;

  IF NEW.championship_id IS NULL THEN
    SELECT id
    INTO NEW.championship_id
    FROM public.championships
    WHERE code = 'CLV'
    LIMIT 1;
  END IF;

  IF NEW.naipe IS NULL THEN
    NEW.naipe := 'MASCULINO'::public.match_naipe;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_sports AS championship_sports_table
    WHERE championship_sports_table.championship_id = NEW.championship_id
      AND championship_sports_table.sport_id = NEW.sport_id
      AND championship_sports_table.naipe = NEW.naipe
  ) THEN
    RAISE EXCEPTION 'Modalidade e naipe não estão vinculados ao campeonato selecionado.';
  END IF;

  SELECT uses_divisions
  INTO championship_uses_divisions
  FROM public.championships
  WHERE id = NEW.championship_id;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido para a partida.';
  END IF;

  SELECT division
  INTO home_team_division
  FROM public.teams
  WHERE id = NEW.home_team_id;

  SELECT division
  INTO away_team_division
  FROM public.teams
  WHERE id = NEW.away_team_id;

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

  IF EXISTS (
    SELECT 1
    FROM public.matches
    WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND location = NEW.location
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
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
  points_for_win INTEGER := 3;
  points_for_draw INTEGER := 1;
  points_for_loss INTEGER := 0;
BEGIN
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
    match_naipe := COALESCE(NEW.naipe, 'MASCULINO'::public.match_naipe);

    SELECT uses_divisions
    INTO championship_uses_divisions
    FROM public.championships
    WHERE id = NEW.championship_id;

    IF championship_uses_divisions IS NULL THEN
      RAISE EXCEPTION 'Campeonato inválido para cálculo de classificação.';
    END IF;

    IF championship_uses_divisions THEN
      SELECT division
      INTO home_team_division
      FROM public.teams
      WHERE id = NEW.home_team_id;

      SELECT division
      INTO away_team_division
      FROM public.teams
      WHERE id = NEW.away_team_id;

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
      AND championship_sports_table.naipe = match_naipe
    LIMIT 1;

    points_for_win := COALESCE(points_for_win, 3);
    points_for_draw := COALESCE(points_for_draw, 1);
    points_for_loss := COALESCE(points_for_loss, 0);

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings
      WHERE championship_id = NEW.championship_id
        AND sport_id = NEW.sport_id
        AND naipe = match_naipe
        AND team_id = NEW.home_team_id
        AND division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        naipe,
        team_id,
        division
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        match_naipe,
        NEW.home_team_id,
        match_division
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings
      WHERE championship_id = NEW.championship_id
        AND sport_id = NEW.sport_id
        AND naipe = match_naipe
        AND team_id = NEW.away_team_id
        AND division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        naipe,
        team_id,
        division
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        match_naipe,
        NEW.away_team_id,
        match_division
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
