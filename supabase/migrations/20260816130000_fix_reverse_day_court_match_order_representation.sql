DO $migration_reverse_day_court_match_order_representation$
DECLARE
  function_definition TEXT;
  updated_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.reverse_championship_bracket_day_court_match_order(uuid,jsonb)'::regprocedure)
  INTO function_definition;

  updated_function_definition := replace(
    function_definition,
    $old_representation_validation$
    IF EXISTS (
      WITH ordered_matches AS (
        SELECT
          matches_table.id,
          matches_table.scheduled_date,
          matches_table.location,
          matches_table.court_name,
          matches_table.home_team_id,
          matches_table.away_team_id,
          matches_table.manual_representation_mode,
          row_number() OVER (
            PARTITION BY matches_table.scheduled_date, public.normalize_bracket_entity_name(matches_table.location), public.normalize_bracket_entity_name(matches_table.court_name)
            ORDER BY matches_table.start_time ASC NULLS LAST, COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST, matches_table.created_at ASC, matches_table.id ASC
          ) AS court_position
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = championship_id_value
          AND matches_table.season_year = season_year_value
          AND matches_table.status = 'SCHEDULED'::public.match_status
          AND matches_table.scheduled_date = scheduled_date_value
      )
      SELECT 1
      FROM ordered_matches AS current_match
      JOIN reverse_day_court_match_order_courts AS courts_table
        ON public.normalize_bracket_entity_name(current_match.location) = public.normalize_bracket_entity_name(courts_table.location_name)
        AND public.normalize_bracket_entity_name(current_match.court_name) = public.normalize_bracket_entity_name(courts_table.court_name)
      JOIN ordered_matches AS previous_match
        ON previous_match.scheduled_date = current_match.scheduled_date
        AND public.normalize_bracket_entity_name(previous_match.location) = public.normalize_bracket_entity_name(current_match.location)
        AND public.normalize_bracket_entity_name(previous_match.court_name) = public.normalize_bracket_entity_name(current_match.court_name)
        AND previous_match.court_position = current_match.court_position - 1
      WHERE COALESCE(current_match.manual_representation_mode, 'AUTO') != 'CO'
        AND (
          previous_match.home_team_id IN (current_match.home_team_id, current_match.away_team_id)
          OR previous_match.away_team_id IN (current_match.home_team_id, current_match.away_team_id)
        )
    ) THEN
      RAISE EXCEPTION 'A inversão cria conflito de representação na mesma quadra.';
    END IF;
$old_representation_validation$,
    $new_representation_normalization$
    WITH ordered_matches AS (
      SELECT
        matches_table.id,
        row_number() OVER (
          PARTITION BY matches_table.scheduled_date, public.normalize_bracket_entity_name(matches_table.location), public.normalize_bracket_entity_name(matches_table.court_name)
          ORDER BY matches_table.start_time ASC NULLS LAST, COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST, matches_table.created_at ASC, matches_table.id ASC
        ) AS court_position
      FROM public.matches AS matches_table
      JOIN reverse_day_court_match_order_courts AS courts_table
        ON public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(courts_table.location_name)
        AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(courts_table.court_name)
      WHERE matches_table.championship_id = championship_id_value
        AND matches_table.season_year = season_year_value
        AND matches_table.status = 'SCHEDULED'::public.match_status
        AND matches_table.scheduled_date = scheduled_date_value
    )
    UPDATE public.matches AS matches_table
    SET manual_representation_mode = CASE
      WHEN ordered_matches.court_position = 1 THEN 'CO'
      ELSE 'AUTO'
    END
    FROM ordered_matches
    WHERE matches_table.id = ordered_matches.id
      AND matches_table.manual_representation_mode IS DISTINCT FROM CASE
        WHEN ordered_matches.court_position = 1 THEN 'CO'
        ELSE 'AUTO'
      END;
$new_representation_normalization$
  );

  IF updated_function_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível atualizar a representação após a inversão da agenda.';
  END IF;

  EXECUTE updated_function_definition;
END;
$migration_reverse_day_court_match_order_representation$;

