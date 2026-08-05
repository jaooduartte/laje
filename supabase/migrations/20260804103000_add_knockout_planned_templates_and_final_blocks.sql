ALTER TABLE public.championship_bracket_matches
  ADD COLUMN IF NOT EXISTS planned_scheduled_date DATE NULL,
  ADD COLUMN IF NOT EXISTS planned_period public.championship_schedule_period NULL,
  ADD COLUMN IF NOT EXISTS planned_scheduled_slot INTEGER NULL,
  ADD COLUMN IF NOT EXISTS planned_queue_position INTEGER NULL,
  ADD COLUMN IF NOT EXISTS planned_start_time TIME NULL,
  ADD COLUMN IF NOT EXISTS planned_end_time TIME NULL,
  ADD COLUMN IF NOT EXISTS planned_location_group_id UUID NULL,
  ADD COLUMN IF NOT EXISTS planned_court_group_id UUID NULL,
  ADD COLUMN IF NOT EXISTS planned_location_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS planned_court_name TEXT NULL;

CREATE OR REPLACE FUNCTION public.assign_championship_knockout_match_planned_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
  competition_total_rounds INTEGER;
  resolved_phase public.bracket_knockout_priority_phase;
  resolved_division_scope public.bracket_knockout_division_scope;
  selected_queue_date DATE;
  selected_location_name TEXT;
  selected_court_name TEXT;
  selected_location_group_id UUID;
  selected_court_group_id UUID;
  selected_period public.championship_schedule_period;
  selected_display_order INTEGER;
  selected_naipe_position INTEGER;
  selected_preferred_court_group_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.is_third_place,
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
    RETURN;
  END IF;

  SELECT MAX(bracket_matches_table.round_number) FILTER (WHERE bracket_matches_table.is_third_place = false)
  INTO competition_total_rounds
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = bracket_match_record.competition_id;

  resolved_phase := public.resolve_bracket_knockout_match_phase(
    bracket_match_record.round_number,
    competition_total_rounds,
    bracket_match_record.is_third_place
  );
  resolved_division_scope := public.resolve_bracket_knockout_division_scope(bracket_match_record.division);

  selected_queue_date := NULL;
  selected_location_name := NULL;
  selected_court_name := NULL;
  selected_location_group_id := NULL;
  selected_court_group_id := NULL;
  selected_period := NULL;
  selected_display_order := NULL;
  selected_naipe_position := NULL;

  IF resolved_phase = 'FINAL'::public.bracket_knockout_priority_phase
    AND bracket_match_record.is_third_place = false THEN
    SELECT
      (program_block.value->>'date')::date,
      NULLIF(trim(COALESCE(program_block.value->>'location_name', '')), ''),
      NULLIF(trim(COALESCE(program_block.value->>'court_name', '')), ''),
      (program_block.value->>'period')::public.championship_schedule_period,
      GREATEST(1, COALESCE((program_block.value->>'display_order')::integer, 1)),
      naipe_sequence.ordinality::integer
    INTO
      selected_queue_date,
      selected_location_name,
      selected_court_name,
      selected_period,
      selected_display_order,
      selected_naipe_position
    FROM public.championship_bracket_editions AS editions_table
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(editions_table.payload_snapshot->'knockout_program_blocks', '[]'::jsonb)) AS program_block(value)
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(program_block.value->'naipe_sequence', '[]'::jsonb)) WITH ORDINALITY AS naipe_sequence(value, ordinality)
    WHERE editions_table.id = bracket_match_record.bracket_edition_id
      AND COALESCE(program_block.value->>'phase', '') = 'FINAL'
      AND (program_block.value->>'sport_id')::uuid = bracket_match_record.sport_id
      AND COALESCE(NULLIF(trim(COALESCE(program_block.value->>'division_scope', '')), ''), 'ALL') = resolved_division_scope::text
      AND naipe_sequence.value = bracket_match_record.naipe::text
    ORDER BY
      GREATEST(1, COALESCE((program_block.value->>'display_order')::integer, 1)) ASC,
      naipe_sequence.ordinality ASC
    LIMIT 1;

    IF selected_queue_date IS NOT NULL AND selected_location_name IS NOT NULL THEN
      SELECT locations_table.location_group_id
      INTO selected_location_group_id
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
        AND days_table.event_date = selected_queue_date
        AND locations_table.name = selected_location_name
      LIMIT 1;

      IF selected_court_name IS NOT NULL THEN
        SELECT
          locations_table.location_group_id,
          courts_table.court_group_id
        INTO
          selected_location_group_id,
          selected_court_group_id
        FROM public.championship_bracket_days AS days_table
        JOIN public.championship_bracket_locations AS locations_table
          ON locations_table.bracket_day_id = days_table.id
        JOIN public.championship_bracket_courts AS courts_table
          ON courts_table.bracket_location_id = locations_table.id
        WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
          AND days_table.event_date = selected_queue_date
          AND locations_table.name = selected_location_name
          AND courts_table.name = selected_court_name
        LIMIT 1;
      END IF;
    END IF;

    IF selected_queue_date IS NOT NULL THEN
      UPDATE public.championship_bracket_matches AS bracket_matches_table
      SET
        planned_scheduled_date = selected_queue_date,
        planned_period = selected_period,
        planned_scheduled_slot = ((selected_display_order - 1) * 10) + COALESCE(selected_naipe_position, 1),
        planned_queue_position = ((selected_display_order - 1) * 10) + COALESCE(selected_naipe_position, 1),
        planned_start_time = NULL,
        planned_end_time = NULL,
        planned_location_group_id = selected_location_group_id,
        planned_court_group_id = selected_court_group_id,
        planned_location_name = selected_location_name,
        planned_court_name = selected_court_name
      WHERE bracket_matches_table.id = _bracket_match_id;

      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = bracket_match_record.season_year
        AND matches_table.scheduled_date IS NOT NULL
    ),
    (
      SELECT MIN(days_table.event_date)
      FROM public.championship_bracket_days AS days_table
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    )
  )
  INTO selected_queue_date;

  selected_preferred_court_group_id := public.resolve_bracket_knockout_priority_court_group_id(
    bracket_match_record.bracket_edition_id,
    bracket_match_record.sport_id,
    resolved_phase,
    resolved_division_scope
  );

  SELECT
    schedule_candidates.location_name,
    schedule_candidates.location_group_id
  INTO
    selected_location_name,
    selected_location_group_id
  FROM (
    SELECT DISTINCT
      locations_table.position,
      locations_table.name AS location_name,
      locations_table.location_group_id,
      courts_table.court_group_id
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
      AND court_sports_table.sport_id = bracket_match_record.sport_id
      AND days_table.event_date = selected_queue_date
  ) AS schedule_candidates
  WHERE selected_preferred_court_group_id IS NULL
    OR schedule_candidates.court_group_id = selected_preferred_court_group_id
  ORDER BY
    schedule_candidates.position ASC,
    schedule_candidates.location_name ASC
  LIMIT 1;

  IF selected_location_name IS NULL THEN
    SELECT
      schedule_candidates.location_name,
      schedule_candidates.location_group_id
    INTO
      selected_location_name,
      selected_location_group_id
    FROM (
      SELECT DISTINCT
        locations_table.position,
        locations_table.name AS location_name,
        locations_table.location_group_id
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
        AND court_sports_table.sport_id = bracket_match_record.sport_id
        AND days_table.event_date = selected_queue_date
    ) AS schedule_candidates
    ORDER BY
      schedule_candidates.position ASC,
      schedule_candidates.location_name ASC
    LIMIT 1;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    planned_scheduled_date = selected_queue_date,
    planned_period = NULL,
    planned_scheduled_slot = NULL,
    planned_queue_position = NULL,
    planned_start_time = NULL,
    planned_end_time = NULL,
    planned_location_group_id = selected_location_group_id,
    planned_court_group_id = NULL,
    planned_location_name = selected_location_name,
    planned_court_name = NULL
  WHERE bracket_matches_table.id = _bracket_match_id;
