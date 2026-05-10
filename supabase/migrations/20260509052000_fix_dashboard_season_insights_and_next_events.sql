CREATE OR REPLACE FUNCTION public.get_home_dashboard_metrics(
  _season_year INTEGER DEFAULT NULL,
  _championship_code public.championship_code DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_season_year INTEGER;
  top_performance JSONB;
  most_matches JSONB;
  most_appearances JSONB;
  season_highlights JSONB;
  championship_dominance JSONB;
  modality_participation JSONB;
  season_insights JSONB;
  next_event_day JSONB;
  next_events JSONB;
  selected_championship_ids UUID[];
BEGIN
  SELECT COALESCE(_season_year, MAX(championships.current_season_year))
  INTO resolved_season_year
  FROM public.championships AS championships;

  SELECT COALESCE(array_agg(championships.id), ARRAY[]::UUID[])
  INTO selected_championship_ids
  FROM public.championships AS championships
  WHERE _championship_code IS NULL OR championships.code = _championship_code;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('team_id', ranking.team_id, 'team_name', ranking.team_name, 'value', ranking.total_points, 'secondary_value', ranking.total_wins)
      ORDER BY ranking.total_points DESC, ranking.total_wins DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  ) INTO top_performance
  FROM (
    SELECT standings.team_id, teams.name AS team_name, SUM(standings.points)::int AS total_points, SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY total_points DESC, total_wins DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('team_id', ranking.team_id, 'team_name', ranking.team_name, 'value', ranking.matches_count, 'secondary_value', ranking.finished_matches_count)
      ORDER BY ranking.matches_count DESC, ranking.finished_matches_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  ) INTO most_matches
  FROM (
    SELECT team_matches.team_id, teams.name AS team_name, SUM(team_matches.matches_count)::int AS matches_count, SUM(team_matches.finished_matches_count)::int AS finished_matches_count
    FROM (
      SELECT matches.home_team_id AS team_id, COUNT(*)::int AS matches_count, COUNT(*) FILTER (WHERE matches.status = 'FINISHED'::public.match_status)::int AS finished_matches_count
      FROM public.matches AS matches WHERE matches.championship_id = ANY(selected_championship_ids) GROUP BY matches.home_team_id
      UNION ALL
      SELECT matches.away_team_id AS team_id, COUNT(*)::int AS matches_count, COUNT(*) FILTER (WHERE matches.status = 'FINISHED'::public.match_status)::int AS finished_matches_count
      FROM public.matches AS matches WHERE matches.championship_id = ANY(selected_championship_ids) GROUP BY matches.away_team_id
    ) AS team_matches
    INNER JOIN public.teams AS teams ON teams.id = team_matches.team_id
    GROUP BY team_matches.team_id, teams.name
    ORDER BY matches_count DESC, finished_matches_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('team_id', ranking.team_id, 'team_name', ranking.team_name, 'value', ranking.season_count, 'secondary_value', ranking.bracket_count)
      ORDER BY ranking.season_count DESC, ranking.bracket_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  ) INTO most_appearances
  FROM (
    SELECT standings.team_id, teams.name AS team_name, COUNT(DISTINCT standings.season_year)::int AS season_count, COUNT(*)::int AS bracket_count
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY season_count DESC, bracket_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('team_id', ranking.team_id, 'team_name', ranking.team_name, 'value', ranking.total_points, 'secondary_value', ranking.total_wins)
      ORDER BY ranking.total_points DESC, ranking.total_wins DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  ) INTO season_highlights
  FROM (
    SELECT standings.team_id, teams.name AS team_name, SUM(standings.points)::int AS total_points, SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.season_year = resolved_season_year AND standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY total_points DESC, total_wins DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('championship_code', ranking.championship_code, 'team_id', ranking.team_id, 'team_name', ranking.team_name, 'titles_count', ranking.total_points) ORDER BY ranking.championship_order ASC),
    '[]'::jsonb
  ) INTO championship_dominance
  FROM (
    SELECT DISTINCT ON (championships.code)
      championships.code AS championship_code,
      CASE championships.code WHEN 'CLV'::public.championship_code THEN 1 WHEN 'SOCIETY'::public.championship_code THEN 2 WHEN 'INTERLAJE'::public.championship_code THEN 3 ELSE 99 END AS championship_order,
      standings.team_id, teams.name AS team_name, SUM(standings.points)::int AS total_points
    FROM public.standings AS standings
    INNER JOIN public.championships AS championships ON championships.id = standings.championship_id
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY championships.code, standings.team_id, teams.name
    ORDER BY championships.code, total_points DESC, teams.name ASC
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('team_id', ranking.team_id, 'team_name', ranking.team_name, 'value', ranking.modalities_count, 'secondary_value', ranking.championships_count)
      ORDER BY ranking.modalities_count DESC, ranking.championships_count DESC, ranking.team_name ASC),
    '[]'::jsonb
  ) INTO modality_participation
  FROM (
    SELECT standings.team_id, teams.name AS team_name,
      COUNT(DISTINCT (standings.sport_id::text || '-' || standings.naipe::text || '-' || COALESCE(standings.division::text, 'ND')))::int AS modalities_count,
      COUNT(DISTINCT standings.championship_id)::int AS championships_count
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids) AND standings.season_year = resolved_season_year
    GROUP BY standings.team_id, teams.name
    ORDER BY modalities_count DESC, championships_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  WITH season_wins AS (
    SELECT standings.team_id, teams.name AS team_name, SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.season_year = resolved_season_year
      AND standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
  ),
  season_points AS (
    SELECT standings.team_id, teams.name AS team_name, SUM(standings.points)::int AS total_points
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.season_year = resolved_season_year
      AND standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
  ),
  biggest_margin AS (
    SELECT
      CASE
        WHEN matches.home_score > matches.away_score THEN matches.home_team_id
        WHEN matches.away_score > matches.home_score THEN matches.away_team_id
        ELSE NULL
      END AS team_id,
      MAX(ABS(matches.home_score - matches.away_score))::int AS max_margin
    FROM public.matches AS matches
    WHERE matches.status = 'FINISHED'::public.match_status
      AND matches.home_score IS NOT NULL
      AND matches.away_score IS NOT NULL
      AND matches.home_score <> matches.away_score
      AND matches.season_year = resolved_season_year
      AND matches.championship_id = ANY(selected_championship_ids)
    GROUP BY
      CASE
        WHEN matches.home_score > matches.away_score THEN matches.home_team_id
        WHEN matches.away_score > matches.home_score THEN matches.away_team_id
        ELSE NULL
      END
  ),
  biggest_margin_with_team AS (
    SELECT biggest_margin.team_id, teams.name AS team_name, biggest_margin.max_margin AS margin
    FROM biggest_margin
    INNER JOIN public.teams AS teams ON teams.id = biggest_margin.team_id
    ORDER BY biggest_margin.max_margin DESC, teams.name ASC
    LIMIT 1
  ),
  modalities_year AS (
    SELECT standings.team_id, teams.name AS team_name,
      COUNT(DISTINCT (standings.sport_id::text || '-' || standings.naipe::text || '-' || COALESCE(standings.division::text, 'ND')))::int AS modalities_count
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams ON teams.id = standings.team_id
    WHERE standings.season_year = resolved_season_year
      AND standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY modalities_count DESC, teams.name ASC
    LIMIT 1
  ),
  podiums_year AS (
    SELECT
      ranked.team_id,
      teams.name AS team_name,
      COUNT(*) FILTER (WHERE ranked.placement <= 3)::int AS podium_count
    FROM (
      SELECT
        standings.*,
        ROW_NUMBER() OVER (
          PARTITION BY standings.championship_id, standings.sport_id, standings.naipe, standings.division
          ORDER BY standings.points DESC, standings.wins DESC, standings.goal_diff DESC, standings.goals_for DESC, standings.team_id ASC
        ) AS placement
      FROM public.standings AS standings
      WHERE standings.season_year = resolved_season_year
        AND standings.championship_id = ANY(selected_championship_ids)
    ) AS ranked
    INNER JOIN public.teams AS teams ON teams.id = ranked.team_id
    GROUP BY ranked.team_id, teams.name
    ORDER BY podium_count DESC, teams.name ASC
    LIMIT 1
  )
  SELECT COALESCE(
    jsonb_build_array(
      jsonb_build_object(
        'id', 'MOST_WINS',
        'label', 'Mais vitórias no ano',
        'team_name', (SELECT team_name FROM season_wins ORDER BY total_wins DESC, team_name ASC LIMIT 1),
        'value', (SELECT total_wins FROM season_wins ORDER BY total_wins DESC, team_name ASC LIMIT 1),
        'unit', 'vitórias'
      ),
      jsonb_build_object(
        'id', 'MOST_POINTS',
        'label', 'Mais pontos no ano',
        'team_name', (SELECT team_name FROM season_points ORDER BY total_points DESC, team_name ASC LIMIT 1),
        'value', (SELECT total_points FROM season_points ORDER BY total_points DESC, team_name ASC LIMIT 1),
        'unit', 'pontos'
      ),
      jsonb_build_object(
        'id', 'BIGGEST_WIN_MARGIN',
        'label', 'Maior diferença em vitória',
        'team_name', (SELECT team_name FROM biggest_margin_with_team LIMIT 1),
        'value', (SELECT margin FROM biggest_margin_with_team LIMIT 1),
        'unit', 'gols de diferença'
      ),
      jsonb_build_object(
        'id', 'MOST_MODALITIES',
        'label', 'Mais modalidades disputadas',
        'team_name', (SELECT team_name FROM modalities_year LIMIT 1),
        'value', (SELECT modalities_count FROM modalities_year LIMIT 1),
        'unit', 'modalidades'
      ),
      jsonb_build_object(
        'id', 'MOST_PODIUMS',
        'label', 'Mais pódios no ano',
        'team_name', (SELECT team_name FROM podiums_year LIMIT 1),
        'value', (SELECT podium_count FROM podiums_year LIMIT 1),
        'unit', 'pódios'
      )
    ),
    '[]'::jsonb
  )
  INTO season_insights;

  WITH next_day AS (
    SELECT MIN(league_events.event_date) AS event_date
    FROM public.league_events AS league_events
    WHERE league_events.event_date >= CURRENT_DATE
  ),
  next_events_day AS (
    SELECT
      league_events.event_date,
      league_events.name,
      league_events.event_type,
      CASE WHEN league_events.organizer_type = 'LAJE'::public.league_event_organizer_type THEN 'LAJE' ELSE COALESCE(teams.name, 'Atlética') END AS organizer_name
    FROM public.league_events AS league_events
    LEFT JOIN public.teams AS teams ON teams.id = league_events.organizer_team_id
    WHERE league_events.event_date = (SELECT event_date FROM next_day)
    ORDER BY league_events.name ASC
  )
  SELECT CASE WHEN (SELECT event_date FROM next_day) IS NULL THEN NULL ELSE
    jsonb_build_object(
      'event_date', (SELECT event_date FROM next_day),
      'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', next_events_day.name, 'event_type', next_events_day.event_type, 'organizer_name', next_events_day.organizer_name)) FROM next_events_day), '[]'::jsonb)
    )
  END INTO next_event_day;

  WITH next_three AS (
    SELECT
      league_events.event_date,
      league_events.name,
      league_events.event_type,
      CASE WHEN league_events.organizer_type = 'LAJE'::public.league_event_organizer_type THEN 'LAJE' ELSE COALESCE(teams.name, 'Atlética') END AS organizer_name
    FROM public.league_events AS league_events
    LEFT JOIN public.teams AS teams ON teams.id = league_events.organizer_team_id
    WHERE league_events.event_date >= CURRENT_DATE
    ORDER BY league_events.event_date ASC, league_events.name ASC
    LIMIT 3
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('event_date', next_three.event_date, 'name', next_three.name, 'event_type', next_three.event_type, 'organizer_name', next_three.organizer_name)
      ORDER BY next_three.event_date ASC, next_three.name ASC),
    '[]'::jsonb
  ) INTO next_events
  FROM next_three;

  RETURN jsonb_build_object(
    'season_year', resolved_season_year,
    'top_performance', top_performance,
    'most_matches', most_matches,
    'most_appearances', most_appearances,
    'season_highlights', season_highlights,
    'championship_dominance', championship_dominance,
    'modality_participation', modality_participation,
    'season_insights', season_insights,
    'next_event_day', next_event_day,
    'next_events', next_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_dashboard_metrics(INTEGER, public.championship_code) TO anon, authenticated;
