SELECT set_config('app.skip_queue_trigger', 'true', true);
SELECT set_config('app.skip_match_conflict_trigger', 'true', true);

WITH repaired_matches AS (
  SELECT
    source_match.id AS source_match_id,
    target_match.id AS target_match_id,
    target_match.scheduled_date AS source_scheduled_date,
    target_match.queue_position AS source_queue_position,
    source_match.scheduled_date AS target_scheduled_date,
    source_match.queue_position AS target_queue_position
  FROM public.matches AS source_match
  JOIN public.matches AS target_match
    ON target_match.id = '2288841c-7f3f-4930-a3d0-c8dca8d8a8b7'::UUID
  WHERE source_match.id = '6ea6d8e4-f27b-4a4f-a818-7c2ad4d308d5'::UUID
    AND source_match.scheduled_date = DATE '2026-08-30'
    AND source_match.start_time = TIMESTAMPTZ '2026-08-29 13:15:00+00'
    AND source_match.scheduled_slot = 8
    AND source_match.queue_position = 2
    AND target_match.scheduled_date = DATE '2026-08-29'
    AND target_match.start_time = TIMESTAMPTZ '2026-08-30 11:45:00+00'
    AND target_match.scheduled_slot = 4
    AND target_match.queue_position = 4
)
UPDATE public.matches AS matches_table
SET
  scheduled_date = CASE
    WHEN matches_table.id = repaired_matches.source_match_id
      THEN repaired_matches.source_scheduled_date
    ELSE repaired_matches.target_scheduled_date
  END,
  queue_position = CASE
    WHEN matches_table.id = repaired_matches.source_match_id
      THEN repaired_matches.source_queue_position
    ELSE repaired_matches.target_queue_position
  END
FROM repaired_matches
WHERE matches_table.id IN (
  repaired_matches.source_match_id,
  repaired_matches.target_match_id
);

SELECT set_config('app.skip_match_conflict_trigger', 'false', true);
SELECT set_config('app.skip_queue_trigger', 'false', true);

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
  FOR UPDATE;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.sport_id,
    matches_table.naipe,
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
  FOR UPDATE;

  IF source_match.id IS NULL OR target_match.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar os jogos selecionados para troca de fila.';
  END IF;

  conflict_message := public.resolve_match_queue_swap_conflict(
    _source_match_id,
    _target_match_id
  );

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

  source_slot := COALESCE(source_match.scheduled_slot, source_match.queue_position);
  target_slot := COALESCE(target_match.scheduled_slot, target_match.queue_position);

  IF source_slot IS NULL OR source_slot < 1 OR target_slot IS NULL OR target_slot < 1 THEN
    RAISE EXCEPTION 'Os jogos selecionados precisam ter posição válida na fila.';
  END IF;

  PERFORM 1
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date IN (
      source_match.scheduled_date,
      target_match.scheduled_date
    )
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND public.normalize_bracket_entity_name(matches_table.location) =
      public.normalize_bracket_entity_name(source_match.location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) =
      public.normalize_bracket_entity_name(source_match.court_name)
  FOR UPDATE;

  conflict_message := public.resolve_match_queue_swap_conflict(
    _source_match_id,
    _target_match_id
  );

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

  SELECT COALESCE(MAX(COALESCE(matches_table.scheduled_slot, matches_table.queue_position)), 0) + 1000
  INTO temporary_slot_base
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date IN (
      source_match.scheduled_date,
      target_match.scheduled_date
    )
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND public.normalize_bracket_entity_name(matches_table.location) =
      public.normalize_bracket_entity_name(source_match.location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) =
      public.normalize_bracket_entity_name(source_match.court_name);

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
      scheduled_date = target_match.scheduled_date,
      queue_position = target_match.queue_position,
      scheduled_slot = target_match.scheduled_slot,
      start_time = target_match.start_time,
      end_time = target_match.end_time
    WHERE id = source_match.id;

    UPDATE public.matches
    SET
      scheduled_date = source_match.scheduled_date,
      queue_position = source_match.queue_position,
      scheduled_slot = source_match.scheduled_slot,
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

GRANT EXECUTE ON FUNCTION public.swap_match_queue_slots(UUID, UUID) TO anon, authenticated;
