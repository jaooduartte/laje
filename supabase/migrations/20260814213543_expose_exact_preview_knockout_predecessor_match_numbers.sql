ALTER FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  RENAME TO get_championship_bracket_preview_job_day_v9;

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
  knockout_record RECORD;
  location_index INTEGER;
  court_index INTEGER;
  entries JSONB;
  display_match_numbers JSONB;
BEGIN
  result := public.get_championship_bracket_preview_job_day_v9(_job_id, _date);

  WITH RECURSIVE scheduled_matches AS (
    SELECT
      matches_table.id AS match_id,
      matches_table.slot_number AS fixed_match_number,
      slots_table.start_at,
      slots_table.location_key,
      slots_table.court_key,
      competitions_table.sport_id,
      competitions_table.naipe,
      COALESCE(
        jobs_table.payload ->> 'match_numbering_mode',
        'COURT'
      ) AS match_numbering_mode
    FROM championship_bracket_preview_private.assignments AS assignments_table
    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.id = assignments_table.match_id
    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.id = assignments_table.slot_id
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id
    JOIN championship_bracket_preview_private.jobs AS jobs_table
      ON jobs_table.id = assignments_table.job_id
    WHERE assignments_table.job_id = _job_id

    UNION ALL

    SELECT
      knockout_matches.id AS match_id,
      NULL::INTEGER AS fixed_match_number,
      knockout_matches.start_at,
      knockout_matches.location_key,
      knockout_matches.court_key,
      competitions_table.sport_id,
      competitions_table.naipe,
      COALESCE(
        jobs_table.payload ->> 'match_numbering_mode',
        'COURT'
      ) AS match_numbering_mode
    FROM championship_bracket_preview_private.knockout_matches
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = knockout_matches.competition_id
    JOIN championship_bracket_preview_private.jobs AS jobs_table
      ON jobs_table.id = knockout_matches.job_id
    WHERE knockout_matches.job_id = _job_id
      AND NOT knockout_matches.is_bye
      AND knockout_matches.scheduled_date IS NOT NULL
      AND knockout_matches.start_at IS NOT NULL
      AND knockout_matches.location_key IS NOT NULL
      AND knockout_matches.court_key IS NOT NULL
  ),
  ordered_matches AS (
    SELECT
      scheduled_matches.*,
      CASE scheduled_matches.match_numbering_mode
        WHEN 'SPORT_NAIPE' THEN format(
          '%s::%s',
          scheduled_matches.sport_id,
          scheduled_matches.naipe
        )
        WHEN 'SPORT' THEN scheduled_matches.sport_id::TEXT
        ELSE format(
          '%s::%s',
          scheduled_matches.location_key,
          scheduled_matches.court_key
        )
      END AS numbering_key,
      row_number() OVER (
        PARTITION BY CASE scheduled_matches.match_numbering_mode
          WHEN 'SPORT_NAIPE' THEN format(
            '%s::%s',
            scheduled_matches.sport_id,
            scheduled_matches.naipe
          )
          WHEN 'SPORT' THEN scheduled_matches.sport_id::TEXT
          ELSE format(
            '%s::%s',
            scheduled_matches.location_key,
            scheduled_matches.court_key
          )
        END
        ORDER BY
          scheduled_matches.start_at,
          scheduled_matches.location_key,
          scheduled_matches.court_key,
          scheduled_matches.match_id
      ) AS chronology_position
    FROM scheduled_matches
  ),
  numbered_matches AS (
    SELECT
      ordered_matches.*,
      COALESCE(ordered_matches.fixed_match_number, 1) AS display_match_number
    FROM ordered_matches
    WHERE ordered_matches.chronology_position = 1

    UNION ALL

    SELECT
      next_match.*,
      COALESCE(
        next_match.fixed_match_number,
        current_match.display_match_number + 1
      ) AS display_match_number
    FROM numbered_matches AS current_match
    JOIN ordered_matches AS next_match
      ON next_match.numbering_key = current_match.numbering_key
      AND next_match.chronology_position = current_match.chronology_position + 1
  )
  SELECT COALESCE(
    jsonb_object_agg(
      numbered_matches.match_id::TEXT,
      numbered_matches.display_match_number
    ),
    '{}'::JSONB
  )
  INTO display_match_numbers
  FROM numbered_matches;

  FOR knockout_record IN
    SELECT
      knockout_matches.*,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division
    FROM championship_bracket_preview_private.knockout_matches
    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = knockout_matches.competition_id
    WHERE knockout_matches.job_id = _job_id
      AND knockout_matches.scheduled_date = _date
      AND NOT knockout_matches.is_bye
    ORDER BY knockout_matches.start_at, knockout_matches.logical_key
  LOOP
    SELECT
      location_item.ordinality::INTEGER - 1,
      court_item.ordinality::INTEGER - 1
    INTO location_index, court_index
    FROM jsonb_array_elements(COALESCE(result -> 'locations', '[]'::JSONB))
      WITH ORDINALITY location_item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(location_item.value -> 'courts', '[]'::JSONB)
    ) WITH ORDINALITY court_item(value, ordinality)
    WHERE location_item.value ->> 'location_key' = knockout_record.location_key::TEXT
      AND court_item.value ->> 'court_key' = knockout_record.court_key::TEXT
    LIMIT 1;

    IF location_index IS NULL THEN
      CONTINUE;
    END IF;

    SELECT jsonb_agg(
      CASE
        WHEN item.value ->> 'type' = 'MATCH'
          AND item.value ->> 'match_kind' = 'KNOCKOUT'
          AND item.value ->> 'sport_id' = knockout_record.sport_id::TEXT
          AND COALESCE(item.value ->> 'naipe', '') = COALESCE(
            knockout_record.naipe::TEXT,
            ''
          )
          AND COALESCE(item.value ->> 'division', '') = COALESCE(
            knockout_record.division::TEXT,
            ''
          )
          AND item.value ->> 'phase' = knockout_record.phase
          AND item.value ->> 'start_time' = to_char(
            knockout_record.start_at AT TIME ZONE 'America/Sao_Paulo',
            'HH24:MI'
          )
          AND COALESCE(item.value ->> 'reason', '') = format(
            '%s × %s',
            knockout_record.home_source_reference,
            knockout_record.away_source_reference
          )
        THEN item.value || jsonb_strip_nulls(jsonb_build_object(
          'match_number',
          NULLIF(
            display_match_numbers ->> knockout_record.id::TEXT,
            ''
          )::INTEGER,
          'home_source_match_number',
          NULLIF(
            display_match_numbers ->> regexp_replace(
              knockout_record.home_source_reference,
              '^(WINNER|LOSER)_OF_',
              ''
            ),
            ''
          )::INTEGER,
          'away_source_match_number',
          NULLIF(
            display_match_numbers ->> regexp_replace(
              knockout_record.away_source_reference,
              '^(WINNER|LOSER)_OF_',
              ''
            ),
            ''
          )::INTEGER
        ))
        ELSE item.value
      END
      ORDER BY item.ordinality
    )
    INTO entries
    FROM jsonb_array_elements(
      COALESCE(
        result #> ARRAY[
          'locations',
          location_index::TEXT,
          'courts',
          court_index::TEXT,
          'entries'
        ],
        '[]'::JSONB
      )
    ) WITH ORDINALITY item(value, ordinality);

    result := jsonb_set(
      result,
      ARRAY[
        'locations',
        location_index::TEXT,
        'courts',
        court_index::TEXT,
        'entries'
      ],
      COALESCE(entries, '[]'::JSONB)
    );
  END LOOP;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_championship_bracket_preview_job_day(UUID, DATE)
  TO authenticated;
