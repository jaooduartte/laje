-- migration: 20260426120000_enable_draws_for_overall_seeding.sql

-- 1. Atualiza get_championship_bracket_competition_qualification_pool_rankings
-- para incluir os primeiros e segundos colocados (ranking geral) para fins de seeding do mata-mata.
CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_qualification_pool_rankings(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  team_id UUID,
  team_name TEXT,
  qualification_rank INTEGER,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  pool_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(_championship_id, _competition_id)
  ),
  group_sizes AS (
    SELECT
      group_rankings.group_id,
      count(*)::int AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ),
  competition_match_span AS (
    SELECT
      GREATEST(
        COALESCE(max(GREATEST(group_sizes.group_size - 1, 1)), 1),
        1
      )::numeric AS max_matches_in_competition
    FROM group_sizes
  ),
  candidate_rows AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.team_id,
      group_rankings.team_name,
      group_rankings.team_rank AS qualification_rank,
      group_rankings.points AS points_base,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for,
      GREATEST(group_sizes.group_size - 1, 1)::numeric AS matches_in_group,
      competition_match_span.max_matches_in_competition
    FROM group_rankings
    JOIN group_sizes
      ON group_sizes.group_id = group_rankings.group_id
    CROSS JOIN competition_context
    CROSS JOIN competition_match_span
    WHERE
      -- Inclui os primeiros e segundos colocados para definir melhor 1º e melhor 2º para seeding do mata-mata,
      -- ou todos os qualificados diretos se forem mais que 2 por grupo.
      group_rankings.team_rank <= GREATEST(competition_context.qualifiers_per_group, 2)
      -- E também inclui os segundos colocados se a competição permitir completar com melhores segundos.
      OR (
        competition_context.should_complete_knockout_with_best_second_placed_teams = true
        AND group_rankings.team_rank = 2
      )
  ),
  candidate_rows_with_correction AS (
    SELECT
      candidate_rows.competition_id,
      candidate_rows.group_id,
      candidate_rows.team_id,
      candidate_rows.team_name,
      candidate_rows.qualification_rank,
      candidate_rows.points_base,
      candidate_rows.wins,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      candidate_rows.max_matches_in_competition / candidate_rows.matches_in_group AS correction_factor,
      candidate_rows.points_base::numeric * (
        candidate_rows.max_matches_in_competition / candidate_rows.matches_in_group
      ) AS corrected_points
    FROM candidate_rows
  ),
  pool_metric_tie_sets AS (
    SELECT
      candidate_rows_with_correction.qualification_rank,
      string_agg(candidate_rows_with_correction.team_id::text, '|' ORDER BY candidate_rows_with_correction.team_id::text) AS tied_team_signature,
      array_agg(candidate_rows_with_correction.team_id ORDER BY candidate_rows_with_correction.team_id::text) AS tied_team_ids
    FROM candidate_rows_with_correction
    GROUP BY
      candidate_rows_with_correction.qualification_rank,
      candidate_rows_with_correction.corrected_points,
      candidate_rows_with_correction.wins,
      candidate_rows_with_correction.goal_diff,
      candidate_rows_with_correction.goals_for
    HAVING count(*) > 1
  ),
  pool_tie_context_members AS (
    SELECT
      pool_metric_tie_sets.qualification_rank,
      unnest(pool_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        NULL,
        pool_metric_tie_sets.qualification_rank,
        pool_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM pool_metric_tie_sets
  ),
  pool_tie_resolution_orders AS (
    SELECT
      pool_tie_context_members.qualification_rank,
      pool_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM pool_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = pool_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = pool_tie_context_members.team_id
  ),
  ranked_pool AS (
    SELECT
      candidate_rows_with_correction.competition_id,
      candidate_rows_with_correction.team_id,
      candidate_rows_with_correction.team_name,
      candidate_rows_with_correction.qualification_rank,
      ROUND(candidate_rows_with_correction.corrected_points * 1000000)::bigint AS points,
      candidate_rows_with_correction.wins,
      candidate_rows_with_correction.goal_diff,
      candidate_rows_with_correction.goals_for,
      row_number() OVER (
        ORDER BY
          candidate_rows_with_correction.qualification_rank ASC,
          candidate_rows_with_correction.corrected_points DESC,
          candidate_rows_with_correction.wins DESC,
          candidate_rows_with_correction.goal_diff DESC,
          candidate_rows_with_correction.goals_for DESC,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          candidate_rows_with_correction.team_name ASC
      ) AS pool_rank
    FROM candidate_rows_with_correction
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = candidate_rows_with_correction.qualification_rank
      AND pool_tie_resolution_orders.team_id = candidate_rows_with_correction.team_id
  )
  SELECT
    ranked_pool.competition_id,
    ranked_pool.team_id,
    ranked_pool.team_name,
    ranked_pool.qualification_rank,
    ranked_pool.points,
    ranked_pool.wins,
    ranked_pool.goal_diff,
    ranked_pool.goals_for,
    ranked_pool.pool_rank
  FROM ranked_pool
  ORDER BY ranked_pool.pool_rank ASC, ranked_pool.team_name ASC;
$func$;

-- 2. Atualiza get_championship_bracket_tie_break_contexts
-- para remover restrições que impediam sorteios gerais para seeding.
CREATE OR REPLACE FUNCTION public.get_championship_bracket_tie_break_contexts(
  _championship_id UUID,
  _competition_id UUID DEFAULT NULL,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS TABLE(
  bracket_edition_id UUID,
  competition_id UUID,
  sport_name TEXT,
  naipe public.match_naipe,
  division public.team_division,
  context_type public.championship_bracket_tie_break_context_type,
  group_id UUID,
  group_number INTEGER,
  qualification_rank INTEGER,
  context_key TEXT,
  tied_team_signature TEXT,
  team_ids UUID[],
  team_names TEXT[],
  title TEXT,
  description TEXT,
  is_resolved BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH edition_context AS (
    SELECT
      COALESCE(
        _bracket_edition_id,
        (
          SELECT editions_table.id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        )
      ) AS bracket_edition_id
  ),
  group_statuses AS (
    SELECT
      groups_table.id AS group_id,
      groups_table.competition_id,
      groups_table.group_number,
      count(bracket_matches_table.id)::int AS total_matches,
      count(*) FILTER (
        WHERE matches_table.status = 'FINISHED'::public.match_status
      )::int AS finished_matches,
      (
        count(bracket_matches_table.id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.id)
      ) AS is_group_finished
    FROM public.championship_bracket_groups AS groups_table
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = groups_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number
  ),
  competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.bracket_edition_id,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams,
      competitions_table.naipe,
      competitions_table.division,
      sports_table.name AS sport_name,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule,
      group_aggregates.group_count,
      group_aggregates.finished_group_count,
      group_aggregates.all_groups_finished,
      CASE
        WHEN (group_aggregates.group_count * competitions_table.qualifiers_per_group) < 2 THEN
          (group_aggregates.group_count * competitions_table.qualifiers_per_group)
        WHEN competitions_table.qualifiers_per_group = 1
          AND competitions_table.should_complete_knockout_with_best_second_placed_teams = true THEN
          power(
            2,
            floor(log(2, (group_aggregates.group_count * competitions_table.qualifiers_per_group)::numeric)) + 1
          )::int
        ELSE
          power(2, ceil(log(2, (group_aggregates.group_count * competitions_table.qualifiers_per_group)::numeric)))::int
      END AS target_bracket_size
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN edition_context
      ON edition_context.bracket_edition_id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    JOIN (
      SELECT
        group_statuses.competition_id,
        count(*)::int AS group_count,
        count(*) FILTER (WHERE group_statuses.is_group_finished)::int AS finished_group_count,
        bool_and(group_statuses.is_group_finished) AS all_groups_finished
      FROM group_statuses
      GROUP BY group_statuses.competition_id
    ) AS group_aggregates
      ON group_aggregates.competition_id = competitions_table.id
    WHERE (_competition_id IS NULL OR competitions_table.id = _competition_id)
  ),
  group_score_rows AS (
    SELECT
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      matches_table.home_score::bigint AS goals_for,
      matches_table.away_score::bigint AS goals_against,
      CASE
        WHEN matches_table.home_score > matches_table.away_score THEN COALESCE(championship_sports_table.points_win, 3)
        WHEN matches_table.home_score = matches_table.away_score THEN COALESCE(championship_sports_table.points_draw, 1)
        ELSE COALESCE(championship_sports_table.points_loss, 0)
      END::bigint AS points,
      CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0))::bigint AS red_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (_competition_id IS NULL OR bracket_matches_table.competition_id = _competition_id)

    UNION ALL

    SELECT
      bracket_matches_table.group_id,
      matches_table.away_team_id AS team_id,
      matches_table.away_score::bigint AS goals_for,
      matches_table.home_score::bigint AS goals_against,
      CASE
        WHEN matches_table.away_score > matches_table.home_score THEN COALESCE(championship_sports_table.points_win, 3)
        WHEN matches_table.away_score = matches_table.home_score THEN COALESCE(championship_sports_table.points_draw, 1)
        ELSE COALESCE(championship_sports_table.points_loss, 0)
      END::bigint AS points,
      CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0))::bigint AS red_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (_competition_id IS NULL OR bracket_matches_table.competition_id = _competition_id)
  ),
  group_metrics AS (
    SELECT
      groups_table.id AS group_id,
      groups_table.competition_id,
      groups_table.group_number,
      group_teams_table.team_id,
      COALESCE(sum(group_score_rows.points), 0)::bigint AS points,
      COALESCE(sum(group_score_rows.wins), 0)::bigint AS wins,
      COALESCE(sum(group_score_rows.goals_for - group_score_rows.goals_against), 0)::bigint AS goal_diff,
      COALESCE(sum(group_score_rows.goals_for), 0)::bigint AS goals_for,
      COALESCE(sum(group_score_rows.goals_against), 0)::bigint AS goals_against,
      COALESCE(sum(group_score_rows.yellow_cards), 0)::bigint AS yellow_cards,
      COALESCE(sum(group_score_rows.red_cards), 0)::bigint AS red_cards,
      CASE
        WHEN COALESCE(sum(group_score_rows.goals_against), 0) = 0 THEN
          CASE
            WHEN COALESCE(sum(group_score_rows.goals_for), 0) = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE COALESCE(sum(group_score_rows.goals_for), 0)::numeric / COALESCE(sum(group_score_rows.goals_against), 0)::numeric
      END AS points_average
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    LEFT JOIN group_score_rows
      ON group_score_rows.group_id = groups_table.id
      AND group_score_rows.team_id = group_teams_table.team_id
    WHERE (_competition_id IS NULL OR groups_table.competition_id = _competition_id)
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number, group_teams_table.team_id
  ),
  group_rankings AS (
    SELECT
      competition_context.bracket_edition_id,
      competition_context.id AS competition_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      competition_context.tie_breaker_rule,
      competition_context.qualifiers_per_group,
      competition_context.should_complete_knockout_with_best_second_placed_teams,
      competition_context.target_bracket_size,
      competition_context.group_count,
      competition_context.all_groups_finished,
      rankings_table.group_id,
      rankings_table.group_number,
      rankings_table.team_id,
      rankings_table.team_name,
      rankings_table.points,
      rankings_table.wins,
      rankings_table.goal_diff,
      rankings_table.goals_for,
      rankings_table.team_rank,
      group_metrics.goals_against,
      group_metrics.yellow_cards,
      group_metrics.red_cards,
      group_metrics.points_average,
      group_statuses.is_group_finished
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      competition_context.id
    ) AS rankings_table
    JOIN group_metrics
      ON group_metrics.group_id = rankings_table.group_id
      AND group_metrics.team_id = rankings_table.team_id
    JOIN group_statuses
      ON group_statuses.group_id = rankings_table.group_id
  ),
  group_tie_sets AS (
    SELECT
      group_rankings.bracket_edition_id,
      group_rankings.competition_id,
      group_rankings.sport_name,
      group_rankings.naipe,
      group_rankings.division,
      group_rankings.tie_breaker_rule,
      group_rankings.qualifiers_per_group,
      group_rankings.should_complete_knockout_with_best_second_placed_teams,
      bool_or(group_rankings.all_groups_finished) AS all_groups_finished,
      group_rankings.group_id,
      group_rankings.group_number,
      string_agg(group_rankings.team_id::text, '|' ORDER BY group_rankings.team_id::text) AS tied_team_signature,
      array_agg(group_rankings.team_id ORDER BY group_rankings.team_name ASC) AS team_ids,
      array_agg(group_rankings.team_name ORDER BY group_rankings.team_name ASC) AS team_names,
      min(group_rankings.team_rank)::int AS start_rank,
      max(group_rankings.team_rank)::int AS end_rank
    FROM group_rankings
    WHERE group_rankings.is_group_finished = true
    GROUP BY
      group_rankings.bracket_edition_id,
      group_rankings.competition_id,
      group_rankings.sport_name,
      group_rankings.naipe,
      group_rankings.division,
      group_rankings.tie_breaker_rule,
      group_rankings.qualifiers_per_group,
      group_rankings.should_complete_knockout_with_best_second_placed_teams,
      group_rankings.group_id,
      group_rankings.group_number,
      group_rankings.points,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for,
      CASE
        WHEN group_rankings.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
          THEN group_rankings.points_average
        ELSE NULL::numeric
      END,
      CASE
        WHEN group_rankings.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
          THEN group_rankings.goals_against
        ELSE NULL::bigint
      END,
      CASE
        WHEN group_rankings.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rankings.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN group_rankings.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rankings.red_cards
        ELSE NULL::bigint
      END
    HAVING count(*) > 1
  ),
  group_two_team_head_to_head AS (
    SELECT
      group_tie_sets.group_id,
      group_tie_sets.tied_team_signature,
      group_tie_sets.team_ids[1] AS first_team_id,
      group_tie_sets.team_ids[2] AS second_team_id,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_team_id = group_tie_sets.team_ids[2]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_team_id = group_tie_sets.team_ids[2]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS first_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_team_id = group_tie_sets.team_ids[1]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_team_id = group_tie_sets.team_ids[1]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS second_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_team_id = group_tie_sets.team_ids[2] THEN matches_table.home_score
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_team_id = group_tie_sets.team_ids[1] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS first_team_goals,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[2]
            AND matches_table.away_team_id = group_tie_sets.team_ids[1] THEN matches_table.home_score
          WHEN matches_table.home_team_id = group_tie_sets.team_ids[1]
            AND matches_table.away_team_id = group_tie_sets.team_ids[2] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS second_team_goals
    FROM group_tie_sets
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = group_tie_sets.group_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (
        (
          matches_table.home_team_id = group_tie_sets.team_ids[1]
          AND matches_table.away_team_id = group_tie_sets.team_ids[2]
        )
        OR
        (
          matches_table.home_team_id = group_tie_sets.team_ids[2]
          AND matches_table.away_team_id = group_tie_sets.team_ids[1]
        )
      )
    WHERE cardinality(group_tie_sets.team_ids) = 2
      AND group_tie_sets.tie_breaker_rule IN (
        'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
        'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
        'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
      )
    GROUP BY group_tie_sets.group_id, group_tie_sets.tied_team_signature, group_tie_sets.team_ids
  ),
  group_contexts AS (
    SELECT
      group_tie_sets.bracket_edition_id,
      group_tie_sets.competition_id,
      group_tie_sets.sport_name,
      group_tie_sets.naipe,
      group_tie_sets.division,
      'GROUP'::public.championship_bracket_tie_break_context_type AS context_type,
      group_tie_sets.group_id,
      group_tie_sets.group_number,
      NULL::integer AS qualification_rank,
      public.build_championship_bracket_tie_break_context_key(
        'GROUP'::public.championship_bracket_tie_break_context_type,
        group_tie_sets.competition_id,
        group_tie_sets.group_id,
        NULL,
        group_tie_sets.tied_team_signature
      ) AS context_key,
      group_tie_sets.tied_team_signature,
      group_tie_sets.team_ids,
      group_tie_sets.team_names,
      CASE
        WHEN group_tie_sets.group_number BETWEEN 1 AND 26
          THEN format('Sorteio manual do Grupo %s', chr(64 + group_tie_sets.group_number))
        ELSE format('Sorteio manual do Grupo %s', group_tie_sets.group_number)
      END AS title,
      format(
        '%s • %s%s. As atléticas seguem empatadas após todos os critérios automáticos que influenciam a classificação do grupo.',
        group_tie_sets.sport_name,
        initcap(lower(group_tie_sets.naipe::text)),
        CASE
          WHEN group_tie_sets.division IS NULL THEN ''
          WHEN group_tie_sets.division = 'DIVISAO_PRINCIPAL'::public.team_division THEN ' • Divisão Principal'
          ELSE ' • Divisão de Acesso'
        END
      ) AS description
    FROM group_tie_sets
    LEFT JOIN group_two_team_head_to_head
      ON group_two_team_head_to_head.group_id = group_tie_sets.group_id
      AND group_two_team_head_to_head.tied_team_signature = group_tie_sets.tied_team_signature
    WHERE (
      (group_tie_sets.start_rank <= group_tie_sets.qualifiers_per_group)
      OR (
        group_tie_sets.qualifiers_per_group = 1
        AND group_tie_sets.should_complete_knockout_with_best_second_placed_teams = true
        AND group_tie_sets.start_rank = 2
        AND group_tie_sets.all_groups_finished = true
      )
    )
    AND NOT (
      cardinality(group_tie_sets.team_ids) = 2
      AND group_tie_sets.tie_breaker_rule IN (
        'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
        'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
        'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
      )
      AND group_two_team_head_to_head.group_id IS NOT NULL
      AND (
        group_two_team_head_to_head.first_team_points != group_two_team_head_to_head.second_team_points
        OR group_two_team_head_to_head.first_team_goals != group_two_team_head_to_head.second_team_goals
      )
    )
  ),
  qualification_pool_rankings AS (
    SELECT
      competition_context.bracket_edition_id,
      competition_context.id AS competition_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      competition_context.tie_breaker_rule,
      competition_context.all_groups_finished,
      GREATEST(
        competition_context.target_bracket_size - (competition_context.group_count * competition_context.qualifiers_per_group),
        0
      ) AS required_additional_qualifiers,
      competition_context.should_complete_knockout_with_best_second_placed_teams,
      pool_rankings_table.team_id,
      pool_rankings_table.team_name,
      pool_rankings_table.qualification_rank,
      pool_rankings_table.points,
      pool_rankings_table.wins,
      pool_rankings_table.goal_diff,
      pool_rankings_table.goals_for,
      pool_rankings_table.pool_rank,
      group_metrics.goals_against,
      group_metrics.yellow_cards,
      group_metrics.red_cards,
      group_metrics.points_average
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      competition_context.id
    ) AS pool_rankings_table
    LEFT JOIN group_rankings
      ON group_rankings.competition_id = competition_context.id
      AND group_rankings.team_id = pool_rankings_table.team_id
      AND group_rankings.team_rank = pool_rankings_table.qualification_rank
    LEFT JOIN group_metrics
      ON group_metrics.group_id = group_rankings.group_id
      AND group_metrics.team_id = pool_rankings_table.team_id
  ),
  qualification_pool_tie_sets AS (
    SELECT
      qualification_pool_rankings.bracket_edition_id,
      qualification_pool_rankings.competition_id,
      qualification_pool_rankings.sport_name,
      qualification_pool_rankings.naipe,
      qualification_pool_rankings.division,
      qualification_pool_rankings.tie_breaker_rule,
      qualification_pool_rankings.required_additional_qualifiers,
      qualification_pool_rankings.should_complete_knockout_with_best_second_placed_teams,
      qualification_pool_rankings.all_groups_finished,
      qualification_pool_rankings.qualification_rank,
      string_agg(qualification_pool_rankings.team_id::text, '|' ORDER BY qualification_pool_rankings.team_id::text) AS tied_team_signature,
      array_agg(qualification_pool_rankings.team_id ORDER BY qualification_pool_rankings.team_name ASC) AS team_ids,
      array_agg(qualification_pool_rankings.team_name ORDER BY qualification_pool_rankings.team_name ASC) AS team_names,
      min(qualification_pool_rankings.pool_rank)::int AS start_rank,
      max(qualification_pool_rankings.pool_rank)::int AS end_rank
    FROM qualification_pool_rankings
    GROUP BY
      qualification_pool_rankings.bracket_edition_id,
      qualification_pool_rankings.competition_id,
      qualification_pool_rankings.sport_name,
      qualification_pool_rankings.naipe,
      qualification_pool_rankings.division,
      qualification_pool_rankings.tie_breaker_rule,
      qualification_pool_rankings.required_additional_qualifiers,
      qualification_pool_rankings.should_complete_knockout_with_best_second_placed_teams,
      qualification_pool_rankings.all_groups_finished,
      qualification_pool_rankings.qualification_rank,
      qualification_pool_rankings.points,
      qualification_pool_rankings.wins,
      qualification_pool_rankings.goal_diff,
      qualification_pool_rankings.goals_for,
      CASE
        WHEN qualification_pool_rankings.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
          THEN qualification_pool_rankings.points_average
        ELSE NULL::numeric
      END,
      CASE
        WHEN qualification_pool_rankings.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
          THEN qualification_pool_rankings.goals_against
        ELSE NULL::bigint
      END,
      CASE
        WHEN qualification_pool_rankings.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN qualification_pool_rankings.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN qualification_pool_rankings.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN qualification_pool_rankings.red_cards
        ELSE NULL::bigint
      END
    HAVING count(*) > 1
  ),
  qualification_pool_contexts AS (
    SELECT
      qualification_pool_tie_sets.bracket_edition_id,
      qualification_pool_tie_sets.competition_id,
      qualification_pool_tie_sets.sport_name,
      qualification_pool_tie_sets.naipe,
      qualification_pool_tie_sets.division,
      'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type AS context_type,
      NULL::uuid AS group_id,
      NULL::integer AS group_number,
      qualification_pool_tie_sets.qualification_rank,
      public.build_championship_bracket_tie_break_context_key(
        'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type,
        qualification_pool_tie_sets.competition_id,
        NULL,
        qualification_pool_tie_sets.qualification_rank,
        qualification_pool_tie_sets.tied_team_signature
      ) AS context_key,
      qualification_pool_tie_sets.tied_team_signature,
      qualification_pool_tie_sets.team_ids,
      qualification_pool_tie_sets.team_names,
      format(
        'Sorteio manual dos melhores %sº colocados',
        qualification_pool_tie_sets.qualification_rank
      ) AS title,
      format(
        '%s • %s%s. As atléticas seguem empatadas na definição do ranking geral (melhor %sº) e/ou disputa por vagas.',
        qualification_pool_tie_sets.sport_name,
        initcap(lower(qualification_pool_tie_sets.naipe::text)),
        CASE
          WHEN qualification_pool_tie_sets.division IS NULL THEN ''
          WHEN qualification_pool_tie_sets.division = 'DIVISAO_PRINCIPAL'::public.team_division THEN ' • Divisão Principal'
          ELSE ' • Divisão de Acesso'
        END,
        qualification_pool_tie_sets.qualification_rank
      ) AS description
    FROM qualification_pool_tie_sets
    WHERE qualification_pool_tie_sets.all_groups_finished = true
  ),
  all_contexts AS (
    SELECT * FROM group_contexts

    UNION ALL

    SELECT * FROM qualification_pool_contexts
  )
  SELECT
    all_contexts.bracket_edition_id,
    all_contexts.competition_id,
    all_contexts.sport_name,
    all_contexts.naipe,
    all_contexts.division,
    all_contexts.context_type,
    all_contexts.group_id,
    all_contexts.group_number,
    all_contexts.qualification_rank,
    all_contexts.context_key,
    all_contexts.tied_team_signature,
    all_contexts.team_ids,
    all_contexts.team_names,
    all_contexts.title,
    all_contexts.description,
    EXISTS (
      SELECT 1
      FROM public.championship_bracket_tie_break_resolutions AS resolutions_table
      WHERE resolutions_table.context_key = all_contexts.context_key
    ) AS is_resolved
  FROM all_contexts;
