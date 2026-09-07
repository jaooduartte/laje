DO $do$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.validate_match_conflict()'::REGPROCEDURE)
  INTO function_definition;

  IF position(
    '  is_society_knockout_match BOOLEAN := false;' || chr(10) || '  should_apply_society_penalties BOOLEAN := false;'
    IN function_definition
  ) = 0 THEN
    RAISE EXCEPTION 'A versão esperada de validate_match_conflict não está instalada.';
  END IF;

  function_definition := replace(
    function_definition,
    '  is_society_knockout_match BOOLEAN := false;' || chr(10) || '  should_apply_society_penalties BOOLEAN := false;',
    '  is_penalty_shootout_knockout_match BOOLEAN := false;' || chr(10) || '  penalty_shootout_tie_breaker_rule public.championship_sport_tie_breaker_rule;' || chr(10) || '  should_apply_penalty_shootout BOOLEAN := false;'
  );
  function_definition := replace(
    function_definition,
    '    JOIN public.championships AS championships_table' || chr(10) || '      ON championships_table.id = NEW.championship_id',
    '    JOIN public.sports AS sports_table' || chr(10) || '      ON sports_table.id = NEW.sport_id'
  );
  function_definition := replace(
    function_definition,
    '      AND championships_table.code = ''SOCIETY''::public.championship_code',
    '      AND sports_table.code IN (''FUTEBOL_SOCIETY'', ''BEACH_SOCCER'', ''FUTSAL'')'
  );
  function_definition := replace(
    function_definition,
    '  INTO is_society_knockout_match;',
    '  INTO is_penalty_shootout_knockout_match;' || chr(10) || chr(10) ||
    '  SELECT championship_sports_table.tie_breaker_rule' || chr(10) ||
    '  INTO penalty_shootout_tie_breaker_rule' || chr(10) ||
    '  FROM public.championship_sports AS championship_sports_table' || chr(10) ||
    '  WHERE championship_sports_table.championship_id = NEW.championship_id' || chr(10) ||
    '    AND championship_sports_table.sport_id = NEW.sport_id' || chr(10) ||
    '  LIMIT 1;'
  );
  function_definition := replace(
    function_definition,
    'should_apply_society_penalties',
    'should_apply_penalty_shootout'
  );
  function_definition := replace(
    function_definition,
    'is_society_knockout_match',
    'is_penalty_shootout_knockout_match'
  );
  function_definition := replace(
    function_definition,
    'Jogos empatados do mata-mata da Copa Laje Society exigem o placar dos pênaltis.',
    'Jogos empatados do mata-mata desta modalidade exigem o placar dos pênaltis.'
  );
  function_definition := replace(
    function_definition,
    'NEW.resolved_tie_breaker_rule := ''FUTEBOL_SOCIETY''::public.championship_sport_tie_breaker_rule;',
    'NEW.resolved_tie_breaker_rule := COALESCE(penalty_shootout_tie_breaker_rule, ''FUTEBOL_SOCIETY''::public.championship_sport_tie_breaker_rule);'
  );
  function_definition := replace(
    function_definition,
    'IF NEW.resolved_tie_breaker_rule = ''FUTEBOL_SOCIETY''::public.championship_sport_tie_breaker_rule THEN',
    'IF NEW.resolved_tie_breaker_rule = penalty_shootout_tie_breaker_rule THEN'
  );

  EXECUTE function_definition;
END
$do$;

CREATE OR REPLACE FUNCTION public.validate_championship_knockout_match_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_penalty_shootout_knockout_match BOOLEAN := false;
BEGIN
  IF NEW.status != 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.sports AS sports_table
      ON sports_table.id = NEW.sport_id
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND sports_table.code IN ('FUTEBOL_SOCIETY', 'BEACH_SOCCER', 'FUTSAL')
  )
  INTO is_penalty_shootout_knockout_match;

  IF NEW.home_score = NEW.away_score THEN
    IF is_penalty_shootout_knockout_match
      AND NEW.home_penalty_score IS NOT NULL
      AND NEW.away_penalty_score IS NOT NULL
      AND NEW.home_penalty_score != NEW.away_penalty_score THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.match_id = NEW.id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    ) THEN
      RAISE EXCEPTION 'Jogos do mata-mata não podem terminar empatados.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DO $do$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.rebuild_standings_scope(uuid,integer,uuid,public.match_naipe,public.team_division)'::REGPROCEDURE
  )
  INTO function_definition;

  IF position(
    'WHEN championship_code = ''SOCIETY''::public.championship_code' || chr(10) || '          AND is_knockout_match' || chr(10) || '          AND home_penalty_score IS NOT NULL' || chr(10) || '          AND away_penalty_score IS NOT NULL' || chr(10) || '          AND home_penalty_score != away_penalty_score'
    IN function_definition
  ) = 0 THEN
    RAISE EXCEPTION 'A versão esperada de rebuild_standings_scope não está instalada.';
  END IF;

  function_definition := replace(
    function_definition,
    '      public.normalize_sport_name(sports_table.name) AS normalized_sport_name,',
    '      public.normalize_sport_name(sports_table.name) AS normalized_sport_name,' || chr(10) || '      sports_table.code AS sport_code,'
  );
  function_definition := replace(
    function_definition,
    'WHEN championship_code = ''SOCIETY''::public.championship_code' || chr(10) || '          AND is_knockout_match' || chr(10) || '          AND home_penalty_score IS NOT NULL' || chr(10) || '          AND away_penalty_score IS NOT NULL' || chr(10) || '          AND home_penalty_score != away_penalty_score',
    'WHEN sport_code IN (''FUTEBOL_SOCIETY'', ''BEACH_SOCCER'', ''FUTSAL'')' || chr(10) || '          AND is_knockout_match' || chr(10) || '          AND home_penalty_score IS NOT NULL' || chr(10) || '          AND away_penalty_score IS NOT NULL' || chr(10) || '          AND home_penalty_score != away_penalty_score'
  );

  EXECUTE function_definition;
END
$do$;

NOTIFY pgrst, 'reload schema';
