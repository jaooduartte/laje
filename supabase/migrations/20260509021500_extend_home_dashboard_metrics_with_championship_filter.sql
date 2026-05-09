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
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.total_points,
        'secondary_value', ranking.total_wins
      )
      ORDER BY ranking.total_points DESC, ranking.total_wins DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO top_performance
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      SUM(standings.points)::int AS total_points,
      SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY total_points DESC, total_wins DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.matches_count,
        'secondary_value', ranking.finished_matches_count
      )
      ORDER BY ranking.matches_count DESC, ranking.finished_matches_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO most_matches
  FROM (
    SELECT
      team_matches.team_id,
      teams.name AS team_name,
      SUM(team_matches.matches_count)::int AS matches_count,
      SUM(team_matches.finished_matches_count)::int AS finished_matches_count
    FROM (
      SELECT
        matches.home_team_id AS team_id,
        COUNT(*)::int AS matches_count,
        COUNT(*) FILTER (WHERE matches.status = 'FINISHED'::public.match_status)::int AS finished_matches_count
      FROM public.matches AS matches
      WHERE matches.championship_id = ANY(selected_championship_ids)
      GROUP BY matches.home_team_id

      UNION ALL

      SELECT
        matches.away_team_id AS team_id,
        COUNT(*)::int AS matches_count,
        COUNT(*) FILTER (WHERE matches.status = 'FINISHED'::public.match_status)::int AS finished_matches_count
      FROM public.matches AS matches
      WHERE matches.championship_id = ANY(selected_championship_ids)
      GROUP BY matches.away_team_id
    ) AS team_matches
    INNER JOIN public.teams AS teams
      ON teams.id = team_matches.team_id
    GROUP BY team_matches.team_id, teams.name
    ORDER BY matches_count DESC, finished_matches_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.season_count,
        'secondary_value', ranking.bracket_count
      )
      ORDER BY ranking.season_count DESC, ranking.bracket_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO most_appearances
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      COUNT(DISTINCT standings.season_year)::int AS season_count,
      COUNT(*)::int AS bracket_count
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY season_count DESC, bracket_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.total_points,
        'secondary_value', ranking.total_wins
      )
      ORDER BY ranking.total_points DESC, ranking.total_wins DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO season_highlights
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      SUM(standings.points)::int AS total_points,
      SUM(standings.wins)::int AS total_wins
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    WHERE standings.season_year = resolved_season_year
      AND standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY total_points DESC, total_wins DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'championship_code', ranking.championship_code,
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'titles_count', ranking.titles_count
      )
      ORDER BY ranking.championship_code ASC
    ),
    '[]'::jsonb
  )
  INTO championship_dominance
  FROM (
    SELECT DISTINCT ON (championships.code)
      championships.code AS championship_code,
      standings.team_id,
      teams.name AS team_name,
      SUM(standings.points)::int AS titles_count
    FROM public.standings AS standings
    INNER JOIN public.championships AS championships
      ON championships.id = standings.championship_id
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY championships.code, standings.team_id, teams.name
    ORDER BY championships.code, titles_count DESC, teams.name ASC
  ) AS ranking;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id', ranking.team_id,
        'team_name', ranking.team_name,
        'value', ranking.modalities_count,
        'secondary_value', ranking.championships_count
      )
      ORDER BY ranking.modalities_count DESC, ranking.championships_count DESC, ranking.team_name ASC
    ),
    '[]'::jsonb
  )
  INTO modality_participation
  FROM (
    SELECT
      standings.team_id,
      teams.name AS team_name,
      COUNT(DISTINCT (standings.sport_id::text || '-' || standings.naipe::text || '-' || COALESCE(standings.division::text, 'ND')))::int AS modalities_count,
      COUNT(DISTINCT standings.championship_id)::int AS championships_count
    FROM public.standings AS standings
    INNER JOIN public.teams AS teams
      ON teams.id = standings.team_id
    WHERE standings.championship_id = ANY(selected_championship_ids)
    GROUP BY standings.team_id, teams.name
    ORDER BY modalities_count DESC, championships_count DESC, teams.name ASC
    LIMIT 5
  ) AS ranking;

  RETURN jsonb_build_object(
    'season_year', resolved_season_year,
    'top_performance', top_performance,
    'most_matches', most_matches,
    'most_appearances', most_appearances,
    'season_highlights', season_highlights,
    'championship_dominance', championship_dominance,
    'modality_participation', modality_participation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_dashboard_metrics(INTEGER, public.championship_code) TO anon, authenticated;
