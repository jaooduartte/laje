DO $$
DECLARE
  function_definition TEXT;
  legacy_source_requirement TEXT := E'  IF source_item.match_id IS NOT NULL THEN\n    RETURN \'O item de origem precisa ser um slot de mata-mata ainda sem definição.\';\n  END IF;';
  scheduled_source_requirement TEXT := E'  IF source_item.match_id IS NOT NULL\n    AND source_item.status != \'SCHEDULED\'::public.match_status\n  THEN\n    RETURN \'A troca só pode envolver confrontos materializados que estejam agendados.\';\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(
    'public.resolve_knockout_schedule_swap_conflict(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL
    OR position(legacy_source_requirement IN function_definition) = 0
  THEN
    RAISE EXCEPTION 'Não foi possível atualizar a validação de troca de mata-mata.';
  END IF;

  function_definition := replace(
    function_definition,
    legacy_source_requirement,
    scheduled_source_requirement
  );

  EXECUTE function_definition;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_knockout_schedule_swap_candidates(
  _source_bracket_match_id UUID
)
RETURNS TABLE (
  bracket_match_id UUID,
  match_id UUID,
  is_placeholder BOOLEAN,
  sport_name TEXT,
  naipe public.match_naipe,
  division public.team_division,
  round_number INTEGER,
  is_third_place BOOLEAN,
  scheduled_date DATE,
  start_time TIMESTAMPTZ,
  queue_position INTEGER,
  scheduled_slot INTEGER,
  home_team_name TEXT,
  away_team_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_item RECORD;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, false) THEN
    RAISE EXCEPTION 'Usuário sem permissão para consultar opções de troca.';
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.phase,
    bracket_matches_table.is_bye,
    bracket_matches_table.match_id,
    matches_table.status,
    competitions_table.sport_id,
    COALESCE(matches_table.scheduled_date, bracket_matches_table.planned_scheduled_date) AS scheduled_date,
    COALESCE(matches_table.queue_position, bracket_matches_table.planned_queue_position) AS queue_position,
    COALESCE(matches_table.scheduled_slot, bracket_matches_table.planned_scheduled_slot) AS scheduled_slot,
    COALESCE(matches_table.location, bracket_matches_table.planned_location_name) AS location,
    COALESCE(matches_table.court_name, bracket_matches_table.planned_court_name) AS court_name
  INTO source_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = _source_bracket_match_id;

  IF source_item.id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível localizar o slot selecionado para troca.';
  END IF;

  IF source_item.phase != 'KNOCKOUT'::public.bracket_phase
    OR source_item.is_bye
    OR (
      source_item.match_id IS NOT NULL
      AND source_item.status != 'SCHEDULED'::public.match_status
    )
    OR source_item.scheduled_date IS NULL
    OR source_item.queue_position IS NULL
    OR source_item.scheduled_slot IS NULL
    OR NULLIF(trim(COALESCE(source_item.location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(source_item.court_name, '')), '') IS NULL
  THEN
    RAISE EXCEPTION 'O item selecionado não é um slot elegível de mata-mata.';
  END IF;

  RETURN QUERY
  SELECT
    candidate_bracket_matches.id,
    candidate_bracket_matches.match_id,
    candidate_bracket_matches.match_id IS NULL,
    sports_table.name,
    candidate_competitions.naipe,
    candidate_competitions.division,
    candidate_bracket_matches.round_number,
    candidate_bracket_matches.is_third_place,
    COALESCE(candidate_matches.scheduled_date, candidate_bracket_matches.planned_scheduled_date),
    COALESCE(
      candidate_matches.start_time,
      CASE
        WHEN candidate_bracket_matches.planned_scheduled_date IS NOT NULL
          AND candidate_bracket_matches.planned_start_time IS NOT NULL
        THEN public.combine_bracket_schedule_timestamp(
          candidate_bracket_matches.planned_scheduled_date,
          candidate_bracket_matches.planned_start_time
        )
        ELSE NULL
      END
    ),
    COALESCE(candidate_matches.queue_position, candidate_bracket_matches.planned_queue_position),
    COALESCE(candidate_matches.scheduled_slot, candidate_bracket_matches.planned_scheduled_slot),
    COALESCE(candidate_home_team.name, candidate_bracket_home_team.name),
    COALESCE(candidate_away_team.name, candidate_bracket_away_team.name)
  FROM public.championship_bracket_matches AS candidate_bracket_matches
  JOIN public.championship_bracket_competitions AS candidate_competitions
    ON candidate_competitions.id = candidate_bracket_matches.competition_id
  JOIN public.sports AS sports_table
    ON sports_table.id = candidate_competitions.sport_id
  LEFT JOIN public.matches AS candidate_matches
    ON candidate_matches.id = candidate_bracket_matches.match_id
  LEFT JOIN public.teams AS candidate_home_team
    ON candidate_home_team.id = candidate_matches.home_team_id
  LEFT JOIN public.teams AS candidate_away_team
    ON candidate_away_team.id = candidate_matches.away_team_id
  LEFT JOIN public.teams AS candidate_bracket_home_team
    ON candidate_bracket_home_team.id = candidate_bracket_matches.home_team_id
  LEFT JOIN public.teams AS candidate_bracket_away_team
    ON candidate_bracket_away_team.id = candidate_bracket_matches.away_team_id
  WHERE candidate_bracket_matches.id != source_item.id
    AND candidate_bracket_matches.bracket_edition_id = source_item.bracket_edition_id
    AND candidate_bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
    AND candidate_bracket_matches.is_bye = false
    AND candidate_competitions.sport_id = source_item.sport_id
    AND (
      candidate_bracket_matches.match_id IS NULL
      OR candidate_matches.status = 'SCHEDULED'::public.match_status
    )
    AND public.resolve_knockout_schedule_swap_conflict(
      source_item.id,
      candidate_bracket_matches.id
    ) IS NULL
  ORDER BY
    COALESCE(candidate_matches.scheduled_date, candidate_bracket_matches.planned_scheduled_date),
    COALESCE(candidate_matches.start_time, public.combine_bracket_schedule_timestamp(candidate_bracket_matches.planned_scheduled_date, candidate_bracket_matches.planned_start_time)) NULLS LAST,
    COALESCE(candidate_matches.scheduled_slot, candidate_bracket_matches.planned_scheduled_slot) NULLS LAST,
    candidate_bracket_matches.id;
END;
$$;

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
  source_item RECORD;
  target_item RECORD;
  conflict_message TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para trocar jogos de mata-mata.';
  END IF;

  PERFORM 1
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.id IN (_source_bracket_match_id, _target_bracket_match_id)
  ORDER BY bracket_matches_table.id
  FOR UPDATE;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_period,
    bracket_matches_table.planned_scheduled_slot,
    bracket_matches_table.planned_queue_position,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_group_id,
    bracket_matches_table.planned_court_group_id,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name,
    matches_table.scheduled_date,
    matches_table.queue_position,
    matches_table.scheduled_slot,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.location,
    matches_table.court_name
  INTO source_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = _source_bracket_match_id;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.planned_scheduled_date,
    bracket_matches_table.planned_period,
    bracket_matches_table.planned_scheduled_slot,
    bracket_matches_table.planned_queue_position,
    bracket_matches_table.planned_start_time,
    bracket_matches_table.planned_end_time,
    bracket_matches_table.planned_location_group_id,
    bracket_matches_table.planned_court_group_id,
    bracket_matches_table.planned_location_name,
    bracket_matches_table.planned_court_name,
    matches_table.scheduled_date,
    matches_table.queue_position,
    matches_table.scheduled_slot,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.location,
    matches_table.court_name
  INTO target_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = _target_bracket_match_id;

  conflict_message := public.resolve_knockout_schedule_swap_conflict(
    _source_bracket_match_id,
    _target_bracket_match_id
  );

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

  PERFORM 1
  FROM public.matches AS matches_table
  WHERE matches_table.id IN (source_item.match_id, target_item.match_id)
  ORDER BY matches_table.id
  FOR UPDATE;

  UPDATE public.championship_bracket_matches
  SET
    planned_scheduled_date = COALESCE(target_item.scheduled_date, target_item.planned_scheduled_date),
    planned_period = target_item.planned_period,
    planned_scheduled_slot = COALESCE(target_item.scheduled_slot, target_item.planned_scheduled_slot),
    planned_queue_position = COALESCE(target_item.queue_position, target_item.planned_queue_position),
    planned_start_time = CASE
      WHEN COALESCE(target_item.start_time, public.combine_bracket_schedule_timestamp(target_item.planned_scheduled_date, target_item.planned_start_time)) IS NULL THEN NULL
      ELSE (COALESCE(target_item.start_time, public.combine_bracket_schedule_timestamp(target_item.planned_scheduled_date, target_item.planned_start_time)) AT TIME ZONE 'America/Sao_Paulo')::TIME
    END,
    planned_end_time = CASE
      WHEN COALESCE(target_item.end_time, public.combine_bracket_schedule_timestamp(target_item.planned_scheduled_date, target_item.planned_end_time)) IS NULL THEN NULL
      ELSE (COALESCE(target_item.end_time, public.combine_bracket_schedule_timestamp(target_item.planned_scheduled_date, target_item.planned_end_time)) AT TIME ZONE 'America/Sao_Paulo')::TIME
    END,
    planned_location_group_id = target_item.planned_location_group_id,
    planned_court_group_id = target_item.planned_court_group_id,
    planned_location_name = COALESCE(target_item.location, target_item.planned_location_name),
    planned_court_name = COALESCE(target_item.court_name, target_item.planned_court_name)
  WHERE id = source_item.id;

  UPDATE public.championship_bracket_matches
  SET
    planned_scheduled_date = COALESCE(source_item.scheduled_date, source_item.planned_scheduled_date),
    planned_period = source_item.planned_period,
    planned_scheduled_slot = COALESCE(source_item.scheduled_slot, source_item.planned_scheduled_slot),
    planned_queue_position = COALESCE(source_item.queue_position, source_item.planned_queue_position),
    planned_start_time = CASE
      WHEN COALESCE(source_item.start_time, public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_start_time)) IS NULL THEN NULL
      ELSE (COALESCE(source_item.start_time, public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_start_time)) AT TIME ZONE 'America/Sao_Paulo')::TIME
    END,
    planned_end_time = CASE
      WHEN COALESCE(source_item.end_time, public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_end_time)) IS NULL THEN NULL
      ELSE (COALESCE(source_item.end_time, public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_end_time)) AT TIME ZONE 'America/Sao_Paulo')::TIME
    END,
    planned_location_group_id = source_item.planned_location_group_id,
    planned_court_group_id = source_item.planned_court_group_id,
    planned_location_name = COALESCE(source_item.location, source_item.planned_location_name),
    planned_court_name = COALESCE(source_item.court_name, source_item.planned_court_name)
  WHERE id = target_item.id;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);
  PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

  IF source_item.match_id IS NOT NULL THEN
    UPDATE public.matches
    SET
      scheduled_date = COALESCE(target_item.scheduled_date, target_item.planned_scheduled_date),
      location = COALESCE(target_item.location, target_item.planned_location_name),
      court_name = COALESCE(target_item.court_name, target_item.planned_court_name),
      start_time = COALESCE(
        target_item.start_time,
        public.combine_bracket_schedule_timestamp(target_item.planned_scheduled_date, target_item.planned_start_time)
      ),
      end_time = COALESCE(
        target_item.end_time,
        public.combine_bracket_schedule_timestamp(target_item.planned_scheduled_date, target_item.planned_end_time)
      ),
      queue_position = COALESCE(target_item.queue_position, target_item.planned_queue_position),
      scheduled_slot = COALESCE(target_item.scheduled_slot, target_item.planned_scheduled_slot)
    WHERE id = source_item.match_id;
  END IF;

  IF target_item.match_id IS NOT NULL THEN
    UPDATE public.matches
    SET
      scheduled_date = COALESCE(source_item.scheduled_date, source_item.planned_scheduled_date),
      location = COALESCE(source_item.location, source_item.planned_location_name),
      court_name = COALESCE(source_item.court_name, source_item.planned_court_name),
      start_time = COALESCE(
        source_item.start_time,
        public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_start_time)
      ),
      end_time = COALESCE(
        source_item.end_time,
        public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_end_time)
      ),
      queue_position = COALESCE(source_item.queue_position, source_item.planned_queue_position),
      scheduled_slot = COALESCE(source_item.scheduled_slot, source_item.planned_scheduled_slot)
    WHERE id = target_item.match_id;
  END IF;

  PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
  PERFORM set_config('app.skip_queue_trigger', 'false', true);

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = source_item.bracket_edition_id;

  RETURN jsonb_build_object(
    'source_bracket_match_id', source_item.id,
    'target_bracket_match_id', target_item.id,
    'source_previous_slot', COALESCE(source_item.scheduled_slot, source_item.planned_scheduled_slot),
    'target_previous_slot', COALESCE(target_item.scheduled_slot, target_item.planned_scheduled_slot)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.list_knockout_schedule_swap_candidates(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_knockout_schedule_swap_candidates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
