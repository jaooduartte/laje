DO $func$
DECLARE
  championship_record RECORD;
  competition_record RECORD;
  first_round_match_record RECORD;
  qualified_team_ids UUID[];
  direct_qualified_team_count INTEGER;
  slot_index INTEGER;
  expected_home_team_id UUID;
  expected_away_team_id UUID;
BEGIN
  SELECT
    championships_table.id,
    championships_table.current_season_year
  INTO championship_record
  FROM public.championships AS championships_table
  WHERE championships_table.code = 'INTERLAJE'::public.championship_code
  LIMIT 1;

  IF championship_record.id IS NULL THEN
    RAISE EXCEPTION 'Campeonato INTERLAJE não encontrado para reparar o chaveamento de futsal masculino.';
  END IF;

  SELECT
    competitions_table.id,
    competitions_table.bracket_edition_id,
    editions_table.payload_snapshot
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
    RAISE EXCEPTION 'Competição de futsal masculino do INTERLAJE não encontrada para a temporada atual.';
  END IF;

  IF competition_record.payload_snapshot ->> 'exact_preview_algorithm_version' IS DISTINCT FROM 'async-exact-v8' THEN
    RAISE EXCEPTION 'O chaveamento de futsal masculino não usa a estrutura exata v8 esperada para este reparo.';
  END IF;

  SELECT count(*)::integer
  INTO direct_qualified_team_count
  FROM public.get_championship_bracket_competition_group_rankings(
    championship_record.id,
    competition_record.id
  ) AS group_rankings
  WHERE group_rankings.team_rank = 1;

  IF direct_qualified_team_count < 1 OR direct_qualified_team_count >= 8 THEN
    RAISE EXCEPTION 'Quantidade de melhores primeiros incompatível com as quartas de futsal masculino.';
  END IF;

  WITH group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(
      championship_record.id,
      competition_record.id
    )
    WHERE team_rank IN (1, 2)
  ),
  corrected_candidates AS (
    SELECT
      group_rankings.team_id,
      group_rankings.team_rank AS qualification_rank,
      corrected_standings_table.corrected_points,
      qualification_pool_rankings.pool_rank AS previous_pool_rank
    FROM group_rankings
    JOIN public.get_championship_corrected_group_standings(
      championship_record.id,
      championship_record.current_season_year
    ) AS corrected_standings_table
      ON corrected_standings_table.competition_id = competition_record.id
      AND corrected_standings_table.group_id = group_rankings.group_id
      AND corrected_standings_table.team_id = group_rankings.team_id
    JOIN public.get_championship_bracket_competition_qualification_pool_rankings(
      championship_record.id,
      competition_record.id
    ) AS qualification_pool_rankings
      ON qualification_pool_rankings.team_id = group_rankings.team_id
      AND qualification_pool_rankings.qualification_rank = group_rankings.team_rank
  ),
  ranked_candidates AS (
    SELECT
      corrected_candidates.*,
      row_number() OVER (
        PARTITION BY corrected_candidates.qualification_rank
        ORDER BY
          corrected_candidates.corrected_points DESC,
          corrected_candidates.previous_pool_rank ASC
      )::integer AS qualification_pool_rank
    FROM corrected_candidates
  ),
  qualified_candidates AS (
    SELECT ranked_candidates.*
    FROM ranked_candidates
    WHERE ranked_candidates.qualification_rank = 1

    UNION ALL

    SELECT ranked_candidates.*
    FROM ranked_candidates
    WHERE ranked_candidates.qualification_rank = 2
      AND ranked_candidates.qualification_pool_rank <= 8 - direct_qualified_team_count
  )
  SELECT array_agg(
    qualified_candidates.team_id
    ORDER BY
      qualified_candidates.qualification_rank,
      qualified_candidates.qualification_pool_rank
  )
  INTO qualified_team_ids
  FROM qualified_candidates;

  IF COALESCE(cardinality(qualified_team_ids), 0) <> 8 THEN
    RAISE EXCEPTION 'A pontuação corrigida não definiu oito participantes para as quartas de futsal masculino.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
  ) <> 4 THEN
    RAISE EXCEPTION 'A estrutura persistida não contém exatamente quatro quartas de futsal masculino.';
  END IF;

  FOR slot_index IN 1..4 LOOP
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.match_id,
      matches_table.status,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye
    INTO first_round_match_record
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competition_record.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.round_number = 1
      AND bracket_matches_table.slot_number = slot_index
    LIMIT 1;

    IF first_round_match_record.id IS NULL
      OR first_round_match_record.match_id IS NULL
      OR first_round_match_record.status IS DISTINCT FROM 'SCHEDULED'::public.match_status
      OR first_round_match_record.winner_team_id IS NOT NULL
      OR first_round_match_record.is_bye IS NOT FALSE THEN
      RAISE EXCEPTION 'A quarta %, do futsal masculino, não está disponível para reparo seguro.', slot_index;
    END IF;

    expected_home_team_id := qualified_team_ids[slot_index];
    expected_away_team_id := qualified_team_ids[9 - slot_index];

    UPDATE public.championship_bracket_matches AS bracket_matches_table
    SET
      home_team_id = expected_home_team_id,
      away_team_id = expected_away_team_id
    WHERE bracket_matches_table.id = first_round_match_record.id
      AND (
        bracket_matches_table.home_team_id IS DISTINCT FROM expected_home_team_id
        OR bracket_matches_table.away_team_id IS DISTINCT FROM expected_away_team_id
      );

    PERFORM public.sync_championship_bracket_match_participants(first_round_match_record.id);
  END LOOP;
END;
$func$;
