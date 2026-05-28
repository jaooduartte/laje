-- Limpa brackets de mata-mata gerados prematuramente antes de todos os grupos
-- da competição estarem finalizados.
--
-- Contexto: quando should_complete_knockout_with_best_second_placed_teams = true,
-- o bracket só deve ser gerado após TODOS os grupos terminarem (para que os melhores
-- 2ºs possam ser determinados). As migrations 20260524180000 e 20260524190000
-- introduziram esse guard na função, mas o bloco retroativo só agia quando
-- all_groups_finished = true — por isso competições com grupos ainda pendentes
-- permaneciam com o bracket errado (ex: final AAAMU × ADIN já agendada enquanto
-- o Grupo B ainda não foi disputado).
--
-- Fix: para competições com BYE indevido em round = 1 e sem jogo de KO disputado
-- (FINISHED), deleta o bracket errado independentemente do estado dos grupos.
-- Se os grupos estiverem todos finalizados, regenera imediatamente.
-- Caso contrário, deixa sem bracket — o trigger generate_championship_knockout_for_competition
-- será chamado ao fim do último jogo do último grupo e gerará a chave correta.

DO $clear_premature_ko$
DECLARE
  comp RECORD;
  all_finished BOOLEAN;
  has_played_knockout BOOLEAN;
BEGIN
  FOR comp IN
    SELECT
      c.id AS competition_id,
      e.championship_id,
      e.id AS bracket_edition_id
    FROM public.championship_bracket_competitions AS c
    JOIN public.championship_bracket_editions AS e ON e.id = c.bracket_edition_id
    WHERE c.should_complete_knockout_with_best_second_placed_teams = true
      AND EXISTS (
        SELECT 1
        FROM public.championship_bracket_matches bm
        WHERE bm.competition_id = c.id
          AND bm.phase = 'KNOCKOUT'
          AND bm.round_number = 1
          AND bm.is_bye = true
          AND bm.is_third_place = false
      )
  LOOP
    -- Nunca deleta se algum jogo de mata-mata já foi disputado
    SELECT EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches bm
      JOIN public.matches m ON m.id = bm.match_id
      WHERE bm.competition_id = comp.competition_id
        AND bm.phase = 'KNOCKOUT'
        AND m.status = 'FINISHED'
    ) INTO has_played_knockout;

    IF has_played_knockout THEN
      CONTINUE;
    END IF;

    -- Remove os matches ligados aos slots de KO (ex: a final prematuramente agendada)
    DELETE FROM public.matches
    WHERE id IN (
      SELECT bm.match_id
      FROM public.championship_bracket_matches bm
      WHERE bm.competition_id = comp.competition_id
        AND bm.phase = 'KNOCKOUT'
        AND bm.match_id IS NOT NULL
    );

    -- Limpa referências self-referenciadas
    UPDATE public.championship_bracket_matches
    SET
      source_home_bracket_match_id = NULL,
      source_away_bracket_match_id = NULL,
      next_bracket_match_id = NULL
    WHERE competition_id = comp.competition_id
      AND phase = 'KNOCKOUT';

    -- Remove os slots de KO errados
    DELETE FROM public.championship_bracket_matches
    WHERE competition_id = comp.competition_id
      AND phase = 'KNOCKOUT';

    -- Remove slots órfãos de GROUP_STAGE que possam afetar a verificação
    DELETE FROM public.championship_bracket_matches
    WHERE competition_id = comp.competition_id
      AND phase = 'GROUP_STAGE'
      AND match_id IS NULL;

    -- Verifica se todos os grupos já estão finalizados
    SELECT bool_and(group_statuses.is_group_finished)
    INTO all_finished
    FROM (
      SELECT
        g.id,
        (
          count(bm.match_id) > 0
          AND count(*) FILTER (WHERE m.status = 'FINISHED') = count(bm.match_id)
        ) AS is_group_finished
      FROM public.championship_bracket_groups AS g
      LEFT JOIN public.championship_bracket_matches AS bm
        ON bm.group_id = g.id AND bm.phase = 'GROUP_STAGE'
      LEFT JOIN public.matches AS m ON m.id = bm.match_id
      WHERE g.competition_id = comp.competition_id
      GROUP BY g.id
    ) AS group_statuses;

    IF all_finished IS TRUE THEN
      -- Grupos todos finalizados: regenera imediatamente com a chave correta
      PERFORM public.generate_championship_knockout_for_competition(
        comp.championship_id,
        comp.competition_id,
        comp.bracket_edition_id
      );
      -- Caso contrário: deixa sem bracket. O trigger disparará ao fim do último
      -- jogo de grupo e generate_championship_knockout_for_competition gerará a
      -- chave correta com existing_knockout_count = 0.
    END IF;
  END LOOP;
END;
$clear_premature_ko$;
