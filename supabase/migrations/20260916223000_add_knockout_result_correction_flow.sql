CREATE TABLE IF NOT EXISTS public.championship_knockout_result_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  competition_id UUID NOT NULL REFERENCES public.championship_bracket_competitions(id) ON DELETE CASCADE,
  source_bracket_match_id UUID NOT NULL REFERENCES public.championship_bracket_matches(id) ON DELETE RESTRICT,
  source_match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  previous_winner_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  corrected_winner_team_id UUID NULL REFERENCES public.teams(id) ON DELETE SET NULL,
  walkover_mode TEXT NOT NULL CHECK (walkover_mode IN ('HOME_LOST', 'AWAY_LOST')),
  reason TEXT NULL,
  selected_replay_slot JSONB NULL,
  impact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS championship_knockout_result_corrections_source_match_idx
  ON public.championship_knockout_result_corrections (source_match_id, created_at DESC);

ALTER TABLE public.championship_knockout_result_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS championship_knockout_result_corrections_admin_read
  ON public.championship_knockout_result_corrections;

CREATE POLICY championship_knockout_result_corrections_admin_read
  ON public.championship_knockout_result_corrections
  FOR SELECT
  TO authenticated
  USING (public.has_admin_tab_access('matches'::public.admin_panel_tab, false));

