-- Corrige generate_championship_bracket_groups:
-- 1. Declara a variável should_complete_knockout_with_best_second_placed_teams_value
--    que era usada no INSERT mas nunca declarada (causava erro de coluna inexistente).
-- 2. Lê o valor do payload (competition_record) antes do INSERT.
-- 3. Inclui o campo no ON CONFLICT DO UPDATE.

DO $$
DECLARE
  v_func_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'generate_championship_bracket_groups';

  IF v_func_def IS NULL THEN
    RAISE EXCEPTION 'Função generate_championship_bracket_groups não encontrada.';
  END IF;

  -- 1. Adiciona a declaração da variável logo após a última variável do DECLARE
  v_func_def := replace(
    v_func_def,
    'competition_generation_record   RECORD;',
    'competition_generation_record   RECORD;' || chr(10) ||
    '  should_complete_knockout_with_best_second_placed_teams_value BOOLEAN;'
  );

  -- 2. Lê o valor do payload antes do INSERT nas competições
  v_func_def := replace(
    v_func_def,
    'third_place_mode_value     := COALESCE((competition_record->>''third_place_mode'')::public.bracket_third_place_mode,''NONE'');',
    'third_place_mode_value     := COALESCE((competition_record->>''third_place_mode'')::public.bracket_third_place_mode,''NONE'');' || chr(10) ||
    '    should_complete_knockout_with_best_second_placed_teams_value := COALESCE((competition_record->>''should_complete_knockout_with_best_second_placed_teams'')::boolean, false);'
  );

  -- 3. Inclui o campo no ON CONFLICT DO UPDATE
  v_func_def := replace(
    v_func_def,
    'DO UPDATE SET groups_count=EXCLUDED.groups_count, qualifiers_per_group=EXCLUDED.qualifiers_per_group, third_place_mode=EXCLUDED.third_place_mode',
    'DO UPDATE SET groups_count=EXCLUDED.groups_count, qualifiers_per_group=EXCLUDED.qualifiers_per_group, third_place_mode=EXCLUDED.third_place_mode, should_complete_knockout_with_best_second_placed_teams=EXCLUDED.should_complete_knockout_with_best_second_placed_teams'
  );

  EXECUTE v_func_def;
END;
$$;
