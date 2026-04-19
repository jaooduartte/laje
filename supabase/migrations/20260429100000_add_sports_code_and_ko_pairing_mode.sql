-- migration: 20260429100000_add_sports_code_and_ko_pairing_mode.sql
--
-- Contexto:
--   A geração do mata-mata usa seeding LINEAR para todas as modalidades. O regulamento
--   exige cruzamentos específicos por modalidade:
--     - Futevôlei Feminino (4 grupos, qualifiers_per_group=2):
--         LINEAR já produz 1ºA×2ºD, 1ºB×2ºC, 1ºC×2ºB, 1ºD×2ºA, pois com o ordering
--         por group_number (G1→G4 = seeds 1-4, depois G1→G4 = seeds 5-8):
--         LINEAR [1v8, 2v7, 3v6, 4v5] → 1ºG1×2ºG4, 1ºG2×2ºG3, 1ºG3×2ºG2, 1ºG4×2ºG1 ✓
--     - Beach Soccer Feminino (2 grupos, qualifiers_per_group=2):
--         LINEAR [1v4, 2v3] → 1ºG1×2ºG2, 1ºG2×2ºG1 = semis diretas ✓
--     - Demais: LINEAR sem alterações.
--
-- Conclusão: O algoritmo de geração não precisa mudar.
--   Esta migration registra o MODO DE PAREAMENTO como metadado (`knockout_pairing_mode`)
--   para documentar a intenção por competição, sem alterar o algoritmo.
--
-- NOTA: Usuário aplica esta migration manualmente.
--       NÃO aplicar via ferramenta.

-- ============================================================
-- 1. Adiciona código canônico em sports
-- ============================================================
ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE public.sports SET code = 'BEACH_SOCCER'    WHERE name = 'Beach Soccer';
UPDATE public.sports SET code = 'BEACH_TENNIS'    WHERE name = 'Beach Tennis';
UPDATE public.sports SET code = 'FUTEVOLEI'       WHERE name = 'Futevôlei';
UPDATE public.sports SET code = 'VOLEI_PRAIA'     WHERE name = 'Vôlei de Praia';
UPDATE public.sports SET code = 'FUTEBOL_SOCIETY' WHERE name = 'Futebol Society';

CREATE UNIQUE INDEX IF NOT EXISTS sports_code_key ON public.sports (code) WHERE code IS NOT NULL;

-- ============================================================
-- 2. Adiciona knockout_pairing_mode em championship_bracket_competitions
-- ============================================================
ALTER TABLE public.championship_bracket_competitions
  ADD COLUMN IF NOT EXISTS knockout_pairing_mode TEXT NOT NULL DEFAULT 'LINEAR'
  CHECK (knockout_pairing_mode IN ('LINEAR', 'FUTEVOLEI_FEM_INVERTED', 'BEACH_SOCCER_FEM_DIRECT_SEMI'));

-- ============================================================
-- 3. Backfill do knockout_pairing_mode para competições existentes
-- ============================================================
UPDATE public.championship_bracket_competitions AS comp
SET knockout_pairing_mode = CASE
  WHEN sports_table.code = 'FUTEVOLEI'    AND comp.naipe = 'FEMININO' THEN 'FUTEVOLEI_FEM_INVERTED'
  WHEN sports_table.code = 'BEACH_SOCCER' AND comp.naipe = 'FEMININO' THEN 'BEACH_SOCCER_FEM_DIRECT_SEMI'
  ELSE 'LINEAR'
END
FROM public.sports AS sports_table
WHERE sports_table.id = comp.sport_id;

