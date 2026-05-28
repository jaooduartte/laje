-- Suprime contextos do tipo QUALIFICATION_POOL da função
-- get_championship_bracket_pending_tie_breaks quando o bracket KO já foi
-- gerado para a competição. Uma vez que o bracket existe, as decisões de
-- seeding e vagas já foram tomadas — não há ação possível nem necessária.

CREATE OR REPLACE FUNCTION public.get_championship_bracket_pending_tie_breaks(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH pending_contexts AS (
    SELECT contexts_table.*
    FROM public.get_championship_bracket_tie_break_contexts(
      _championship_id,
      NULL,
      _bracket_edition_id
    ) AS contexts_table
    WHERE contexts_table.is_resolved = false
      AND COALESCE(cardinality(contexts_table.team_ids), 0) >= 2
      -- Suprime QUALIFICATION_POOL quando o bracket KO já foi gerado
      AND NOT (
        contexts_table.context_type = 'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type
        AND EXISTS (
          SELECT 1 FROM public.championship_bracket_matches AS ko_check
          WHERE ko_check.competition_id = contexts_table.competition_id
            AND ko_check.phase = 'KNOCKOUT'::public.bracket_phase
        )
      )
  ),
  competition_rules AS (
    SELECT
      competitions_table.id AS competition_id,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN (
      SELECT DISTINCT pending_contexts.competition_id
      FROM pending_contexts
    ) AS pending_competitions
      ON pending_competitions.competition_id = competitions_table.id
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = editions_table.championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
  ),
  group_rankings AS (
    SELECT
      competition_scope.competition_id,
      ranking_rows.group_id,
      ranking_rows.team_id,
      ranking_rows.points::numeric AS points,
      ranking_rows.wins::numeric AS wins,
      ranking_rows.goal_diff::numeric AS goal_diff,
      ranking_rows.goals_for::numeric AS goals_for,
      CASE
        WHEN (ranking_rows.goals_for - ranking_rows.goal_diff) = 0 THEN
          CASE
            WHEN ranking_rows.goals_for = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE ranking_rows.goals_for::numeric / (ranking_rows.goals_for - ranking_rows.goal_diff)::numeric
      END AS points_average
    FROM (
      SELECT DISTINCT pending_contexts.competition_id
      FROM pending_contexts
      WHERE pending_contexts.context_type = 'GROUP'::public.championship_bracket_tie_break_context_type
    ) AS competition_scope
    CROSS JOIN LATERAL public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      competition_scope.competition_id
    ) AS ranking_rows
  ),
  qualification_pool_rankings AS (
    SELECT
      competition_scope.competition_id,
      ranking_rows.qualification_rank,
      ranking_rows.team_id,
      (ranking_rows.points::numeric / 1000000::numeric) AS points,
      ranking_rows.wins::numeric AS wins,
      ranking_rows.goal_diff::numeric AS goal_diff,
      ranking_rows.goals_for::numeric AS goals_for
    FROM (
      SELECT DISTINCT pending_contexts.competition_id
      FROM pending_contexts
      WHERE pending_contexts.context_type = 'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type
    ) AS competition_scope
    CROSS JOIN LATERAL public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      competition_scope.competition_id
    ) AS ranking_rows
  ),
  validated_pending_contexts AS (
    SELECT current_context.*
    FROM pending_contexts AS current_context
    JOIN competition_rules
      ON competition_rules.competition_id = current_context.competition_id
    WHERE (
      current_context.context_type = 'GROUP'::public.championship_bracket_tie_break_context_type
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT
            count(DISTINCT group_rankings.team_id) AS tied_teams_count,
            min(group_rankings.points) AS min_points,
            max(group_rankings.points) AS max_points,
            min(group_rankings.wins) AS min_wins,
            max(group_rankings.wins) AS max_wins,
            min(group_rankings.goal_diff) AS min_goal_diff,
            max(group_rankings.goal_diff) AS max_goal_diff,
            min(group_rankings.goals_for) AS min_goals_for,
            max(group_rankings.goals_for) AS max_goals_for,
            min(group_rankings.points_average) AS min_points_average,
            max(group_rankings.points_average) AS max_points_average
          FROM group_rankings
          WHERE group_rankings.competition_id = current_context.competition_id
            AND group_rankings.group_id = current_context.group_id
            AND group_rankings.team_id = ANY(current_context.team_ids)
        ) AS grouped_metrics
        WHERE grouped_metrics.tied_teams_count = cardinality(current_context.team_ids)
          AND grouped_metrics.min_points = grouped_metrics.max_points
          AND grouped_metrics.min_goal_diff = grouped_metrics.max_goal_diff
          AND grouped_metrics.min_goals_for = grouped_metrics.max_goals_for
          AND (
            competition_rules.tie_breaker_rule <> 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            OR grouped_metrics.min_points_average = grouped_metrics.max_points_average
          )
          AND (
            competition_rules.tie_breaker_rule NOT IN (
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            )
            OR grouped_metrics.min_wins = grouped_metrics.max_wins
          )
      )
    ) OR (
      current_context.context_type = 'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type
      AND EXISTS (
        SELECT 1
        FROM (
          SELECT
            count(DISTINCT qualification_pool_rankings.team_id) AS tied_teams_count,
            min(qualification_pool_rankings.points) AS min_points,
            max(qualification_pool_rankings.points) AS max_points,
            min(qualification_pool_rankings.wins) AS min_wins,
            max(qualification_pool_rankings.wins) AS max_wins,
            min(qualification_pool_rankings.goal_diff) AS min_goal_diff,
            max(qualification_pool_rankings.goal_diff) AS max_goal_diff,
            min(qualification_pool_rankings.goals_for) AS min_goals_for,
            max(qualification_pool_rankings.goals_for) AS max_goals_for
          FROM qualification_pool_rankings
          WHERE qualification_pool_rankings.competition_id = current_context.competition_id
            AND qualification_pool_rankings.qualification_rank = current_context.qualification_rank
            AND qualification_pool_rankings.team_id = ANY(current_context.team_ids)
        ) AS qualification_metrics
        WHERE qualification_metrics.tied_teams_count = cardinality(current_context.team_ids)
          AND qualification_metrics.min_points = qualification_metrics.max_points
          AND qualification_metrics.min_goal_diff = qualification_metrics.max_goal_diff
          AND qualification_metrics.min_goals_for = qualification_metrics.max_goals_for
          AND (
            competition_rules.tie_breaker_rule NOT IN (
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            )
            OR qualification_metrics.min_wins = qualification_metrics.max_wins
          )
      )
    )
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'context_key', contexts_table.context_key,
        'competition_id', contexts_table.competition_id,
        'sport_name', contexts_table.sport_name,
        'naipe', contexts_table.naipe,
        'division', contexts_table.division,
        'context_type', contexts_table.context_type,
        'group_id', contexts_table.group_id,
        'group_number', contexts_table.group_number,
        'qualification_rank', contexts_table.qualification_rank,
        'title', contexts_table.title,
        'description', contexts_table.description,
        'teams',
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'team_id', team_rows.team_id,
                'team_name', team_rows.team_name
              )
              ORDER BY team_rows.team_name ASC
            ),
            '[]'::jsonb
          )
          FROM unnest(contexts_table.team_ids, contexts_table.team_names) AS team_rows(team_id, team_name)
        )
      )
      ORDER BY
        CASE contexts_table.context_type
          WHEN 'GROUP'::public.championship_bracket_tie_break_context_type THEN 1
          ELSE 2
        END,
        contexts_table.sport_name ASC,
        contexts_table.naipe ASC,
        contexts_table.group_number ASC NULLS FIRST,
        contexts_table.qualification_rank ASC NULLS FIRST
    ),
    '[]'::jsonb
  )
  FROM validated_pending_contexts AS contexts_table;
$func$;

COMMENT ON FUNCTION public.get_championship_bracket_pending_tie_breaks(UUID, UUID)
IS 'Retorna desempates pendentes genuínos. Contextos QUALIFICATION_POOL são suprimidos quando o bracket KO já foi gerado para a competição.';

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_pending_tie_breaks(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
