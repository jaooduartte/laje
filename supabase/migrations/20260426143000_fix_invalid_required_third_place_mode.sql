-- Corrige função de geração de mata-mata que ficou com literal inválido
-- do enum public.bracket_third_place_mode após atualização de seeding.
DO $$
DECLARE
  function_signature regprocedure := to_regprocedure('public.generate_championship_knockout_for_competition(uuid, uuid, uuid)');
  function_definition TEXT;
  patched_definition TEXT;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION 'Função public.generate_championship_knockout_for_competition(uuid, uuid, uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'Não foi possível carregar a definição da função generate_championship_knockout_for_competition.';
  END IF;

  patched_definition := replace(
    function_definition,
    '''REQUIRED''::public.bracket_third_place_mode',
    '''MATCH''::public.bracket_third_place_mode'
  );

  IF patched_definition = function_definition THEN
    RETURN;
  END IF;

  EXECUTE patched_definition;
END;
$$;
