DO $migration$
DECLARE
  function_signature regprocedure :=
    to_regprocedure(
      'public.hydrate_championship_bracket_preview_v8_knockout(uuid,uuid,uuid)'
    );
  function_definition text;
  updated_definition text;
  old_pairing_resolution text;
  new_pairing_resolution text;
  old_seed_resolution text;
  new_seed_resolution text;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION
      'Função public.hydrate_championship_bracket_preview_v8_knockout(uuid,uuid,uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature::oid)
  INTO function_definition;

  old_pairing_resolution := $old$
  should_use_cross_groups_pairing :=
    competition_record.knockout_pairing_mode = 'FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS'
    AND competition_record.sport_code = 'FUTEBOL_SOCIETY'
    AND competition_record.naipe = 'FEMININO'
    AND competition_record.division = 'DIVISAO_ACESSO'
    AND group_count_value = 2
    AND competition_record.qualifiers_per_group = 1
    AND should_include_best_second_placed_teams
    AND target_bracket_size = 4;
$old$;

  new_pairing_resolution := $new$
  should_use_cross_groups_pairing := false;
$new$;

  old_seed_resolution := $old$
  FOR seed_iter IN 1..(target_bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, target_bracket_size + 1 - seed_iter);
  END LOOP;
$old$;

  new_seed_resolution := $new$
  standard_seed_order :=
    public.resolve_championship_knockout_seed_order(
      competition_record.knockout_pairing_mode,
      target_bracket_size
    );

  IF COALESCE(cardinality(standard_seed_order), 0) <> target_bracket_size THEN
    RAISE EXCEPTION
      'Invalid knockout seed order for competition %, mode %, bracket size %',
      competition_record.id,
      competition_record.knockout_pairing_mode,
      target_bracket_size;
  END IF;
$new$;

  IF position(old_pairing_resolution IN function_definition) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a lógica antiga de pareamento na hidratação V8.';
  END IF;

  IF position(old_seed_resolution IN function_definition) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a lógica antiga de seeds na hidratação V8.';
  END IF;

  updated_definition :=
    replace(
      function_definition,
      old_pairing_resolution,
      new_pairing_resolution
    );

  updated_definition :=
    replace(
      updated_definition,
      old_seed_resolution,
      new_seed_resolution
    );

  updated_definition :=
    replace(
      updated_definition,
      E'  seed_iter INTEGER;\n',
      ''
    );

  EXECUTE updated_definition;
END;
$migration$;