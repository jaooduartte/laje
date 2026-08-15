ALTER TABLE public.championship_bracket_editions
  ADD COLUMN IF NOT EXISTS reprogramming_revision BIGINT NOT NULL DEFAULT 0;

UPDATE public.championships AS championships_table
SET status = 'REVIEW'::public.championship_status
WHERE championships_table.status = 'UPCOMING'::public.championship_status
  AND EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = championships_table.id
  );

DO $migration_update_review_status_guards$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
  updated_function_definition TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.update_bracket_day_schedule(uuid,jsonb)'::regprocedure,
    'public.update_bracket_competition_settings(uuid,integer,boolean,text)'::regprocedure,
    'public.update_bracket_location_sport_priorities(uuid,jsonb)'::regprocedure,
    'public.update_bracket_knockout_court_priorities(uuid,jsonb)'::regprocedure,
    'public.update_bracket_generated_location_group(uuid,jsonb)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(function_signature) INTO function_definition;
    updated_function_definition := replace(function_definition, '''UPCOMING''::public.championship_status', '''REVIEW''::public.championship_status');
    updated_function_definition := replace(updated_function_definition, 'status = ''UPCOMING''', 'status = ''REVIEW''');
    updated_function_definition := replace(updated_function_definition, 'status=''UPCOMING''', 'status=''REVIEW''');
    updated_function_definition := replace(updated_function_definition, 'status <> ''UPCOMING''', 'status <> ''REVIEW''');
    updated_function_definition := replace(updated_function_definition, 'status != ''UPCOMING''', 'status != ''REVIEW''');
    updated_function_definition := replace(updated_function_definition, 'Configurando campeonato', 'Em revisão');

    IF updated_function_definition = function_definition THEN
      RAISE EXCEPTION 'Não foi possível atualizar a guarda de status da função %.', function_signature;
    END IF;

    EXECUTE updated_function_definition;
  END LOOP;
END;
$migration_update_review_status_guards$;

DO $migration_move_generated_championship_to_review$
DECLARE
  function_definition TEXT;
  updated_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure)
  INTO function_definition;
  updated_function_definition := replace(
    function_definition,
    'UPDATE public.championships SET status=''UPCOMING'' WHERE id=_championship_id;',
    'UPDATE public.championships SET status=''REVIEW'' WHERE id=_championship_id;'
  );

  IF updated_function_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível localizar a atualização final de status na criação do campeonato.';
  END IF;

  EXECUTE updated_function_definition;
END;
$migration_move_generated_championship_to_review$;

CREATE OR REPLACE FUNCTION public.bump_championship_bracket_reprogramming_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edition_id_value UUID;
BEGIN
  edition_id_value := CASE TG_TABLE_NAME
    WHEN 'championship_bracket_competitions' THEN COALESCE(NEW.bracket_edition_id, OLD.bracket_edition_id)
    WHEN 'championship_bracket_location_sport_priorities' THEN COALESCE(NEW.bracket_edition_id, OLD.bracket_edition_id)
    WHEN 'championship_bracket_knockout_court_priorities' THEN COALESCE(NEW.bracket_edition_id, OLD.bracket_edition_id)
    WHEN 'championship_bracket_days' THEN COALESCE(NEW.bracket_edition_id, OLD.bracket_edition_id)
    ELSE NULL
  END;

  IF edition_id_value IS NULL AND TG_TABLE_NAME = 'championship_bracket_day_breaks' THEN
    SELECT bracket_edition_id INTO edition_id_value
    FROM public.championship_bracket_days
    WHERE id = COALESCE(NEW.bracket_day_id, OLD.bracket_day_id);
  END IF;

  IF edition_id_value IS NULL AND TG_TABLE_NAME = 'championship_bracket_locations' THEN
    SELECT days_table.bracket_edition_id INTO edition_id_value
    FROM public.championship_bracket_days AS days_table
    WHERE days_table.id = COALESCE(NEW.bracket_day_id, OLD.bracket_day_id);
  END IF;

  IF edition_id_value IS NULL AND TG_TABLE_NAME = 'championship_bracket_courts' THEN
    SELECT days_table.bracket_edition_id INTO edition_id_value
    FROM public.championship_bracket_locations AS locations_table
    JOIN public.championship_bracket_days AS days_table ON days_table.id = locations_table.bracket_day_id
    WHERE locations_table.id = COALESCE(NEW.bracket_location_id, OLD.bracket_location_id);
  END IF;

  IF edition_id_value IS NOT NULL THEN
    UPDATE public.championship_bracket_editions
    SET reprogramming_revision = reprogramming_revision + 1
    WHERE id = edition_id_value;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS championship_bracket_days_reprogramming_revision ON public.championship_bracket_days;
