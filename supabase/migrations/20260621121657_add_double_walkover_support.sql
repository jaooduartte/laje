ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_double_walkover BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches.is_double_walkover IS
  'Indica se ambas as atléticas receberam W.O. e a partida foi encerrada sem efeito classificatório.';

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_walkover_consistency_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_walkover_consistency_check
  CHECK (
    (
      is_walkover = false
      AND is_double_walkover = false
      AND walkover_loser_team_id IS NULL
    )
    OR (
      is_walkover = true
      AND is_double_walkover = false
      AND walkover_loser_team_id IS NOT NULL
      AND walkover_loser_team_id IN (home_team_id, away_team_id)
    )
    OR (
      is_walkover = true
      AND is_double_walkover = true
      AND walkover_loser_team_id IS NULL
    )
  );

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
SET search_path = public
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
      END AS effective_away_goals
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
      CASE WHEN scoped_resolved.home_score > scoped_resolved.away_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.home_score < scoped_resolved.away_score THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.home_score > scoped_resolved.away_score THEN scoped_resolved.points_win
        WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN scoped_resolved.points_draw
        ELSE scoped_resolved.points_loss
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
      CASE WHEN scoped_resolved.away_score > scoped_resolved.home_score THEN 1 ELSE 0 END AS wins,
      CASE WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN 1 ELSE 0 END AS draws,
      CASE WHEN scoped_resolved.away_score < scoped_resolved.home_score THEN 1 ELSE 0 END AS losses,
      CASE
        WHEN scoped_resolved.away_score > scoped_resolved.home_score THEN scoped_resolved.points_win
        WHEN scoped_resolved.home_score = scoped_resolved.away_score THEN scoped_resolved.points_draw
        ELSE scoped_resolved.points_loss
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
  'Recalcula classificação para um escopo específico de campeonato/temporada/modalidade/naipe/divisão. Partidas com W.O. duplo não entram no cálculo.';

CREATE OR REPLACE FUNCTION public.handle_championship_bracket_match_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  bracket_match_record RECORD;
  should_reconcile_group_competition BOOLEAN := false;
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

  IF bracket_match_record.phase = 'KNOCKOUT'::public.bracket_phase
    AND NEW.status = 'FINISHED'::public.match_status
    AND OLD.status != 'FINISHED'::public.match_status THEN
    PERFORM public.propagate_championship_knockout_progress(NEW.id);
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS handle_championship_bracket_match_finished_trigger ON public.matches;
CREATE TRIGGER handle_championship_bracket_match_finished_trigger
AFTER UPDATE OF
  status,
  home_score,
  away_score,
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
