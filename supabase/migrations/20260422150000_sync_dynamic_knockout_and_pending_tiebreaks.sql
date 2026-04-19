CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_group_rankings(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  group_id UUID,
  group_number INTEGER,
  team_id UUID,
  team_name TEXT,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  team_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule
    FROM public.championship_bracket_competitions AS competitions_table
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = _championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_scores AS (
    SELECT
      bracket_matches_table.group_id,
      matches_table.home_team_id AS team_id,
      matches_table.home_score::bigint AS goals_for,
      matches_table.away_score::bigint AS goals_against,
      CASE
        WHEN matches_table.home_score > matches_table.away_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.home_score = matches_table.away_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,
      CASE WHEN matches_table.home_score > matches_table.away_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.home_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.home_red_cards, 0))::bigint AS red_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status

    UNION ALL

    SELECT
      bracket_matches_table.group_id,
      matches_table.away_team_id AS team_id,
      matches_table.away_score::bigint AS goals_for,
      matches_table.home_score::bigint AS goals_against,
      CASE
        WHEN matches_table.away_score > matches_table.home_score THEN (SELECT points_win FROM competition_context)
        WHEN matches_table.away_score = matches_table.home_score THEN (SELECT points_draw FROM competition_context)
        ELSE (SELECT points_loss FROM competition_context)
      END::bigint AS points,
      CASE WHEN matches_table.away_score > matches_table.home_score THEN 1 ELSE 0 END::bigint AS wins,
      GREATEST(0, COALESCE(matches_table.away_yellow_cards, 0))::bigint AS yellow_cards,
      GREATEST(0, COALESCE(matches_table.away_red_cards, 0))::bigint AS red_cards
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
  ),
  group_rows AS (
    SELECT
      groups_table.id AS group_id,
      groups_table.group_number,
      group_teams_table.team_id,
      COALESCE(sum(group_scores.points), 0)::bigint AS points,
      COALESCE(sum(group_scores.wins), 0)::bigint AS wins,
      COALESCE(sum(group_scores.goals_for - group_scores.goals_against), 0)::bigint AS goal_diff,
      COALESCE(sum(group_scores.goals_for), 0)::bigint AS goals_for,
      COALESCE(sum(group_scores.goals_against), 0)::bigint AS goals_against,
      COALESCE(sum(group_scores.yellow_cards), 0)::bigint AS yellow_cards,
      COALESCE(sum(group_scores.red_cards), 0)::bigint AS red_cards,
      CASE
        WHEN COALESCE(sum(group_scores.goals_against), 0) = 0 THEN
          CASE
            WHEN COALESCE(sum(group_scores.goals_for), 0) = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE COALESCE(sum(group_scores.goals_for), 0)::numeric / COALESCE(sum(group_scores.goals_against), 0)::numeric
      END AS points_average
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    LEFT JOIN group_scores
      ON group_scores.group_id = groups_table.id
      AND group_scores.team_id = group_teams_table.team_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id, groups_table.group_number, group_teams_table.team_id
  ),
  unresolved_metric_tie_sets AS (
    SELECT
      group_rows.group_id,
      string_agg(group_rows.team_id::text, '|' ORDER BY group_rows.team_id::text) AS tied_team_signature,
      array_agg(group_rows.team_id ORDER BY group_rows.team_id::text) AS tied_team_ids
    FROM group_rows
    CROSS JOIN competition_context
    GROUP BY
      group_rows.group_id,
      group_rows.points,
      group_rows.wins,
      group_rows.goal_diff,
      group_rows.goals_for,
      CASE
        WHEN competition_context.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
          THEN group_rows.points_average
        ELSE NULL::numeric
      END,
      CASE
        WHEN competition_context.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
          THEN group_rows.goals_against
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.yellow_cards
        ELSE NULL::bigint
      END,
      CASE
        WHEN competition_context.tie_breaker_rule IN (
          'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
          'STANDARD'::public.championship_sport_tie_breaker_rule
        ) THEN group_rows.red_cards
        ELSE NULL::bigint
      END,
      competition_context.tie_breaker_rule
    HAVING count(*) > 1
  ),
  unresolved_tie_context_members AS (
    SELECT
      unresolved_metric_tie_sets.group_id,
      unnest(unresolved_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'GROUP'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        unresolved_metric_tie_sets.group_id,
        NULL,
        unresolved_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM unresolved_metric_tie_sets
  ),
  unresolved_tie_resolution_orders AS (
    SELECT
      unresolved_tie_context_members.group_id,
      unresolved_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM unresolved_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = unresolved_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = unresolved_tie_context_members.team_id
  ),
  direct_confrontation_pair_candidates AS (
    SELECT
      group_rows.group_id,
      array_agg(group_rows.team_id ORDER BY group_rows.team_id::text) AS team_ids
    FROM group_rows
    CROSS JOIN competition_context
    GROUP BY
      group_rows.group_id,
      group_rows.points,
      CASE
        WHEN competition_context.tie_breaker_rule = 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
          THEN group_rows.wins
        ELSE NULL::bigint
      END,
      competition_context.tie_breaker_rule
    HAVING count(*) = 2
      AND competition_context.tie_breaker_rule IN (
        'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
        'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule,
        'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
      )
  ),
  direct_confrontation_pair_stats AS (
    SELECT
      direct_confrontation_pair_candidates.group_id,
      direct_confrontation_pair_candidates.team_ids[1] AS first_team_id,
      direct_confrontation_pair_candidates.team_ids[2] AS second_team_id,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS first_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.home_score = matches_table.away_score THEN 1
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_score = matches_table.home_score THEN 1
          ELSE 0
        END
      ), 0)::int AS second_team_points,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2] THEN matches_table.home_score
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS first_team_goals,
      COALESCE(sum(
        CASE
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1] THEN matches_table.home_score
          WHEN matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
            AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2] THEN matches_table.away_score
          ELSE 0
        END
      ), 0)::int AS second_team_goals
    FROM direct_confrontation_pair_candidates
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = direct_confrontation_pair_candidates.group_id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (
        (
          matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[1]
          AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[2]
        )
        OR
        (
          matches_table.home_team_id = direct_confrontation_pair_candidates.team_ids[2]
          AND matches_table.away_team_id = direct_confrontation_pair_candidates.team_ids[1]
        )
      )
    GROUP BY direct_confrontation_pair_candidates.group_id, direct_confrontation_pair_candidates.team_ids
  ),
  direct_confrontation_orders AS (
    SELECT
      direct_confrontation_pair_stats.group_id,
      direct_confrontation_pair_stats.first_team_id AS team_id,
      CASE
        WHEN
          direct_confrontation_pair_stats.first_team_points > direct_confrontation_pair_stats.second_team_points
          OR (
            direct_confrontation_pair_stats.first_team_points = direct_confrontation_pair_stats.second_team_points
            AND direct_confrontation_pair_stats.first_team_goals > direct_confrontation_pair_stats.second_team_goals
          ) THEN 0
        WHEN
          direct_confrontation_pair_stats.second_team_points > direct_confrontation_pair_stats.first_team_points
          OR (
            direct_confrontation_pair_stats.second_team_points = direct_confrontation_pair_stats.first_team_points
            AND direct_confrontation_pair_stats.second_team_goals > direct_confrontation_pair_stats.first_team_goals
          ) THEN 1
        ELSE NULL::int
      END AS direct_order
    FROM direct_confrontation_pair_stats

    UNION ALL

    SELECT
      direct_confrontation_pair_stats.group_id,
      direct_confrontation_pair_stats.second_team_id AS team_id,
      CASE
        WHEN
          direct_confrontation_pair_stats.second_team_points > direct_confrontation_pair_stats.first_team_points
          OR (
            direct_confrontation_pair_stats.second_team_points = direct_confrontation_pair_stats.first_team_points
            AND direct_confrontation_pair_stats.second_team_goals > direct_confrontation_pair_stats.first_team_goals
          ) THEN 0
        WHEN
          direct_confrontation_pair_stats.first_team_points > direct_confrontation_pair_stats.second_team_points
          OR (
            direct_confrontation_pair_stats.first_team_points = direct_confrontation_pair_stats.second_team_points
            AND direct_confrontation_pair_stats.first_team_goals > direct_confrontation_pair_stats.second_team_goals
          ) THEN 1
        ELSE NULL::int
      END AS direct_order
    FROM direct_confrontation_pair_stats
  ),
  ranked AS (
    SELECT
      _competition_id AS competition_id,
      group_rows.group_id,
      group_rows.group_number,
      group_rows.team_id,
      teams_table.name AS team_name,
      group_rows.points,
      group_rows.wins,
      group_rows.goal_diff,
      group_rows.goals_for,
      row_number() OVER (
        PARTITION BY group_rows.group_id
        ORDER BY
          group_rows.points DESC,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
            ) THEN direct_confrontation_orders.direct_order
            ELSE NULL::int
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'BEACH_TENNIS'::public.championship_sport_tie_breaker_rule
              THEN direct_confrontation_orders.direct_order
            ELSE NULL::int
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule
              THEN group_rows.points_average
            ELSE NULL::numeric
          END DESC NULLS LAST,
          group_rows.goal_diff DESC,
          group_rows.goals_for DESC,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'POINTS_AVERAGE'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.wins
            ELSE NULL::bigint
          END DESC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule = 'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule
              THEN group_rows.goals_against
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.yellow_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          CASE
            WHEN competition_context.tie_breaker_rule IN (
              'BEACH_SOCCER'::public.championship_sport_tie_breaker_rule,
              'STANDARD'::public.championship_sport_tie_breaker_rule
            ) THEN group_rows.red_cards
            ELSE NULL::bigint
          END ASC NULLS LAST,
          COALESCE(unresolved_tie_resolution_orders.draw_order, 2147483647) ASC,
          teams_table.name ASC
      ) AS team_rank
    FROM group_rows
    JOIN public.teams AS teams_table
      ON teams_table.id = group_rows.team_id
    CROSS JOIN competition_context
    LEFT JOIN unresolved_tie_resolution_orders
      ON unresolved_tie_resolution_orders.group_id = group_rows.group_id
      AND unresolved_tie_resolution_orders.team_id = group_rows.team_id
    LEFT JOIN direct_confrontation_orders
      ON direct_confrontation_orders.group_id = group_rows.group_id
      AND direct_confrontation_orders.team_id = group_rows.team_id
  )
  SELECT
    ranked.competition_id,
    ranked.group_id,
    ranked.group_number,
    ranked.team_id,
    ranked.team_name,
    ranked.points,
    ranked.wins,
    ranked.goal_diff,
    ranked.goals_for,
    ranked.team_rank
  FROM ranked
  ORDER BY ranked.group_number ASC, ranked.team_rank ASC, ranked.team_name ASC;
