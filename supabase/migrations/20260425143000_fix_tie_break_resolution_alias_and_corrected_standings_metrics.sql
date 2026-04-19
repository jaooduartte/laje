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

  SELECT string_agg(ordered_team_id_value::text, '|' ORDER BY ordered_team_id_value::text)
  INTO sorted_signature
  FROM unnest(ordered_team_ids) AS ordered_team_id_value;

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

DROP FUNCTION IF EXISTS public.get_championship_corrected_group_standings(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_championship_corrected_group_standings(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS TABLE(
  competition_id UUID,
  sport_id UUID,
  sport_name TEXT,
  naipe public.match_naipe,
  division public.team_division,
  group_id UUID,
  group_number INTEGER,
  group_size INTEGER,
  team_id UUID,
  team_name TEXT,
  wins BIGINT,
  points_base BIGINT,
  correction_factor NUMERIC,
  corrected_points NUMERIC,
  goals_for BIGINT,
  goals_against BIGINT,
  goal_diff BIGINT,
  yellow_cards BIGINT,
  red_cards BIGINT,
  points_average NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH edition_context AS (
    SELECT
      COALESCE(
        (
          SELECT editions_table.id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
            AND (_season_year IS NULL OR editions_table.season_year = _season_year)
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        ),
        (
          SELECT editions_table.id
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        )
      ) AS bracket_edition_id,
      COALESCE(
        _season_year,
        (
          SELECT editions_table.season_year
          FROM public.championship_bracket_editions AS editions_table
          WHERE editions_table.championship_id = _championship_id
          ORDER BY editions_table.created_at DESC
          LIMIT 1
        )
      ) AS season_year
  ),
  competition_context AS (
    SELECT
      competitions_table.id AS competition_id,
      competitions_table.sport_id,
      sports_table.name AS sport_name,
      competitions_table.naipe,
      competitions_table.division
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN edition_context
      ON edition_context.bracket_edition_id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  group_rankings AS (
    SELECT
      competition_context.competition_id,
      competition_context.sport_id,
      competition_context.sport_name,
      competition_context.naipe,
      competition_context.division,
      rankings_table.group_id,
      rankings_table.group_number,
      rankings_table.team_id,
      rankings_table.team_name,
      rankings_table.wins,
      rankings_table.points,
      rankings_table.goal_diff,
      rankings_table.goals_for
    FROM competition_context
    CROSS JOIN LATERAL public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      competition_context.competition_id
    ) AS rankings_table
  ),
  group_sizes AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.group_number,
      count(*)::int AS group_size
    FROM group_rankings
    GROUP BY group_rankings.competition_id, group_rankings.group_id, group_rankings.group_number
  ),
  competition_match_span AS (
    SELECT
      group_sizes.competition_id,
      GREATEST(
        COALESCE(max(GREATEST(group_sizes.group_size - 1, 1)), 1),
        1
      )::numeric AS max_matches_in_competition
    FROM group_sizes
    GROUP BY group_sizes.competition_id
  )
  SELECT
    group_rankings.competition_id,
    group_rankings.sport_id,
    group_rankings.sport_name,
    group_rankings.naipe,
    group_rankings.division,
    group_rankings.group_id,
    group_rankings.group_number,
    group_sizes.group_size,
    group_rankings.team_id,
    group_rankings.team_name,
    group_rankings.wins,
    group_rankings.points AS points_base,
    competition_match_span.max_matches_in_competition / GREATEST(group_sizes.group_size - 1, 1)::numeric AS correction_factor,
    group_rankings.points::numeric * (
      competition_match_span.max_matches_in_competition / GREATEST(group_sizes.group_size - 1, 1)::numeric
    ) AS corrected_points,
    standings_metrics.goals_for,
    standings_metrics.goals_against,
    standings_metrics.goal_diff,
    standings_metrics.yellow_cards,
    standings_metrics.red_cards,
    CASE
      WHEN standings_metrics.goals_against = 0 THEN
        CASE
          WHEN standings_metrics.goals_for = 0 THEN 0::numeric
          ELSE 1000000000::numeric
        END
      ELSE standings_metrics.goals_for::numeric / standings_metrics.goals_against::numeric
    END AS points_average
  FROM group_rankings
  JOIN group_sizes
    ON group_sizes.competition_id = group_rankings.competition_id
    AND group_sizes.group_id = group_rankings.group_id
  JOIN competition_match_span
    ON competition_match_span.competition_id = group_rankings.competition_id
  CROSS JOIN edition_context
  LEFT JOIN public.standings AS standings_table
    ON standings_table.championship_id = _championship_id
    AND standings_table.season_year = edition_context.season_year
    AND standings_table.sport_id = group_rankings.sport_id
    AND standings_table.naipe = group_rankings.naipe
    AND standings_table.division IS NOT DISTINCT FROM group_rankings.division
    AND standings_table.team_id = group_rankings.team_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(standings_table.goals_for, group_rankings.goals_for)::bigint AS goals_for,
      COALESCE(
        standings_table.goals_against,
        GREATEST(group_rankings.goals_for - group_rankings.goal_diff, 0)
      )::bigint AS goals_against,
      COALESCE(standings_table.goal_diff, group_rankings.goal_diff)::bigint AS goal_diff,
      COALESCE(standings_table.yellow_cards, 0)::bigint AS yellow_cards,
      COALESCE(standings_table.red_cards, 0)::bigint AS red_cards
  ) AS standings_metrics
  ORDER BY
    group_rankings.sport_name ASC,
    group_rankings.naipe ASC,
    group_rankings.division ASC NULLS FIRST,
    group_rankings.group_number ASC,
    corrected_points DESC,
    points_average DESC,
    standings_metrics.goal_diff DESC,
    standings_metrics.goals_for DESC,
    standings_metrics.yellow_cards ASC,
    standings_metrics.red_cards ASC,
    group_rankings.team_name ASC;
$func$;

GRANT EXECUTE ON FUNCTION public.get_championship_corrected_group_standings(UUID, INTEGER) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
