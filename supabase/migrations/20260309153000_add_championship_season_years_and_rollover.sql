DO $migration_add_championship_season_years$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championships'
      AND column_name = 'current_season_year'
  ) THEN
    ALTER TABLE public.championships
      ADD COLUMN current_season_year INTEGER;

    COMMENT ON COLUMN public.championships.current_season_year IS 'Ano da temporada atual ativa do campeonato.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'matches'
      AND column_name = 'season_year'
  ) THEN
    ALTER TABLE public.matches
      ADD COLUMN season_year INTEGER;

    COMMENT ON COLUMN public.matches.season_year IS 'Ano da temporada à qual o jogo pertence.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'standings'
      AND column_name = 'season_year'
  ) THEN
    ALTER TABLE public.standings
      ADD COLUMN season_year INTEGER;

    COMMENT ON COLUMN public.standings.season_year IS 'Ano da temporada da classificação agregada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_bracket_editions'
      AND column_name = 'season_year'
  ) THEN
    ALTER TABLE public.championship_bracket_editions
      ADD COLUMN season_year INTEGER;

    COMMENT ON COLUMN public.championship_bracket_editions.season_year IS 'Ano da temporada da edição do chaveamento.';
  END IF;
END;
$migration_add_championship_season_years$;

UPDATE public.championships AS championships_table
SET current_season_year = date_part('year', timezone('America/Sao_Paulo', now()))::integer
WHERE championships_table.current_season_year IS NULL;

UPDATE public.matches AS matches_table
SET season_year = date_part('year', timezone('America/Sao_Paulo', matches_table.start_time))::integer
WHERE matches_table.season_year IS NULL
  AND matches_table.start_time IS NOT NULL;

UPDATE public.matches AS matches_table
SET season_year = date_part('year', timezone('America/Sao_Paulo', now()))::integer
WHERE matches_table.season_year IS NULL;

WITH edition_years AS (
  SELECT
    editions_table.id,
    COALESCE(
      min(matches_table.season_year),
      date_part('year', timezone('America/Sao_Paulo', editions_table.created_at))::integer
    ) AS resolved_season_year
  FROM public.championship_bracket_editions AS editions_table
  LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.bracket_edition_id = editions_table.id
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  GROUP BY editions_table.id
)
UPDATE public.championship_bracket_editions AS editions_table
SET season_year = edition_years.resolved_season_year
FROM edition_years
WHERE editions_table.id = edition_years.id
  AND editions_table.season_year IS NULL;

UPDATE public.championship_bracket_editions AS editions_table
SET season_year = date_part('year', timezone('America/Sao_Paulo', now()))::integer
WHERE editions_table.season_year IS NULL;

ALTER TABLE public.championships
  ALTER COLUMN current_season_year SET DEFAULT date_part('year', timezone('America/Sao_Paulo', now()))::integer,
  ALTER COLUMN current_season_year SET NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN season_year SET DEFAULT date_part('year', timezone('America/Sao_Paulo', now()))::integer,
  ALTER COLUMN season_year SET NOT NULL;

ALTER TABLE public.championship_bracket_editions
  ALTER COLUMN season_year SET DEFAULT date_part('year', timezone('America/Sao_Paulo', now()))::integer,
  ALTER COLUMN season_year SET NOT NULL;

DROP INDEX IF EXISTS public.standings_championship_sport_team_division_unique_idx;
DROP INDEX IF EXISTS public.standings_championship_sport_team_without_division_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS standings_championship_season_sport_team_division_unique_idx
  ON public.standings (championship_id, season_year, sport_id, team_id, division)
  WHERE division IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS standings_championship_season_sport_team_without_division_unique_idx
  ON public.standings (championship_id, season_year, sport_id, team_id)
  WHERE division IS NULL;

CREATE INDEX IF NOT EXISTS matches_championship_season_year_start_time_idx
  ON public.matches (championship_id, season_year, start_time);

CREATE INDEX IF NOT EXISTS championship_bracket_editions_championship_season_year_created_at_idx
  ON public.championship_bracket_editions (championship_id, season_year, created_at DESC);

