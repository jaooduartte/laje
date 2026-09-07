CREATE OR REPLACE FUNCTION public.get_interlaje_collective_ranking(
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
  sets_for INTEGER,
  sets_against INTEGER,
  rally_points_for INTEGER,
  rally_points_against INTEGER,
  classification_rank INTEGER,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH policy AS (
    SELECT public.get_interlaje_classification_policy(_championship_id, _sport_id) AS value
  ), group_sizes AS (
    SELECT
      groups_table.id AS group_id,
      count(*)::integer AS group_size
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.competition_id = competitions_table.id
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND competitions_table.division IS NOT DISTINCT FROM _division
    GROUP BY groups_table.id
  ), group_size_range AS (
    SELECT
      min(group_sizes.group_size)::integer AS minimum_group_size,
      max(group_sizes.group_size)::integer AS maximum_group_size
    FROM group_sizes
  ), group_context AS (
    SELECT
      group_teams_table.team_id,
      groups_table.id AS group_id,
      GREATEST(group_sizes.group_size - 1, 1)::numeric AS expected_matches,
      group_size_range.minimum_group_size IS DISTINCT FROM group_size_range.maximum_group_size AS has_uneven_groups
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.competition_id = competitions_table.id
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN group_sizes
      ON group_sizes.group_id = groups_table.id
    CROSS JOIN group_size_range
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND competitions_table.sport_id = _sport_id
      AND competitions_table.naipe = _naipe
      AND competitions_table.division IS NOT DISTINCT FROM _division
  ), effective AS (
    SELECT
      standings_table.team_id,
      standings_table.team_name,
      standings_table.division,
      standings_table.played,
      standings_table.wins,
      standings_table.draws,
      standings_table.losses,
      standings_table.goals_for,
      standings_table.goals_against,
      standings_table.goal_diff,
      standings_table.points
        + COALESCE(
          corrected_standings_table.corrected_points
          - corrected_standings_table.points_base,
          0
        ) AS points,
      standings_table.yellow_cards,
      standings_table.red_cards,
      COALESCE(source_standings.blue_cards, 0) AS blue_cards,
      COALESCE(source_standings.two_minute_penalties, 0) AS two_minute_penalties
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      _division::text,
      _naipe,
      _sport_id
    ) AS standings_table
    LEFT JOIN public.get_championship_corrected_group_standings(
      _championship_id,
      _season_year
    ) AS corrected_standings_table
      ON corrected_standings_table.team_id = standings_table.team_id
      AND corrected_standings_table.sport_id = _sport_id
      AND corrected_standings_table.naipe = _naipe
      AND corrected_standings_table.division IS NOT DISTINCT FROM standings_table.division
    LEFT JOIN public.standings AS source_standings
      ON source_standings.championship_id = _championship_id
      AND source_standings.season_year = _season_year
      AND source_standings.sport_id = _sport_id
      AND source_standings.naipe = _naipe
      AND source_standings.division IS NOT DISTINCT FROM standings_table.division
      AND source_standings.team_id = standings_table.team_id
  ), volleyball_metrics AS (
    SELECT
      participant.team_id,
      COALESCE(SUM(participant.sets_for), 0)::integer AS sets_for,
      COALESCE(SUM(participant.sets_against), 0)::integer AS sets_against,
      COALESCE(SUM(participant.rally_points_for), 0)::integer AS rally_points_for,
      COALESCE(SUM(participant.rally_points_against), 0)::integer AS rally_points_against
    FROM (
      SELECT
        matches_table.home_team_id AS team_id,
        COUNT(*) FILTER (WHERE match_sets_table.home_points > match_sets_table.away_points)::integer AS sets_for,
        COUNT(*) FILTER (WHERE match_sets_table.home_points < match_sets_table.away_points)::integer AS sets_against,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer AS rally_points_for,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer AS rally_points_against
      FROM public.matches AS matches_table
      LEFT JOIN public.match_sets AS match_sets_table ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.sport_id = _sport_id
        AND matches_table.naipe = _naipe
        AND matches_table.division IS NOT DISTINCT FROM _division
        AND matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
      GROUP BY matches_table.home_team_id
      UNION ALL
      SELECT
        matches_table.away_team_id,
        COUNT(*) FILTER (WHERE match_sets_table.away_points > match_sets_table.home_points)::integer,
        COUNT(*) FILTER (WHERE match_sets_table.away_points < match_sets_table.home_points)::integer,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer
      FROM public.matches AS matches_table
      LEFT JOIN public.match_sets AS match_sets_table ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.season_year = _season_year
        AND matches_table.sport_id = _sport_id
        AND matches_table.naipe = _naipe
        AND matches_table.division IS NOT DISTINCT FROM _division
        AND matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
      GROUP BY matches_table.away_team_id
    ) AS participant
    GROUP BY participant.team_id
  ), metrics AS (
    SELECT
      effective.*,
      COALESCE(volleyball_metrics.sets_for, 0) AS sets_for,
      COALESCE(volleyball_metrics.sets_against, 0) AS sets_against,
      COALESCE(volleyball_metrics.rally_points_for, 0) AS rally_points_for,
      COALESCE(volleyball_metrics.rally_points_against, 0) AS rally_points_against,
      CASE
        WHEN effective.goals_against = 0 AND effective.goals_for > 0 THEN 1000000000::numeric
        WHEN effective.goals_against = 0 THEN 0::numeric
        ELSE effective.goals_for::numeric / effective.goals_against
      END AS points_average
    FROM effective
    LEFT JOIN volleyball_metrics ON volleyball_metrics.team_id = effective.team_id
  ), prepared AS (
    SELECT
      metrics.*,
      group_context.group_id,
      COALESCE(group_context.expected_matches, 1::numeric) AS expected_matches,
      COALESCE(group_context.has_uneven_groups, false) AS has_uneven_groups,
      CASE
        WHEN metrics.sets_against = 0 AND metrics.sets_for > 0 THEN 1000000000::numeric
        WHEN metrics.sets_against = 0 THEN 0::numeric
        ELSE metrics.sets_for::numeric / metrics.sets_against
      END AS sets_average,
      public.normalize_sport_name(sports_table.name) AS sport_name
    FROM metrics
    JOIN public.sports AS sports_table ON sports_table.id = _sport_id
    LEFT JOIN group_context ON group_context.team_id = metrics.team_id
  ), comparison_metrics AS (
    SELECT
      prepared.*,
      prepared.points AS comparison_points,
      prepared.sets_for::numeric / prepared.expected_matches AS sets_for_per_match,
      prepared.sets_against::numeric / prepared.expected_matches AS sets_against_per_match,
      prepared.rally_points_for::numeric / prepared.expected_matches AS rally_points_for_per_match,
      prepared.rally_points_against::numeric / prepared.expected_matches AS rally_points_against_per_match,
      prepared.red_cards::numeric / prepared.expected_matches AS red_cards_per_match,
      prepared.yellow_cards::numeric / prepared.expected_matches AS yellow_cards_per_match
    FROM prepared
  ), h2h_scope AS (
    SELECT
      comparison_metrics.*,
      COUNT(*) OVER (
        PARTITION BY
          CASE WHEN comparison_metrics.sport_name = 'voleibol' AND comparison_metrics.has_uneven_groups THEN comparison_metrics.group_id END,
          comparison_metrics.comparison_points,
          CASE WHEN comparison_metrics.sport_name = 'basquetebol' THEN comparison_metrics.points_average WHEN comparison_metrics.sport_name = 'voleibol' THEN comparison_metrics.sets_average ELSE 0 END
      ) AS h2h_candidate_count
    FROM comparison_metrics
  ), h2h AS (
    SELECT
      h2h_scope.*,
      COALESCE((
        SELECT SUM(CASE
          WHEN matches_table.home_team_id = h2h_scope.team_id AND matches_table.home_score > matches_table.away_score THEN 3
          WHEN matches_table.away_team_id = h2h_scope.team_id AND matches_table.away_score > matches_table.home_score THEN 3
          WHEN matches_table.home_score = matches_table.away_score THEN 1
          ELSE 0
        END)
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = _championship_id
          AND matches_table.season_year = _season_year
          AND matches_table.sport_id = _sport_id
          AND matches_table.naipe = _naipe
          AND matches_table.division IS NOT DISTINCT FROM _division
          AND matches_table.status = 'FINISHED'::public.match_status
          AND COALESCE(matches_table.is_double_walkover, false) = false
          AND (matches_table.home_team_id = h2h_scope.team_id OR matches_table.away_team_id = h2h_scope.team_id)
          AND (matches_table.home_team_id = counterpart.team_id OR matches_table.away_team_id = counterpart.team_id)
      ), 0)::numeric AS head_to_head_points
    FROM h2h_scope
    LEFT JOIN h2h_scope AS counterpart
      ON counterpart.team_id <> h2h_scope.team_id
      AND counterpart.comparison_points = h2h_scope.comparison_points
      AND (
        (h2h_scope.sport_name = 'basquetebol' AND counterpart.points_average = h2h_scope.points_average)
        OR (h2h_scope.sport_name = 'voleibol' AND counterpart.sets_average = h2h_scope.sets_average)
        OR (h2h_scope.sport_name NOT IN ('basquetebol', 'voleibol'))
      )
      AND (
        h2h_scope.sport_name <> 'voleibol'
        OR NOT h2h_scope.has_uneven_groups
        OR counterpart.group_id IS NOT DISTINCT FROM h2h_scope.group_id
      )
      AND h2h_scope.h2h_candidate_count = 2
  ), ordered AS (
    SELECT
      h2h.*,
      COALESCE(resolutions_table.draw_order, 2147483647) AS draw_order,
      ROW_NUMBER() OVER (
        ORDER BY
          h2h.comparison_points DESC,
          CASE WHEN h2h.sport_name = 'basquetebol' THEN h2h.points_average END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_average END DESC NULLS LAST,
          CASE WHEN h2h.h2h_candidate_count = 2 THEN h2h.head_to_head_points END DESC NULLS LAST,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol') THEN h2h.goal_diff WHEN h2h.sport_name = 'basquetebol' THEN h2h.goal_diff END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'futsal' THEN h2h.goals_for WHEN h2h.sport_name = 'basquetebol' THEN h2h.goals_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.goals_against WHEN h2h.sport_name = 'basquetebol' THEN h2h.goals_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.blue_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_for END DESC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_against END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.red_cards_per_match WHEN h2h.sport_name IN ('basquetebol', 'futsal', 'handebol', 'voleibol') THEN h2h.red_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.yellow_cards_per_match WHEN h2h.sport_name IN ('futsal', 'handebol', 'voleibol') THEN h2h.yellow_cards END ASC NULLS LAST,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.two_minute_penalties END ASC NULLS LAST,
          COALESCE(resolutions_table.draw_order, 2147483647) ASC,
          h2h.team_id ASC
      )::integer AS classification_rank,
      COUNT(*) OVER (
        PARTITION BY
          h2h.comparison_points,
          CASE WHEN h2h.sport_name = 'basquetebol' THEN h2h.points_average END,
          CASE WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_average END,
          CASE WHEN h2h.h2h_candidate_count = 2 THEN h2h.head_to_head_points END,
          CASE WHEN h2h.sport_name IN ('futsal', 'handebol', 'basquetebol') THEN h2h.goal_diff END,
          CASE WHEN h2h.sport_name IN ('futsal', 'basquetebol') THEN h2h.goals_for END,
          CASE WHEN h2h.sport_name IN ('handebol', 'basquetebol') THEN h2h.goals_against END,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.blue_cards END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_for END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_for_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_for END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.sets_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.sets_against END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.rally_points_against_per_match WHEN h2h.sport_name = 'voleibol' THEN h2h.rally_points_against END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.red_cards_per_match WHEN h2h.sport_name IN ('basquetebol', 'futsal', 'handebol', 'voleibol') THEN h2h.red_cards END,
          CASE WHEN h2h.sport_name = 'voleibol' AND h2h.has_uneven_groups THEN h2h.yellow_cards_per_match WHEN h2h.sport_name IN ('futsal', 'handebol', 'voleibol') THEN h2h.yellow_cards END,
          CASE WHEN h2h.sport_name = 'handebol' THEN h2h.two_minute_penalties END
      ) AS unresolved_count
    FROM h2h
    LEFT JOIN public.championship_interlaje_tie_break_resolutions AS resolutions_table
      ON resolutions_table.championship_id = _championship_id
      AND resolutions_table.season_year = _season_year
      AND resolutions_table.sport_id = _sport_id
      AND resolutions_table.naipe = _naipe
      AND resolutions_table.division IS NOT DISTINCT FROM _division
      AND resolutions_table.group_id IS NULL
      AND resolutions_table.team_id = h2h.team_id
  )
  SELECT
    ordered.team_id, ordered.team_name, ordered.division, ordered.played, ordered.wins,
    ordered.draws, ordered.losses, ordered.goals_for, ordered.goals_against,
    ordered.goal_diff, ordered.points, ordered.yellow_cards, ordered.red_cards,
    ordered.blue_cards, ordered.two_minute_penalties, ordered.sets_for,
    ordered.sets_against, ordered.rally_points_for, ordered.rally_points_against,
    ordered.classification_rank,
    ordered.unresolved_count > 1 AND ordered.draw_order = 2147483647
  FROM ordered
  ORDER BY ordered.classification_rank;
$func$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_collective_ranking(UUID, INTEGER, UUID, public.match_naipe, public.team_division) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
