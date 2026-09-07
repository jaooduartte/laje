DO $fix_manual_relocation_end_selected_order$
DECLARE
  function_definition TEXT;
  patched_definition TEXT;
  source_fragment TEXT := $source$
      WHEN insertion_position = 'END' AND target_start_time IS NOT NULL THEN 100000 + row_number() OVER ($source$;
  target_fragment TEXT := $target$
      WHEN insertion_position = 'END' AND target_start_time IS NULL THEN 100000 + row_number() OVER ($target$;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_manual_match_relocation_preview_base(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(source_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A prioridade esperada dos jogos selecionados na realocação não foi encontrada.';
  END IF;

  patched_definition := replace(
    function_definition,
    source_fragment,
    target_fragment
  );

  EXECUTE patched_definition;
END;
$fix_manual_relocation_end_selected_order$;
