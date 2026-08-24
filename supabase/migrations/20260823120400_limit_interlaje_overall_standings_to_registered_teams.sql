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
  automatic_placements AS (
    SELECT * FROM public.get_interlaje_auto_knockout_placements(_championship_id, _season_year)
  ),
  official_placements AS (
    SELECT sport_id, naipe, division, team_id, final_position FROM automatic_placements
    UNION ALL
    SELECT placements_table.sport_id, placements_table.naipe, placements_table.division,
      placements_table.team_id, placements_table.final_position
    FROM public.championship_overall_competition_placements AS placements_table
    WHERE placements_table.championship_id = _championship_id AND placements_table.season_year = _season_year
      AND NOT EXISTS (
        SELECT 1 FROM automatic_placements
        WHERE automatic_placements.sport_id = placements_table.sport_id
          AND automatic_placements.naipe = placements_table.naipe
          AND automatic_placements.division IS NOT DISTINCT FROM placements_table.division
          AND automatic_placements.team_id = placements_table.team_id
      )
  ),
  placement_totals AS (
    SELECT team_id, COALESCE(sum(public.resolve_interlaje_position_points(final_position)), 0) AS placement_points,
      count(*)::integer AS confirmed_competitions_count
    FROM official_placements GROUP BY team_id
  ),
  opening_totals AS (
    SELECT team_id, COALESCE(sum(points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments
    WHERE championship_id = _championship_id AND season_year = _season_year AND adjustment_type = 'OPENING_CEREMONY'
    GROUP BY team_id
  ),
  totals AS (
    SELECT teams_table.id AS team_id, teams_table.name AS team_name,
      COALESCE(placement_totals.placement_points, 0) AS placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(placement_totals.placement_points, 0) + COALESCE(opening_totals.opening_bonus_points, 0) AS overall_points,
      COALESCE(placement_totals.confirmed_competitions_count, 0) AS confirmed_competitions_count
    FROM participating_teams
    JOIN public.teams AS teams_table ON teams_table.id = participating_teams.team_id
    LEFT JOIN placement_totals ON placement_totals.team_id = teams_table.id
    LEFT JOIN opening_totals ON opening_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
  ),
  tie_groups AS (
    SELECT overall_points, array_agg(team_id ORDER BY team_id::text) AS team_ids
    FROM totals
    WHERE overall_points > 0
    GROUP BY overall_points
    HAVING count(*) > 1
  ),
  resolved_ties AS (
    SELECT resolutions_table.points_total, resolution_teams_table.team_id, resolution_teams_table.draw_order
    FROM public.championship_overall_tie_break_resolutions AS resolutions_table
    JOIN public.championship_overall_tie_break_resolution_teams AS resolution_teams_table ON resolution_teams_table.resolution_id = resolutions_table.id
    WHERE resolutions_table.championship_id = _championship_id AND resolutions_table.season_year = _season_year
  )
  SELECT totals.team_id, totals.team_name, totals.placement_points, totals.opening_bonus_points,
    totals.overall_points, totals.confirmed_competitions_count,
    EXISTS (
      SELECT 1 FROM tie_groups
      WHERE tie_groups.overall_points = totals.overall_points
        AND NOT EXISTS (
          SELECT 1 FROM resolved_ties
          WHERE resolved_ties.points_total = totals.overall_points AND resolved_ties.team_id = totals.team_id
        )
    ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties ON resolved_ties.points_total = totals.overall_points AND resolved_ties.team_id = totals.team_id
  ORDER BY totals.overall_points DESC, resolved_ties.draw_order ASC NULLS LAST, totals.team_name ASC;
$$;
