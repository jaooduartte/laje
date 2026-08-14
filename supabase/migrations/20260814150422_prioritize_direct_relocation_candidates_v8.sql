DO $migration$
DECLARE
  function_definition TEXT;
  old_order TEXT := $order$
      ORDER BY
        candidate_slot.day_distance,
        candidate_slot.time_distance_seconds,
        candidate_slot.event_date,
        candidate_slot.start_at,
        candidate_slot.location_key,
        candidate_slot.court_key,
        candidate_slot.sequence_index,
        candidate_slot.slot_id
$order$;
  new_order TEXT := $order$
      ORDER BY
        CASE
          WHEN championship_bracket_preview_private.is_match_slot_eligible_with_rest_gap(
            _job_id,
            blocker_record.blocker_match_id,
            candidate_slot.slot_id,
            blocker_rest_gap
          )
          THEN 0
          ELSE 1
        END,
        candidate_slot.day_distance,
        candidate_slot.time_distance_seconds,
        candidate_slot.event_date,
        candidate_slot.start_at,
        candidate_slot.location_key,
        candidate_slot.court_key,
        candidate_slot.sequence_index,
        candidate_slot.slot_id
$order$;
  occurrence_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.jobs
    WHERE status NOT IN (
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'CONSUMED'
    )
  ) THEN
    RAISE EXCEPTION
      'Não é permitido alterar o backtracking enquanto houver jobs ativos.';
  END IF;

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
            old_order,
            ''
          )
        )
    )
    / length(old_order);

  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION
      'Esperado exatamente 1 bloco de ordenação recursiva, encontrado %.',
      occurrence_count;
  END IF;

  function_definition :=
    replace(
      function_definition,
      old_order,
      new_order
    );

  EXECUTE function_definition;
END;
$migration$;

DO $verification$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'championship_bracket_preview_private.try_resolve_match_slot_backtracking_status(uuid,uuid,bigint,integer,uuid[],bigint[],integer,integer,integer,integer,integer,uuid,integer,timestamptz)'::regprocedure
  )
  INTO function_definition;

  IF position(
    'blocker_record.blocker_match_id,
            candidate_slot.slot_id,
            blocker_rest_gap'
    IN function_definition
  ) = 0 THEN
    RAISE EXCEPTION
      'A priorização de destinos diretamente elegíveis não foi aplicada.';
  END IF;
END;
$verification$;

NOTIFY pgrst, 'reload schema';