$func$;

-- 3. Atualiza generate_championship_knockout_for_competition
-- para utilizar o ranking geral (pool_rank) no seeding das chaves.
CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
#variable_conflict use_variable
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  qualified_team_count INTEGER;
  group_count_value INTEGER;
  finished_group_count_value INTEGER;
  all_groups_finished BOOLEAN := false;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  current_round INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  semifinal_match_ids UUID[];
  source_home_bracket_match_id UUID;
  source_away_bracket_match_id UUID;
  source_home_winner_team_id UUID;
  source_away_winner_team_id UUID;
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
  existing_knockout_count INTEGER;
  existing_match_id UUID;
  existing_match_status public.match_status;
  desired_winner_team_id UUID;
  pending_tie_breaks_count INTEGER;
BEGIN
  -- Busca dados da competição
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
    competitions_table.third_place_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
    AND (_bracket_edition_id IS NULL OR competitions_table.bracket_edition_id = _bracket_edition_id)
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  bracket_edition_id := competition_record.bracket_edition_id;
  third_place_mode_value := competition_record.third_place_mode;

  -- Bloqueia a geração se houver desempates pendentes
  SELECT count(*)
  INTO pending_tie_breaks_count
  FROM jsonb_array_elements(public.get_championship_bracket_pending_tie_breaks(_championship_id, bracket_edition_id)) AS tb
  WHERE (tb->>'competition_id')::uuid = _competition_id;

  IF pending_tie_breaks_count > 0 THEN
    RETURN _competition_id;
  END IF;

  -- Verifica status dos grupos
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE group_statuses.is_group_finished)::int,
    bool_and(group_statuses.is_group_finished)
  INTO
    group_count_value,
    finished_group_count_value,
    all_groups_finished
  FROM (
    SELECT
      groups_table.id,
      (
        count(bracket_matches_table.id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.id)
      ) AS is_group_finished
    FROM public.championship_bracket_groups AS groups_table
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = groups_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id
  ) AS group_statuses;

  IF group_count_value < 1 THEN
    RETURN _competition_id;
  END IF;

  -- Calcula tamanho do bracket
  target_bracket_size := 1;
  IF competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true THEN
    WHILE target_bracket_size <= (group_count_value * competition_record.qualifiers_per_group) LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < (group_count_value * competition_record.qualifiers_per_group) LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN _competition_id;
  END IF;

  -- Coleta times qualificados por rank e performance (pool_rank)
  FOR ranking_record IN
    WITH ordered_groups AS (
      SELECT
        groups_table.id AS group_id,
        groups_table.group_number,
        (
          count(bracket_matches_table.id) > 0
          AND count(*) FILTER (
            WHERE matches_table.status = 'FINISHED'::public.match_status
          ) = count(bracket_matches_table.id)
        ) AS is_group_finished
      FROM public.championship_bracket_groups AS groups_table
      LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
        ON bracket_matches_table.group_id = groups_table.id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      LEFT JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE groups_table.competition_id = _competition_id
      GROUP BY groups_table.id, groups_table.group_number
    )
    SELECT
      qualifiers.rank_number,
      rankings_table.team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      _competition_id
    ) AS pool_rankings
      ON pool_rankings.team_id = rankings_table.team_id
      AND pool_rankings.qualification_rank = qualifiers.rank_number
    ORDER BY 
      qualifiers.rank_number ASC, 
      COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000) ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  -- Melhores segundos colocados (vagas remanescentes)
  IF competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true THEN
    IF all_groups_finished THEN
      FOR ranking_record IN
        SELECT qualification_pool_rankings.team_id
        FROM public.get_championship_bracket_competition_qualification_pool_rankings(
          _championship_id,
          _competition_id
        ) AS qualification_pool_rankings
        ORDER BY qualification_pool_rankings.pool_rank ASC
      LOOP
        EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

        IF ranking_record.team_id IS NOT NULL
          AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
          qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Preenchimento de BYEs
  WHILE COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  IF COALESCE(cardinality(qualified_team_ids), 0) > target_bracket_size THEN
    qualified_team_ids := qualified_team_ids[1:target_bracket_size];
  END IF;

  qualified_team_count := COALESCE(cardinality(qualified_team_ids), 0);

  IF qualified_team_count < 2 THEN
    RETURN _competition_id;
  END IF;

  bracket_size := 1;
  WHILE bracket_size < qualified_team_count LOOP
    bracket_size := bracket_size * 2;
  END LOOP;

  WHILE cardinality(qualified_team_ids) < bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  total_rounds := 1;
  WHILE power(2, total_rounds) < bracket_size LOOP
    total_rounds := total_rounds + 1;
  END LOOP;

  SELECT count(*)
  INTO existing_knockout_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;

  IF existing_knockout_count = 0 THEN
    round_match_ids := ARRAY[]::UUID[];
    semifinal_match_ids := ARRAY[]::UUID[];

    FOR slot_index IN 1..(bracket_size / 2)
    LOOP
      home_seed_index := ((slot_index - 1) * 2) + 1;
      away_seed_index := home_seed_index + 1;
      home_team_id := qualified_team_ids[home_seed_index];
      away_team_id := qualified_team_ids[away_seed_index];

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        home_team_id,
        away_team_id,
        winner_team_id,
        is_bye
      ) VALUES (
        bracket_edition_id,
        _competition_id,
        'KNOCKOUT'::public.bracket_phase,
        1,
        slot_index,
        home_team_id,
        away_team_id,
        CASE
          WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
          WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
          ELSE NULL
        END,
        CASE
          WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
          WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
          ELSE true
        END
      )
      RETURNING id INTO bracket_match_id;

      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
      END IF;

      round_match_ids := array_append(round_match_ids, bracket_match_id);
    END LOOP;

    IF total_rounds > 1 THEN
      FOR current_round IN 2..total_rounds
      LOOP
        IF current_round = total_rounds THEN
          semifinal_match_ids := round_match_ids;
        END IF;

        next_round_match_ids := ARRAY[]::UUID[];

        FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
        LOOP
          source_home_bracket_match_id := round_match_ids[(slot_index * 2) - 1];
          source_away_bracket_match_id := round_match_ids[(slot_index * 2)];

          SELECT bracket_matches_table.winner_team_id
          INTO source_home_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = source_home_bracket_match_id
          LIMIT 1;

          SELECT bracket_matches_table.winner_team_id
          INTO source_away_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = source_away_bracket_match_id
          LIMIT 1;

          home_team_id := source_home_winner_team_id;
          away_team_id := source_away_winner_team_id;

          INSERT INTO public.championship_bracket_matches (
            bracket_edition_id,
            competition_id,
            phase,
            round_number,
            slot_number,
            home_team_id,
            away_team_id,
            winner_team_id,
            source_home_bracket_match_id,
            source_away_bracket_match_id
          ) VALUES (
            bracket_edition_id,
            _competition_id,
            'KNOCKOUT'::public.bracket_phase,
            current_round,
            slot_index,
            home_team_id,
            away_team_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
              WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
              ELSE NULL
            END,
            source_home_bracket_match_id,
            source_away_bracket_match_id
          )
          RETURNING id INTO bracket_match_id;

          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
        END LOOP;

        round_match_ids := next_round_match_ids;
      END LOOP;
    END IF;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND cardinality(semifinal_match_ids) = 2 THEN

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        home_team_id,
        away_team_id,
        winner_team_id,
        source_home_bracket_match_id,
        source_away_bracket_match_id,
        is_third_place
      ) VALUES (
        bracket_edition_id,
        _competition_id,
        'KNOCKOUT'::public.bracket_phase,
        total_rounds,
        2,
        NULL,
        NULL,
        NULL,
        semifinal_match_ids[1],
        semifinal_match_ids[2],
        true
      );
    END IF;
  END IF;

  RETURN _competition_id;
END;
$func$;
