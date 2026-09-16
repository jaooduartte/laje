-- LAJE-102
-- Enriquece o destaque de maior diferença em vitória sem duplicar a implementação
-- principal do dashboard. A função anterior é preservada como base e o resultado
-- é complementado com modalidade, naipe e unidade coerente com o tipo de placar.

ALTER FUNCTION public.get_home_dashboard_metrics(integer, public.championship_code)
  RENAME TO get_home_dashboard_metrics_base_20260916;

CREATE OR REPLACE FUNCTION public.get_home_dashboard_metrics(
  _season_year integer DEFAULT NULL::integer,
  _championship_code public.championship_code DEFAULT NULL::public.championship_code
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  dashboard_metrics jsonb;
  biggest_win_detail jsonb;
BEGIN
  dashboard_metrics := public.get_home_dashboard_metrics_base_20260916(
    _season_year,
    _championship_code
  );

  SELECT jsonb_build_object(
    'team_name', margin_match.team_name,
    'value', margin_match.margin,
    'unit', margin_match.margin_unit,
    'season_year', margin_match.season_year,
    'championship_code', margin_match.championship_code,
    'sport_name', margin_match.sport_name,
    'naipe', margin_match.naipe
  )
  INTO biggest_win_detail
  FROM (
    SELECT
      CASE
        WHEN matches.home_score > matches.away_score THEN home_team.name
        ELSE away_team.name
      END AS team_name,
      ABS(matches.home_score - matches.away_score)::integer AS margin,
      matches.season_year,
      championships.code AS championship_code,
      sports_table.name AS sport_name,
      matches.naipe,
      CASE
        WHEN COALESCE(sports_table.code, '') IN (
          'BEACH_SOCCER',
          'FUTEBOL_SOCIETY',
          'FUTSAL',
          'HANDEBOL'
        )
          OR sports_table.name ILIKE '%beach soccer%'
          OR sports_table.name ILIKE '%society%'
          OR sports_table.name ILIKE '%futsal%'
          OR sports_table.name ILIKE '%handebol%'
          OR sports_table.name ILIKE '%futebol%'
        THEN 'gols'
        ELSE 'pontos'
      END AS margin_unit
    FROM public.matches AS matches
    INNER JOIN public.championships AS championships
      ON championships.id = matches.championship_id
    INNER JOIN public.sports AS sports_table
      ON sports_table.id = matches.sport_id
    LEFT JOIN public.teams AS home_team
      ON home_team.id = matches.home_team_id
    LEFT JOIN public.teams AS away_team
      ON away_team.id = matches.away_team_id
    WHERE matches.status = 'FINISHED'::public.match_status
      AND matches.home_score IS NOT NULL
      AND matches.away_score IS NOT NULL
      AND matches.home_score <> matches.away_score
      AND (_championship_code IS NULL OR championships.code = _championship_code)
    ORDER BY
      ABS(matches.home_score - matches.away_score) DESC,
      matches.season_year DESC,
      CASE
        WHEN matches.home_score > matches.away_score THEN home_team.name
        ELSE away_team.name
      END ASC
    LIMIT 1
  ) AS margin_match;

  IF biggest_win_detail IS NOT NULL THEN
    dashboard_metrics := jsonb_set(
      dashboard_metrics,
      '{season_insights}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN insight.item ->> 'id' = 'BIGGEST_WIN_MARGIN'
                THEN insight.item || biggest_win_detail
              ELSE insight.item
            END
            ORDER BY insight.ordinality
          )
          FROM jsonb_array_elements(
            COALESCE(dashboard_metrics -> 'season_insights', '[]'::jsonb)
          ) WITH ORDINALITY AS insight(item, ordinality)
        ),
        '[]'::jsonb
      ),
      true
    );
  END IF;

  RETURN dashboard_metrics;
END;
$function$;
