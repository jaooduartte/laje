-- Migra o planejamento coletivo do modelo legado MATUTINO/VESPERTINO
-- para janelas reais por data.
--
-- Estratégia:
-- - `competition_date_availability` e
--   `team_competition_date_availability` passam a ser autoritativas
--   quando presentes para a combinação consultada;
-- - o modelo legado por período continua como fallback compatível;
-- - FULL_DAY não impõe limite de término adicional para jogos coletivos:
--   apenas o horário de início precisa respeitar a agenda diária;
-- - CUSTOM exige encaixe integral dentro da janela configurada;
-- - UNAVAILABLE zera a disponibilidade;
-- - intervalos da etapa 7 continuam sendo ocupações físicas do dia,
--   nunca convertidos em disponibilidade.

CREATE OR REPLACE FUNCTION
  public.resolve_championship_bracket_schedule_day_bounds(
    _payload JSONB,
    _event_date DATE
  )
RETURNS TABLE (
  day_start_at TIMESTAMPTZ,
  day_end_at TIMESTAMPTZ,
  day_start_time TIME,
  day_end_time TIME,
  break_start_time TIME,
  break_end_time TIME
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  schedule_day_record JSONB;
BEGIN
  SELECT
    schedule_day_item.value
  INTO schedule_day_record
  FROM jsonb_array_elements(
    COALESCE(
      _payload -> 'schedule_days',
      '[]'::jsonb
    )
  ) AS schedule_day_item(value)
  WHERE NULLIF(
      schedule_day_item.value ->> 'date',
      ''
    )::date =
      _event_date
  LIMIT 1;


  IF schedule_day_record IS NULL THEN
    RETURN;
  END IF;


  day_start_time :=
    NULLIF(
      schedule_day_record ->> 'start_time',
      ''
    )::time;

  day_end_time :=
    NULLIF(
      schedule_day_record ->> 'end_time',
      ''
    )::time;

  break_start_time :=
    NULLIF(
      schedule_day_record ->> 'break_start_time',
      ''
    )::time;

  break_end_time :=
    NULLIF(
      schedule_day_record ->> 'break_end_time',
      ''
    )::time;


  IF day_start_time IS NULL
    OR day_end_time IS NULL
    OR day_end_time <= day_start_time
  THEN
    RETURN;
  END IF;


  day_start_at :=
    public.combine_bracket_schedule_timestamp(
      _event_date,
      day_start_time
    );

  day_end_at :=
    public.combine_bracket_schedule_timestamp(
      _event_date,
      day_end_time
    );


  RETURN NEXT;
END;
$function$;


CREATE OR REPLACE FUNCTION
  public.resolve_bracket_schedule_period_bounds_from_payload(
    _payload JSONB,
    _event_date DATE,
    _period public.championship_schedule_period
  )
RETURNS TABLE (
  period_start_at TIMESTAMPTZ,
  period_end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  day_bounds RECORD;
  day_middle_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO day_bounds
  FROM public.resolve_championship_bracket_schedule_day_bounds(
    _payload,
    _event_date
  )
  LIMIT 1;


  IF day_bounds.day_start_at IS NULL
    OR day_bounds.day_end_at IS NULL
  THEN
    RETURN;
  END IF;


  day_middle_at :=
    day_bounds.day_start_at
    + (
      (
        day_bounds.day_end_at
        - day_bounds.day_start_at
      ) / 2.0
    );


  IF _period =
    'MATUTINO'::public.championship_schedule_period
  THEN
    period_start_at :=
      day_bounds.day_start_at;

    period_end_at :=
      CASE
        WHEN day_bounds.break_start_time IS NOT NULL
          AND day_bounds.break_start_time >
            day_bounds.day_start_time
        THEN
          public.combine_bracket_schedule_timestamp(
            _event_date,
            day_bounds.break_start_time
          )

        ELSE
          day_middle_at
      END;
  ELSE
    period_start_at :=
      CASE
        WHEN day_bounds.break_end_time IS NOT NULL
          AND day_bounds.break_end_time <
            day_bounds.day_end_time
        THEN
          public.combine_bracket_schedule_timestamp(
            _event_date,
            day_bounds.break_end_time
          )

        ELSE
          day_middle_at
      END;

    period_end_at :=
      day_bounds.day_end_at;
  END IF;


  IF period_start_at >= period_end_at THEN
    RETURN;
  END IF;


  RETURN NEXT;
END;
$function$;


CREATE OR REPLACE FUNCTION
  public.resolve_bracket_schedule_period_by_timestamp(
    _payload JSONB,
    _event_date DATE,
    _scheduled_start_at TIMESTAMPTZ
  )
RETURNS public.championship_schedule_period
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  day_bounds RECORD;
  break_start_at TIMESTAMPTZ;
  break_end_at TIMESTAMPTZ;
  day_middle_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO day_bounds
  FROM public.resolve_championship_bracket_schedule_day_bounds(
    _payload,
    _event_date
  )
  LIMIT 1;


  IF day_bounds.day_start_at IS NULL
    OR day_bounds.day_end_at IS NULL
  THEN
    RETURN 'MATUTINO'::public.championship_schedule_period;
  END IF;


  IF day_bounds.break_start_time IS NOT NULL
    AND day_bounds.break_end_time IS NOT NULL
    AND day_bounds.break_end_time > day_bounds.break_start_time
  THEN
    break_start_at :=
      public.combine_bracket_schedule_timestamp(
        _event_date,
        day_bounds.break_start_time
      );

    break_end_at :=
      public.combine_bracket_schedule_timestamp(
        _event_date,
        day_bounds.break_end_time
      );

    IF _scheduled_start_at < break_start_at THEN
      RETURN 'MATUTINO'::public.championship_schedule_period;
    END IF;

    IF _scheduled_start_at >= break_end_at THEN
      RETURN 'VESPERTINO'::public.championship_schedule_period;
    END IF;
  END IF;


  day_middle_at :=
    day_bounds.day_start_at
    + (
      (
        day_bounds.day_end_at
        - day_bounds.day_start_at
      ) / 2.0
    );


  IF _scheduled_start_at < day_middle_at THEN
    RETURN 'MATUTINO'::public.championship_schedule_period;
  END IF;


  RETURN 'VESPERTINO'::public.championship_schedule_period;
END;
$function$;


CREATE OR REPLACE FUNCTION
  public.resolve_championship_bracket_competition_schedule_windows(
    _payload JSONB,
    _competition_key TEXT,
    _event_date DATE
  )
RETURNS TABLE (
  window_start_at TIMESTAMPTZ,
  window_end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  availability_record JSONB;
  window_record JSONB;
  legacy_period public.championship_schedule_period;

  day_bounds RECORD;

  availability_mode TEXT;

  previous_window_end_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO day_bounds
  FROM public.resolve_championship_bracket_schedule_day_bounds(
    _payload,
    _event_date
  )
  LIMIT 1;


  IF day_bounds.day_start_at IS NULL
    OR day_bounds.day_end_at IS NULL
  THEN
    RETURN;
  END IF;


  SELECT
    availability_item.value
  INTO availability_record
  FROM jsonb_array_elements(
    COALESCE(
      _payload -> 'competition_date_availability',
      '[]'::jsonb
    )
  ) AS availability_item(value)
  WHERE availability_item.value ->> 'competition_key' =
      _competition_key

    AND NULLIF(
      availability_item.value ->> 'date',
      ''
    )::date =
      _event_date
  LIMIT 1;


  IF availability_record IS NOT NULL THEN
    availability_mode :=
      COALESCE(
        availability_record ->> 'mode',
        'FULL_DAY'
      );

    IF availability_mode = 'UNAVAILABLE' THEN
      RETURN;
    END IF;

    IF availability_mode = 'FULL_DAY' THEN
      window_start_at := day_bounds.day_start_at;
      window_end_at := day_bounds.day_end_at;
      RETURN NEXT;
      RETURN;
    END IF;

    IF availability_mode <> 'CUSTOM' THEN
      RETURN;
    END IF;

    previous_window_end_at := NULL;

    FOR window_record IN
      SELECT
        window_item.value
      FROM jsonb_array_elements(
        COALESCE(
          availability_record -> 'windows',
          '[]'::jsonb
        )
      ) AS window_item(value)
      ORDER BY
        COALESCE(
          window_item.value ->> 'start_time',
          ''
        ) ASC,
        COALESCE(
          window_item.value ->> 'end_time',
          ''
        ) ASC
    LOOP
      IF NULLIF(
          window_record ->> 'start_time',
          ''
        ) IS NULL
        OR NULLIF(
          window_record ->> 'end_time',
          ''
        ) IS NULL
      THEN
        RETURN;
      END IF;

      window_start_at :=
        public.combine_bracket_schedule_timestamp(
          _event_date,
          (window_record ->> 'start_time')::time
        );

      window_end_at :=
        public.combine_bracket_schedule_timestamp(
          _event_date,
          (window_record ->> 'end_time')::time
        );

      IF window_end_at <= window_start_at
        OR window_start_at < day_bounds.day_start_at
        OR window_end_at > day_bounds.day_end_at
      THEN
        RETURN;
      END IF;

      IF previous_window_end_at IS NOT NULL
        AND window_start_at < previous_window_end_at
      THEN
        RETURN;
      END IF;

      previous_window_end_at := window_end_at;
      RETURN NEXT;
    END LOOP;

    RETURN;
  END IF;


  FOR legacy_period IN
    SELECT
      'MATUTINO'::public.championship_schedule_period
    UNION ALL
    SELECT
      'VESPERTINO'::public.championship_schedule_period
  LOOP
    IF NOT public.is_schedule_period_enabled_by_payload(
      _payload,
      _event_date,
      legacy_period
    )
    THEN
      CONTINUE;
    END IF;

    IF NOT public.is_competition_period_enabled_by_payload(
      _payload,
      _competition_key,
      _event_date,
      legacy_period
    )
    THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    SELECT
      period_bounds.period_start_at,
      period_bounds.period_end_at
    FROM public.resolve_bracket_schedule_period_bounds_from_payload(
      _payload,
      _event_date,
      legacy_period
    ) AS period_bounds;
  END LOOP;
END;
$function$;


CREATE OR REPLACE FUNCTION
  public.resolve_championship_bracket_team_schedule_windows(
    _payload JSONB,
    _team_id UUID,
    _competition_key TEXT,
    _event_date DATE
  )
RETURNS TABLE (
  window_start_at TIMESTAMPTZ,
  window_end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  availability_record JSONB;
  window_record JSONB;
  legacy_period public.championship_schedule_period;

  day_bounds RECORD;

  availability_mode TEXT;

  previous_window_end_at TIMESTAMPTZ;
BEGIN
  SELECT *
  INTO day_bounds
  FROM public.resolve_championship_bracket_schedule_day_bounds(
    _payload,
    _event_date
  )
  LIMIT 1;


  IF day_bounds.day_start_at IS NULL
    OR day_bounds.day_end_at IS NULL
  THEN
    RETURN;
  END IF;


  SELECT
    availability_item.value
  INTO availability_record
  FROM jsonb_array_elements(
    COALESCE(
      _payload -> 'team_competition_date_availability',
      '[]'::jsonb
    )
  ) AS availability_item(value)
  WHERE NULLIF(
      availability_item.value ->> 'team_id',
      ''
    )::uuid =
      _team_id

    AND availability_item.value ->> 'competition_key' =
      _competition_key

    AND NULLIF(
      availability_item.value ->> 'date',
      ''
    )::date =
      _event_date
  LIMIT 1;


  IF availability_record IS NOT NULL THEN
    availability_mode :=
      COALESCE(
        availability_record ->> 'mode',
        'FULL_DAY'
      );

    IF availability_mode = 'UNAVAILABLE' THEN
      RETURN;
    END IF;

    IF availability_mode = 'FULL_DAY' THEN
      window_start_at := day_bounds.day_start_at;
      window_end_at := day_bounds.day_end_at;
      RETURN NEXT;
      RETURN;
    END IF;

    IF availability_mode <> 'CUSTOM' THEN
      RETURN;
    END IF;

    previous_window_end_at := NULL;

    FOR window_record IN
      SELECT
        window_item.value
      FROM jsonb_array_elements(
        COALESCE(
          availability_record -> 'windows',
          '[]'::jsonb
        )
      ) AS window_item(value)
      ORDER BY
        COALESCE(
          window_item.value ->> 'start_time',
          ''
        ) ASC,
        COALESCE(
          window_item.value ->> 'end_time',
          ''
        ) ASC
    LOOP
      IF NULLIF(
          window_record ->> 'start_time',
          ''
        ) IS NULL
        OR NULLIF(
          window_record ->> 'end_time',
          ''
        ) IS NULL
      THEN
        RETURN;
      END IF;

      window_start_at :=
        public.combine_bracket_schedule_timestamp(
          _event_date,
          (window_record ->> 'start_time')::time
        );

      window_end_at :=
        public.combine_bracket_schedule_timestamp(
          _event_date,
          (window_record ->> 'end_time')::time
        );

      IF window_end_at <= window_start_at
        OR window_start_at < day_bounds.day_start_at
        OR window_end_at > day_bounds.day_end_at
      THEN
        RETURN;
      END IF;

      IF previous_window_end_at IS NOT NULL
        AND window_start_at < previous_window_end_at
      THEN
        RETURN;
      END IF;

      previous_window_end_at := window_end_at;
      RETURN NEXT;
    END LOOP;

    RETURN;
  END IF;


  FOR legacy_period IN
    SELECT
      'MATUTINO'::public.championship_schedule_period
    UNION ALL
    SELECT
      'VESPERTINO'::public.championship_schedule_period
  LOOP
    IF NOT public.is_schedule_period_enabled_by_payload(
      _payload,
      _event_date,
      legacy_period
    )
    THEN
      CONTINUE;
    END IF;

    IF NOT public.is_team_competition_period_enabled_by_payload(
      _payload,
      _team_id,
      _competition_key,
      _event_date,
      legacy_period
    )
    THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    SELECT
      period_bounds.period_start_at,
      period_bounds.period_end_at
    FROM public.resolve_bracket_schedule_period_bounds_from_payload(
      _payload,
      _event_date,
      legacy_period
    ) AS period_bounds;
  END LOOP;
END;
$function$;


CREATE OR REPLACE FUNCTION
  public.is_championship_bracket_competition_period_playable(
    _payload JSONB,
    _competition_key TEXT,
    _event_date DATE,
    _period public.championship_schedule_period
  )
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_bracket_schedule_period_bounds_from_payload(
      _payload,
      _event_date,
      _period
    ) AS period_bounds
    JOIN public.resolve_championship_bracket_competition_schedule_windows(
      _payload,
      _competition_key,
      _event_date
    ) AS availability_windows
      ON availability_windows.window_start_at <
          period_bounds.period_end_at
      AND availability_windows.window_end_at >
          period_bounds.period_start_at
  );
$function$;


CREATE OR REPLACE FUNCTION
  public.is_championship_bracket_team_period_playable(
    _payload JSONB,
    _team_id UUID,
    _competition_key TEXT,
    _event_date DATE,
    _period public.championship_schedule_period
  )
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_bracket_schedule_period_bounds_from_payload(
      _payload,
      _event_date,
      _period
    ) AS period_bounds
    JOIN public.resolve_championship_bracket_team_schedule_windows(
      _payload,
      _team_id,
      _competition_key,
      _event_date
    ) AS availability_windows
      ON availability_windows.window_start_at <
          period_bounds.period_end_at
      AND availability_windows.window_end_at >
          period_bounds.period_start_at
  );
$function$;


CREATE OR REPLACE FUNCTION
  public.is_championship_bracket_competition_slot_playable(
    _payload JSONB,
    _competition_key TEXT,
    _event_date DATE,
    _slot_start_at TIMESTAMPTZ,
    _slot_end_at TIMESTAMPTZ
  )
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  availability_record JSONB;
  day_bounds RECORD;
BEGIN
  SELECT *
  INTO day_bounds
  FROM public.resolve_championship_bracket_schedule_day_bounds(
    _payload,
    _event_date
  )
  LIMIT 1;


  IF day_bounds.day_start_at IS NULL
    OR day_bounds.day_end_at IS NULL
  THEN
    RETURN false;
  END IF;


  SELECT
    availability_item.value
  INTO availability_record
  FROM jsonb_array_elements(
    COALESCE(
      _payload -> 'competition_date_availability',
      '[]'::jsonb
    )
  ) AS availability_item(value)
  WHERE availability_item.value ->> 'competition_key' =
      _competition_key

    AND NULLIF(
      availability_item.value ->> 'date',
      ''
    )::date =
      _event_date
  LIMIT 1;


  IF availability_record IS NOT NULL THEN
    CASE COALESCE(
      availability_record ->> 'mode',
      'FULL_DAY'
    )
      WHEN 'UNAVAILABLE' THEN
        RETURN false;

      WHEN 'FULL_DAY' THEN
        RETURN
          _slot_start_at >= day_bounds.day_start_at
          AND _slot_start_at < day_bounds.day_end_at;

      WHEN 'CUSTOM' THEN
        RETURN EXISTS (
          SELECT 1
          FROM public.resolve_championship_bracket_competition_schedule_windows(
            _payload,
            _competition_key,
            _event_date
          ) AS availability_windows
          WHERE _slot_start_at >= availability_windows.window_start_at
            AND _slot_end_at <= availability_windows.window_end_at
        );

      ELSE
        RETURN false;
    END CASE;
  END IF;


  RETURN EXISTS (
    SELECT 1
    FROM public.resolve_championship_bracket_competition_schedule_windows(
      _payload,
      _competition_key,
      _event_date
    ) AS availability_windows
    WHERE _slot_start_at >= availability_windows.window_start_at
      AND _slot_end_at <= availability_windows.window_end_at
  );
END;
$function$;


CREATE OR REPLACE FUNCTION
  public.is_championship_bracket_team_slot_playable(
    _payload JSONB,
    _team_id UUID,
    _competition_key TEXT,
    _event_date DATE,
    _slot_start_at TIMESTAMPTZ,
    _slot_end_at TIMESTAMPTZ
  )
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  availability_record JSONB;
  day_bounds RECORD;
BEGIN
  SELECT *
  INTO day_bounds
  FROM public.resolve_championship_bracket_schedule_day_bounds(
    _payload,
    _event_date
  )
  LIMIT 1;


  IF day_bounds.day_start_at IS NULL
    OR day_bounds.day_end_at IS NULL
  THEN
    RETURN false;
  END IF;


  SELECT
    availability_item.value
  INTO availability_record
  FROM jsonb_array_elements(
    COALESCE(
      _payload -> 'team_competition_date_availability',
      '[]'::jsonb
    )
  ) AS availability_item(value)
  WHERE NULLIF(
      availability_item.value ->> 'team_id',
      ''
    )::uuid =
      _team_id

    AND availability_item.value ->> 'competition_key' =
      _competition_key

    AND NULLIF(
      availability_item.value ->> 'date',
      ''
    )::date =
      _event_date
  LIMIT 1;


  IF availability_record IS NOT NULL THEN
    CASE COALESCE(
      availability_record ->> 'mode',
      'FULL_DAY'
    )
      WHEN 'UNAVAILABLE' THEN
        RETURN false;

      WHEN 'FULL_DAY' THEN
        RETURN
          _slot_start_at >= day_bounds.day_start_at
          AND _slot_start_at < day_bounds.day_end_at;

      WHEN 'CUSTOM' THEN
        RETURN EXISTS (
          SELECT 1
          FROM public.resolve_championship_bracket_team_schedule_windows(
            _payload,
            _team_id,
            _competition_key,
            _event_date
          ) AS availability_windows
          WHERE _slot_start_at >= availability_windows.window_start_at
            AND _slot_end_at <= availability_windows.window_end_at
        );

      ELSE
        RETURN false;
    END CASE;
  END IF;


  RETURN EXISTS (
    SELECT 1
    FROM public.resolve_championship_bracket_team_schedule_windows(
      _payload,
      _team_id,
      _competition_key,
      _event_date
    ) AS availability_windows
    WHERE _slot_start_at >= availability_windows.window_start_at
      AND _slot_end_at <= availability_windows.window_end_at
  );
END;
$function$;


DO $migration_generate_real_date_availability$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.generate_championship_bracket_groups(uuid,jsonb)'
      ::regprocedure
  )
  INTO function_definition;


  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função generate_championship_bracket_groups(uuid,jsonb) não existe.';
  END IF;


  IF strpos(
    function_definition,
    'is_championship_bracket_competition_period_playable'
  ) > 0 THEN
    RETURN;
  END IF;


  updated_definition := function_definition;

  source_block :=
$source$
        SELECT schedule_periods_table.enabled
        INTO current_schedule_period_enabled
        FROM temp_schedule_periods AS schedule_periods_table
        WHERE schedule_periods_table.event_date = selected_queue_date
          AND schedule_periods_table.period = candidate_schedule_period;

        IF COALESCE(current_schedule_period_enabled, false) = false THEN
          CONTINUE;
        END IF;

        SELECT competition_availability_table.enabled
        INTO current_competition_period_enabled
        FROM temp_competition_period_availability AS competition_availability_table
        WHERE competition_availability_table.competition_key = pending_group_match_record.competition_key
          AND competition_availability_table.event_date = selected_queue_date
          AND competition_availability_table.period = candidate_schedule_period;

        IF COALESCE(current_competition_period_enabled, true) = false THEN
          CONTINUE;
        END IF;

        SELECT team_availability_table.enabled
        INTO current_home_team_period_enabled
        FROM temp_team_competition_availability AS team_availability_table
        WHERE team_availability_table.team_id = pending_group_match_record.home_team_id
          AND team_availability_table.competition_key = pending_group_match_record.competition_key
          AND team_availability_table.event_date = selected_queue_date
          AND team_availability_table.period = candidate_schedule_period;

        IF COALESCE(current_home_team_period_enabled, true) = false THEN
          CONTINUE;
        END IF;

        SELECT team_availability_table.enabled
        INTO current_away_team_period_enabled
        FROM temp_team_competition_availability AS team_availability_table
        WHERE team_availability_table.team_id = pending_group_match_record.away_team_id
          AND team_availability_table.competition_key = pending_group_match_record.competition_key
          AND team_availability_table.event_date = selected_queue_date
          AND team_availability_table.period = candidate_schedule_period;

        IF COALESCE(current_away_team_period_enabled, true) = false THEN
          CONTINUE;
        END IF;
$source$;

  target_block :=
$target$
        IF NOT public.is_championship_bracket_competition_period_playable(
          _payload,
          pending_group_match_record.competition_key,
          selected_queue_date,
          candidate_schedule_period::public.championship_schedule_period
        ) THEN
          CONTINUE;
        END IF;

        IF NOT public.is_championship_bracket_team_period_playable(
          _payload,
          pending_group_match_record.home_team_id,
          pending_group_match_record.competition_key,
          selected_queue_date,
          candidate_schedule_period::public.championship_schedule_period
        ) THEN
          CONTINUE;
        END IF;

        IF NOT public.is_championship_bracket_team_period_playable(
          _payload,
          pending_group_match_record.away_team_id,
          pending_group_match_record.competition_key,
          selected_queue_date,
          candidate_schedule_period::public.championship_schedule_period
        ) THEN
          CONTINUE;
        END IF;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a validação legada de disponibilidade na geração dos grupos.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  EXECUTE updated_definition;
END;
$migration_generate_real_date_availability$;


DO $migration_knockout_real_date_availability$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.rebuild_championship_knockout_schedule_reservations(uuid,boolean)'
      ::regprocedure
  )
  INTO function_definition;


  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função rebuild_championship_knockout_schedule_reservations(uuid,boolean) não existe.';
  END IF;


  IF strpos(
    function_definition,
    'resolve_championship_bracket_competition_schedule_windows'
  ) > 0 THEN
    RETURN;
  END IF;


  updated_definition := function_definition;

  source_block :=
