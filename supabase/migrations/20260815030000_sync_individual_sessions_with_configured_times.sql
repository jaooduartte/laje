ALTER TABLE public.championship_individual_sessions
  ADD COLUMN IF NOT EXISTS start_time TIME NULL,
  ADD COLUMN IF NOT EXISTS end_time TIME NULL;

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
      CASE
        WHEN NULLIF(session_record.value->>'start_time', '') IS NULL THEN NULL
        ELSE (session_record.value->>'start_time')::time
      END AS start_time,
      CASE
        WHEN NULLIF(session_record.value->>'end_time', '') IS NULL THEN NULL
        ELSE (session_record.value->>'end_time')::time
      END AS end_time,
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
      start_time,
      end_time,
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
      valid_sessions.start_time,
      valid_sessions.end_time,
      valid_sessions.location_key,
      valid_sessions.court_key,
      valid_sessions.location_name,
      valid_sessions.court_name,
      CASE
        WHEN valid_sessions.scheduled_date IS NOT NULL
          AND valid_sessions.location_key IS NOT NULL
          AND valid_sessions.court_key IS NOT NULL
          AND (
            valid_sessions.period IS NOT NULL
            OR (
              valid_sessions.start_time IS NOT NULL
              AND valid_sessions.end_time IS NOT NULL
            )
          )
        THEN 'SCHEDULED'::public.championship_individual_session_status
        ELSE 'DRAFT'::public.championship_individual_session_status
      END,
      valid_sessions.exclusive_lock_enabled
    FROM valid_sessions
    ON CONFLICT (championship_id, season_year, sport_id, naipe, division) DO UPDATE
    SET
      scheduled_date = EXCLUDED.scheduled_date,
      period = EXCLUDED.period,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      location_key = EXCLUDED.location_key,
      court_key = EXCLUDED.court_key,
      location_name = EXCLUDED.location_name,
      court_name = EXCLUDED.court_name,
      status = CASE
        WHEN public.championship_individual_sessions.status = 'LIVE'::public.championship_individual_session_status THEN public.championship_individual_sessions.status
        WHEN public.championship_individual_sessions.status = 'FINISHED'::public.championship_individual_session_status THEN public.championship_individual_sessions.status
        WHEN EXCLUDED.scheduled_date IS NOT NULL
          AND EXCLUDED.location_key IS NOT NULL
          AND EXCLUDED.court_key IS NOT NULL
          AND (
            EXCLUDED.period IS NOT NULL
            OR (
              EXCLUDED.start_time IS NOT NULL
              AND EXCLUDED.end_time IS NOT NULL
            )
          )
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
      WHEN sessions_table.status IN (
        'SCHEDULED'::public.championship_individual_session_status,
        'LIVE'::public.championship_individual_session_status
      ) THEN CASE
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

CREATE OR REPLACE FUNCTION public.return_championship_individual_session_to_scheduled(
  _session_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  current_session public.championship_individual_sessions%ROWTYPE;
BEGIN
  SELECT sessions_table.*
  INTO current_session
  FROM public.championship_individual_sessions AS sessions_table
  JOIN public.championships AS championships_table
    ON championships_table.id = sessions_table.championship_id
  WHERE sessions_table.id = _session_id
    AND championships_table.status = 'IN_PROGRESS'::public.championship_status
  LIMIT 1;

  IF current_session.id IS NULL THEN
    RAISE EXCEPTION 'A sessão só pode ser alterada com o campeonato em andamento.';
  END IF;

  IF current_session.status != 'LIVE'::public.championship_individual_session_status THEN
    RAISE EXCEPTION 'Somente uma sessão ao vivo pode voltar para agendada.';
  END IF;

  IF current_session.scheduled_date IS NULL
    OR current_session.location_key IS NULL
    OR current_session.court_key IS NULL
    OR (
      current_session.period IS NULL
      AND (
        current_session.start_time IS NULL
        OR current_session.end_time IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'A sessão não possui agendamento completo.';
  END IF;

  UPDATE public.championship_individual_sessions
  SET status = 'SCHEDULED'::public.championship_individual_session_status,
      updated_at = now()
  WHERE id = _session_id;

  RETURN _session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_review_individual_session_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
    OR (
      OLD.status IN (
        'DRAFT'::public.championship_individual_session_status,
        'SCHEDULED'::public.championship_individual_session_status,
        'CANCELLED'::public.championship_individual_session_status
      )
      AND NEW.status IN (
        'DRAFT'::public.championship_individual_session_status,
        'SCHEDULED'::public.championship_individual_session_status,
        'CANCELLED'::public.championship_individual_session_status
      )
    ) THEN
    RETURN NEW;
  END IF;

  SELECT status
  INTO championship_status_value
  FROM public.championships
  WHERE id = NEW.championship_id;

  IF championship_status_value <> 'IN_PROGRESS'::public.championship_status THEN
    RAISE EXCEPTION 'As sessões individuais só podem ser operadas com o campeonato em andamento.';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  championship_season_record RECORD;
BEGIN
  FOR championship_season_record IN
    SELECT DISTINCT
      bracket_editions_table.championship_id,
      bracket_editions_table.season_year
    FROM public.championship_bracket_editions AS bracket_editions_table
    WHERE jsonb_array_length(
      COALESCE(
        bracket_editions_table.payload_snapshot->'individual_session_configs',
        '[]'::jsonb
      )
    ) > 0
  LOOP
    PERFORM public.sync_championship_individual_sessions_from_setup(
      championship_season_record.championship_id,
      championship_season_record.season_year
    );
  END LOOP;
END;
$$;