-- ============================================================
-- 4. Atualiza generate_championship_knockout_for_competition
--    para ler knockout_pairing_mode e incluí-lo no record de log/auditoria.
--    O algoritmo de geração continua LINEAR para todos os modos atuais porque:
--      - FUTEVOLEI_FEM_INVERTED com qualifiers_per_group=2 e ordering por group_number
--        JÁ produz 1ºA×2ºD, 1ºB×2ºC etc. via seeding linear.
--      - BEACH_SOCCER_FEM_DIRECT_SEMI com 2 grupos × qualifiers_per_group=2
--        JÁ produz semis 1ºG1×2ºG2 e 1ºG2×2ºG1 via seeding linear.
-- ============================================================
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
  finished_group_count_value INTEGER;
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
    competitions_table.third_place_mode,
    COALESCE(competitions_table.knockout_pairing_mode, 'LINEAR') AS knockout_pairing_mode
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
        WHEN competition_record.qualifiers_per_group = 1
          AND competition_record.should_complete_knockout_with_best_second_placed_teams = true
        THEN COALESCE(pool_rankings.pool_rank, ordered_groups.group_number + 1000)
        ELSE ordered_groups.group_number
      END ASC
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

  -- Seeding LINEAR: slot k = seed_k × seed_(bracket_size+1-k)
  -- Para qualifiers_per_group=2 ordenado por group_number, o LINEAR produz
  -- o cruzamento correto sem ajustes adicionais:
  --   8 times [1ºA,1ºB,1ºC,1ºD, 2ºA,2ºB,2ºC,2ºD] → [1v8,2v7,3v6,4v5]
  --     = 1ºA×2ºD, 1ºB×2ºC, 1ºC×2ºB, 1ºD×2ºA (FUTEVOLEI_FEM_INVERTED ✓)
  --   4 times [1ºA,1ºB, 2ºA,2ºB] → [1v4,2v3]
  --     = 1ºA×2ºB, 1ºB×2ºA (BEACH_SOCCER_FEM_DIRECT_SEMI ✓)
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

  IF existing_knockout_count = 0 THEN
    round_match_ids := ARRAY[]::UUID[];
    semifinal_match_ids := ARRAY[]::UUID[];

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

    IF total_rounds > 1 THEN
      FOR current_round IN 2..total_rounds
      LOOP
        IF current_round = total_rounds THEN
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

          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);
        END LOOP;

        round_match_ids := next_round_match_ids;
      END LOOP;
    END IF;

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
        2,
        NULL,
        NULL,
        NULL,
        semifinal_match_ids[1],
        semifinal_match_ids[2],
        true
      );
    END IF;
  END IF;

  RETURN _competition_id;
END;
$func$;

COMMENT ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) IS
  'Gera o mata-mata por competição com seeding LINEAR: slot k = seed_k × seed_(N+1-k). '
  'Para qualifiers_per_group=2 ordenado por group_number, o LINEAR já produz os cruzamentos '
  'corretos para todos os modos de pareamento: '
  '  FUTEVOLEI_FEM_INVERTED (4 grupos): [1v8,2v7,3v6,4v5] = 1ºA×2ºD, 1ºB×2ºC etc. '
  '  BEACH_SOCCER_FEM_DIRECT_SEMI (2 grupos): [1v4,2v3] = 1ºA×2ºB, 1ºB×2ºA. '
  'O campo knockout_pairing_mode documenta a intenção por competição. '
  'Para qualifiers_per_group=1 com best_seconds, ordena por pool_rank. '
  'Para qualifiers_per_group>1, ordena por group_number para preservar sequência G1→G2.';

GRANT EXECUTE ON FUNCTION public.generate_championship_knockout_for_competition(UUID, UUID, UUID) TO anon, authenticated;

-- ============================================================
-- 5. Regenera KOs de competições sem partidas KO finalizadas
-- ============================================================
DO $regenerate$
DECLARE
  competition_record RECORD;
BEGIN
  FOR competition_record IN
    SELECT
      competitions_table.id AS competition_id,
      editions_table.championship_id,
      editions_table.id AS bracket_edition_id
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = competitions_table.bracket_edition_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bm
      LEFT JOIN public.matches AS m ON m.id = bm.match_id
      WHERE bm.competition_id = competitions_table.id
        AND bm.phase = 'KNOCKOUT'
        AND m.status = 'FINISHED'
    )
    AND EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bm
      WHERE bm.competition_id = competitions_table.id
        AND bm.phase = 'KNOCKOUT'
    )
  LOOP
    DELETE FROM public.matches
    WHERE id IN (
      SELECT bm.match_id
      FROM public.championship_bracket_matches bm
      WHERE bm.competition_id = competition_record.competition_id
        AND bm.phase = 'KNOCKOUT'
        AND bm.match_id IS NOT NULL
    );

    UPDATE public.championship_bracket_matches
    SET source_home_bracket_match_id = NULL,
        source_away_bracket_match_id = NULL,
        next_bracket_match_id = NULL
    WHERE competition_id = competition_record.competition_id
      AND phase = 'KNOCKOUT';

    DELETE FROM public.championship_bracket_matches
    WHERE competition_id = competition_record.competition_id
      AND phase = 'KNOCKOUT';

    PERFORM public.generate_championship_knockout_for_competition(
      competition_record.championship_id,
      competition_record.competition_id,
      competition_record.bracket_edition_id
    );
  END LOOP;
END;
$regenerate$;

NOTIFY pgrst, 'reload schema';