CREATE TRIGGER championship_bracket_days_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_days
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

DROP TRIGGER IF EXISTS championship_bracket_day_breaks_reprogramming_revision ON public.championship_bracket_day_breaks;
CREATE TRIGGER championship_bracket_day_breaks_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_day_breaks
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

DROP TRIGGER IF EXISTS championship_bracket_locations_reprogramming_revision ON public.championship_bracket_locations;
CREATE TRIGGER championship_bracket_locations_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_locations
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

DROP TRIGGER IF EXISTS championship_bracket_courts_reprogramming_revision ON public.championship_bracket_courts;
CREATE TRIGGER championship_bracket_courts_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_courts
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

DROP TRIGGER IF EXISTS championship_bracket_competitions_reprogramming_revision ON public.championship_bracket_competitions;
CREATE TRIGGER championship_bracket_competitions_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_competitions
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

DROP TRIGGER IF EXISTS championship_bracket_location_sport_priorities_reprogramming_revision ON public.championship_bracket_location_sport_priorities;
CREATE TRIGGER championship_bracket_location_sport_priorities_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_location_sport_priorities
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

DROP TRIGGER IF EXISTS championship_bracket_knockout_court_priorities_reprogramming_revision ON public.championship_bracket_knockout_court_priorities;
CREATE TRIGGER championship_bracket_knockout_court_priorities_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE ON public.championship_bracket_knockout_court_priorities
FOR EACH ROW EXECUTE FUNCTION public.bump_championship_bracket_reprogramming_revision();

CREATE OR REPLACE FUNCTION public.execute_championship_bracket_reconfiguration(
  _bracket_edition_id UUID,
  _action TEXT,
  _payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE _action
    WHEN 'DAY_SCHEDULE' THEN
      PERFORM public.update_bracket_day_schedule(
        _bracket_edition_id,
        COALESCE(_payload->'schedule_updates', '[]'::jsonb)
      );
    WHEN 'COMPETITION_SETTINGS' THEN
      PERFORM public.update_bracket_competition_settings(
        (_payload->>'competition_id')::uuid,
        (_payload->>'qualifiers_per_group')::integer,
        COALESCE((_payload->>'should_complete_knockout_with_best_second_placed_teams')::boolean, false),
        COALESCE(_payload->>'knockout_pairing_mode', 'LINEAR')
      );
    WHEN 'LOCATION_SPORT_PRIORITIES' THEN
      PERFORM public.update_bracket_location_sport_priorities(
        _bracket_edition_id,
        COALESCE(_payload->'priority_updates', '[]'::jsonb)
      );
    WHEN 'KNOCKOUT_COURT_PRIORITIES' THEN
      PERFORM public.update_bracket_knockout_court_priorities(
        _bracket_edition_id,
        COALESCE(_payload->'priority_updates', '[]'::jsonb)
      );
    WHEN 'LOCATION_GROUP' THEN
      PERFORM public.update_bracket_generated_location_group(_bracket_edition_id, _payload);
    ELSE
      RAISE EXCEPTION 'Tipo de reprogramação inválido.';
  END CASE;
END;
$$;

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
    'scheduled_slot', matches_table.scheduled_slot
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
          CASE WHEN before_item.value->'queue_position' IS DISTINCT FROM after_item.value->'queue_position' OR before_item.value->'global_queue_order' IS DISTINCT FROM after_item.value->'global_queue_order' OR before_item.value->'scheduled_slot' IS DISTINCT FROM after_item.value->'scheduled_slot' THEN 'posição' END
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
        'scheduled_slot', matches_table.scheduled_slot
      )), '{}'::jsonb)
      FROM public.matches AS matches_table
      JOIN public.championship_bracket_editions AS editions_table ON editions_table.championship_id = matches_table.championship_id
      WHERE editions_table.id = _bracket_edition_id
    )) AS after_item ON after_item.key = before_item.key
    WHERE before_item.value IS DISTINCT FROM after_item.value;

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW' THEN
      RAISE;
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

