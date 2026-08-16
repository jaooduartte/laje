CREATE OR REPLACE FUNCTION public.resolve_match_queue_swap_eligibility(
  _source_match_id UUID,
  _target_match_id UUID
)
RETURNS TABLE (
  conflict_message TEXT,
  uses_reduced_cross_sport_rest_gap BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  source_match RECORD;
  target_match RECORD;
  latest_bracket_edition_id UUID;
  setup_payload JSONB;
  source_competition_key TEXT;
  target_competition_key TEXT;
  source_is_knockout BOOLEAN := false;
  target_is_knockout BOOLEAN := false;
  source_schedule_is_valid BOOLEAN := false;
  target_schedule_is_valid BOOLEAN := false;
  source_competition_is_available BOOLEAN := false;
  target_competition_is_available BOOLEAN := false;
  source_teams_are_available BOOLEAN := false;
  target_teams_are_available BOOLEAN := false;
  source_duration_minutes INTEGER;
  target_duration_minutes INTEGER;
  source_swapped_end_time TIMESTAMPTZ;
  target_swapped_end_time TIMESTAMPTZ;
BEGIN
  IF _source_match_id IS NULL OR _target_match_id IS NULL THEN
    RETURN QUERY SELECT 'Informe os dois jogos para realizar a troca de fila.', false;
    RETURN;
  END IF;

  IF _source_match_id = _target_match_id THEN
    RETURN QUERY SELECT 'Selecione jogos diferentes para trocar a fila.', false;
    RETURN;
  END IF;

  SELECT
    matches_table.*,
    COALESCE(matches_table.scheduled_slot, matches_table.queue_position) AS queue_slot
  INTO source_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _source_match_id
  LIMIT 1;

  SELECT
    matches_table.*,
    COALESCE(matches_table.scheduled_slot, matches_table.queue_position) AS queue_slot
  INTO target_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _target_match_id
  LIMIT 1;

  IF source_match.id IS NULL OR target_match.id IS NULL THEN
    RETURN QUERY SELECT 'Não foi possível localizar os jogos selecionados para troca de fila.', false;
    RETURN;
  END IF;

  IF source_match.status != 'SCHEDULED'::public.match_status
    OR target_match.status != 'SCHEDULED'::public.match_status THEN
    RETURN QUERY SELECT 'A troca de fila só pode ser realizada entre jogos agendados.', false;
    RETURN;
  END IF;

  IF source_match.scheduled_date IS NULL OR target_match.scheduled_date IS NULL
    OR source_match.queue_slot IS NULL OR target_match.queue_slot IS NULL
    OR source_match.queue_slot < 1 OR target_match.queue_slot < 1 THEN
    RETURN QUERY SELECT 'Os jogos selecionados precisam ter data e posição válidas na fila.', false;
    RETURN;
  END IF;

  IF source_match.championship_id != target_match.championship_id
    OR source_match.season_year != target_match.season_year
    OR source_match.sport_id != target_match.sport_id
    OR source_match.naipe != target_match.naipe
    OR public.normalize_bracket_entity_name(source_match.location) != public.normalize_bracket_entity_name(target_match.location)
    OR public.normalize_bracket_entity_name(source_match.court_name) != public.normalize_bracket_entity_name(target_match.court_name) THEN
    RETURN QUERY SELECT 'A troca exige jogos da mesma modalidade, naipe e quadra.', false;
    RETURN;
  END IF;

  SELECT editions_table.id
  INTO latest_bracket_edition_id
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.championship_id = source_match.championship_id
    AND editions_table.season_year = source_match.season_year
  ORDER BY editions_table.updated_at DESC NULLS LAST, editions_table.created_at DESC
  LIMIT 1;

  setup_payload := public.get_championship_setup_payload_snapshot(
    source_match.championship_id,
    source_match.season_year
  );

  source_competition_key := format(
    '%s::%s::%s',
    source_match.sport_id,
    source_match.naipe,
    COALESCE(source_match.division::text, 'WITHOUT_DIVISION')
  );
  target_competition_key := format(
    '%s::%s::%s',
    target_match.sport_id,
    target_match.naipe,
    COALESCE(target_match.division::text, 'WITHOUT_DIVISION')
  );

  source_duration_minutes := GREATEST(
    COALESCE(
      public.resolve_championship_sport_duration_minutes(
        source_match.championship_id,
        source_match.sport_id
      ),
      35
    ),
    1
  );
  target_duration_minutes := GREATEST(
    COALESCE(
      public.resolve_championship_sport_duration_minutes(
        target_match.championship_id,
        target_match.sport_id
      ),
      35
    ),
    1
  );
  source_swapped_end_time := COALESCE(
    target_match.end_time,
    target_match.start_time + make_interval(mins => source_duration_minutes)
  );
  target_swapped_end_time := COALESCE(
    source_match.end_time,
    source_match.start_time + make_interval(mins => target_duration_minutes)
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = source_match.id
      AND bracket_matches_table.group_id IS NULL
  )
  INTO source_is_knockout;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = target_match.id
      AND bracket_matches_table.group_id IS NULL
  )
  INTO target_is_knockout;

  IF latest_bracket_edition_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = latest_bracket_edition_id
        AND days_table.event_date = target_match.scheduled_date
        AND court_sports_table.sport_id = source_match.sport_id
        AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(source_match.location)
        AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(source_match.court_name)
        AND target_match.start_time >= make_timestamptz(
          EXTRACT(YEAR FROM target_match.scheduled_date)::integer,
          EXTRACT(MONTH FROM target_match.scheduled_date)::integer,
          EXTRACT(DAY FROM target_match.scheduled_date)::integer,
          EXTRACT(HOUR FROM days_table.start_time)::integer,
          EXTRACT(MINUTE FROM days_table.start_time)::integer,
          0,
          'America/Sao_Paulo'
        )
        AND source_swapped_end_time <= make_timestamptz(
          EXTRACT(YEAR FROM target_match.scheduled_date)::integer,
          EXTRACT(MONTH FROM target_match.scheduled_date)::integer,
          EXTRACT(DAY FROM target_match.scheduled_date)::integer,
          EXTRACT(HOUR FROM days_table.end_time)::integer,
          EXTRACT(MINUTE FROM days_table.end_time)::integer,
          0,
          'America/Sao_Paulo'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.championship_bracket_day_breaks AS breaks_table
          WHERE breaks_table.bracket_day_id = days_table.id
            AND (
              breaks_table.scope_type = 'ALL_COURTS'
              OR (breaks_table.scope_type = 'COURT' AND breaks_table.bracket_court_id = courts_table.id)
            )
            AND target_match.start_time < make_timestamptz(
              EXTRACT(YEAR FROM target_match.scheduled_date)::integer,
              EXTRACT(MONTH FROM target_match.scheduled_date)::integer,
              EXTRACT(DAY FROM target_match.scheduled_date)::integer,
              EXTRACT(HOUR FROM breaks_table.break_end_time)::integer,
              EXTRACT(MINUTE FROM breaks_table.break_end_time)::integer,
              0,
              'America/Sao_Paulo'
            )
            AND source_swapped_end_time > make_timestamptz(
              EXTRACT(YEAR FROM target_match.scheduled_date)::integer,
              EXTRACT(MONTH FROM target_match.scheduled_date)::integer,
              EXTRACT(DAY FROM target_match.scheduled_date)::integer,
              EXTRACT(HOUR FROM breaks_table.break_start_time)::integer,
              EXTRACT(MINUTE FROM breaks_table.break_start_time)::integer,
              0,
              'America/Sao_Paulo'
            )
        )
    )
    INTO source_schedule_is_valid;

    SELECT EXISTS (
      SELECT 1
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = latest_bracket_edition_id
        AND days_table.event_date = source_match.scheduled_date
        AND court_sports_table.sport_id = target_match.sport_id
        AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(target_match.location)
        AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(target_match.court_name)
        AND source_match.start_time >= make_timestamptz(
          EXTRACT(YEAR FROM source_match.scheduled_date)::integer,
          EXTRACT(MONTH FROM source_match.scheduled_date)::integer,
          EXTRACT(DAY FROM source_match.scheduled_date)::integer,
          EXTRACT(HOUR FROM days_table.start_time)::integer,
          EXTRACT(MINUTE FROM days_table.start_time)::integer,
          0,
          'America/Sao_Paulo'
        )
        AND target_swapped_end_time <= make_timestamptz(
          EXTRACT(YEAR FROM source_match.scheduled_date)::integer,
          EXTRACT(MONTH FROM source_match.scheduled_date)::integer,
          EXTRACT(DAY FROM source_match.scheduled_date)::integer,
          EXTRACT(HOUR FROM days_table.end_time)::integer,
          EXTRACT(MINUTE FROM days_table.end_time)::integer,
          0,
          'America/Sao_Paulo'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.championship_bracket_day_breaks AS breaks_table
          WHERE breaks_table.bracket_day_id = days_table.id
            AND (
              breaks_table.scope_type = 'ALL_COURTS'
              OR (breaks_table.scope_type = 'COURT' AND breaks_table.bracket_court_id = courts_table.id)
            )
            AND source_match.start_time < make_timestamptz(
              EXTRACT(YEAR FROM source_match.scheduled_date)::integer,
              EXTRACT(MONTH FROM source_match.scheduled_date)::integer,
              EXTRACT(DAY FROM source_match.scheduled_date)::integer,
              EXTRACT(HOUR FROM breaks_table.break_end_time)::integer,
              EXTRACT(MINUTE FROM breaks_table.break_end_time)::integer,
              0,
              'America/Sao_Paulo'
            )
            AND target_swapped_end_time > make_timestamptz(
              EXTRACT(YEAR FROM source_match.scheduled_date)::integer,
              EXTRACT(MONTH FROM source_match.scheduled_date)::integer,
              EXTRACT(DAY FROM source_match.scheduled_date)::integer,
              EXTRACT(HOUR FROM breaks_table.break_start_time)::integer,
              EXTRACT(MINUTE FROM breaks_table.break_start_time)::integer,
              0,
              'America/Sao_Paulo'
            )
        )
    )
    INTO target_schedule_is_valid;
  ELSE
    source_schedule_is_valid := true;
    target_schedule_is_valid := true;
  END IF;

  IF NOT source_schedule_is_valid OR NOT target_schedule_is_valid THEN
    RETURN QUERY SELECT 'A troca não respeita a agenda configurada para a modalidade, quadra ou intervalo.', false;
    RETURN;
  END IF;

  IF setup_payload IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.resolve_championship_bracket_competition_schedule_windows(
        setup_payload,
        source_competition_key,
        target_match.scheduled_date
      ) AS windows_table
      WHERE target_match.start_time >= windows_table.window_start_at
        AND source_swapped_end_time <= windows_table.window_end_at
    )
    INTO source_competition_is_available;

    SELECT EXISTS (
      SELECT 1
      FROM public.resolve_championship_bracket_competition_schedule_windows(
        setup_payload,
        target_competition_key,
        source_match.scheduled_date
      ) AS windows_table
      WHERE source_match.start_time >= windows_table.window_start_at
        AND target_swapped_end_time <= windows_table.window_end_at
    )
    INTO target_competition_is_available;

    SELECT EXISTS (
      SELECT 1
      FROM public.resolve_championship_bracket_team_schedule_windows(
        setup_payload,
        source_match.home_team_id,
        source_competition_key,
        target_match.scheduled_date
      ) AS home_windows
      WHERE target_match.start_time >= home_windows.window_start_at
        AND source_swapped_end_time <= home_windows.window_end_at
    )
    AND EXISTS (
      SELECT 1
      FROM public.resolve_championship_bracket_team_schedule_windows(
        setup_payload,
        source_match.away_team_id,
        source_competition_key,
        target_match.scheduled_date
      ) AS away_windows
      WHERE target_match.start_time >= away_windows.window_start_at
        AND source_swapped_end_time <= away_windows.window_end_at
    )
    INTO source_teams_are_available;

    SELECT EXISTS (
      SELECT 1
      FROM public.resolve_championship_bracket_team_schedule_windows(
        setup_payload,
        target_match.home_team_id,
        target_competition_key,
        source_match.scheduled_date
      ) AS home_windows
      WHERE source_match.start_time >= home_windows.window_start_at
        AND target_swapped_end_time <= home_windows.window_end_at
    )
    AND EXISTS (
      SELECT 1
      FROM public.resolve_championship_bracket_team_schedule_windows(
        setup_payload,
        target_match.away_team_id,
        target_competition_key,
        source_match.scheduled_date
      ) AS away_windows
      WHERE source_match.start_time >= away_windows.window_start_at
        AND target_swapped_end_time <= away_windows.window_end_at
    )
    INTO target_teams_are_available;
  ELSE
    source_competition_is_available := true;
    target_competition_is_available := true;
    source_teams_are_available := true;
    target_teams_are_available := true;
  END IF;

  IF NOT source_competition_is_available OR NOT target_competition_is_available
    OR NOT source_teams_are_available OR NOT target_teams_are_available THEN
    RETURN QUERY SELECT 'A troca não respeita a disponibilidade configurada da modalidade ou das atléticas.', false;
    RETURN;
  END IF;

  RETURN QUERY
  WITH simulated_matches AS (
    SELECT
      matches_table.id,
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.start_time,
      COALESCE(
        matches_table.end_time,
        matches_table.start_time + make_interval(
          mins => GREATEST(
            COALESCE(championship_sports_table.default_match_duration_minutes, 35),
            1
          )
        )
      ) AS end_time,
      COALESCE(matches_table.scheduled_slot, matches_table.queue_position) AS queue_slot,
      matches_table.created_at,
      matches_table.manual_representation_mode,
      EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.match_id = matches_table.id
          AND bracket_matches_table.group_id IS NULL
      ) AS is_knockout
    FROM public.matches AS matches_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    WHERE matches_table.championship_id = source_match.championship_id
      AND matches_table.season_year = source_match.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IN (source_match.scheduled_date, target_match.scheduled_date)
      AND matches_table.id NOT IN (source_match.id, target_match.id)

    UNION ALL

    SELECT source_match.id, target_match.scheduled_date, source_match.location,
      source_match.court_name, source_match.sport_id, source_match.naipe,
      source_match.home_team_id, source_match.away_team_id, target_match.start_time,
      source_swapped_end_time, target_match.queue_slot, source_match.created_at,
      source_match.manual_representation_mode, source_is_knockout

    UNION ALL

    SELECT target_match.id, source_match.scheduled_date, target_match.location,
      target_match.court_name, target_match.sport_id, target_match.naipe,
      target_match.home_team_id, target_match.away_team_id, source_match.start_time,
      target_swapped_end_time, source_match.queue_slot, target_match.created_at,
      target_match.manual_representation_mode, target_is_knockout
  ), ordered_matches AS (
    SELECT simulated_matches.*,
      row_number() OVER (
        PARTITION BY scheduled_date, public.normalize_bracket_entity_name(location), public.normalize_bracket_entity_name(court_name)
        ORDER BY start_time ASC NULLS LAST, queue_slot ASC NULLS LAST, created_at ASC, id ASC
      ) AS court_position
    FROM simulated_matches
  ), affected_matches AS (
    SELECT *
    FROM ordered_matches
    WHERE id IN (source_match.id, target_match.id)
  ), rest_conflicts AS (
    SELECT
      first_match.id AS affected_match_id,
      second_match.sport_id != first_match.sport_id AS is_cross_sport,
      CASE
        WHEN public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(second_match.location)
          AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(second_match.court_name)
        THEN abs(first_match.court_position - second_match.court_position) < CASE WHEN first_match.sport_id = second_match.sport_id THEN 3 ELSE 2 END
        ELSE abs(EXTRACT(EPOCH FROM (second_match.start_time - first_match.start_time)) / 60.0)
          < GREATEST(
            EXTRACT(EPOCH FROM (first_match.end_time - first_match.start_time)) / 60.0,
            EXTRACT(EPOCH FROM (second_match.end_time - second_match.start_time)) / 60.0,
            1
          ) * CASE WHEN first_match.sport_id = second_match.sport_id THEN 3 ELSE 2 END
      END AS has_conflict,
      CASE
        WHEN public.normalize_bracket_entity_name(first_match.location) = public.normalize_bracket_entity_name(second_match.location)
          AND public.normalize_bracket_entity_name(first_match.court_name) = public.normalize_bracket_entity_name(second_match.court_name)
        THEN abs(first_match.court_position - second_match.court_position) = 2
        ELSE abs(EXTRACT(EPOCH FROM (second_match.start_time - first_match.start_time)) / 60.0)
          < GREATEST(
            EXTRACT(EPOCH FROM (first_match.end_time - first_match.start_time)) / 60.0,
            EXTRACT(EPOCH FROM (second_match.end_time - second_match.start_time)) / 60.0,
            1
          ) * 3
      END AS uses_reduced_gap
    FROM affected_matches AS first_match
    JOIN ordered_matches AS second_match
      ON second_match.id != first_match.id
      AND second_match.scheduled_date = first_match.scheduled_date
      AND second_match.naipe = first_match.naipe
      AND (
        second_match.home_team_id IN (first_match.home_team_id, first_match.away_team_id)
        OR second_match.away_team_id IN (first_match.home_team_id, first_match.away_team_id)
      )
    WHERE NOT first_match.is_knockout
  ), representation_conflicts AS (
    SELECT 1
    FROM ordered_matches AS current_match
    JOIN ordered_matches AS previous_match
      ON previous_match.scheduled_date = current_match.scheduled_date
      AND public.normalize_bracket_entity_name(previous_match.location) = public.normalize_bracket_entity_name(current_match.location)
      AND public.normalize_bracket_entity_name(previous_match.court_name) = public.normalize_bracket_entity_name(current_match.court_name)
      AND previous_match.court_position = current_match.court_position - 1
    WHERE current_match.id IN (source_match.id, target_match.id)
      AND COALESCE(current_match.manual_representation_mode, 'AUTO') != 'CO'
      AND (
        previous_match.home_team_id IN (current_match.home_team_id, current_match.away_team_id)
        OR previous_match.away_team_id IN (current_match.home_team_id, current_match.away_team_id)
      )
    LIMIT 1
  )
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM rest_conflicts WHERE has_conflict)
        THEN 'A troca não preserva o descanso exigido entre as atléticas envolvidas.'
      WHEN EXISTS (SELECT 1 FROM representation_conflicts)
        THEN 'A troca cria conflito de representação na mesma quadra.'
      ELSE NULL
    END,
    COALESCE(bool_or(is_cross_sport AND uses_reduced_gap AND NOT has_conflict), false)
  FROM rest_conflicts;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_match_queue_swap_conflict(
  _source_match_id UUID,
  _target_match_id UUID
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT eligibility.conflict_message
  FROM public.resolve_match_queue_swap_eligibility(
    _source_match_id,
    _target_match_id
  ) AS eligibility
$$;

DROP FUNCTION IF EXISTS public.list_match_queue_swap_candidates(UUID);

CREATE FUNCTION public.list_match_queue_swap_candidates(
  _source_match_id UUID
)
RETURNS TABLE (
  match_id UUID,
  scheduled_date DATE,
  start_time TIMESTAMPTZ,
  queue_position INTEGER,
  scheduled_slot INTEGER,
  created_at TIMESTAMPTZ,
  home_team_name TEXT,
  away_team_name TEXT,
  uses_reduced_cross_sport_rest_gap BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para trocar jogos na fila.';
  END IF;

  RETURN QUERY
  SELECT
    candidate_matches.id,
    candidate_matches.scheduled_date,
    candidate_matches.start_time,
    candidate_matches.queue_position,
    candidate_matches.scheduled_slot,
    candidate_matches.created_at,
    home_teams_table.name,
    away_teams_table.name,
    eligibility.uses_reduced_cross_sport_rest_gap
  FROM public.matches AS source_match
  JOIN public.matches AS candidate_matches
    ON candidate_matches.id != source_match.id
    AND candidate_matches.status = 'SCHEDULED'::public.match_status
    AND candidate_matches.championship_id = source_match.championship_id
    AND candidate_matches.season_year = source_match.season_year
    AND candidate_matches.sport_id = source_match.sport_id
    AND candidate_matches.naipe = source_match.naipe
    AND public.normalize_bracket_entity_name(candidate_matches.location) = public.normalize_bracket_entity_name(source_match.location)
    AND public.normalize_bracket_entity_name(candidate_matches.court_name) = public.normalize_bracket_entity_name(source_match.court_name)
    AND COALESCE(candidate_matches.scheduled_slot, candidate_matches.queue_position) > 0
  CROSS JOIN LATERAL public.resolve_match_queue_swap_eligibility(
    source_match.id,
    candidate_matches.id
  ) AS eligibility
  LEFT JOIN public.teams AS home_teams_table
    ON home_teams_table.id = candidate_matches.home_team_id
  LEFT JOIN public.teams AS away_teams_table
    ON away_teams_table.id = candidate_matches.away_team_id
  WHERE source_match.id = _source_match_id
    AND source_match.status = 'SCHEDULED'::public.match_status
    AND source_match.scheduled_date IS NOT NULL
    AND COALESCE(source_match.scheduled_slot, source_match.queue_position) > 0
    AND eligibility.conflict_message IS NULL
  ORDER BY candidate_matches.scheduled_date, candidate_matches.start_time NULLS LAST,
    COALESCE(candidate_matches.scheduled_slot, candidate_matches.queue_position), candidate_matches.created_at, candidate_matches.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_match_queue_swap_candidates(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.list_match_queue_swap_candidates(UUID)
IS 'Lista jogos elegíveis da mesma modalidade, naipe e quadra, simulando a troca segundo as restrições da prévia exata.';

NOTIFY pgrst, 'reload schema';
