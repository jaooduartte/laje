-- PL/pgSQL: label <<knockout_gen>> para qualificar variáveis em UPDATE/SET (evita 42P01: nome da função interpretado como relação).
-- Desambigua source_*_bracket_match_id em WHERE com colunas homónimas (evita 42702).

CREATE OR REPLACE FUNCTION public.generate_championship_knockout_for_competition(
  _championship_id UUID,
  _competition_id UUID,
  _bracket_edition_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
<<knockout_gen>>
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  qualified_team_count INTEGER;
  group_count_value INTEGER;
  finished_group_count_value INTEGER;
  all_groups_finished BOOLEAN := false;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  round_number INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  semifinal_match_ids UUID[];
  source_home_bracket_match_id UUID;
  source_away_bracket_match_id UUID;
  source_home_winner_team_id UUID;
  source_away_winner_team_id UUID;
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
  existing_knockout_count INTEGER;
  existing_match_id UUID;
  existing_match_status public.match_status;
  desired_winner_team_id UUID;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.sport_id,
    competitions_table.naipe,
    competitions_table.division,
    competitions_table.qualifiers_per_group,
    competitions_table.should_complete_knockout_with_best_second_placed_teams,
    competitions_table.third_place_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
    AND (_bracket_edition_id IS NULL OR competitions_table.bracket_edition_id = _bracket_edition_id)
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  bracket_edition_id := competition_record.bracket_edition_id;
  third_place_mode_value := competition_record.third_place_mode;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE group_statuses.is_group_finished)::int,
    bool_and(group_statuses.is_group_finished)
  INTO
    group_count_value,
    finished_group_count_value,
    all_groups_finished
  FROM (
    SELECT
      groups_table.id,
      (
        count(bracket_matches_table.id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.id)
      ) AS is_group_finished
    FROM public.championship_bracket_groups AS groups_table
    LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.group_id = groups_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE groups_table.competition_id = _competition_id
    GROUP BY groups_table.id
  ) AS group_statuses;

  IF group_count_value < 2 THEN
    RETURN _competition_id;
  END IF;

  target_bracket_size := 1;

  IF competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true THEN
    WHILE target_bracket_size <= (group_count_value * competition_record.qualifiers_per_group) LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < (group_count_value * competition_record.qualifiers_per_group) LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN _competition_id;
  END IF;

  FOR ranking_record IN
    WITH ordered_groups AS (
      SELECT
        groups_table.id AS group_id,
        groups_table.group_number,
        (
          count(bracket_matches_table.id) > 0
          AND count(*) FILTER (
            WHERE matches_table.status = 'FINISHED'::public.match_status
          ) = count(bracket_matches_table.id)
        ) AS is_group_finished
      FROM public.championship_bracket_groups AS groups_table
      LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
        ON bracket_matches_table.group_id = groups_table.id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
      LEFT JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE groups_table.competition_id = _competition_id
      GROUP BY groups_table.id, groups_table.group_number
    )
    SELECT
      qualifiers.rank_number,
      ordered_groups.group_number,
      CASE
        WHEN ordered_groups.is_group_finished THEN rankings_table.team_id
        ELSE NULL::uuid
      END AS team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    ORDER BY qualifiers.rank_number ASC, ordered_groups.group_number ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  IF competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true THEN
    IF all_groups_finished THEN
      FOR ranking_record IN
        SELECT qualification_pool_rankings.team_id
        FROM public.get_championship_bracket_competition_qualification_pool_rankings(
          _championship_id,
          _competition_id
        ) AS qualification_pool_rankings
        ORDER BY qualification_pool_rankings.pool_rank ASC
      LOOP
        EXIT WHEN COALESCE(cardinality(qualified_team_ids), 0) >= target_bracket_size;

        IF ranking_record.team_id IS NOT NULL
          AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
          qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
        END IF;
      END LOOP;
    END IF;
  END IF;

  WHILE COALESCE(cardinality(qualified_team_ids), 0) < target_bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  IF COALESCE(cardinality(qualified_team_ids), 0) > target_bracket_size THEN
    qualified_team_ids := qualified_team_ids[1:target_bracket_size];
  END IF;

  qualified_team_count := COALESCE(cardinality(qualified_team_ids), 0);

  IF qualified_team_count < 2 THEN
    RETURN _competition_id;
  END IF;

  bracket_size := 1;
  WHILE bracket_size < qualified_team_count LOOP
    bracket_size := bracket_size * 2;
  END LOOP;

  WHILE cardinality(qualified_team_ids) < bracket_size LOOP
    qualified_team_ids := array_append(qualified_team_ids, NULL);
  END LOOP;

  total_rounds := 1;
  WHILE power(2, total_rounds) < bracket_size LOOP
    total_rounds := total_rounds + 1;
  END LOOP;

  SELECT count(*)
  INTO existing_knockout_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;

  IF existing_knockout_count = 0 THEN
    round_match_ids := ARRAY[]::UUID[];
    semifinal_match_ids := ARRAY[]::UUID[];

    FOR slot_index IN 1..(bracket_size / 2)
    LOOP
      home_seed_index := ((slot_index - 1) * 2) + 1;
      away_seed_index := home_seed_index + 1;
      home_team_id := qualified_team_ids[home_seed_index];
      away_team_id := qualified_team_ids[away_seed_index];

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        home_team_id,
        away_team_id,
        winner_team_id,
        is_bye
      ) VALUES (
        bracket_edition_id,
        _competition_id,
        'KNOCKOUT'::public.bracket_phase,
        1,
        slot_index,
        home_team_id,
        away_team_id,
        CASE
          WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
          WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
          ELSE NULL
        END,
        CASE
          WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
          WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
          ELSE true
        END
      )
      RETURNING id INTO bracket_match_id;

      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
      END IF;

      round_match_ids := array_append(round_match_ids, bracket_match_id);
    END LOOP;

    IF total_rounds > 1 THEN
      FOR round_number IN 2..total_rounds
      LOOP
        IF round_number = total_rounds THEN
          semifinal_match_ids := round_match_ids;
        END IF;

        next_round_match_ids := ARRAY[]::UUID[];

        FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
        LOOP
          source_home_bracket_match_id := round_match_ids[(slot_index * 2) - 1];
          source_away_bracket_match_id := round_match_ids[(slot_index * 2)];

          SELECT bracket_matches_table.winner_team_id
          INTO source_home_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = knockout_gen.source_home_bracket_match_id
          LIMIT 1;

          SELECT bracket_matches_table.winner_team_id
          INTO source_away_winner_team_id
          FROM public.championship_bracket_matches AS bracket_matches_table
          WHERE bracket_matches_table.id = knockout_gen.source_away_bracket_match_id
          LIMIT 1;

          home_team_id := source_home_winner_team_id;
          away_team_id := source_away_winner_team_id;

          INSERT INTO public.championship_bracket_matches (
            bracket_edition_id,
            competition_id,
            phase,
            round_number,
            slot_number,
            home_team_id,
            away_team_id,
            winner_team_id,
            source_home_bracket_match_id,
            source_away_bracket_match_id,
            is_bye
          ) VALUES (
            bracket_edition_id,
            _competition_id,
            'KNOCKOUT'::public.bracket_phase,
            knockout_gen.round_number,
            slot_index,
            home_team_id,
            away_team_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
              WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
              ELSE NULL
            END,
            source_home_bracket_match_id,
            source_away_bracket_match_id,
            CASE
              WHEN home_team_id IS NULL AND away_team_id IS NULL THEN false
              WHEN home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN false
              ELSE true
            END
          )
          RETURNING id INTO bracket_match_id;

          UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = knockout_gen.source_home_bracket_match_id;

          UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = knockout_gen.source_away_bracket_match_id;

          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
            PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
          END IF;

          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
        END LOOP;

        round_match_ids := next_round_match_ids;
      END LOOP;
    END IF;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND COALESCE(cardinality(semifinal_match_ids), 0) = 2 THEN
      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        phase,
        round_number,
        slot_number,
        source_home_bracket_match_id,
        source_away_bracket_match_id,
        is_third_place
      ) VALUES (
        bracket_edition_id,
        _competition_id,
        'KNOCKOUT'::public.bracket_phase,
        total_rounds,
        2,
        semifinal_match_ids[1],
        semifinal_match_ids[2],
        true
      );
    END IF;

    PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);
    RETURN _competition_id;
  END IF;

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := ((slot_index - 1) * 2) + 1;
    away_seed_index := home_seed_index + 1;
    home_team_id := qualified_team_ids[home_seed_index];
    away_team_id := qualified_team_ids[away_seed_index];

    SELECT
      bracket_matches_table.match_id,
      matches_table.status
    INTO existing_match_id, existing_match_status
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    LIMIT 1;

    IF existing_match_status IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status) THEN
      CONTINUE;
    END IF;

    IF existing_match_id IS NULL THEN
      UPDATE public.championship_bracket_matches
      SET
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        winner_team_id = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN knockout_gen.away_team_id
          WHEN knockout_gen.away_team_id IS NULL
            AND knockout_gen.home_team_id IS NOT NULL THEN knockout_gen.home_team_id
          ELSE NULL
        END,
        is_bye = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NULL THEN false
          WHEN knockout_gen.home_team_id IS NOT NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN false
          ELSE true
        END
      WHERE championship_bracket_matches.competition_id = _competition_id
        AND championship_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND championship_bracket_matches.is_third_place = false
        AND championship_bracket_matches.round_number = 1
        AND championship_bracket_matches.slot_number = slot_index
      RETURNING id INTO bracket_match_id;

      IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
        PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
      END IF;
    ELSIF existing_match_status = 'SCHEDULED'::public.match_status
      AND home_team_id IS NOT NULL
      AND away_team_id IS NOT NULL THEN
      UPDATE public.matches
      SET
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        home_score = 0,
        away_score = 0,
        start_time = NULL,
        end_time = NULL,
        status = 'SCHEDULED'::public.match_status,
        updated_at = now()
      WHERE id = existing_match_id;

      UPDATE public.championship_bracket_matches
      SET
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        winner_team_id = NULL,
        is_bye = false
      WHERE championship_bracket_matches.competition_id = _competition_id
        AND championship_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND championship_bracket_matches.is_third_place = false
        AND championship_bracket_matches.round_number = 1
        AND championship_bracket_matches.slot_number = slot_index;
    ELSIF existing_match_status = 'SCHEDULED'::public.match_status THEN
      UPDATE public.championship_bracket_matches
      SET
        match_id = NULL,
        home_team_id = knockout_gen.home_team_id,
        away_team_id = knockout_gen.away_team_id,
        winner_team_id = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN knockout_gen.away_team_id
          WHEN knockout_gen.away_team_id IS NULL
            AND knockout_gen.home_team_id IS NOT NULL THEN knockout_gen.home_team_id
          ELSE NULL
        END,
        is_bye = CASE
          WHEN knockout_gen.home_team_id IS NULL
            AND knockout_gen.away_team_id IS NULL THEN false
          WHEN knockout_gen.home_team_id IS NOT NULL
            AND knockout_gen.away_team_id IS NOT NULL THEN false
          ELSE true
        END
      WHERE championship_bracket_matches.competition_id = _competition_id
        AND championship_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
        AND championship_bracket_matches.is_third_place = false
        AND championship_bracket_matches.round_number = 1
        AND championship_bracket_matches.slot_number = slot_index;

      DELETE FROM public.matches AS matches_table
      WHERE matches_table.id = existing_match_id
        AND matches_table.status = 'SCHEDULED'::public.match_status;
    END IF;
  END LOOP;

  IF total_rounds > 1 THEN
    FOR round_number IN 2..total_rounds
    LOOP
      FOR slot_index IN 1..(bracket_size / (1 << round_number))
      LOOP
        SELECT
          bracket_matches_table.id,
          bracket_matches_table.match_id,
          matches_table.status,
          bracket_matches_table.source_home_bracket_match_id,
          bracket_matches_table.source_away_bracket_match_id
        INTO
          bracket_match_id,
          existing_match_id,
          existing_match_status,
          source_home_bracket_match_id,
          source_away_bracket_match_id
        FROM public.championship_bracket_matches AS bracket_matches_table
        LEFT JOIN public.matches AS matches_table
          ON matches_table.id = bracket_matches_table.match_id
        WHERE bracket_matches_table.competition_id = _competition_id
          AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
          AND bracket_matches_table.is_third_place = false
          AND bracket_matches_table.round_number = knockout_gen.round_number
          AND bracket_matches_table.slot_number = slot_index
        LIMIT 1;

        IF bracket_match_id IS NULL THEN
          CONTINUE;
        END IF;

        SELECT winner_team_id
        INTO source_home_winner_team_id
        FROM public.championship_bracket_matches
        WHERE id = knockout_gen.source_home_bracket_match_id
        LIMIT 1;

        SELECT winner_team_id
        INTO source_away_winner_team_id
        FROM public.championship_bracket_matches
        WHERE id = knockout_gen.source_away_bracket_match_id
        LIMIT 1;

        home_team_id := source_home_winner_team_id;
        away_team_id := source_away_winner_team_id;
        desired_winner_team_id := CASE
          WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
          WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
          ELSE NULL
        END;

        IF existing_match_status IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status) THEN
          CONTINUE;
        END IF;

        IF existing_match_id IS NULL THEN
          UPDATE public.championship_bracket_matches
          SET
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            winner_team_id = knockout_gen.desired_winner_team_id,
            is_bye = CASE
              WHEN knockout_gen.home_team_id IS NULL
                AND knockout_gen.away_team_id IS NULL THEN false
              WHEN knockout_gen.home_team_id IS NOT NULL
                AND knockout_gen.away_team_id IS NOT NULL THEN false
              ELSE true
            END
          WHERE id = bracket_match_id;

          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
            PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
          END IF;
        ELSIF existing_match_status = 'SCHEDULED'::public.match_status
          AND home_team_id IS NOT NULL
          AND away_team_id IS NOT NULL THEN
          UPDATE public.matches
          SET
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            home_score = 0,
            away_score = 0,
            start_time = NULL,
            end_time = NULL,
            status = 'SCHEDULED'::public.match_status,
            updated_at = now()
          WHERE id = existing_match_id;

          UPDATE public.championship_bracket_matches
          SET
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            winner_team_id = NULL,
            is_bye = false
          WHERE id = bracket_match_id;
        ELSIF existing_match_status = 'SCHEDULED'::public.match_status THEN
          UPDATE public.championship_bracket_matches
          SET
            match_id = NULL,
            home_team_id = knockout_gen.home_team_id,
            away_team_id = knockout_gen.away_team_id,
            winner_team_id = knockout_gen.desired_winner_team_id,
            is_bye = CASE
              WHEN knockout_gen.home_team_id IS NULL
                AND knockout_gen.away_team_id IS NULL THEN false
              WHEN knockout_gen.home_team_id IS NOT NULL
                AND knockout_gen.away_team_id IS NOT NULL THEN false
              ELSE true
            END
          WHERE id = bracket_match_id;

          DELETE FROM public.matches AS matches_table
          WHERE matches_table.id = existing_match_id
            AND matches_table.status = 'SCHEDULED'::public.match_status;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode THEN
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      matches_table.status,
      bracket_matches_table.source_home_bracket_match_id,
      bracket_matches_table.source_away_bracket_match_id
    INTO
      bracket_match_id,
      existing_match_id,
      existing_match_status,
      source_home_bracket_match_id,
      source_away_bracket_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = true
    LIMIT 1;

    IF bracket_match_id IS NOT NULL AND existing_match_status NOT IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status) THEN
      home_team_id := public.resolve_championship_bracket_match_loser_team_id(source_home_bracket_match_id);
      away_team_id := public.resolve_championship_bracket_match_loser_team_id(source_away_bracket_match_id);

      IF existing_match_id IS NULL THEN
        UPDATE public.championship_bracket_matches
        SET
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          is_bye = CASE
            WHEN knockout_gen.home_team_id IS NOT NULL
              AND knockout_gen.away_team_id IS NOT NULL THEN false
            ELSE is_bye
          END
        WHERE id = bracket_match_id;

        IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
          PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
        END IF;
      ELSIF existing_match_status = 'SCHEDULED'::public.match_status
        AND home_team_id IS NOT NULL
        AND away_team_id IS NOT NULL THEN
        UPDATE public.matches
        SET
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          home_score = 0,
          away_score = 0,
          start_time = NULL,
          end_time = NULL,
          status = 'SCHEDULED'::public.match_status,
          updated_at = now()
        WHERE id = existing_match_id;

        UPDATE public.championship_bracket_matches
        SET
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          winner_team_id = NULL,
          is_bye = false
        WHERE id = bracket_match_id;
      ELSIF existing_match_status = 'SCHEDULED'::public.match_status THEN
        UPDATE public.championship_bracket_matches
        SET
          match_id = NULL,
          home_team_id = knockout_gen.home_team_id,
          away_team_id = knockout_gen.away_team_id,
          winner_team_id = NULL,
          is_bye = CASE
            WHEN knockout_gen.home_team_id IS NULL
              AND knockout_gen.away_team_id IS NULL THEN false
            WHEN knockout_gen.home_team_id IS NOT NULL
              AND knockout_gen.away_team_id IS NOT NULL THEN false
            ELSE true
          END
        WHERE id = bracket_match_id;

        DELETE FROM public.matches AS matches_table
        WHERE matches_table.id = existing_match_id
          AND matches_table.status = 'SCHEDULED'::public.match_status;
      END IF;
    END IF;
  END IF;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN _competition_id;
END;
$func$;

NOTIFY pgrst, 'reload schema';