$func$;

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
        '%s • %s%s. As atléticas seguem empatadas na disputa pelas vagas remanescentes do mata-mata.',
        qualification_pool_tie_sets.sport_name,
        initcap(lower(qualification_pool_tie_sets.naipe::text)),
        CASE
          WHEN qualification_pool_tie_sets.division IS NULL THEN ''
          WHEN qualification_pool_tie_sets.division = 'DIVISAO_PRINCIPAL'::public.team_division THEN ' • Divisão Principal'
          ELSE ' • Divisão de Acesso'
        END
      ) AS description
    FROM qualification_pool_tie_sets
    WHERE qualification_pool_tie_sets.required_additional_qualifiers > 0
      AND qualification_pool_tie_sets.start_rank <= qualification_pool_tie_sets.required_additional_qualifiers
      AND qualification_pool_tie_sets.should_complete_knockout_with_best_second_placed_teams = true
      AND qualification_pool_tie_sets.all_groups_finished = true
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
    (
      resolutions_table.id IS NOT NULL
      AND (
        SELECT count(*)
        FROM public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
        WHERE resolution_teams_table.resolution_id = resolutions_table.id
      ) = COALESCE(cardinality(all_contexts.team_ids), 0)
    ) AS is_resolved
  FROM all_contexts
  LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
    ON resolutions_table.context_key = all_contexts.context_key;
