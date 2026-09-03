DO $$
DECLARE
  build_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(procedure_table.oid)
  INTO build_function_definition
  FROM pg_proc AS procedure_table
  JOIN pg_namespace AS namespace_table ON namespace_table.oid = procedure_table.pronamespace
  WHERE namespace_table.nspname = 'public'
    AND procedure_table.proname = 'build_day_schedule_reorganization_preview'
    AND pg_get_function_identity_arguments(procedure_table.oid) = '_bracket_edition_id uuid, _payload jsonb';

  IF build_function_definition IS NULL
    OR position('CROSS JOIN LATERAL jsonb_array_elements_text(court_order.item_ids) AS item_id' IN build_function_definition) = 0
    OR position('''is_displaced'',  is_selected = false AND (' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'A versão esperada da reorganização diária por arrastar e soltar não está instalada.';
  END IF;

  build_function_definition := replace(
    build_function_definition,
    E'        CROSS JOIN LATERAL jsonb_array_elements_text(court_order.item_ids) AS item_id\n        WHERE item_id = selected_match_id::TEXT',
    E'        CROSS JOIN LATERAL jsonb_array_elements_text(court_order.item_ids) AS manual_order_item(item_id)\n        WHERE manual_order_item.item_id = selected_match_id::TEXT'
  );
  build_function_definition := replace(
    build_function_definition,
    E'''is_displaced'',  is_selected = false AND (',
    E'''is_displaced'', COALESCE(cardinality(selected_match_ids), 0) > 0 AND is_selected = false AND ('
  );

  IF position('manual_order_item(item_id)' IN build_function_definition) = 0
    OR position('manual_order_item.item_id = selected_match_id::TEXT' IN build_function_definition) = 0
    OR position('COALESCE(cardinality(selected_match_ids), 0) > 0 AND is_selected = false' IN build_function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível corrigir a validação do encaixe manual.';
  END IF;

  EXECUTE build_function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