$source$
  period_record RECORD;
  manual_final_record RECORD;
$source$;

  target_block :=
$target$
  period_record RECORD;
  availability_window_record RECORD;
  manual_final_record RECORD;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível adicionar o iterador de janelas reais ao scheduler do mata-mata.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
        FOR period_record IN
          SELECT
            'MATUTINO'
              ::public.championship_schedule_period
                AS period

          UNION ALL

          SELECT
            'VESPERTINO'
              ::public.championship_schedule_period
                AS period
        LOOP
          /*
           * Períodos globais desabilitados continuam sendo
           * restrições duras.
           */
          IF NOT public.is_schedule_period_enabled_by_payload(
            edition_record.payload_snapshot,
            court_record.event_date,
            period_record.period
          )
          THEN
            CONTINUE;
          END IF;


          /*
           * Disponibilidade da modalidade/naipe/divisão da etapa 9.
           *
           * Esta verificação vale para o mata-mata.
           *
           * Não existe aqui qualquer consulta à disponibilidade
           * específica das atléticas da etapa 10.
           */
          IF NOT public.is_competition_period_enabled_by_payload(
            edition_record.payload_snapshot,
            competition_key_value,
            court_record.event_date,
            period_record.period
          )
          THEN
            CONTINUE;
          END IF;


          /*
           * Bloqueios HARD representam ocupação exclusiva do recurso.
           */
          IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(
                  edition_record.payload_snapshot
                    -> 'resource_locks'
                ) = 'array'
                THEN
                  edition_record.payload_snapshot
                    -> 'resource_locks'
                ELSE
                  '[]'::jsonb
              END
            ) AS lock_record(value)

            WHERE COALESCE(
              lock_record.value ->> 'lock_mode',
              ''
            ) = 'HARD'

              AND NULLIF(
                lock_record.value ->> 'date',
                ''
              )::date =
                court_record.event_date

              AND COALESCE(
                lock_record.value ->> 'period',
                ''
              ) =
                period_record.period::text

              AND public.normalize_bracket_entity_name(
                COALESCE(
                  lock_record.value
                    ->> 'location_name',
                  ''
                )
              ) =
                public.normalize_bracket_entity_name(
                  court_record.location_name
                )

              AND public.normalize_bracket_entity_name(
                COALESCE(
                  lock_record.value
                    ->> 'court_name',
                  ''
                )
              ) =
                public.normalize_bracket_entity_name(
                  court_record.court_name
                )
          )
          THEN
            CONTINUE;
          END IF;


          IF period_record.period =
            'MATUTINO'
              ::public.championship_schedule_period
          THEN
            period_start_at :=
              day_start_at;

            period_end_at :=
              CASE
                WHEN court_record.break_start_time
                  IS NOT NULL

                  AND court_record.break_start_time >
                    court_record.day_start_time
                THEN
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    court_record.break_start_time
                  )

                ELSE
                  day_middle_at
              END;
          ELSE
            period_start_at :=
              CASE
                WHEN court_record.break_end_time
                  IS NOT NULL

                  AND court_record.break_end_time <
                    court_record.day_end_time
                THEN
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    court_record.break_end_time
                  )

                ELSE
                  day_middle_at
              END;

            period_end_at :=
              day_end_at;
          END IF;


          IF period_start_at >=
            period_end_at
          THEN
            CONTINUE;
          END IF;


          candidate_start_at :=
            GREATEST(
              period_start_at,
              dependency_ready_at
            );


          IF candidate_start_at >=
            period_end_at
          THEN
            CONTINUE;
          END IF;


          candidate_is_valid :=
            false;
