-- Corrige bug onde generate_championship_knockout_for_competition não gravava
-- next_bracket_match_id nas semis ao criar o bracket match do round seguinte.
-- Isso impedia propagate_championship_knockout_progress de promover o vencedor
-- para a final após encerrar uma semifinal.
--
-- Parte 1: Corrige os dados existentes (links retroativos via source_home/away)
-- Parte 2: Recria a função com os UPDATEs de next_bracket_match_id restaurados

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Retroativo: restaura next_bracket_match_id onde está NULL
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.championship_bracket_matches AS bm_source
SET next_bracket_match_id = bm_next.id
FROM public.championship_bracket_matches AS bm_next
WHERE (
    bm_next.source_home_bracket_match_id = bm_source.id
    OR bm_next.source_away_bracket_match_id = bm_source.id
  )
  AND bm_source.next_bracket_match_id IS NULL
  AND bm_source.phase = 'KNOCKOUT';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Propaga vencedores para finais já pendentes (semis FINISHED sem next propagado)
-- ─────────────────────────────────────────────────────────────────────────────
DO $propagate_pending$
DECLARE
  v_match_id UUID;
BEGIN
  FOR v_match_id IN
    SELECT m.id
    FROM public.matches AS m
    JOIN public.championship_bracket_matches AS bm ON bm.match_id = m.id
    WHERE bm.phase = 'KNOCKOUT'
      AND m.status = 'FINISHED'
      AND bm.winner_team_id IS NOT NULL
      AND bm.next_bracket_match_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.championship_bracket_matches AS bm_next
        WHERE bm_next.id = bm.next_bracket_match_id
          AND bm_next.home_team_id IS NULL
          AND bm_next.away_team_id IS NULL
      )
  LOOP
    PERFORM public.propagate_championship_knockout_progress(v_match_id);
  END LOOP;
END;
$propagate_pending$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recria generate_championship_knockout_for_competition com o fix
-- ─────────────────────────────────────────────────────────────────────────────
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
  semifinal_match_ids UUID[];
  source_home_bracket_match_id UUID;
  source_away_bracket_match_id UUID;
  source_home_winner_team_id UUID;
  source_away_winner_team_id UUID;
  desired_winner_team_id UUID;
  bracket_match_id UUID;
  third_place_mode_value public.bracket_third_place_mode;
  pairing_mode TEXT;
  v_best_second_pool RECORD;
