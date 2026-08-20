DO $migration_fix_alternate_naipe_sequence_priority$
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
      'redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;

  -- ==========================================================
  -- 1. ALTERNATE_NAIPE também precisa carregar preferred_naipe
  --    como naipe inicial da quadra.
  -- ==========================================================

  source_block :=
$source$
    CASE
      WHEN court_sports_table.sequence_mode =
        'GROUP_NAIPE'
          ::public.bracket_court_sequence_mode
      THEN court_sports_table.preferred_naipe
      ELSE NULL
    END,
$source$;

  target_block :=
$target$
    CASE
      WHEN court_sports_table.sequence_mode IN (
        'GROUP_NAIPE'
          ::public.bracket_court_sequence_mode,
        'ALTERNATE_NAIPE'
          ::public.bracket_court_sequence_mode
      )
      THEN court_sports_table.preferred_naipe
      ELSE NULL
    END,
$target$;

  IF strpos(
    function_definition,
    source_block
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar a inicialização de primary_naipe.';
  END IF;

  function_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );

  -- ==========================================================
  -- 2. No modo ALTERNATE_NAIPE, a preferência genérica da
  --    modalidade principal não pode fixar sempre o mesmo
  --    naipe antes da regra de alternância.
  -- ==========================================================

  source_block :=
$source$
        CASE
          WHEN slot_record.is_primary_sport
            AND (
              slot_record.primary_naipe IS NULL
              OR pending_matches_table.naipe IS NOT DISTINCT FROM
                slot_record.primary_naipe
            )
            AND (
              slot_record.primary_division IS NULL
              OR pending_matches_table.division IS NOT DISTINCT FROM
                slot_record.primary_division
            )
          THEN 0
          WHEN slot_record.is_primary_sport
          THEN 1
          ELSE 0
        END ASC,
$source$;

  target_block :=
$target$
        CASE
          WHEN slot_record.is_primary_sport
            AND (
              slot_record.sequence_mode =
                'ALTERNATE_NAIPE'
                  ::public.bracket_court_sequence_mode
              OR slot_record.primary_naipe IS NULL
              OR pending_matches_table.naipe IS NOT DISTINCT FROM
                slot_record.primary_naipe
            )
            AND (
              slot_record.primary_division IS NULL
              OR pending_matches_table.division IS NOT DISTINCT FROM
                slot_record.primary_division
            )
          THEN 0
          WHEN slot_record.is_primary_sport
          THEN 1
          ELSE 0
        END ASC,
$target$;

  IF strpos(
    function_definition,
    source_block
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar a preferência da modalidade principal.';
  END IF;

  function_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );

  EXECUTE function_definition;
END;
$migration_fix_alternate_naipe_sequence_priority$;

NOTIFY pgrst, 'reload schema';
