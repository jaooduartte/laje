CREATE OR REPLACE FUNCTION public.get_interlaje_overall_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  placement_points NUMERIC,
  opening_bonus_points NUMERIC,
  overall_points NUMERIC,
  confirmed_competitions_count INTEGER,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH participating_teams AS (
    SELECT DISTINCT registrations_table.team_id
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
  ),
  effective_competition_points AS (
    SELECT
      standings_table.team_id,
      COALESCE(SUM(standings_table.points), 0) AS competition_points,
      COUNT(DISTINCT (
        standings_table.sport_id,
        standings_table.naipe,
        standings_table.division
      ))::INTEGER AS competitions_count
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      NULL,
      NULL,
      NULL
    ) AS standings_table
    GROUP BY standings_table.team_id
  ),
  corrected_group_adjustments AS (
    SELECT
      corrected_group_standings_table.team_id,
      COALESCE(
        SUM(
          corrected_group_standings_table.corrected_points
          - corrected_group_standings_table.points_base
        ),
        0
      ) AS points_adjustment
    FROM public.get_championship_corrected_group_standings(
      _championship_id,
      _season_year
    ) AS corrected_group_standings_table
    GROUP BY corrected_group_standings_table.team_id
  ),
  live_competition_points AS (
    SELECT
      effective_competition_points.team_id,
      effective_competition_points.competition_points
        + COALESCE(corrected_group_adjustments.points_adjustment, 0)
        AS competition_points,
      effective_competition_points.competitions_count
    FROM effective_competition_points
    LEFT JOIN corrected_group_adjustments
      ON corrected_group_adjustments.team_id = effective_competition_points.team_id
  ),
  opening_totals AS (
    SELECT
      adjustments_table.team_id,
      COALESCE(SUM(adjustments_table.points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments AS adjustments_table
    WHERE adjustments_table.championship_id = _championship_id
      AND adjustments_table.season_year = _season_year
      AND adjustments_table.adjustment_type = 'OPENING_CEREMONY'
    GROUP BY adjustments_table.team_id
  ),
  totals AS (
    SELECT
      teams_table.id AS team_id,
      teams_table.name AS team_name,
      COALESCE(live_competition_points.competition_points, 0) AS placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(live_competition_points.competition_points, 0)
        + COALESCE(opening_totals.opening_bonus_points, 0) AS overall_points,
      COALESCE(live_competition_points.competitions_count, 0) AS confirmed_competitions_count
    FROM participating_teams
    JOIN public.teams AS teams_table
      ON teams_table.id = participating_teams.team_id
    LEFT JOIN live_competition_points
      ON live_competition_points.team_id = teams_table.id
    LEFT JOIN opening_totals
      ON opening_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
  ),
  tie_groups AS (
    SELECT
      totals_table.overall_points,
      ARRAY_AGG(totals_table.team_id ORDER BY totals_table.team_id::TEXT) AS team_ids
    FROM totals AS totals_table
    WHERE totals_table.overall_points > 0
    GROUP BY totals_table.overall_points
    HAVING COUNT(*) > 1
  ),
  resolved_ties AS (
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
    totals.opening_bonus_points,
    totals.overall_points,
    totals.confirmed_competitions_count,
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
  ORDER BY
    totals.overall_points DESC,
    resolved_ties.draw_order ASC NULLS LAST,
    totals.team_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER)
  TO anon, authenticated;