BEGIN
  -- Resolve bracket_edition_id
  IF _bracket_edition_id IS NOT NULL THEN
    bracket_edition_id := _bracket_edition_id;
  ELSE
    SELECT id INTO bracket_edition_id
    FROM public.championship_bracket_editions
    WHERE championship_id = _championship_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF bracket_edition_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Carrega dados da competição
  SELECT
    comp.id,
    comp.groups_count,
    comp.qualifiers_per_group,
    comp.should_complete_knockout_with_best_second_placed_teams,
    comp.third_place_mode,
    cs.code AS sport_code
  INTO competition_record
  FROM public.championship_bracket_competitions AS comp
  JOIN public.sports AS cs ON cs.id = comp.sport_id
  WHERE comp.id = _competition_id
  LIMIT 1;

  IF competition_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guard: não gerar se o bracket de KO já foi criado para esta competição
  IF EXISTS (
    SELECT 1 FROM public.championship_bracket_matches
    WHERE competition_id = _competition_id
      AND phase = 'KNOCKOUT'::public.bracket_phase
  ) THEN
    RETURN _competition_id;
  END IF;

  third_place_mode_value := competition_record.third_place_mode;

  -- Guard geral: aguarda TODOS os grupos terminarem
  SELECT bool_and(
    NOT EXISTS (
      SELECT 1 FROM public.championship_bracket_matches AS bm
      LEFT JOIN public.matches AS m ON m.id = bm.match_id
      WHERE bm.group_id = g.id
        AND bm.phase = 'GROUP_STAGE'
        AND (m.id IS NULL OR m.status != 'FINISHED'::public.match_status)
    )
  )
  INTO all_groups_finished
  FROM public.championship_bracket_groups AS g
  WHERE g.competition_id = _competition_id;

  IF all_groups_finished IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  direct_qualified_team_count := competition_record.groups_count * competition_record.qualifiers_per_group;
  should_expand_with_best_second_placed_teams := competition_record.should_complete_knockout_with_best_second_placed_teams;
  should_include_best_second_placed_teams := should_expand_with_best_second_placed_teams
    AND competition_record.qualifiers_per_group = 1;

  -- Coleta classificados diretos (1ºs e demais diretos por grupo)
  FOR ranking_record IN
    SELECT
      group_teams_table.team_id,
      group_teams_table.position
    FROM public.championship_bracket_group_teams AS group_teams_table
    JOIN public.championship_bracket_groups AS groups_table
      ON groups_table.id = group_teams_table.group_id
    WHERE groups_table.competition_id = _competition_id
      AND group_teams_table.position <= competition_record.qualifiers_per_group
    ORDER BY group_teams_table.position ASC, groups_table.group_number ASC
  LOOP
    qualified_team_ids := array_append(qualified_team_ids, ranking_record.team_id);
  END LOOP;

  qualified_team_count := cardinality(qualified_team_ids);

  IF qualified_team_count = 0 THEN
    RETURN NULL;
  END IF;

  -- Completa com melhores 2ºs se necessário
  IF should_include_best_second_placed_teams THEN
    target_bracket_size := (
      SELECT MIN(p) FROM unnest(ARRAY[2,4,8,16,32]) AS p
      WHERE p >= qualified_team_count
    );

    FOR v_best_second_pool IN
      SELECT
        group_teams_table.team_id,
        group_teams_table.position,
        groups_table.group_number
      FROM public.championship_bracket_group_teams AS group_teams_table
      JOIN public.championship_bracket_groups AS groups_table
        ON groups_table.id = group_teams_table.group_id
      WHERE groups_table.competition_id = _competition_id
        AND group_teams_table.position = 2
      ORDER BY groups_table.group_number ASC
    LOOP
      IF cardinality(qualified_team_ids) >= target_bracket_size THEN
        EXIT;
      END IF;
      qualified_team_ids := array_append(qualified_team_ids, v_best_second_pool.team_id);
    END LOOP;

    qualified_team_count := cardinality(qualified_team_ids);
  END IF;

  -- Tamanho do bracket (próxima potência de 2)
  bracket_size := (
    SELECT MIN(p) FROM unnest(ARRAY[2,4,8,16,32]) AS p
    WHERE p >= qualified_team_count
  );

  IF bracket_size IS NULL THEN
    RETURN NULL;
  END IF;

  total_rounds := round(log(2, bracket_size))::INTEGER;
  current_round := 1;

  -- Semeia o primeiro round com o padrão linear: slot k = seed_k × seed_(N+1-k)
  round_match_ids := ARRAY[]::UUID[];

  FOR slot_index IN 1..(bracket_size / 2)
  LOOP
    home_seed_index := slot_index;
    away_seed_index := bracket_size + 1 - slot_index;

    home_team_id := CASE WHEN home_seed_index <= cardinality(qualified_team_ids) THEN qualified_team_ids[home_seed_index] ELSE NULL END;
    away_team_id := CASE WHEN away_seed_index <= cardinality(qualified_team_ids) THEN qualified_team_ids[away_seed_index] ELSE NULL END;

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
      current_round,
      slot_index,
      home_team_id,
      away_team_id,
      CASE
        WHEN home_team_id IS NOT NULL AND away_team_id IS NULL THEN home_team_id
        WHEN away_team_id IS NOT NULL AND home_team_id IS NULL THEN away_team_id
        ELSE NULL
      END,
      (home_team_id IS NULL OR away_team_id IS NULL)
    )
    RETURNING id INTO bracket_match_id;

    IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
      PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
    END IF;

    round_match_ids := array_append(round_match_ids, bracket_match_id);
  END LOOP;

  IF cardinality(round_match_ids) = 2 THEN
    semifinal_match_ids := round_match_ids;
  END IF;

  -- Gera rounds subsequentes
  IF total_rounds > 1 THEN
    FOR current_round IN 2..total_rounds
    LOOP
      next_round_match_ids := ARRAY[]::UUID[];

      FOR slot_index IN 1..(COALESCE(cardinality(round_match_ids), 0) / 2)
      LOOP
        source_home_bracket_match_id := round_match_ids[(slot_index * 2) - 1];
        source_away_bracket_match_id := round_match_ids[(slot_index * 2)];

        SELECT bracket_matches_table.winner_team_id
        INTO source_home_winner_team_id
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.id = source_home_bracket_match_id
        LIMIT 1;

        SELECT bracket_matches_table.winner_team_id
        INTO source_away_winner_team_id
        FROM public.championship_bracket_matches AS bracket_matches_table
        WHERE bracket_matches_table.id = source_away_bracket_match_id
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
          source_away_bracket_match_id
        ) VALUES (
          bracket_edition_id,
          _competition_id,
          'KNOCKOUT'::public.bracket_phase,
          current_round,
          slot_index,
          home_team_id,
          away_team_id,
          CASE
            WHEN home_team_id IS NULL AND away_team_id IS NOT NULL THEN away_team_id
            WHEN away_team_id IS NULL AND home_team_id IS NOT NULL THEN home_team_id
            ELSE NULL
          END,
          source_home_bracket_match_id,
          source_away_bracket_match_id
        )
        RETURNING id INTO bracket_match_id;

        -- Registra o link inverso para propagação do vencedor
        UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = source_home_bracket_match_id;

        UPDATE public.championship_bracket_matches
          SET next_bracket_match_id = bracket_match_id
          WHERE id = source_away_bracket_match_id;

        IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN
          PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);
        END IF;

        next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);

        IF current_round = 2 AND cardinality(round_match_ids) = 2 THEN
          semifinal_match_ids := round_match_ids;
        END IF;
      END LOOP;

      round_match_ids := next_round_match_ids;
    END LOOP;
  END IF;

  -- Jogo do 3º lugar
  IF third_place_mode_value = 'MATCH'::public.bracket_third_place_mode
    AND cardinality(semifinal_match_ids) = 2 THEN
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
      is_third_place
    ) VALUES (
      bracket_edition_id,
      _competition_id,
      'KNOCKOUT'::public.bracket_phase,
      total_rounds,
      0,
      NULL,
      NULL,
      NULL,
      semifinal_match_ids[1],
      semifinal_match_ids[2],
      true
    );
  END IF;

  RETURN _competition_id;
END;
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS
  'Gera o mata-mata por competição com seeding LINEAR. Guard geral aguarda todos os grupos. '
  'Seta next_bracket_match_id nas semis para permitir propagação automática do vencedor.';

NOTIFY pgrst, 'reload schema';