CREATE OR REPLACE FUNCTION public.apply_championship_bracket_reconfiguration(
  _bracket_edition_id UUID,
  _action TEXT,
  _payload JSONB,
  _expected_revision BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revision_value BIGINT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_tab_access('championship_schedule'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para reprogramar a agenda.';
  END IF;

  SELECT reprogramming_revision
  INTO revision_value
  FROM public.championship_bracket_editions AS editions_table
  JOIN public.championships AS championships_table ON championships_table.id = editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id
    AND championships_table.status = 'REVIEW'::public.championship_status
  FOR UPDATE OF editions_table;

  IF revision_value IS NULL THEN
    RAISE EXCEPTION 'A reprogramação só está disponível com o campeonato em revisão.';
  END IF;

  IF revision_value <> _expected_revision THEN
    RAISE EXCEPTION 'A agenda foi alterada desde a prévia. Revise o impacto novamente.';
  END IF;

  PERFORM public.execute_championship_bracket_reconfiguration(
    _bracket_edition_id,
    _action,
    COALESCE(_payload, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_review_match_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
BEGIN
  SELECT status INTO championship_status_value
  FROM public.championships
  WHERE id = NEW.championship_id;

  IF championship_status_value <> 'REVIEW'::public.championship_status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.home_score IS DISTINCT FROM OLD.home_score
    OR NEW.away_score IS DISTINCT FROM OLD.away_score
    OR NEW.home_penalty_score IS DISTINCT FROM OLD.home_penalty_score
    OR NEW.away_penalty_score IS DISTINCT FROM OLD.away_penalty_score
    OR NEW.current_set_home_score IS DISTINCT FROM OLD.current_set_home_score
    OR NEW.current_set_away_score IS DISTINCT FROM OLD.current_set_away_score
    OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover
    OR NEW.is_double_walkover IS DISTINCT FROM OLD.is_double_walkover
    OR NEW.walkover_loser_team_id IS DISTINCT FROM OLD.walkover_loser_team_id
    OR NEW.is_score_sheet_reviewed IS DISTINCT FROM OLD.is_score_sheet_reviewed
    OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
    OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
  THEN
    RAISE EXCEPTION 'As operações de jogo só podem ser feitas com o campeonato em andamento.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_prevent_review_operations ON public.matches;
CREATE TRIGGER matches_prevent_review_operations
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.prevent_review_match_operations();

CREATE OR REPLACE FUNCTION public.prevent_review_individual_session_operations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT status INTO championship_status_value
  FROM public.championships
  WHERE id = NEW.championship_id;

  IF championship_status_value <> 'IN_PROGRESS'::public.championship_status THEN
    RAISE EXCEPTION 'As sessões individuais só podem ser operadas com o campeonato em andamento.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS championship_individual_sessions_prevent_review_operations ON public.championship_individual_sessions;
CREATE TRIGGER championship_individual_sessions_prevent_review_operations
BEFORE UPDATE OF status ON public.championship_individual_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_review_individual_session_operations();

DO $migration_protect_individual_event_results$
DECLARE
  function_definition TEXT;
  updated_function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.save_championship_individual_event_results(uuid,jsonb)'::regprocedure)
  INTO function_definition;
  updated_function_definition := replace(
    function_definition,
    '  IF current_event.id IS NULL THEN',
    '  IF NOT EXISTS (' || chr(10) ||
    '    SELECT 1' || chr(10) ||
    '    FROM public.championship_individual_events AS events_table' || chr(10) ||
    '    JOIN public.championships AS championships_table ON championships_table.id = events_table.championship_id' || chr(10) ||
    '    WHERE events_table.id = _event_id' || chr(10) ||
    '      AND championships_table.status = ''IN_PROGRESS''::public.championship_status' || chr(10) ||
    '  ) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Os resultados das provas individuais só podem ser registrados com o campeonato em andamento.'';' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) ||
    '  IF current_event.id IS NULL THEN'
  );

  IF updated_function_definition = function_definition THEN
    RAISE EXCEPTION 'Não foi possível proteger o registro de resultados das provas individuais.';
  END IF;

  EXECUTE updated_function_definition;
END;
$migration_protect_individual_event_results$;

REVOKE ALL ON FUNCTION public.execute_championship_bracket_reconfiguration(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_championship_bracket_reconfiguration(UUID, TEXT, JSONB, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_championship_bracket_reconfiguration(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_championship_bracket_reconfiguration(UUID, TEXT, JSONB, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
