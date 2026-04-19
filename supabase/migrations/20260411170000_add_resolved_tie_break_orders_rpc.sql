CREATE OR REPLACE FUNCTION public.get_championship_bracket_resolved_tie_break_orders(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_season_year INTEGER;
BEGIN
  SELECT COALESCE(
    _season_year,
    championships_table.current_season_year,
    date_part('year', timezone('America/Sao_Paulo', now()))::integer
  )
  INTO resolved_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    resolved_season_year := date_part('year', timezone('America/Sao_Paulo', now()))::integer;
  END IF;

  RETURN COALESCE(
    (
      WITH latest_edition AS (
        SELECT editions_table.id
        FROM public.championship_bracket_editions AS editions_table
        WHERE editions_table.championship_id = _championship_id
          AND editions_table.season_year = resolved_season_year
        ORDER BY editions_table.created_at DESC
        LIMIT 1
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'context_key', resolved_contexts.context_key,
          'competition_id', resolved_contexts.competition_id,
          'sport_id', resolved_contexts.sport_id,
          'sport_name', resolved_contexts.sport_name,
          'naipe', resolved_contexts.naipe,
          'division', resolved_contexts.division,
          'context_type', resolved_contexts.context_type,
          'group_id', resolved_contexts.group_id,
          'group_number', resolved_contexts.group_number,
          'qualification_rank', resolved_contexts.qualification_rank,
          'team_ids', resolved_contexts.team_ids
        )
        ORDER BY
          CASE resolved_contexts.context_type
            WHEN 'GROUP'::public.championship_bracket_tie_break_context_type THEN 1
            ELSE 2
          END,
          resolved_contexts.sport_name ASC,
          resolved_contexts.naipe ASC,
          resolved_contexts.group_number ASC NULLS FIRST,
          resolved_contexts.qualification_rank ASC NULLS FIRST,
          resolved_contexts.context_key ASC
      )
      FROM (
        SELECT
          resolutions_table.context_key,
          resolutions_table.competition_id,
          competitions_table.sport_id,
          sports_table.name AS sport_name,
          competitions_table.naipe,
          competitions_table.division,
          resolutions_table.context_type,
          resolutions_table.group_id,
          groups_table.group_number,
          resolutions_table.qualification_rank,
          array_agg(resolution_teams_table.team_id ORDER BY resolution_teams_table.draw_order ASC) AS team_ids
        FROM public.championship_bracket_tie_break_resolutions AS resolutions_table
        JOIN public.championship_bracket_competitions AS competitions_table
          ON competitions_table.id = resolutions_table.competition_id
        JOIN latest_edition
          ON latest_edition.id = competitions_table.bracket_edition_id
        JOIN public.sports AS sports_table
          ON sports_table.id = competitions_table.sport_id
        LEFT JOIN public.championship_bracket_groups AS groups_table
          ON groups_table.id = resolutions_table.group_id
        JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
          ON resolution_teams_table.resolution_id = resolutions_table.id
        GROUP BY
          resolutions_table.context_key,
          resolutions_table.competition_id,
          competitions_table.sport_id,
          sports_table.name,
          competitions_table.naipe,
          competitions_table.division,
          resolutions_table.context_type,
          resolutions_table.group_id,
          groups_table.group_number,
          resolutions_table.qualification_rank
        HAVING count(resolution_teams_table.id) > 0
      ) AS resolved_contexts
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_resolved_tie_break_orders(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.get_championship_bracket_resolved_tie_break_orders(UUID, INTEGER)
IS 'Retorna os desempates manuais resolvidos por temporada, com identificação de modalidade/naipe/divisão e ordem final das atléticas por contexto.';

NOTIFY pgrst, 'reload schema';
