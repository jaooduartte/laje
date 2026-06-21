ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_penalty_score INTEGER NULL,
  ADD COLUMN IF NOT EXISTS away_penalty_score INTEGER NULL;

COMMENT ON COLUMN public.matches.home_penalty_score IS
  'Gols convertidos nos pênaltis pela equipe mandante quando o empate do tempo normal é decidido em disputa de pênaltis.';
COMMENT ON COLUMN public.matches.away_penalty_score IS
  'Gols convertidos nos pênaltis pela equipe visitante quando o empate do tempo normal é decidido em disputa de pênaltis.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_home_penalty_score_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_home_penalty_score_non_negative
      CHECK (home_penalty_score IS NULL OR home_penalty_score >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_away_penalty_score_non_negative'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_away_penalty_score_non_negative
      CHECK (away_penalty_score IS NULL OR away_penalty_score >= 0);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  available_courts_count INTEGER;
  live_matches_count INTEGER;
  latest_bracket_edition_id UUID;
  should_validate_live_capacity BOOLEAN := false;
  rest_gap_conflict_message TEXT;
  is_society_knockout_match BOOLEAN := false;
  should_apply_society_penalties BOOLEAN := false;
BEGIN
  IF current_setting('app.skip_match_conflict_trigger', TRUE) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Os times da partida devem ser diferentes.';
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status THEN
    IF NEW.scheduled_date IS NULL THEN
      RAISE EXCEPTION 'Informe o dia da fila para partidas agendadas.';
    END IF;
  END IF;

  IF NEW.status = 'LIVE'::public.match_status AND NEW.scheduled_date IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      should_validate_live_capacity := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      should_validate_live_capacity := true;
    END IF;
  END IF;

  IF should_validate_live_capacity THEN
    SELECT editions_table.id
    INTO latest_bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = NEW.championship_id
      AND editions_table.season_year = NEW.season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1;

    IF latest_bracket_edition_id IS NOT NULL THEN
      SELECT count(*)
      INTO available_courts_count
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = latest_bracket_edition_id
        AND days_table.event_date = NEW.scheduled_date
        AND court_sports_table.sport_id = NEW.sport_id;

      IF COALESCE(available_courts_count, 0) > 0 THEN
        SELECT count(*)
        INTO live_matches_count
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = NEW.championship_id
          AND matches_table.season_year = NEW.season_year
          AND matches_table.sport_id = NEW.sport_id
          AND matches_table.status = 'LIVE'::public.match_status
          AND matches_table.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
          AND matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

        IF live_matches_count >= available_courts_count THEN
          RAISE EXCEPTION 'Todas as quadras compatíveis desta modalidade já estão ocupadas neste dia.';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status
    AND NEW.court_name IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.location, '')), '') IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.court_name, '')), '') IS NOT NULL THEN
    rest_gap_conflict_message := public.resolve_scheduled_match_rest_gap_conflict(
      NEW.championship_id,
      NEW.season_year,
      NEW.scheduled_date,
      NEW.location,
      NEW.court_name,
      NEW.start_time,
      NEW.scheduled_slot,
      NEW.queue_position,
      NEW.created_at,
      NEW.id,
      NEW.sport_id,
      NEW.naipe,
      NEW.home_team_id,
      NEW.away_team_id
    );

    IF rest_gap_conflict_message IS NOT NULL THEN
      RAISE EXCEPTION '%', rest_gap_conflict_message;
    END IF;
  END IF;

  IF (NEW.home_penalty_score IS NOT NULL AND NEW.home_penalty_score < 0)
    OR (NEW.away_penalty_score IS NOT NULL AND NEW.away_penalty_score < 0) THEN
    RAISE EXCEPTION 'O placar de pênaltis não pode ser negativo.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championships AS championships_table
      ON championships_table.id = NEW.championship_id
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND championships_table.code = 'SOCIETY'::public.championship_code
  )
  INTO is_society_knockout_match;

  should_apply_society_penalties := (
    NEW.status = 'FINISHED'::public.match_status
    AND COALESCE(NEW.is_walkover, false) = false
    AND COALESCE(NEW.is_double_walkover, false) = false
    AND is_society_knockout_match
    AND NEW.home_score = NEW.away_score
  );

  IF should_apply_society_penalties THEN
    IF NEW.home_penalty_score IS NULL OR NEW.away_penalty_score IS NULL THEN
      RAISE EXCEPTION 'Jogos empatados do mata-mata da Copa Laje Society exigem o placar dos pênaltis.';
    END IF;

    IF NEW.home_penalty_score = NEW.away_penalty_score THEN
      RAISE EXCEPTION 'O placar dos pênaltis precisa definir um vencedor.';
    END IF;

    NEW.resolved_tie_breaker_rule := 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule;
    NEW.resolved_tie_break_winner_team_id := CASE
      WHEN NEW.home_penalty_score > NEW.away_penalty_score THEN NEW.home_team_id
      ELSE NEW.away_team_id
    END;
  ELSE
    NEW.home_penalty_score := NULL;
    NEW.away_penalty_score := NULL;

    IF NEW.resolved_tie_breaker_rule = 'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule THEN
      NEW.resolved_tie_breaker_rule := NULL;
    END IF;

    IF NEW.resolved_tie_breaker_rule IS NULL THEN
      NEW.resolved_tie_break_winner_team_id := NULL;
    END IF;
  END IF;

  IF NEW.resolved_tie_break_winner_team_id IS NOT NULL
    AND NEW.resolved_tie_break_winner_team_id != NEW.home_team_id
    AND NEW.resolved_tie_break_winner_team_id != NEW.away_team_id THEN
    RAISE EXCEPTION 'O vencedor do desempate deve ser um dos times da partida.';
  END IF;

  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NULL THEN
    RAISE EXCEPTION 'A partida não pode ter horário final sem horário inicial.';
  END IF;

  IF NEW.start_time IS NOT NULL
    AND NEW.end_time IS NOT NULL
    AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Horário final da partida deve ser maior que o horário inicial.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_mesa_match_update()
