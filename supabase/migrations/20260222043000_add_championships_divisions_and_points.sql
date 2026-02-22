DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_code'
  ) THEN
    CREATE TYPE public.championship_code AS ENUM ('CLV', 'SOCIETY', 'INTERLAJE');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'team_division'
  ) THEN
    CREATE TYPE public.team_division AS ENUM ('SERIE_A', 'SERIE_B');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.championships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code public.championship_code NOT NULL,
  name TEXT NOT NULL,
  uses_divisions BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.championships
  ADD COLUMN IF NOT EXISTS code public.championship_code,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS uses_divisions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS championships_code_unique_idx
  ON public.championships (code);

CREATE TABLE IF NOT EXISTS public.championship_sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  points_win INTEGER NOT NULL DEFAULT 3,
  points_draw INTEGER NOT NULL DEFAULT 1,
  points_loss INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, sport_id)
);

ALTER TABLE public.championship_sports
  ADD COLUMN IF NOT EXISTS championship_id UUID,
  ADD COLUMN IF NOT EXISTS sport_id UUID,
  ADD COLUMN IF NOT EXISTS points_win INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS points_draw INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS points_loss INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_sports_championship_id_fkey'
      AND conrelid = 'public.championship_sports'::regclass
  ) THEN
    ALTER TABLE public.championship_sports
      ADD CONSTRAINT championship_sports_championship_id_fkey
      FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_sports_sport_id_fkey'
      AND conrelid = 'public.championship_sports'::regclass
  ) THEN
    ALTER TABLE public.championship_sports
      ADD CONSTRAINT championship_sports_sport_id_fkey
      FOREIGN KEY (sport_id) REFERENCES public.sports(id) ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS championship_sports_championship_id_sport_id_unique_idx
  ON public.championship_sports (championship_id, sport_id);

INSERT INTO public.championships (code, name, uses_divisions)
VALUES
  ('CLV', 'Copa Laje de Verão', false),
  ('SOCIETY', 'Copa Laje Society', true),
  ('INTERLAJE', 'Interlaje', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  uses_divisions = EXCLUDED.uses_divisions;

ALTER TABLE public.championships
  ALTER COLUMN code SET NOT NULL;

ALTER TABLE public.championships
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN championship_id SET NOT NULL;

ALTER TABLE public.championship_sports
  ALTER COLUMN sport_id SET NOT NULL;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS division public.team_division;

UPDATE public.teams
SET division = 'SERIE_B'::public.team_division
WHERE division IS NULL;

ALTER TABLE public.teams
  ALTER COLUMN division SET DEFAULT 'SERIE_B'::public.team_division;

ALTER TABLE public.teams
  ALTER COLUMN division SET NOT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS championship_id UUID,
  ADD COLUMN IF NOT EXISTS division public.team_division;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_championship_id_fkey'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_championship_id_fkey
      FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE RESTRICT;
  END IF;
END
$$;

WITH clv AS (
  SELECT id
  FROM public.championships
  WHERE code = 'CLV'
  LIMIT 1
)
UPDATE public.matches
SET championship_id = clv.id
FROM clv
WHERE public.matches.championship_id IS NULL;

UPDATE public.matches AS matches_table
SET division = teams_table.division
FROM public.teams AS teams_table,
  public.championships AS championships_table
WHERE matches_table.home_team_id = teams_table.id
  AND championships_table.id = matches_table.championship_id
  AND championships_table.uses_divisions = true
  AND matches_table.division IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN championship_id SET NOT NULL;

ALTER TABLE public.standings
  ADD COLUMN IF NOT EXISTS championship_id UUID,
  ADD COLUMN IF NOT EXISTS division public.team_division;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'standings_championship_id_fkey'
      AND conrelid = 'public.standings'::regclass
  ) THEN
    ALTER TABLE public.standings
      ADD CONSTRAINT standings_championship_id_fkey
      FOREIGN KEY (championship_id) REFERENCES public.championships(id) ON DELETE RESTRICT;
  END IF;