CREATE OR REPLACE FUNCTION public.rebuild_standings_scope(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id
    AND standings_table.naipe = _naipe
    AND standings_table.division IS NOT DISTINCT FROM _division;

  INSERT INTO public.standings (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    played,
    wins,
    draws,
    losses,
    goals_for,
    goals_against,
    goal_diff,
    points,
    yellow_cards,
    red_cards,
    updated_at
  )
  WITH scoped_matches AS (
    SELECT
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.division,
      matches_table.home_team_id,
      matches_table.away_team_id,
      GREATEST(0, COALESCE(matches_table.home_score, 0)) AS home_score,
      GREATEST(0, COALESCE(matches_table.away_score, 0)) AS away_score,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0)) AS home_yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0)) AS home_red_cards,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0)) AS away_yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0)) AS away_red_cards,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.status = 'FINISHED'::public.match_status
      AND matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.sport_id = _sport_id
      AND matches_table.naipe = _naipe
      AND matches_table.division IS NOT DISTINCT FROM _division
  ),
  standing_rows AS (
    SELECT
      scoped_matches.championship_id,
      scoped_matches.season_year,
      scoped_matches.sport_id,
      scoped_matches.naipe,
      scoped_matches.division,
      scoped_matches.home_team_id AS team_id,
      scoped_matches.home_score AS goals_for,
      scoped_matches.away_score AS goals_against,
      CASE WHEN scoped_matches.home_score > scoped_matches.away_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_matches.home_score = scoped_matches.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_matches.home_score < scoped_matches.away_score THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_matches.home_score > scoped_matches.away_score THEN scoped_matches.points_win
        WHEN scoped_matches.home_score = scoped_matches.away_score THEN scoped_matches.points_draw
        ELSE scoped_matches.points_loss
      END AS points,
      scoped_matches.home_yellow_cards AS yellow_cards,
      scoped_matches.home_red_cards AS red_cards
    FROM scoped_matches

    UNION ALL

    SELECT
      scoped_matches.championship_id,
      scoped_matches.season_year,
      scoped_matches.sport_id,
      scoped_matches.naipe,
      scoped_matches.division,
      scoped_matches.away_team_id AS team_id,
      scoped_matches.away_score AS goals_for,
      scoped_matches.home_score AS goals_against,
      CASE WHEN scoped_matches.away_score > scoped_matches.home_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_matches.home_score = scoped_matches.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_matches.away_score < scoped_matches.home_score THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_matches.away_score > scoped_matches.home_score THEN scoped_matches.points_win
        WHEN scoped_matches.home_score = scoped_matches.away_score THEN scoped_matches.points_draw
        ELSE scoped_matches.points_loss
      END AS points,
      scoped_matches.away_yellow_cards AS yellow_cards,
      scoped_matches.away_red_cards AS red_cards
    FROM scoped_matches
  )
  SELECT
    standing_rows.championship_id,
    standing_rows.season_year,
    standing_rows.sport_id,
    standing_rows.naipe,
    standing_rows.division,
    standing_rows.team_id,
    count(*) AS played,
    sum(standing_rows.wins) AS wins,
    sum(standing_rows.draws) AS draws,
    sum(standing_rows.losses) AS losses,
    sum(standing_rows.goals_for) AS goals_for,
    sum(standing_rows.goals_against) AS goals_against,
    sum(standing_rows.goals_for - standing_rows.goals_against) AS goal_diff,
    sum(standing_rows.points) AS points,
    sum(standing_rows.yellow_cards) AS yellow_cards,
    sum(standing_rows.red_cards) AS red_cards,
    now() AS updated_at
  FROM standing_rows
  GROUP BY
    standing_rows.championship_id,
    standing_rows.season_year,
    standing_rows.sport_id,
    standing_rows.naipe,
    standing_rows.division,
    standing_rows.team_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_standings_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'FINISHED'::public.match_status THEN
      PERFORM public.rebuild_standings_scope(
        OLD.championship_id,
        OLD.season_year,
        OLD.sport_id,
        OLD.naipe,
        OLD.division
      );
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'FINISHED'::public.match_status THEN
      PERFORM public.rebuild_standings_scope(
        OLD.championship_id,
        OLD.season_year,
        OLD.sport_id,
        OLD.naipe,
        OLD.division
      );
    END IF;

    IF NEW.status = 'FINISHED'::public.match_status THEN
      PERFORM public.rebuild_standings_scope(
        NEW.championship_id,
        NEW.season_year,
        NEW.sport_id,
        NEW.naipe,
        NEW.division
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'FINISHED'::public.match_status THEN
      PERFORM public.rebuild_standings_scope(
        NEW.championship_id,
        NEW.season_year,
        NEW.sport_id,
        NEW.naipe,
        NEW.division
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS update_standings_trigger ON public.matches;

CREATE TRIGGER update_standings_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_standings_on_finish();

DELETE FROM public.standings;

INSERT INTO public.standings (
  championship_id,
  season_year,
  sport_id,
  naipe,
  division,
  team_id,
  played,
  wins,
  draws,
  losses,
  goals_for,
  goals_against,
  goal_diff,
  points,
  yellow_cards,
  red_cards,
  updated_at
)
WITH base_matches AS (
  SELECT
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.home_team_id,
    matches_table.away_team_id,
    GREATEST(0, COALESCE(matches_table.home_score, 0)) AS home_score,
    GREATEST(0, COALESCE(matches_table.away_score, 0)) AS away_score,
    GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0)) AS home_yellow_cards,
    GREATEST(0, COALESCE(matches_table.home_red_cards, 0)) AS home_red_cards,
    GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0)) AS away_yellow_cards,
    GREATEST(0, COALESCE(matches_table.away_red_cards, 0)) AS away_red_cards,
    COALESCE(championship_sports_table.points_win, 3) AS points_win,
    COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
    COALESCE(championship_sports_table.points_loss, 0) AS points_loss
  FROM public.matches AS matches_table
  LEFT JOIN public.championship_sports AS championship_sports_table
    ON championship_sports_table.championship_id = matches_table.championship_id
    AND championship_sports_table.sport_id = matches_table.sport_id
  WHERE matches_table.status = 'FINISHED'::public.match_status
),
standing_rows AS (
  SELECT
    base_matches.championship_id,
    base_matches.season_year,
    base_matches.sport_id,
    base_matches.naipe,
    base_matches.division,
    base_matches.home_team_id AS team_id,
    base_matches.home_score AS goals_for,
    base_matches.away_score AS goals_against,
    CASE WHEN base_matches.home_score > base_matches.away_score THEN 1 ELSE 0 END AS wins,
    CASE WHEN base_matches.home_score = base_matches.away_score THEN 1 ELSE 0 END AS draws,
    CASE WHEN base_matches.home_score < base_matches.away_score THEN 1 ELSE 0 END AS losses,
    CASE
      WHEN base_matches.home_score > base_matches.away_score THEN base_matches.points_win
      WHEN base_matches.home_score = base_matches.away_score THEN base_matches.points_draw
      ELSE base_matches.points_loss
    END AS points,
    base_matches.home_yellow_cards AS yellow_cards,
    base_matches.home_red_cards AS red_cards
  FROM base_matches

  UNION ALL

  SELECT
    base_matches.championship_id,
    base_matches.season_year,
    base_matches.sport_id,
    base_matches.naipe,
    base_matches.division,
    base_matches.away_team_id AS team_id,
    base_matches.away_score AS goals_for,
    base_matches.home_score AS goals_against,
    CASE WHEN base_matches.away_score > base_matches.home_score THEN 1 ELSE 0 END AS wins,
    CASE WHEN base_matches.home_score = base_matches.away_score THEN 1 ELSE 0 END AS draws,
    CASE WHEN base_matches.away_score < base_matches.home_score THEN 1 ELSE 0 END AS losses,
    CASE
      WHEN base_matches.away_score > base_matches.home_score THEN base_matches.points_win
      WHEN base_matches.home_score = base_matches.away_score THEN base_matches.points_draw
      ELSE base_matches.points_loss
    END AS points,
    base_matches.away_yellow_cards AS yellow_cards,
    base_matches.away_red_cards AS red_cards
  FROM base_matches
)
SELECT
  standing_rows.championship_id,
  standing_rows.season_year,
  standing_rows.sport_id,
  standing_rows.naipe,
  standing_rows.division,
  standing_rows.team_id,
  count(*) AS played,
  sum(standing_rows.wins) AS wins,
  sum(standing_rows.draws) AS draws,
  sum(standing_rows.losses) AS losses,
  sum(standing_rows.goals_for) AS goals_for,
  sum(standing_rows.goals_against) AS goals_against,
  sum(standing_rows.goals_for - standing_rows.goals_against) AS goal_diff,
  sum(standing_rows.points) AS points,
  sum(standing_rows.yellow_cards) AS yellow_cards,
  sum(standing_rows.red_cards) AS red_cards,
  now() AS updated_at