$source$;

  target_block :=
$target$
        FOR availability_window_record IN
          SELECT
            availability_windows.window_start_at,
            availability_windows.window_end_at
          FROM public.resolve_championship_bracket_competition_schedule_windows(
            edition_record.payload_snapshot,
            competition_key_value,
            court_record.event_date
          ) AS availability_windows
          ORDER BY
            availability_windows.window_start_at ASC,
            availability_windows.window_end_at ASC
        LOOP
          period_start_at :=
            availability_window_record.window_start_at;

          period_end_at :=
            availability_window_record.window_end_at;


          IF period_start_at >=
            period_end_at
          THEN
            CONTINUE;
          END IF;


          candidate_start_at :=
            GREATEST(
              period_start_at,
              dependency_ready_at
            );


          IF candidate_start_at >=
            period_end_at
          THEN
            CONTINUE;
          END IF;


          candidate_is_valid :=
            false;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível substituir a iteração por período no scheduler do mata-mata.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
              /*
               * Pausas modernas da agenda.
               */
$source$;

  target_block :=
$target$
              /*
               * Bloqueios HARD continuam ocupando a janela legada do período.
               */
              SELECT
                lock_bounds.period_end_at
                  AS conflict_end_at

              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(
                    edition_record.payload_snapshot
                      -> 'resource_locks'
                  ) = 'array'
                  THEN
                    edition_record.payload_snapshot
                      -> 'resource_locks'
                  ELSE
                    '[]'::jsonb
                END
              ) AS lock_record(value)

              CROSS JOIN LATERAL
                public.resolve_bracket_schedule_period_bounds_from_payload(
                  edition_record.payload_snapshot,
                  court_record.event_date,
                  (
                    lock_record.value ->> 'period'
                  )::public.championship_schedule_period
                ) AS lock_bounds

              WHERE COALESCE(
                  lock_record.value ->> 'lock_mode',
                  ''
                ) = 'HARD'

                AND NULLIF(
                  lock_record.value ->> 'date',
                  ''
                )::date =
                  court_record.event_date

                AND public.normalize_bracket_entity_name(
                  COALESCE(
                    lock_record.value ->> 'location_name',
                    ''
                  )
                ) =
                  public.normalize_bracket_entity_name(
                    court_record.location_name
                  )

                AND public.normalize_bracket_entity_name(
                  COALESCE(
                    lock_record.value ->> 'court_name',
                    ''
                  )
                ) =
                  public.normalize_bracket_entity_name(
                    court_record.court_name
                  )

                AND lock_bounds.period_start_at <
                  candidate_end_at

                AND lock_bounds.period_end_at >
                  candidate_start_at


              UNION ALL


              /*
               * Pausas modernas da agenda.
               */
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível inserir os conflitos temporais de bloqueio HARD no mata-mata.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
            best_schedule_period :=
              period_record.period;
