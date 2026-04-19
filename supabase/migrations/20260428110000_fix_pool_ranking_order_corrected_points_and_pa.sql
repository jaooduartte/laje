-- migration: 20260428110000_fix_pool_ranking_order_corrected_points_and_pa.sql
--
-- Problema:
--   A função get_championship_bracket_competition_qualification_pool_ranking(s) ordenava os
--   seeds pelo pool_rank usando pontos BRUTOS (points_base, wins, goal_diff, goals_for).
--   Quando grupos têm tamanhos diferentes (ex: 1 grupo de 4 times e 6 grupos de 3 times),
--   os times do grupo maior jogam mais partidas e acumulam mais pontos brutos injustamente.
--   Ex: AAAUS (G1, 4 times, 3V = 9 pts brutos) aparecia como seed 1,
--       mas CAMALEÃO (G2, 3 times, 2V = 6 pts brutos → 9 pts CORRIGIDOS, PA=3,00)
--       deveria ser seed 1 pelo critério da classificação exibida no app.
--
-- Correção:
--   Usar pontos CORRIGIDOS (corrected_points = points_base × correction_factor) como
--   métrica principal, com PA (pontos_médios = goals_for / goals_against) como desempate,
--   exatamente igual à lógica já usada no get_championship_corrected_group_standings.
--
--   correction_factor = max_matches_in_competition / (group_size - 1)
--   onde max_matches = max(group_size - 1) sobre todos os grupos da competição.
--
--   Ordem de classificação:
--     1. qualification_rank ASC (1ºs antes dos 2ºs)
--     2. corrected_points DESC
--     3. points_average DESC (PA = goals_for / goals_against)
--     4. goal_diff DESC
--     5. goals_for DESC
--     6. draw_order ASC (desempate manual por sorteio, se houver)
--     7. team_name ASC (alfabético como último critério)
--
-- Efeito esperado para vôlei de praia feminino (grupos de 4 e 3 times):
--   Antes: seed 1 = AAAUS (9 pts brutos)   → slot 1 = AAAUS vs UEFA
--   Depois: seed 1 = CAMALEÃO (9 pts corrigidos, PA=3,00) → slot 1 = CAMALEÃO vs UEFA

-- ============================================================
-- 1. Atualiza a função com nome SINGULAR (versão no banco atual)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_championship_bracket_competition_qualification_pool_ranking(
  _championship_id UUID,
  _competition_id UUID
)
RETURNS TABLE(
  competition_id UUID,
  team_id UUID,
  team_name TEXT,
  qualification_rank INTEGER,
  points BIGINT,
  wins BIGINT,
  goal_diff BIGINT,
  goals_for BIGINT,
  pool_rank INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  WITH competition_context AS (
    SELECT
      competitions_table.id,
      competitions_table.qualifiers_per_group,
      competitions_table.should_complete_knockout_with_best_second_placed_teams
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.id = _competition_id
    LIMIT 1
  ),
  group_rankings AS (
    SELECT *
    FROM public.get_championship_bracket_competition_group_rankings(_championship_id, _competition_id)
  ),
  -- Tamanho de cada grupo (necessário para calcular correction_factor)
  group_sizes AS (
    SELECT
      group_rankings.group_id,
      count(*) AS group_size
    FROM group_rankings
    GROUP BY group_rankings.group_id
  ),
  -- Máximo de partidas jogadas por time em qualquer grupo da competição
  max_matches AS (
    SELECT GREATEST(1, max(group_sizes.group_size - 1)) AS max_match_count
    FROM group_sizes
  ),
  candidate_rows AS (
    SELECT
      group_rankings.competition_id,
      group_rankings.group_id,
      group_rankings.team_id,
      group_rankings.team_name,
      group_rankings.team_rank AS qualification_rank,
      group_rankings.points AS points_base,
      group_rankings.wins,
      group_rankings.goal_diff,
      group_rankings.goals_for,
      -- corrected_points: equaliza pontos entre grupos de tamanhos diferentes
      CASE
        WHEN GREATEST(1, group_sizes.group_size - 1) = 0 THEN group_rankings.points::numeric
        ELSE group_rankings.points::numeric
             * max_matches.max_match_count::numeric
             / GREATEST(1, group_sizes.group_size - 1)::numeric
      END AS corrected_points,
      -- points_average: goals_for / goals_against (PA exibido na classificação)
      CASE
        WHEN GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff) = 0 THEN
          CASE
            WHEN group_rankings.goals_for = 0 THEN 0::numeric
            ELSE 1000000000::numeric
          END
        ELSE group_rankings.goals_for::numeric
             / GREATEST(0, group_rankings.goals_for - group_rankings.goal_diff)::numeric
      END AS points_average
    FROM group_rankings
    JOIN group_sizes ON group_sizes.group_id = group_rankings.group_id
    CROSS JOIN max_matches
    CROSS JOIN competition_context
    WHERE
      group_rankings.team_rank <= GREATEST(competition_context.qualifiers_per_group, 2)
      OR (
        competition_context.should_complete_knockout_with_best_second_placed_teams = true
        AND group_rankings.team_rank = 2
      )
  ),
  -- Detecta empates reais (mesmos corrected_points, PA, goal_diff, goals_for)
  pool_metric_tie_sets AS (
    SELECT
      candidate_rows.qualification_rank,
      string_agg(candidate_rows.team_id::text, '|' ORDER BY candidate_rows.team_id::text) AS tied_team_signature,
      array_agg(candidate_rows.team_id ORDER BY candidate_rows.team_id::text) AS tied_team_ids
    FROM candidate_rows
    GROUP BY
      candidate_rows.qualification_rank,
      round(candidate_rows.corrected_points, 10),
      round(candidate_rows.points_average, 10),
      candidate_rows.goal_diff,
      candidate_rows.goals_for
    HAVING count(*) > 1
  ),
  pool_tie_context_members AS (
    SELECT
      pool_metric_tie_sets.qualification_rank,
      unnest(pool_metric_tie_sets.tied_team_ids) AS team_id,
      public.build_championship_bracket_tie_break_context_key(
        'QUALIFICATION_POOL'::public.championship_bracket_tie_break_context_type,
        _competition_id,
        NULL,
        pool_metric_tie_sets.qualification_rank,
        pool_metric_tie_sets.tied_team_signature
      ) AS context_key
    FROM pool_metric_tie_sets
  ),
  pool_tie_resolution_orders AS (
    SELECT
      pool_tie_context_members.qualification_rank,
      pool_tie_context_members.team_id,
      resolution_teams_table.draw_order
    FROM pool_tie_context_members
    LEFT JOIN public.championship_bracket_tie_break_resolutions AS resolutions_table
      ON resolutions_table.context_key = pool_tie_context_members.context_key
    LEFT JOIN public.championship_bracket_tie_break_resolution_teams AS resolution_teams_table
      ON resolution_teams_table.resolution_id = resolutions_table.id
      AND resolution_teams_table.team_id = pool_tie_context_members.team_id
  ),
  ranked_pool AS (
    SELECT
      candidate_rows.competition_id,
      candidate_rows.team_id,
      candidate_rows.team_name,
      candidate_rows.qualification_rank,
      candidate_rows.points_base::bigint AS points,
      candidate_rows.wins,
      candidate_rows.goal_diff,
      candidate_rows.goals_for,
      row_number() OVER (
        ORDER BY
          candidate_rows.qualification_rank ASC,
          candidate_rows.corrected_points DESC,
          candidate_rows.points_average DESC,
          candidate_rows.goal_diff DESC,
          candidate_rows.goals_for DESC,
          COALESCE(pool_tie_resolution_orders.draw_order, 2147483647) ASC,
          candidate_rows.team_name ASC
      ) AS pool_rank
    FROM candidate_rows
    LEFT JOIN pool_tie_resolution_orders
      ON pool_tie_resolution_orders.qualification_rank = candidate_rows.qualification_rank
      AND pool_tie_resolution_orders.team_id = candidate_rows.team_id
  )
  SELECT
    ranked_pool.competition_id,
    ranked_pool.team_id,
    ranked_pool.team_name,
    ranked_pool.qualification_rank,
    ranked_pool.points,
    ranked_pool.wins,
    ranked_pool.goal_diff,
    ranked_pool.goals_for,
    ranked_pool.pool_rank
  FROM ranked_pool
  ORDER BY ranked_pool.pool_rank ASC, ranked_pool.team_name ASC;
