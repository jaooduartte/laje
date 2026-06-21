CREATE OR REPLACE FUNCTION public.ensure_championship_knockout_next_round_match(
  _championship_id UUID,
  _competition_id UUID,
  _source_round_number INTEGER,
  _next_slot_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  source_home_bracket_match RECORD;
  source_away_bracket_match RECORD;
  target_bracket_match RECORD;
  next_round_number INTEGER;
BEGIN
  IF _next_slot_number < 1 OR _source_round_number < 1 THEN
    RETURN NULL;
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO source_home_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _source_round_number
    AND bracket_matches_table.slot_number = ((_next_slot_number * 2) - 1)
  LIMIT 1;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.winner_team_id,
    bracket_matches_table.next_bracket_match_id
  INTO source_away_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _source_round_number
    AND bracket_matches_table.slot_number = (_next_slot_number * 2)
  LIMIT 1;

  IF source_home_bracket_match.id IS NULL OR source_away_bracket_match.id IS NULL THEN
    RETURN NULL;
  END IF;

  next_round_number := _source_round_number + 1;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id
  INTO target_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = next_round_number
    AND bracket_matches_table.slot_number = _next_slot_number
  LIMIT 1;

  IF source_home_bracket_match.winner_team_id IS NULL OR source_away_bracket_match.winner_team_id IS NULL THEN
    RETURN target_bracket_match.id;
  END IF;

  IF target_bracket_match.id IS NULL THEN
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
      competition_record.bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      next_round_number,
      _next_slot_number,
      source_home_bracket_match.winner_team_id,
      source_away_bracket_match.winner_team_id,
      NULL,
      source_home_bracket_match.id,
      source_away_bracket_match.id,
      false
    )
    RETURNING
      id,
      match_id,
      home_team_id,
      away_team_id
    INTO target_bracket_match;
  ELSE
    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = source_home_bracket_match.winner_team_id,
      away_team_id = source_away_bracket_match.winner_team_id,
      winner_team_id = NULL,
      is_bye = false,
      source_home_bracket_match_id = source_home_bracket_match.id,
      source_away_bracket_match_id = source_away_bracket_match.id
    WHERE bracket_matches_table.id = target_bracket_match.id;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET next_bracket_match_id = target_bracket_match.id
  WHERE bracket_matches_table.id IN (source_home_bracket_match.id, source_away_bracket_match.id);

  IF target_bracket_match.match_id IS NULL THEN
    PERFORM public.create_championship_knockout_match_schedule(_championship_id, target_bracket_match.id);
  END IF;

  RETURN target_bracket_match.id;
END;
$$;

COMMENT ON FUNCTION public.ensure_championship_knockout_next_round_match(UUID, UUID, INTEGER, INTEGER) IS
  'Cria o próximo confronto do mata-mata somente quando os dois vencedores da dupla anterior já estão definidos.';

CREATE OR REPLACE FUNCTION public.ensure_championship_knockout_third_place_match(
  _championship_id UUID,
  _competition_id UUID,
  _semifinal_round_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  semifinal_home_match RECORD;
  semifinal_away_match RECORD;
  third_place_match RECORD;
  third_place_home_team_id UUID;
  third_place_away_team_id UUID;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    competitions_table.third_place_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL
    OR competition_record.third_place_mode <> 'MATCH'::public.bracket_third_place_mode
    OR _semifinal_round_number < 1 THEN
    RETURN NULL;
  END IF;

  SELECT
    bracket_matches_table.id
  INTO semifinal_home_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _semifinal_round_number
    AND bracket_matches_table.slot_number = 1
  LIMIT 1;

  SELECT
    bracket_matches_table.id
  INTO semifinal_away_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = _semifinal_round_number
    AND bracket_matches_table.slot_number = 2
  LIMIT 1;

  IF semifinal_home_match.id IS NULL OR semifinal_away_match.id IS NULL THEN
    RETURN NULL;
  END IF;

  third_place_home_team_id := public.resolve_championship_bracket_match_loser_team_id(semifinal_home_match.id);
  third_place_away_team_id := public.resolve_championship_bracket_match_loser_team_id(semifinal_away_match.id);

  IF third_place_home_team_id IS NULL OR third_place_away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.match_id
  INTO third_place_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = true
  LIMIT 1;

  IF third_place_match.id IS NULL THEN
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
      is_bye,
      is_third_place
    ) VALUES (
      competition_record.bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      _semifinal_round_number + 1,
      2,
      third_place_home_team_id,
      third_place_away_team_id,
      NULL,
      semifinal_home_match.id,
      semifinal_away_match.id,
      false,
      true
    )
    RETURNING
      id,
      match_id
    INTO third_place_match;
  ELSE
    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = third_place_home_team_id,
      away_team_id = third_place_away_team_id,
      winner_team_id = NULL,
      is_bye = false,
      source_home_bracket_match_id = semifinal_home_match.id,
      source_away_bracket_match_id = semifinal_away_match.id
    WHERE bracket_matches_table.id = third_place_match.id;
  END IF;

  IF third_place_match.match_id IS NULL THEN
    PERFORM public.create_championship_knockout_match_schedule(_championship_id, third_place_match.id);
  END IF;

  RETURN third_place_match.id;
