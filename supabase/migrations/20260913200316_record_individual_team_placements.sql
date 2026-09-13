ALTER TABLE public.championship_individual_event_entries
  ADD COLUMN IF NOT EXISTS recording_mode TEXT NOT NULL DEFAULT 'ATHLETE_METRIC'
  CHECK (recording_mode IN ('ATHLETE_METRIC', 'TEAM_PLACEMENT'));

DROP INDEX IF EXISTS public.championship_individual_event_entries_unique_relay_team_idx;

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_legacy_relay_team_idx
  ON public.championship_individual_event_entries (event_id, team_id)
  WHERE entry_type = 'RELAY'::public.championship_individual_event_kind
    AND recording_mode = 'ATHLETE_METRIC';

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_team_placement_position_idx
  ON public.championship_individual_event_entries (event_id, final_position)
  WHERE recording_mode = 'TEAM_PLACEMENT'
    AND status = 'CONFIRMED'::public.championship_individual_entry_status;

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_team_placement_walkover_idx
  ON public.championship_individual_event_entries (event_id, team_id)
  WHERE recording_mode = 'TEAM_PLACEMENT'
    AND status = 'WALKOVER'::public.championship_individual_entry_status;

CREATE OR REPLACE FUNCTION public.get_championship_individual_event_placement_count(
  _event_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT GREATEST((config_record.value->>'placements_count')::integer, 1)
      FROM public.championship_individual_events AS events_table
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          public.get_championship_setup_payload_snapshot(
            events_table.championship_id,
            events_table.season_year
          )->'individual_event_configs',
          '[]'::jsonb
        )
      ) AS config_record(value)
      WHERE events_table.id = _event_id
        AND jsonb_typeof(config_record.value) = 'object'
        AND (config_record.value->>'sport_id')::uuid = events_table.sport_id
      LIMIT 1
    ),
    20
  );
