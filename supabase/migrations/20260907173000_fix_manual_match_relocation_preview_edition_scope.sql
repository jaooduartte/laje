DO $repair_manual_match_relocation_preview_edition_scope$
DECLARE
  function_definition TEXT;
  patched_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.build_manual_match_relocation_preview_base(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'A função-base da prévia de realocação manual não foi encontrada.';
  END IF;

  IF position('editions_table.' IN function_definition) > 0 THEN
    patched_definition := replace(
      replace(
        replace(
          replace(
            function_definition,
            'editions_table.championship_id',
            'bracket_edition_record.championship_id'
          ),
          'editions_table.season_year',
          'bracket_edition_record.season_year'
        ),
        'editions_table.reprogramming_revision',
        'bracket_edition_record.reprogramming_revision'
      ),
      'editions_table.id',
      '_bracket_edition_id'
    );

    IF position('editions_table.' IN patched_definition) > 0 THEN
      RAISE EXCEPTION 'A prévia de realocação manual contém uma referência de edição não suportada.';
    END IF;

    EXECUTE patched_definition;
  END IF;
END;
$repair_manual_match_relocation_preview_edition_scope$;
