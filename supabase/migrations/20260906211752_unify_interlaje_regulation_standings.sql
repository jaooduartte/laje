CREATE OR REPLACE FUNCTION public.get_interlaje_regulation_competition_standings(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division DEFAULT NULL
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  division public.team_division,
  played INTEGER,
  wins INTEGER,
  draws INTEGER,
  losses INTEGER,
  goals_for INTEGER,
  goals_against INTEGER,
  goal_diff INTEGER,
  points NUMERIC,
  yellow_cards INTEGER,
  red_cards INTEGER,
  blue_cards INTEGER,
  two_minute_penalties INTEGER,
  final_position INTEGER,
  placement_points INTEGER,
  placement_status TEXT,
  placement_basis TEXT,
  sets_for INTEGER,
  sets_against INTEGER,
  rally_points_for INTEGER,
  rally_points_against INTEGER,
  has_pending_tie_break BOOLEAN,
  classification_policy JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH policy AS (
    SELECT public.get_interlaje_classification_policy(_championship_id, _sport_id) AS value
  ), collective_ranked AS (
    SELECT
      ranking.*,
      BOOL_OR(ranking.played > 0) OVER (
        PARTITION BY ranking.division
      ) AS has_completed_result,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        _season_year,
        _sport_id,
        _naipe,
        ranking.division,
        ranking.team_id
      ) AS is_disqualified
    FROM policy
    CROSS JOIN LATERAL public.get_interlaje_collective_ranking(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division
    ) AS ranking
    WHERE policy.value ->> 'mode' = 'COLLECTIVE'
  ), ranking_payload AS (
    SELECT
      collective_ranked.division,
      jsonb_agg(
        jsonb_build_object(
          'team_id', collective_ranked.team_id,
          'final_position', collective_ranked.classification_rank
        )
        ORDER BY collective_ranked.classification_rank
      ) AS ranked_teams,
      BOOL_OR(collective_ranked.has_pending_tie_break) AS has_pending_tie_break
    FROM collective_ranked
    GROUP BY collective_ranked.division
  ), competition_context AS (
    SELECT
      competitions_table.id AS competition_id,
      competitions_table.division,
      COALESCE(
        BOOL_AND(
          group_matches_table.match_id IS NOT NULL
          AND matches_table.status = 'FINISHED'::public.match_status
        ),
        false
      ) AS is_group_stage_finished
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_bracket_matches AS group_matches_table
      ON group_matches_table.competition_id = competitions_table.id
      AND group_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = group_matches_table.match_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND (
        _division IS NULL
        OR competitions_table.division IS NOT DISTINCT FROM _division
      )
    GROUP BY competitions_table.id, competitions_table.division
  ), knockout_placements AS (
    SELECT projected_placements.*
    FROM competition_context
    JOIN ranking_payload
      ON ranking_payload.division IS NOT DISTINCT FROM competition_context.division
    CROSS JOIN LATERAL public.get_interlaje_knockout_projected_placements(
      competition_context.competition_id,
      ranking_payload.ranked_teams
    ) AS projected_placements
    WHERE ranking_payload.has_pending_tie_break = false
  ), collective AS (
    SELECT
      ranking.team_id,
      ranking.team_name,
      ranking.division,
      ranking.played,
      ranking.wins,
      ranking.draws,
      ranking.losses,
      ranking.goals_for,
      ranking.goals_against,
      ranking.goal_diff,
      ranking.points,
      ranking.yellow_cards,
      ranking.red_cards,
      ranking.blue_cards,
      ranking.two_minute_penalties,
      COALESCE(knockout_placements.final_position, ranking.classification_rank) AS final_position,
      CASE
        WHEN ranking.is_disqualified OR NOT ranking.has_completed_result THEN 0
        ELSE COALESCE(settings_table.points, 0)
      END::integer AS placement_points,
      CASE
        WHEN ranking.has_pending_tie_break THEN 'PENDING_TIE_BREAK'
        WHEN knockout_placements.placement_status IS NOT NULL THEN knockout_placements.placement_status
        WHEN competition_context.competition_id IS NULL THEN 'CONFIRMED'
        WHEN competition_context.is_group_stage_finished THEN 'CONFIRMED'
        ELSE 'PROJECTED'
      END AS placement_status,
      COALESCE(knockout_placements.placement_basis, 'GROUP_STAGE') AS placement_basis,
      ranking.sets_for,
      ranking.sets_against,
      ranking.rally_points_for,
      ranking.rally_points_against,
      ranking.has_pending_tie_break,
      policy.value AS classification_policy
    FROM policy
    JOIN collective_ranked AS ranking ON true
    LEFT JOIN competition_context
      ON competition_context.division IS NOT DISTINCT FROM ranking.division
    LEFT JOIN knockout_placements
      ON knockout_placements.team_id = ranking.team_id
    LEFT JOIN public.championship_overall_position_point_settings AS settings_table
      ON settings_table.championship_id = _championship_id
      AND settings_table.season_year = _season_year
      AND settings_table.final_position = COALESCE(
        knockout_placements.final_position,
        ranking.classification_rank
      )
  ), individual AS (
    SELECT
      standings.team_id,
      standings.team_name,
      standings.division,
      standings.played,
      standings.wins,
      standings.draws,
      standings.losses,
      standings.goals_for,
      standings.goals_against,
      standings.goal_diff,
      standings.points,
      standings.yellow_cards,
      standings.red_cards,
      standings.blue_cards,
      standings.two_minute_penalties,
      standings.final_position,
      standings.placement_points::integer,
      standings.placement_status,
      standings.placement_basis,
      0::integer,
      0::integer,
      0::integer,
      0::integer,
      false,
      policy.value
    FROM policy
    CROSS JOIN LATERAL public.get_interlaje_competition_standings(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division
    ) AS standings
    WHERE policy.value ->> 'mode' = 'INDIVIDUAL'
  )
  SELECT * FROM collective
  UNION ALL
  SELECT * FROM individual
  ORDER BY final_position, team_id;
