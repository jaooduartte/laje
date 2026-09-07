DO $fix_manual_relocation_placeholder_edition_join$
DECLARE
  function_definition TEXT;
  patched_definition TEXT;
  placeholder_source TEXT := $source$
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    LEFT JOIN public.sports AS sports_table$source$;
  placeholder_target TEXT := $target$
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.sports AS sports_table$target$;
BEGIN
  SELECT pg_get_functiondef(
    'public.append_manual_relocation_placeholders(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'A complementação de placeholders da prévia de realocação não foi encontrada.';
  END IF;

  IF position(
    'championship_sports_table.championship_id = editions_table.championship_id'
    IN function_definition
  ) > 0 THEN
    IF position(placeholder_source IN function_definition) = 0 THEN
      RAISE EXCEPTION 'A estrutura esperada dos placeholders da prévia de realocação não foi encontrada.';
    END IF;

    patched_definition := replace(
      function_definition,
      placeholder_source,
      placeholder_target
    );

    EXECUTE patched_definition;
  END IF;
END;
$fix_manual_relocation_placeholder_edition_join$;
