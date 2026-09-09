DO $$
DECLARE
  function_definition TEXT;
  patched_definition TEXT;
  return_fragment TEXT := 'points bigint, yellow_cards bigint';
  replacement_return_fragment TEXT := 'points bigint, comparison_points numeric, yellow_cards bigint';
  comparison_fragment TEXT := $fragment$  ), comparison_rows AS (
    SELECT
      ranked_groups.*,
      GREATEST(MAX(ranked_groups.group_size - 1) OVER (PARTITION BY ranked_groups.competition_id), 1)::numeric AS maximum_group_matches
    FROM ranked_groups
  ), ranked_comparisons AS (
    SELECT
      comparison_rows.*,
      ROW_NUMBER() OVER (
        PARTITION BY comparison_rows.competition_id, comparison_rows.group_rank
        ORDER BY
          (comparison_rows.points::numeric * comparison_rows.maximum_group_matches / GREATEST(comparison_rows.group_size - 1, 1)) DESC,
          (comparison_rows.wins::numeric * comparison_rows.maximum_group_matches / GREATEST(comparison_rows.group_size - 1, 1)) DESC,
          (comparison_rows.goal_diff::numeric * comparison_rows.maximum_group_matches / GREATEST(comparison_rows.group_size - 1, 1)) DESC,
          (comparison_rows.goals_for::numeric * comparison_rows.maximum_group_matches / GREATEST(comparison_rows.group_size - 1, 1)) DESC,
          (comparison_rows.yellow_cards::numeric * comparison_rows.maximum_group_matches / GREATEST(comparison_rows.group_size - 1, 1)) ASC,
          (comparison_rows.red_cards::numeric * comparison_rows.maximum_group_matches / GREATEST(comparison_rows.group_size - 1, 1)) ASC,
          comparison_rows.team_name
      )::integer AS comparison_rank
    FROM comparison_rows
  )$fragment$;
  replacement_comparison_fragment TEXT := $fragment$  ), comparison_rows AS (
    SELECT
      ranked_groups.*,
      GREATEST(MAX(ranked_groups.group_size - 1) OVER (PARTITION BY ranked_groups.competition_id), 1)::numeric AS maximum_group_matches,
      MIN(ranked_groups.group_size) OVER (PARTITION BY ranked_groups.competition_id)
        IS DISTINCT FROM MAX(ranked_groups.group_size) OVER (PARTITION BY ranked_groups.competition_id)
        AS uses_proportional_points
    FROM ranked_groups
  ), compared_points AS (
    SELECT
      comparison_rows.*,
      CASE
        WHEN comparison_rows.uses_proportional_points THEN
          comparison_rows.points::numeric
          * comparison_rows.maximum_group_matches
          / GREATEST(comparison_rows.group_size - 1, 1)
        ELSE comparison_rows.points::numeric
      END AS comparison_points
    FROM comparison_rows
  ), ranked_comparisons AS (
    SELECT
      compared_points.*,
      ROW_NUMBER() OVER (
        PARTITION BY compared_points.competition_id, compared_points.group_rank
        ORDER BY
          compared_points.comparison_points DESC,
          CASE
            WHEN compared_points.uses_proportional_points THEN NULL::bigint
            WHEN compared_points.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN compared_points.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN compared_points.uses_proportional_points THEN NULL::numeric
            WHEN compared_points.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
              AND compared_points.goals_against > 0
            THEN compared_points.goals_for::numeric / compared_points.goals_against
            ELSE NULL::numeric
          END DESC NULLS LAST,
          compared_points.goal_diff DESC,
          compared_points.goals_for DESC,
          CASE
            WHEN compared_points.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
            THEN compared_points.goals_against
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN compared_points.uses_proportional_points THEN NULL::bigint
            WHEN compared_points.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
            THEN compared_points.blue_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN compared_points.uses_proportional_points THEN NULL::bigint
            WHEN compared_points.tie_breaker_rule = 'HANDEBOL'::public.championship_sport_tie_breaker_rule
            THEN compared_points.two_minute_penalties
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN compared_points.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
            ) THEN compared_points.yellow_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN compared_points.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule,
              'FUTEBOL_SOCIETY'::public.championship_sport_tie_breaker_rule
            ) THEN compared_points.red_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          compared_points.team_name
      )::integer AS comparison_rank
    FROM compared_points
  )$fragment$;
  select_fragment TEXT := 'ranked_comparisons.goal_diff, ranked_comparisons.points, ranked_comparisons.yellow_cards,';
  replacement_select_fragment TEXT := 'ranked_comparisons.goal_diff, ranked_comparisons.points, ranked_comparisons.comparison_points, ranked_comparisons.yellow_cards,';
BEGIN
  SELECT pg_get_functiondef(functions_table.oid)
  INTO function_definition
  FROM pg_proc AS functions_table
  JOIN pg_namespace AS namespaces_table
    ON namespaces_table.oid = functions_table.pronamespace
  WHERE namespaces_table.nspname = 'public'
    AND functions_table.proname = 'get_championship_group_stage_standings'
    AND pg_get_function_identity_arguments(functions_table.oid) =
      '_championship_id uuid, _season_year integer';

  IF function_definition IS NULL
    OR position(return_fragment IN function_definition) = 0
    OR position(comparison_fragment IN function_definition) = 0
    OR position(select_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A função de classificação da fase de grupos não possui a estrutura esperada para corrigir a comparação entre grupos.';
  END IF;

  patched_definition := replace(
    replace(
      replace(
        function_definition,
        return_fragment,
        replacement_return_fragment
      ),
      comparison_fragment,
      replacement_comparison_fragment
    ),
    select_fragment,
    replacement_select_fragment
  );

  EXECUTE 'DROP FUNCTION public.get_championship_group_stage_standings(UUID, INTEGER)';
  EXECUTE patched_definition;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_group_stage_standings(UUID, INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
