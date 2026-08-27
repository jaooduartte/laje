ALTER TABLE public.championship_individual_event_entries
  ADD COLUMN IF NOT EXISTS lane_number INTEGER NULL,
  ADD COLUMN IF NOT EXISTS attempt_one_centimeters INTEGER NULL,
  ADD COLUMN IF NOT EXISTS attempt_two_centimeters INTEGER NULL,
  ADD COLUMN IF NOT EXISTS attempt_three_centimeters INTEGER NULL,
  ADD CONSTRAINT championship_individual_event_entries_lane_number_check
    CHECK (lane_number IS NULL OR lane_number > 0),
  ADD CONSTRAINT championship_individual_event_entries_attempt_one_centimeters_check
    CHECK (attempt_one_centimeters IS NULL OR attempt_one_centimeters >= 0),
  ADD CONSTRAINT championship_individual_event_entries_attempt_two_centimeters_check
    CHECK (attempt_two_centimeters IS NULL OR attempt_two_centimeters >= 0),
  ADD CONSTRAINT championship_individual_event_entries_attempt_three_centimeters_check
    CHECK (attempt_three_centimeters IS NULL OR attempt_three_centimeters >= 0);

DROP INDEX IF EXISTS public.championship_individual_event_entries_unique_relay_idx;

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_manual_lane_idx
  ON public.championship_individual_event_entries (event_id, team_id, lane_number)
  WHERE lane_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS championship_individual_event_entries_unique_relay_team_idx
  ON public.championship_individual_event_entries (event_id, team_id)
  WHERE entry_type = 'RELAY'::public.championship_individual_event_kind;

