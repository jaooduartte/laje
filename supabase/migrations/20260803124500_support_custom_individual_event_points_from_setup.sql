CREATE OR REPLACE FUNCTION public.resolve_individual_event_position_points_by_payload(
  _payload JSONB,
  _sport_id UUID,
  _final_position INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN jsonb_typeof(config_record.value->'placement_points') = 'array'
        THEN (
          SELECT COALESCE(
            (
              SELECT (placement_record.value->>'points')::numeric
              FROM jsonb_array_elements(config_record.value->'placement_points') AS placement_record(value)
              WHERE jsonb_typeof(placement_record.value) = 'object'
                AND jsonb_typeof(placement_record.value->'placement') = 'number'
                AND (placement_record.value->>'placement')::integer = _final_position
                AND jsonb_typeof(placement_record.value->'points') = 'number'
              LIMIT 1
            ),
            public.resolve_individual_event_position_points(_final_position)
          )
        )
        ELSE public.resolve_individual_event_position_points(_final_position)
      END
      FROM jsonb_array_elements(COALESCE(_payload->'individual_event_configs', '[]'::jsonb)) AS config_record(value)
      WHERE jsonb_typeof(config_record.value) = 'object'
        AND config_record.value ? 'sport_id'
        AND (config_record.value->>'sport_id')::uuid = _sport_id
      LIMIT 1
    ),
    public.resolve_individual_event_position_points(_final_position)
  );
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

  WITH ranked_entries AS (
    SELECT
      entries_table.id,
      ROW_NUMBER() OVER (
        PARTITION BY events_table.championship_id, events_table.season_year, events_table.sport_id, events_table.naipe, entries_table.athlete_id
        ORDER BY entries_table.created_at ASC, entries_table.id ASC
      ) AS athlete_event_rank
    FROM public.championship_individual_event_entries AS entries_table
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE events_table.championship_id = _championship_id
      AND events_table.season_year = _season_year
      AND entries_table.athlete_id IS NOT NULL
      AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET status = CASE
    WHEN ranked_entries.athlete_event_rank > 4 THEN 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
    WHEN ranked_entries.athlete_event_rank <= 4
      AND entries_table.status = 'DSQ_OVER_LIMIT'::public.championship_individual_entry_status
    THEN 'PENDING'::public.championship_individual_entry_status
    ELSE entries_table.status
  END
  FROM ranked_entries
  WHERE ranked_entries.id = entries_table.id;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    points_awarded = CASE
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
    AND events_table.season_year = _season_year;

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
    AND sessions_table.status = 'FINISHED'::public.championship_individual_session_status
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
  GROUP BY
    events_table.championship_id,
    events_table.season_year,
    events_table.sport_id,
    events_table.naipe,
    events_table.division,
    entries_table.team_id;
END;
$$;