CREATE OR REPLACE FUNCTION public.get_championship_available_season_years(
  _championship_id UUID
)
RETURNS TABLE(season_year INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
SET statement_timeout = '4s'
AS $$
  SELECT DISTINCT available_years.season_year
  FROM (
    SELECT matches_table.season_year
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = _championship_id

    UNION ALL

    SELECT standings_table.season_year
    FROM public.standings AS standings_table
    WHERE standings_table.championship_id = _championship_id

    UNION ALL

    SELECT editions_table.season_year
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id

    UNION ALL

    SELECT events_table.season_year
    FROM public.championship_individual_events AS events_table
    WHERE events_table.championship_id = _championship_id

    UNION ALL

    SELECT sessions_table.season_year
    FROM public.championship_individual_sessions AS sessions_table
    WHERE sessions_table.championship_id = _championship_id

    UNION ALL

    SELECT individual_standings_table.season_year
    FROM public.championship_individual_team_standings AS individual_standings_table
    WHERE individual_standings_table.championship_id = _championship_id
  ) AS available_years
  WHERE available_years.season_year IS NOT NULL
  ORDER BY available_years.season_year DESC;
$$;

REVOKE ALL ON FUNCTION public.get_championship_available_season_years(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_available_season_years(UUID) TO anon, authenticated;