REVOKE INSERT, UPDATE, DELETE ON public.championship_knockout_result_corrections FROM authenticated;
GRANT SELECT ON public.championship_knockout_result_corrections TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_knockout_result_correction(
  _match_id UUID,
  _walkover_mode TEXT,
  _include_schedule_candidates BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  normalized_walkover_mode TEXT;
  source_record RECORD;
  direct_descendant_record RECORD;
  final_slot_record RECORD;
  corrected_winner_team_id UUID;
  corrected_winner_team_name TEXT;
  previous_winner_team_id UUID;
  previous_winner_team_name TEXT;
  replay_home_team_id UUID;
  replay_away_team_id UUID;
  replay_home_team_name TEXT;
  replay_away_team_name TEXT;
  affected_match_ids UUID[] := ARRAY[]::UUID[];
  impact_items JSONB := '[]'::jsonb;
  schedule_candidates JSONB := '[]'::jsonb;
  is_blocked BOOLEAN := false;
  block_reason TEXT := NULL;
  requires_reprocessing BOOLEAN := false;
  requires_replay_schedule BOOLEAN := false;
  schedule_preview_generated BOOLEAN := false;
  replay_duration_minutes INTEGER := 0;
  downstream_deadline TIMESTAMPTZ := NULL;
  current_local_date DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  remaining_event_days INTEGER := 0;
  final_pending_side TEXT := NULL;
  final_preserved_team_id UUID := NULL;
  final_preserved_team_name TEXT := NULL;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para corrigir resultados do mata-mata.';
  END IF;

  normalized_walkover_mode := upper(trim(COALESCE(_walkover_mode, '')));

  IF normalized_walkover_mode NOT IN ('HOME_LOST', 'AWAY_LOST') THEN
    RAISE EXCEPTION 'A correção retroativa do mata-mata exige um W.O. simples.';
  END IF;

  SELECT
    matches_table.id AS match_id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.status,
    matches_table.home_team_id,
    matches_table.away_team_id,
    home_team.name AS home_team_name,
    away_team.name AS away_team_name,
    bracket_matches_table.id AS bracket_match_id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id,
    bracket_matches_table.phase,
    editions_table.season_year AS bracket_season_year
  INTO source_record
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  JOIN public.teams AS home_team ON home_team.id = matches_table.home_team_id
  JOIN public.teams AS away_team ON away_team.id = matches_table.away_team_id
  WHERE matches_table.id = _match_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  LIMIT 1;

  IF source_record.match_id IS NULL THEN
    RETURN jsonb_build_object(
      'requires_reprocessing', false,
      'is_knockout_match', false,
      'blocked', false,
      'block_reason', NULL,
      'schedule_preview_generated', false,
      'schedule_candidates', '[]'::jsonb
    );
  END IF;

  IF source_record.status <> 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'A correção retroativa só pode partir de um jogo eliminatório encerrado.';
  END IF;

  corrected_winner_team_id := CASE normalized_walkover_mode
    WHEN 'HOME_LOST' THEN source_record.away_team_id
    ELSE source_record.home_team_id
  END;

  SELECT teams_table.name
  INTO corrected_winner_team_name
  FROM public.teams AS teams_table
  WHERE teams_table.id = corrected_winner_team_id;

  previous_winner_team_id := source_record.winner_team_id;
  SELECT teams_table.name
  INTO previous_winner_team_name
  FROM public.teams AS teams_table
  WHERE teams_table.id = previous_winner_team_id;

  requires_reprocessing :=
    source_record.next_bracket_match_id IS NOT NULL
    AND previous_winner_team_id IS DISTINCT FROM corrected_winner_team_id;

  IF NOT requires_reprocessing THEN
    RETURN jsonb_build_object(
      'requires_reprocessing', false,
      'is_knockout_match', true,
      'blocked', false,
      'block_reason', NULL,
      'schedule_preview_generated', false,
      'source', jsonb_build_object(
        'match_id', source_record.match_id,
        'bracket_match_id', source_record.bracket_match_id,
        'home_team_name', source_record.home_team_name,
        'away_team_name', source_record.away_team_name,
        'previous_winner_team_id', previous_winner_team_id,
        'previous_winner_team_name', previous_winner_team_name,
        'corrected_winner_team_id', corrected_winner_team_id,
        'corrected_winner_team_name', corrected_winner_team_name,
        'walkover_mode', normalized_walkover_mode
      ),
      'schedule_candidates', '[]'::jsonb
    );
  END IF;

  WITH RECURSIVE descendant_path AS (
    SELECT
      child.id,
      child.match_id,
      child.round_number,
      child.slot_number,
      child.is_third_place,
      child.home_team_id,
      child.away_team_id,
      child.winner_team_id,
      child.source_home_bracket_match_id,
      child.source_away_bracket_match_id,
      child.next_bracket_match_id,
      child.planned_scheduled_date,
      child.planned_start_time,
      child.planned_end_time,
      child.planned_location_name,
      child.planned_court_name,
      1 AS depth
    FROM public.championship_bracket_matches AS child
    WHERE child.id = source_record.next_bracket_match_id

    UNION ALL

    SELECT
      child.id,
      child.match_id,
      child.round_number,
      child.slot_number,
      child.is_third_place,
      child.home_team_id,
      child.away_team_id,
      child.winner_team_id,
      child.source_home_bracket_match_id,
      child.source_away_bracket_match_id,
      child.next_bracket_match_id,
      child.planned_scheduled_date,
      child.planned_start_time,
      child.planned_end_time,
      child.planned_location_name,
      child.planned_court_name,
      parent.depth + 1
    FROM descendant_path AS parent
    JOIN public.championship_bracket_matches AS child
      ON child.id = parent.next_bracket_match_id
  )
  SELECT
    COALESCE(array_agg(matches_table.id) FILTER (WHERE matches_table.id IS NOT NULL), ARRAY[]::UUID[]),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'bracket_match_id', descendant_path.id,
          'match_id', matches_table.id,
          'depth', descendant_path.depth,
          'round_number', descendant_path.round_number,
          'slot_number', descendant_path.slot_number,
          'status', matches_table.status,
          'home_team_id', descendant_path.home_team_id,
          'home_team_name', home_team.name,
          'away_team_id', descendant_path.away_team_id,
          'away_team_name', away_team.name,
          'action', CASE
            WHEN descendant_path.depth = 1
              AND matches_table.status = 'FINISHED'::public.match_status
            THEN 'REPLAY'
            WHEN matches_table.id IS NOT NULL THEN 'DEMATERIALIZE'
            ELSE 'RESET_SLOT'
          END
        )
        ORDER BY descendant_path.depth
      ),
      '[]'::jsonb
    ),
    bool_or(matches_table.status = 'LIVE'::public.match_status)
  INTO affected_match_ids, impact_items, is_blocked
  FROM descendant_path
  LEFT JOIN public.matches AS matches_table ON matches_table.id = descendant_path.match_id
  LEFT JOIN public.teams AS home_team ON home_team.id = descendant_path.home_team_id
  LEFT JOIN public.teams AS away_team ON away_team.id = descendant_path.away_team_id;

  IF COALESCE(is_blocked, false) THEN
    block_reason := 'Existe um jogo posterior ao confronto em andamento. Encerre ou interrompa esse jogo antes de reprocessar o chaveamento.';
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.source_home_bracket_match_id,
    bracket_matches_table.source_away_bracket_match_id,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name,
    matches_table.status AS match_status
  INTO direct_descendant_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  LEFT JOIN public.matches AS matches_table ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = source_record.next_bracket_match_id
  LIMIT 1;

  SELECT
    CASE
      WHEN direct_descendant_record.source_home_bracket_match_id = source_record.bracket_match_id
      THEN corrected_winner_team_id
      ELSE source_home.winner_team_id
    END,
    CASE
      WHEN direct_descendant_record.source_away_bracket_match_id = source_record.bracket_match_id
      THEN corrected_winner_team_id
      ELSE source_away.winner_team_id
    END
  INTO replay_home_team_id, replay_away_team_id
  FROM public.championship_bracket_matches AS source_home
  CROSS JOIN public.championship_bracket_matches AS source_away
  WHERE source_home.id = direct_descendant_record.source_home_bracket_match_id
    AND source_away.id = direct_descendant_record.source_away_bracket_match_id;

  SELECT teams_table.name INTO replay_home_team_name
  FROM public.teams AS teams_table WHERE teams_table.id = replay_home_team_id;

  SELECT teams_table.name INTO replay_away_team_name
  FROM public.teams AS teams_table WHERE teams_table.id = replay_away_team_id;

  requires_replay_schedule :=
    direct_descendant_record.match_status = 'FINISHED'::public.match_status
    OR (
      direct_descendant_record.match_id IS NULL
      AND direct_descendant_record.planned_scheduled_date IS NOT NULL
      AND public.combine_bracket_schedule_timestamp(
        direct_descendant_record.planned_scheduled_date,
        direct_descendant_record.planned_start_time
      ) <= now()
    );

  WITH RECURSIVE descendant_path AS (
    SELECT child.*, 1 AS depth
    FROM public.championship_bracket_matches AS child
    WHERE child.id = source_record.next_bracket_match_id
    UNION ALL
    SELECT child.*, parent.depth + 1
    FROM descendant_path AS parent
    JOIN public.championship_bracket_matches AS child
      ON child.id = parent.next_bracket_match_id
  )
  SELECT path.*
  INTO final_slot_record
  FROM descendant_path AS path
  ORDER BY path.depth DESC
  LIMIT 1;

  IF final_slot_record.id IS NOT NULL AND final_slot_record.depth > 1 THEN
    WITH RECURSIVE descendant_path AS (
      SELECT child.id, child.next_bracket_match_id, 1 AS depth
      FROM public.championship_bracket_matches AS child
      WHERE child.id = source_record.next_bracket_match_id
      UNION ALL
      SELECT child.id, child.next_bracket_match_id, parent.depth + 1
      FROM descendant_path AS parent
      JOIN public.championship_bracket_matches AS child
        ON child.id = parent.next_bracket_match_id
    )
    SELECT
      CASE
        WHEN final_slot_record.source_home_bracket_match_id = parent.id THEN 'HOME'
        WHEN final_slot_record.source_away_bracket_match_id = parent.id THEN 'AWAY'
        ELSE NULL
      END
    INTO final_pending_side
    FROM descendant_path AS parent
    WHERE parent.depth = final_slot_record.depth - 1
    LIMIT 1;

    IF final_pending_side = 'HOME' THEN
      SELECT source_away.winner_team_id, teams_table.name
      INTO final_preserved_team_id, final_preserved_team_name
      FROM public.championship_bracket_matches AS source_away
      LEFT JOIN public.teams AS teams_table ON teams_table.id = source_away.winner_team_id
      WHERE source_away.id = final_slot_record.source_away_bracket_match_id;
    ELSIF final_pending_side = 'AWAY' THEN
      SELECT source_home.winner_team_id, teams_table.name
      INTO final_preserved_team_id, final_preserved_team_name
      FROM public.championship_bracket_matches AS source_home
      LEFT JOIN public.teams AS teams_table ON teams_table.id = source_home.winner_team_id
      WHERE source_home.id = final_slot_record.source_home_bracket_match_id;
    END IF;
  END IF;

  IF final_slot_record.id IS NOT NULL
    AND final_slot_record.depth > 1
    AND final_slot_record.planned_scheduled_date IS NOT NULL
    AND final_slot_record.planned_start_time IS NOT NULL
  THEN
    downstream_deadline := public.combine_bracket_schedule_timestamp(
      final_slot_record.planned_scheduled_date,
      final_slot_record.planned_start_time
    );
  END IF;

  SELECT count(DISTINCT days_table.event_date)
  INTO remaining_event_days
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.bracket_edition_id = source_record.bracket_edition_id
    AND days_table.event_date >= current_local_date;

  replay_duration_minutes := greatest(
    COALESCE(
      public.resolve_championship_sport_duration_minutes(
        source_record.championship_id,
        source_record.sport_id
      ),
      35
    ),
    1
  );

  IF _include_schedule_candidates AND requires_replay_schedule AND NOT COALESCE(is_blocked, false) THEN
    schedule_preview_generated := true;

    WITH candidate_slots AS (
      SELECT
        days_table.event_date AS scheduled_date,
        courts_table.id AS bracket_court_id,
        locations_table.location_group_id,
        courts_table.court_group_id,
        locations_table.name AS location_name,
        courts_table.name AS court_name,
        slot_start.value AS start_at,
        slot_start.value + make_interval(mins => replay_duration_minutes) AS end_at,
        COALESCE((
          SELECT max(COALESCE(matches_table.scheduled_slot, matches_table.queue_position))
          FROM public.matches AS matches_table
          WHERE matches_table.championship_id = source_record.championship_id
            AND matches_table.season_year = source_record.season_year
            AND matches_table.scheduled_date = days_table.event_date
            AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(locations_table.name)
            AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(courts_table.name)
            AND NOT (matches_table.id = ANY(affected_match_ids))
        ), 0) + 1 AS safe_queue_position
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
        AND court_sports_table.sport_id = source_record.sport_id
      CROSS JOIN LATERAL generate_series(
        public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.start_time),
        public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.end_time)
          - make_interval(mins => replay_duration_minutes),
        interval '15 minutes'
      ) AS slot_start(value)
      WHERE days_table.bracket_edition_id = source_record.bracket_edition_id
        AND days_table.event_date >= current_local_date
        AND slot_start.value > now()
        AND (
          downstream_deadline IS NULL
          OR slot_start.value + make_interval(mins => replay_duration_minutes) <= downstream_deadline
        )
        AND NOT (
          days_table.break_start_time IS NOT NULL
          AND days_table.break_end_time IS NOT NULL
          AND slot_start.value < public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.break_end_time)
          AND slot_start.value + make_interval(mins => replay_duration_minutes) > public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.break_start_time)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.championship_bracket_day_breaks AS breaks_table
          WHERE breaks_table.bracket_day_id = days_table.id
            AND (
              breaks_table.scope_type = 'ALL_COURTS'::public.bracket_day_break_scope_type
              OR (
                breaks_table.scope_type = 'COURT'::public.bracket_day_break_scope_type
                AND breaks_table.bracket_court_id = courts_table.id
              )
            )
            AND slot_start.value < public.combine_bracket_schedule_timestamp(days_table.event_date, breaks_table.break_end_time)
            AND slot_start.value + make_interval(mins => replay_duration_minutes) > public.combine_bracket_schedule_timestamp(days_table.event_date, breaks_table.break_start_time)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.matches AS matches_table
          WHERE matches_table.championship_id = source_record.championship_id
            AND matches_table.season_year = source_record.season_year
            AND matches_table.scheduled_date = days_table.event_date
            AND NOT (matches_table.id = ANY(affected_match_ids))
            AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(locations_table.name)
            AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(courts_table.name)
            AND COALESCE(matches_table.start_time, matches_table.scheduled_start_time) < slot_start.value + make_interval(mins => replay_duration_minutes)
            AND COALESCE(matches_table.end_time, matches_table.start_time) > slot_start.value
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.matches AS matches_table
          WHERE matches_table.championship_id = source_record.championship_id
            AND matches_table.season_year = source_record.season_year
            AND matches_table.scheduled_date = days_table.event_date
            AND NOT (matches_table.id = ANY(affected_match_ids))
            AND (
              matches_table.home_team_id IN (replay_home_team_id, replay_away_team_id)
              OR matches_table.away_team_id IN (replay_home_team_id, replay_away_team_id)
            )
            AND COALESCE(matches_table.start_time, matches_table.scheduled_start_time) < slot_start.value + make_interval(mins => replay_duration_minutes)
            AND COALESCE(matches_table.end_time, matches_table.start_time) > slot_start.value
        )
    ), ordered_candidates AS (
      SELECT *
      FROM candidate_slots
      ORDER BY scheduled_date ASC, start_at ASC, location_name ASC, court_name ASC
      LIMIT 30
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', concat(scheduled_date::text, '|', bracket_court_id::text, '|', to_char(start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')),
          'scheduled_date', scheduled_date,
          'bracket_court_id', bracket_court_id,
          'location_group_id', location_group_id,
          'court_group_id', court_group_id,
          'location_name', location_name,
          'court_name', court_name,
          'start_time', to_char(start_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
          'end_time', to_char(end_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
          'duration_minutes', replay_duration_minutes,
          'planned_scheduled_slot', safe_queue_position,
          'planned_queue_position', safe_queue_position
        )
        ORDER BY scheduled_date, start_at, location_name, court_name
      ),
      '[]'::jsonb
    )
    INTO schedule_candidates
    FROM ordered_candidates;
  END IF;

  RETURN jsonb_build_object(
    'requires_reprocessing', true,
    'is_knockout_match', true,
    'blocked', COALESCE(is_blocked, false),
    'block_reason', block_reason,
    'requires_replay_schedule', requires_replay_schedule,
    'schedule_preview_generated', schedule_preview_generated,
    'remaining_event_days', remaining_event_days,
    'source', jsonb_build_object(
      'match_id', source_record.match_id,
      'bracket_match_id', source_record.bracket_match_id,
      'round_number', source_record.round_number,
      'slot_number', source_record.slot_number,
      'home_team_id', source_record.home_team_id,
      'home_team_name', source_record.home_team_name,
      'away_team_id', source_record.away_team_id,
      'away_team_name', source_record.away_team_name,
      'previous_winner_team_id', previous_winner_team_id,
      'previous_winner_team_name', previous_winner_team_name,
      'corrected_winner_team_id', corrected_winner_team_id,
      'corrected_winner_team_name', corrected_winner_team_name,
      'walkover_mode', normalized_walkover_mode
    ),
    'replay_match', jsonb_build_object(
      'bracket_match_id', direct_descendant_record.id,
      'round_number', direct_descendant_record.round_number,
      'slot_number', direct_descendant_record.slot_number,
      'current_match_id', direct_descendant_record.match_id,
      'current_status', direct_descendant_record.match_status,
      'home_team_id', replay_home_team_id,
      'home_team_name', replay_home_team_name,
      'away_team_id', replay_away_team_id,
      'away_team_name', replay_away_team_name,
      'duration_minutes', replay_duration_minutes
    ),
    'final_slot', CASE
      WHEN final_slot_record.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'bracket_match_id', final_slot_record.id,
        'round_number', final_slot_record.round_number,
        'slot_number', final_slot_record.slot_number,
        'planned_scheduled_date', final_slot_record.planned_scheduled_date,
        'planned_start_time', final_slot_record.planned_start_time,
        'planned_end_time', final_slot_record.planned_end_time,
        'planned_location_name', final_slot_record.planned_location_name,
        'planned_court_name', final_slot_record.planned_court_name,
        'pending_side', final_pending_side,
        'preserved_team_id', final_preserved_team_id,
        'preserved_team_name', final_preserved_team_name
      )
    END,
    'impacts', impact_items,
    'schedule_candidates', schedule_candidates
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.apply_knockout_result_correction(
  _match_id UUID,
  _walkover_mode TEXT,
  _schedule_candidate_id TEXT DEFAULT NULL,
  _reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  preview_payload JSONB;
  selected_candidate JSONB := NULL;
  source_bracket_match_id UUID;
  source_competition_id UUID;
  source_championship_id UUID;
  source_season_year INTEGER;
  previous_winner_team_id UUID;
  corrected_winner_team_id UUID;
  direct_descendant_id UUID;
  direct_descendant_status TEXT;
  requires_replay_schedule BOOLEAN;
  affected_match_ids UUID[] := ARRAY[]::UUID[];
  archived_matches_payload JSONB := '[]'::jsonb;
  correction_id UUID;
  new_replay_match_id UUID := NULL;
  normalized_walkover_mode TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Sem permissão para corrigir resultados do mata-mata.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_match_id::text, 0));

  normalized_walkover_mode := upper(trim(COALESCE(_walkover_mode, '')));
  preview_payload := public.preview_knockout_result_correction(
    _match_id,
    normalized_walkover_mode,
    true
  );

  IF COALESCE((preview_payload ->> 'blocked')::BOOLEAN, false) THEN
    RAISE EXCEPTION '%', COALESCE(preview_payload ->> 'block_reason', 'O chaveamento não pode ser reprocessado agora.');
  END IF;

  IF NOT COALESCE((preview_payload ->> 'requires_reprocessing')::BOOLEAN, false) THEN
    RETURN public.save_finished_match_walkover(_match_id, normalized_walkover_mode);
  END IF;

  source_bracket_match_id := (preview_payload #>> '{source,bracket_match_id}')::UUID;
  previous_winner_team_id := NULLIF(preview_payload #>> '{source,previous_winner_team_id}', '')::UUID;
  corrected_winner_team_id := NULLIF(preview_payload #>> '{source,corrected_winner_team_id}', '')::UUID;
  direct_descendant_id := (preview_payload #>> '{replay_match,bracket_match_id}')::UUID;
  direct_descendant_status := preview_payload #>> '{replay_match,current_status}';
  requires_replay_schedule := COALESCE((preview_payload ->> 'requires_replay_schedule')::BOOLEAN, false);

  SELECT
    matches_table.championship_id,
    matches_table.season_year,
    bracket_matches_table.competition_id
  INTO source_championship_id, source_season_year, source_competition_id
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF requires_replay_schedule THEN
    IF NULLIF(trim(COALESCE(_schedule_candidate_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Selecione um horário válido para refazer o confronto afetado.';
    END IF;

    SELECT candidate.value
    INTO selected_candidate
    FROM jsonb_array_elements(COALESCE(preview_payload -> 'schedule_candidates', '[]'::jsonb)) AS candidate(value)
    WHERE candidate.value ->> 'id' = _schedule_candidate_id
    LIMIT 1;

    IF selected_candidate IS NULL THEN
      RAISE EXCEPTION 'O horário selecionado não está mais disponível. Gere uma nova prévia.';
    END IF;
  END IF;

  WITH RECURSIVE descendant_path AS (
    SELECT child.id, child.match_id, child.next_bracket_match_id, child.round_number, child.slot_number, 1 AS depth
    FROM public.championship_bracket_matches AS source_match
    JOIN public.championship_bracket_matches AS child
      ON child.id = source_match.next_bracket_match_id
    WHERE source_match.id = source_bracket_match_id

    UNION ALL

    SELECT child.id, child.match_id, child.next_bracket_match_id, child.round_number, child.slot_number, parent.depth + 1
    FROM descendant_path AS parent
    JOIN public.championship_bracket_matches AS child
      ON child.id = parent.next_bracket_match_id
  )
  SELECT
    COALESCE(array_agg(matches_table.id) FILTER (WHERE matches_table.id IS NOT NULL), ARRAY[]::UUID[]),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'bracket_match_id', descendant_path.id,
          'round_number', descendant_path.round_number,
          'slot_number', descendant_path.slot_number,
          'depth', descendant_path.depth,
          'match', to_jsonb(matches_table),
          'sets', COALESCE((
            SELECT jsonb_agg(to_jsonb(match_sets_table) ORDER BY match_sets_table.set_number)
            FROM public.match_sets AS match_sets_table
            WHERE match_sets_table.match_id = matches_table.id
          ), '[]'::jsonb)
        )
        ORDER BY descendant_path.depth
      ) FILTER (WHERE matches_table.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO affected_match_ids, archived_matches_payload
  FROM descendant_path
  LEFT JOIN public.matches AS matches_table ON matches_table.id = descendant_path.match_id;

  INSERT INTO public.championship_knockout_result_corrections (
    championship_id,
    season_year,
    competition_id,
    source_bracket_match_id,
    source_match_id,
    previous_winner_team_id,
    corrected_winner_team_id,
    walkover_mode,
    reason,
    selected_replay_slot,
    impact_snapshot,
    archived_matches,
    created_by
  ) VALUES (
    source_championship_id,
    source_season_year,
    source_competition_id,
    source_bracket_match_id,
    _match_id,
    previous_winner_team_id,
    corrected_winner_team_id,
    normalized_walkover_mode,
    NULLIF(trim(COALESCE(_reason, '')), ''),
    selected_candidate,
    preview_payload,
    archived_matches_payload,
    auth.uid()
  )
  RETURNING id INTO correction_id;

  IF direct_descendant_status = 'SCHEDULED' THEN
    UPDATE public.championship_bracket_matches AS direct_match
    SET
      home_team_id = CASE
        WHEN direct_match.source_home_bracket_match_id = source_bracket_match_id
          THEN corrected_winner_team_id
        ELSE source_home.winner_team_id
      END,
      away_team_id = CASE
        WHEN direct_match.source_away_bracket_match_id = source_bracket_match_id
          THEN corrected_winner_team_id
        ELSE source_away.winner_team_id
      END,
      winner_team_id = NULL
    FROM public.championship_bracket_matches AS source_home,
         public.championship_bracket_matches AS source_away
    WHERE direct_match.id = direct_descendant_id
      AND source_home.id = direct_match.source_home_bracket_match_id
      AND source_away.id = direct_match.source_away_bracket_match_id;

    PERFORM public.sync_championship_bracket_match_participants(direct_descendant_id);
  ELSE
    WITH RECURSIVE descendant_path AS (
      SELECT child.id, child.match_id, child.next_bracket_match_id, 1 AS depth
      FROM public.championship_bracket_matches AS source_match
      JOIN public.championship_bracket_matches AS child
        ON child.id = source_match.next_bracket_match_id
      WHERE source_match.id = source_bracket_match_id

      UNION ALL

      SELECT child.id, child.match_id, child.next_bracket_match_id, parent.depth + 1
      FROM descendant_path AS parent
      JOIN public.championship_bracket_matches AS child
        ON child.id = parent.next_bracket_match_id
    )
    UPDATE public.championship_bracket_matches AS target
    SET match_id = NULL,
        winner_team_id = NULL
    FROM descendant_path
    WHERE target.id = descendant_path.id;

    IF cardinality(affected_match_ids) > 0 THEN
      DELETE FROM public.matches AS matches_table
      WHERE matches_table.id = ANY(affected_match_ids);
    END IF;

    IF selected_candidate IS NOT NULL THEN
      UPDATE public.championship_bracket_matches
      SET
        planned_scheduled_date = (selected_candidate ->> 'scheduled_date')::DATE,
        planned_scheduled_slot = (selected_candidate ->> 'planned_scheduled_slot')::INTEGER,
        planned_queue_position = (selected_candidate ->> 'planned_queue_position')::INTEGER,
        planned_start_time = (selected_candidate ->> 'start_time')::TIME,
        planned_end_time = (selected_candidate ->> 'end_time')::TIME,
        planned_location_group_id = NULLIF(selected_candidate ->> 'location_group_id', '')::UUID,
        planned_court_group_id = NULLIF(selected_candidate ->> 'court_group_id', '')::UUID,
        planned_location_name = selected_candidate ->> 'location_name',
        planned_court_name = selected_candidate ->> 'court_name'
      WHERE id = direct_descendant_id;
    END IF;
  END IF;

  PERFORM public.save_finished_match_walkover(_match_id, normalized_walkover_mode);

  IF direct_descendant_status <> 'SCHEDULED' THEN
    SELECT bracket_matches_table.match_id
    INTO new_replay_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.id = direct_descendant_id;

    WITH RECURSIVE descendant_path AS (
      SELECT child.id, child.next_bracket_match_id, 1 AS depth
      FROM public.championship_bracket_matches AS child
      WHERE child.id = direct_descendant_id

      UNION ALL

      SELECT child.id, child.next_bracket_match_id, parent.depth + 1
      FROM descendant_path AS parent
      JOIN public.championship_bracket_matches AS child
        ON child.id = parent.next_bracket_match_id
    )
    UPDATE public.championship_bracket_matches AS target
    SET
      home_team_id = source_home.winner_team_id,
      away_team_id = source_away.winner_team_id,
      winner_team_id = NULL,
      match_id = CASE WHEN descendant_path.depth = 1 THEN target.match_id ELSE NULL END
    FROM descendant_path
    LEFT JOIN public.championship_bracket_matches AS source_home
      ON source_home.id = target.source_home_bracket_match_id
    LEFT JOIN public.championship_bracket_matches AS source_away
      ON source_away.id = target.source_away_bracket_match_id
    WHERE target.id = descendant_path.id
      AND descendant_path.depth > 1;
  ELSE
    SELECT bracket_matches_table.match_id
    INTO new_replay_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.id = direct_descendant_id;
  END IF;

  RETURN jsonb_build_object(
    'correction_id', correction_id,
    'source_match_id', _match_id,
    'corrected_winner_team_id', corrected_winner_team_id,
    'replay_bracket_match_id', direct_descendant_id,
    'replay_match_id', new_replay_match_id,
    'final_slot', preview_payload -> 'final_slot'
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.preview_knockout_result_correction(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_knockout_result_correction(UUID, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_knockout_result_correction(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_knockout_result_correction(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.preview_knockout_result_correction(UUID, TEXT, BOOLEAN)
IS 'Pré-visualiza o impacto de uma correção retroativa por W.O. no mata-mata e, opcionalmente, calcula horários futuros válidos para o confronto que precisa ser refeito.';

COMMENT ON FUNCTION public.apply_knockout_result_correction(UUID, TEXT, TEXT, TEXT)
IS 'Aplica atomicamente uma correção retroativa por W.O.: arquiva jogos descendentes invalidados, preserva a estrutura do chaveamento, agenda o confronto a ser refeito e mantém participantes já confirmados nos ramos não afetados.';

NOTIFY pgrst, 'reload schema';