END;
$$;

COMMENT ON FUNCTION public.ensure_championship_knockout_third_place_match(UUID, UUID, INTEGER) IS
  'Cria a disputa de 3º lugar somente quando as duas semifinais já possuem perdedor definido.';

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
#variable_conflict use_variable
DECLARE
  bracket_edition_id UUID;
  competition_record RECORD;
  ranking_record RECORD;
  qualified_team_ids UUID[] := ARRAY[]::UUID[];
  qualified_team_count INTEGER;
  group_count_value INTEGER;
  direct_qualified_team_count INTEGER;
  should_expand_with_best_second_placed_teams BOOLEAN;
  should_include_best_second_placed_teams BOOLEAN;
  all_groups_finished BOOLEAN := false;
  target_bracket_size INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  current_round INTEGER;
  slot_index INTEGER;
  home_seed_index INTEGER;
  away_seed_index INTEGER;
  home_team_id UUID;
  away_team_id UUID;
  round_match_ids UUID[];
  next_round_match_ids UUID[];
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
  existing_knockout_count INTEGER;
  pending_tie_breaks_count INTEGER;
  standard_seed_order INTEGER[];
  seed_iter INTEGER;
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

  SELECT count(*)
  INTO pending_tie_breaks_count
  FROM jsonb_array_elements(public.get_championship_bracket_pending_tie_breaks(_championship_id, bracket_edition_id)) AS tb
  WHERE (tb->>'competition_id')::uuid = _competition_id;

  IF pending_tie_breaks_count > 0 THEN
    RETURN _competition_id;
  END IF;

  SELECT
    count(*)::int,
    bool_and(group_statuses.is_group_finished)
  INTO
    group_count_value,
    all_groups_finished
  FROM (
    SELECT
      groups_table.id,
      (
        count(bracket_matches_table.match_id) > 0
        AND count(*) FILTER (
          WHERE matches_table.status = 'FINISHED'::public.match_status
        ) = count(bracket_matches_table.match_id)
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

  IF group_count_value < 1 THEN
    RETURN _competition_id;
  END IF;

  direct_qualified_team_count := group_count_value * competition_record.qualifiers_per_group;
  should_expand_with_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND competition_record.should_complete_knockout_with_best_second_placed_teams = true;

  target_bracket_size := 1;
  IF should_expand_with_best_second_placed_teams THEN
    WHILE target_bracket_size <= direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE target_bracket_size < direct_qualified_team_count LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN _competition_id;
  END IF;

  should_include_best_second_placed_teams :=
    competition_record.qualifiers_per_group = 1
    AND target_bracket_size > direct_qualified_team_count;

  IF should_include_best_second_placed_teams AND NOT all_groups_finished THEN
    RETURN _competition_id;
  END IF;

  FOR ranking_record IN
    WITH ordered_groups AS (
      SELECT
        groups_table.id AS group_id,
        groups_table.group_number,
        (
          count(bracket_matches_table.match_id) > 0
          AND count(*) FILTER (
            WHERE matches_table.status = 'FINISHED'::public.match_status
          ) = count(bracket_matches_table.match_id)
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
      rankings_table.team_id
    FROM ordered_groups
    CROSS JOIN generate_series(1, competition_record.qualifiers_per_group) AS qualifiers(rank_number)
    LEFT JOIN public.get_championship_bracket_competition_group_rankings(
      _championship_id,
      _competition_id
    ) AS rankings_table
      ON rankings_table.group_id = ordered_groups.group_id
      AND rankings_table.team_rank = qualifiers.rank_number
    LEFT JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
      _championship_id,
      _competition_id
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

  standard_seed_order := ARRAY[]::INTEGER[];
  FOR seed_iter IN 1..(bracket_size / 2) LOOP
    standard_seed_order := array_append(standard_seed_order, seed_iter);
    standard_seed_order := array_append(standard_seed_order, bracket_size + 1 - seed_iter);
  END LOOP;

  SELECT count(*)
  INTO existing_knockout_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;

  IF existing_knockout_count > 0 THEN
    RETURN _competition_id;
  END IF;

  round_match_ids := ARRAY[]::UUID[];

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := standard_seed_order[((slot_index - 1) * 2) + 1];
    away_seed_index := standard_seed_order[((slot_index - 1) * 2) + 2];
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

  current_round := 1;

  LOOP
    next_round_match_ids := ARRAY[]::UUID[];

    EXIT WHEN COALESCE(cardinality(round_match_ids), 0) < 2;

    FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
    LOOP
      bracket_match_id := public.ensure_championship_knockout_next_round_match(
        _championship_id,
        _competition_id,
        current_round,
        slot_index
      );

      IF bracket_match_id IS NOT NULL THEN
        next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
      END IF;
    END LOOP;

    EXIT WHEN COALESCE(cardinality(next_round_match_ids), 0) = 0;

    IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
      AND COALESCE(cardinality(round_match_ids), 0) = 2 THEN
      PERFORM public.ensure_championship_knockout_third_place_match(
        _championship_id,
        _competition_id,
        current_round
      );
    END IF;

    round_match_ids := next_round_match_ids;
    current_round := current_round + 1;
  END LOOP;

  PERFORM public.sync_championship_bracket_edition_status(bracket_edition_id);

  RETURN _competition_id;
END;
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS
  'Gera apenas a primeira rodada jogável do mata-mata e cria as rodadas seguintes sob demanda, quando os confrontos anteriores realmente definem os dois lados.';

CREATE OR REPLACE FUNCTION public.propagate_championship_knockout_progress(_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bracket_match RECORD;
  resolved_winner_team_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number
  INTO current_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = _match_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  LIMIT 1;

  IF current_bracket_match.id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN matches_table.home_score > matches_table.away_score THEN matches_table.home_team_id
      WHEN matches_table.away_score > matches_table.home_score THEN matches_table.away_team_id
      ELSE NULL
    END
  INTO resolved_winner_team_id
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_winner_team_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    winner_team_id = resolved_winner_team_id,
    is_bye = false
  WHERE bracket_matches_table.id = current_bracket_match.id;

  PERFORM public.ensure_championship_knockout_next_round_match(
    (
      SELECT editions_table.championship_id
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id = current_bracket_match.bracket_edition_id
      LIMIT 1
    ),
    current_bracket_match.competition_id,
    current_bracket_match.round_number,
    ((current_bracket_match.slot_number + 1) / 2)
  );

  PERFORM public.ensure_championship_knockout_third_place_match(
    (
      SELECT editions_table.championship_id
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id = current_bracket_match.bracket_edition_id
      LIMIT 1
    ),
    current_bracket_match.competition_id,
    current_bracket_match.round_number
  );

  PERFORM public.sync_championship_bracket_edition_status(current_bracket_match.bracket_edition_id);
END;
$$;

COMMENT ON FUNCTION public.propagate_championship_knockout_progress(UUID) IS
  'Atualiza o vencedor do confronto encerrado e cria a próxima rodada do mata-mata somente quando o pareamento seguinte fica realmente jogável.';

NOTIFY pgrst, 'reload schema';
