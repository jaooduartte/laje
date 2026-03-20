DO $migration_sync_generate_groups_best_seconds_flag$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_bracket_groups(uuid, jsonb)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_bracket_groups(uuid, jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := regexp_replace(
    function_definition,
    'qualifiers_per_group_value INTEGER;',
    E'qualifiers_per_group_value INTEGER;\n  should_complete_knockout_with_best_second_placed_teams_value BOOLEAN;',
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$qualifiers_per_group_value := GREATEST\(1, COALESCE\(\(competition_record->>'qualifiers_per_group'\)::integer, 1\)\);$pattern$,
    $replacement$qualifiers_per_group_value := GREATEST(1, COALESCE((competition_record->>'qualifiers_per_group')::integer, 1));
    should_complete_knockout_with_best_second_placed_teams_value := COALESCE(
      (competition_record->>'should_complete_knockout_with_best_second_placed_teams')::boolean,
      false
    );$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$INSERT INTO public\.championship_bracket_competitions \(\s*bracket_edition_id,\s*sport_id,\s*naipe,\s*division,\s*groups_count,\s*qualifiers_per_group,\s*third_place_mode\s*\)$pattern$,
    $replacement$INSERT INTO public.championship_bracket_competitions (
      bracket_edition_id,
      sport_id,
      naipe,
      division,
      groups_count,
      qualifiers_per_group,
      should_complete_knockout_with_best_second_placed_teams,
      third_place_mode
    )$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$VALUES \(\s*bracket_edition_id,\s*sport_id,\s*naipe_value,\s*division_value,\s*groups_count_value,\s*qualifiers_per_group_value,\s*third_place_mode_value\s*\)$pattern$,
    $replacement$VALUES (
      bracket_edition_id,
      sport_id,
      naipe_value,
      division_value,
      groups_count_value,
      qualifiers_per_group_value,
      should_complete_knockout_with_best_second_placed_teams_value,
      third_place_mode_value
    )$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$groups_count = EXCLUDED\.groups_count,\s*qualifiers_per_group = EXCLUDED\.qualifiers_per_group,\s*third_place_mode = EXCLUDED\.third_place_mode$pattern$,
    $replacement$groups_count = EXCLUDED.groups_count,
      qualifiers_per_group = EXCLUDED.qualifiers_per_group,
      should_complete_knockout_with_best_second_placed_teams = EXCLUDED.should_complete_knockout_with_best_second_placed_teams,
      third_place_mode = EXCLUDED.third_place_mode$replacement$,
    'g'
  );

  IF position('should_complete_knockout_with_best_second_placed_teams_value' IN function_definition) = 0
    OR position('should_complete_knockout_with_best_second_placed_teams,' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível sincronizar a flag de melhores segundos na geração de grupos.';
  END IF;

  EXECUTE function_definition;
END;
$migration_sync_generate_groups_best_seconds_flag$;

DO $migration_sync_bracket_view_best_seconds_flag$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.get_championship_bracket_view(uuid, integer)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.get_championship_bracket_view(uuid, integer) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$competitions_table\.qualifiers_per_group,\s*competitions_table\.third_place_mode,$pattern$,
    $replacement$competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.third_place_mode,$replacement$,
    'g'
  );

  function_definition := regexp_replace(
    function_definition,
    $pattern$'qualifiers_per_group', competitions\.qualifiers_per_group,\s*'third_place_mode', competitions\.third_place_mode,$pattern$,
    $replacement$'qualifiers_per_group', competitions.qualifiers_per_group,
            'should_complete_knockout_with_best_second_placed_teams', competitions.should_complete_knockout_with_best_second_placed_teams,
            'third_place_mode', competitions.third_place_mode,$replacement$,
    'g'
  );

  IF position('should_complete_knockout_with_best_second_placed_teams' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível sincronizar a flag de melhores segundos na visão do chaveamento.';
  END IF;

  EXECUTE function_definition;
END;
$migration_sync_bracket_view_best_seconds_flag$;

DO $migration_sync_knockout_generation_best_second_target_size$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.generate_championship_knockout_for_competition(uuid, uuid, uuid)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_knockout_for_competition(uuid, uuid, uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$target_bracket_size := 1;\s*WHILE target_bracket_size < \(group_count_value \* competition_record\.qualifiers_per_group\) LOOP\s*target_bracket_size := target_bracket_size \* 2;\s*END LOOP;$pattern$,
    $replacement$target_bracket_size := 1;
  IF competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true THEN
    WHILE target_bracket_size <= (group_count_value * competition_record.qualifiers_per_group) LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < (group_count_value * competition_record.qualifiers_per_group) LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;$replacement$,
    'g'
  );

  IF position('WHILE target_bracket_size <= (group_count_value * competition_record.qualifiers_per_group) LOOP' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível sincronizar a geração do mata-mata para completar vagas com melhores segundos.';
  END IF;

  EXECUTE function_definition;
END;
$migration_sync_knockout_generation_best_second_target_size$;

DO $migration_sync_tie_break_context_target_bracket_size$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
BEGIN
  function_signature := to_regprocedure('public.get_championship_bracket_tie_break_contexts(uuid, uuid, uuid)');

  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.get_championship_bracket_tie_break_contexts(uuid, uuid, uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  function_definition := regexp_replace(
    function_definition,
    $pattern$CASE\s+WHEN \(group_counts\.group_count \* competitions_table\.qualifiers_per_group\) < 2 THEN\s+\(group_counts\.group_count \* competitions_table\.qualifiers_per_group\)\s+ELSE\s+power\(2, ceil\(log\(2, \(group_counts\.group_count \* competitions_table\.qualifiers_per_group\)::numeric\)\)\)::int\s+END AS target_bracket_size$pattern$,
    $replacement$CASE
        WHEN (group_counts.group_count * competitions_table.qualifiers_per_group) < 2 THEN
          (group_counts.group_count * competitions_table.qualifiers_per_group)
        WHEN competitions_table.qualifiers_per_group = 1
          AND competitions_table.should_complete_knockout_with_best_second_placed_teams = true THEN
          power(
            2,
            floor(log(2, (group_counts.group_count * competitions_table.qualifiers_per_group)::numeric)) + 1
          )::int
        ELSE
          power(2, ceil(log(2, (group_counts.group_count * competitions_table.qualifiers_per_group)::numeric)))::int
      END AS target_bracket_size$replacement$,
    'g'
  );

  IF position('floor(log(2, (group_counts.group_count * competitions_table.qualifiers_per_group)::numeric)) + 1' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível sincronizar o cálculo de vagas pendentes dos contextos de desempate.';
  END IF;

  EXECUTE function_definition;
END;
$migration_sync_tie_break_context_target_bracket_size$;

NOTIFY pgrst, 'reload schema';
