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
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      editions_table.season_year,
      COALESCE(championship_sports_table.points_win, 3) AS points_win,
      COALESCE(championship_sports_table.points_draw, 1) AS points_draw,
      COALESCE(championship_sports_table.points_loss, 0) AS points_loss,
      COALESCE(
        championship_sports_table.tie_breaker_rule,
        'STANDARD'::public.championship_sport_tie_breaker_rule
      ) AS tie_breaker_rule
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
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
  raw_group_rows AS (
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
      COALESCE(sum(group_scores.red_cards), 0)::bigint AS red_cards
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    LEFT JOIN group_scores
      ON group_scores.group_id = groups_table.id
      AND group_scores.team_id = group_teams_table.team_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id, groups_table.group_number, group_teams_table.team_id
  ),
  group_rows AS (
    SELECT
      raw_group_rows.group_id,
      raw_group_rows.group_number,
      raw_group_rows.team_id,
      raw_group_rows.points,
      raw_group_rows.wins,
      COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff)::bigint AS goal_diff,
      COALESCE(standings_table.goals_for, raw_group_rows.goals_for)::bigint AS goals_for,
      COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0))::bigint AS goals_against,
      COALESCE(standings_table.yellow_cards, raw_group_rows.yellow_cards)::bigint AS yellow_cards,
      COALESCE(standings_table.red_cards, raw_group_rows.red_cards)::bigint AS red_cards,
      CASE
        WHEN COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0)) = 0 THEN
          CASE
            WHEN COALESCE(standings_table.goals_for, raw_group_rows.goals_for) = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE COALESCE(standings_table.goals_for, raw_group_rows.goals_for)::numeric / COALESCE(standings_table.goals_against, GREATEST(raw_group_rows.goals_for - COALESCE(standings_table.goal_diff, raw_group_rows.goal_diff), 0))::numeric
      END AS points_average
    FROM raw_group_rows
    CROSS JOIN competition_context
    LEFT JOIN public.standings AS standings_table
      ON standings_table.championship_id = _championship_id
      AND standings_table.season_year = competition_context.season_year
      AND standings_table.sport_id = competition_context.sport_id
      AND standings_table.naipe = competition_context.naipe
      AND standings_table.division IS NOT DISTINCT FROM competition_context.division
      AND standings_table.team_id = raw_group_rows.team_id
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

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_group_rankings(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