CREATE OR REPLACE FUNCTION public.save_championship_individual_event_live_results(
  _event_id UUID,
  _entries JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  current_event public.championship_individual_events%ROWTYPE;
  is_measurement_event BOOLEAN;
  normalized_sport_name TEXT;
  confirmed_team_count INTEGER;
  entry_record RECORD;
  saved_entry_id UUID;
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

  SELECT public.resolve_normalized_sport_name(sports_table.name)
  INTO normalized_sport_name
  FROM public.sports AS sports_table
  WHERE sports_table.id = current_event.sport_id;

  is_measurement_event := current_event.event_code IN ('ATHLETICS_SHOT_PUT', 'ATHLETICS_LONG_JUMP');

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    WHERE entry_row.team_id IS NULL
      OR entry_row.lane_number IS NULL
      OR entry_row.lane_number < 1
      OR (
        entry_row.status = 'CONFIRMED'::public.championship_individual_entry_status
        AND (
          (is_measurement_event AND (
            entry_row.attempt_one_centimeters IS NULL
            OR entry_row.attempt_two_centimeters IS NULL
            OR entry_row.attempt_three_centimeters IS NULL
            OR entry_row.result_time_milliseconds IS NOT NULL
          ))
          OR (NOT is_measurement_event AND (
            entry_row.result_time_milliseconds IS NULL
            OR entry_row.attempt_one_centimeters IS NOT NULL
            OR entry_row.attempt_two_centimeters IS NOT NULL
            OR entry_row.attempt_three_centimeters IS NOT NULL
          ))
        )
      )
  ) THEN
    RAISE EXCEPTION 'Informe atlética, raia e o resultado completo de cada participante confirmado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    GROUP BY entry_row.team_id, entry_row.lane_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada atlética pode ocupar uma raia apenas uma vez por prova.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    LEFT JOIN public.teams AS teams_table
      ON teams_table.id = entry_row.team_id
    WHERE teams_table.id IS NULL
      OR teams_table.is_active IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Selecione uma atlética ativa para cada registro.';
  END IF;

  IF current_event.kind = 'RELAY'::public.championship_individual_event_kind
    AND EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      GROUP BY entry_row.team_id
      HAVING COUNT(*) > 1
    ) THEN
    RAISE EXCEPTION 'Cada atlética pode ter somente um registro em prova de revezamento.';
  END IF;

  IF normalized_sport_name = 'natacao'
    AND current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind
    AND EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      GROUP BY entry_row.team_id
      HAVING COUNT(*) > 3
    ) THEN
    RAISE EXCEPTION 'Cada atlética pode registrar no máximo 3 participantes por prova individual de Natação.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
    WHERE entry_row.status = 'CONFIRMED'::public.championship_individual_entry_status
    GROUP BY CASE
      WHEN is_measurement_event THEN GREATEST(
        entry_row.attempt_one_centimeters,
        entry_row.attempt_two_centimeters,
        entry_row.attempt_three_centimeters
      )
      ELSE entry_row.result_time_milliseconds
    END
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Empates devem ser resolvidos pela arbitragem antes da confirmação.';
  END IF;

  UPDATE public.championship_individual_event_entries AS entries_table
  SET
    status = 'PENDING'::public.championship_individual_entry_status,
    result_time_milliseconds = NULL,
    result_mark_centimeters = NULL,
    attempt_one_centimeters = NULL,
    attempt_two_centimeters = NULL,
    attempt_three_centimeters = NULL,
    final_position = NULL,
    updated_at = now()
  WHERE entries_table.event_id = _event_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
        entry_id UUID,
        team_id UUID,
        lane_number INTEGER,
        status public.championship_individual_entry_status,
        result_time_milliseconds INTEGER,
        attempt_one_centimeters INTEGER,
        attempt_two_centimeters INTEGER,
        attempt_three_centimeters INTEGER
      )
      WHERE entry_row.entry_id = entries_table.id
    );

  FOR entry_record IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(_entries, '[]'::jsonb)) AS entry_row(
      entry_id UUID,
      team_id UUID,
      lane_number INTEGER,
      status public.championship_individual_entry_status,
      result_time_milliseconds INTEGER,
      attempt_one_centimeters INTEGER,
      attempt_two_centimeters INTEGER,
      attempt_three_centimeters INTEGER
    )
  LOOP
    SELECT entries_table.id
    INTO saved_entry_id
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.id = entry_record.entry_id
      AND entries_table.event_id = _event_id;

    IF saved_entry_id IS NULL THEN
      SELECT entries_table.id
      INTO saved_entry_id
      FROM public.championship_individual_event_entries AS entries_table
      WHERE entries_table.event_id = _event_id
        AND entries_table.team_id = entry_record.team_id
        AND entries_table.lane_number = entry_record.lane_number
      LIMIT 1;
    END IF;

    IF saved_entry_id IS NULL THEN
      INSERT INTO public.championship_individual_event_entries (
        event_id,
        team_id,
        entry_type,
        lane_number
      ) VALUES (
        _event_id,
        entry_record.team_id,
        current_event.kind,
        entry_record.lane_number
      )
      RETURNING id INTO saved_entry_id;
    END IF;

    UPDATE public.championship_individual_event_entries
    SET
      athlete_id = NULL,
      athlete_name = NULL,
      lane_number = entry_record.lane_number,
      status = entry_record.status,
      result_time_milliseconds = CASE
        WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND NOT is_measurement_event THEN entry_record.result_time_milliseconds
        ELSE NULL
      END,
      attempt_one_centimeters = CASE
        WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND is_measurement_event THEN entry_record.attempt_one_centimeters
        ELSE NULL
      END,
      attempt_two_centimeters = CASE
        WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND is_measurement_event THEN entry_record.attempt_two_centimeters
        ELSE NULL
      END,
      attempt_three_centimeters = CASE
        WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND is_measurement_event THEN entry_record.attempt_three_centimeters
        ELSE NULL
      END,
      result_mark_centimeters = CASE
        WHEN entry_record.status = 'CONFIRMED'::public.championship_individual_entry_status
          AND is_measurement_event THEN GREATEST(
            entry_record.attempt_one_centimeters,
            entry_record.attempt_two_centimeters,
            entry_record.attempt_three_centimeters
          )
        ELSE NULL
      END,
      final_position = NULL,
      updated_at = now()
    WHERE id = saved_entry_id;
  END LOOP;

  WITH ranked_entries AS (
    SELECT
      entries_table.id,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN is_measurement_event THEN entries_table.result_mark_centimeters END DESC NULLS LAST,
          CASE WHEN NOT is_measurement_event THEN entries_table.result_time_milliseconds END ASC NULLS LAST,
          entries_table.id
      ) AS final_position
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.event_id = _event_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status
  )
  UPDATE public.championship_individual_event_entries AS entries_table
  SET final_position = ranked_entries.final_position
  FROM ranked_entries
  WHERE entries_table.id = ranked_entries.id;

  IF normalized_sport_name = 'atletismo'
    AND current_event.kind = 'INDIVIDUAL'::public.championship_individual_event_kind THEN
    SELECT COUNT(DISTINCT entries_table.team_id)
    INTO confirmed_team_count
    FROM public.championship_individual_event_entries AS entries_table
    WHERE entries_table.event_id = _event_id
      AND entries_table.status = 'CONFIRMED'::public.championship_individual_entry_status;

    IF confirmed_team_count < 2 THEN
      RAISE EXCEPTION 'Provas individuais do Atletismo precisam ter ao menos 2 atléticas diferentes confirmadas.';
    END IF;
  END IF;

  UPDATE public.championship_individual_events
  SET
    status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.championship_individual_event_entries AS entries_table
        WHERE entries_table.event_id = _event_id
          AND entries_table.status IN (
            'CONFIRMED'::public.championship_individual_entry_status,
            'WALKOVER'::public.championship_individual_entry_status,
            'DSQ'::public.championship_individual_entry_status
          )
      ) THEN 'FINISHED'::public.championship_individual_event_status
      ELSE 'SCHEDULED'::public.championship_individual_event_status
    END,
    updated_at = now()
  WHERE id = _event_id;

  PERFORM public.recalculate_championship_individual_standings(
    current_event.championship_id,
    current_event.season_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_championship_individual_event_live_results(UUID, JSONB) TO authenticated;
