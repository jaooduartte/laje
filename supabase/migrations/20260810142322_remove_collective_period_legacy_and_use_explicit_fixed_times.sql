-- Remove o adapter legado por período do cliente e faz o backend
-- interpretar blocos fixos por start_time/end_time.
--
-- Compatibilidade preservada apenas no SQL, como fallback de leitura
-- para payloads antigos que ainda tragam `period`.

CREATE OR REPLACE FUNCTION
  public.resolve_bracket_fixed_block_bounds_from_payload(
    _payload JSONB,
    _event_date DATE,
    _start_time_text TEXT,
    _end_time_text TEXT,
    _legacy_period public.championship_schedule_period DEFAULT NULL
  )
RETURNS TABLE (
  schedule_period public.championship_schedule_period,
  period_start_at TIMESTAMPTZ,
  period_end_at TIMESTAMPTZ,
  duration_minutes INTEGER
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  day_bounds RECORD;
  explicit_start_time TIME;
  explicit_end_time TIME;
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

  IF NULLIF(_start_time_text, '') IS NOT NULL
    AND NULLIF(_end_time_text, '') IS NOT NULL
  THEN
    explicit_start_time := _start_time_text::time;
    explicit_end_time := _end_time_text::time;

    period_start_at :=
      public.combine_bracket_schedule_timestamp(
        _event_date,
        explicit_start_time
      );

    period_end_at :=
      public.combine_bracket_schedule_timestamp(
        _event_date,
        explicit_end_time
      );

    IF period_end_at <= period_start_at
      OR period_start_at < day_bounds.day_start_at
      OR period_end_at > day_bounds.day_end_at
    THEN
      RETURN;
    END IF;

    schedule_period :=
      public.resolve_bracket_schedule_period_by_timestamp(
        _payload,
        _event_date,
        period_start_at
      );

    duration_minutes := GREATEST(
      1,
      ROUND(
        EXTRACT(
          EPOCH FROM (
            period_end_at - period_start_at
          )
        ) / 60.0
      )::integer
    );

    RETURN NEXT;
    RETURN;
  END IF;

  IF _legacy_period IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_schedule_period_enabled_by_payload(
    _payload,
    _event_date,
    _legacy_period
  )
  THEN
    RETURN;
  END IF;

  SELECT
    _legacy_period,
    legacy_bounds.period_start_at,
    legacy_bounds.period_end_at,
    GREATEST(
      1,
      ROUND(
        EXTRACT(
          EPOCH FROM (
            legacy_bounds.period_end_at - legacy_bounds.period_start_at
          )
        ) / 60.0
      )::integer
    )
  INTO
    schedule_period,
    period_start_at,
    period_end_at,
    duration_minutes
  FROM public.resolve_bracket_schedule_period_bounds_from_payload(
    _payload,
    _event_date,
    _legacy_period
  ) AS legacy_bounds
  LIMIT 1;

  IF period_start_at IS NULL
    OR period_end_at IS NULL
    OR period_end_at <= period_start_at
  THEN
    RETURN;
  END IF;

  RETURN NEXT;
END;
$function$;


DO $$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  function_definition := pg_get_functiondef(
    'public.build_championship_bracket_operational_preview(uuid, jsonb, jsonb)'::regprocedure
  );

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $session_block_pattern$(?s)(courts_table\.name,\s+)(CASE\s+WHEN session_record\.value\s+->>\s+'period'\s+=\s+'MATUTINO'.*?GREATEST\(\s*1,\s*.*?\)::integer\s*\),)(\s+NULLIF\()$session_block_pattern$,
    $new_session_block$\1session_bounds.period_start_at,

    session_bounds.period_end_at,

    session_bounds.duration_minutes,\3$new_session_block$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o bloco de sessão individual para atualização da timeline operacional.';
  END IF;

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $session_join_pattern$(?s)LEFT JOIN public\.sports\s+AS sports_table\s+ON sports_table\.id =\s+NULLIF\(\s+session_record\.value\s+->>\s+'sport_id',\s+''\s+\)::uuid\s+WHERE session_record\.value\s+->>\s+'period'\s+IN\s+\(\s+'MATUTINO',\s+'VESPERTINO'\s+\);$session_join_pattern$,
    $new_session_join$
  JOIN LATERAL public.resolve_bracket_fixed_block_bounds_from_payload(
    _payload,
    days_table.event_date,
    NULLIF(
      session_record.value
        ->> 'start_time',
      ''
    ),
    NULLIF(
      session_record.value
        ->> 'end_time',
      ''
    ),
    CASE
      WHEN NULLIF(
        session_record.value
          ->> 'period',
        ''
      ) IS NULL
      THEN
        NULL
      ELSE
        (
          session_record.value
            ->> 'period'
        )::public.championship_schedule_period
    END
  ) AS session_bounds
    ON true

  LEFT JOIN public.sports
    AS sports_table
    ON sports_table.id =
      NULLIF(
        session_record.value
          ->> 'sport_id',
        ''
      )::uuid

  WHERE true;
$new_session_join$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o join legado de sessão individual para atualização da timeline operacional.';
  END IF;

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $lock_block_pattern$(?s)(courts_table\.name,\s+)(CASE\s+WHEN lock_record\.value\s+->>\s+'period'\s+=\s+'MATUTINO'.*?GREATEST\(\s*1,\s*.*?\)::integer\s*\),)(\s+CASE\s+WHEN NULLIF\(\s+lock_record\.value\s+->>\s+'sport_id')$lock_block_pattern$,
    $new_lock_block$
    \1lock_bounds.period_start_at,

    lock_bounds.period_end_at,

    lock_bounds.duration_minutes,\3
$new_lock_block$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o bloco de bloqueio HARD para atualização da timeline operacional.';
  END IF;

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $lock_join_pattern$(?s)LEFT JOIN public\.sports\s+AS sports_table\s+ON sports_table\.id =\s+CASE\s+WHEN NULLIF\(\s+lock_record\.value\s+->>\s+'sport_id',\s+''\s+\) IS NULL\s+THEN\s+NULL\s+ELSE\s+\(\s+lock_record\.value\s+->>\s+'sport_id'\s+\)::uuid\s+END\s+WHERE COALESCE\(\s+lock_record\.value\s+->>\s+'lock_mode',\s+''\s+\) = 'HARD'\s+AND lock_record\.value\s+->>\s+'period'\s+IN\s+\(\s+'MATUTINO',\s+'VESPERTINO'\s+\)\s+AND NOT EXISTS \($lock_join_pattern$,
    $new_lock_join$
  JOIN LATERAL public.resolve_bracket_fixed_block_bounds_from_payload(
    _payload,
    days_table.event_date,
    NULLIF(
      lock_record.value
        ->> 'start_time',
      ''
    ),
    NULLIF(
      lock_record.value
        ->> 'end_time',
      ''
    ),
    CASE
      WHEN NULLIF(
        lock_record.value
          ->> 'period',
        ''
      ) IS NULL
      THEN
        NULL
      ELSE
        (
          lock_record.value
            ->> 'period'
        )::public.championship_schedule_period
    END
  ) AS lock_bounds
    ON true

  LEFT JOIN public.sports
    AS sports_table
    ON sports_table.id =
      CASE
        WHEN NULLIF(
          lock_record.value
            ->> 'sport_id',
          ''
        ) IS NULL
        THEN
          NULL

        ELSE
          (
            lock_record.value
              ->> 'sport_id'
          )::uuid
      END

  WHERE COALESCE(
      lock_record.value
        ->> 'lock_mode',
      ''
    ) = 'HARD'

    AND NOT EXISTS (
$new_lock_join$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o join legado de bloqueio HARD para atualização da timeline operacional.';
  END IF;

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $lock_match_pattern$AND\s+session_record\.value\s+->>\s+'period'\s+=\s+lock_record\.value\s+->>\s+'period'$lock_match_pattern$,
    $new_lock_match$
        AND (
          (
            NULLIF(
              session_record.value
                ->> 'start_time',
              ''
            ) IS NOT NULL
            AND NULLIF(
              lock_record.value
                ->> 'start_time',
              ''
            ) IS NOT NULL
            AND session_record.value
              ->> 'start_time' =
                lock_record.value
                  ->> 'start_time'
            AND session_record.value
              ->> 'end_time' =
                lock_record.value
                  ->> 'end_time'
          )
          OR (
            session_record.value
              ->> 'period' =
                lock_record.value
                  ->> 'period'
            AND session_record.value
              ->> 'period' IN (
                'MATUTINO',
                'VESPERTINO'
              )
          )
        )
$new_lock_match$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar a regra de conflito por período entre sessão individual e bloqueio HARD.';
  END IF;

  EXECUTE function_definition;
END;
$$;


DO $$
DECLARE
  function_definition TEXT;
  previous_function_definition TEXT;
BEGIN
  function_definition := pg_get_functiondef(
    'public.get_championship_knockout_final_program_schedule(uuid)'::regprocedure
  );

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $period_required_pattern$(?s)IF\s+NULLIF\(\s*trim\(\s*COALESCE\(\s*program_block_record\s+->>\s+'period',\s+''\s*\)\s*\),\s*''\s*\)\s+IS NULL\s+THEN.*?resolved_period\s*:=\s*\(\s*program_block_record\s+->>\s+'period'\s*\)::public\.championship_schedule_period;\s+(resolved_division_scope\s*:=)$period_required_pattern$,
    $new_period_required$
    IF (
      NULLIF(
        trim(
          COALESCE(
            program_block_record ->> 'start_time',
            ''
          )
        ),
        ''
      ) IS NULL
      OR NULLIF(
        trim(
          COALESCE(
            program_block_record ->> 'end_time',
            ''
          )
        ),
        ''
      ) IS NULL
    )
      AND NULLIF(
        trim(
          COALESCE(
            program_block_record ->> 'period',
            ''
          )
        ),
        ''
      ) IS NULL
    THEN
      RAISE EXCEPTION
        'Horário ou período não informado no bloco de finais %.',
        program_block_ordinality;
    END IF;

    resolved_period :=
      CASE
        WHEN NULLIF(
          trim(
            COALESCE(
              program_block_record ->> 'period',
              ''
            )
          ),
          ''
        ) IS NULL
        THEN
          NULL
        ELSE
          (
            program_block_record ->> 'period'
          )::public.championship_schedule_period
      END;
    \1
$new_period_required$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar a validação legada de período na programação manual das finais.';
  END IF;

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $bounds_block_pattern$(?s)resolved_period_enabled\s*:=\s*NULL;.*?(resolved_next_day_start_at\s*:=)$bounds_block_pattern$,
    $new_bounds_block$
    SELECT
      fixed_block_bounds.schedule_period,
      fixed_block_bounds.period_start_at,
      fixed_block_bounds.period_end_at
    INTO
      resolved_period,
      resolved_period_start_at,
      resolved_period_end_at
    FROM public.resolve_bracket_fixed_block_bounds_from_payload(
      edition_record.payload_snapshot,
      resolved_scheduled_date,
      NULLIF(
        program_block_record ->> 'start_time',
        ''
      ),
      NULLIF(
        program_block_record ->> 'end_time',
        ''
      ),
      resolved_period
    ) AS fixed_block_bounds
    LIMIT 1;

    IF resolved_period_start_at IS NULL
      OR resolved_period_end_at IS NULL
    THEN
      RAISE EXCEPTION
        'O bloco de finais % não possui uma janela válida em %.',
        program_block_ordinality,
        resolved_scheduled_date;
    END IF;
    \1
$new_bounds_block$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar o cálculo legado de janela da programação manual das finais.';
  END IF;

  previous_function_definition := function_definition;

  function_definition := regexp_replace(
    function_definition,
    $duplicate_group_pattern$(?s)GROUP BY\s+final_program_table\.scheduled_date,\s+final_program_table\.bracket_court_id,\s+final_program_table\.schedule_period,\s+final_program_table\.display_order\s+HAVING COUNT\(\s+DISTINCT final_program_table\.block_ordinality\s+\)\s+> 1\s*\)\s+THEN\s+RAISE EXCEPTION\s+'Existem dois blocos de finais com a mesma ordem na mesma quadra e período\.';$duplicate_group_pattern$,
    $new_duplicate_group$
    GROUP BY
      final_program_table.scheduled_date,
      final_program_table.bracket_court_id,
      final_program_table.period_start_at,
      final_program_table.period_end_at,
      final_program_table.display_order
    HAVING COUNT(
      DISTINCT final_program_table.block_ordinality
    ) > 1
  )
  THEN
    RAISE EXCEPTION
      'Existem dois blocos de finais com a mesma ordem na mesma quadra e horário.';
$new_duplicate_group$
  );

  IF function_definition = previous_function_definition THEN
    RAISE EXCEPTION
      'Não foi possível localizar a validação de duplicidade da programação manual das finais.';
  END IF;

  EXECUTE function_definition;
END;
$$;
