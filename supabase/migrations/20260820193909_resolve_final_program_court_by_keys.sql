DO $migration_resolve_final_program_court_by_keys$
DECLARE
  function_definition TEXT;
  source_block TEXT :=
$source$
    WHERE days_table.bracket_edition_id =
        _bracket_edition_id
      AND days_table.event_date =
        resolved_scheduled_date
      AND public.normalize_bracket_entity_name(
        locations_table.name
      ) =
        public.normalize_bracket_entity_name(
          resolved_location_name
        )
      AND public.normalize_bracket_entity_name(
        courts_table.name
      ) =
        public.normalize_bracket_entity_name(
          resolved_court_name
        )
    LIMIT 1;
$source$;
  target_block TEXT :=
$target$
    WHERE days_table.bracket_edition_id =
        _bracket_edition_id
      AND days_table.event_date =
        resolved_scheduled_date
      AND (
        (
          NULLIF(
            trim(
              COALESCE(
                program_block_record
                  ->> 'location_key',
                ''
              )
            ),
            ''
          ) IS NOT NULL
          AND locations_table
            .location_group_id::text =
              program_block_record
                ->> 'location_key'
        )
        OR
        public.normalize_bracket_entity_name(
          locations_table.name
        ) =
          public.normalize_bracket_entity_name(
            resolved_location_name
          )
      )
      AND (
        (
          NULLIF(
            trim(
              COALESCE(
                program_block_record
                  ->> 'court_key',
                ''
              )
            ),
            ''
          ) IS NOT NULL
          AND courts_table
            .court_group_id::text =
              program_block_record
                ->> 'court_key'
        )
        OR
        public.normalize_bracket_entity_name(
          courts_table.name
        ) =
          public.normalize_bracket_entity_name(
            resolved_court_name
          )
      )
    ORDER BY
      CASE
        WHEN locations_table
            .location_group_id::text =
              COALESCE(
                program_block_record
                  ->> 'location_key',
                ''
              )
          AND courts_table
            .court_group_id::text =
              COALESCE(
                program_block_record
                  ->> 'court_key',
                ''
              )
        THEN 0
        ELSE 1
      END,
      locations_table.position ASC,
      courts_table.position ASC
    LIMIT 1;
$target$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_championship_knockout_final_program_schedule(uuid)'::regprocedure
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'get_championship_knockout_final_program_schedule(uuid) não existe.';
  END IF;

  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível localizar o bloco de resolução da quadra da final.';
  END IF;

  function_definition := replace(
    function_definition,
    source_block,
    target_block
  );

  EXECUTE function_definition;
END;
$migration_resolve_final_program_court_by_keys$;

NOTIFY pgrst, 'reload schema';