FROM standing_rows
GROUP BY
  standing_rows.championship_id,
  standing_rows.season_year,
  standing_rows.sport_id,
  standing_rows.naipe,
  standing_rows.division,
  standing_rows.team_id;

ALTER TABLE public.standings
  ALTER COLUMN season_year SET DEFAULT date_part('year', timezone('America/Sao_Paulo', now()))::integer,
  ALTER COLUMN season_year SET NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_championship_season_rollover()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_season_year_value INTEGER;
BEGIN
  current_season_year_value := date_part('year', timezone('America/Sao_Paulo', now()))::integer;

  UPDATE public.championships AS championships_table
  SET
    current_season_year = current_season_year_value,
    status = 'PLANNING'::public.championship_status
  WHERE championships_table.status = 'FINISHED'::public.championship_status
    AND championships_table.current_season_year < current_season_year_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_championship_season_rollover() TO anon, authenticated;

COMMENT ON FUNCTION public.rebuild_standings_scope(UUID, INTEGER, UUID, public.match_naipe, public.team_division) IS 'Recalcula classificação para um escopo específico de campeonato/temporada/modalidade/naipe/divisão.';
COMMENT ON FUNCTION public.update_standings_on_finish() IS 'Sincroniza classificação após insert/update/delete de partidas finalizadas, respeitando o recorte por temporada.';
COMMENT ON FUNCTION public.sync_championship_season_rollover() IS 'Atualiza automaticamente campeonatos encerrados para a nova temporada ao iniciar um novo ano.';

NOTIFY pgrst, 'reload schema';
