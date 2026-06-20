-- Corrige o jogo AFA x AAJ que foi salvo com o primeiro horário/slot da quadra
-- ao editar apenas o placar. Isso deslocou a ordem visual da Quadra B em
-- 20/06/2026, fazendo o card perder a representação esperada de UCA x AMEN e
-- voltar a aparecer como o primeiro jogo da quadra.
--
-- A correção recoloca o confronto na lacuna operacional livre entre:
-- - UCA x AMEN (slot 7)
-- - ACATO x SOBERANOS (slot 9)
--
-- Nenhum outro jogo é alterado.

DO $$
DECLARE
  target_match_id CONSTANT uuid := 'e5cfd215-62f2-446a-8e0e-e5a4734d5646'::uuid;
  target_championship_id CONSTANT uuid := '17b92cf5-dd92-44eb-9295-b28000372e4b'::uuid;
  corrected_start_time CONSTANT timestamptz := '2026-06-20T16:40:00+00:00'::timestamptz;
  corrected_end_time CONSTANT timestamptz := '2026-06-20T17:15:00+00:00'::timestamptz;
  target_match RECORD;
  slot_conflicts_count INTEGER := 0;
BEGIN
  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.location,
    matches_table.court_name,
    matches_table.status,
    matches_table.scheduled_slot,
    matches_table.queue_position,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.manual_representation_mode
  INTO target_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = target_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jogo AFA x AAJ (%) não encontrado para correção.', target_match_id;
  END IF;

  IF target_match.championship_id != target_championship_id THEN
    RAISE EXCEPTION
      'Jogo % pertence ao campeonato %, mas a migration esperava %.',
      target_match_id,
      target_match.championship_id,
      target_championship_id;
  END IF;

  IF target_match.scheduled_date IS DISTINCT FROM date '2026-06-20'
    OR target_match.location IS DISTINCT FROM 'Arena Seven'
    OR target_match.court_name IS DISTINCT FROM 'Quadra B' THEN
    RAISE EXCEPTION
      'Jogo % está em %, %, %; a migration foi escrita para Arena Seven / Quadra B / 20-06-2026.',
      target_match_id,
      target_match.scheduled_date,
      target_match.location,
      target_match.court_name;
  END IF;

  IF target_match.status IS DISTINCT FROM 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION
      'Jogo % está com status %, mas a correção foi planejada para um jogo encerrado.',
      target_match_id,
      target_match.status;
  END IF;

  IF target_match.manual_representation_mode IS DISTINCT FROM 'AUTO' THEN
    RAISE EXCEPTION
      'Jogo % está com manual_representation_mode %, e a migration não deve sobrescrever uma representação manual.',
      target_match_id,
      target_match.manual_representation_mode;
  END IF;

  IF target_match.scheduled_slot = 8
    AND target_match.start_time IS NOT DISTINCT FROM corrected_start_time
    AND target_match.end_time IS NOT DISTINCT FROM corrected_end_time THEN
    RAISE NOTICE 'Jogo % já está corrigido. Nenhuma alteração aplicada.', target_match_id;
    RETURN;
  END IF;

  SELECT count(*)
  INTO slot_conflicts_count
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = target_championship_id
    AND matches_table.season_year = target_match.season_year
    AND matches_table.scheduled_date = date '2026-06-20'
    AND matches_table.location = 'Arena Seven'
    AND matches_table.court_name = 'Quadra B'
    AND matches_table.scheduled_slot = 8
    AND matches_table.id != target_match_id;

  IF slot_conflicts_count > 0 THEN
    RAISE EXCEPTION
      'Já existe outro jogo ocupando o slot 8 da Arena Seven / Quadra B em 20/06/2026.';
  END IF;

  UPDATE public.matches AS matches_table
  SET
    scheduled_slot = 8,
    start_time = corrected_start_time,
    end_time = corrected_end_time
  WHERE matches_table.id = target_match_id;
END
$$;
