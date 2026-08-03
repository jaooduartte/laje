DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'championship_individual_session_status'
  ) THEN
    CREATE TYPE public.championship_individual_session_status AS ENUM (
      'DRAFT',
      'SCHEDULED',
      'LIVE',
      'FINISHED',
      'CANCELLED'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.championship_individual_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  scheduled_date DATE NULL,
  period public.championship_schedule_period NULL,
  location_key TEXT NULL,
  court_key TEXT NULL,
  location_name TEXT NULL,
  court_name TEXT NULL,
  status public.championship_individual_session_status NOT NULL DEFAULT 'DRAFT',
  exclusive_lock_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT championship_individual_sessions_unique_scope
    UNIQUE NULLS NOT DISTINCT (championship_id, season_year, sport_id, naipe, division)
);

ALTER TABLE public.championship_individual_events
  ADD COLUMN IF NOT EXISTS session_id UUID NULL REFERENCES public.championship_individual_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS championship_individual_sessions_championship_lookup_idx
  ON public.championship_individual_sessions (championship_id, season_year, sport_id, naipe, division);

CREATE INDEX IF NOT EXISTS championship_individual_events_session_idx
  ON public.championship_individual_events (session_id);

ALTER TABLE public.championship_individual_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_individual_sessions'
      AND policyname = 'championship_individual_sessions_public_select'
  ) THEN
    CREATE POLICY championship_individual_sessions_public_select
    ON public.championship_individual_sessions
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'championship_individual_sessions'
      AND policyname = 'championship_individual_sessions_authenticated_write'
  ) THEN
    CREATE POLICY championship_individual_sessions_authenticated_write
    ON public.championship_individual_sessions
    FOR ALL
    TO authenticated
    USING (public.has_admin_tab_access('individual_events'::public.admin_panel_tab, true))
    WITH CHECK (public.has_admin_tab_access('individual_events'::public.admin_panel_tab, true));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_championship_individual_sessions_from_setup(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload_snapshot JSONB;
  synced_sessions_count INTEGER := 0;
BEGIN
  payload_snapshot := public.get_championship_setup_payload_snapshot(_championship_id, _season_year);

  WITH enabled_sports AS (
    SELECT DISTINCT (value)::uuid AS sport_id
    FROM jsonb_array_elements_text(COALESCE(payload_snapshot->'enabled_sport_ids', '[]'::jsonb))
  ),
  selected_modalities AS (
    SELECT DISTINCT
      (modality_record.value->>'sport_id')::uuid AS sport_id,
      (modality_record.value->>'naipe')::public.match_naipe AS naipe,
      CASE
        WHEN NULLIF(modality_record.value->>'division', '') IS NULL THEN NULL
        ELSE (modality_record.value->>'division')::public.team_division
      END AS division
    FROM jsonb_array_elements(COALESCE(payload_snapshot->'participants', '[]'::jsonb)) AS participant_record(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(participant_record.value->'modalities', '[]'::jsonb)) AS modality_record(value)
  ),
  configured_sessions AS (
    SELECT
      session_record.value->>'sport_id' AS sport_id_text,
      (session_record.value->>'sport_id')::uuid AS sport_id,
      (session_record.value->>'naipe')::public.match_naipe AS naipe,
      CASE
        WHEN NULLIF(session_record.value->>'division', '') IS NULL THEN NULL
        ELSE (session_record.value->>'division')::public.team_division
      END AS division,
      CASE
        WHEN NULLIF(session_record.value->>'scheduled_date', '') IS NULL THEN NULL
        ELSE (session_record.value->>'scheduled_date')::date
      END AS scheduled_date,
      CASE
        WHEN NULLIF(session_record.value->>'period', '') IS NULL THEN NULL
        ELSE (session_record.value->>'period')::public.championship_schedule_period
      END AS period,
      NULLIF(session_record.value->>'location_key', '') AS location_key,
      NULLIF(session_record.value->>'court_key', '') AS court_key,
      NULLIF(session_record.value->>'location_name', '') AS location_name,
      NULLIF(session_record.value->>'court_name', '') AS court_name,
      COALESCE((session_record.value->>'exclusive_lock_enabled')::boolean, false) AS exclusive_lock_enabled
    FROM jsonb_array_elements(COALESCE(payload_snapshot->'individual_session_configs', '[]'::jsonb)) AS session_record(value)
  ),
  valid_sessions AS (
    SELECT
      configured_sessions.*
    FROM configured_sessions
    JOIN enabled_sports
      ON enabled_sports.sport_id = configured_sessions.sport_id
    JOIN selected_modalities
      ON selected_modalities.sport_id = configured_sessions.sport_id
      AND selected_modalities.naipe = configured_sessions.naipe
      AND selected_modalities.division IS NOT DISTINCT FROM configured_sessions.division
    JOIN public.sports AS sports_table
      ON sports_table.id = configured_sessions.sport_id
    WHERE public.resolve_normalized_sport_name(sports_table.name) IN ('atletismo', 'natacao')
  ),
  upserted_sessions AS (
    INSERT INTO public.championship_individual_sessions (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      scheduled_date,
      period,
      location_key,
      court_key,
      location_name,
      court_name,
      status,
      exclusive_lock_enabled
    )
    SELECT
      _championship_id,
      _season_year,
      valid_sessions.sport_id,
      valid_sessions.naipe,
      valid_sessions.division,
      valid_sessions.scheduled_date,
      valid_sessions.period,
      valid_sessions.location_key,
      valid_sessions.court_key,
      valid_sessions.location_name,
      valid_sessions.court_name,
      CASE
        WHEN valid_sessions.scheduled_date IS NOT NULL
          AND valid_sessions.period IS NOT NULL
          AND valid_sessions.location_key IS NOT NULL
          AND valid_sessions.court_key IS NOT NULL
        THEN 'SCHEDULED'::public.championship_individual_session_status
        ELSE 'DRAFT'::public.championship_individual_session_status
      END,
      valid_sessions.exclusive_lock_enabled
    FROM valid_sessions
    ON CONFLICT (championship_id, season_year, sport_id, naipe, division) DO UPDATE
    SET
      scheduled_date = EXCLUDED.scheduled_date,
      period = EXCLUDED.period,
      location_key = EXCLUDED.location_key,
      court_key = EXCLUDED.court_key,
      location_name = EXCLUDED.location_name,
      court_name = EXCLUDED.court_name,
      status = CASE
        WHEN public.championship_individual_sessions.status = 'LIVE'::public.championship_individual_session_status THEN public.championship_individual_sessions.status
        WHEN public.championship_individual_sessions.status = 'FINISHED'::public.championship_individual_session_status THEN public.championship_individual_sessions.status
        WHEN EXCLUDED.scheduled_date IS NOT NULL
          AND EXCLUDED.period IS NOT NULL
          AND EXCLUDED.location_key IS NOT NULL
          AND EXCLUDED.court_key IS NOT NULL
        THEN 'SCHEDULED'::public.championship_individual_session_status
        ELSE 'DRAFT'::public.championship_individual_session_status
      END,
      exclusive_lock_enabled = EXCLUDED.exclusive_lock_enabled,
      updated_at = now()
    RETURNING id, sport_id, naipe, division
  )
  SELECT COUNT(*)
  INTO synced_sessions_count
  FROM upserted_sessions;

  UPDATE public.championship_individual_sessions AS sessions_table
  SET
    status = CASE
      WHEN sessions_table.status = 'FINISHED'::public.championship_individual_session_status THEN sessions_table.status
      ELSE 'CANCELLED'::public.championship_individual_session_status
    END,
    updated_at = now()
  WHERE sessions_table.championship_id = _championship_id
    AND sessions_table.season_year = _season_year
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(payload_snapshot->'individual_session_configs', '[]'::jsonb)) AS session_record(value)
      WHERE (session_record.value->>'sport_id')::uuid = sessions_table.sport_id
        AND (session_record.value->>'naipe')::public.match_naipe = sessions_table.naipe
        AND (
          CASE
            WHEN NULLIF(session_record.value->>'division', '') IS NULL THEN NULL
            ELSE (session_record.value->>'division')::public.team_division
          END
        ) IS NOT DISTINCT FROM sessions_table.division
    );

  UPDATE public.championship_individual_events AS events_table
  SET
    session_id = sessions_table.id,
    scheduled_date = sessions_table.scheduled_date,
    period = sessions_table.period,
    location = sessions_table.location_name,
    status = CASE
      WHEN sessions_table.status = 'CANCELLED'::public.championship_individual_session_status THEN 'CANCELLED'::public.championship_individual_event_status
      WHEN sessions_table.status = 'FINISHED'::public.championship_individual_session_status THEN events_table.status
      WHEN sessions_table.scheduled_date IS NOT NULL
        AND sessions_table.period IS NOT NULL
      THEN CASE
        WHEN events_table.status = 'FINISHED'::public.championship_individual_event_status THEN events_table.status
        ELSE 'SCHEDULED'::public.championship_individual_event_status
      END
      ELSE CASE
        WHEN events_table.status = 'FINISHED'::public.championship_individual_event_status THEN events_table.status
        ELSE 'DRAFT'::public.championship_individual_event_status
      END
    END,
    updated_at = now()
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.championship_id = _championship_id
    AND sessions_table.season_year = _season_year
    AND sessions_table.sport_id = events_table.sport_id
    AND sessions_table.naipe = events_table.naipe
    AND sessions_table.division IS NOT DISTINCT FROM events_table.division
    AND events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year;

  PERFORM public.recalculate_championship_individual_standings(_championship_id, _season_year);

  RETURN synced_sessions_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_championship_individual_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
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
        AND entries_table.final_position BETWEEN 1 AND 20
      THEN public.resolve_individual_event_position_points(entries_table.final_position)
        * CASE
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
  LEFT JOIN public.championship_individual_sessions AS sessions_table
    ON sessions_table.id = events_table.session_id
  WHERE events_table.championship_id = _championship_id
    AND events_table.season_year = _season_year
    AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
    AND (
      sessions_table.status = 'FINISHED'::public.championship_individual_session_status
      OR (
        events_table.session_id IS NULL
        AND events_table.status = 'FINISHED'::public.championship_individual_event_status
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

CREATE OR REPLACE FUNCTION public.sync_championship_individual_events_from_setup(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  payload_snapshot JSONB;
  upserted_events_count INTEGER := 0;
BEGIN
  payload_snapshot := public.get_championship_setup_payload_snapshot(_championship_id, _season_year);

  WITH enabled_sports AS (
    SELECT DISTINCT (value)::uuid AS sport_id
    FROM jsonb_array_elements_text(COALESCE(payload_snapshot->'enabled_sport_ids', '[]'::jsonb))
  ),
  selected_modalities AS (
    SELECT DISTINCT
      (modality_record.value->>'sport_id')::uuid AS sport_id,
      (modality_record.value->>'naipe')::public.match_naipe AS naipe,
      CASE
        WHEN NULLIF(modality_record.value->>'division', '') IS NULL THEN NULL
        ELSE (modality_record.value->>'division')::public.team_division
      END AS division
    FROM jsonb_array_elements(COALESCE(payload_snapshot->'participants', '[]'::jsonb)) AS participant_record(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(participant_record.value->'modalities', '[]'::jsonb)) AS modality_record(value)
  ),
  configured_individual_sports AS (
    SELECT
      selected_modalities.sport_id,
      selected_modalities.naipe,
      selected_modalities.division,
      sports_table.name AS sport_name,
      COALESCE(
        (
          SELECT (config_record.value->>'relay_multiplier')::numeric
          FROM jsonb_array_elements(COALESCE(payload_snapshot->'individual_event_configs', '[]'::jsonb)) AS config_record(value)
          WHERE (config_record.value->>'sport_id')::uuid = selected_modalities.sport_id
          LIMIT 1
        ),
        2
      ) AS relay_multiplier
    FROM selected_modalities
    JOIN enabled_sports
      ON enabled_sports.sport_id = selected_modalities.sport_id
    JOIN public.sports AS sports_table
      ON sports_table.id = selected_modalities.sport_id
    WHERE public.resolve_normalized_sport_name(sports_table.name) IN ('atletismo', 'natacao')
  ),
  official_events AS (
    SELECT * FROM (
      VALUES
        ('atletismo', 'ATHLETICS_100M', '100m', 'INDIVIDUAL', 1),
        ('atletismo', 'ATHLETICS_400M', '400m', 'INDIVIDUAL', 2),
        ('atletismo', 'ATHLETICS_4X100', '4x100', 'RELAY', 3),
        ('atletismo', 'ATHLETICS_SHOT_PUT', 'Arremesso de peso', 'INDIVIDUAL', 4),
        ('atletismo', 'ATHLETICS_LONG_JUMP', 'Salto em distância', 'INDIVIDUAL', 5),
        ('natacao', 'SWIMMING_50_FREE', '50m livre', 'INDIVIDUAL', 1),
        ('natacao', 'SWIMMING_50_BACK', '50m costas', 'INDIVIDUAL', 2),
        ('natacao', 'SWIMMING_50_FLY', '50m borboleta', 'INDIVIDUAL', 3),
        ('natacao', 'SWIMMING_50_BREAST', '50m peito', 'INDIVIDUAL', 4),
        ('natacao', 'SWIMMING_4X50_FREE', '4x50 livre', 'RELAY', 5)
    ) AS rows(normalized_sport_name, event_code, event_name, event_kind, display_order)
  ),
  upserted_events AS (
    INSERT INTO public.championship_individual_events (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      event_code,
      name,
      kind,
      display_order,
      relay_multiplier
    )
    SELECT
      _championship_id,
      _season_year,
      configured_individual_sports.sport_id,
      configured_individual_sports.naipe,
      configured_individual_sports.division,
      official_events.event_code,
      official_events.event_name,
      official_events.event_kind::public.championship_individual_event_kind,
      official_events.display_order,
      CASE
        WHEN official_events.event_kind = 'RELAY' THEN configured_individual_sports.relay_multiplier
        ELSE 1
      END
    FROM configured_individual_sports
    JOIN official_events
      ON official_events.normalized_sport_name = public.resolve_normalized_sport_name(configured_individual_sports.sport_name)
    ON CONFLICT (
      championship_id,
      season_year,
      sport_id,
      naipe,
      division,
      event_code
    ) DO UPDATE
    SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      display_order = EXCLUDED.display_order,
      relay_multiplier = EXCLUDED.relay_multiplier,
      updated_at = now()
    RETURNING id
  )
  SELECT COUNT(*)
  INTO upserted_events_count
  FROM upserted_events;

  PERFORM public.sync_championship_individual_sessions_from_setup(_championship_id, _season_year);
  PERFORM public.recalculate_championship_individual_standings(_championship_id, _season_year);

  RETURN upserted_events_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_championship_individual_session(
  _session_id UUID,
  _scheduled_date DATE,
  _period public.championship_schedule_period,
  _location_key TEXT,
  _court_key TEXT,
  _location_name TEXT,
  _court_name TEXT,
  _status public.championship_individual_session_status,
  _exclusive_lock_enabled BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT *
  INTO current_session
  FROM public.championship_individual_sessions AS sessions_table
  WHERE sessions_table.id = _session_id
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessão individual não encontrada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET
    scheduled_date = _scheduled_date,
    period = _period,
    location_key = NULLIF(trim(COALESCE(_location_key, '')), ''),
    court_key = NULLIF(trim(COALESCE(_court_key, '')), ''),
    location_name = NULLIF(trim(COALESCE(_location_name, '')), ''),
    court_name = NULLIF(trim(COALESCE(_court_name, '')), ''),
    status = COALESCE(_status, status),
    exclusive_lock_enabled = COALESCE(_exclusive_lock_enabled, false),
    updated_at = now()
  WHERE id = _session_id;

  UPDATE public.championship_individual_events
  SET
    scheduled_date = _scheduled_date,
    period = _period,
    location = NULLIF(trim(COALESCE(_location_name, '')), ''),
    status = CASE
      WHEN COALESCE(_status, current_session.status) = 'CANCELLED'::public.championship_individual_session_status THEN 'CANCELLED'::public.championship_individual_event_status
      WHEN COALESCE(_status, current_session.status) = 'FINISHED'::public.championship_individual_session_status THEN status
      WHEN _scheduled_date IS NOT NULL AND _period IS NOT NULL THEN
        CASE
          WHEN status = 'FINISHED'::public.championship_individual_event_status THEN status
          ELSE 'SCHEDULED'::public.championship_individual_event_status
        END
      ELSE
        CASE
          WHEN status = 'FINISHED'::public.championship_individual_event_status THEN status
          ELSE 'DRAFT'::public.championship_individual_event_status
        END
    END,
    updated_at = now()
  WHERE session_id = _session_id;

  IF COALESCE(_status, current_session.status) IN (
    'FINISHED'::public.championship_individual_session_status,
    'LIVE'::public.championship_individual_session_status,
    'SCHEDULED'::public.championship_individual_session_status
  ) THEN
    PERFORM public.recalculate_championship_individual_standings(
      current_session.championship_id,
      current_session.season_year
    );
  END IF;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_championship_individual_session(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT *
  INTO current_session
  FROM public.championship_individual_sessions
  WHERE id = _session_id
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessão individual não encontrada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'LIVE'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_championship_individual_session(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT *
  INTO current_session
  FROM public.championship_individual_sessions
  WHERE id = _session_id
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessão individual não encontrada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'FINISHED'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  PERFORM public.recalculate_championship_individual_standings(
    current_session.championship_id,
    current_session.season_year
  );

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_championship_individual_session(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT *
  INTO current_session
  FROM public.championship_individual_sessions
  WHERE id = _session_id
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessão individual não encontrada.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = CASE
    WHEN scheduled_date IS NOT NULL
      AND period IS NOT NULL
      AND location_key IS NOT NULL
      AND court_key IS NOT NULL
    THEN 'LIVE'::public.championship_individual_session_status
    ELSE 'DRAFT'::public.championship_individual_session_status
  END,
      updated_at = now()
  WHERE id = _session_id;

  PERFORM public.recalculate_championship_individual_standings(
    current_session.championship_id,
    current_session.season_year
  );

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_championship_individual_session_scoreboard(
  _session_id UUID
)
RETURNS TABLE (
  session_id UUID,
  team_id UUID,
  total_points NUMERIC,
  confirmed_entries_count INTEGER,
  first_places INTEGER,
  second_places INTEGER,
  third_places INTEGER,
  relay_points_total NUMERIC,
  teams public.teams
)
LANGUAGE sql
STABLE
AS $$
  WITH session_scoreboard AS (
    SELECT
      events_table.session_id,
      entries_table.team_id,
      COALESCE(SUM(entries_table.points_awarded), 0)::numeric AS total_points,
      COUNT(*) FILTER (
        WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND entries_table.final_position IS NOT NULL
      )::integer AS confirmed_entries_count,
      COUNT(*) FILTER (
        WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND entries_table.final_position = 1
      )::integer AS first_places,
      COUNT(*) FILTER (
        WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND entries_table.final_position = 2
      )::integer AS second_places,
      COUNT(*) FILTER (
        WHERE entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND entries_table.final_position = 3
      )::integer AS third_places,
      COALESCE(SUM(entries_table.points_awarded) FILTER (
        WHERE events_table.kind = 'RELAY'::public.championship_individual_event_kind
      ), 0)::numeric AS relay_points_total
    FROM public.championship_individual_event_entries AS entries_table
    JOIN public.championship_individual_events AS events_table
      ON events_table.id = entries_table.event_id
    WHERE events_table.session_id = _session_id
      AND entries_table.status != 'CANCELLED'::public.championship_individual_entry_status
    GROUP BY events_table.session_id, entries_table.team_id
  )
  SELECT
    session_scoreboard.session_id,
    session_scoreboard.team_id,
    session_scoreboard.total_points,
    session_scoreboard.confirmed_entries_count,
    session_scoreboard.first_places,
    session_scoreboard.second_places,
    session_scoreboard.third_places,
    session_scoreboard.relay_points_total,
    teams_table
  FROM session_scoreboard
  JOIN public.teams AS teams_table
    ON teams_table.id = session_scoreboard.team_id
  ORDER BY
    session_scoreboard.total_points DESC,
    session_scoreboard.first_places DESC,
    session_scoreboard.second_places DESC,
    session_scoreboard.third_places DESC,
    teams_table.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.sync_championship_individual_sessions_from_setup(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_championship_individual_session(UUID, DATE, public.championship_schedule_period, TEXT, TEXT, TEXT, TEXT, public.championship_individual_session_status, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_championship_individual_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_championship_individual_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_championship_individual_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_championship_individual_session_scoreboard(UUID) TO anon, authenticated;
