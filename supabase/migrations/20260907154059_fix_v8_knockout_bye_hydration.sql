DO $migration$
DECLARE
  function_definition TEXT;
  invalid_bye_validation TEXT := $validation$
IF first_round_match_record.is_bye IS DISTINCT FROM expected_is_bye THEN
  RAISE EXCEPTION
    'A classificação real divergiu da estrutura eliminatória aprovada na prévia v8 para a primeira rodada, slot %. BYE projetado: %, BYE real: %.',
    slot_index,
    first_round_match_record.is_bye,
    expected_is_bye;
END IF;
$validation$;
BEGIN
  SELECT pg_get_functiondef(
    'public.hydrate_championship_bracket_preview_v8_knockout(uuid,uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF position(invalid_bye_validation IN function_definition) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a validação de BYE incompatível na hidratação v8.';
  END IF;

  EXECUTE replace(function_definition, invalid_bye_validation, '');
END;
$migration$;
