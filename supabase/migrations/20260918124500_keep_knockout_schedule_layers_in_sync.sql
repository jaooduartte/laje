-- Mantém as três camadas de agenda do mata-mata sincronizadas:
-- 1) matches (partida materializada),
-- 2) championship_bracket_matches (programação planejada),
-- 3) championship_bracket_knockout_schedule_reservations (reserva estrutural).
--
-- O ajuste é comportamental. Não contém IDs de partidas nem reparo de dados específico.

ALTER FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT)
  RENAME TO apply_manual_match_relocation_slot_base_schedule_sync;

CREATE OR REPLACE FUNCTION public.apply_manual_match_relocation_slot(
  _bracket_edition_id UUID,
  _payload JSONB,
  _expected_revision BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview_result JSONB;
BEGIN
  preview_result := public.build_manual_match_relocation_slot_preview(
    _bracket_edition_id,
    _payload
  );

  PERFORM public.apply_manual_match_relocation_slot_base_schedule_sync(
    _bracket_edition_id,
    _payload,
    _expected_revision
  );

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  -- scheduled_start_time é a fonte preferencial da UI para jogos agendados.
  UPDATE public.matches AS matches_table
  SET scheduled_start_time = changes_table.start_time
  FROM jsonb_to_recordset(COALESCE(preview_result->'changes', '[]'::JSONB))
    AS changes_json(item_type TEXT, match_id UUID, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after)
    AS changes_table(start_time TIMESTAMPTZ)
  WHERE COALESCE(changes_json.item_type, 'MATCH') = 'MATCH'
    AND matches_table.id = changes_json.match_id
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_start_time IS DISTINCT FROM changes_table.start_time;

  -- Se a partida movimentada já é materializada no mata-mata, o planejamento
  -- do bracket também precisa acompanhar o registro operacional.
  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    planned_scheduled_date = changes_table.scheduled_date,
    planned_location_name = changes_table.location,
    planned_court_name = changes_table.court_name,
    planned_start_time = (changes_table.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_end_time = (changes_table.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_queue_position = changes_table.queue_position,
    planned_scheduled_slot = changes_table.scheduled_slot
  FROM jsonb_to_recordset(COALESCE(preview_result->'changes', '[]'::JSONB))
    AS changes_json(item_type TEXT, match_id UUID, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after)
    AS changes_table(
      scheduled_date DATE,
      location TEXT,
      court_name TEXT,
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      queue_position INTEGER,
      scheduled_slot INTEGER
    )
  WHERE COALESCE(changes_json.item_type, 'MATCH') = 'MATCH'
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND bracket_matches_table.match_id = changes_json.match_id;

  -- A reserva estrutural é a terceira fonte de verdade. Mantê-la coerente
  -- evita que modais de troca/ajuste mostrem o slot antigo após uma realocação.
  UPDATE public.championship_bracket_knockout_schedule_reservations AS reservations_table
  SET
    scheduled_date = bracket_matches_table.planned_scheduled_date,
    scheduled_slot = bracket_matches_table.planned_scheduled_slot,
    queue_position = bracket_matches_table.planned_queue_position,
    start_at = public.combine_bracket_schedule_timestamp(
      bracket_matches_table.planned_scheduled_date,
      bracket_matches_table.planned_start_time
    ),
    end_at = public.combine_bracket_schedule_timestamp(
      bracket_matches_table.planned_scheduled_date,
      bracket_matches_table.planned_end_time
    ),
    location_name = bracket_matches_table.planned_location_name,
    court_name = bracket_matches_table.planned_court_name
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN jsonb_to_recordset(COALESCE(preview_result->'changes', '[]'::JSONB))
    AS changes_json(item_type TEXT, match_id UUID)
    ON COALESCE(changes_json.item_type, 'MATCH') = 'MATCH'
   AND bracket_matches_table.match_id = changes_json.match_id
  WHERE bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    AND reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT) TO authenticated;


ALTER FUNCTION public.swap_knockout_schedule_slots(UUID, UUID)
  RENAME TO swap_knockout_schedule_slots_base_schedule_sync;

CREATE OR REPLACE FUNCTION public.swap_knockout_schedule_slots(
  _source_bracket_match_id UUID,
  _target_bracket_match_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  swap_result JSONB;
BEGIN
  swap_result := public.swap_knockout_schedule_slots_base_schedule_sync(
    _source_bracket_match_id,
    _target_bracket_match_id
  );

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  -- O horário exibido em cards deve acompanhar o horário efetivamente trocado.
  UPDATE public.matches AS matches_table
  SET scheduled_start_time = matches_table.start_time
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.id IN (
      _source_bracket_match_id,
      _target_bracket_match_id
    )
    AND bracket_matches_table.match_id = matches_table.id
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND matches_table.scheduled_start_time IS DISTINCT FROM matches_table.start_time;

  -- Após a troca, as reservas estruturais precisam receber o mesmo slot que
  -- ficou persistido em championship_bracket_matches.
  UPDATE public.championship_bracket_knockout_schedule_reservations AS reservations_table
  SET
    scheduled_date = bracket_matches_table.planned_scheduled_date,
    scheduled_slot = bracket_matches_table.planned_scheduled_slot,
    queue_position = bracket_matches_table.planned_queue_position,
    start_at = public.combine_bracket_schedule_timestamp(
      bracket_matches_table.planned_scheduled_date,
      bracket_matches_table.planned_start_time
    ),
    end_at = public.combine_bracket_schedule_timestamp(
      bracket_matches_table.planned_scheduled_date,
      bracket_matches_table.planned_end_time
    ),
    location_group_id = bracket_matches_table.planned_location_group_id,
    court_group_id = bracket_matches_table.planned_court_group_id,
    location_name = bracket_matches_table.planned_location_name,
    court_name = bracket_matches_table.planned_court_name
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.id IN (
      _source_bracket_match_id,
      _target_bracket_match_id
    )
    AND reservations_table.bracket_edition_id = bracket_matches_table.bracket_edition_id
    AND reservations_table.competition_id = bracket_matches_table.competition_id
    AND reservations_table.round_number = bracket_matches_table.round_number
    AND reservations_table.slot_number = bracket_matches_table.slot_number
    AND reservations_table.is_third_place = bracket_matches_table.is_third_place;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  RETURN swap_result;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