END;
$$;

COMMENT ON FUNCTION public.assign_championship_knockout_match_planned_schedule(UUID, UUID) IS
  'Define a agenda planejada do slot eliminatório. Para finais com bloco manual, grava o slot forte; para os demais rounds, registra um planejamento leve com data e local-base.';

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
  competition_total_rounds INTEGER;
  selected_queue_date DATE;
  selected_location_name TEXT;
  selected_preferred_court_group_id UUID;
  new_match_id UUID;
BEGIN
  PERFORM public.assign_championship_knockout_match_planned_schedule(_championship_id, _bracket_match_id);

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.is_third_place,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_period,
    bracket_matches_table.planned_scheduled_slot,
    bracket_matches_table.planned_queue_position,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name,
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

  IF bracket_match_record.planned_scheduled_date IS NOT NULL
    AND bracket_match_record.planned_location_name IS NOT NULL
    AND bracket_match_record.planned_court_name IS NOT NULL THEN
    PERFORM set_config('app.skip_queue_trigger', 'true', true);
    PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

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
      scheduled_slot,
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
      bracket_match_record.planned_location_name,
      bracket_match_record.planned_court_name,
      bracket_match_record.planned_scheduled_date,
      bracket_match_record.planned_queue_position,
      bracket_match_record.planned_scheduled_slot,
      bracket_match_record.planned_start_time,
      bracket_match_record.planned_end_time,
      bracket_match_record.season_year,
      'SCHEDULED'::public.match_status
    )
    RETURNING id INTO new_match_id;

    UPDATE public.championship_bracket_matches
    SET match_id = new_match_id
    WHERE id = _bracket_match_id;

    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);

    RETURN new_match_id;
  END IF;

  SELECT MAX(bracket_matches_table.round_number) FILTER (WHERE bracket_matches_table.is_third_place = false)
  INTO competition_total_rounds
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.bracket_edition_id = bracket_match_record.bracket_edition_id
    AND bracket_matches_table.competition_id = (
      SELECT competition_id
      FROM public.championship_bracket_matches
      WHERE id = _bracket_match_id
      LIMIT 1
    );

  selected_queue_date := bracket_match_record.planned_scheduled_date;

  IF selected_queue_date IS NULL THEN
    SELECT COALESCE(
      (
        SELECT MAX(matches_table.scheduled_date)
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = _championship_id
          AND matches_table.season_year = bracket_match_record.season_year
          AND matches_table.scheduled_date IS NOT NULL
      ),
      (
        SELECT MIN(days_table.event_date)
        FROM public.championship_bracket_days AS days_table
        WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
      )
    )
    INTO selected_queue_date;
  END IF;

  selected_preferred_court_group_id := public.resolve_bracket_knockout_priority_court_group_id(
    bracket_match_record.bracket_edition_id,
    bracket_match_record.sport_id,
    public.resolve_bracket_knockout_match_phase(
      bracket_match_record.round_number,
      competition_total_rounds,
      bracket_match_record.is_third_place
    ),
    public.resolve_bracket_knockout_division_scope(bracket_match_record.division)
  );

  selected_location_name := bracket_match_record.planned_location_name;

  IF selected_location_name IS NULL THEN
    SELECT schedule_candidates.location_name
    INTO selected_location_name
    FROM (
      SELECT DISTINCT
        locations_table.position,
        locations_table.name AS location_name,
        courts_table.court_group_id
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
        AND court_sports_table.sport_id = bracket_match_record.sport_id
        AND days_table.event_date = selected_queue_date
    ) AS schedule_candidates
    WHERE selected_preferred_court_group_id IS NULL
      OR schedule_candidates.court_group_id = selected_preferred_court_group_id
    ORDER BY
      schedule_candidates.position ASC,
      schedule_candidates.location_name ASC
    LIMIT 1;
  END IF;

  IF selected_location_name IS NULL THEN
    SELECT schedule_candidates.location_name
    INTO selected_location_name
    FROM (
      SELECT DISTINCT
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
        AND court_sports_table.sport_id = bracket_match_record.sport_id
        AND days_table.event_date = selected_queue_date
    ) AS schedule_candidates
    ORDER BY
      schedule_candidates.position ASC,
      schedule_candidates.location_name ASC
    LIMIT 1;
  END IF;

  IF selected_queue_date IS NULL OR selected_location_name IS NULL THEN
    RAISE EXCEPTION 'Não há local compatível configurado para gerar a fila do mata-mata nesta modalidade.';
  END IF;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

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

  PERFORM public.redistribute_bracket_scheduled_matches(bracket_match_record.bracket_edition_id);

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  RETURN new_match_id;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.create_championship_knockout_match_schedule(UUID, UUID) IS
  'Materializa o jogo real do slot eliminatório. Quando houver agenda planejada forte da final, herda o slot exato; caso contrário, mantém o fluxo atual com redistribuição.';

