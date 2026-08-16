-- Otimiza o hot path da Etapa 13 e da redistribuição coletiva.
--
-- Antes desta correção, as helpers de disponibilidade real por data
-- revarriam o JSON do payload a cada verificação de slot/janela.
-- Isso ficou caro no caminho:
--
-- - generate_championship_bracket_groups()
-- - redistribute_bracket_scheduled_matches()
-- - rebuild_championship_knockout_schedule_reservations()
-- - preview_championship_bracket_groups()
--
-- A estratégia aqui é:
--
-- 1. materializar day bounds e disponibilidades explícitas FULL_DAY/CUSTOM
--    em tabelas temporárias por execução;
-- 2. fazer as helpers consultarem essas tabelas quando elas existirem;
-- 3. manter o fallback legado por período para campeonatos/drafts antigos.

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
  IF to_regclass('pg_temp.temp_schedule_day_bounds') IS NOT NULL THEN
    SELECT
      day_bounds_table.day_start_at,
      day_bounds_table.day_end_at,
      day_bounds_table.day_start_time,
      day_bounds_table.day_end_time,
      day_bounds_table.break_start_time,
      day_bounds_table.break_end_time
    INTO
      day_start_at,
      day_end_at,
      day_start_time,
      day_end_time,
      break_start_time,
      break_end_time
    FROM pg_temp.temp_schedule_day_bounds AS day_bounds_table
    WHERE day_bounds_table.event_date = _event_date
    LIMIT 1;

    IF day_start_at IS NOT NULL
      AND day_end_at IS NOT NULL
    THEN
      RETURN NEXT;
    END IF;

    RETURN;
  END IF;


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


  IF to_regclass('pg_temp.temp_competition_date_availability_modes') IS NOT NULL THEN
    SELECT
      availability_modes_table.mode
    INTO availability_mode
    FROM pg_temp.temp_competition_date_availability_modes
      AS availability_modes_table
    WHERE availability_modes_table.competition_key = _competition_key
      AND availability_modes_table.event_date = _event_date
    LIMIT 1;

    IF availability_mode IS NOT NULL THEN
      IF availability_mode = 'UNAVAILABLE' THEN
        RETURN;
      END IF;

      IF availability_mode NOT IN ('FULL_DAY', 'CUSTOM') THEN
        RETURN;
      END IF;

      RETURN QUERY
      SELECT
        availability_windows_table.window_start_at,
        availability_windows_table.window_end_at
      FROM pg_temp.temp_competition_date_availability_windows
        AS availability_windows_table
      WHERE availability_windows_table.competition_key = _competition_key
        AND availability_windows_table.event_date = _event_date
      ORDER BY
        availability_windows_table.window_start_at ASC,
        availability_windows_table.window_end_at ASC;

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


  IF to_regclass('pg_temp.temp_team_competition_date_availability_modes') IS NOT NULL THEN
    SELECT
      availability_modes_table.mode
    INTO availability_mode
    FROM pg_temp.temp_team_competition_date_availability_modes
      AS availability_modes_table
    WHERE availability_modes_table.team_id = _team_id
      AND availability_modes_table.competition_key = _competition_key
      AND availability_modes_table.event_date = _event_date
    LIMIT 1;

    IF availability_mode IS NOT NULL THEN
      IF availability_mode = 'UNAVAILABLE' THEN
        RETURN;
      END IF;

      IF availability_mode NOT IN ('FULL_DAY', 'CUSTOM') THEN
        RETURN;
      END IF;

      RETURN QUERY
      SELECT
        availability_windows_table.window_start_at,
        availability_windows_table.window_end_at
      FROM pg_temp.temp_team_competition_date_availability_windows
        AS availability_windows_table
      WHERE availability_windows_table.team_id = _team_id
        AND availability_windows_table.competition_key = _competition_key
        AND availability_windows_table.event_date = _event_date
      ORDER BY
        availability_windows_table.window_start_at ASC,
        availability_windows_table.window_end_at ASC;

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
  availability_mode TEXT;
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


  IF to_regclass('pg_temp.temp_competition_date_availability_modes') IS NOT NULL THEN
    SELECT
      availability_modes_table.mode
    INTO availability_mode
    FROM pg_temp.temp_competition_date_availability_modes
      AS availability_modes_table
    WHERE availability_modes_table.competition_key = _competition_key
      AND availability_modes_table.event_date = _event_date
    LIMIT 1;

    IF availability_mode IS NOT NULL THEN
      CASE availability_mode
        WHEN 'UNAVAILABLE' THEN
          RETURN false;

        WHEN 'FULL_DAY' THEN
          RETURN
            _slot_start_at >= day_bounds.day_start_at
            AND _slot_start_at < day_bounds.day_end_at;

        WHEN 'CUSTOM' THEN
          RETURN EXISTS (
            SELECT 1
            FROM pg_temp.temp_competition_date_availability_windows
              AS availability_windows_table
            WHERE availability_windows_table.competition_key = _competition_key
              AND availability_windows_table.event_date = _event_date
              AND _slot_start_at >= availability_windows_table.window_start_at
              AND _slot_end_at <= availability_windows_table.window_end_at
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
  availability_mode TEXT;
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


  IF to_regclass('pg_temp.temp_team_competition_date_availability_modes') IS NOT NULL THEN
    SELECT
      availability_modes_table.mode
    INTO availability_mode
    FROM pg_temp.temp_team_competition_date_availability_modes
      AS availability_modes_table
    WHERE availability_modes_table.team_id = _team_id
      AND availability_modes_table.competition_key = _competition_key
      AND availability_modes_table.event_date = _event_date
    LIMIT 1;

    IF availability_mode IS NOT NULL THEN
      CASE availability_mode
        WHEN 'UNAVAILABLE' THEN
          RETURN false;

        WHEN 'FULL_DAY' THEN
          RETURN
            _slot_start_at >= day_bounds.day_start_at
            AND _slot_start_at < day_bounds.day_end_at;

        WHEN 'CUSTOM' THEN
          RETURN EXISTS (
            SELECT 1
            FROM pg_temp.temp_team_competition_date_availability_windows
              AS availability_windows_table
            WHERE availability_windows_table.team_id = _team_id
              AND availability_windows_table.competition_key = _competition_key
              AND availability_windows_table.event_date = _event_date
              AND _slot_start_at >= availability_windows_table.window_start_at
              AND _slot_end_at <= availability_windows_table.window_end_at
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


DO $migration_cache_real_date_availability_on_generation$
DECLARE
  function_definition TEXT;
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
    'temp_competition_date_availability_modes'
  ) > 0 THEN
    RETURN;
  END IF;


  source_block :=
$source$
  DROP TABLE IF EXISTS temp_day_period_slot_limits;
$source$;

  target_block :=
$target$
  DROP TABLE IF EXISTS temp_schedule_day_bounds;

  CREATE TEMP TABLE temp_schedule_day_bounds (
    event_date DATE PRIMARY KEY,
    day_start_at TIMESTAMPTZ NOT NULL,
    day_end_at TIMESTAMPTZ NOT NULL,
    day_start_time TIME NOT NULL,
    day_end_time TIME NOT NULL,
    break_start_time TIME NULL,
    break_end_time TIME NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_schedule_day_bounds (
    event_date,
    day_start_at,
    day_end_at,
    day_start_time,
    day_end_time,
    break_start_time,
    break_end_time
  )
  SELECT
    days_table.event_date,
    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.start_time
    ),
    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.end_time
    ),
    days_table.start_time,
    days_table.end_time,
    days_table.break_start_time,
    days_table.break_end_time
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.bracket_edition_id = bracket_edition_id
    AND days_table.start_time IS NOT NULL
    AND days_table.end_time IS NOT NULL
    AND days_table.end_time > days_table.start_time;

  DROP TABLE IF EXISTS temp_competition_date_availability_modes;

  CREATE TEMP TABLE temp_competition_date_availability_modes (
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    mode TEXT NOT NULL,
    PRIMARY KEY (
      competition_key,
      event_date
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_competition_date_availability_modes (
    competition_key,
    event_date,
    mode
  )
  SELECT DISTINCT ON (
    explicit_modes.competition_key,
    explicit_modes.event_date
  )
    explicit_modes.competition_key,
    explicit_modes.event_date,
    explicit_modes.mode
  FROM (
    SELECT
      COALESCE(
        availability_item.value ->> 'competition_key',
        ''
      ) AS competition_key,
      NULLIF(
        availability_item.value ->> 'date',
        ''
      )::date AS event_date,
      COALESCE(
        availability_item.value ->> 'mode',
        'FULL_DAY'
      ) AS mode,
      availability_item.ordinality
    FROM jsonb_array_elements(
      COALESCE(
        _payload -> 'competition_date_availability',
        '[]'::jsonb
      )
    )
    WITH ORDINALITY AS availability_item(
      value,
      ordinality
    )
  ) AS explicit_modes
  WHERE explicit_modes.competition_key <> ''
    AND explicit_modes.event_date IS NOT NULL
  ORDER BY
    explicit_modes.competition_key ASC,
    explicit_modes.event_date ASC,
    explicit_modes.ordinality DESC;

  DROP TABLE IF EXISTS temp_competition_date_availability_windows;

  CREATE TEMP TABLE temp_competition_date_availability_windows (
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    window_start_at TIMESTAMPTZ NOT NULL,
    window_end_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (
      competition_key,
      event_date,
      window_start_at,
      window_end_at
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_competition_date_availability_windows (
    competition_key,
    event_date,
    window_start_at,
    window_end_at
  )
  SELECT
    explicit_modes.competition_key,
    explicit_modes.event_date,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_start_at
      ELSE explicit_windows.window_start_at
    END,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_end_at
      ELSE explicit_windows.window_end_at
    END
  FROM (
    SELECT DISTINCT ON (
      raw_modes.competition_key,
      raw_modes.event_date
    )
      raw_modes.competition_key,
      raw_modes.event_date,
      raw_modes.mode,
      raw_modes.availability_record
    FROM (
      SELECT
        COALESCE(
          availability_item.value ->> 'competition_key',
          ''
        ) AS competition_key,
        NULLIF(
          availability_item.value ->> 'date',
          ''
        )::date AS event_date,
        COALESCE(
          availability_item.value ->> 'mode',
          'FULL_DAY'
        ) AS mode,
        availability_item.value AS availability_record,
        availability_item.ordinality
      FROM jsonb_array_elements(
        COALESCE(
          _payload -> 'competition_date_availability',
          '[]'::jsonb
        )
      )
      WITH ORDINALITY AS availability_item(
        value,
        ordinality
      )
    ) AS raw_modes
    WHERE raw_modes.competition_key <> ''
      AND raw_modes.event_date IS NOT NULL
    ORDER BY
      raw_modes.competition_key ASC,
      raw_modes.event_date ASC,
      raw_modes.ordinality DESC
  ) AS explicit_modes
  JOIN temp_schedule_day_bounds AS day_bounds_table
    ON day_bounds_table.event_date = explicit_modes.event_date
  LEFT JOIN LATERAL (
    SELECT
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'start_time',
          ''
        )::time
      ) AS window_start_at,
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'end_time',
          ''
        )::time
      ) AS window_end_at
    FROM jsonb_array_elements(
      COALESCE(
        explicit_modes.availability_record -> 'windows',
        '[]'::jsonb
      )
    ) AS window_item(value)
    WHERE NULLIF(
        window_item.value ->> 'start_time',
        ''
      ) IS NOT NULL
      AND NULLIF(
        window_item.value ->> 'end_time',
        ''
      ) IS NOT NULL
  ) AS explicit_windows
    ON explicit_modes.mode = 'CUSTOM'
  WHERE explicit_modes.mode = 'FULL_DAY'
    OR (
      explicit_modes.mode = 'CUSTOM'
      AND explicit_windows.window_end_at >
        explicit_windows.window_start_at
      AND explicit_windows.window_start_at >=
        day_bounds_table.day_start_at
      AND explicit_windows.window_end_at <=
        day_bounds_table.day_end_at
    );

  DROP TABLE IF EXISTS temp_team_competition_date_availability_modes;

  CREATE TEMP TABLE temp_team_competition_date_availability_modes (
    team_id UUID NOT NULL,
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    mode TEXT NOT NULL,
    PRIMARY KEY (
      team_id,
      competition_key,
      event_date
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_team_competition_date_availability_modes (
    team_id,
    competition_key,
    event_date,
    mode
  )
  SELECT DISTINCT ON (
    explicit_modes.team_id,
    explicit_modes.competition_key,
    explicit_modes.event_date
  )
    explicit_modes.team_id,
    explicit_modes.competition_key,
    explicit_modes.event_date,
    explicit_modes.mode
  FROM (
    SELECT
      NULLIF(
        availability_item.value ->> 'team_id',
        ''
      )::uuid AS team_id,
      COALESCE(
        availability_item.value ->> 'competition_key',
        ''
      ) AS competition_key,
      NULLIF(
        availability_item.value ->> 'date',
        ''
      )::date AS event_date,
      COALESCE(
        availability_item.value ->> 'mode',
        'FULL_DAY'
      ) AS mode,
      availability_item.ordinality
    FROM jsonb_array_elements(
      COALESCE(
        _payload -> 'team_competition_date_availability',
        '[]'::jsonb
      )
    )
    WITH ORDINALITY AS availability_item(
      value,
      ordinality
    )
  ) AS explicit_modes
  WHERE explicit_modes.team_id IS NOT NULL
    AND explicit_modes.competition_key <> ''
    AND explicit_modes.event_date IS NOT NULL
  ORDER BY
    explicit_modes.team_id ASC,
    explicit_modes.competition_key ASC,
    explicit_modes.event_date ASC,
    explicit_modes.ordinality DESC;

  DROP TABLE IF EXISTS temp_team_competition_date_availability_windows;

  CREATE TEMP TABLE temp_team_competition_date_availability_windows (
    team_id UUID NOT NULL,
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    window_start_at TIMESTAMPTZ NOT NULL,
    window_end_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (
      team_id,
      competition_key,
      event_date,
      window_start_at,
      window_end_at
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_team_competition_date_availability_windows (
    team_id,
    competition_key,
    event_date,
    window_start_at,
    window_end_at
  )
  SELECT
    explicit_modes.team_id,
    explicit_modes.competition_key,
    explicit_modes.event_date,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_start_at
      ELSE explicit_windows.window_start_at
    END,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_end_at
      ELSE explicit_windows.window_end_at
    END
  FROM (
    SELECT DISTINCT ON (
      raw_modes.team_id,
      raw_modes.competition_key,
      raw_modes.event_date
    )
      raw_modes.team_id,
      raw_modes.competition_key,
      raw_modes.event_date,
      raw_modes.mode,
      raw_modes.availability_record
    FROM (
      SELECT
        NULLIF(
          availability_item.value ->> 'team_id',
          ''
        )::uuid AS team_id,
        COALESCE(
          availability_item.value ->> 'competition_key',
          ''
        ) AS competition_key,
        NULLIF(
          availability_item.value ->> 'date',
          ''
        )::date AS event_date,
        COALESCE(
          availability_item.value ->> 'mode',
          'FULL_DAY'
        ) AS mode,
        availability_item.value AS availability_record,
        availability_item.ordinality
      FROM jsonb_array_elements(
        COALESCE(
          _payload -> 'team_competition_date_availability',
          '[]'::jsonb
        )
      )
      WITH ORDINALITY AS availability_item(
        value,
        ordinality
      )
    ) AS raw_modes
    WHERE raw_modes.team_id IS NOT NULL
      AND raw_modes.competition_key <> ''
      AND raw_modes.event_date IS NOT NULL
    ORDER BY
      raw_modes.team_id ASC,
      raw_modes.competition_key ASC,
      raw_modes.event_date ASC,
      raw_modes.ordinality DESC
  ) AS explicit_modes
  JOIN temp_schedule_day_bounds AS day_bounds_table
    ON day_bounds_table.event_date = explicit_modes.event_date
  LEFT JOIN LATERAL (
    SELECT
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'start_time',
          ''
        )::time
      ) AS window_start_at,
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'end_time',
          ''
        )::time
      ) AS window_end_at
    FROM jsonb_array_elements(
      COALESCE(
        explicit_modes.availability_record -> 'windows',
        '[]'::jsonb
      )
    ) AS window_item(value)
    WHERE NULLIF(
        window_item.value ->> 'start_time',
        ''
      ) IS NOT NULL
      AND NULLIF(
        window_item.value ->> 'end_time',
        ''
      ) IS NOT NULL
  ) AS explicit_windows
    ON explicit_modes.mode = 'CUSTOM'
  WHERE explicit_modes.mode = 'FULL_DAY'
    OR (
      explicit_modes.mode = 'CUSTOM'
      AND explicit_windows.window_end_at >
        explicit_windows.window_start_at
      AND explicit_windows.window_start_at >=
        day_bounds_table.day_start_at
      AND explicit_windows.window_end_at <=
        day_bounds_table.day_end_at
    );

  DROP TABLE IF EXISTS temp_day_period_slot_limits;
