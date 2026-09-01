ALTER FUNCTION public.build_manual_match_relocation_preview(UUID, JSONB)
  RENAME TO build_manual_match_relocation_preview_base;

ALTER FUNCTION public.build_manual_match_relocation_slot_preview(UUID, JSONB)
  RENAME TO build_manual_match_relocation_slot_preview_base;

CREATE OR REPLACE FUNCTION public.append_manual_relocation_placeholders(
  _bracket_edition_id UUID,
  _preview JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date DATE := (_preview->>'target_date')::DATE;
  target_location TEXT := _preview->>'target_location';
  target_court_name TEXT := _preview->>'target_court_name';
  selected_start_at TIMESTAMPTZ;
  current_cursor_at TIMESTAMPTZ;
  next_slot INTEGER;
  next_queue_position INTEGER;
  target_location_group_id UUID;
  target_court_group_id UUID;
  placeholder_record RECORD;
  next_start_at TIMESTAMPTZ;
  next_end_at TIMESTAMPTZ;
  duration_minutes INTEGER;
  changes JSONB := COALESCE(_preview->'changes', '[]'::JSONB);
  timeline JSONB := COALESCE(_preview->'timeline', '[]'::JSONB);
  blockers JSONB := COALESCE(_preview->'blockers', '[]'::JSONB);
  slots JSONB := COALESCE(_preview->'slots', '[]'::JSONB);
  next_day_end TEXT := _preview->>'next_day_end';
BEGIN
  IF target_date IS NULL OR target_location IS NULL OR target_court_name IS NULL THEN
    RETURN _preview;
  END IF;

  SELECT locations_table.location_group_id, courts_table.court_group_id
  INTO target_location_group_id, target_court_group_id
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND days_table.event_date = target_date
    AND public.normalize_bracket_entity_name(locations_table.name) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(courts_table.name) = public.normalize_bracket_entity_name(target_court_name)
  LIMIT 1;

  SELECT min(NULLIF(change_item.value->'after'->>'start_time', '')::TIMESTAMPTZ)
  INTO selected_start_at
  FROM jsonb_array_elements(changes) AS change_item(value)
  WHERE COALESCE((change_item.value->>'is_selected')::BOOLEAN, false);

  SELECT COALESCE(
    jsonb_agg(
      slot_item.value || jsonb_build_object(
        'displaced_placeholders_count', (
          SELECT count(*)
          FROM public.championship_bracket_matches AS bracket_matches_table
          JOIN public.championship_bracket_competitions AS competitions_table
            ON competitions_table.id = bracket_matches_table.competition_id
          WHERE competitions_table.bracket_edition_id = _bracket_edition_id
            AND bracket_matches_table.match_id IS NULL
            AND bracket_matches_table.is_bye = false
            AND bracket_matches_table.planned_scheduled_date = target_date
            AND public.normalize_bracket_entity_name(bracket_matches_table.planned_location_name) = public.normalize_bracket_entity_name(target_location)
            AND public.normalize_bracket_entity_name(bracket_matches_table.planned_court_name) = public.normalize_bracket_entity_name(target_court_name)
            AND bracket_matches_table.planned_start_time IS NOT NULL
            AND public.combine_bracket_schedule_timestamp(target_date, bracket_matches_table.planned_start_time) >= (slot_item.value->>'start_time')::TIMESTAMPTZ
        )
      )
      ORDER BY (slot_item.value->>'start_time')::TIMESTAMPTZ
    ),
    '[]'::JSONB
  )
  INTO slots
  FROM jsonb_array_elements(slots) AS slot_item(value);

  IF selected_start_at IS NULL THEN
    RETURN jsonb_set(_preview, '{slots}', slots, true);
  END IF;

  SELECT COALESCE(
    max(NULLIF(timeline_item.value->>'end_time', '')::TIMESTAMPTZ),
    selected_start_at
  )
  INTO current_cursor_at
  FROM jsonb_array_elements(timeline) AS timeline_item(value);

  SELECT GREATEST(
    COALESCE(max(matches_table.scheduled_slot), 0),
    COALESCE(max(bracket_matches_table.planned_scheduled_slot), 0)
  )
  INTO next_slot
  FROM public.championship_bracket_competitions AS competitions_table
  LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.competition_id = competitions_table.id
    AND bracket_matches_table.match_id IS NULL
    AND bracket_matches_table.is_bye = false
    AND bracket_matches_table.planned_scheduled_date = target_date
    AND public.normalize_bracket_entity_name(bracket_matches_table.planned_location_name) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(bracket_matches_table.planned_court_name) = public.normalize_bracket_entity_name(target_court_name)
  LEFT JOIN public.matches AS matches_table
    ON matches_table.championship_id = competitions_table.championship_id
    AND matches_table.season_year = competitions_table.season_year
    AND matches_table.scheduled_date = target_date
    AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
  WHERE competitions_table.bracket_edition_id = _bracket_edition_id;

  SELECT GREATEST(
    COALESCE(max(matches_table.queue_position), 0),
    COALESCE(max(bracket_matches_table.planned_queue_position), 0)
  )
  INTO next_queue_position
  FROM public.championship_bracket_competitions AS competitions_table
  LEFT JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.competition_id = competitions_table.id
    AND bracket_matches_table.match_id IS NULL
    AND bracket_matches_table.is_bye = false
    AND bracket_matches_table.planned_scheduled_date = target_date
    AND public.normalize_bracket_entity_name(bracket_matches_table.planned_location_name) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(bracket_matches_table.planned_court_name) = public.normalize_bracket_entity_name(target_court_name)
  LEFT JOIN public.matches AS matches_table
    ON matches_table.championship_id = competitions_table.championship_id
    AND matches_table.season_year = competitions_table.season_year
    AND matches_table.scheduled_date = target_date
    AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(target_location)
    AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(target_court_name)
  WHERE competitions_table.bracket_edition_id = _bracket_edition_id;

  FOR placeholder_record IN
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.round_number,
      bracket_matches_table.is_third_place,
      bracket_matches_table.planned_start_time,
      bracket_matches_table.planned_end_time,
      bracket_matches_table.planned_queue_position,
      bracket_matches_table.planned_scheduled_slot,
      GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1) AS duration_minutes,
      COALESCE(sports_table.name, 'Modalidade') AS sport_name
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.championship_bracket_competitions AS competitions_table
      ON competitions_table.id = bracket_matches_table.competition_id
    LEFT JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
    LEFT JOIN public.championship_sports AS championship_sports_table
      ON championship_sports_table.championship_id = competitions_table.championship_id
      AND championship_sports_table.sport_id = competitions_table.sport_id
    WHERE competitions_table.bracket_edition_id = _bracket_edition_id
      AND bracket_matches_table.match_id IS NULL
      AND bracket_matches_table.is_bye = false
      AND bracket_matches_table.planned_scheduled_date = target_date
      AND public.normalize_bracket_entity_name(bracket_matches_table.planned_location_name) = public.normalize_bracket_entity_name(target_location)
      AND public.normalize_bracket_entity_name(bracket_matches_table.planned_court_name) = public.normalize_bracket_entity_name(target_court_name)
      AND bracket_matches_table.planned_start_time IS NOT NULL
      AND public.combine_bracket_schedule_timestamp(target_date, bracket_matches_table.planned_start_time) >= selected_start_at
    ORDER BY
      bracket_matches_table.planned_start_time,
      COALESCE(bracket_matches_table.planned_scheduled_slot, bracket_matches_table.planned_queue_position),
      bracket_matches_table.id
  LOOP
    duration_minutes := placeholder_record.duration_minutes;
    next_start_at := GREATEST(
      current_cursor_at,
      public.combine_bracket_schedule_timestamp(
        target_date,
        placeholder_record.planned_start_time
      )
    );
    next_end_at := next_start_at + make_interval(mins => duration_minutes);
    next_slot := next_slot + 1;
    next_queue_position := next_queue_position + 1;

    changes := changes || jsonb_build_array(
      jsonb_build_object(
        'item_type', 'KNOCKOUT_PLACEHOLDER',
        'item_id', placeholder_record.id,
        'match_id', NULL,
        'placeholder_id', placeholder_record.id,
        'label', format(
          'A definir • %s',
          CASE
            WHEN placeholder_record.is_third_place THEN 'Disputa de 3º lugar'
            WHEN placeholder_record.round_number = 1 THEN 'Mata-mata'
            ELSE format('Rodada %s', placeholder_record.round_number)
          END
        ),
        'is_selected', false,
        'before', jsonb_build_object(
          'scheduled_date', target_date,
          'location', target_location,
          'court_name', target_court_name,
          'start_time', public.combine_bracket_schedule_timestamp(target_date, placeholder_record.planned_start_time),
          'end_time', CASE
            WHEN placeholder_record.planned_end_time IS NULL THEN NULL
            ELSE public.combine_bracket_schedule_timestamp(target_date, placeholder_record.planned_end_time)
          END,
          'queue_position', placeholder_record.planned_queue_position,
          'scheduled_slot', placeholder_record.planned_scheduled_slot
        ),
        'after', jsonb_build_object(
          'scheduled_date', target_date,
          'location', target_location,
          'court_name', target_court_name,
          'location_group_id', target_location_group_id,
          'court_group_id', target_court_group_id,
          'start_time', next_start_at,
          'end_time', next_end_at,
          'queue_position', next_queue_position,
          'scheduled_slot', next_slot
        )
      )
    );

    timeline := timeline || jsonb_build_array(
      jsonb_build_object(
        'item_type', 'KNOCKOUT_PLACEHOLDER',
        'item_id', placeholder_record.id,
        'match_id', NULL,
        'placeholder_id', placeholder_record.id,
        'label', format('A definir • %s', placeholder_record.sport_name),
        'status', 'PLANNED',
        'start_time', next_start_at,
        'end_time', next_end_at,
        'location', target_location,
        'court_name', target_court_name,
        'is_relocated', false,
        'is_displaced', true
      )
    );

    current_cursor_at := next_end_at;
  END LOOP;

  IF current_cursor_at IS NOT NULL THEN
    next_day_end := to_char(
      current_cursor_at AT TIME ZONE 'America/Sao_Paulo',
      'HH24:MI'
    );

    IF (current_cursor_at AT TIME ZONE 'America/Sao_Paulo')::DATE > target_date THEN
      blockers := blockers || jsonb_build_array(
        'A realocação desloca slots planejados para depois da meia-noite e deve ser dividida em outro dia configurado.'
      );
    END IF;
  END IF;

  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(_preview, '{changes}', changes, true),
          '{timeline}', timeline,
          true
        ),
        '{slots}', slots,
        true
      ),
      '{blockers}', blockers,
      true
    ),
    '{next_day_end}', to_jsonb(next_day_end),
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.build_manual_match_relocation_preview(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.append_manual_relocation_placeholders(
    _bracket_edition_id,
    public.build_manual_match_relocation_preview_base(
      _bracket_edition_id,
      _payload
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.build_manual_match_relocation_slot_preview(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.append_manual_relocation_placeholders(
    _bracket_edition_id,
    public.build_manual_match_relocation_slot_preview_base(
      _bracket_edition_id,
      _payload
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_manual_match_relocation(
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
  preview JSONB;
  current_revision BIGINT;
  target_date DATE;
  target_day_end TIME;
  calculated_day_end TIME;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para realocar jogos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('manual-match-relocation:%s', _bracket_edition_id), 0));

  SELECT reprogramming_revision
  INTO current_revision
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  FOR UPDATE;

  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  IF current_revision <> _expected_revision THEN
    RAISE EXCEPTION 'A prévia está desatualizada. Calcule novamente antes de confirmar.';
  END IF;

  preview := public.build_manual_match_relocation_preview(_bracket_edition_id, _payload);

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'A realocação possui conflitos e não pode ser aplicada.';
  END IF;

  PERFORM set_config('app.allow_manual_schedule_override_update', 'true', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = changes_table.scheduled_date,
    location = changes_table.location,
    court_name = changes_table.court_name,
    start_time = changes_table.start_time,
    end_time = changes_table.end_time,
    queue_position = changes_table.queue_position,
    scheduled_slot = changes_table.scheduled_slot,
    is_manual_schedule_override = CASE WHEN changes_json.is_selected THEN true ELSE matches_table.is_manual_schedule_override END,
    manual_schedule_override_reason = CASE WHEN changes_json.is_selected THEN preview->>'reason' ELSE matches_table.manual_schedule_override_reason END,
    manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULLIF(preview->>'notes', '') ELSE matches_table.manual_schedule_override_notes END,
    is_pending_manual_relocation = CASE WHEN changes_json.is_selected THEN false ELSE matches_table.is_pending_manual_relocation END,
    pending_manual_relocation_reason = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_reason END,
    pending_manual_relocation_notes = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_notes END,
    pending_manual_relocation_previous_schedule = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_schedule END,
    pending_manual_relocation_previous_label = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_label END,
    pending_manual_relocation_created_by = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_created_by END,
    pending_manual_relocation_at = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_at END
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(item_type TEXT, match_id UUID, is_selected BOOLEAN, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE COALESCE(changes_json.item_type, 'MATCH') = 'MATCH'
    AND matches_table.id = changes_json.match_id;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    planned_scheduled_date = changes_table.scheduled_date,
    planned_location_group_id = changes_table.location_group_id,
    planned_court_group_id = changes_table.court_group_id,
    planned_location_name = changes_table.location,
    planned_court_name = changes_table.court_name,
    planned_start_time = (changes_table.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_end_time = (changes_table.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_queue_position = changes_table.queue_position,
    planned_scheduled_slot = changes_table.scheduled_slot
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(item_type TEXT, placeholder_id UUID, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, location_group_id UUID, court_group_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE changes_json.item_type = 'KNOCKOUT_PLACEHOLDER'
    AND bracket_matches_table.id = changes_json.placeholder_id
    AND bracket_matches_table.match_id IS NULL;

  target_date := (preview->>'target_date')::DATE;
  SELECT end_time INTO target_day_end
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id AND event_date = target_date
  FOR UPDATE;

  calculated_day_end := (preview->>'next_day_end')::TIME;
  IF calculated_day_end > target_day_end THEN
    UPDATE public.championship_bracket_days
    SET end_time = calculated_day_end
    WHERE bracket_edition_id = _bracket_edition_id AND event_date = target_date;
  END IF;

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = _bracket_edition_id;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'false', true);
  PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.allow_pending_manual_relocation_update', 'false', true);
    PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
    RAISE;
END;
$$;

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
  preview JSONB;
  current_revision BIGINT;
  target_date DATE;
  target_day_end TIME;
  calculated_day_end TIME;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para realocar jogos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('manual-match-relocation-slot:%s', _bracket_edition_id), 0));

  SELECT reprogramming_revision INTO current_revision
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  FOR UPDATE;

  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  IF current_revision <> _expected_revision THEN
    RAISE EXCEPTION 'A prévia está desatualizada. Calcule novamente antes de confirmar.';
  END IF;

  preview := public.build_manual_match_relocation_slot_preview(_bracket_edition_id, _payload);

  IF jsonb_array_length(COALESCE(preview->'blockers', '[]'::JSONB)) > 0 THEN
    RAISE EXCEPTION 'O encaixe possui conflitos e não pode ser aplicado.';
  END IF;

  PERFORM set_config('app.allow_manual_schedule_override_update', 'true', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET
    scheduled_date = changes_table.scheduled_date,
    location = changes_table.location,
    court_name = changes_table.court_name,
    start_time = changes_table.start_time,
    end_time = changes_table.end_time,
    queue_position = changes_table.queue_position,
    scheduled_slot = changes_table.scheduled_slot,
    is_manual_schedule_override = CASE WHEN changes_json.is_selected THEN true ELSE matches_table.is_manual_schedule_override END,
    manual_schedule_override_reason = CASE WHEN changes_json.is_selected THEN preview->>'reason' ELSE matches_table.manual_schedule_override_reason END,
    manual_schedule_override_notes = CASE WHEN changes_json.is_selected THEN NULLIF(preview->>'notes', '') ELSE matches_table.manual_schedule_override_notes END,
    is_pending_manual_relocation = CASE WHEN changes_json.is_selected THEN false ELSE matches_table.is_pending_manual_relocation END,
    pending_manual_relocation_reason = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_reason END,
    pending_manual_relocation_notes = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_notes END,
    pending_manual_relocation_previous_schedule = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_schedule END,
    pending_manual_relocation_previous_label = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_label END,
    pending_manual_relocation_created_by = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_created_by END,
    pending_manual_relocation_at = CASE WHEN changes_json.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_at END
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(item_type TEXT, match_id UUID, is_selected BOOLEAN, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE COALESCE(changes_json.item_type, 'MATCH') = 'MATCH'
    AND matches_table.id = changes_json.match_id;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    planned_scheduled_date = changes_table.scheduled_date,
    planned_location_group_id = changes_table.location_group_id,
    planned_court_group_id = changes_table.court_group_id,
    planned_location_name = changes_table.location,
    planned_court_name = changes_table.court_name,
    planned_start_time = (changes_table.start_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_end_time = (changes_table.end_time AT TIME ZONE 'America/Sao_Paulo')::TIME,
    planned_queue_position = changes_table.queue_position,
    planned_scheduled_slot = changes_table.scheduled_slot
  FROM jsonb_to_recordset(preview->'changes') AS changes_json(item_type TEXT, placeholder_id UUID, after JSONB)
  CROSS JOIN LATERAL jsonb_to_record(changes_json.after) AS changes_table(scheduled_date DATE, location TEXT, court_name TEXT, location_group_id UUID, court_group_id UUID, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, queue_position INTEGER, scheduled_slot INTEGER)
  WHERE changes_json.item_type = 'KNOCKOUT_PLACEHOLDER'
    AND bracket_matches_table.id = changes_json.placeholder_id
    AND bracket_matches_table.match_id IS NULL;

  target_date := (preview->>'target_date')::DATE;
  SELECT end_time INTO target_day_end
  FROM public.championship_bracket_days
  WHERE bracket_edition_id = _bracket_edition_id AND event_date = target_date
  FOR UPDATE;

  calculated_day_end := (preview->>'next_day_end')::TIME;
  IF calculated_day_end > target_day_end THEN
    UPDATE public.championship_bracket_days
    SET end_time = calculated_day_end
    WHERE bracket_edition_id = _bracket_edition_id AND event_date = target_date;
  END IF;

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = _bracket_edition_id;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'false', true);
  PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.allow_pending_manual_relocation_update', 'false', true);
    PERFORM set_config('app.allow_manual_schedule_override_update', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.append_manual_relocation_placeholders(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_manual_match_relocation_preview(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_manual_match_relocation_slot_preview(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_manual_match_relocation(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_manual_match_relocation_slot(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_manual_match_relocation(UUID, JSONB, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_manual_match_relocation(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_manual_match_relocation_slot(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_match_relocation(UUID, JSONB, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_match_relocation_slot(UUID, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
