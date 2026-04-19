CREATE OR REPLACE FUNCTION public.swap_match_queue_slots(
  _source_match_id UUID,
  _target_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_match RECORD;
  target_match RECORD;
  source_slot INTEGER;
  target_slot INTEGER;
  temporary_slot_base INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para trocar jogos na fila.';
  END IF;

  IF _source_match_id IS NULL OR _target_match_id IS NULL THEN
    RAISE EXCEPTION 'Informe os dois jogos para realizar a troca de fila.';
  END IF;

  IF _source_match_id = _target_match_id THEN
    RAISE EXCEPTION 'Selecione jogos diferentes para trocar a fila.';
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
  INTO source_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _source_match_id
  LIMIT 1
  FOR UPDATE;

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
  INTO target_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _target_match_id
  LIMIT 1
  FOR UPDATE;

  IF source_match.id IS NULL OR target_match.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar os jogos selecionados para troca de fila.';
  END IF;

  IF source_match.status != 'SCHEDULED'::public.match_status OR target_match.status != 'SCHEDULED'::public.match_status THEN
    RAISE EXCEPTION 'A troca de fila só pode ser realizada entre jogos agendados.';
  END IF;

  IF source_match.scheduled_date IS NULL OR target_match.scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Os jogos precisam ter dia da fila definido para realizar a troca.';
  END IF;

  IF source_match.championship_id != target_match.championship_id
    OR source_match.season_year != target_match.season_year
    OR source_match.scheduled_date != target_match.scheduled_date
    OR source_match.sport_id != target_match.sport_id
    OR source_match.naipe != target_match.naipe
    OR source_match.division IS DISTINCT FROM target_match.division THEN
    RAISE EXCEPTION 'A troca exige jogos do mesmo dia, modalidade, naipe e divisão.';
  END IF;

  source_slot := source_match.queue_slot;
  target_slot := target_match.queue_slot;

  IF source_slot IS NULL OR source_slot < 1 OR target_slot IS NULL OR target_slot < 1 THEN
    RAISE EXCEPTION 'Os jogos selecionados precisam ter posição válida na fila.';
  END IF;

  IF source_slot = target_slot THEN
    RETURN jsonb_build_object(
      'source_match_id', source_match.id,
      'target_match_id', target_match.id,
      'source_previous_slot', source_slot,
      'target_previous_slot', target_slot,
      'source_next_slot', source_slot,
      'target_next_slot', target_slot
    );
  END IF;

  PERFORM 1
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date = source_match.scheduled_date
    AND matches_table.sport_id = source_match.sport_id
    AND matches_table.naipe = source_match.naipe
    AND matches_table.division IS NOT DISTINCT FROM source_match.division
    AND matches_table.status = 'SCHEDULED'::public.match_status
  FOR UPDATE;

  SELECT COALESCE(MAX(COALESCE(matches_table.queue_position, matches_table.scheduled_slot)), 0) + 1000
  INTO temporary_slot_base
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date = source_match.scheduled_date
    AND matches_table.sport_id = source_match.sport_id
    AND matches_table.naipe = source_match.naipe
    AND matches_table.division IS NOT DISTINCT FROM source_match.division
    AND matches_table.status = 'SCHEDULED'::public.match_status;

  UPDATE public.matches
  SET
    queue_position = temporary_slot_base + 1,
    scheduled_slot = temporary_slot_base + 1
  WHERE id = source_match.id;

  UPDATE public.matches
  SET
    queue_position = temporary_slot_base + 2,
    scheduled_slot = temporary_slot_base + 2
  WHERE id = target_match.id;

  UPDATE public.matches
  SET
    queue_position = target_slot,
    scheduled_slot = target_slot
  WHERE id = source_match.id;

  UPDATE public.matches
  SET
    queue_position = source_slot,
    scheduled_slot = source_slot
  WHERE id = target_match.id;

  RETURN jsonb_build_object(
    'source_match_id', source_match.id,
    'target_match_id', target_match.id,
    'source_previous_slot', source_slot,
    'target_previous_slot', target_slot,
    'source_next_slot', target_slot,
    'target_next_slot', source_slot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_match_queue_slots(UUID, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.swap_match_queue_slots(UUID, UUID)
IS 'Troca a posição da fila entre dois jogos agendados do mesmo dia, modalidade, naipe e divisão.';

NOTIFY pgrst, 'reload schema';
