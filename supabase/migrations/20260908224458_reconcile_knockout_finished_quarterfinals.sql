CREATE OR REPLACE FUNCTION public.get_championship_knockout_qf_reconciliation_plan(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  slot_number INTEGER,
  expected_home_team_id UUID,
  expected_away_team_id UUID,
  bracket_match_id UUID,
  completed_match_id UUID,
  winner_team_id UUID,
  is_safe BOOLEAN,
  diagnostic TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  competition_record RECORD;
  group_count_value INTEGER;
  first_round_match_count INTEGER;
  finished_first_round_match_count INTEGER;
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
  current_completed_match_id UUID;
  current_winner_team_id UUID;
  completed_match_count INTEGER;
BEGIN
  SELECT
    competitions_table.id,
    competitions_table.groups_count,
    competitions_table.qualifiers_per_group,
    competitions_table.knockout_pairing_mode
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  WHERE competitions_table.id = _competition_id
    AND editions_table.championship_id = _championship_id
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'Competição de mata-mata não encontrada para o campeonato informado.';
    RETURN;
  END IF;

  SELECT count(*)::INTEGER
  INTO first_round_match_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1;

  IF first_round_match_count = 0 THEN
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'A competição ainda não possui jogos materializados na primeira rodada.';
    RETURN;
  END IF;

  target_bracket_size := first_round_match_count * 2;

  SELECT count(*)::INTEGER
  INTO finished_first_round_match_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1
    AND matches_table.status = 'FINISHED'::public.match_status;

  IF finished_first_round_match_count <> first_round_match_count THEN
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'A primeira rodada precisa estar integralmente finalizada antes da reconciliação.';
    RETURN;
  END IF;

  IF target_bracket_size < 2
    OR (target_bracket_size & (target_bracket_size - 1)) <> 0 THEN
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'A primeira rodada não possui uma quantidade válida de slots para uma chave eliminatória.';
    RETURN;
  END IF;

  SELECT count(*)::INTEGER
  INTO group_count_value
  FROM public.championship_bracket_groups AS groups_table
  WHERE groups_table.competition_id = _competition_id;

  direct_qualified_team_count := group_count_value * competition_record.qualifiers_per_group;
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
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'A estrutura atual não corresponde à classificação configurada para esta competição.';
    RETURN;
  END IF;

  FOR ranking_record IN
    WITH ordered_groups AS (
      SELECT
        groups_table.id AS group_id,
        groups_table.group_number
      FROM public.championship_bracket_groups AS groups_table
      WHERE groups_table.competition_id = _competition_id
    )
    SELECT
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
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'A classificação histórica da fase de grupos não definiu todos os classificados da chave.';
    RETURN;
  END IF;

  seed_order := public.resolve_championship_knockout_seed_order(
    competition_record.knockout_pairing_mode,
    target_bracket_size
  );

  IF cardinality(seed_order) <> target_bracket_size THEN
    RETURN QUERY
    SELECT NULL::INTEGER, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, NULL::UUID, false,
      'O modo de pareamento da competição não gerou uma ordem de seeds válida.';
    RETURN;
  END IF;

  FOR current_slot_number IN 1..first_round_match_count LOOP
    current_expected_home_team_id := qualified_team_ids[seed_order[((current_slot_number - 1) * 2) + 1]];
    current_expected_away_team_id := qualified_team_ids[seed_order[((current_slot_number - 1) * 2) + 2]];

    SELECT bracket_matches_table.id
    INTO current_bracket_match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = current_slot_number
    LIMIT 1;

    SELECT count(*)::INTEGER
    INTO completed_match_count
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (
        (
          matches_table.home_team_id = current_expected_home_team_id
          AND matches_table.away_team_id = current_expected_away_team_id
        )
        OR (
          matches_table.home_team_id = current_expected_away_team_id
          AND matches_table.away_team_id = current_expected_home_team_id
        )
      );

    SELECT
      matches_table.id,
      CASE
        WHEN matches_table.is_double_walkover THEN NULL
        WHEN matches_table.home_score > matches_table.away_score THEN matches_table.home_team_id
        WHEN matches_table.away_score > matches_table.home_score THEN matches_table.away_team_id
        WHEN matches_table.home_penalty_score > matches_table.away_penalty_score THEN matches_table.home_team_id
        WHEN matches_table.away_penalty_score > matches_table.home_penalty_score THEN matches_table.away_team_id
        WHEN matches_table.resolved_tie_break_winner_team_id IN (
          matches_table.home_team_id,
          matches_table.away_team_id
        ) THEN matches_table.resolved_tie_break_winner_team_id
        ELSE NULL
      END
    INTO current_completed_match_id, current_winner_team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND matches_table.status = 'FINISHED'::public.match_status
      AND (
        (
          matches_table.home_team_id = current_expected_home_team_id
          AND matches_table.away_team_id = current_expected_away_team_id
        )
        OR (
          matches_table.home_team_id = current_expected_away_team_id
          AND matches_table.away_team_id = current_expected_home_team_id
        )
      )
    ORDER BY matches_table.id
    LIMIT 1;

    RETURN QUERY
    SELECT
      current_slot_number,
      current_expected_home_team_id,
      current_expected_away_team_id,
      current_bracket_match_id,
      current_completed_match_id,
      current_winner_team_id,
      current_bracket_match_id IS NOT NULL
        AND completed_match_count = 1
        AND current_winner_team_id IS NOT NULL,
      CASE
        WHEN current_bracket_match_id IS NULL THEN 'O slot estrutural esperado não foi encontrado.'
        WHEN completed_match_count = 0 THEN 'Nenhum jogo finalizado corresponde exatamente ao confronto esperado.'
        WHEN completed_match_count > 1 THEN 'Mais de um jogo finalizado corresponde ao confronto esperado.'
        WHEN current_winner_team_id IS NULL THEN 'O jogo finalizado não possui vencedor esportivo inequívoco.'
        ELSE NULL
      END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_championship_knockout_finished_quarterfinals(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reconciliation_record RECORD;
  first_round_match_count INTEGER;
  semifinal_record RECORD;
  source_home_record RECORD;
  source_away_record RECORD;
  unsafe_plan_count INTEGER;
  reconciliation_plan JSONB;
BEGIN
  PERFORM 1
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  ORDER BY bracket_matches_table.id
  FOR UPDATE;

  SELECT count(*)::INTEGER
  INTO unsafe_plan_count
  FROM public.get_championship_knockout_qf_reconciliation_plan(
    _championship_id,
    _competition_id
  ) AS reconciliation_plan
  WHERE reconciliation_plan.is_safe = false;

  IF unsafe_plan_count > 0 THEN
    RAISE EXCEPTION 'A reconciliação foi bloqueada porque há confrontos sem correspondência única na estrutura esperada.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'slot_number', reconciliation_plan_rows.slot_number,
      'expected_home_team_id', reconciliation_plan_rows.expected_home_team_id,
      'expected_away_team_id', reconciliation_plan_rows.expected_away_team_id,
      'bracket_match_id', reconciliation_plan_rows.bracket_match_id,
      'completed_match_id', reconciliation_plan_rows.completed_match_id,
      'winner_team_id', reconciliation_plan_rows.winner_team_id
    )
    ORDER BY reconciliation_plan_rows.slot_number
  )
  INTO reconciliation_plan
  FROM public.get_championship_knockout_qf_reconciliation_plan(
    _championship_id,
    _competition_id
  ) AS reconciliation_plan_rows;

  SELECT count(*)::INTEGER
  INTO first_round_match_count
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number > 1
      AND matches_table.status IN ('LIVE'::public.match_status, 'FINISHED'::public.match_status)
  ) THEN
    RAISE EXCEPTION 'A reconciliação foi bloqueada porque existe semifinal, final ou disputa de terceiro lugar ao vivo ou finalizada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 2
      AND (
        matches_table.id IS NULL
        OR matches_table.status IS DISTINCT FROM 'SCHEDULED'::public.match_status
      )
  ) THEN
    RAISE EXCEPTION 'A reconciliação exige semifinais materializadas e ainda agendadas.';
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    match_id = NULL,
    winner_team_id = NULL,
    next_bracket_match_id = NULL
  WHERE bracket_matches_table.competition_id = _competition_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.is_third_place = false
    AND bracket_matches_table.round_number = 1;

  FOR reconciliation_record IN
    SELECT *
    FROM jsonb_to_recordset(reconciliation_plan) AS reconciliation_plan_rows(
      slot_number INTEGER,
      expected_home_team_id UUID,
      expected_away_team_id UUID,
      bracket_match_id UUID,
      completed_match_id UUID,
      winner_team_id UUID
    )
    ORDER BY reconciliation_plan_rows.slot_number
  LOOP
    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = reconciliation_record.expected_home_team_id,
      away_team_id = reconciliation_record.expected_away_team_id,
      match_id = reconciliation_record.completed_match_id,
      winner_team_id = reconciliation_record.winner_team_id,
      is_bye = false
    WHERE bracket_matches_table.id = reconciliation_record.bracket_match_id;
  END LOOP;

  FOR semifinal_record IN
    SELECT *
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 2
    ORDER BY bracket_matches_table.slot_number
  LOOP
    SELECT *
    INTO source_home_record
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = (semifinal_record.slot_number * 2) - 1;

    SELECT *
    INTO source_away_record
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = _competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = semifinal_record.slot_number * 2;

    IF source_home_record.id IS NULL
      OR source_away_record.id IS NULL
      OR source_home_record.winner_team_id IS NULL
      OR source_away_record.winner_team_id IS NULL THEN
      RAISE EXCEPTION 'A semifinal % não possui vencedores válidos das quartas correspondentes.', semifinal_record.slot_number;
    END IF;

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      source_home_bracket_match_id = source_home_record.id,
      source_away_bracket_match_id = source_away_record.id,
      home_team_id = source_home_record.winner_team_id,
      away_team_id = source_away_record.winner_team_id,
      winner_team_id = NULL,
      is_bye = false
    WHERE bracket_matches_table.id = semifinal_record.id;

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET next_bracket_match_id = semifinal_record.id
    WHERE bracket_matches_table.id IN (source_home_record.id, source_away_record.id);

    UPDATE public.matches AS matches_table
    SET
      home_team_id = source_home_record.winner_team_id,
      away_team_id = source_away_record.winner_team_id
    WHERE matches_table.id = semifinal_record.match_id
      AND matches_table.status = 'SCHEDULED'::public.match_status;
  END LOOP;

  RETURN jsonb_build_object(
    'competition_id', _competition_id,
    'first_round_match_count', first_round_match_count,
    'reconciled', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_championship_knockout_qf_reconciliation_audit(
  _championship_id UUID,
  _bracket_edition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  sport_name TEXT,
  naipe TEXT,
  division TEXT,
  can_reconcile BOOLEAN,
  reconciliation_plan JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    competitions_table.id AS competition_id,
    sports_table.name AS sport_name,
    competitions_table.naipe::TEXT AS naipe,
    competitions_table.division::TEXT AS division,
    COALESCE(bool_and(reconciliation_plan_rows.is_safe), false) AS can_reconcile,
    jsonb_agg(
      jsonb_build_object(
        'slot_number', reconciliation_plan_rows.slot_number,
        'expected_home_team_id', reconciliation_plan_rows.expected_home_team_id,
        'expected_away_team_id', reconciliation_plan_rows.expected_away_team_id,
        'bracket_match_id', reconciliation_plan_rows.bracket_match_id,
        'completed_match_id', reconciliation_plan_rows.completed_match_id,
        'winner_team_id', reconciliation_plan_rows.winner_team_id,
        'is_safe', reconciliation_plan_rows.is_safe,
        'diagnostic', reconciliation_plan_rows.diagnostic
      )
      ORDER BY reconciliation_plan_rows.slot_number NULLS LAST
    ) AS reconciliation_plan
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  CROSS JOIN LATERAL public.get_championship_knockout_qf_reconciliation_plan(
    _championship_id,
    competitions_table.id
  ) AS reconciliation_plan_rows
  WHERE editions_table.id = _bracket_edition_id
    AND editions_table.championship_id = _championship_id
  GROUP BY
    competitions_table.id,
    sports_table.name,
    competitions_table.naipe,
    competitions_table.division;
$$;

REVOKE ALL ON FUNCTION public.get_championship_knockout_qf_reconciliation_plan(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_championship_knockout_finished_quarterfinals(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_championship_knockout_qf_reconciliation_audit(UUID, UUID) FROM PUBLIC;

DO $$
DECLARE
  championship_record RECORD;
  bracket_edition_record RECORD;
  competition_record RECORD;
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

  SELECT editions_table.id
  INTO bracket_edition_record
  FROM public.championship_bracket_editions AS editions_table
  WHERE editions_table.championship_id = championship_record.id
    AND editions_table.season_year = championship_record.current_season_year
  LIMIT 1;

  IF bracket_edition_record.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.get_championship_knockout_qf_reconciliation_audit(
    championship_record.id,
    bracket_edition_record.id
  );

  SELECT competitions_table.id
  INTO competition_record
  FROM public.championship_bracket_competitions AS competitions_table
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = competitions_table.sport_id
  WHERE editions_table.championship_id = championship_record.id
    AND editions_table.season_year = championship_record.current_season_year
    AND public.normalize_sport_name(sports_table.name) = 'futsal'
    AND competitions_table.naipe = 'MASCULINO'::public.match_naipe
    AND competitions_table.division IS NULL
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.reconcile_championship_knockout_finished_quarterfinals(
    championship_record.id,
    competition_record.id
  );
END;
$$;
