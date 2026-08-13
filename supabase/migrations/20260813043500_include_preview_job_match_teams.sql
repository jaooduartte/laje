-- Expõe as atléticas dos jogos de grupos já materializados pela prévia exata.
ALTER FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  RENAME TO get_championship_bracket_preview_job_day_v8;

CREATE OR REPLACE FUNCTION public.get_championship_bracket_preview_job_day(
  _job_id UUID,
  _date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  result JSONB;
  scheduled_match RECORD;
  location_index INTEGER;
  court_index INTEGER;
  entries JSONB;
BEGIN
  result := public.get_championship_bracket_preview_job_day_v8(_job_id, _date);

  FOR scheduled_match IN
    SELECT
      slots_table.location_key,
      slots_table.court_key,
      assignments_table.match_number,
      matches_table.home_team_id,
      home_teams_table.name AS home_team_name,
      matches_table.away_team_id,
      away_teams_table.name AS away_team_name
    FROM championship_bracket_preview_private.assignments AS assignments_table
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.id = assignments_table.slot_id
    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.id = assignments_table.match_id
    JOIN public.teams AS home_teams_table
      ON home_teams_table.id = matches_table.home_team_id
    JOIN public.teams AS away_teams_table
      ON away_teams_table.id = matches_table.away_team_id
    WHERE assignments_table.job_id = _job_id
      AND slots_table.event_date = _date
  LOOP
    SELECT
      location_item.ordinality::integer - 1,
      court_item.ordinality::integer - 1
    INTO location_index, court_index
    FROM jsonb_array_elements(COALESCE(result -> 'locations', '[]'::jsonb))
      WITH ORDINALITY location_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(location_item.value -> 'courts', '[]'::jsonb)
    ) WITH ORDINALITY court_item(value, ordinality)
    WHERE location_item.value ->> 'location_key' = scheduled_match.location_key::text
      AND court_item.value ->> 'court_key' = scheduled_match.court_key::text
    LIMIT 1;

    IF location_index IS NULL THEN
      CONTINUE;
    END IF;

    SELECT jsonb_agg(
      CASE
        WHEN item.value ->> 'type' = 'MATCH'
          AND item.value ->> 'match_kind' = 'GROUP_STAGE'
          AND item.value ->> 'match_number' = scheduled_match.match_number::text
        THEN item.value || jsonb_build_object(
          'home_team_id', scheduled_match.home_team_id,
          'home_team_name', scheduled_match.home_team_name,
          'away_team_id', scheduled_match.away_team_id,
          'away_team_name', scheduled_match.away_team_name
        )
        ELSE item.value
      END
      ORDER BY item.ordinality
    )
    INTO entries
    FROM jsonb_array_elements(
      COALESCE(
        result #> ARRAY[
          'locations',
          location_index::text,
          'courts',
          court_index::text,
          'entries'
        ],
        '[]'::jsonb
      )
    ) WITH ORDINALITY item(value, ordinality);

    result := jsonb_set(
      result,
      ARRAY[
        'locations',
        location_index::text,
        'courts',
        court_index::text,
        'entries'
      ],
      COALESCE(entries, '[]'::jsonb)
    );
  END LOOP;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  TO authenticated;