CREATE OR REPLACE FUNCTION public.ensure_championship_knockout_next_round_match(
  _championship_id UUID,
  _competition_id UUID,
  _source_round_number INTEGER,
  _next_slot_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  source_home_bracket_match RECORD;
  source_away_bracket_match RECORD;
  target_bracket_match RECORD;
  next_round_number INTEGER;
  resolved_home_team_id UUID;
  resolved_away_team_id UUID;
BEGIN
  IF _next_slot_number < 1 OR _source_round_number < 1 THEN
    RETURN NULL;
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO source_home_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _source_round_number
    AND bracket_matches_table.slot_number = ((_next_slot_number * 2) - 1)
  LIMIT 1;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO source_away_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _source_round_number
    AND bracket_matches_table.slot_number = (_next_slot_number * 2)
  LIMIT 1;

  IF source_home_bracket_match.id IS NULL OR source_away_bracket_match.id IS NULL THEN
    RETURN NULL;
  END IF;

  next_round_number := _source_round_number + 1;
  resolved_home_team_id := source_home_bracket_match.winner_team_id;
  resolved_away_team_id := source_away_bracket_match.winner_team_id;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id
  INTO target_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = next_round_number
    AND bracket_matches_table.slot_number = _next_slot_number
  LIMIT 1;

  IF target_bracket_match.id IS NULL THEN
    INSERT INTO public.championship_bracket_matches (
      bracket_edition_id,
      competition_id,
      phase,
      round_number,
      slot_number,
      home_team_id,
      away_team_id,
      winner_team_id,
      source_home_bracket_match_id,
      source_away_bracket_match_id,
      is_bye
    ) VALUES (
      competition_record.bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      next_round_number,
      _next_slot_number,
      resolved_home_team_id,
      resolved_away_team_id,
      NULL,
      source_home_bracket_match.id,
      source_away_bracket_match.id,
      false
    )
    RETURNING
      id,
      match_id,
      home_team_id,
      away_team_id
    INTO target_bracket_match;
  ELSE
    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = resolved_home_team_id,
      away_team_id = resolved_away_team_id,
      winner_team_id = NULL,
      is_bye = false,
      source_home_bracket_match_id = source_home_bracket_match.id,
      source_away_bracket_match_id = source_away_bracket_match.id
    WHERE bracket_matches_table.id = target_bracket_match.id;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET next_bracket_match_id = target_bracket_match.id
  WHERE bracket_matches_table.id IN (source_home_bracket_match.id, source_away_bracket_match.id);

  PERFORM public.assign_championship_knockout_match_planned_schedule(_championship_id, target_bracket_match.id);

  IF target_bracket_match.match_id IS NULL
    AND resolved_home_team_id IS NOT NULL
    AND resolved_away_team_id IS NOT NULL THEN
    PERFORM public.create_championship_knockout_match_schedule(_championship_id, target_bracket_match.id);
  END IF;

  RETURN target_bracket_match.id;
END;
$$;

COMMENT ON FUNCTION public.ensure_championship_knockout_next_round_match(UUID, UUID, INTEGER, INTEGER) IS
  'Mantém a árvore completa do mata-mata pré-criada. O confronto seguinte nasce como placeholder e só materializa o match real quando os dois lados ficam definidos.';

CREATE OR REPLACE FUNCTION public.ensure_championship_knockout_third_place_match(
  _championship_id UUID,
  _competition_id UUID,
  _semifinal_round_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  semifinal_home_match RECORD;
  semifinal_away_match RECORD;
  third_place_match RECORD;
  third_place_home_team_id UUID;
  third_place_away_team_id UUID;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.third_place_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL
    OR competition_record.third_place_mode <> 'MATCH'::public.bracket_third_place_mode
    OR _semifinal_round_number < 1 THEN
    RETURN NULL;
  END IF;

  SELECT
    bracket_matches_table.id
  INTO semifinal_home_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _semifinal_round_number
    AND bracket_matches_table.slot_number = 1
  LIMIT 1;

  SELECT
    bracket_matches_table.id
  INTO semifinal_away_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _semifinal_round_number
    AND bracket_matches_table.slot_number = 2
  LIMIT 1;

  IF semifinal_home_match.id IS NULL OR semifinal_away_match.id IS NULL THEN
    RETURN NULL;
  END IF;

  third_place_home_team_id := public.resolve_championship_bracket_match_loser_team_id(semifinal_home_match.id);
  third_place_away_team_id := public.resolve_championship_bracket_match_loser_team_id(semifinal_away_match.id);

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id
  INTO third_place_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = true
  LIMIT 1;

  IF third_place_match.id IS NULL THEN
    INSERT INTO public.championship_bracket_matches (
      bracket_edition_id,
      competition_id,
      phase,
      round_number,
      slot_number,
      home_team_id,
      away_team_id,
      winner_team_id,
      source_home_bracket_match_id,
      source_away_bracket_match_id,
      is_bye,
      is_third_place
    ) VALUES (
      competition_record.bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      _semifinal_round_number + 1,
      2,
      third_place_home_team_id,
      third_place_away_team_id,
      NULL,
      semifinal_home_match.id,
      semifinal_away_match.id,
      false,
      true
    )
    RETURNING
      id,
      match_id
    INTO third_place_match;
  ELSE
    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = third_place_home_team_id,
      away_team_id = third_place_away_team_id,
      winner_team_id = NULL,
      is_bye = false,
      source_home_bracket_match_id = semifinal_home_match.id,
      source_away_bracket_match_id = semifinal_away_match.id
    WHERE bracket_matches_table.id = third_place_match.id;
  END IF;

  PERFORM public.assign_championship_knockout_match_planned_schedule(_championship_id, third_place_match.id);

  IF third_place_match.match_id IS NULL
    AND third_place_home_team_id IS NOT NULL
    AND third_place_away_team_id IS NOT NULL THEN
    PERFORM public.create_championship_knockout_match_schedule(_championship_id, third_place_match.id);
  END IF;

  RETURN third_place_match.id;
END;
$$;

COMMENT ON FUNCTION public.ensure_championship_knockout_third_place_match(UUID, UUID, INTEGER) IS
  'Mantém o placeholder da disputa de 3º lugar pré-criado e só materializa o jogo real quando os dois perdedores da semifinal ficam definidos.';

CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
#variable_conflict use_variable
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  qualified_team_count INTEGER;
  group_count_value INTEGER;
  direct_qualified_team_count INTEGER;
  should_expand_with_best_second_placed_teams BOOLEAN;
  should_include_best_second_placed_teams BOOLEAN;
  should_use_cross_groups_pairing BOOLEAN;
  all_groups_finished BOOLEAN := false;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  current_round INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
  existing_knockout_count INTEGER;
  pending_tie_breaks_count INTEGER;
  standard_seed_order INTEGER[];
  seed_iter INTEGER;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
    competitions_table.third_place_mode,
    COALESCE(competitions_table.knockout_pairing_mode, 'LINEAR') AS knockout_pairing_mode,
    COALESCE(sports_table.code, '') AS sport_code
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  LEFT JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE competitions_table.id = _competition_id
    AND (_bracket_edition_id IS NULL OR competitions_table.bracket_edition_id = _bracket_edition_id)
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  bracket_edition_id := competition_record.bracket_edition_id;
  third_place_mode_value := competition_record.third_place_mode;

  SELECT count(*)
  INTO pending_tie_breaks_count
  FROM jsonb_array_elements(public.get_championship_bracket_pending_tie_breaks(_championship_id, bracket_edition_id)) AS tb
  WHERE (tb->>'competition_id')::uuid = _competition_id;

  IF pending_tie_breaks_count > 0 THEN
    RETURN _competition_id;
  END IF;

  SELECT
    count(*)::int,
    bool_and(group_statuses.is_group_finished)
  INTO
    group_count_value,
    all_groups_finished
  FROM (
    SELECT
      groups_table.id,
      (
        count(bracket_matches_table.match_id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.match_id)
      ) AS is_group_finished
    FROM public.championship_bracket_groups AS groups_table
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = groups_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id
  ) AS group_statuses;

  IF group_count_value < 1 THEN
    RETURN _competition_id;
  END IF;

  IF all_groups_finished IS NOT TRUE THEN
    RETURN _competition_id;
  END IF;

  direct_qualified_team_count := group_count_value * competition_record.qualifiers_per_group;
  should_expand_with_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true;

  target_bracket_size := 1;
  IF should_expand_with_best_second_placed_teams THEN
    WHILE target_bracket_size <= direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN _competition_id;
  END IF;

  should_include_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND target_bracket_size > direct_qualified_team_count;

  should_use_cross_groups_pairing :=
    competition_record.knockout_pairing_mode = 'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    AND competition_record.sport_code = 'FUTEBOL_SOCIETY'
    AND competition_record.naipe = 'FEMININO'::public.match_naipe
    AND competition_record.division = 'DIVISAO_ACESSO'::public.team_division
    AND group_count_value = 2
    AND competition_record.qualifiers_per_group = 1
    AND should_include_best_second_placed_teams
    AND target_bracket_size = 4;

  IF should_include_best_second_placed_teams AND NOT all_groups_finished THEN
    RETURN _competition_id;
  END IF;

  IF should_use_cross_groups_pairing THEN
    FOR ranking_record IN
      WITH ordered_groups AS (
        SELECT
          groups_table.id AS group_id,
          groups_table.group_number
        FROM public.championship_bracket_groups AS groups_table
        WHERE groups_table.competition_id = _competition_id
      )
      SELECT rankings_table.team_id
      FROM ordered_groups
      CROSS JOIN generate_series(1, 2) AS qualifiers(rank_number)
      LEFT JOIN public.get_championship_bracket_competition_group_rankings(
        _championship_id,
        _competition_id
      ) AS rankings_table
        ON rankings_table.group_id = ordered_groups.group_id
        AND rankings_table.team_rank = qualifiers.rank_number
      ORDER BY ordered_groups.group_number ASC, qualifiers.rank_number ASC
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;
  ELSE
    FOR ranking_record IN
      WITH ordered_groups AS (
        SELECT
          groups_table.id AS group_id,
          groups_table.group_number,
          (
            count(bracket_matches_table.match_id) > 0
            AND count(*) FILTER (
              WHERE matches_table.status = 'FINISHED'::public.match_status
            ) = count(bracket_matches_table.match_id)
          ) AS is_group_finished
        FROM public.championship_bracket_groups AS groups_table
        LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
          ON bracket_matches_table.group_id = groups_table.id
          AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
        LEFT JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE groups_table.competition_id = _competition_id
        GROUP BY groups_table.id, groups_table.group_number
      )
      SELECT
        qualifiers.rank_number,
        rankings_table.team_id
      FROM ordered_groups
      CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
      LEFT JOIN public.get_championship_bracket_competition_group_rankings(
        _championship_id,
        _competition_id
      ) AS rankings_table
        ON rankings_table.group_id = ordered_groups.group_id
        AND rankings_table.team_rank = qualifiers.rank_number
      LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
        _championship_id,
        _competition_id
      ) AS pool_rankings
        ON pool_rankings.team_id = rankings_table.team_id
        AND pool_rankings.qualification_rank = qualifiers.rank_number
      ORDER BY
        qualifiers.rank_number ASC,
        CASE
          WHEN should_include_best_second_placed_teams
          THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
          ELSE ordered_groups.group_number
        END ASC
    LOOP
      qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
    END LOOP;

    IF should_include_best_second_placed_teams THEN
      FOR ranking_record IN
        SELECT qualification_pool_rankings.team_id
        FROM public.get_championship_bracket_competition_qualification_pool_rankings(
          _championship_id,
          _competition_id
        ) AS qualification_pool_rankings
        ORDER BY qualification_pool_rankings.pool_rank ASC
      LOOP
        EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

        IF ranking_record.team_id IS NOT NULL
          AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
          qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
        END IF;
      END LOOP;
    END IF;
  END IF;

  WHILE COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  IF COALESCE(cardinality(qualified_team_ids), 0) > target_bracket_size THEN
    qualified_team_ids := qualified_team_ids[1:target_bracket_size];
  END IF;

  qualified_team_count := COALESCE(cardinality(qualified_team_ids), 0);

  IF qualified_team_count < 2 THEN
    RETURN _competition_id;
  END IF;

  bracket_size := 1;
  WHILE bracket_size < qualified_team_count LOOP
    bracket_size := bracket_size * 2;
  END LOOP;

  WHILE cardinality(qualified_team_ids) < bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  total_rounds := 1;
  WHILE power(2, total_rounds) < bracket_size LOOP
    total_rounds := total_rounds + 1;
  END LOOP;

  standard_seed_order := ARRAY[]::INTEGER[];
  FOR seed_iter IN 1..(bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, bracket_size + 1 - seed_iter);
  END LOOP;

  SELECT count(*)
  INTO existing_knockout_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;

  IF existing_knockout_count > 0 THEN
    RETURN _competition_id;
  END IF;

  round_match_ids := ARRAY[]::UUID[];

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := standard_seed_order[((slot_index - 1) * 2) + 1];
    away_seed_index := standard_seed_order[((slot_index - 1) * 2) + 2];
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    INSERT INTO public.championship_bracket_matches (
      bracket_edition_id,
      competition_id,
      phase,
      round_number,
      slot_number,
      home_team_id,
      away_team_id,
      winner_team_id,
      is_bye
    ) VALUES (
      bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      1,
      slot_index,
      home_team_id,
      away_team_id,
      CASE
        WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
        WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
        ELSE NULL
      END,
      CASE
        WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
        WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
        ELSE true
      END
    )
    RETURNING id INTO bracket_match_id;

    PERFORM public.assign_championship_knockout_match_planned_schedule(_championship_id, bracket_match_id);

    IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
      PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
    END IF;

    round_match_ids := array_append(round_match_ids, bracket_match_id);
  END LOOP;

  current_round := 1;

  LOOP
    next_round_match_ids := ARRAY[]::UUID[];

    EXIT WHEN COALESCE(cardinality(round_match_ids), 0) < 2;

    FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
    LOOP
      bracket_match_id := public.ensure_championship_knockout_next_round_match(
        _championship_id,
        _competition_id,
        current_round,
        slot_index
      );

      IF bracket_match_id IS NOT NULL THEN
        next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
      END IF;
    END LOOP;

    EXIT WHEN COALESCE(cardinality(next_round_match_ids), 0) = 0;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND COALESCE(cardinality(round_match_ids), 0) = 2 THEN
      PERFORM public.ensure_championship_knockout_third_place_match(
        _championship_id,
        _competition_id,
        current_round
      );
    END IF;

    round_match_ids := next_round_match_ids;
    current_round := current_round + 1;
  END LOOP;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN _competition_id;
END;
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS
  'Pré-cria a árvore completa do mata-mata como placeholders e materializa apenas os confrontos já definidos. Suporta bloco manual de finais por quadra para herança exata da agenda.';

CREATE OR REPLACE FUNCTION public.get_championship_bracket_view(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  response JSONB;
  resolved_season_year INTEGER;
BEGIN
  SELECT COALESCE(
    _season_year,
    championships_table.current_season_year,
    date_part('year', timezone('America/Sao_Paulo', now()))::integer
  )
  INTO resolved_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    resolved_season_year := date_part('year', timezone('America/Sao_Paulo', now()))::integer;
  END IF;

  WITH latest_edition AS (
    SELECT editions_table.id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = resolved_season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1
  ),
  competitions AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.groups_count,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.knockout_pairing_mode,
      competitions_table.third_place_mode,
      sports_table.name AS sport_name
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN latest_edition
      ON latest_edition.id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  groups AS (
    SELECT
      groups_table.id,
      groups_table.competition_id,
      groups_table.group_number,
      jsonb_agg(
        jsonb_build_object(
          'team_id', teams_table.id,
          'team_name', teams_table.name,
          'team_city', teams_table.city,
          'position', group_teams_table.position
        )
        ORDER BY group_teams_table.position ASC
      ) AS teams
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN public.teams AS teams_table
      ON teams_table.id = group_teams_table.team_id
    WHERE groups_table.competition_id IN (SELECT competitions.id FROM competitions)
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number
  ),
  bracket_matches AS (
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      bracket_matches_table.phase,
      bracket_matches_table.round_number,
      bracket_matches_table.slot_number,
      bracket_matches_table.match_id,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye,
      bracket_matches_table.is_third_place,
      matches_table.status,
      COALESCE(matches_table.scheduled_date, bracket_matches_table.planned_scheduled_date) AS scheduled_date,
      COALESCE(matches_table.queue_position, bracket_matches_table.planned_queue_position) AS queue_position,
      COALESCE(matches_table.scheduled_slot, bracket_matches_table.planned_scheduled_slot) AS scheduled_slot,
      COALESCE(matches_table.start_time, bracket_matches_table.planned_start_time) AS start_time,
      COALESCE(matches_table.end_time, bracket_matches_table.planned_end_time) AS end_time,
      COALESCE(matches_table.location, bracket_matches_table.planned_location_name) AS location,
      COALESCE(matches_table.court_name, bracket_matches_table.planned_court_name) AS court_name,
      home_teams_table.name AS home_team_name,
      away_teams_table.name AS away_team_name,
      winner_teams_table.name AS winner_team_name
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN public.teams AS home_teams_table
      ON home_teams_table.id = bracket_matches_table.home_team_id
    LEFT JOIN public.teams AS away_teams_table
      ON away_teams_table.id = bracket_matches_table.away_team_id
    LEFT JOIN public.teams AS winner_teams_table
      ON winner_teams_table.id = bracket_matches_table.winner_team_id
    WHERE bracket_matches_table.bracket_edition_id IN (SELECT latest_edition.id FROM latest_edition)
  )
  SELECT jsonb_build_object(
    'edition', (
      SELECT to_jsonb(editions_table)
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id IN (SELECT latest_edition.id FROM latest_edition)
      LIMIT 1
    ),
    'competitions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', competitions.id,
            'sport_id', competitions.sport_id,
            'sport_name', competitions.sport_name,
            'naipe', competitions.naipe,
            'division', competitions.division,
            'groups_count', competitions.groups_count,
            'qualifiers_per_group', competitions.qualifiers_per_group,
            'should_complete_knockout_with_best_second_placed_teams', competitions.should_complete_knockout_with_best_second_placed_teams,
            'knockout_pairing_mode', competitions.knockout_pairing_mode,
            'third_place_mode', competitions.third_place_mode,
            'groups', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', groups.id,
                    'group_number', groups.group_number,
                    'teams', groups.teams,
                    'matches', COALESCE(
                      (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', bracket_matches.id,
                            'match_id', bracket_matches.match_id,
                            'status', bracket_matches.status,
                            'scheduled_date', bracket_matches.scheduled_date,
                            'queue_position', bracket_matches.queue_position,
                            'scheduled_slot', bracket_matches.scheduled_slot,
                            'start_time', bracket_matches.start_time,
                            'end_time', bracket_matches.end_time,
                            'location', bracket_matches.location,
                            'court_name', bracket_matches.court_name,
                            'home_team_id', bracket_matches.home_team_id,
                            'away_team_id', bracket_matches.away_team_id,
                            'home_team_name', bracket_matches.home_team_name,
                            'away_team_name', bracket_matches.away_team_name,
                            'winner_team_id', bracket_matches.winner_team_id,
                            'winner_team_name', bracket_matches.winner_team_name
                          )
                          ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                        )
                        FROM bracket_matches
                        WHERE bracket_matches.group_id = groups.id
                          AND bracket_matches.phase = 'GROUP_STAGE'::public.bracket_phase
                      ),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY groups.group_number ASC
                )
                FROM groups
                WHERE groups.competition_id = competitions.id
              ),
              '[]'::jsonb
            ),
            'knockout_matches', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', bracket_matches.id,
                    'round_number', bracket_matches.round_number,
                    'slot_number', bracket_matches.slot_number,
                    'match_id', bracket_matches.match_id,
                    'status', bracket_matches.status,
                    'scheduled_date', bracket_matches.scheduled_date,
                    'queue_position', bracket_matches.queue_position,
                    'scheduled_slot', bracket_matches.scheduled_slot,
                    'start_time', bracket_matches.start_time,
                    'end_time', bracket_matches.end_time,
                    'location', bracket_matches.location,
                    'court_name', bracket_matches.court_name,
                    'home_team_id', bracket_matches.home_team_id,
                    'away_team_id', bracket_matches.away_team_id,
                    'home_team_name', bracket_matches.home_team_name,
                    'away_team_name', bracket_matches.away_team_name,
                    'winner_team_id', bracket_matches.winner_team_id,
                    'winner_team_name', bracket_matches.winner_team_name,
                    'is_bye', bracket_matches.is_bye,
                    'is_third_place', bracket_matches.is_third_place
                  )
                  ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                )
                FROM bracket_matches
                WHERE bracket_matches.competition_id = competitions.id
                  AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
              ),
              '[]'::jsonb
            )
          )
          ORDER BY competitions.sport_name ASC, competitions.naipe ASC, competitions.division ASC NULLS FIRST
        )
        FROM competitions
      ),
      '[]'::jsonb
    )
  )
  INTO response;

  RETURN COALESCE(
    response,
    jsonb_build_object(
      'edition', NULL,
      'competitions', '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER)
IS 'Retorna a visão consolidada do chaveamento usando agenda real quando o match existir e agenda planejada do placeholder quando o slot ainda estiver A definir.';

NOTIFY pgrst, 'reload schema';