RETURNS trigger
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

CREATE OR REPLACE FUNCTION public.validate_championship_knockout_match_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_society_knockout_match BOOLEAN := false;
BEGIN
  IF NEW.status != 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championships AS championships_table
      ON championships_table.id = NEW.championship_id
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND championships_table.code = 'SOCIETY'::public.championship_code
  )
  INTO is_society_knockout_match;

  IF NEW.home_score = NEW.away_score THEN
    IF is_society_knockout_match
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

CREATE OR REPLACE FUNCTION public.propagate_championship_knockout_progress(_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_bracket_match RECORD;
  resolved_winner_team_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number
  INTO current_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = _match_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  LIMIT 1;

  IF current_bracket_match.id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN matches_table.home_score > matches_table.away_score THEN matches_table.home_team_id
      WHEN matches_table.away_score > matches_table.home_score THEN matches_table.away_team_id
      WHEN matches_table.home_score = matches_table.away_score THEN matches_table.resolved_tie_break_winner_team_id
      ELSE NULL
    END
  INTO resolved_winner_team_id
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_winner_team_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    winner_team_id = resolved_winner_team_id,
    is_bye = false
  WHERE bracket_matches_table.id = current_bracket_match.id;

  PERFORM public.ensure_championship_knockout_next_round_match(
    (
      SELECT editions_table.championship_id
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id = current_bracket_match.bracket_edition_id
      LIMIT 1
    ),
    current_bracket_match.competition_id,
    current_bracket_match.round_number,
    ((current_bracket_match.slot_number + 1) / 2)
  );

  PERFORM public.ensure_championship_knockout_third_place_match(
    (
      SELECT editions_table.championship_id
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id = current_bracket_match.bracket_edition_id
      LIMIT 1
    ),
    current_bracket_match.competition_id,
    current_bracket_match.round_number
  );

  PERFORM public.sync_championship_bracket_edition_status(current_bracket_match.bracket_edition_id);
END;
$$;

COMMENT ON FUNCTION public.propagate_championship_knockout_progress(UUID) IS
  'Atualiza o vencedor do confronto encerrado e cria a próxima rodada do mata-mata somente quando o pareamento seguinte fica realmente jogável, incluindo empates decididos por pênaltis na Society.';

CREATE OR REPLACE FUNCTION public.rebuild_standings_scope(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.standings AS standings_table
  WHERE standings_table.championship_id = _championship_id
    AND standings_table.season_year = _season_year
    AND standings_table.sport_id = _sport_id
    AND standings_table.naipe = _naipe
    AND standings_table.division IS NOT DISTINCT FROM _division;

  INSERT INTO public.standings (
    championship_id,
    season_year,
    sport_id,
    naipe,
    division,
    team_id,
    played,
    wins,
    draws,
    losses,
    goals_for,
    goals_against,
    goal_diff,
    points,
    yellow_cards,
    red_cards,
    updated_at
  )
  WITH scoped_matches AS (
    SELECT
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.division,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.home_penalty_score,
      matches_table.away_penalty_score,
      matches_table.resolved_tie_break_winner_team_id,
      championships_table.code AS championship_code,
      EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.match_id = matches_table.id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      ) AS is_knockout_match,
      GREATEST(0, COALESCE(matches_table.home_score, 0)) AS home_score,
      GREATEST(0, COALESCE(matches_table.away_score, 0)) AS away_score,
      COALESCE(championship_sports_table.result_rule, 'POINTS'::public.championship_sport_result_rule) AS result_rule,
      COALESCE(match_set_totals.home_points_total, 0)::bigint AS home_points_total,
      COALESCE(match_set_totals.away_points_total, 0)::bigint AS away_points_total,
      (COALESCE(match_set_totals.sets_count, 0) > 0) AS has_match_sets,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0)) AS home_yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0)) AS home_red_cards,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0)) AS away_yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0)) AS away_red_cards,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss
    FROM public.matches AS matches_table
    JOIN public.championships AS championships_table
      ON championships_table.id = matches_table.championship_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = matches_table.championship_id
      AND championship_sports_table.sport_id = matches_table.sport_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(match_sets_table.home_points)::bigint AS home_points_total,
        SUM(match_sets_table.away_points)::bigint AS away_points_total,
        COUNT(*)::bigint AS sets_count
      FROM public.match_sets AS match_sets_table
      WHERE match_sets_table.match_id = matches_table.id
    ) AS match_set_totals ON TRUE
    WHERE matches_table.status = 'FINISHED'::public.match_status
      AND COALESCE(matches_table.is_double_walkover, false) = false
      AND matches_table.championship_id = _championship_id
      AND matches_table.season_year = _season_year
      AND matches_table.sport_id = _sport_id
      AND matches_table.naipe = _naipe
      AND matches_table.division IS NOT DISTINCT FROM _division
  ),
  scoped_resolved AS (
    SELECT
      scoped_matches.*,
      CASE
        WHEN scoped_matches.result_rule = 'SETS'::public.championship_sport_result_rule
          AND scoped_matches.has_match_sets
        THEN scoped_matches.home_points_total
        ELSE scoped_matches.home_score
      END AS effective_home_goals,
      CASE
        WHEN scoped_matches.result_rule = 'SETS'::public.championship_sport_result_rule
          AND scoped_matches.has_match_sets
        THEN scoped_matches.away_points_total
        ELSE scoped_matches.away_score
      END AS effective_away_goals,
      CASE
        WHEN scoped_matches.home_score > scoped_matches.away_score THEN scoped_matches.home_team_id
        WHEN scoped_matches.away_score > scoped_matches.home_score THEN scoped_matches.away_team_id
        WHEN scoped_matches.championship_code = 'SOCIETY'::public.championship_code
          AND scoped_matches.is_knockout_match = true
          AND scoped_matches.home_penalty_score IS NOT NULL
          AND scoped_matches.away_penalty_score IS NOT NULL
          AND scoped_matches.home_penalty_score != scoped_matches.away_penalty_score
        THEN scoped_matches.resolved_tie_break_winner_team_id
        ELSE NULL
      END AS official_winner_team_id
    FROM scoped_matches
  ),
  standing_rows AS (
    SELECT
      scoped_resolved.championship_id,
      scoped_resolved.season_year,
      scoped_resolved.sport_id,
      scoped_resolved.naipe,
      scoped_resolved.division,
      scoped_resolved.home_team_id AS team_id,
      scoped_resolved.effective_home_goals AS goals_for,
      scoped_resolved.effective_away_goals AS goals_against,
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.official_winner_team_id IS NULL AND scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN scoped_resolved.points_win
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN scoped_resolved.points_loss
        ELSE scoped_resolved.points_draw
      END AS points,
      scoped_resolved.home_yellow_cards AS yellow_cards,
      scoped_resolved.home_red_cards AS red_cards
    FROM scoped_resolved

    UNION ALL

    SELECT
      scoped_resolved.championship_id,
      scoped_resolved.season_year,
      scoped_resolved.sport_id,
      scoped_resolved.naipe,
      scoped_resolved.division,
      scoped_resolved.away_team_id AS team_id,
      scoped_resolved.effective_away_goals AS goals_for,
      scoped_resolved.effective_home_goals AS goals_against,
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.official_winner_team_id IS NULL AND scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.away_team_id THEN scoped_resolved.points_win
        WHEN scoped_resolved.official_winner_team_id = scoped_resolved.home_team_id THEN scoped_resolved.points_loss
        ELSE scoped_resolved.points_draw
      END AS points,
      scoped_resolved.away_yellow_cards AS yellow_cards,
      scoped_resolved.away_red_cards AS red_cards
    FROM scoped_resolved
  )
  SELECT
    standing_rows.championship_id,
    standing_rows.season_year,
    standing_rows.sport_id,
    standing_rows.naipe,
    standing_rows.division,
    standing_rows.team_id,
    count(*) AS played,
    sum(standing_rows.wins) AS wins,
    sum(standing_rows.draws) AS draws,
    sum(standing_rows.losses) AS losses,
    sum(standing_rows.goals_for) AS goals_for,
    sum(standing_rows.goals_against) AS goals_against,
    sum(standing_rows.goals_for - standing_rows.goals_against) AS goal_diff,
    sum(standing_rows.points) AS points,
    sum(standing_rows.yellow_cards) AS yellow_cards,
    sum(standing_rows.red_cards) AS red_cards,
    now() AS updated_at
  FROM standing_rows
  GROUP BY
    standing_rows.championship_id,
    standing_rows.season_year,
    standing_rows.sport_id,
    standing_rows.naipe,
    standing_rows.division,
    standing_rows.team_id;
