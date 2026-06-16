CREATE OR REPLACE FUNCTION public.resolve_match_queue_swap_conflict(
  _source_match_id UUID,
  _target_match_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  source_match RECORD;
  target_match RECORD;
  source_slot INTEGER;
  target_slot INTEGER;
  conflict_message TEXT;
BEGIN
  IF _source_match_id IS NULL OR _target_match_id IS NULL THEN
    RETURN 'Informe os dois jogos para realizar a troca de fila.';
  END IF;

  IF _source_match_id = _target_match_id THEN
    RETURN 'Selecione jogos diferentes para trocar a fila.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.status,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.created_at,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.queue_position,
    matches_table.scheduled_slot
  INTO source_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _source_match_id
  LIMIT 1;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.status,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.created_at,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.queue_position,
    matches_table.scheduled_slot
  INTO target_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _target_match_id
  LIMIT 1;

  IF source_match.id IS NULL OR target_match.id IS NULL THEN
    RETURN 'Não foi possível localizar os jogos selecionados para troca de fila.';
  END IF;

  IF source_match.status != 'SCHEDULED'::public.match_status OR target_match.status != 'SCHEDULED'::public.match_status THEN
    RETURN 'A troca de fila só pode ser realizada entre jogos agendados.';
  END IF;

  IF source_match.scheduled_date IS NULL OR target_match.scheduled_date IS NULL THEN
    RETURN 'Os jogos precisam ter dia da fila definido para realizar a troca.';
  END IF;

  IF NULLIF(trim(COALESCE(source_match.location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(source_match.court_name, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(target_match.location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(target_match.court_name, '')), '') IS NULL THEN
    RETURN 'A troca exige jogos com local e quadra definidos.';
  END IF;

  IF source_match.championship_id != target_match.championship_id
    OR source_match.season_year != target_match.season_year
    OR source_match.sport_id != target_match.sport_id
    OR public.normalize_bracket_entity_name(source_match.location) != public.normalize_bracket_entity_name(target_match.location)
    OR public.normalize_bracket_entity_name(source_match.court_name) != public.normalize_bracket_entity_name(target_match.court_name) THEN
    RETURN 'A troca exige jogos da mesma modalidade e da mesma quadra.';
  END IF;

  source_slot := COALESCE(source_match.scheduled_slot, source_match.queue_position);
  target_slot := COALESCE(target_match.scheduled_slot, target_match.queue_position);

  IF source_slot IS NULL OR source_slot < 1 OR target_slot IS NULL OR target_slot < 1 THEN
    RETURN 'Os jogos selecionados precisam ter posição válida na fila.';
  END IF;

  IF source_match.scheduled_date = target_match.scheduled_date
    AND source_slot = target_slot
    AND source_match.start_time IS NOT DISTINCT FROM target_match.start_time
    AND source_match.end_time IS NOT DISTINCT FROM target_match.end_time THEN
    RETURN NULL;
  END IF;

  WITH simulated_matches AS (
    SELECT
      matches_table.id,
      matches_table.scheduled_date,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = source_match.championship_id
      AND matches_table.season_year = source_match.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date IN (source_match.scheduled_date, target_match.scheduled_date)
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(source_match.location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(source_match.court_name)
      AND matches_table.id NOT IN (source_match.id, target_match.id)

    UNION ALL

    SELECT
      source_match.id,
      target_match.scheduled_date,
      source_match.home_team_id,
      source_match.away_team_id,
      target_match.start_time,
      target_slot,
      source_match.queue_position,
      source_match.created_at

    UNION ALL

    SELECT
      target_match.id,
      source_match.scheduled_date,
      target_match.home_team_id,
      target_match.away_team_id,
      source_match.start_time,
      source_slot,
      target_match.queue_position,
      target_match.created_at
  ),
  ordered_matches AS (
    SELECT
      simulated_matches.*,
      lag(simulated_matches.home_team_id) OVER match_order AS previous_home_team_id,
      lag(simulated_matches.away_team_id) OVER match_order AS previous_away_team_id,
      lead(simulated_matches.home_team_id) OVER match_order AS next_home_team_id,
      lead(simulated_matches.away_team_id) OVER match_order AS next_away_team_id
    FROM simulated_matches
    WINDOW match_order AS (
      PARTITION BY simulated_matches.scheduled_date
      ORDER BY
        CASE
          WHEN simulated_matches.start_time IS NULL THEN 1
          ELSE 0
        END,
        simulated_matches.start_time ASC NULLS LAST,
        COALESCE(simulated_matches.scheduled_slot, simulated_matches.queue_position) ASC NULLS LAST,
        COALESCE(simulated_matches.queue_position, simulated_matches.scheduled_slot) ASC NULLS LAST,
        simulated_matches.created_at ASC,
        simulated_matches.id ASC
    )
  )
  SELECT 'A mesma atlética não pode jogar ou representar jogos consecutivos na mesma quadra.'
  INTO conflict_message
  FROM ordered_matches
  WHERE ordered_matches.id IN (source_match.id, target_match.id)
    AND (
      ordered_matches.previous_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
      OR ordered_matches.previous_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
      OR ordered_matches.next_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
      OR ordered_matches.next_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
    )
  LIMIT 1;

  RETURN conflict_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_match_queue_swap_candidates(
  _source_match_id UUID
)
RETURNS TABLE (match_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_match RECORD;
  source_slot INTEGER;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para trocar jogos na fila.';
  END IF;

  IF _source_match_id IS NULL THEN
    RAISE EXCEPTION 'Informe o jogo de origem para listar as opções de troca.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.status,
    matches_table.location,
    matches_table.court_name,
    matches_table.queue_position,
    matches_table.scheduled_slot
  INTO source_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _source_match_id
  LIMIT 1;

  IF source_match.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar o jogo selecionado para troca de fila.';
  END IF;

  IF source_match.status != 'SCHEDULED'::public.match_status THEN
    RAISE EXCEPTION 'A troca de fila só pode ser realizada entre jogos agendados.';
  END IF;

  IF source_match.scheduled_date IS NULL THEN
    RAISE EXCEPTION 'O jogo precisa ter dia da fila definido para realizar a troca.';
  END IF;

  IF NULLIF(trim(COALESCE(source_match.location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(source_match.court_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A troca exige jogos com local e quadra definidos.';
  END IF;

  source_slot := COALESCE(source_match.scheduled_slot, source_match.queue_position);

  IF source_slot IS NULL OR source_slot < 1 THEN
    RAISE EXCEPTION 'O jogo selecionado precisa ter posição válida na fila.';
  END IF;

  RETURN QUERY
  SELECT candidate_matches.id
  FROM public.matches AS candidate_matches
  WHERE candidate_matches.id <> source_match.id
    AND candidate_matches.status = 'SCHEDULED'::public.match_status
    AND candidate_matches.championship_id = source_match.championship_id
    AND candidate_matches.season_year = source_match.season_year
    AND candidate_matches.sport_id = source_match.sport_id
    AND public.normalize_bracket_entity_name(candidate_matches.location) = public.normalize_bracket_entity_name(source_match.location)
    AND public.normalize_bracket_entity_name(candidate_matches.court_name) = public.normalize_bracket_entity_name(source_match.court_name)
    AND COALESCE(candidate_matches.scheduled_slot, candidate_matches.queue_position) IS NOT NULL
    AND COALESCE(candidate_matches.scheduled_slot, candidate_matches.queue_position) > 0
    AND public.resolve_match_queue_swap_conflict(source_match.id, candidate_matches.id) IS NULL
  ORDER BY
    candidate_matches.scheduled_date ASC,
    candidate_matches.start_time ASC NULLS LAST,
    COALESCE(candidate_matches.scheduled_slot, candidate_matches.queue_position) ASC NULLS LAST,
    candidate_matches.created_at ASC,
    candidate_matches.id ASC;
END;
$$;

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
  conflict_message TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para trocar jogos na fila.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.status,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.created_at,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.queue_position,
    matches_table.scheduled_slot
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
    matches_table.status,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.created_at,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.queue_position,
    matches_table.scheduled_slot
  INTO target_match
  FROM public.matches AS matches_table
  WHERE matches_table.id = _target_match_id
  LIMIT 1
  FOR UPDATE;

  conflict_message := public.resolve_match_queue_swap_conflict(_source_match_id, _target_match_id);

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

  source_slot := COALESCE(source_match.scheduled_slot, source_match.queue_position);
  target_slot := COALESCE(target_match.scheduled_slot, target_match.queue_position);

  PERFORM 1
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date IN (source_match.scheduled_date, target_match.scheduled_date)
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(source_match.location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(source_match.court_name)
  FOR UPDATE;

  conflict_message := public.resolve_match_queue_swap_conflict(_source_match_id, _target_match_id);

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

  SELECT COALESCE(MAX(COALESCE(matches_table.scheduled_slot, matches_table.queue_position)), 0) + 1000
  INTO temporary_slot_base
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date IN (source_match.scheduled_date, target_match.scheduled_date)
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(source_match.location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(source_match.court_name);

  BEGIN
    PERFORM set_config('app.skip_queue_trigger', 'true', true);
    PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

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
      queue_position = source_match.queue_position,
      scheduled_date = target_match.scheduled_date,
      scheduled_slot = target_slot,
      start_time = target_match.start_time,
      end_time = target_match.end_time
    WHERE id = source_match.id;

    UPDATE public.matches
    SET
      queue_position = target_match.queue_position,
      scheduled_date = source_match.scheduled_date,
      scheduled_slot = source_slot,
      start_time = source_match.start_time,
      end_time = source_match.end_time
    WHERE id = target_match.id;

    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
      PERFORM set_config('app.skip_queue_trigger', 'false', true);
      RAISE;
  END;

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

GRANT EXECUTE ON FUNCTION public.list_match_queue_swap_candidates(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swap_match_queue_slots(UUID, UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.list_match_queue_swap_candidates(UUID)
IS 'Lista apenas jogos válidos para troca manual de slot na mesma quadra, inclusive em outros dias, sem conflito consecutivo de quadra/representação.';

COMMENT ON FUNCTION public.swap_match_queue_slots(UUID, UUID)
IS 'Troca estritamente o dia, slot e horário entre dois jogos agendados da mesma quadra, sem reindexar terceiros e bloqueando conflitos consecutivos.';

NOTIFY pgrst, 'reload schema';