END
$$;

WITH clv AS (
  SELECT id
  FROM public.championships
  WHERE code = 'CLV'
  LIMIT 1
)
UPDATE public.standings
SET championship_id = clv.id
FROM clv
WHERE public.standings.championship_id IS NULL;

UPDATE public.standings AS standings_table
SET division = teams_table.division
FROM public.teams AS teams_table,
  public.championships AS championships_table
WHERE standings_table.team_id = teams_table.id
  AND championships_table.id = standings_table.championship_id
  AND championships_table.uses_divisions = true
  AND standings_table.division IS NULL;

ALTER TABLE public.standings
  ALTER COLUMN championship_id SET NOT NULL;

ALTER TABLE public.standings
  DROP CONSTRAINT IF EXISTS standings_sport_id_team_id_key;

DROP INDEX IF EXISTS standings_sport_id_team_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS standings_championship_sport_team_division_unique_idx
  ON public.standings (championship_id, sport_id, team_id, division)
  WHERE division IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS standings_championship_sport_team_without_division_unique_idx
  ON public.standings (championship_id, sport_id, team_id)
  WHERE division IS NULL;

INSERT INTO public.championship_sports (
  championship_id,
  sport_id,
  points_win,
  points_draw,
  points_loss
)
SELECT
  championships_table.id,
  sports_table.id,
  3,
  1,
  0
FROM public.sports AS sports_table
JOIN public.championships AS championships_table
  ON championships_table.code = 'CLV'
ON CONFLICT (championship_id, sport_id) DO NOTHING;

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

DROP TRIGGER IF EXISTS check_match_conflict ON public.matches;

CREATE TRIGGER check_match_conflict
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_match_conflict();

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
  points_for_win INTEGER := 3;
  points_for_draw INTEGER := 1;
  points_for_loss INTEGER := 0;
BEGIN
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
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
    LIMIT 1;

    points_for_win := COALESCE(points_for_win, 3);
    points_for_draw := COALESCE(points_for_draw, 1);
    points_for_loss := COALESCE(points_for_loss, 0);

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings
      WHERE championship_id = NEW.championship_id
        AND sport_id = NEW.sport_id
        AND team_id = NEW.home_team_id
        AND division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        team_id,
        division
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        NEW.home_team_id,
        match_division
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings
      WHERE championship_id = NEW.championship_id
        AND sport_id = NEW.sport_id
        AND team_id = NEW.away_team_id
        AND division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        team_id,
        division
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
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
      AND team_id = NEW.away_team_id
      AND division IS NOT DISTINCT FROM match_division;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_standings_trigger ON public.matches;

CREATE TRIGGER update_standings_trigger
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_standings_on_finish();

ALTER TABLE public.championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_sports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Public can view championships'
  ) THEN
    CREATE POLICY "Public can view championships"
      ON public.championships
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can insert championships'
  ) THEN
    CREATE POLICY "Admin can insert championships"
      ON public.championships
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can update championships'
  ) THEN
    CREATE POLICY "Admin can update championships"
      ON public.championships
      FOR UPDATE
      TO authenticated
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championships'
      AND policyname = 'Admin can delete championships'
  ) THEN
    CREATE POLICY "Admin can delete championships"
      ON public.championships
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Public can view championship sports'
  ) THEN
    CREATE POLICY "Public can view championship sports"
      ON public.championship_sports
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Admin can insert championship sports'
  ) THEN
    CREATE POLICY "Admin can insert championship sports"
      ON public.championship_sports
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Admin can update championship sports'
  ) THEN
    CREATE POLICY "Admin can update championship sports"
      ON public.championship_sports
      FOR UPDATE
      TO authenticated
      USING (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_sports'
      AND policyname = 'Admin can delete championship sports'
  ) THEN
    CREATE POLICY "Admin can delete championship sports"
      ON public.championship_sports
      FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'championships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.championships;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'championship_sports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.championship_sports;
  END IF;
END
$$;