$source$;

  target_block :=
$target$
            best_schedule_period :=
              public.resolve_bracket_schedule_period_by_timestamp(
                edition_record.payload_snapshot,
                court_record.event_date,
                candidate_start_at
              );
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível derivar o período legado a partir do horário real do mata-mata.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  EXECUTE updated_definition;
END;
$migration_knockout_real_date_availability$;


DO $migration_group_redistribution_real_date_availability$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'
      ::regprocedure
  )
  INTO function_definition;


  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'A função redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;


  IF strpos(
    function_definition,
    'tmp_payload_court_match_targets'
  ) > 0 THEN
    RETURN;
  END IF;


  updated_definition := function_definition;

  source_block :=
$source$
  SELECT
    championship_id,
    season_year
  INTO bracket_edition_record
$source$;

  target_block :=
$target$
  SELECT
    championship_id,
    season_year,
    payload_snapshot
  INTO bracket_edition_record
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível carregar o payload_snapshot na redistribuição.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
  DROP TABLE IF EXISTS tmp_global_day_courts;
$source$;

  target_block :=
$target$
  DROP TABLE IF EXISTS
    tmp_payload_explicit_target_courts;

  CREATE TEMP TABLE
    tmp_payload_explicit_target_courts (
      event_date DATE NOT NULL,
      court_group_id TEXT NOT NULL,
      PRIMARY KEY (
        event_date,
        court_group_id
      )
    )
  ON COMMIT DROP;

  INSERT INTO
    tmp_payload_explicit_target_courts (
      event_date,
      court_group_id
    )
  SELECT DISTINCT
    NULLIF(
      schedule_day_record.value ->> 'date',
      ''
    )::date,

    COALESCE(
      court_record.value ->> 'court_key',
      ''
    )

  FROM jsonb_array_elements(
    COALESCE(
      bracket_edition_record.payload_snapshot
        -> 'schedule_days',
      '[]'::jsonb
    )
  ) AS schedule_day_record(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      schedule_day_record.value -> 'locations',
      '[]'::jsonb
    )
  ) AS location_record(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      location_record.value -> 'courts',
      '[]'::jsonb
    )
  ) AS court_record(value)

  WHERE jsonb_typeof(
      court_record.value -> 'sport_match_targets'
    ) = 'array'

    AND NULLIF(
      schedule_day_record.value ->> 'date',
      ''
    ) IS NOT NULL

    AND COALESCE(
      court_record.value ->> 'court_key',
      ''
    ) <> '';


  DROP TABLE IF EXISTS
    tmp_payload_court_match_targets;

  CREATE TEMP TABLE
    tmp_payload_court_match_targets (
      event_date DATE NOT NULL,
      court_group_id TEXT NOT NULL,
      sport_id UUID NOT NULL,
      planned_match_count INTEGER NOT NULL,
      PRIMARY KEY (
        event_date,
        court_group_id,
        sport_id
      )
    )
  ON COMMIT DROP;

  INSERT INTO
    tmp_payload_court_match_targets (
      event_date,
      court_group_id,
      sport_id,
      planned_match_count
    )
  SELECT
    NULLIF(
      schedule_day_record.value ->> 'date',
      ''
    )::date,

    COALESCE(
      court_record.value ->> 'court_key',
      ''
    ),

    NULLIF(
      target_record.value ->> 'sport_id',
      ''
    )::uuid,

    (
      target_record.value ->> 'planned_match_count'
    )::integer

  FROM jsonb_array_elements(
    COALESCE(
      bracket_edition_record.payload_snapshot
        -> 'schedule_days',
      '[]'::jsonb
    )
  ) AS schedule_day_record(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      schedule_day_record.value -> 'locations',
      '[]'::jsonb
    )
  ) AS location_record(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      location_record.value -> 'courts',
      '[]'::jsonb
    )
  ) AS court_record(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(
      court_record.value -> 'sport_match_targets',
      '[]'::jsonb
    )
  ) AS target_record(value)

  WHERE NULLIF(
      schedule_day_record.value ->> 'date',
      ''
    ) IS NOT NULL

    AND COALESCE(
      court_record.value ->> 'court_key',
      ''
    ) <> ''

    AND NULLIF(
      target_record.value ->> 'sport_id',
      ''
    ) IS NOT NULL

    AND COALESCE(
      target_record.value ->> 'planned_match_count',
      ''
    ) ~ '^[0-9]+$'

    AND (
      target_record.value ->> 'planned_match_count'
    )::integer > 0;


  DROP TABLE IF EXISTS tmp_global_day_courts;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível preparar as metas por quadra na redistribuição.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    completed_sequence_divisions
      public.team_division[]
      NOT NULL
      DEFAULT ARRAY[]::public.team_division[],

    next_available_at TIMESTAMPTZ NOT NULL,
