-- Corrige generate_championship_knockout_for_competition:
-- Quando todos os slots de round 1 são BYEs (ex: chave de 2 times reais em bracket_size=4),
-- os winners já são conhecidos no momento da criação e o slot da final fica com
-- home_team_id e away_team_id preenchidos, mas create_championship_knockout_match_schedule
-- nunca era chamado para rounds > 1 — deixando match_id = NULL indefinidamente.
--
-- Fix: após inserir cada slot de round > 1, chama create_championship_knockout_match_schedule
-- quando ambos os times já são conhecidos (mesmo comportamento já existente para round 1).
--
-- Correção retroativa: chama create_championship_knockout_match_schedule para os slots
-- de KNOCKOUT já existentes com home_team_id + away_team_id definidos e match_id NULL.

DO $$
DECLARE
  v_func_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'generate_championship_knockout_for_competition';

  IF v_func_def IS NULL THEN
    RAISE EXCEPTION 'Função generate_championship_knockout_for_competition não encontrada.';
  END IF;

  -- Adiciona a chamada create_championship_knockout_match_schedule antes de
  -- next_round_match_ids := array_append(...) no loop de rounds > 1.
  v_func_def := replace(
    v_func_def,
    '          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);',
    '          IF home_team_id IS NOT NULL AND away_team_id IS NOT NULL THEN' || chr(10) ||
    '            PERFORM public.create_championship_knockout_match_schedule(_championship_id, bracket_match_id);' || chr(10) ||
    '          END IF;' || chr(10) ||
    '          next_round_match_ids := array_append(next_round_match_ids, bracket_match_id);'
  );

  EXECUTE v_func_def;
END;
$$;

-- Correção retroativa: gera os jogos para os slots de knockout que já têm os
-- dois times definidos mas ainda não têm um jogo associado.
DO $$
DECLARE
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT
      bm.id AS bracket_match_id,
      be.championship_id
    FROM public.championship_bracket_matches AS bm
    JOIN public.championship_bracket_competitions AS comp ON comp.id = bm.competition_id
    JOIN public.championship_bracket_editions AS be ON be.id = comp.bracket_edition_id
    WHERE bm.phase = 'KNOCKOUT'
      AND bm.round_number > 1
      AND bm.match_id IS NULL
      AND bm.home_team_id IS NOT NULL
      AND bm.away_team_id IS NOT NULL
      AND bm.is_bye = false
      AND bm.is_third_place = false
  LOOP
    PERFORM public.create_championship_knockout_match_schedule(
      v_record.championship_id,
      v_record.bracket_match_id
    );
  END LOOP;
END;
$$;
