DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_sport_naipe_mode'
  ) THEN
    CREATE TYPE public.championship_sport_naipe_mode AS ENUM ('MISTO', 'MASCULINO_FEMININO');
  END IF;
END
$$;

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS default_location TEXT;

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS naipe_mode public.championship_sport_naipe_mode;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'naipe'
  ) THEN
    WITH grouped_modes AS (
      SELECT
        championship_sports_table.championship_id,
        championship_sports_table.sport_id,
        CASE
          WHEN bool_or(championship_sports_table.naipe::text IN ('MASCULINO', 'FEMININO'))
            THEN 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
          ELSE 'MISTO'::public.championship_sport_naipe_mode
        END AS naipe_mode
      FROM public.championship_sports AS championship_sports_table
      GROUP BY
        championship_sports_table.championship_id,
        championship_sports_table.sport_id
    )
    UPDATE public.championship_sports AS championship_sports_table
    SET naipe_mode = grouped_modes.naipe_mode
    FROM grouped_modes
    WHERE grouped_modes.championship_id = championship_sports_table.championship_id
      AND grouped_modes.sport_id = championship_sports_table.sport_id
      AND championship_sports_table.naipe_mode IS NULL;
  END IF;
END
$$;

UPDATE public.championship_sports AS championship_sports_table
SET naipe_mode = CASE
  WHEN lower(sports_table.name) LIKE '%misto%' THEN 'MISTO'::public.championship_sport_naipe_mode
  WHEN lower(sports_table.name) LIKE '%beach tennis%' THEN 'MISTO'::public.championship_sport_naipe_mode
  ELSE 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
END
FROM public.sports AS sports_table
WHERE championship_sports_table.sport_id = sports_table.id
  AND championship_sports_table.naipe_mode IS NULL;

UPDATE public.championship_sports
SET naipe_mode = 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
WHERE naipe_mode IS NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN naipe_mode SET DEFAULT 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode;

ALTER TABLE public.championship_sports
  ALTER COLUMN naipe_mode SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'naipe'
  ) THEN
    WITH ranked_championship_sports AS (
      SELECT
        championship_sports_table.id,
        ROW_NUMBER() OVER (
          PARTITION BY championship_sports_table.championship_id, championship_sports_table.sport_id
          ORDER BY
            CASE championship_sports_table.naipe::text
              WHEN 'MASCULINO' THEN 0
              WHEN 'FEMININO' THEN 1
              WHEN 'MISTO' THEN 2
              ELSE 3
            END,
            championship_sports_table.created_at ASC
        ) AS row_number
      FROM public.championship_sports AS championship_sports_table
    )
    DELETE FROM public.championship_sports AS championship_sports_table
    USING ranked_championship_sports
    WHERE ranked_championship_sports.id = championship_sports_table.id
      AND ranked_championship_sports.row_number > 1;
  END IF;
END
$$;

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

DROP INDEX IF EXISTS championship_sports_championship_id_sport_id_naipe_unique_idx;
DROP INDEX IF EXISTS championship_sports_championship_id_sport_id_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS championship_sports_championship_id_sport_id_unique_idx
  ON public.championship_sports (championship_id, sport_id);

DROP TRIGGER IF EXISTS check_match_conflict ON public.matches;
DROP TRIGGER IF EXISTS update_standings_trigger ON public.matches;

DROP FUNCTION IF EXISTS public.validate_match_conflict();
DROP FUNCTION IF EXISTS public.update_standings_on_finish();

ALTER TABLE public.championship_sports
  DROP COLUMN IF EXISTS naipe;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  championship_sport_naipe_mode public.championship_sport_naipe_mode;
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

  SELECT championships_table.uses_divisions
  INTO championship_uses_divisions
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido para a partida.';
  END IF;

  SELECT championship_sports_table.naipe_mode
  INTO championship_sport_naipe_mode
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

  IF EXISTS (
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
  points_for_win INTEGER := 3;
  points_for_draw INTEGER := 1;
  points_for_loss INTEGER := 0;
BEGIN
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
    match_naipe := COALESCE(NEW.naipe, 'MASCULINO'::public.match_naipe);

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

CREATE TRIGGER check_match_conflict
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_match_conflict();

CREATE TRIGGER update_standings_trigger
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_standings_on_finish();

NOTIFY pgrst, 'reload schema';
