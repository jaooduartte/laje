CREATE OR REPLACE FUNCTION public.reposition_match_queue_slot(
  _match_id UUID,
  _target_slot INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moving_match RECORD;
  displaced_match RECORD;
  moving_current_slot INTEGER;
  displaced_slot INTEGER;
  temporary_slot_base INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para reposicionar a fila dos jogos.';
  END IF;

  IF _target_slot IS NULL OR _target_slot < 1 THEN
    RAISE EXCEPTION 'Informe um slot de fila válido para reposicionar o jogo.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.naipe,
    matches_table.division,
    matches_table.status,
    COALESCE(matches_table.queue_position, matches_table.scheduled_slot) AS queue_slot
  INTO moving_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF moving_match.id IS NULL THEN
    RAISE EXCEPTION 'Jogo não encontrado para reposicionar a fila.';
  END IF;

  IF moving_match.status != 'SCHEDULED'::public.match_status THEN
    RAISE EXCEPTION 'Somente jogos agendados podem ser reposicionados na fila.';
  END IF;

  IF moving_match.scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Informe o dia da fila antes de reposicionar o jogo.';
  END IF;

  moving_current_slot := moving_match.queue_slot;

  PERFORM 1
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = moving_match.championship_id
    AND matches_table.season_year = moving_match.season_year
    AND matches_table.scheduled_date = moving_match.scheduled_date
    AND matches_table.status = 'SCHEDULED'::public.match_status
  FOR UPDATE;

  SELECT
    matches_table.id,
    COALESCE(matches_table.queue_position, matches_table.scheduled_slot) AS queue_slot
  INTO displaced_match
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = moving_match.championship_id
    AND matches_table.season_year = moving_match.season_year
    AND matches_table.scheduled_date = moving_match.scheduled_date
    AND matches_table.sport_id = moving_match.sport_id
    AND matches_table.naipe = moving_match.naipe
    AND matches_table.division IS NOT DISTINCT FROM moving_match.division
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.id != moving_match.id
    AND COALESCE(matches_table.queue_position, matches_table.scheduled_slot) = _target_slot
  LIMIT 1;

  IF moving_current_slot = _target_slot AND displaced_match.id IS NULL THEN
    UPDATE public.matches
    SET
      queue_position = _target_slot,
      scheduled_slot = _target_slot
    WHERE id = moving_match.id;

    RETURN jsonb_build_object(
      'target_slot', _target_slot,
      'displaced_match_id', NULL,
      'displaced_slot', NULL
    );
  END IF;

  IF displaced_match.id IS NOT NULL THEN
    SELECT candidate_slot.slot_value
    INTO displaced_slot
    FROM generate_series(1, _target_slot) AS candidate_slot(slot_value)
    WHERE candidate_slot.slot_value != _target_slot
      AND NOT EXISTS (
        SELECT 1
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = moving_match.championship_id
          AND matches_table.season_year = moving_match.season_year
          AND matches_table.scheduled_date = moving_match.scheduled_date
          AND matches_table.sport_id = moving_match.sport_id
          AND matches_table.naipe = moving_match.naipe
          AND matches_table.division IS NOT DISTINCT FROM moving_match.division
          AND matches_table.status = 'SCHEDULED'::public.match_status
          AND matches_table.id != moving_match.id
          AND matches_table.id != displaced_match.id
          AND COALESCE(matches_table.queue_position, matches_table.scheduled_slot) = candidate_slot.slot_value
      )
    ORDER BY candidate_slot.slot_value ASC
    LIMIT 1;

    IF displaced_slot IS NULL THEN
      SELECT COALESCE(MAX(COALESCE(matches_table.queue_position, matches_table.scheduled_slot)), 0) + 1
      INTO displaced_slot
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id = moving_match.championship_id
        AND matches_table.season_year = moving_match.season_year
        AND matches_table.scheduled_date = moving_match.scheduled_date
        AND matches_table.sport_id = moving_match.sport_id
        AND matches_table.naipe = moving_match.naipe
        AND matches_table.division IS NOT DISTINCT FROM moving_match.division
        AND matches_table.status = 'SCHEDULED'::public.match_status
        AND matches_table.id != moving_match.id
        AND matches_table.id != displaced_match.id;
    END IF;
  END IF;

  IF displaced_match.id IS NOT NULL THEN
    SELECT COALESCE(MAX(COALESCE(matches_table.queue_position, matches_table.scheduled_slot)), 0) + 1000
    INTO temporary_slot_base
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = moving_match.championship_id
      AND matches_table.season_year = moving_match.season_year
      AND matches_table.scheduled_date = moving_match.scheduled_date
      AND matches_table.status = 'SCHEDULED'::public.match_status;

    UPDATE public.matches
    SET
      queue_position = temporary_slot_base + 1,
      scheduled_slot = temporary_slot_base + 1
    WHERE id = displaced_match.id;
  END IF;

  UPDATE public.matches
  SET
    queue_position = _target_slot,
    scheduled_slot = _target_slot
  WHERE id = moving_match.id;

  IF displaced_match.id IS NOT NULL THEN
    UPDATE public.matches
    SET
      queue_position = displaced_slot,
      scheduled_slot = displaced_slot
    WHERE id = displaced_match.id;
  END IF;

  RETURN jsonb_build_object(
    'target_slot', _target_slot,
    'displaced_match_id', displaced_match.id,
    'displaced_slot', displaced_slot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reposition_match_queue_slot(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.reposition_match_queue_slot(UUID, INTEGER)
IS 'Reposiciona um jogo agendado na fila da combinação modalidade+naipe+divisão do mesmo dia, movendo o jogo deslocado para o primeiro slot livre (ou final da fila) sem gerar slot temporário para o jogo solicitado.';

NOTIFY pgrst, 'reload schema';