$$;

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_event_positions(
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
  UPDATE public.championship_individual_event_entries AS entries_table
  SET final_position = NULL
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id
    AND events_table.naipe = _naipe
    AND events_table.division IS NOT DISTINCT FROM _division
    AND entries_table.recording_mode = 'ATHLETE_METRIC';

  WITH ranked_entries AS (
    SELECT
      entries_table.id,
      ROW_NUMBER() OVER (
        PARTITION BY entries_table.event_id
        ORDER BY
          CASE
            WHEN events_table.event_code IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP')
            THEN entries_table.result_mark_centimeters
          END DESC NULLS LAST,
          CASE
            WHEN events_table.event_code NOT IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP')
            THEN entries_table.result_time_milliseconds
          END ASC NULLS LAST,
          entries_table.id
      ) AS final_position
    FROM public.championship_individual_event_entries AS entries_table
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND entries_table.recording_mode = 'ATHLETE_METRIC'
      AND events_table.championship_id = _championship_id
      AND events_table.season_year = _season_year
      AND events_table.sport_id = _sport_id
      AND events_table.naipe = _naipe
      AND events_table.division IS NOT DISTINCT FROM _division
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET final_position = ranked_entries.final_position
  FROM ranked_entries
  WHERE entries_table.id = ranked_entries.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_disqualified_individual_entry_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_record public.championship_individual_events%ROWTYPE;
BEGIN
  SELECT *
  INTO event_record
  FROM public.championship_individual_events
  WHERE id = NEW.event_id;

  IF event_record.id IS NULL OR NOT public.is_championship_competition_team_disqualified(
    event_record.championship_id,
    event_record.season_year,
    event_record.sport_id,
    event_record.naipe,
    event_record.division,
    NEW.team_id
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'A atlética está desclassificada desta modalidade e naipe.';
  END IF;

  NEW.status := 'DSQ'::public.championship_individual_entry_status;
  NEW.result_time_milliseconds := NULL;
  NEW.result_mark_centimeters := NULL;
  NEW.attempt_one_centimeters := NULL;
  NEW.attempt_two_centimeters := NULL;
  NEW.attempt_three_centimeters := NULL;
  NEW.final_position := CASE
    WHEN NEW.recording_mode = 'TEAM_PLACEMENT' THEN OLD.final_position
    ELSE NULL
  END;
  NEW.points_awarded := 0;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_individual_event_team_placements(
  _event_id UUID,
  _placements JSONB,
  _walkover_team_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
  placement_count INTEGER;
BEGIN
  SELECT events_table.*
  INTO current_event
  FROM public.championship_individual_events AS events_table
  JOIN public.championship_individual_sessions AS sessions_table
    ON sessions_table.id = events_table.session_id
  JOIN public.championships AS championships_table
    ON championships_table.id = events_table.championship_id
  WHERE events_table.id = _event_id
    AND sessions_table.status = 'LIVE'::public.championship_individual_session_status
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'Resultados só podem ser registrados em sessão ao vivo com o campeonato em andamento.';
  END IF;

  placement_count := public.get_championship_individual_event_placement_count(_event_id);

  IF jsonb_array_length(COALESCE(_placements, '[]'::jsonb)) = 0
    AND cardinality(COALESCE(_walkover_team_ids, ARRAY[]::UUID[])) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma colocação ou um W.O. para confirmar a prova.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(
      final_position INTEGER,
      team_id UUID
    )
    WHERE placement_row.final_position IS NULL
      OR placement_row.final_position < 1
      OR placement_row.final_position > placement_count
      OR placement_row.team_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Há uma colocação inválida para esta modalidade.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(
      final_position INTEGER,
      team_id UUID
    )
    GROUP BY placement_row.final_position
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada posição pode receber somente uma atlética.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM unnest(COALESCE(_walkover_team_ids, ARRAY[]::UUID[])) AS walkover_team_id
  ) != (
    SELECT COUNT(DISTINCT walkover_team_id)
    FROM unnest(COALESCE(_walkover_team_ids, ARRAY[]::UUID[])) AS walkover_team_id
  ) THEN
    RAISE EXCEPTION 'Uma atlética pode receber somente um W.O. por prova.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(
      final_position INTEGER,
      team_id UUID
    )
    JOIN unnest(COALESCE(_walkover_team_ids, ARRAY[]::UUID[])) AS walkover_team_id
      ON walkover_team_id = placement_row.team_id
  ) THEN
    RAISE EXCEPTION 'Uma atlética marcada em W.O. não pode ocupar uma colocação.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT placement_row.team_id
      FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(
        final_position INTEGER,
        team_id UUID
      )
      UNION
      SELECT walkover_team_id
      FROM unnest(COALESCE(_walkover_team_ids, ARRAY[]::UUID[])) AS walkover_team_id
    ) AS selected_team_ids
    LEFT JOIN public.teams AS teams_table
      ON teams_table.id = selected_team_ids.team_id
    WHERE teams_table.id IS NULL
      OR COALESCE(teams_table.is_active, true) IS NOT TRUE
      OR NOT EXISTS (
        SELECT 1
        FROM public.get_championship_individual_session_participants(current_event.session_id) AS participants_table
        WHERE participants_table.team_id = selected_team_ids.team_id
      )
      OR public.is_championship_competition_team_disqualified(
        current_event.championship_id,
        current_event.season_year,
        current_event.sport_id,
        current_event.naipe,
        current_event.division,
        selected_team_ids.team_id
      )
  ) THEN
    RAISE EXCEPTION 'Há uma atlética inválida, inativa ou inelegível para esta prova.';
  END IF;

  DELETE FROM public.championship_individual_event_entries
  WHERE event_id = _event_id
    AND recording_mode = 'TEAM_PLACEMENT';

  INSERT INTO public.championship_individual_event_entries (
    event_id,
    team_id,
    entry_type,
    final_position,
    status,
    points_awarded,
    recording_mode
  )
  SELECT
    _event_id,
    placement_row.team_id,
    current_event.kind,
    placement_row.final_position,
    'CONFIRMED'::public.championship_individual_entry_status,
    0,
    'TEAM_PLACEMENT'
  FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(
    final_position INTEGER,
    team_id UUID
  );

  INSERT INTO public.championship_individual_event_entries (
    event_id,
    team_id,
    entry_type,
    final_position,
    status,
    points_awarded,
    recording_mode
  )
  SELECT
    _event_id,
    walkover_team_id,
    current_event.kind,
    NULL,
    'WALKOVER'::public.championship_individual_entry_status,
    0,
    'TEAM_PLACEMENT'
  FROM unnest(COALESCE(_walkover_team_ids, ARRAY[]::UUID[])) AS walkover_team_id;

  UPDATE public.championship_individual_events AS events_table
  SET
    status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.championship_individual_event_entries AS entries_table
        WHERE entries_table.event_id = events_table.id
          AND entries_table.recording_mode = 'TEAM_PLACEMENT'
      ) THEN 'FINISHED'::public.championship_individual_event_status
      ELSE events_table.status
    END,
    updated_at = now()
  WHERE events_table.id = _event_id;

  PERFORM public.recalculate_championship_individual_standings(
    current_event.championship_id,
    current_event.season_year
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disqualify_championship_individual_team_competition(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  disqualification_id UUID;
  updated_entries_count INTEGER := 0;
BEGIN
  INSERT INTO public.championship_competition_team_disqualifications (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    created_by
  ) VALUES (
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division,
    _team_id,
    auth.uid()
  )
  ON CONFLICT (championship_id, season_year, sport_id, naipe, division, team_id)
  DO UPDATE
  SET
    created_by = EXCLUDED.created_by,
    created_at = now()
  RETURNING id INTO disqualification_id;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    status = 'DSQ'::public.championship_individual_entry_status,
    result_time_milliseconds = NULL,
    result_mark_centimeters = NULL,
    attempt_one_centimeters = NULL,
    attempt_two_centimeters = NULL,
    attempt_three_centimeters = NULL,
    final_position = CASE
      WHEN entries_table.recording_mode = 'TEAM_PLACEMENT' THEN entries_table.final_position
      ELSE NULL
    END,
    points_awarded = 0,
    updated_at = now()
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND events_table.sport_id = _sport_id
    AND events_table.naipe = _naipe
    AND events_table.division IS NOT DISTINCT FROM _division
    AND entries_table.team_id = _team_id
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status;

  GET DIAGNOSTICS updated_entries_count = ROW_COUNT;

  DELETE FROM public.championship_overall_competition_placements
  WHERE championship_id = _championship_id
    AND season_year = _season_year
    AND sport_id = _sport_id
    AND naipe = _naipe
    AND division IS NOT DISTINCT FROM _division
    AND team_id = _team_id;

  PERFORM public.recalculate_championship_individual_event_positions(
    _championship_id,
    _season_year,
    _sport_id,
    _naipe,
    _division
  );

  PERFORM public.recalculate_championship_individual_standings(
    _championship_id,
    _season_year
  );

  RETURN jsonb_build_object(
    'success', true,
    'disqualification_id', disqualification_id,
    'updated_entries_count', updated_entries_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  payload_snapshot JSONB;
BEGIN
  payload_snapshot := public.get_championship_setup_payload_snapshot(
    _championship_id,
    _season_year
  );

  UPDATE public.championship_individual_event_entries AS entries_table
  SET points_awarded = CASE
    WHEN entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
      AND entries_table.final_position >= 1
    THEN public.resolve_individual_event_position_points_by_payload(
      payload_snapshot,
      events_table.sport_id,
      entries_table.final_position
    ) * CASE
      WHEN events_table.kind = 'RELAY'::public.championship_individual_event_kind
      THEN COALESCE(events_table.relay_multiplier, 2)
      ELSE 1
    END
    ELSE 0
  END
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND (
      entries_table.recording_mode = 'TEAM_PLACEMENT'
      OR NOT EXISTS (
        SELECT 1
        FROM public.championship_individual_event_entries AS team_placement_entries
        WHERE team_placement_entries.event_id = entries_table.event_id
          AND team_placement_entries.recording_mode = 'TEAM_PLACEMENT'
      )
    );

  UPDATE public.championship_individual_event_entries AS entries_table
  SET points_awarded = 0
  FROM public.championship_individual_events AS events_table
  WHERE events_table.id = entries_table.event_id
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND entries_table.recording_mode = 'ATHLETE_METRIC'
    AND EXISTS (
      SELECT 1
      FROM public.championship_individual_event_entries AS team_placement_entries
      WHERE team_placement_entries.event_id = entries_table.event_id
        AND team_placement_entries.recording_mode = 'TEAM_PLACEMENT'
    );

  DELETE FROM public.championship_individual_team_standings
  WHERE championship_id = _championship_id
    AND season_year = _season_year;

  INSERT INTO public.championship_individual_team_standings (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    total_points,
    scored_events_count,
    first_places,
    second_places,
    third_places,
    fourth_places,
    fifth_places,
    sixth_places,
    seventh_places,
    eighth_places,
    ninth_places,
    tenth_places,
    eleventh_places,
    twelfth_places,
    thirteenth_places,
    fourteenth_places,
    fifteenth_places,
    sixteenth_places,
    seventeenth_places,
    eighteenth_places,
    nineteenth_places,
    twentieth_places,
    relay_points_total
  )
  SELECT
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id,
    COALESCE(SUM(entries_table.points_awarded), 0),
    COUNT(*) FILTER (
      WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND entries_table.final_position IS NOT NULL
    ),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 1),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 2),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 3),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 4),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 5),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 6),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 7),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 8),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 9),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 10),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 11),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 12),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 13),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 14),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 15),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 16),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 17),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 18),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 19),
    COUNT(*) FILTER (WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status AND entries_table.final_position = 20),
    COALESCE(SUM(entries_table.points_awarded) FILTER (
      WHERE events_table.kind = 'RELAY'::public.championship_individual_event_kind
    ), 0)
  FROM public.championship_individual_event_entries AS entries_table
  JOIN public.championship_individual_events AS events_table
    ON events_table.id = entries_table.event_id
  JOIN public.championship_individual_sessions AS sessions_table
    ON sessions_table.championship_id = events_table.championship_id
    AND sessions_table.season_year = events_table.season_year
    AND sessions_table.sport_id = events_table.sport_id
    AND sessions_table.naipe = events_table.naipe
    AND sessions_table.division IS NOT DISTINCT FROM events_table.division
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND sessions_table.status IN (
      'LIVE'::public.championship_individual_session_status,
      'FINISHED'::public.championship_individual_session_status
    )
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
    AND (
      entries_table.recording_mode = 'TEAM_PLACEMENT'
      OR NOT EXISTS (
        SELECT 1
        FROM public.championship_individual_event_entries AS team_placement_entries
        WHERE team_placement_entries.event_id = entries_table.event_id
          AND team_placement_entries.recording_mode = 'TEAM_PLACEMENT'
      )
    )
  GROUP BY
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_championship_individual_event_placement_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_championship_individual_event_team_placements(UUID, JSONB, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_individual_event_placement_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_event_team_placements(UUID, JSONB, UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
