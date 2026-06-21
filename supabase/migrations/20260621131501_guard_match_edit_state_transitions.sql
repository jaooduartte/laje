CREATE OR REPLACE FUNCTION public.validate_mesa_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.home_score < 0
    OR NEW.away_score < 0
    OR NEW.home_yellow_cards < 0
    OR NEW.away_yellow_cards < 0
    OR NEW.home_red_cards < 0
    OR NEW.away_red_cards < 0
    OR (NEW.current_set_home_score IS NOT NULL AND NEW.current_set_home_score < 0)
    OR (NEW.current_set_away_score IS NOT NULL AND NEW.current_set_away_score < 0) THEN
    RAISE EXCEPTION 'Placar e cartões não podem ser negativos.';
  END IF;

  IF NEW.is_double_walkover = true AND EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RAISE EXCEPTION 'Não é possível aplicar W.O. duplo em jogos do mata-mata.';
  END IF;

  IF OLD.status <> 'SCHEDULED'::public.match_status AND (
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
    OR NEW.manual_representation_mode IS DISTINCT FROM OLD.manual_representation_mode
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
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
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
    OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id THEN
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
$$;
