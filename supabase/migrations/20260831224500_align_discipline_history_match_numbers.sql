CREATE OR REPLACE FUNCTION public.get_championship_yellow_card_discipline(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH resolved_season AS (
    SELECT COALESCE(_season_year, championships_table.current_season_year) AS season_year
    FROM public.championships AS championships_table
    WHERE championships_table.id = _championship_id
    LIMIT 1
  ),
  bracket_editions AS (
    SELECT DISTINCT ON (editions_table.championship_id, editions_table.season_year)
      editions_table.championship_id,
      editions_table.season_year,
      editions_table.payload_snapshot
    FROM public.championship_bracket_editions AS editions_table
    JOIN resolved_season
      ON resolved_season.season_year = editions_table.season_year
    WHERE editions_table.championship_id = _championship_id
    ORDER BY editions_table.championship_id, editions_table.season_year, editions_table.updated_at DESC, editions_table.id DESC
  ),
  numbered_matches AS (
    SELECT numbered_matches_source.id,
      row_number() OVER (
        PARTITION BY numbered_matches_source.numbering_scope
        ORDER BY numbered_matches_source.scheduled_date,
          numbered_matches_source.start_time NULLS LAST,
          COALESCE(numbered_matches_source.scheduled_slot, numbered_matches_source.queue_position) NULLS LAST,
          numbered_matches_source.created_at,
          numbered_matches_source.id
      )::INTEGER AS match_number
    FROM (
      SELECT matches_table.id,
        matches_table.scheduled_date,
        matches_table.start_time,
        matches_table.scheduled_slot,
        matches_table.queue_position,
        matches_table.created_at,
        CASE
          WHEN bracket_editions.payload_snapshot ->> 'match_numbering_mode' = 'SPORT_NAIPE'
            THEN concat_ws('::', matches_table.sport_id::TEXT, matches_table.naipe::TEXT)
          WHEN bracket_editions.payload_snapshot ->> 'match_numbering_mode' = 'SPORT'
            THEN matches_table.sport_id::TEXT
          ELSE concat_ws('::', matches_table.location, matches_table.court_name)
        END AS numbering_scope
      FROM public.matches AS matches_table
      JOIN resolved_season
        ON resolved_season.season_year = matches_table.season_year
      LEFT JOIN bracket_editions
        ON bracket_editions.championship_id = matches_table.championship_id
        AND bracket_editions.season_year = matches_table.season_year
      WHERE matches_table.championship_id = _championship_id
        AND matches_table.scheduled_date IS NOT NULL
        AND (
          COALESCE(bracket_editions.payload_snapshot ->> 'match_numbering_mode', 'COURT') IN ('SPORT', 'SPORT_NAIPE')
          OR (
            NULLIF(btrim(matches_table.location), '') IS NOT NULL
            AND NULLIF(btrim(matches_table.court_name), '') IS NOT NULL
          )
        )
    ) AS numbered_matches_source
  ),
  discipline AS (
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
                'match_number', COALESCE(
                  numbered_matches.match_number,
                  matches_table.scheduled_slot,
                  matches_table.queue_position
                ),
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
            LEFT JOIN numbered_matches
              ON numbered_matches.id = matches_table.id
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
