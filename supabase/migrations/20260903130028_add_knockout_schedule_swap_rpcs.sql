CREATE OR REPLACE FUNCTION public.resolve_knockout_schedule_swap_conflict(
  _source_bracket_match_id UUID,
  _target_bracket_match_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  source_item RECORD;
  target_item RECORD;
  rest_conflict_message TEXT;
  has_representation_conflict BOOLEAN := false;
BEGIN
  IF _source_bracket_match_id IS NULL OR _target_bracket_match_id IS NULL THEN
    RETURN 'Informe os dois slots para realizar a troca.';
  END IF;

  IF _source_bracket_match_id = _target_bracket_match_id THEN
    RETURN 'Selecione itens diferentes para trocar a programação.';
  END IF;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.phase,
    bracket_matches_table.is_bye,
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
    editions_table.championship_id,
    editions_table.season_year,
    competitions_table.sport_id,
    competitions_table.naipe,
    matches_table.status,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.manual_representation_mode,
    matches_table.created_at AS match_created_at,
    COALESCE(matches_table.scheduled_date, bracket_matches_table.planned_scheduled_date) AS scheduled_date,
    COALESCE(matches_table.queue_position, bracket_matches_table.planned_queue_position) AS queue_position,
    COALESCE(matches_table.scheduled_slot, bracket_matches_table.planned_scheduled_slot) AS scheduled_slot,
    COALESCE(
      matches_table.start_time,
      CASE
        WHEN bracket_matches_table.planned_scheduled_date IS NOT NULL
          AND bracket_matches_table.planned_start_time IS NOT NULL
        THEN public.combine_bracket_schedule_timestamp(
          bracket_matches_table.planned_scheduled_date,
          bracket_matches_table.planned_start_time
        )
        ELSE NULL
      END
    ) AS start_time,
    COALESCE(
      matches_table.end_time,
      CASE
        WHEN bracket_matches_table.planned_scheduled_date IS NOT NULL
          AND bracket_matches_table.planned_end_time IS NOT NULL
        THEN public.combine_bracket_schedule_timestamp(
          bracket_matches_table.planned_scheduled_date,
          bracket_matches_table.planned_end_time
        )
        ELSE NULL
      END
    ) AS end_time,
    COALESCE(matches_table.location, bracket_matches_table.planned_location_name) AS location,
    COALESCE(matches_table.court_name, bracket_matches_table.planned_court_name) AS court_name
  INTO source_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = _source_bracket_match_id;

  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.phase,
    bracket_matches_table.is_bye,
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
    editions_table.championship_id,
    editions_table.season_year,
    competitions_table.sport_id,
    competitions_table.naipe,
    matches_table.status,
    matches_table.home_team_id,
    matches_table.away_team_id,
    matches_table.manual_representation_mode,
    matches_table.created_at AS match_created_at,
    COALESCE(matches_table.scheduled_date, bracket_matches_table.planned_scheduled_date) AS scheduled_date,
    COALESCE(matches_table.queue_position, bracket_matches_table.planned_queue_position) AS queue_position,
    COALESCE(matches_table.scheduled_slot, bracket_matches_table.planned_scheduled_slot) AS scheduled_slot,
    COALESCE(
      matches_table.start_time,
      CASE
        WHEN bracket_matches_table.planned_scheduled_date IS NOT NULL
          AND bracket_matches_table.planned_start_time IS NOT NULL
        THEN public.combine_bracket_schedule_timestamp(
          bracket_matches_table.planned_scheduled_date,
          bracket_matches_table.planned_start_time
        )
        ELSE NULL
      END
    ) AS start_time,
    COALESCE(
      matches_table.end_time,
      CASE
        WHEN bracket_matches_table.planned_scheduled_date IS NOT NULL
          AND bracket_matches_table.planned_end_time IS NOT NULL
        THEN public.combine_bracket_schedule_timestamp(
          bracket_matches_table.planned_scheduled_date,
          bracket_matches_table.planned_end_time
        )
        ELSE NULL
      END
    ) AS end_time,
    COALESCE(matches_table.location, bracket_matches_table.planned_location_name) AS location,
    COALESCE(matches_table.court_name, bracket_matches_table.planned_court_name) AS court_name
  INTO target_item
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = competitions_table.bracket_edition_id
  LEFT JOIN public.matches AS matches_table
    ON matches_table.id = bracket_matches_table.match_id
  WHERE bracket_matches_table.id = _target_bracket_match_id;

  IF source_item.id IS NULL OR target_item.id IS NULL THEN
    RETURN 'Não foi possível localizar os itens selecionados para troca.';
  END IF;

  IF source_item.phase != 'KNOCKOUT'::public.bracket_phase
    OR target_item.phase != 'KNOCKOUT'::public.bracket_phase
    OR source_item.is_bye
    OR target_item.is_bye
  THEN
    RETURN 'A troca é permitida somente entre jogos da fase eliminatória.';
  END IF;

  IF source_item.match_id IS NOT NULL THEN
    RETURN 'O item de origem precisa ser um slot de mata-mata ainda sem definição.';
  END IF;

  IF target_item.match_id IS NOT NULL
    AND target_item.status != 'SCHEDULED'::public.match_status
  THEN
    RETURN 'A troca só pode envolver confrontos materializados que estejam agendados.';
  END IF;

  IF source_item.bracket_edition_id != target_item.bracket_edition_id
    OR source_item.sport_id != target_item.sport_id
  THEN
    RETURN 'A troca exige itens da mesma edição e modalidade.';
  END IF;

  IF source_item.scheduled_date IS NULL
    OR target_item.scheduled_date IS NULL
    OR source_item.queue_position IS NULL
    OR target_item.queue_position IS NULL
    OR source_item.scheduled_slot IS NULL
    OR target_item.scheduled_slot IS NULL
    OR source_item.queue_position < 1
    OR target_item.queue_position < 1
    OR source_item.scheduled_slot < 1
    OR target_item.scheduled_slot < 1
    OR NULLIF(trim(COALESCE(source_item.location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(source_item.court_name, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(target_item.location, '')), '') IS NULL
    OR NULLIF(trim(COALESCE(target_item.court_name, '')), '') IS NULL
  THEN
    RETURN 'Os itens precisam ter data, local, quadra e posição de fila definidos.';
  END IF;

  IF public.normalize_bracket_entity_name(source_item.location) != public.normalize_bracket_entity_name(target_item.location)
    OR public.normalize_bracket_entity_name(source_item.court_name) != public.normalize_bracket_entity_name(target_item.court_name)
  THEN
    RETURN 'A troca exige itens da mesma quadra.';
  END IF;

  IF target_item.match_id IS NULL THEN
    RETURN NULL;
  END IF;

  rest_conflict_message := public.resolve_scheduled_match_rest_gap_conflict(
    target_item.championship_id,
    target_item.season_year,
    source_item.scheduled_date,
    source_item.location,
    source_item.court_name,
    source_item.start_time,
    source_item.scheduled_slot,
    source_item.queue_position,
    target_item.match_created_at,
    target_item.match_id,
    target_item.sport_id,
    target_item.naipe,
    target_item.home_team_id,
    target_item.away_team_id
  );

  IF rest_conflict_message IS NOT NULL THEN
    RETURN rest_conflict_message;
  END IF;

  WITH scheduled_matches AS (
    SELECT
      matches_table.id,
      matches_table.home_team_id,
      matches_table.away_team_id,
      matches_table.manual_representation_mode,
      matches_table.start_time,
      matches_table.scheduled_slot,
      matches_table.queue_position,
      matches_table.created_at
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = target_item.championship_id
      AND matches_table.season_year = target_item.season_year
      AND matches_table.status = 'SCHEDULED'::public.match_status
      AND matches_table.scheduled_date = source_item.scheduled_date
      AND public.normalize_bracket_entity_name(matches_table.location) = public.normalize_bracket_entity_name(source_item.location)
      AND public.normalize_bracket_entity_name(matches_table.court_name) = public.normalize_bracket_entity_name(source_item.court_name)
      AND matches_table.id != target_item.match_id

    UNION ALL

    SELECT
      target_item.match_id,
      target_item.home_team_id,
      target_item.away_team_id,
      target_item.manual_representation_mode,
      source_item.start_time,
      source_item.scheduled_slot,
      source_item.queue_position,
      target_item.match_created_at
  ), ordered_matches AS (
    SELECT
      scheduled_matches.*,
      lag(scheduled_matches.home_team_id) OVER match_order AS previous_home_team_id,
      lag(scheduled_matches.away_team_id) OVER match_order AS previous_away_team_id,
      lead(scheduled_matches.home_team_id) OVER match_order AS next_home_team_id,
      lead(scheduled_matches.away_team_id) OVER match_order AS next_away_team_id
    FROM scheduled_matches
    WINDOW match_order AS (
      ORDER BY
        CASE WHEN scheduled_matches.start_time IS NULL THEN 1 ELSE 0 END,
        scheduled_matches.start_time ASC NULLS LAST,
        COALESCE(scheduled_matches.scheduled_slot, scheduled_matches.queue_position) ASC NULLS LAST,
        COALESCE(scheduled_matches.queue_position, scheduled_matches.scheduled_slot) ASC NULLS LAST,
        scheduled_matches.created_at ASC,
        scheduled_matches.id ASC
    )
  )
  SELECT EXISTS (
    SELECT 1
    FROM ordered_matches
    WHERE ordered_matches.id = target_item.match_id
      AND COALESCE(ordered_matches.manual_representation_mode, 'AUTO') != 'CO'
      AND (
        ordered_matches.previous_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
        OR ordered_matches.previous_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
        OR ordered_matches.next_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
        OR ordered_matches.next_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
      )
  )
  INTO has_representation_conflict;

  IF has_representation_conflict THEN
    RETURN 'A troca cria conflito de representação na mesma quadra.';
  END IF;

  RETURN NULL;
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
    OR source_item.match_id IS NOT NULL
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
    bracket_matches_table.planned_court_name
  INTO source_item
  FROM public.championship_bracket_matches AS bracket_matches_table
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

  IF target_item.match_id IS NOT NULL THEN
    PERFORM 1
    FROM public.matches AS matches_table
    WHERE matches_table.id = target_item.match_id
    FOR UPDATE;
  END IF;

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
    planned_scheduled_date = source_item.planned_scheduled_date,
    planned_period = source_item.planned_period,
    planned_scheduled_slot = source_item.planned_scheduled_slot,
    planned_queue_position = source_item.planned_queue_position,
    planned_start_time = source_item.planned_start_time,
    planned_end_time = source_item.planned_end_time,
    planned_location_group_id = source_item.planned_location_group_id,
    planned_court_group_id = source_item.planned_court_group_id,
    planned_location_name = source_item.planned_location_name,
    planned_court_name = source_item.planned_court_name
  WHERE id = target_item.id;

  IF target_item.match_id IS NOT NULL THEN
    PERFORM set_config('app.skip_queue_trigger', 'true', true);
    PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);

    UPDATE public.matches
    SET
      scheduled_date = source_item.planned_scheduled_date,
      location = source_item.planned_location_name,
      court_name = source_item.planned_court_name,
      start_time = CASE
        WHEN source_item.planned_scheduled_date IS NULL OR source_item.planned_start_time IS NULL THEN NULL
        ELSE public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_start_time)
      END,
      end_time = CASE
        WHEN source_item.planned_scheduled_date IS NULL OR source_item.planned_end_time IS NULL THEN NULL
        ELSE public.combine_bracket_schedule_timestamp(source_item.planned_scheduled_date, source_item.planned_end_time)
      END,
      queue_position = source_item.planned_queue_position,
      scheduled_slot = source_item.planned_scheduled_slot
    WHERE id = target_item.match_id;

    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
  END IF;

  UPDATE public.championship_bracket_editions
  SET reprogramming_revision = reprogramming_revision + 1
  WHERE id = source_item.bracket_edition_id;

  RETURN jsonb_build_object(
    'source_bracket_match_id', source_item.id,
    'target_bracket_match_id', target_item.id,
    'source_previous_slot', source_item.planned_scheduled_slot,
    'target_previous_slot', COALESCE(target_item.scheduled_slot, target_item.planned_scheduled_slot)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_knockout_schedule_swap_conflict(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_knockout_schedule_swap_candidates(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_knockout_schedule_swap_candidates(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.swap_knockout_schedule_slots(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