$source$;

  target_block :=
$target$
    completed_sequence_divisions
      public.team_division[]
      NOT NULL
      DEFAULT ARRAY[]::public.team_division[],

    planned_match_count INTEGER NULL,

    next_available_at TIMESTAMPTZ NOT NULL,
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível adicionar planned_match_count em tmp_global_day_courts.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    active_sequence_naipe,
    active_sequence_division,
    next_available_at
  )
$source$;

  target_block :=
$target$
    active_sequence_naipe,
    active_sequence_division,
    planned_match_count,
    next_available_at
  )
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível ampliar o INSERT de tmp_global_day_courts com planned_match_count.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    CASE
      WHEN court_sports_table.sequence_mode =
        'GROUP_DIVISION'
          ::public.bracket_court_sequence_mode
      THEN court_sports_table.preferred_division
      ELSE NULL
    END,

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.start_time
    )
$source$;

  target_block :=
$target$
    CASE
      WHEN court_sports_table.sequence_mode =
        'GROUP_DIVISION'
          ::public.bracket_court_sequence_mode
      THEN court_sports_table.preferred_division
      ELSE NULL
    END,

    court_match_targets_table.planned_match_count,

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.start_time
    )
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível carregar planned_match_count no SELECT das quadras.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
  LEFT JOIN public.championship_bracket_location_sport_priorities AS location_priorities_table
    ON location_priorities_table.bracket_edition_id = days_table.bracket_edition_id
    AND location_priorities_table.location_group_id = locations_table.location_group_id
    AND location_priorities_table.sport_id = court_sports_table.sport_id
  WHERE days_table.bracket_edition_id = _bracket_edition_id;