END;
$$;

COMMENT ON FUNCTION public.rebuild_standings_scope(UUID, INTEGER, UUID, public.match_naipe, public.team_division) IS
  'Recalcula classificação para um escopo específico de campeonato/temporada/modalidade/naipe/divisão. Partidas com W.O. duplo não entram no cálculo e penalties da Society valem como vitória/derrota oficial sem alterar gols e artilharia.';

CREATE OR REPLACE FUNCTION public.handle_championship_bracket_match_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  bracket_match_record RECORD;
  should_reconcile_group_competition BOOLEAN := false;
  should_propagate_knockout_progress BOOLEAN := false;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.phase
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = NEW.id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF bracket_match_record.phase = 'GROUP_STAGE'::public.bracket_phase THEN
    should_reconcile_group_competition := (
      (
        OLD.status IS DISTINCT FROM NEW.status
        AND (
          OLD.status = 'FINISHED'::public.match_status
          OR NEW.status = 'FINISHED'::public.match_status
        )
      )
      OR (
        OLD.status = 'FINISHED'::public.match_status
        AND NEW.status = 'FINISHED'::public.match_status
        AND (
          NEW.home_score IS DISTINCT FROM OLD.home_score
          OR NEW.away_score IS DISTINCT FROM OLD.away_score
          OR NEW.home_yellow_cards IS DISTINCT FROM OLD.home_yellow_cards
          OR NEW.away_yellow_cards IS DISTINCT FROM OLD.away_yellow_cards
          OR NEW.home_red_cards IS DISTINCT FROM OLD.home_red_cards
          OR NEW.away_red_cards IS DISTINCT FROM OLD.away_red_cards
          OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
          OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
          OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover
          OR NEW.is_double_walkover IS DISTINCT FROM OLD.is_double_walkover
          OR NEW.walkover_loser_team_id IS DISTINCT FROM OLD.walkover_loser_team_id
        )
      )
    );

    IF should_reconcile_group_competition THEN
      PERFORM public.generate_championship_knockout_for_competition(
        NEW.championship_id,
        bracket_match_record.competition_id,
        bracket_match_record.bracket_edition_id
      );
    END IF;

    PERFORM public.sync_championship_bracket_edition_status(bracket_match_record.bracket_edition_id);
    RETURN NEW;
  END IF;

  should_propagate_knockout_progress := (
    bracket_match_record.phase = 'KNOCKOUT'::public.bracket_phase
    AND NEW.status = 'FINISHED'::public.match_status
    AND (
      OLD.status != 'FINISHED'::public.match_status
      OR NEW.home_score IS DISTINCT FROM OLD.home_score
      OR NEW.away_score IS DISTINCT FROM OLD.away_score
      OR NEW.home_penalty_score IS DISTINCT FROM OLD.home_penalty_score
      OR NEW.away_penalty_score IS DISTINCT FROM OLD.away_penalty_score
      OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
      OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
      OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover
      OR NEW.is_double_walkover IS DISTINCT FROM OLD.is_double_walkover
      OR NEW.walkover_loser_team_id IS DISTINCT FROM OLD.walkover_loser_team_id
    )
  );

  IF should_propagate_knockout_progress THEN
    PERFORM public.propagate_championship_knockout_progress(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS handle_championship_bracket_match_finished_trigger ON public.matches;
CREATE TRIGGER handle_championship_bracket_match_finished_trigger
AFTER UPDATE OF
  status,
  home_score,
  away_score,
  home_penalty_score,
  away_penalty_score,
  home_yellow_cards,
  away_yellow_cards,
  home_red_cards,
  away_red_cards,
  resolved_tie_breaker_rule,
  resolved_tie_break_winner_team_id,
  is_walkover,
  is_double_walkover,
  walkover_loser_team_id
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.handle_championship_bracket_match_finished();

NOTIFY pgrst, 'reload schema';
