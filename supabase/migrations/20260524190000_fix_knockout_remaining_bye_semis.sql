-- Complementa 20260524180000: corrige competições com BYEs indevidos em round = 1
-- que foram ignoradas pelo bloco retroativo anterior.
--
-- Causa mais provável: slots órfãos de GROUP_STAGE (match_id IS NULL) faziam
-- count(bm.match_id) = 0 para algum grupo, resultando em is_group_finished = false
-- e o bloco pulando a competição.
--
-- Fix: para cada competição ainda afetada (BYE em round 1, sem jogo de KO disputado),
-- limpa os slots órfãos de GROUP_STAGE primeiro e só então re-verifica se os grupos
-- estão todos finalizados antes de deletar e regenerar o mata-mata.

DO $fix_remaining_bye_semis$
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
    -- Não regera se algum jogo de mata-mata já foi disputado
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

    -- Remove slots órfãos de GROUP_STAGE (match_id IS NULL) que causavam
    -- count(match_id) = 0 → is_group_finished = false mesmo com todos jogos reais finalizados
    DELETE FROM public.championship_bracket_matches
    WHERE competition_id = comp.competition_id
      AND phase = 'GROUP_STAGE'
      AND match_id IS NULL;

    -- Re-verifica se todos os grupos estão finalizados após limpeza dos órfãos
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

    IF all_finished IS NOT TRUE THEN
      CONTINUE;
    END IF;

    -- Remove matches ligados aos slots de KO desta competição
    DELETE FROM public.matches
    WHERE id IN (
      SELECT bm.match_id
      FROM public.championship_bracket_matches bm
      WHERE bm.competition_id = comp.competition_id
        AND bm.phase = 'KNOCKOUT'
        AND bm.match_id IS NOT NULL
    );

    -- Limpa referências self-referenciadas antes de deletar os slots
    UPDATE public.championship_bracket_matches
    SET
      source_home_bracket_match_id = NULL,
      source_away_bracket_match_id = NULL,
      next_bracket_match_id = NULL
    WHERE competition_id = comp.competition_id
      AND phase = 'KNOCKOUT';

    DELETE FROM public.championship_bracket_matches
    WHERE competition_id = comp.competition_id
      AND phase = 'KNOCKOUT';

    -- Regera com a lógica corrigida
    PERFORM public.generate_championship_knockout_for_competition(
      comp.championship_id,
      comp.competition_id,
      comp.bracket_edition_id
    );
  END LOOP;
END;
$fix_remaining_bye_semis$;
