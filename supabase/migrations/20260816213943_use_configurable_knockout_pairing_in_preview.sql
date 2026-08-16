CREATE OR REPLACE FUNCTION championship_bracket_preview_private.create_v8_knockout_matches(_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  competition_record RECORD;
  bracket_size INTEGER;
  direct_qualified_count INTEGER;
  qualified_count INTEGER;
  total_rounds INTEGER;
  round_number_value INTEGER;
  slot_number_value INTEGER;
  round_match_count INTEGER;
  phase_name TEXT;
  predecessor_ids UUID[];
  is_bye_value BOOLEAN;
  home_seed INTEGER;
  away_seed INTEGER;
  home_source JSONB;
  away_source JSONB;
  should_include_best_second_placed_teams BOOLEAN;
  seed_order INTEGER[];
BEGIN
  DELETE FROM championship_bracket_preview_private.knockout_matches
  WHERE job_id = _job_id;

  FOR competition_record IN
    SELECT
      competitions_table.*,
      COALESCE(
        championship_sports_table.default_match_duration_minutes,
        35
      )::integer AS duration_minutes
    FROM championship_bracket_preview_private.competitions competitions_table
    LEFT JOIN public.championship_sports championship_sports_table
      ON championship_sports_table.championship_id = (
        SELECT championship_id
        FROM championship_bracket_preview_private.jobs
        WHERE id = _job_id
      )
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE competitions_table.job_id = _job_id
    ORDER BY
      competitions_table.position,
      competitions_table.competition_key
  LOOP
    direct_qualified_count :=
      competition_record.groups_count
      * competition_record.qualifiers_per_group;

    bracket_size := 1;

    IF competition_record.qualifiers_per_group = 1
      AND competition_record.best_second
    THEN
      WHILE bracket_size <= direct_qualified_count LOOP
        bracket_size := bracket_size * 2;
      END LOOP;
    ELSE
      WHILE bracket_size < direct_qualified_count LOOP
        bracket_size := bracket_size * 2;
      END LOOP;
    END IF;

    should_include_best_second_placed_teams :=
      competition_record.qualifiers_per_group = 1
      AND bracket_size > direct_qualified_count;

    qualified_count := CASE
      WHEN competition_record.qualifiers_per_group IN (1, 2)
        AND bracket_size > direct_qualified_count
      THEN bracket_size
      ELSE direct_qualified_count
    END;

    IF bracket_size < 2 OR qualified_count < 2 THEN
      CONTINUE;
    END IF;

    seed_order :=
      public.resolve_championship_knockout_seed_order(
        competition_record.pairing_mode,
        bracket_size
      );

    IF COALESCE(array_length(seed_order, 1), 0) <> bracket_size THEN
      RAISE EXCEPTION
        'Invalid knockout seed order for competition %, mode %, bracket size %',
        competition_record.id,
        competition_record.pairing_mode,
        bracket_size;
    END IF;

    total_rounds := 0;

    WHILE power(2, total_rounds)::integer < bracket_size LOOP
      total_rounds := total_rounds + 1;
    END LOOP;

    FOR round_number_value IN 1..total_rounds LOOP
      round_match_count :=
        power(
          2,
          total_rounds - round_number_value
        )::integer;

      FOR slot_number_value IN 1..round_match_count LOOP
        SELECT COALESCE(
          array_agg(
            previous_matches.id
            ORDER BY previous_matches.slot_number
          ),
          ARRAY[]::uuid[]
        )
        INTO predecessor_ids
        FROM championship_bracket_preview_private.knockout_matches previous_matches
        WHERE previous_matches.job_id = _job_id
          AND previous_matches.competition_id = competition_record.id
          AND previous_matches.round_number = round_number_value - 1
          AND previous_matches.slot_number IN (
            (slot_number_value * 2) - 1,
            slot_number_value * 2
          )
          AND previous_matches.phase <> 'THIRD_PLACE';

        IF round_number_value = 1 THEN
          home_seed :=
            seed_order[
              ((slot_number_value - 1) * 2) + 1
            ];

          away_seed :=
            seed_order[
              ((slot_number_value - 1) * 2) + 2
            ];
        ELSE
          home_seed := slot_number_value;
          away_seed := bracket_size + 1 - slot_number_value;
        END IF;

        home_source :=
          championship_bracket_preview_private.resolve_v8_knockout_seed_source(
            competition_record.groups_count,
            competition_record.qualifiers_per_group,
            should_include_best_second_placed_teams,
            FALSE,
            home_seed,
            qualified_count
          );

        away_source :=
          championship_bracket_preview_private.resolve_v8_knockout_seed_source(
            competition_record.groups_count,
            competition_record.qualifiers_per_group,
            should_include_best_second_placed_teams,
            FALSE,
            away_seed,
            qualified_count
          );

        is_bye_value :=
          round_number_value = 1
          AND (
            (home_source ->> 'type' = 'BYE')
            <> (away_source ->> 'type' = 'BYE')
          );

        phase_name := CASE
          WHEN round_number_value = total_rounds
            THEN 'FINAL'
          WHEN round_number_value = total_rounds - 1
            THEN 'SEMIFINAL'
          WHEN round_match_count = 4
            THEN 'QUARTERFINAL'
          WHEN round_match_count = 8
            THEN 'ROUND_OF_16'
          WHEN round_match_count = 16
            THEN 'ROUND_OF_32'
          ELSE 'KNOCKOUT'
        END;

        INSERT INTO championship_bracket_preview_private.knockout_matches(
          job_id,
          competition_id,
          phase,
          round_number,
          slot_number,
          logical_key,
          home_source_type,
          home_source_reference,
          away_source_type,
          away_source_reference,
          predecessor_match_ids,
          duration_minutes,
          is_bye
        )
        VALUES (
          _job_id,
          competition_record.id,
          phase_name,
          round_number_value,
          slot_number_value,
          format(
            '%s::%s::%s',
            competition_record.competition_key,
            phase_name,
            slot_number_value
          ),
          CASE
            WHEN round_number_value = 1
              THEN home_source ->> 'type'
            ELSE 'WINNER_OF_MATCH'
          END,
          CASE
            WHEN round_number_value = 1
              THEN home_source ->> 'reference'
            ELSE format(
              'WINNER_OF_%s',
              predecessor_ids[1]
            )
          END,
          CASE
            WHEN round_number_value = 1
              THEN away_source ->> 'type'
            ELSE 'WINNER_OF_MATCH'
          END,
          CASE
            WHEN round_number_value = 1
              THEN away_source ->> 'reference'
            ELSE format(
              'WINNER_OF_%s',
              predecessor_ids[2]
            )
          END,
          predecessor_ids,
          competition_record.duration_minutes,
          is_bye_value
        );
      END LOOP;
    END LOOP;

    IF competition_record.third_place_mode = 'MATCH'
      AND total_rounds > 1
    THEN
      SELECT array_agg(
        semifinals.id
        ORDER BY semifinals.slot_number
      )
      INTO predecessor_ids
      FROM championship_bracket_preview_private.knockout_matches semifinals
      WHERE semifinals.job_id = _job_id
        AND semifinals.competition_id = competition_record.id
        AND semifinals.round_number = total_rounds - 1;

      INSERT INTO championship_bracket_preview_private.knockout_matches(
        job_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        logical_key,
        home_source_type,
        home_source_reference,
        away_source_type,
        away_source_reference,
        predecessor_match_ids,
        duration_minutes
      )
      VALUES (
        _job_id,
        competition_record.id,
        'THIRD_PLACE',
        total_rounds,
        2,
        format(
          '%s::THIRD_PLACE::1',
          competition_record.competition_key
        ),
        'LOSER_OF_MATCH',
        format(
          'LOSER_OF_%s',
          predecessor_ids[1]
        ),
        'LOSER_OF_MATCH',
        format(
          'LOSER_OF_%s',
          predecessor_ids[2]
        ),
        predecessor_ids,
        competition_record.duration_minutes
      );
    END IF;
  END LOOP;
END;
$function$;