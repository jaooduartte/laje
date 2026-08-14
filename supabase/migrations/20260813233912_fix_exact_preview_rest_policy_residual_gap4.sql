DO $migration$
DECLARE
  function_definition TEXT;
  occurrence_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.try_place_match_backtracking_status(uuid,uuid,bigint,uuid[],bigint[],integer,integer,integer,integer,uuid,integer,timestamptz)'::regprocedure
  )
  INTO function_definition;

  occurrence_count :=
    (
      length(function_definition)
      - length(
          replace(
            function_definition,
            'ELSE 4',
            ''
          )
        )
    )
    / length('ELSE 4');

  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION
      'try_place_match_backtracking_status: esperado 1 ELSE 4, encontrado %.',
      occurrence_count;
  END IF;

  function_definition :=
    replace(
      function_definition,
      'ELSE 4',
      'ELSE 3'
    );

  EXECUTE function_definition;
END;
$migration$;

DO $migration$
DECLARE
  function_definition TEXT;
  occurrence_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(uuid,uuid,bigint,integer,uuid[],bigint[],integer,integer,integer,integer,integer,uuid,integer,timestamptz)'::regprocedure
  )
  INTO function_definition;

  occurrence_count :=
    (
      length(function_definition)
      - length(
          replace(
            function_definition,
            'ELSE 4',
            ''
          )
        )
    )
    / length('ELSE 4');

  IF occurrence_count <> 2 THEN
    RAISE EXCEPTION
      'try_resolve_match_slot_backtracking_status: esperados 2 ELSE 4, encontrado %.',
      occurrence_count;
  END IF;

  function_definition :=
    replace(
      function_definition,
      'ELSE 4',
      'ELSE 3'
    );

  EXECUTE function_definition;
END;
$migration$;

DO $migration$
DECLARE
  function_definition TEXT;
  direct_gap_pattern TEXT :=
    '(candidate_slot_record\.id,[[:space:]]*)4([[:space:]]*\))';
  metric_gap_pattern TEXT :=
    '(''COMPACTION'',[[:space:]]*)4([[:space:]]*,[[:space:]]*tier_record\.search_tier)';
  occurrence_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.compact_v8_schedule_batch(uuid)'::regprocedure
  )
  INTO function_definition;

  SELECT count(*)
  INTO occurrence_count
  FROM regexp_matches(
    function_definition,
    direct_gap_pattern,
    'g'
  );

  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION
      'compact_v8_schedule_batch: esperado 1 gap 4 direto de compactação, encontrado %.',
      occurrence_count;
  END IF;

  function_definition :=
    regexp_replace(
      function_definition,
      direct_gap_pattern,
      E'\\1' || '3' || E'\\2',
      'g'
    );

  SELECT count(*)
  INTO occurrence_count
  FROM regexp_matches(
    function_definition,
    metric_gap_pattern,
    'g'
  );

  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION
      'compact_v8_schedule_batch: esperado 1 rest_gap 4 de telemetria, encontrado %.',
      occurrence_count;
  END IF;

  function_definition :=
    regexp_replace(
      function_definition,
      metric_gap_pattern,
      E'\\1' || '3' || E'\\2',
      'g'
    );

  EXECUTE function_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';