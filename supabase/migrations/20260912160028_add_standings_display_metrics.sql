CREATE OR REPLACE FUNCTION public.get_championship_standings_display_metrics(
  _championship_id UUID DEFAULT NULL,
  _season_year INTEGER DEFAULT NULL,
  _division_filter TEXT DEFAULT NULL,
  _naipe public.match_naipe DEFAULT NULL,
  _sport_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  championship_id UUID,
  season_year INTEGER,
  division public.team_division,
  naipe public.match_naipe,
  sport_id UUID,
  team_id UUID,
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
  updated_at TIMESTAMPTZ,
  is_individual_sport BOOLEAN,
  scored_events_count INTEGER,
  first_places INTEGER,
  second_places INTEGER,
  third_places INTEGER,
  fourth_places INTEGER,
  fifth_places INTEGER,
  sixth_places INTEGER,
  seventh_places INTEGER,
  eighth_places INTEGER,
  ninth_places INTEGER,
  tenth_places INTEGER,
  eleventh_places INTEGER,
  twelfth_places INTEGER,
  thirteenth_places INTEGER,
  fourteenth_places INTEGER,
  fifteenth_places INTEGER,
  sixteenth_places INTEGER,
  seventeenth_places INTEGER,
  eighteenth_places INTEGER,
  nineteenth_places INTEGER,
  twentieth_places INTEGER,
  relay_points_total NUMERIC,
  team_name TEXT,
  team_city TEXT,
  sport_name TEXT,
  sets_for INTEGER,
  sets_against INTEGER,
  rally_points_for INTEGER,
  rally_points_against INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH effective_standings AS (
    SELECT *
    FROM public.get_championship_effective_standings(
      _championship_id,
      _season_year,
      _division_filter,
      _naipe,
      _sport_id
    )
  ), set_metrics AS (
    SELECT
      participant.championship_id,
      participant.season_year,
      participant.sport_id,
      participant.naipe,
      participant.division,
      participant.team_id,
      SUM(participant.sets_for)::integer AS sets_for,
      SUM(participant.sets_against)::integer AS sets_against,
      SUM(participant.rally_points_for)::integer AS rally_points_for,
      SUM(participant.rally_points_against)::integer AS rally_points_against
    FROM (
      SELECT
        matches_table.championship_id,
        matches_table.season_year,
        matches_table.sport_id,
        matches_table.naipe,
        matches_table.division,
        matches_table.home_team_id AS team_id,
        COUNT(*) FILTER (
          WHERE match_sets_table.home_points > match_sets_table.away_points
        )::integer AS sets_for,
        COUNT(*) FILTER (
          WHERE match_sets_table.home_points < match_sets_table.away_points
        )::integer AS sets_against,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer AS rally_points_for,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer AS rally_points_against
      FROM public.matches AS matches_table
      JOIN public.match_sets AS match_sets_table
        ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
        AND (_championship_id IS NULL OR matches_table.championship_id = _championship_id)
        AND (_season_year IS NULL OR matches_table.season_year = _season_year)
        AND (_sport_id IS NULL OR matches_table.sport_id = _sport_id)
        AND (_naipe IS NULL OR matches_table.naipe = _naipe)
        AND (
          _division_filter IS NULL
          OR (_division_filter = 'WITHOUT_DIVISION' AND matches_table.division IS NULL)
          OR (_division_filter <> 'WITHOUT_DIVISION' AND matches_table.division::text = _division_filter)
        )
      GROUP BY
        matches_table.championship_id,
        matches_table.season_year,
        matches_table.sport_id,
        matches_table.naipe,
        matches_table.division,
        matches_table.home_team_id

      UNION ALL

      SELECT
        matches_table.championship_id,
        matches_table.season_year,
        matches_table.sport_id,
        matches_table.naipe,
        matches_table.division,
        matches_table.away_team_id,
        COUNT(*) FILTER (
          WHERE match_sets_table.away_points > match_sets_table.home_points
        )::integer,
        COUNT(*) FILTER (
          WHERE match_sets_table.away_points < match_sets_table.home_points
        )::integer,
        COALESCE(SUM(match_sets_table.away_points), 0)::integer,
        COALESCE(SUM(match_sets_table.home_points), 0)::integer
      FROM public.matches AS matches_table
      JOIN public.match_sets AS match_sets_table
        ON match_sets_table.match_id = matches_table.id
      WHERE matches_table.status = 'FINISHED'::public.match_status
        AND COALESCE(matches_table.is_double_walkover, false) = false
        AND (_championship_id IS NULL OR matches_table.championship_id = _championship_id)
        AND (_season_year IS NULL OR matches_table.season_year = _season_year)
        AND (_sport_id IS NULL OR matches_table.sport_id = _sport_id)
        AND (_naipe IS NULL OR matches_table.naipe = _naipe)
        AND (
          _division_filter IS NULL
          OR (_division_filter = 'WITHOUT_DIVISION' AND matches_table.division IS NULL)
          OR (_division_filter <> 'WITHOUT_DIVISION' AND matches_table.division::text = _division_filter)
        )
      GROUP BY
        matches_table.championship_id,
        matches_table.season_year,
        matches_table.sport_id,
        matches_table.naipe,
        matches_table.division,
        matches_table.away_team_id
    ) AS participant
    GROUP BY
      participant.championship_id,
      participant.season_year,
      participant.sport_id,
      participant.naipe,
      participant.division,
      participant.team_id
  )
  SELECT
    effective_standings.id,
    effective_standings.championship_id,
    effective_standings.season_year,
    effective_standings.division,
    effective_standings.naipe,
    effective_standings.sport_id,
    effective_standings.team_id,
    effective_standings.played,
    effective_standings.wins,
    effective_standings.draws,
    effective_standings.losses,
    effective_standings.goals_for,
    effective_standings.goals_against,
    effective_standings.goal_diff,
    effective_standings.points,
    effective_standings.yellow_cards,
    effective_standings.red_cards,
    effective_standings.blue_cards,
    effective_standings.two_minute_penalties,
    effective_standings.updated_at,
    effective_standings.is_individual_sport,
    effective_standings.scored_events_count,
    effective_standings.first_places,
    effective_standings.second_places,
    effective_standings.third_places,
    effective_standings.fourth_places,
    effective_standings.fifth_places,
    effective_standings.sixth_places,
    effective_standings.seventh_places,
    effective_standings.eighth_places,
    effective_standings.ninth_places,
    effective_standings.tenth_places,
    effective_standings.eleventh_places,
    effective_standings.twelfth_places,
    effective_standings.thirteenth_places,
    effective_standings.fourteenth_places,
    effective_standings.fifteenth_places,
    effective_standings.sixteenth_places,
    effective_standings.seventeenth_places,
    effective_standings.eighteenth_places,
    effective_standings.nineteenth_places,
    effective_standings.twentieth_places,
    effective_standings.relay_points_total,
    effective_standings.team_name,
    effective_standings.team_city,
    effective_standings.sport_name,
    COALESCE(set_metrics.sets_for, 0),
    COALESCE(set_metrics.sets_against, 0),
    COALESCE(set_metrics.rally_points_for, 0),
    COALESCE(set_metrics.rally_points_against, 0)
  FROM effective_standings
  LEFT JOIN set_metrics
    ON set_metrics.championship_id = effective_standings.championship_id
    AND set_metrics.season_year = effective_standings.season_year
    AND set_metrics.sport_id = effective_standings.sport_id
    AND set_metrics.naipe = effective_standings.naipe
    AND set_metrics.division IS NOT DISTINCT FROM effective_standings.division
    AND set_metrics.team_id = effective_standings.team_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_standings_display_metrics(UUID, INTEGER, TEXT, public.match_naipe, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
