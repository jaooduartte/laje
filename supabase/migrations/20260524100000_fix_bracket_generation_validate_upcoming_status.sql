-- Corrige a validação de status em generate_championship_bracket_groups.
-- A função validava 'PLANNING' ("Em breve") mas o campeonato é criado com
-- status 'UPCOMING' ("Configurando campeonato"), que é o status correto
-- para configurar e gerar o chaveamento.

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

  v_func_def := replace(
    v_func_def,
    'AND status = ''PLANNING''',
    'AND status = ''UPCOMING'''
  );

  v_func_def := replace(
    v_func_def,
    'fora do status Em breve',
    'fora do status Configurando campeonato'
  );

  EXECUTE v_func_def;
END;
$$;
