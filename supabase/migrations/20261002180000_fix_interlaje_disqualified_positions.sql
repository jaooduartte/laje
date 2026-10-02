-- LAJE-138
-- Mantém atléticas desclassificadas visíveis e com 0 ponto, sem consumir
-- posições válidas da classificação da modalidade. A classificação geral
-- passa a somar os pontos já normalizados por modalidade.

CREATE OR REPLACE FUNCTION public.get_interlaje_regulation_competition_standings_effective(
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
AS $function$
  WITH base AS (
    SELECT
      standings_table.*,
      public.is_championship_competition_team_disqualified(
        _championship_id,
        _season_year,
        _sport_id,
        _naipe,
        standings_table.division,
        standings_table.team_id
      ) AS is_disqualified
    FROM public.get_interlaje_regulation_competition_standings(
      _championship_id,
      _season_year,
      _sport_id,
      _naipe,
      _division
    ) AS standings_table
  ), normalized AS (
    SELECT
      base.*,
      ROW_NUMBER() OVER (
        PARTITION BY base.division
        ORDER BY
          base.is_disqualified ASC,
          base.final_position ASC NULLS LAST,
          base.team_id ASC
      )::INTEGER AS effective_final_position
    FROM base
  )
  SELECT
    normalized.team_id,
    normalized.team_name,
    normalized.division,
    normalized.played,
    normalized.wins,
    normalized.draws,
    normalized.losses,
    normalized.goals_for,
    normalized.goals_against,
    normalized.goal_diff,
    normalized.points,
    normalized.yellow_cards,
    normalized.red_cards,
    normalized.blue_cards,
    normalized.two_minute_penalties,
    normalized.effective_final_position AS final_position,
    CASE
      WHEN normalized.is_disqualified OR normalized.placement_points = 0 THEN 0
      ELSE COALESCE(position_points.points, 0)
    END::INTEGER AS placement_points,
    normalized.placement_status,
    normalized.placement_basis,
    normalized.sets_for,
    normalized.sets_against,
    normalized.rally_points_for,
    normalized.rally_points_against,
    normalized.has_pending_tie_break,
    CASE
      WHEN normalized.classification_policy IS NULL THEN NULL
      ELSE jsonb_set(
        normalized.classification_policy,
        '{placement_context,final_position}',
        to_jsonb(normalized.effective_final_position),
        true
      )
    END AS classification_policy
  FROM normalized
  LEFT JOIN public.championship_overall_position_point_settings AS position_points
    ON position_points.championship_id = _championship_id
    AND position_points.season_year = _season_year
    AND position_points.final_position = normalized.effective_final_position
  ORDER BY normalized.effective_final_position, normalized.team_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_regulation_competition_standings_effective(
  UUID,
  INTEGER,
  UUID,
  public.match_naipe,
  public.team_division
) TO anon, authenticated;

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
SET statement_timeout = '4s'
AS $function$
  WITH participating_teams AS (
    SELECT DISTINCT registrations_table.team_id
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
  ), competition_contexts AS (
    SELECT DISTINCT
      standings_table.sport_id,
      standings_table.naipe,
      standings_table.division
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
      standings_table.placement_status,
      standings_table.has_pending_tie_break
    FROM competition_contexts
    CROSS JOIN LATERAL public.get_interlaje_regulation_competition_standings_effective(
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
      ) AS has_projected_placement_points,
      COALESCE(
        BOOL_OR(
          competition_points.placement_status = 'PENDING_TIE_BREAK'
          OR competition_points.has_pending_tie_break
        ),
        false
      ) AS has_competition_pending_tie_break
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
      COALESCE(placement_totals.has_projected_placement_points, false) AS has_projected_placement_points,
      COALESCE(placement_totals.has_competition_pending_tie_break, false) AS has_competition_pending_tie_break
    FROM participating_teams
    JOIN public.teams AS teams_table
      ON teams_table.id = participating_teams.team_id
    LEFT JOIN placement_totals
      ON placement_totals.team_id = teams_table.id
    LEFT JOIN opening_totals
      ON opening_totals.team_id = teams_table.id
    LEFT JOIN walkover_totals
      ON walkover_totals.team_id = teams_table.id
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
    totals.has_competition_pending_tie_break
      OR EXISTS (
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
$function$;