CREATE OR REPLACE FUNCTION public.preview_championship_bracket_reconfiguration(
  _bracket_edition_id UUID,
  _action TEXT,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revision_value BIGINT;
  before_schedule JSONB;
  preview_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para reprogramar a agenda.';
  END IF;

  SELECT reprogramming_revision
  INTO revision_value
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id
    AND championships_table.status = 'REVIEW'::public.championship_status;

  IF revision_value IS NULL THEN
    RAISE EXCEPTION 'A reprogramação só está disponível com o campeonato em revisão.';
  END IF;

  SELECT COALESCE(jsonb_object_agg(matches_table.id, jsonb_build_object(
    'scheduled_date', matches_table.scheduled_date,
    'start_time', matches_table.start_time,
    'end_time', matches_table.end_time,
    'location', matches_table.location,
    'court_name', matches_table.court_name,
    'queue_position', matches_table.queue_position,
    'global_queue_order', matches_table.global_queue_order,
    'scheduled_slot', matches_table.scheduled_slot,
    'manual_representation_mode', matches_table.manual_representation_mode
  )), '{}'::jsonb)
  INTO before_schedule
  FROM public.matches AS matches_table
  JOIN public.championship_bracket_editions AS editions_table ON editions_table.championship_id = matches_table.championship_id
  WHERE editions_table.id = _bracket_edition_id;

  BEGIN
    PERFORM public.execute_championship_bracket_reconfiguration(
      _bracket_edition_id,
      _action,
      COALESCE(_payload, '{}'::jsonb)
    );

    SELECT jsonb_build_object(
      'revision', revision_value,
      'action', _action,
      'affected_matches', count(*)::integer,
      'changes', COALESCE(jsonb_agg(jsonb_build_object(
        'match_id', after_item.key,
        'match_number', NULL,
        'before', before_item.value,
        'after', after_item.value,
        'changed_fields', array_remove(ARRAY[
          CASE WHEN before_item.value->'scheduled_date' IS DISTINCT FROM after_item.value->'scheduled_date' THEN 'data' END,
          CASE WHEN before_item.value->'start_time' IS DISTINCT FROM after_item.value->'start_time' THEN 'horário de início' END,
          CASE WHEN before_item.value->'end_time' IS DISTINCT FROM after_item.value->'end_time' THEN 'horário de término' END,
          CASE WHEN before_item.value->'location' IS DISTINCT FROM after_item.value->'location' THEN 'local' END,
          CASE WHEN before_item.value->'court_name' IS DISTINCT FROM after_item.value->'court_name' THEN 'quadra' END,
          CASE WHEN before_item.value->'queue_position' IS DISTINCT FROM after_item.value->'queue_position' OR before_item.value->'global_queue_order' IS DISTINCT FROM after_item.value->'global_queue_order' OR before_item.value->'scheduled_slot' IS DISTINCT FROM after_item.value->'scheduled_slot' THEN 'posição' END,
          CASE WHEN before_item.value->'manual_representation_mode' IS DISTINCT FROM after_item.value->'manual_representation_mode' THEN 'representação' END
        ], NULL)
      ) ORDER BY after_item.key), '[]'::jsonb),
      'blockers', '[]'::jsonb
    )
    INTO preview_result
    FROM jsonb_each(before_schedule) AS before_item
    JOIN jsonb_each((
      SELECT COALESCE(jsonb_object_agg(matches_table.id, jsonb_build_object(
        'scheduled_date', matches_table.scheduled_date,
        'start_time', matches_table.start_time,
        'end_time', matches_table.end_time,
        'location', matches_table.location,
        'court_name', matches_table.court_name,
        'queue_position', matches_table.queue_position,
        'global_queue_order', matches_table.global_queue_order,
        'scheduled_slot', matches_table.scheduled_slot,
        'manual_representation_mode', matches_table.manual_representation_mode
      )), '{}'::jsonb)
      FROM public.matches AS matches_table
      JOIN public.championship_bracket_editions AS editions_table ON editions_table.championship_id = matches_table.championship_id
      WHERE editions_table.id = _bracket_edition_id
    )) AS after_item ON after_item.key = before_item.key
    WHERE before_item.value IS DISTINCT FROM after_item.value;

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW' THEN
      preview_result := jsonb_build_object(
        'revision', revision_value,
        'action', _action,
        'affected_matches', 0,
        'changes', '[]'::jsonb,
        'blockers', jsonb_build_array(SQLERRM)
      );
    END IF;
  WHEN OTHERS THEN
    preview_result := jsonb_build_object(
      'revision', revision_value,
      'action', _action,
      'affected_matches', 0,
      'changes', '[]'::jsonb,
      'blockers', jsonb_build_array(SQLERRM)
    );
  END;

  RETURN COALESCE(preview_result, jsonb_build_object(
    'revision', revision_value,
    'action', _action,
    'affected_matches', 0,
    'changes', '[]'::jsonb,
    'blockers', '[]'::jsonb
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
