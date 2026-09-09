DO $$
DECLARE
  championship_record RECORD;
  competition_record RECORD;
  first_round_match_count INTEGER;
  scheduled_first_round_match_count INTEGER;
  group_count_value INTEGER;
  target_bracket_size INTEGER;
  direct_qualified_team_count INTEGER;
  should_include_best_second_placed_teams BOOLEAN;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  seed_order INTEGER[];
  ranking_record RECORD;
  current_slot_number INTEGER;
  current_expected_home_team_id UUID;
  current_expected_away_team_id UUID;
  current_bracket_match_id UUID;
  current_match_id UUID;
  match_record RECORD;
  rest_conflict_message TEXT;
  competition_count INTEGER;
BEGIN
  SELECT
    championships_table.id,
    championships_table.current_season_year
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'INTERLAJE'::public.championship_code
  LIMIT 1;

  IF championship_record.id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::INTEGER
  INTO competition_count
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE editions_table.championship_id = championship_record.id
    AND editions_table.season_year = championship_record.current_season_year
    AND public.normalize_sport_name(sports_table.name) = 'handebol'
    AND competitions_table.naipe = 'FEMININO'::public.match_naipe
    AND competitions_table.division IS NULL;

  IF competition_count = 0 THEN
    RETURN;
  END IF;

  IF competition_count <> 1 THEN
    RAISE EXCEPTION 'A reconciliação do handebol feminino exige uma única competição da temporada atual.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.qualifiers_per_group,
    competitions_table.knockout_pairing_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE editions_table.championship_id = championship_record.id
    AND editions_table.season_year = championship_record.current_season_year
    AND public.normalize_sport_name(sports_table.name) = 'handebol'
    AND competitions_table.naipe = 'FEMININO'::public.match_naipe
    AND competitions_table.division IS NULL;

  PERFORM 1
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = competition_record.id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ORDER BY bracket_matches_table.id
  FOR UPDATE;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (
      WHERE matches_table.status = 'SCHEDULED'::public.match_status
    )::INTEGER
  INTO first_round_match_count, scheduled_first_round_match_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.competition_id = competition_record.id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1;

  IF first_round_match_count = 0
    OR scheduled_first_round_match_count <> first_round_match_count THEN
    RAISE EXCEPTION 'A reconciliação do handebol feminino exige quartas materializadas e ainda agendadas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number > 1
      AND matches_table.status IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status)
  ) THEN
    RAISE EXCEPTION 'A reconciliação do handebol feminino foi bloqueada porque há fase posterior ao vivo ou finalizada.';
  END IF;

  target_bracket_size := first_round_match_count * 2;

  IF target_bracket_size < 2
    OR (target_bracket_size & (target_bracket_size - 1)) <> 0 THEN
    RAISE EXCEPTION 'A primeira rodada do handebol feminino não possui uma chave eliminatória válida.';
  END IF;

  SELECT count(*)::INTEGER
  INTO group_count_value
  FROM public.championship_bracket_groups AS groups_table
  WHERE groups_table.competition_id = competition_record.id;

  direct_qualified_team_count :=
    group_count_value * competition_record.qualifiers_per_group;
  should_include_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND target_bracket_size > direct_qualified_team_count;

  IF group_count_value < 1
    OR direct_qualified_team_count < 1
    OR (
      should_include_best_second_placed_teams = false
      AND target_bracket_size <> power(2, ceil(log(2, direct_qualified_team_count)))::INTEGER
    )
    OR (
      should_include_best_second_placed_teams = true
      AND target_bracket_size <> power(2, ceil(log(2, direct_qualified_team_count + 1)))::INTEGER
    ) THEN
    RAISE EXCEPTION 'A estrutura do handebol feminino não corresponde à classificação configurada.';
  END IF;

  FOR ranking_record IN
    WITH ordered_groups AS (
      SELECT
        groups_table.id AS group_id,
        groups_table.group_number
      FROM public.championship_bracket_groups AS groups_table
      WHERE groups_table.competition_id = competition_record.id
    )
    SELECT rankings_table.team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      championship_record.id,
      competition_record.id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
      championship_record.id,
      competition_record.id
    ) AS pool_rankings
      ON pool_rankings.team_id = rankings_table.team_id
      AND pool_rankings.qualification_rank = qualifiers.rank_number
    ORDER BY
      qualifiers.rank_number ASC,
      CASE
        WHEN should_include_best_second_placed_teams
        THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
        ELSE ordered_groups.group_number
      END ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  IF should_include_best_second_placed_teams THEN
    FOR ranking_record IN
      SELECT qualification_pool_rankings.team_id
      FROM public.get_championship_bracket_competition_qualification_pool_rankings(
        championship_record.id,
        competition_record.id
      ) AS qualification_pool_rankings
      ORDER BY qualification_pool_rankings.pool_rank ASC
    LOOP
      EXIT WHEN cardinality(qualified_team_ids) >= target_bracket_size;

      IF ranking_record.team_id IS NOT NULL
        AND NOT ranking_record.team_id = ANY(qualified_team_ids) THEN
        qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
      END IF;
    END LOOP;
  END IF;

  IF cardinality(qualified_team_ids) <> target_bracket_size
    OR EXISTS (
      SELECT 1
      FROM unnest(qualified_team_ids) AS qualified_team_id
      WHERE qualified_team_id IS NULL
    ) THEN
    RAISE EXCEPTION 'A classificação histórica da fase de grupos não definiu todos os classificados do handebol feminino.';
  END IF;

  seed_order := public.resolve_championship_knockout_seed_order(
    competition_record.knockout_pairing_mode,
    target_bracket_size
  );

  IF cardinality(seed_order) <> target_bracket_size THEN
    RAISE EXCEPTION 'O modo de pareamento do handebol feminino não gerou uma ordem de seeds válida.';
  END IF;

  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  FOR current_slot_number IN 1..first_round_match_count LOOP
    current_expected_home_team_id :=
      qualified_team_ids[seed_order[((current_slot_number - 1) * 2) + 1]];
    current_expected_away_team_id :=
      qualified_team_ids[seed_order[((current_slot_number - 1) * 2) + 2]];

    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id
    INTO current_bracket_match_id, current_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = current_slot_number;

    IF current_bracket_match_id IS NULL OR current_match_id IS NULL THEN
      RAISE EXCEPTION 'O slot % do handebol feminino não possui jogo agendado para reconciliação.', current_slot_number;
    END IF;

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = current_expected_home_team_id,
      away_team_id = current_expected_away_team_id,
      winner_team_id = NULL,
      is_bye = false
    WHERE bracket_matches_table.id = current_bracket_match_id;

    UPDATE public.matches AS matches_table
    SET
      home_team_id = current_expected_home_team_id,
      away_team_id = current_expected_away_team_id
    WHERE matches_table.id = current_match_id
      AND matches_table.status = 'SCHEDULED'::public.match_status;
  END LOOP;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);

  FOR match_record IN
    SELECT
      matches_table.id,
      matches_table.championship_id,
      matches_table.season_year,
      matches_table.scheduled_date,
      matches_table.location,
      matches_table.court_name,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at,
      matches_table.sport_id,
      matches_table.naipe,
      matches_table.home_team_id,
      matches_table.away_team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
  LOOP
    rest_conflict_message := public.resolve_scheduled_match_rest_gap_conflict(
      match_record.championship_id,
      match_record.season_year,
      match_record.scheduled_date,
      match_record.location,
      match_record.court_name,
      match_record.start_time,
      match_record.scheduled_slot,
      match_record.queue_position,
      match_record.created_at,
      match_record.id,
      match_record.sport_id,
      match_record.naipe,
      match_record.home_team_id,
      match_record.away_team_id
    );

    IF rest_conflict_message IS NOT NULL THEN
      RAISE EXCEPTION 'A reconciliação do handebol feminino cria conflito operacional: %', rest_conflict_message;
    END IF;
  END LOOP;

  UPDATE public.championship_bracket_editions AS editions_table
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE editions_table.id = competition_record.bracket_edition_id;
END;
$$;
