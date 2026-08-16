CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_v8_knockout_seed_source(
  _groups_count integer,
  _qualifiers_per_group integer,
  _include_best_second_pool boolean,
  _use_cross_groups_pairing boolean,
  _seed_number integer,
  _qualified_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  group_number_value INTEGER;
  position_value INTEGER;
BEGIN
  IF _seed_number > _qualified_count THEN
    RETURN jsonb_build_object(
      'type', 'BYE',
      'reference', format('BYE_SEED_%s', _seed_number)
    );
  END IF;

  IF _use_cross_groups_pairing THEN
    group_number_value := ((_seed_number - 1) / 2) + 1;
    position_value := ((_seed_number - 1) % 2) + 1;

    RETURN jsonb_build_object(
      'type', 'GROUP_POSITION',
      'reference', format(
        'GROUP_%s_POSITION_%s',
        group_number_value,
        position_value
      )
    );
  END IF;

  IF _qualifiers_per_group = 1 THEN
    IF _seed_number <= _groups_count THEN
      RETURN jsonb_build_object(
        'type', 'BEST_FIRST_POOL',
        'reference', format(
          'BEST_FIRST_POOL_POSITION_%s',
          _seed_number
        )
      );
    END IF;

    IF _include_best_second_pool THEN
      RETURN jsonb_build_object(
        'type', 'BEST_SECOND_POOL',
        'reference', format(
          'BEST_SECOND_POOL_POSITION_%s',
          _seed_number - _groups_count
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'type', 'BYE',
      'reference', format('BYE_SEED_%s', _seed_number)
    );
  END IF;

  IF _seed_number <= _groups_count * _qualifiers_per_group THEN
    group_number_value :=
      ((_seed_number - 1) % _groups_count) + 1;

    position_value :=
      ((_seed_number - 1) / _groups_count) + 1;

    RETURN jsonb_build_object(
      'type', 'GROUP_POSITION',
      'reference', format(
        'GROUP_%s_POSITION_%s',
        group_number_value,
        position_value
      )
    );
  END IF;

  IF _qualifiers_per_group = 2 THEN
    RETURN jsonb_build_object(
      'type', 'BEST_THIRD_POOL',
      'reference', format(
        'BEST_THIRD_POOL_POSITION_%s',
        _seed_number - (_groups_count * 2)
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'type', 'BYE',
    'reference', format('BYE_SEED_%s', _seed_number)
  );
END;
$function$;

DO $migration_rank_first_place_qualification_pool$
DECLARE
  function_definition TEXT;
  updated_function_definition TEXT;
  old_tie_break_fragment TEXT;
  new_tie_break_fragment TEXT;
  old_seed_order_fragment TEXT;
  new_seed_order_fragment TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.hydrate_championship_bracket_preview_v8_knockout(uuid,uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  old_tie_break_fragment :=
'    AND (
      tie_break ->> ''context_type'' <> ''QUALIFICATION_POOL''
      OR (
        additional_qualification_rank IS NOT NULL
        AND (tie_break ->> ''qualification_rank'')::integer = additional_qualification_rank
      )
    );';

  new_tie_break_fragment :=
'    AND (
      tie_break ->> ''context_type'' <> ''QUALIFICATION_POOL''
      OR (
        competition_record.qualifiers_per_group = 1
        AND (tie_break ->> ''qualification_rank'')::integer = 1
      )
      OR (
        additional_qualification_rank IS NOT NULL
        AND (tie_break ->> ''qualification_rank'')::integer = additional_qualification_rank
      )
    );';

  IF position(old_tie_break_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a validação de desempates da hidratação V8.';
  END IF;

  updated_function_definition :=
    replace(
      function_definition,
      old_tie_break_fragment,
      new_tie_break_fragment
    );

  old_seed_order_fragment :=
'      CASE
        WHEN should_include_best_second_placed_teams
          THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
        ELSE ordered_groups.group_number
      END ASC';

  new_seed_order_fragment :=
'      CASE
        WHEN competition_record.qualifiers_per_group = 1
          THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
        ELSE ordered_groups.group_number
      END ASC';

  IF position(old_seed_order_fragment IN updated_function_definition) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a ordenação dos classificados da hidratação V8.';
  END IF;

  updated_function_definition :=
    replace(
      updated_function_definition,
      old_seed_order_fragment,
      new_seed_order_fragment
    );

  EXECUTE updated_function_definition;
END;
$migration_rank_first_place_qualification_pool$;