$$;

CREATE OR REPLACE FUNCTION public.get_interlaje_overall_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  placement_points NUMERIC,
  confirmed_placement_points NUMERIC,
  projected_placement_points NUMERIC,
  opening_bonus_points NUMERIC,
  walkover_count INTEGER,
  walkover_penalty_points NUMERIC,
  overall_points NUMERIC,
  confirmed_competitions_count INTEGER,
  has_projected_placement_points BOOLEAN,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH participating_teams AS (
    SELECT DISTINCT registrations_table.team_id
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
  ), competition_contexts AS (
    SELECT DISTINCT standings_table.sport_id, standings_table.naipe, standings_table.division
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      NULL,
      NULL,
      NULL
    ) AS standings_table
  ), competition_points AS (
    SELECT
      standings_table.team_id,
      standings_table.placement_points,
      standings_table.placement_status
    FROM competition_contexts
    CROSS JOIN LATERAL public.get_interlaje_regulation_competition_standings(
      _championship_id,
      _season_year,
      competition_contexts.sport_id,
      competition_contexts.naipe,
      competition_contexts.division
    ) AS standings_table
  ), placement_totals AS (
    SELECT
      competition_points.team_id,
      COALESCE(SUM(competition_points.placement_points), 0) AS placement_points,
      COALESCE(
        SUM(competition_points.placement_points)
          FILTER (WHERE competition_points.placement_status = 'CONFIRMED'),
        0
      ) AS confirmed_placement_points,
      COALESCE(
        SUM(competition_points.placement_points)
          FILTER (WHERE competition_points.placement_status = 'PROJECTED'),
        0
      ) AS projected_placement_points,
      COUNT(*) FILTER (
        WHERE competition_points.placement_status = 'CONFIRMED'
      )::INTEGER AS confirmed_competitions_count,
      COALESCE(
        BOOL_OR(competition_points.placement_status = 'PROJECTED'),
        false
      ) AS has_projected_placement_points
    FROM competition_points
    GROUP BY competition_points.team_id
  ), opening_totals AS (
    SELECT
      adjustments_table.team_id,
      COALESCE(SUM(adjustments_table.points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments AS adjustments_table
    WHERE adjustments_table.championship_id = _championship_id
      AND adjustments_table.season_year = _season_year
      AND adjustments_table.adjustment_type = 'OPENING_CEREMONY'
    GROUP BY adjustments_table.team_id
  ), walkover_totals AS (
    SELECT
      counts_table.team_id,
      SUM(counts_table.walkover_count)::INTEGER AS walkover_count,
      COALESCE(SUM(counts_table.walkover_count * settings_table.points), 0) AS walkover_penalty_points
    FROM public.championship_walkover_penalty_counts AS counts_table
    JOIN public.championship_walkover_penalty_settings AS settings_table
      ON settings_table.championship_id = counts_table.championship_id
      AND settings_table.season_year = counts_table.season_year
    WHERE counts_table.championship_id = _championship_id
      AND counts_table.season_year = _season_year
    GROUP BY counts_table.team_id
  ), totals AS (
    SELECT
      teams_table.id AS team_id,
      teams_table.name AS team_name,
      COALESCE(placement_totals.placement_points, 0) AS placement_points,
      COALESCE(placement_totals.confirmed_placement_points, 0) AS confirmed_placement_points,
      COALESCE(placement_totals.projected_placement_points, 0) AS projected_placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(walkover_totals.walkover_count, 0)::INTEGER AS walkover_count,
      COALESCE(walkover_totals.walkover_penalty_points, 0) AS walkover_penalty_points,
      COALESCE(placement_totals.placement_points, 0)
        + COALESCE(opening_totals.opening_bonus_points, 0)
        - COALESCE(walkover_totals.walkover_penalty_points, 0) AS overall_points,
      COALESCE(placement_totals.confirmed_competitions_count, 0) AS confirmed_competitions_count,
      COALESCE(placement_totals.has_projected_placement_points, false) AS has_projected_placement_points
    FROM participating_teams
    JOIN public.teams AS teams_table ON teams_table.id = participating_teams.team_id
    LEFT JOIN placement_totals ON placement_totals.team_id = teams_table.id
    LEFT JOIN opening_totals ON opening_totals.team_id = teams_table.id
    LEFT JOIN walkover_totals ON walkover_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
  ), tie_groups AS (
    SELECT totals_table.overall_points
    FROM totals AS totals_table
    WHERE totals_table.overall_points > 0
    GROUP BY totals_table.overall_points
    HAVING COUNT(*) > 1
  ), resolved_ties AS (
    SELECT
      resolutions_table.points_total,
      resolution_teams_table.team_id,
      resolution_teams_table.draw_order
    FROM public.championship_overall_tie_break_resolutions AS resolutions_table
    JOIN public.championship_overall_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
    WHERE resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
  )
  SELECT
    totals.team_id,
    totals.team_name,
    totals.placement_points,
    totals.confirmed_placement_points,
    totals.projected_placement_points,
    totals.opening_bonus_points,
    totals.walkover_count,
    totals.walkover_penalty_points,
    totals.overall_points,
    totals.confirmed_competitions_count,
    totals.has_projected_placement_points,
    EXISTS (
      SELECT 1
      FROM tie_groups
      WHERE tie_groups.overall_points = totals.overall_points
        AND NOT EXISTS (
          SELECT 1
          FROM resolved_ties
          WHERE resolved_ties.points_total = totals.overall_points
            AND resolved_ties.team_id = totals.team_id
        )
    ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties
    ON resolved_ties.team_id = totals.team_id
    AND resolved_ties.points_total = totals.overall_points
  ORDER BY totals.overall_points DESC, resolved_ties.draw_order ASC NULLS LAST, totals.team_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_regulation_competition_standings(UUID, INTEGER, UUID, public.match_naipe, public.team_division)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