$target$;

  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível injetar o cache das janelas reais na geração.';
  END IF;

  function_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );

  EXECUTE function_definition;
END;
$migration_cache_real_date_availability_on_generation$;


DO $migration_cache_real_date_availability_on_redistribution$
DECLARE
  function_definition TEXT;
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
    'temp_competition_date_availability_modes'
  ) > 0 THEN
    RETURN;
  END IF;


  source_block :=
$source$
  DROP TABLE IF EXISTS
    tmp_payload_explicit_target_courts;
$source$;

  IF strpos(function_definition, source_block) = 0 THEN
    source_block :=
$source$
  DROP TABLE IF EXISTS tmp_payload_explicit_target_courts;
$source$;
  END IF;

  target_block :=
$target$
  DROP TABLE IF EXISTS temp_schedule_day_bounds;

  CREATE TEMP TABLE temp_schedule_day_bounds (
    event_date DATE PRIMARY KEY,
    day_start_at TIMESTAMPTZ NOT NULL,
    day_end_at TIMESTAMPTZ NOT NULL,
    day_start_time TIME NOT NULL,
    day_end_time TIME NOT NULL,
    break_start_time TIME NULL,
    break_end_time TIME NULL
  ) ON COMMIT DROP;

  INSERT INTO temp_schedule_day_bounds (
    event_date,
    day_start_at,
    day_end_at,
    day_start_time,
    day_end_time,
    break_start_time,
    break_end_time
  )
  SELECT
    days_table.event_date,
    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.start_time
    ),
    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.end_time
    ),
    days_table.start_time,
    days_table.end_time,
    days_table.break_start_time,
    days_table.break_end_time
  FROM public.championship_bracket_days AS days_table
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.start_time IS NOT NULL
    AND days_table.end_time IS NOT NULL
    AND days_table.end_time > days_table.start_time;

  DROP TABLE IF EXISTS temp_competition_date_availability_modes;

  CREATE TEMP TABLE temp_competition_date_availability_modes (
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    mode TEXT NOT NULL,
    PRIMARY KEY (
      competition_key,
      event_date
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_competition_date_availability_modes (
    competition_key,
    event_date,
    mode
  )
  SELECT DISTINCT ON (
    explicit_modes.competition_key,
    explicit_modes.event_date
  )
    explicit_modes.competition_key,
    explicit_modes.event_date,
    explicit_modes.mode
  FROM (
    SELECT
      COALESCE(
        availability_item.value ->> 'competition_key',
        ''
      ) AS competition_key,
      NULLIF(
        availability_item.value ->> 'date',
        ''
      )::date AS event_date,
      COALESCE(
        availability_item.value ->> 'mode',
        'FULL_DAY'
      ) AS mode,
      availability_item.ordinality
    FROM jsonb_array_elements(
      COALESCE(
        bracket_edition_record.payload_snapshot
          -> 'competition_date_availability',
        '[]'::jsonb
      )
    )
    WITH ORDINALITY AS availability_item(
      value,
      ordinality
    )
  ) AS explicit_modes
  WHERE explicit_modes.competition_key <> ''
    AND explicit_modes.event_date IS NOT NULL
  ORDER BY
    explicit_modes.competition_key ASC,
    explicit_modes.event_date ASC,
    explicit_modes.ordinality DESC;

  DROP TABLE IF EXISTS temp_competition_date_availability_windows;

  CREATE TEMP TABLE temp_competition_date_availability_windows (
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    window_start_at TIMESTAMPTZ NOT NULL,
    window_end_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (
      competition_key,
      event_date,
      window_start_at,
      window_end_at
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_competition_date_availability_windows (
    competition_key,
    event_date,
    window_start_at,
    window_end_at
  )
  SELECT
    explicit_modes.competition_key,
    explicit_modes.event_date,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_start_at
      ELSE explicit_windows.window_start_at
    END,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_end_at
      ELSE explicit_windows.window_end_at
    END
  FROM (
    SELECT DISTINCT ON (
      raw_modes.competition_key,
      raw_modes.event_date
    )
      raw_modes.competition_key,
      raw_modes.event_date,
      raw_modes.mode,
      raw_modes.availability_record
    FROM (
      SELECT
        COALESCE(
          availability_item.value ->> 'competition_key',
          ''
        ) AS competition_key,
        NULLIF(
          availability_item.value ->> 'date',
          ''
        )::date AS event_date,
        COALESCE(
          availability_item.value ->> 'mode',
          'FULL_DAY'
        ) AS mode,
        availability_item.value AS availability_record,
        availability_item.ordinality
      FROM jsonb_array_elements(
        COALESCE(
          bracket_edition_record.payload_snapshot
            -> 'competition_date_availability',
          '[]'::jsonb
        )
      )
      WITH ORDINALITY AS availability_item(
        value,
        ordinality
      )
    ) AS raw_modes
    WHERE raw_modes.competition_key <> ''
      AND raw_modes.event_date IS NOT NULL
    ORDER BY
      raw_modes.competition_key ASC,
      raw_modes.event_date ASC,
      raw_modes.ordinality DESC
  ) AS explicit_modes
  JOIN temp_schedule_day_bounds AS day_bounds_table
    ON day_bounds_table.event_date = explicit_modes.event_date
  LEFT JOIN LATERAL (
    SELECT
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'start_time',
          ''
        )::time
      ) AS window_start_at,
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'end_time',
          ''
        )::time
      ) AS window_end_at
    FROM jsonb_array_elements(
      COALESCE(
        explicit_modes.availability_record -> 'windows',
        '[]'::jsonb
      )
    ) AS window_item(value)
    WHERE NULLIF(
        window_item.value ->> 'start_time',
        ''
      ) IS NOT NULL
      AND NULLIF(
        window_item.value ->> 'end_time',
        ''
      ) IS NOT NULL
  ) AS explicit_windows
    ON explicit_modes.mode = 'CUSTOM'
  WHERE explicit_modes.mode = 'FULL_DAY'
    OR (
      explicit_modes.mode = 'CUSTOM'
      AND explicit_windows.window_end_at >
        explicit_windows.window_start_at
      AND explicit_windows.window_start_at >=
        day_bounds_table.day_start_at
      AND explicit_windows.window_end_at <=
        day_bounds_table.day_end_at
    );

  DROP TABLE IF EXISTS temp_team_competition_date_availability_modes;

  CREATE TEMP TABLE temp_team_competition_date_availability_modes (
    team_id UUID NOT NULL,
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    mode TEXT NOT NULL,
    PRIMARY KEY (
      team_id,
      competition_key,
      event_date
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_team_competition_date_availability_modes (
    team_id,
    competition_key,
    event_date,
    mode
  )
  SELECT DISTINCT ON (
    explicit_modes.team_id,
    explicit_modes.competition_key,
    explicit_modes.event_date
  )
    explicit_modes.team_id,
    explicit_modes.competition_key,
    explicit_modes.event_date,
    explicit_modes.mode
  FROM (
    SELECT
      NULLIF(
        availability_item.value ->> 'team_id',
        ''
      )::uuid AS team_id,
      COALESCE(
        availability_item.value ->> 'competition_key',
        ''
      ) AS competition_key,
      NULLIF(
        availability_item.value ->> 'date',
        ''
      )::date AS event_date,
      COALESCE(
        availability_item.value ->> 'mode',
        'FULL_DAY'
      ) AS mode,
      availability_item.ordinality
    FROM jsonb_array_elements(
      COALESCE(
        bracket_edition_record.payload_snapshot
          -> 'team_competition_date_availability',
        '[]'::jsonb
      )
    )
    WITH ORDINALITY AS availability_item(
      value,
      ordinality
    )
  ) AS explicit_modes
  WHERE explicit_modes.team_id IS NOT NULL
    AND explicit_modes.competition_key <> ''
    AND explicit_modes.event_date IS NOT NULL
  ORDER BY
    explicit_modes.team_id ASC,
    explicit_modes.competition_key ASC,
    explicit_modes.event_date ASC,
    explicit_modes.ordinality DESC;

  DROP TABLE IF EXISTS temp_team_competition_date_availability_windows;

  CREATE TEMP TABLE temp_team_competition_date_availability_windows (
    team_id UUID NOT NULL,
    competition_key TEXT NOT NULL,
    event_date DATE NOT NULL,
    window_start_at TIMESTAMPTZ NOT NULL,
    window_end_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (
      team_id,
      competition_key,
      event_date,
      window_start_at,
      window_end_at
    )
  ) ON COMMIT DROP;

  INSERT INTO temp_team_competition_date_availability_windows (
    team_id,
    competition_key,
    event_date,
    window_start_at,
    window_end_at
  )
  SELECT
    explicit_modes.team_id,
    explicit_modes.competition_key,
    explicit_modes.event_date,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_start_at
      ELSE explicit_windows.window_start_at
    END,
    CASE
      WHEN explicit_modes.mode = 'FULL_DAY'
      THEN day_bounds_table.day_end_at
      ELSE explicit_windows.window_end_at
    END
  FROM (
    SELECT DISTINCT ON (
      raw_modes.team_id,
      raw_modes.competition_key,
      raw_modes.event_date
    )
      raw_modes.team_id,
      raw_modes.competition_key,
      raw_modes.event_date,
      raw_modes.mode,
      raw_modes.availability_record
    FROM (
      SELECT
        NULLIF(
          availability_item.value ->> 'team_id',
          ''
        )::uuid AS team_id,
        COALESCE(
          availability_item.value ->> 'competition_key',
          ''
        ) AS competition_key,
        NULLIF(
          availability_item.value ->> 'date',
          ''
        )::date AS event_date,
        COALESCE(
          availability_item.value ->> 'mode',
          'FULL_DAY'
        ) AS mode,
        availability_item.value AS availability_record,
        availability_item.ordinality
      FROM jsonb_array_elements(
        COALESCE(
          bracket_edition_record.payload_snapshot
            -> 'team_competition_date_availability',
          '[]'::jsonb
        )
      )
      WITH ORDINALITY AS availability_item(
        value,
        ordinality
      )
    ) AS raw_modes
    WHERE raw_modes.team_id IS NOT NULL
      AND raw_modes.competition_key <> ''
      AND raw_modes.event_date IS NOT NULL
    ORDER BY
      raw_modes.team_id ASC,
      raw_modes.competition_key ASC,
      raw_modes.event_date ASC,
      raw_modes.ordinality DESC
  ) AS explicit_modes
  JOIN temp_schedule_day_bounds AS day_bounds_table
    ON day_bounds_table.event_date = explicit_modes.event_date
  LEFT JOIN LATERAL (
    SELECT
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'start_time',
          ''
        )::time
      ) AS window_start_at,
      public.combine_bracket_schedule_timestamp(
        explicit_modes.event_date,
        NULLIF(
          window_item.value ->> 'end_time',
          ''
        )::time
      ) AS window_end_at
    FROM jsonb_array_elements(
      COALESCE(
        explicit_modes.availability_record -> 'windows',
        '[]'::jsonb
      )
    ) AS window_item(value)
    WHERE NULLIF(
        window_item.value ->> 'start_time',
        ''
      ) IS NOT NULL
      AND NULLIF(
        window_item.value ->> 'end_time',
        ''
      ) IS NOT NULL
  ) AS explicit_windows
    ON explicit_modes.mode = 'CUSTOM'
  WHERE explicit_modes.mode = 'FULL_DAY'
    OR (
      explicit_modes.mode = 'CUSTOM'
      AND explicit_windows.window_end_at >
        explicit_windows.window_start_at
      AND explicit_windows.window_start_at >=
        day_bounds_table.day_start_at
      AND explicit_windows.window_end_at <=
        day_bounds_table.day_end_at
    );

  DROP TABLE IF EXISTS tmp_payload_explicit_target_courts;
$target$;

  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível injetar o cache das janelas reais na redistribuição.';
  END IF;

  function_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );

  EXECUTE function_definition;
END;
$migration_cache_real_date_availability_on_redistribution$;


COMMENT ON FUNCTION
  public.resolve_championship_bracket_schedule_day_bounds(
    JSONB,
    DATE
  )
IS
  'Resolve a janela operacional do dia a partir do payload do chaveamento. Usa cache temporário quando a geração/preview materializa os day bounds.';


COMMENT ON FUNCTION
  public.resolve_championship_bracket_competition_schedule_windows(
    JSONB,
    TEXT,
    DATE
  )
IS
  'Resolve as janelas jogáveis da competição em um dia. Usa cache temporário das disponibilidades reais quando disponível e mantém fallback legado por período.';


COMMENT ON FUNCTION
  public.resolve_championship_bracket_team_schedule_windows(
    JSONB,
    UUID,
    TEXT,
    DATE
  )
IS
  'Resolve as janelas jogáveis da atlética em um dia. Usa cache temporário das disponibilidades reais quando disponível e mantém fallback legado por período.';


NOTIFY pgrst, 'reload schema';
