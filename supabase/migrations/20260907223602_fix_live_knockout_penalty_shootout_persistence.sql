DO $do$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.validate_match_conflict()'::REGPROCEDURE)
  INTO function_definition;

  IF position(
    '  IF should_apply_penalty_shootout THEN' || chr(10) ||
    '    IF NEW.home_penalty_score IS NULL OR NEW.away_penalty_score IS NULL THEN'
    IN function_definition
  ) = 0 THEN
    RAISE EXCEPTION 'A versão esperada de validate_match_conflict não está instalada.';
  END IF;

  function_definition := replace(
    function_definition,
    '  ELSE' || chr(10) || '    NEW.home_penalty_score := NULL;',
    '  ELSIF NEW.status = ''LIVE''::public.match_status' || chr(10) ||
    '    AND COALESCE(NEW.is_walkover, false) = false' || chr(10) ||
    '    AND COALESCE(NEW.is_double_walkover, false) = false' || chr(10) ||
    '    AND is_penalty_shootout_knockout_match' || chr(10) ||
    '    AND NEW.home_score = NEW.away_score THEN' || chr(10) ||
    '    NEW.resolved_tie_breaker_rule := NULL;' || chr(10) ||
    '    NEW.resolved_tie_break_winner_team_id := NULL;' || chr(10) ||
    '  ELSE' || chr(10) || '    NEW.home_penalty_score := NULL;'
  );

  EXECUTE function_definition;
END
$do$;

NOTIFY pgrst, 'reload schema';
