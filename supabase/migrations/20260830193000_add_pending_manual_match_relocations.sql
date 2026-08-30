ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_pending_manual_relocation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_manual_relocation_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS pending_manual_relocation_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS pending_manual_relocation_previous_schedule JSONB NULL,
  ADD COLUMN IF NOT EXISTS pending_manual_relocation_previous_label TEXT NULL,
  ADD COLUMN IF NOT EXISTS pending_manual_relocation_created_by UUID NULL,
  ADD COLUMN IF NOT EXISTS pending_manual_relocation_at TIMESTAMPTZ NULL;

ALTER TABLE public.matches
  ALTER COLUMN location DROP NOT NULL;

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_pending_manual_relocation_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_pending_manual_relocation_check CHECK (
    (
      is_pending_manual_relocation = false
      AND pending_manual_relocation_reason IS NULL
      AND pending_manual_relocation_notes IS NULL
      AND pending_manual_relocation_previous_schedule IS NULL
      AND pending_manual_relocation_previous_label IS NULL
      AND pending_manual_relocation_created_by IS NULL
      AND pending_manual_relocation_at IS NULL
    )
    OR (
      is_pending_manual_relocation = true
      AND pending_manual_relocation_reason IN (
        'WEATHER',
        'COURT_UNAVAILABLE',
        'OPERATIONAL_DELAY',
        'SAFETY',
        'OTHER'
      )
      AND pending_manual_relocation_previous_schedule IS NOT NULL
      AND pending_manual_relocation_previous_label IS NOT NULL
      AND pending_manual_relocation_created_by IS NOT NULL
      AND pending_manual_relocation_at IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_pending_manual_relocation_rewrite()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_pending_manual_relocation
    AND COALESCE(current_setting('app.allow_pending_manual_relocation_update', true), 'false') <> 'true'
    AND (
      NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
      OR NEW.location IS DISTINCT FROM OLD.location
      OR NEW.court_name IS DISTINCT FROM OLD.court_name
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
      OR NEW.scheduled_slot IS DISTINCT FROM OLD.scheduled_slot
      OR NEW.is_pending_manual_relocation IS DISTINCT FROM OLD.is_pending_manual_relocation
      OR NEW.pending_manual_relocation_reason IS DISTINCT FROM OLD.pending_manual_relocation_reason
      OR NEW.pending_manual_relocation_notes IS DISTINCT FROM OLD.pending_manual_relocation_notes
      OR NEW.pending_manual_relocation_previous_schedule IS DISTINCT FROM OLD.pending_manual_relocation_previous_schedule
      OR NEW.pending_manual_relocation_previous_label IS DISTINCT FROM OLD.pending_manual_relocation_previous_label
      OR NEW.pending_manual_relocation_created_by IS DISTINCT FROM OLD.pending_manual_relocation_created_by
      OR NEW.pending_manual_relocation_at IS DISTINCT FROM OLD.pending_manual_relocation_at
    ) THEN
    RAISE EXCEPTION 'Este jogo está aguardando realocação administrativa.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_pending_manual_relocation_rewrite ON public.matches;
CREATE TRIGGER prevent_pending_manual_relocation_rewrite
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.prevent_pending_manual_relocation_rewrite();

CREATE OR REPLACE FUNCTION public.hold_matches_for_manual_relocation(
  _bracket_edition_id UUID,
  _payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_match_ids UUID[];
  selected_matches_count INTEGER;
  current_revision BIGINT;
  hold_reason TEXT;
  hold_notes TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para guardar jogos para realocação.';
  END IF;

  SELECT array_agg(value::UUID)
  INTO selected_match_ids
  FROM jsonb_array_elements_text(COALESCE(_payload->'match_ids', '[]'::JSONB)) AS value;

  hold_reason := upper(trim(COALESCE(_payload->>'reason', '')));
  hold_notes := NULLIF(trim(COALESCE(_payload->>'notes', '')), '');

  IF COALESCE(cardinality(selected_match_ids), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um jogo agendado.';
  END IF;

  IF cardinality(selected_match_ids) <> (
    SELECT count(DISTINCT match_id)
    FROM unnest(selected_match_ids) AS match_id
  ) THEN
    RAISE EXCEPTION 'A seleção de jogos contém itens repetidos.';
  END IF;

  IF hold_reason NOT IN ('WEATHER', 'COURT_UNAVAILABLE', 'OPERATIONAL_DELAY', 'SAFETY', 'OTHER') THEN
    RAISE EXCEPTION 'Informe um motivo válido para guardar os jogos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(format('pending-manual-match-relocation:%s', _bracket_edition_id), 0));

  SELECT reprogramming_revision
  INTO current_revision
  FROM public.championship_bracket_editions
  WHERE id = _bracket_edition_id
  FOR UPDATE;

  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  SELECT count(*)
  INTO selected_matches_count
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_matches AS bracket_matches_table
    ON bracket_matches_table.match_id = matches_table.id
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND matches_table.id = ANY(selected_match_ids)
    AND matches_table.status = 'SCHEDULED'::public.match_status
    AND COALESCE(matches_table.is_pending_manual_relocation, false) = false;

  IF selected_matches_count <> cardinality(selected_match_ids) THEN
    RAISE EXCEPTION 'Somente jogos agendados desta edição podem ser guardados.';
  END IF;

  PERFORM set_config('app.allow_manual_schedule_override_update', 'true', true);
  PERFORM set_config('app.allow_pending_manual_relocation_update', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  UPDATE public.matches AS matches_table
  SET
    is_pending_manual_relocation = true,
    pending_manual_relocation_reason = hold_reason,
    pending_manual_relocation_notes = hold_notes,
    pending_manual_relocation_previous_schedule = jsonb_build_object(
      'scheduled_date', matches_table.scheduled_date,
      'location', matches_table.location,
      'court_name', matches_table.court_name,
      'start_time', matches_table.start_time,
      'end_time', matches_table.end_time,
      'queue_position', matches_table.queue_position,
      'scheduled_slot', matches_table.scheduled_slot
    ),
    pending_manual_relocation_previous_label = format(
      'Jogo %s',
      COALESCE(matches_table.scheduled_slot, matches_table.queue_position)
    ),
    pending_manual_relocation_created_by = auth.uid(),
    pending_manual_relocation_at = now(),
    scheduled_date = NULL,
    location = NULL,
    court_name = NULL,
    start_time = NULL,
    end_time = NULL,
    queue_position = NULL,
    scheduled_slot = NULL
  WHERE matches_table.id = ANY(selected_match_ids);

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

DO $patch_pending_manual_match_relocation_apply$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_manual_match_relocation(uuid,jsonb,bigint)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL OR position('is_manual_schedule_override = CASE WHEN changes_table.is_selected THEN true ELSE matches_table.is_manual_schedule_override END' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'A versão esperada da aplicação de realocação manual não foi encontrada.';
  END IF;

  updated_definition := replace(
    function_definition,
    '  PERFORM set_config(''app.allow_manual_schedule_override_update'', ''true'', true);',
    '  PERFORM set_config(''app.allow_manual_schedule_override_update'', ''true'', true);
  PERFORM set_config(''app.allow_pending_manual_relocation_update'', ''true'', true);'
  );

  updated_definition := replace(
    updated_definition,
    '    manual_schedule_override_notes = CASE WHEN changes_table.is_selected THEN NULLIF(preview->>''notes'', '''') ELSE matches_table.manual_schedule_override_notes END',
    '    manual_schedule_override_notes = CASE WHEN changes_table.is_selected THEN NULLIF(preview->>''notes'', '''') ELSE matches_table.manual_schedule_override_notes END,
    is_pending_manual_relocation = CASE WHEN changes_table.is_selected THEN false ELSE matches_table.is_pending_manual_relocation END,
    pending_manual_relocation_reason = CASE WHEN changes_table.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_reason END,
    pending_manual_relocation_notes = CASE WHEN changes_table.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_notes END,
    pending_manual_relocation_previous_schedule = CASE WHEN changes_table.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_schedule END,
    pending_manual_relocation_previous_label = CASE WHEN changes_table.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_previous_label END,
    pending_manual_relocation_created_by = CASE WHEN changes_table.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_created_by END,
    pending_manual_relocation_at = CASE WHEN changes_table.is_selected THEN NULL ELSE matches_table.pending_manual_relocation_at END'
  );

  updated_definition := replace(
    updated_definition,
    '  PERFORM set_config(''app.allow_manual_schedule_override_update'', ''false'', true);',
    '  PERFORM set_config(''app.allow_pending_manual_relocation_update'', ''false'', true);
  PERFORM set_config(''app.allow_manual_schedule_override_update'', ''false'', true);'
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível atualizar a aplicação de realocação manual.';
  END IF;

  EXECUTE updated_definition;
END;
$patch_pending_manual_match_relocation_apply$;

DO $patch_pending_manual_match_relocation_redistribution$
DECLARE
  function_definition TEXT;
  updated_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;

  updated_definition := regexp_replace(
    function_definition,
    '(matches_table[[:space:]]*\.[[:space:]]*status[[:space:]]*=[[:space:]]*''SCHEDULED''::public\.match_status)',
    E'\\1\n    AND COALESCE(matches_table.is_pending_manual_relocation, false) = false',
    'g'
  );

  IF updated_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível excluir jogos guardados da redistribuição.';
  END IF;

  EXECUTE updated_definition;
END;
$patch_pending_manual_match_relocation_redistribution$;

REVOKE ALL ON FUNCTION public.hold_matches_for_manual_relocation(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hold_matches_for_manual_relocation(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