$source$;

  target_block :=
$target$
  LEFT JOIN public.championship_bracket_location_sport_priorities AS location_priorities_table
    ON location_priorities_table.bracket_edition_id = days_table.bracket_edition_id
    AND location_priorities_table.location_group_id = locations_table.location_group_id
    AND location_priorities_table.sport_id = court_sports_table.sport_id
  LEFT JOIN tmp_payload_explicit_target_courts AS explicit_target_courts_table
    ON explicit_target_courts_table.event_date = days_table.event_date
    AND explicit_target_courts_table.court_group_id = courts_table.court_group_id::text
  LEFT JOIN tmp_payload_court_match_targets AS court_match_targets_table
    ON court_match_targets_table.event_date = days_table.event_date
    AND court_match_targets_table.court_group_id = courts_table.court_group_id::text
    AND court_match_targets_table.sport_id = court_sports_table.sport_id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND (
      explicit_target_courts_table.court_group_id IS NULL
      OR court_match_targets_table.sport_id IS NOT NULL
    );
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível aplicar o filtro explícito de modalidades por quadra.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
      slot_sequence_index := slot_sequence_index + 1;
      slot_end_at := slot_start_at + make_interval(mins => day_court_record.duration_minutes);
$source$;

  target_block :=
$target$
      slot_sequence_index := slot_sequence_index + 1;

      IF day_court_record.planned_match_count IS NOT NULL
        AND slot_sequence_index > day_court_record.planned_match_count
      THEN
        EXIT;
      END IF;

      slot_end_at := slot_start_at + make_interval(mins => day_court_record.duration_minutes);
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível limitar os slots pela meta planejada da quadra.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    preferred_knockout_court_group_id UUID NULL
$source$;

  target_block :=
