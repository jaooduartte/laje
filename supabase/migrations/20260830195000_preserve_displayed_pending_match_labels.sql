DO $patch_pending_manual_match_relocation_labels$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.hold_matches_for_manual_relocation(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position('pending_manual_relocation_previous_label = format(' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A versão esperada da retenção de jogos não foi encontrada.';
  END IF;

  updated_definition := replace(
    function_definition,
    '    pending_manual_relocation_previous_label = format(
      ''Jogo %s'',
      COALESCE(matches_table.scheduled_slot, matches_table.queue_position)
    ),',
    '    pending_manual_relocation_previous_label = COALESCE(
      NULLIF(
        trim(COALESCE(_payload->''previous_labels''->>matches_table.id::TEXT, '''')),
        ''''
      ),
      format(
        ''Jogo %s'',
        COALESCE(matches_table.scheduled_slot, matches_table.queue_position)
      )
    ),'
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível preservar o número visual dos jogos guardados.';
  END IF;

  EXECUTE updated_definition;
END;
$patch_pending_manual_match_relocation_labels$;

NOTIFY pgrst, 'reload schema';
