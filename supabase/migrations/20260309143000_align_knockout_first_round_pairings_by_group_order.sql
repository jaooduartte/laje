DO $migration_knockout_pairings_by_group_order$
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
    'home_seed_index := slot_index;\s+away_seed_index := bracket_size - slot_index \+ 1;',
    E'home_seed_index := ((slot_index - 1) * 2) + 1;\n    away_seed_index := home_seed_index + 1;',
    'g'
  );

  IF position('home_seed_index := ((slot_index - 1) * 2) + 1;' IN function_definition) = 0
    OR position('away_seed_index := home_seed_index + 1;' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível alinhar os confrontos da primeira rodada do mata-mata por ordem de chave.';
  END IF;

  EXECUTE function_definition;
END;
$migration_knockout_pairings_by_group_order$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS 'Gera o mata-mata automaticamente por competição, pareando a primeira rodada em ordem sequencial de chaves.';

NOTIFY pgrst, 'reload schema';
