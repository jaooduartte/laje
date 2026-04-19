-- Fix: knockout matches must be placed after the last group-stage match, not on the
-- first bracket-day date.
--
-- Root cause:
--   create_championship_knockout_match_schedule() selects `selected_queue_date` from
--   championship_bracket_days ordered ASC (earliest configured day). This can be the
--   same day the group stage is still running, so the trigger assigns a queue_position
--   in the middle of existing group-stage slots (e.g. Jogo 16 when group stage reaches
--   Jogo 19 on the same day).
--
-- Fix:
--   1. Rewrite the function to derive selected_queue_date from MAX(scheduled_date) of
--      existing matches in the same championship / season, falling back to the first
--      bracket-day date when there are no matches yet.
--   2. Data-fix: move every SCHEDULED knockout match to the correct date and let the
--      trigger recalculate queue_position in insertion order.

-- ─── 1. Data fix for existing SCHEDULED knockout matches ────────────────────────────

DO $$
DECLARE
  ko_match RECORD;
  new_date  DATE;
BEGIN
  FOR ko_match IN
    SELECT
      m.id           AS match_id,
      m.championship_id,
      m.season_year,
      m.scheduled_date,
      m.queue_position
    FROM public.matches AS m
    JOIN public.championship_bracket_matches AS cbm ON cbm.match_id = m.id
    WHERE cbm.phase   = 'KNOCKOUT'::public.bracket_phase
      AND m.status    = 'SCHEDULED'::public.match_status
      AND m.scheduled_date IS NOT NULL
    ORDER BY
      m.championship_id ASC,
      m.season_year     ASC,
      m.scheduled_date  ASC,
      m.queue_position  ASC
  LOOP
    -- Last scheduled_date of non-knockout matches for this championship/season
    SELECT MAX(m2.scheduled_date)
    INTO   new_date
    FROM   public.matches AS m2
    WHERE  m2.championship_id = ko_match.championship_id
      AND  m2.season_year     = ko_match.season_year
      AND  m2.scheduled_date  IS NOT NULL
      AND  NOT EXISTS (
             SELECT 1
             FROM   public.championship_bracket_matches AS cbm2
             WHERE  cbm2.match_id = m2.id
               AND  cbm2.phase    = 'KNOCKOUT'::public.bracket_phase
           );

    -- Only update when there is a group-stage date to anchor to and the match is
    -- already on a different (earlier) date.
    IF new_date IS NOT NULL THEN
      UPDATE public.matches
      SET
        scheduled_date = new_date,
        queue_position = NULL  -- trigger assign_match_queue_position will set max+1
      WHERE id = ko_match.match_id;
    END IF;
  END LOOP;
END;
$$;

-- ─── 2. Fix create_championship_knockout_match_schedule ─────────────────────────────

CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
  selected_queue_date  DATE;
  selected_location_name TEXT;
  new_match_id         UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,
    editions_table.season_year
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL OR bracket_match_record.away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve the location from the bracket schedule configuration (unchanged logic).
  SELECT
    schedule_candidates.location_name
  INTO
    selected_location_name
  FROM (
    SELECT DISTINCT
      days_table.event_date,
      days_table.start_time,
      locations_table.position,
      locations_table.name AS location_name
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
      AND court_sports_table.sport_id    = bracket_match_record.sport_id
  ) AS schedule_candidates
  ORDER BY
    schedule_candidates.event_date    ASC,
    schedule_candidates.start_time    ASC,
    schedule_candidates.position      ASC,
    schedule_candidates.location_name ASC
  LIMIT 1;

  -- Resolve the queue date:
  --   • Primary: last scheduled_date of any existing match in this championship/season.
  --   • Fallback: first configured bracket-day date (original behaviour when there are
  --     no matches yet at all).
  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
      FROM   public.matches AS matches_table
      WHERE  matches_table.championship_id = _championship_id
        AND  matches_table.season_year     = bracket_match_record.season_year
        AND  matches_table.scheduled_date  IS NOT NULL
    ),
    (
      SELECT MIN(days_table.event_date)
      FROM   public.championship_bracket_days AS days_table
      WHERE  days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    )
  ) INTO selected_queue_date;

  IF selected_queue_date IS NULL OR selected_location_name IS NULL THEN
    RAISE EXCEPTION 'Não há local compatível configurado para gerar a fila do mata-mata nesta modalidade.';
  END IF;

  -- queue_position is intentionally NULL: the before-insert trigger
  -- assign_match_queue_position will assign max(queue_position)+1 for
  -- (championship_id, season_year, scheduled_date), which is now the last day.
  INSERT INTO public.matches (
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    scheduled_date,
    queue_position,
    start_time,
    end_time,
    season_year,
    status
  ) VALUES (
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    selected_location_name,
    NULL,
    selected_queue_date,
    NULL,
    NULL,
    NULL,
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  )
  RETURNING id INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  RETURN new_match_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
