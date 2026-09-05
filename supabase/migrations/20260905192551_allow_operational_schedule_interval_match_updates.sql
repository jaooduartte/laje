CREATE OR REPLACE FUNCTION public.validate_mesa_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.home_score < 0
    OR NEW.away_score < 0
    OR NEW.home_yellow_cards < 0
    OR NEW.away_yellow_cards < 0
    OR NEW.home_red_cards < 0
    OR NEW.away_red_cards < 0
    OR (NEW.current_set_home_score IS NOT NULL AND NEW.current_set_home_score < 0)
    OR (NEW.current_set_away_score IS NOT NULL AND NEW.current_set_away_score < 0)
    OR (NEW.home_penalty_score IS NOT NULL AND NEW.home_penalty_score < 0)
    OR (NEW.away_penalty_score IS NOT NULL AND NEW.away_penalty_score < 0) THEN
    RAISE EXCEPTION 'Placar, cartões e pênaltis não podem ser negativos.';
  END IF;

  IF NEW.is_double_walkover = true AND EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RAISE EXCEPTION 'Não é possível aplicar W.O. duplo em jogos do mata-mata.';
  END IF;

  IF OLD.status <> 'SCHEDULED'::public.match_status
    AND current_setting('app.allow_operational_schedule_interval_match_update', TRUE) IS DISTINCT FROM 'true'
    AND (
      NEW.sport_id IS DISTINCT FROM OLD.sport_id
      OR NEW.home_team_id IS DISTINCT FROM OLD.home_team_id
      OR NEW.away_team_id IS DISTINCT FROM OLD.away_team_id
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.court_name IS DISTINCT FROM OLD.court_name
      OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
      OR NEW.scheduled_slot IS DISTINCT FROM OLD.scheduled_slot
      OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
      OR NEW.division IS DISTINCT FROM OLD.division
      OR NEW.naipe IS DISTINCT FROM OLD.naipe
    ) THEN
    RAISE EXCEPTION 'Jogos em andamento ou encerrados não podem ter logística, fila ou estrutura alteradas.';
  END IF;

  IF public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NEW.championship_id != OLD.championship_id
    OR NEW.sport_id != OLD.sport_id
    OR NEW.home_team_id != OLD.home_team_id
    OR NEW.away_team_id != OLD.away_team_id
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
    OR NEW.division IS DISTINCT FROM OLD.division
    OR NEW.naipe IS DISTINCT FROM OLD.naipe
    OR NEW.supports_cards IS DISTINCT FROM OLD.supports_cards
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Perfil com acesso ao Controle ao Vivo pode alterar apenas placar, cartões, status, quadra real e horários reais da partida.';
  END IF;

  IF OLD.status = 'FINISHED'::public.match_status
    AND NEW.status != 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Partida encerrada não pode voltar para outro status.';
  END IF;

  IF OLD.status = 'SCHEDULED'::public.match_status
    AND NEW.status = 'FINISHED'::public.match_status
    AND NEW.is_walkover = false THEN
    RAISE EXCEPTION 'A partida precisa iniciar antes de ser encerrada.';
  END IF;

  RETURN NEW;
END;
$function$;

DO $do$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_operational_schedule_interval(uuid,jsonb,bigint)'::REGPROCEDURE
  )
  INTO function_definition;

  function_definition := replace(
    function_definition,
    $match$
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);
  PERFORM set_config('app.skip_queue_trigger', 'true', true);
$match$,
    $replacement$
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);
  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.allow_operational_schedule_interval_match_update', 'true', true);
$replacement$
  );
  function_definition := replace(
    function_definition,
    $match$
  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  UPDATE public.championship_bracket_editions
$match$,
    $replacement$
  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);
  PERFORM set_config('app.allow_operational_schedule_interval_match_update', 'false', true);

  UPDATE public.championship_bracket_editions
$replacement$
  );
  function_definition := replace(
    function_definition,
    $match$
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
$match$,
    $replacement$
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    PERFORM set_config('app.allow_operational_schedule_interval_match_update', 'false', true);
    RAISE;
$replacement$
  );

  EXECUTE function_definition;
END;
$do$;

NOTIFY pgrst, 'reload schema';
