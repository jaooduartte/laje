ALTER FUNCTION public.get_championship_yellow_card_discipline(UUID, INTEGER)
  RENAME TO get_championship_yellow_card_discipline_raw;

CREATE FUNCTION public.get_championship_yellow_card_discipline(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH discipline AS (
    SELECT public.get_championship_yellow_card_discipline_raw(
      _championship_id,
      _season_year
    ) AS payload
  )
  SELECT jsonb_build_object(
    'season_year', discipline.payload -> 'season_year',
    'athletes', COALESCE((
      SELECT jsonb_agg(
        (athlete.value - 'red_cards_derived_total') || jsonb_build_object(
          'matches', COALESCE((
            SELECT jsonb_agg(
              (history.value - 'red_cards_derived') || jsonb_build_object(
                'match_number', matches_table.global_queue_order,
                'opponent_name', CASE
                  WHEN matches_table.home_team_id = (athlete.value ->> 'team_id')::UUID THEN away_teams_table.name
                  WHEN matches_table.away_team_id = (athlete.value ->> 'team_id')::UUID THEN home_teams_table.name
                  ELSE NULL
                END
              )
              ORDER BY history.position
            )
            FROM jsonb_array_elements(
              COALESCE(athlete.value -> 'matches', '[]'::jsonb)
            ) WITH ORDINALITY AS history(value, position)
            LEFT JOIN public.matches AS matches_table
              ON matches_table.id = (history.value ->> 'match_id')::UUID
            LEFT JOIN public.teams AS home_teams_table
              ON home_teams_table.id = matches_table.home_team_id
            LEFT JOIN public.teams AS away_teams_table
              ON away_teams_table.id = matches_table.away_team_id
          ), '[]'::jsonb)
        )
      )
      FROM jsonb_array_elements(
        COALESCE(discipline.payload -> 'athletes', '[]'::jsonb)
      ) AS athlete(value)
    ), '[]'::jsonb)
  )
  FROM discipline;
$func$;

REVOKE ALL ON FUNCTION public.get_championship_yellow_card_discipline_raw(UUID, INTEGER) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_championship_yellow_card_discipline(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_championship_yellow_card_discipline(UUID, INTEGER) TO anon, authenticated;