$func$;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_pending_tie_breaks(
  _championship_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  FROM public.get_championship_bracket_tie_break_contexts(
    _championship_id,
    NULL,
    _bracket_edition_id
  ) AS contexts_table
  WHERE contexts_table.is_resolved = false;
$func$;

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
<<knockout_gen>>
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
  round_number INTEGER;
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
BEGIN
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

  IF group_count_value < 2 THEN
    RETURN _competition_id;
  END IF;

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
      ordered_groups.group_number,
      CASE
        WHEN ordered_groups.is_group_finished THEN rankings_table.team_id
        ELSE NULL::uuid
      END AS team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    ORDER BY qualifiers.rank_number ASC, ordered_groups.group_number ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

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
      FOR round_number IN 2..total_rounds
      LOOP
        IF round_number = total_rounds THEN
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
          WHERE bracket_matches_table.id = knockout_gen.source_home_bracket_match_id
          LIMIT 1;

          SELECT bracket_matches_table.winner_team_id
          INTO source_away_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = knockout_gen.source_away_bracket_match_id
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
            source_away_bracket_match_id,
            is_bye
          ) VALUES (
            bracket_edition_id,
            _competition_id,
            'KNOCKOUT'::public.bracket_phase,
            knockout_gen.round_number,
            slot_index,
            home_team_id,
            away_team_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
              WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
              ELSE NULL
            END,
            source_home_bracket_match_id,
            source_away_bracket_match_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
              WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
              ELSE true
            END
          )
          RETURNING id INTO bracket_match_id;

          UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = knockout_gen.source_home_bracket_match_id;

          UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = knockout_gen.source_away_bracket_match_id;

          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
            PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
          END IF;

          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
        END LOOP;

        round_match_ids := next_round_match_ids;
      END LOOP;
    END IF;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND COALESCE(cardinality(semifinal_match_ids), 0) = 2 THEN
      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        source_home_bracket_match_id,
        source_away_bracket_match_id,
        is_third_place
      ) VALUES (
        bracket_edition_id,
        _competition_id,
        'KNOCKOUT'::public.bracket_phase,
        total_rounds,
        2,
        semifinal_match_ids[1],
        semifinal_match_ids[2],
        true
      );
    END IF;

    PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);
    RETURN _competition_id;
  END IF;

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := ((slot_index - 1) * 2) + 1;
    away_seed_index := home_seed_index + 1;
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    SELECT
      bracket_matches_table.match_id,
      matches_table.status
    INTO existing_match_id, existing_match_status
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    LIMIT 1;

    IF existing_match_status IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status) THEN
      CONTINUE;
    END IF;

    IF existing_match_id IS NULL THEN
      UPDATE public.championship_bracket_matches
      SET
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        winner_team_id = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN knockout_gen.away_team_id
          WHEN knockout_gen.away_team_id IS NULL
            AND knockout_gen.home_team_id IS NOT NULL THEN knockout_gen.home_team_id
          ELSE NULL
        END,
        is_bye = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NULL THEN false
          WHEN knockout_gen.home_team_id IS NOT NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN false
          ELSE true
        END
      WHERE championship_bracket_matches.competition_id = _competition_id
        AND championship_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND championship_bracket_matches.is_third_place = false
        AND championship_bracket_matches.round_number = 1
        AND championship_bracket_matches.slot_number = slot_index
      RETURNING id INTO bracket_match_id;

      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
      END IF;
    ELSIF existing_match_status = 'SCHEDULED'::public.match_status
      AND home_team_id IS NOT NULL
      AND away_team_id IS NOT NULL THEN
      UPDATE public.matches
      SET
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        home_score = 0,
        away_score = 0,
        start_time = NULL,
        end_time = NULL,
        status = 'SCHEDULED'::public.match_status,
        updated_at = now()
      WHERE id = existing_match_id;

      UPDATE public.championship_bracket_matches
      SET
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        winner_team_id = NULL,
        is_bye = false
      WHERE championship_bracket_matches.competition_id = _competition_id
        AND championship_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND championship_bracket_matches.is_third_place = false
        AND championship_bracket_matches.round_number = 1
        AND championship_bracket_matches.slot_number = slot_index;
    ELSIF existing_match_status = 'SCHEDULED'::public.match_status THEN
      UPDATE public.championship_bracket_matches
      SET
        match_id = NULL,
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        winner_team_id = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN knockout_gen.away_team_id
          WHEN knockout_gen.away_team_id IS NULL
            AND knockout_gen.home_team_id IS NOT NULL THEN knockout_gen.home_team_id
          ELSE NULL
        END,
        is_bye = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NULL THEN false
          WHEN knockout_gen.home_team_id IS NOT NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN false
          ELSE true
        END
      WHERE championship_bracket_matches.competition_id = _competition_id
        AND championship_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND championship_bracket_matches.is_third_place = false
        AND championship_bracket_matches.round_number = 1
        AND championship_bracket_matches.slot_number = slot_index;

      DELETE FROM public.matches AS matches_table
      WHERE matches_table.id = existing_match_id
        AND matches_table.status = 'SCHEDULED'::public.match_status;
    END IF;
  END LOOP;

  IF total_rounds > 1 THEN
    FOR round_number IN 2..total_rounds
    LOOP
      FOR slot_index IN 1..(bracket_size / (1 << round_number))
      LOOP
        SELECT
          bracket_matches_table.id,
          bracket_matches_table.match_id,
          matches_table.status,
          bracket_matches_table.source_home_bracket_match_id,
          bracket_matches_table.source_away_bracket_match_id
        INTO
          bracket_match_id,
          existing_match_id,
          existing_match_status,
          source_home_bracket_match_id,
          source_away_bracket_match_id
        FROM public.championship_bracket_matches AS bracket_matches_table
        LEFT JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = _competition_id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND bracket_matches_table.is_third_place = false
          AND bracket_matches_table.round_number = knockout_gen.round_number
          AND bracket_matches_table.slot_number = slot_index
        LIMIT 1;

        IF bracket_match_id IS NULL THEN
          CONTINUE;
        END IF;

        SELECT winner_team_id
        INTO source_home_winner_team_id
        FROM public.championship_bracket_matches
        WHERE id = knockout_gen.source_home_bracket_match_id
        LIMIT 1;

        SELECT winner_team_id
        INTO source_away_winner_team_id
        FROM public.championship_bracket_matches
        WHERE id = knockout_gen.source_away_bracket_match_id
        LIMIT 1;

        home_team_id := source_home_winner_team_id;
        away_team_id := source_away_winner_team_id;
        desired_winner_team_id := CASE
          WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
          WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
          ELSE NULL
        END;

        IF existing_match_status IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status) THEN
          CONTINUE;
        END IF;

        IF existing_match_id IS NULL THEN
          UPDATE public.championship_bracket_matches
          SET
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            winner_team_id = knockout_gen.desired_winner_team_id,
            is_bye = CASE
              WHEN knockout_gen.home_team_id IS NULL
                AND knockout_gen.away_team_id IS NULL THEN false
              WHEN knockout_gen.home_team_id IS NOT NULL
                AND knockout_gen.away_team_id IS NOT NULL THEN false
              ELSE true
            END
          WHERE id = bracket_match_id;

          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
            PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
          END IF;
        ELSIF existing_match_status = 'SCHEDULED'::public.match_status
          AND home_team_id IS NOT NULL
          AND away_team_id IS NOT NULL THEN
          UPDATE public.matches
          SET
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            home_score = 0,
            away_score = 0,
            start_time = NULL,
            end_time = NULL,
            status = 'SCHEDULED'::public.match_status,
            updated_at = now()
          WHERE id = existing_match_id;

          UPDATE public.championship_bracket_matches
          SET
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            winner_team_id = NULL,
            is_bye = false
          WHERE id = bracket_match_id;
        ELSIF existing_match_status = 'SCHEDULED'::public.match_status THEN
          UPDATE public.championship_bracket_matches
          SET
            match_id = NULL,
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            winner_team_id = knockout_gen.desired_winner_team_id,
            is_bye = CASE
              WHEN knockout_gen.home_team_id IS NULL
                AND knockout_gen.away_team_id IS NULL THEN false
              WHEN knockout_gen.home_team_id IS NOT NULL
                AND knockout_gen.away_team_id IS NOT NULL THEN false
              ELSE true
            END
          WHERE id = bracket_match_id;

          DELETE FROM public.matches AS matches_table
          WHERE matches_table.id = existing_match_id
            AND matches_table.status = 'SCHEDULED'::public.match_status;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode THEN
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      matches_table.status,
      bracket_matches_table.source_home_bracket_match_id,
      bracket_matches_table.source_away_bracket_match_id
    INTO
      bracket_match_id,
      existing_match_id,
      existing_match_status,
      source_home_bracket_match_id,
      source_away_bracket_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = true
    LIMIT 1;

    IF bracket_match_id IS NOT NULL AND existing_match_status NOT IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status) THEN
      home_team_id := public.resolve_championship_bracket_match_loser_team_id(source_home_bracket_match_id);
      away_team_id := public.resolve_championship_bracket_match_loser_team_id(source_away_bracket_match_id);

      IF existing_match_id IS NULL THEN
        UPDATE public.championship_bracket_matches
        SET
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          is_bye = CASE
            WHEN knockout_gen.home_team_id IS NOT NULL
              AND knockout_gen.away_team_id IS NOT NULL THEN false
            ELSE is_bye
          END
        WHERE id = bracket_match_id;

        IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
          PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
        END IF;
      ELSIF existing_match_status = 'SCHEDULED'::public.match_status
        AND home_team_id IS NOT NULL
        AND away_team_id IS NOT NULL THEN
        UPDATE public.matches
        SET
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          home_score = 0,
          away_score = 0,
          start_time = NULL,
          end_time = NULL,
          status = 'SCHEDULED'::public.match_status,
          updated_at = now()
        WHERE id = existing_match_id;

        UPDATE public.championship_bracket_matches
        SET
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          winner_team_id = NULL,
          is_bye = false
        WHERE id = bracket_match_id;
      ELSIF existing_match_status = 'SCHEDULED'::public.match_status THEN
        UPDATE public.championship_bracket_matches
        SET
          match_id = NULL,
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          winner_team_id = NULL,
          is_bye = CASE
            WHEN knockout_gen.home_team_id IS NULL
              AND knockout_gen.away_team_id IS NULL THEN false
            WHEN knockout_gen.home_team_id IS NOT NULL
              AND knockout_gen.away_team_id IS NOT NULL THEN false
            ELSE true
          END
        WHERE id = bracket_match_id;

        DELETE FROM public.matches AS matches_table
        WHERE matches_table.id = existing_match_id
          AND matches_table.status = 'SCHEDULED'::public.match_status;
      END IF;
    END IF;
  END IF;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN _competition_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.save_championship_bracket_tie_break_resolution(
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  competition_record RECORD;
  context_record RECORD;
  team_id_record JSONB;
  team_id_value UUID;
  ordered_team_ids UUID[] := ARRAY[]::UUID[];
  sorted_signature TEXT;
  resolution_id_value UUID;
  team_position INTEGER := 0;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para salvar sorteio manual.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'team_ids', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'team_ids', '[]'::jsonb)) < 2 THEN
    RAISE EXCEPTION 'Informe ao menos duas atléticas para o sorteio manual.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    editions_table.championship_id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  WHERE competitions_table.id = (_payload->>'competition_id')::uuid
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RAISE EXCEPTION 'Competição de chaveamento não encontrada para salvar o sorteio.';
  END IF;

  FOR team_id_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'team_ids', '[]'::jsonb))
  LOOP
    ordered_team_ids := array_append(ordered_team_ids, trim(both '"' from team_id_record::text)::uuid);
  END LOOP;

  SELECT string_agg(team_id_value::text, '|' ORDER BY team_id_value::text)
  INTO sorted_signature
  FROM unnest(ordered_team_ids) AS team_id_value;

  SELECT contexts_table.*
  INTO context_record
  FROM public.get_championship_bracket_tie_break_contexts(
    competition_record.championship_id,
    competition_record.id,
    competition_record.bracket_edition_id
  ) AS contexts_table
  WHERE contexts_table.context_key = trim(COALESCE(_payload->>'context_key', ''))
  LIMIT 1;

  IF context_record.context_key IS NULL THEN
    RAISE EXCEPTION 'Contexto de sorteio não encontrado ou não está mais pendente.';
  END IF;

  IF context_record.tied_team_signature <> sorted_signature THEN
    RAISE EXCEPTION 'As atléticas informadas não correspondem ao empate atual deste sorteio.';
  END IF;

  INSERT INTO public.championship_bracket_tie_break_resolutions (
    bracket_edition_id,
    competition_id,
    group_id,
    context_type,
    qualification_rank,
    context_key,
    tied_team_signature,
    created_by
  ) VALUES (
    competition_record.bracket_edition_id,
    competition_record.id,
    context_record.group_id,
    context_record.context_type,
    context_record.qualification_rank,
    context_record.context_key,
    context_record.tied_team_signature,
    auth.uid()
  )
  ON CONFLICT (context_key)
  DO UPDATE SET
    tied_team_signature = EXCLUDED.tied_team_signature,
    group_id = EXCLUDED.group_id,
    qualification_rank = EXCLUDED.qualification_rank,
    updated_at = now()
  RETURNING id INTO resolution_id_value;

  DELETE FROM public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
  WHERE resolution_teams_table.resolution_id = resolution_id_value;

  FOREACH team_id_value IN ARRAY ordered_team_ids
  LOOP
    team_position := team_position + 1;

    INSERT INTO public.championship_bracket_tie_break_resolution_teams (
      resolution_id,
      team_id,
      draw_order
    ) VALUES (
      resolution_id_value,
      team_id_value,
      team_position
    );
  END LOOP;

  PERFORM public.generate_championship_knockout_for_competition(
    competition_record.championship_id,
    competition_record.id,
    competition_record.bracket_edition_id
  );

  RETURN resolution_id_value;
END;
$func$;

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
  walkover_loser_team_id
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.handle_championship_bracket_match_finished();

NOTIFY pgrst, 'reload schema';