$target$
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    group_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL,
    preferred_knockout_court_group_id UUID NULL
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    source_block :=
$source$
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    is_knockout BOOLEAN NOT NULL,
    preferred_knockout_court_group_id UUID NULL
$source$;

    target_block :=
$target$
    away_team_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    group_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL,
    is_knockout BOOLEAN NOT NULL,
    preferred_knockout_court_group_id UUID NULL
$target$;
  END IF;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível adicionar group_id na fila pendente da redistribuição.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    away_team_id,
    duration_minutes,
    created_at,
    preferred_knockout_court_group_id
  )
$source$;

  target_block :=
$target$
    away_team_id,
    duration_minutes,
    group_id,
    created_at,
    preferred_knockout_court_group_id
  )
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    source_block :=
$source$
    away_team_id,
    duration_minutes,
    created_at,
    is_knockout,
    preferred_knockout_court_group_id
  )
$source$;

    target_block :=
$target$
    away_team_id,
    duration_minutes,
    group_id,
    created_at,
    is_knockout,
    preferred_knockout_court_group_id
  )
$target$;
  END IF;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível ampliar as colunas inseridas na fila pendente.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    matches_table.away_team_id,
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    matches_table.created_at,
$source$;

  target_block :=
$target$
    matches_table.away_team_id,
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    bracket_matches_table.group_id,
    matches_table.created_at,
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    source_block :=
$source$
    matches_table.away_team_id,
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    matches_table.created_at,
    (
      bracket_matches_table.id IS NOT NULL
      AND bracket_matches_table.group_id IS NULL
    ) AS is_knockout,
