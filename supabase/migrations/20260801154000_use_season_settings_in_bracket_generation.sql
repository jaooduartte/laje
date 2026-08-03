DO $migration_use_season_settings_in_bracket_generation$
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

  function_definition := replace(
    function_definition,
    '  championship_uses_divisions BOOLEAN;
  championship_current_season_year INTEGER;',
    '  championship_uses_divisions BOOLEAN;
  championship_current_season_year INTEGER;
  payload_division_format TEXT;'
  );

  function_definition := replace(
    function_definition,
    '  SELECT
    championships_table.uses_divisions,
    championships_table.current_season_year
  INTO
    championship_uses_divisions,
    championship_current_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = ''UPCOMING''::public.championship_status
  LIMIT 1;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION ''Campeonato inválido ou fora do status Configurando campeonato.'';
  END IF;',
    '  SELECT
    championships_table.current_season_year,
    championships_table.uses_divisions
  INTO
    championship_current_season_year,
    championship_uses_divisions
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = ''UPCOMING''::public.championship_status
  LIMIT 1;

  IF championship_current_season_year IS NULL THEN
    RAISE EXCEPTION ''Campeonato inválido ou fora do status Configurando campeonato.'';
  END IF;

  payload_division_format := NULLIF(trim(COALESCE(_payload->''season_settings''->>''division_format'', '''')), '''');

  IF payload_division_format = ''SEPARATED'' THEN
    championship_uses_divisions := true;
  ELSIF payload_division_format = ''UNIFIED'' THEN
    championship_uses_divisions := false;
  ELSIF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION ''Não foi possível resolver o formato sazonal de divisões.'';
  END IF;'
  );

  IF position('payload_division_format TEXT;' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível injetar payload_division_format na função de geração.';
  END IF;

  IF position('_payload->''season_settings''->>''division_format''' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível aplicar a leitura de season_settings na função de geração.';
  END IF;

  EXECUTE function_definition;
END;
$migration_use_season_settings_in_bracket_generation$;

NOTIFY pgrst, 'reload schema';
