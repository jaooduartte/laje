DO $fix_manual_match_relocation_apply_selected_alias$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_manual_match_relocation(uuid,jsonb,bigint)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position('changes_table.is_selected' IN function_definition) = 0
    OR position('AS changes_json(' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A versão esperada da aplicação de realocação manual não foi encontrada.';
  END IF;

  updated_definition := replace(
    function_definition,
    'changes_table.is_selected',
    'changes_json.is_selected'
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível corrigir a seleção da aplicação de realocação manual.';
  END IF;

  EXECUTE updated_definition;
END;
$fix_manual_match_relocation_apply_selected_alias$;

NOTIFY pgrst, 'reload schema';