$source$;

    target_block :=
$target$
    matches_table.away_team_id,
    GREATEST(championship_sports_table.default_match_duration_minutes, 1),
    bracket_matches_table.group_id,
    matches_table.created_at,
    (
      bracket_matches_table.id IS NOT NULL
      AND bracket_matches_table.group_id IS NULL
    ) AS is_knockout,
$target$;
  END IF;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível carregar group_id na seleção da fila pendente.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
          AND (
            NOT has_same_day_pending
            OR pending_matches_table.original_scheduled_date = slot_record.event_date
          )
$source$;

  target_block :=
$target$
          AND (
            pending_matches_table.original_scheduled_date IS NULL
            OR slot_record.event_date >= pending_matches_table.original_scheduled_date
          )
          AND (
            NOT has_same_day_pending
            OR pending_matches_table.original_scheduled_date = slot_record.event_date
          )
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível aplicar o cutoff de rollover por data original.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
        AND (
          NOT has_same_day_pending
          OR pending_matches_table.original_scheduled_date = slot_record.event_date
        )

        AND (
          slot_record.sequence_mode <>
            'GROUP_NAIPE'
              ::public.bracket_court_sequence_mode

          OR (
            strict_active_naipe IS NOT NULL

            AND pending_matches_table.naipe
              IS NOT DISTINCT FROM
                strict_active_naipe
          )
        )

        AND (
          slot_record.sequence_mode <>
            'GROUP_DIVISION'
              ::public.bracket_court_sequence_mode

          OR (
            strict_active_division IS NOT NULL

            AND pending_matches_table.division
              IS NOT DISTINCT FROM
                strict_active_division
          )
        )

        AND (
          slot_record.priority_mode <> 'DIVISION'::public.bracket_court_priority_mode
$source$;

  target_block :=
$target$
        AND (
          NOT has_same_day_pending
          OR pending_matches_table.original_scheduled_date = slot_record.event_date
        )

        AND public.is_championship_bracket_competition_slot_playable(
          bracket_edition_record.payload_snapshot,
          pending_matches_table.sport_id::text
            || '::'
            || pending_matches_table.naipe::text
            || '::'
            || COALESCE(
              pending_matches_table.division::text,
              'WITHOUT_DIVISION'
            ),
          slot_record.event_date,
          slot_record.slot_start_at,
          slot_record.slot_end_at
        )

        AND (
          pending_matches_table.group_id IS NULL
          OR (
            public.is_championship_bracket_team_slot_playable(
              bracket_edition_record.payload_snapshot,
              pending_matches_table.home_team_id,
              pending_matches_table.sport_id::text
                || '::'
                || pending_matches_table.naipe::text
                || '::'
                || COALESCE(
                  pending_matches_table.division::text,
                  'WITHOUT_DIVISION'
                ),
              slot_record.event_date,
              slot_record.slot_start_at,
              slot_record.slot_end_at
            )
            AND public.is_championship_bracket_team_slot_playable(
              bracket_edition_record.payload_snapshot,
              pending_matches_table.away_team_id,
              pending_matches_table.sport_id::text
                || '::'
                || pending_matches_table.naipe::text
                || '::'
                || COALESCE(
                  pending_matches_table.division::text,
                  'WITHOUT_DIVISION'
                ),
              slot_record.event_date,
              slot_record.slot_start_at,
              slot_record.slot_end_at
            )
          )
        )

        AND (
          slot_record.priority_mode <> 'DIVISION'::public.bracket_court_priority_mode
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível substituir o filtro rígido por disponibilidade real + fallback forte.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
        CASE
          WHEN slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
            AND slot_record.primary_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM slot_record.primary_division THEN 1
          WHEN slot_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
            AND slot_record.primary_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM slot_record.primary_naipe THEN 1
          ELSE 0
        END ASC,
$source$;

  target_block :=
$target$
        CASE
          WHEN slot_record.sequence_mode = 'GROUP_DIVISION'::public.bracket_court_sequence_mode
            AND strict_active_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM strict_active_division THEN 1
          WHEN slot_record.sequence_mode = 'GROUP_NAIPE'::public.bracket_court_sequence_mode
            AND strict_active_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM strict_active_naipe THEN 1
          WHEN slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
            AND slot_record.primary_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM slot_record.primary_division THEN 1
          WHEN slot_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
            AND slot_record.primary_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM slot_record.primary_naipe THEN 1
          ELSE 0
        END ASC,
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível transformar GROUP_NAIPE/GROUP_DIVISION em preferência forte.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block :=
$source$
    IF slot_record.sequence_mode <>
        'FLEXIBLE'
          ::public.bracket_court_sequence_mode

      AND strict_group_pending

      AND NOT slot_match_assigned
    THEN
      INSERT INTO
        tmp_global_strict_blocked_slots (
          event_date,
          location_name,
          court_name,
          slot_start_at,
          slot_end_at
        )
      VALUES (
        slot_record.event_date,
        slot_record.location_name,
        slot_record.court_name,
        slot_record.slot_start_at,
        slot_record.slot_end_at
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
$source$;

  target_block :=
$target$
  END LOOP;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível remover o bloqueio duro de slot vazio no modo estrito.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  EXECUTE updated_definition;
END;
$migration_group_redistribution_real_date_availability$;


NOTIFY pgrst, 'reload schema';