$func$;

COMMENT ON FUNCTION public.get_championship_bracket_competition_qualification_pool_ranking(UUID, UUID) IS
  'Retorna o ranking global de qualificados para o mata-mata, usando pontos CORRIGIDOS '
  '(correction_factor = max_matches / (group_size-1)) e PA (goals_for/goals_against) como '
  'critérios de desempate — igual à classificação exibida no app. '
  'Inclui qualification_rank=1 (1ºs de grupo) e qualification_rank=2 (2ºs), '
  'paginando 1ºs antes dos 2ºs para facilitar o seeding linear do mata-mata. '
  'NOTA: a variante "plural" (_rankings) NÃO é criada como função separada porque o PostgreSQL '
  'trunca identifiers para 63 chars — ambos os nomes colitem no mesmo identificador. '
  'generate_championship_knockout_for_competition já chama a versão truncada corretamente.';

-- ============================================================
-- 2. A versão PLURAL (_rankings, 64 chars) não é criada aqui.
--    O PostgreSQL limita identifiers a 63 chars, portanto o nome
--    "..._pool_rankings" seria silenciosamente truncado para
--    "..._pool_ranking" — idêntico à função singular acima.
--    Criar um wrapper plural causaria recursão infinita (a função
--    chamaria a si mesma). Como generate_championship_knockout
--    foi criado com o mesmo truncamento, ele já resolve para
--    esta função corretamente sem precisar de um alias.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_competition_qualification_pool_ranking(UUID, UUID) TO anon, authenticated;

-- ============================================================
-- 3. Regenera todos os mata-matas com a nova lógica de seeding
--    (apenas competições sem partidas eliminatórias já jogadas)
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
    -- Só regenera se nenhuma partida KO já foi jogada
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
    -- Remove partidas de mata-matas associadas (matches table)
    DELETE FROM public.matches
    WHERE id IN (
      SELECT bm.match_id
      FROM public.championship_bracket_matches bm
      WHERE bm.competition_id = competition_record.competition_id
        AND bm.phase = 'KNOCKOUT'
        AND bm.match_id IS NOT NULL
    );

    -- Remove referências de fonte antes de deletar
    UPDATE public.championship_bracket_matches
    SET source_home_bracket_match_id = NULL,
        source_away_bracket_match_id = NULL,
        next_bracket_match_id = NULL
    WHERE competition_id = competition_record.competition_id
      AND phase = 'KNOCKOUT';

    -- Remove bracket matches do KO
    DELETE FROM public.championship_bracket_matches
    WHERE competition_id = competition_record.competition_id
      AND phase = 'KNOCKOUT';

    -- Regenera com a nova lógica (corrected_points + PA)
    PERFORM public.generate_championship_knockout_for_competition(
      competition_record.championship_id,
      competition_record.competition_id,
      competition_record.bracket_edition_id
    );
  END LOOP;
END;
$regenerate$;

NOTIFY pgrst, 'reload schema';
