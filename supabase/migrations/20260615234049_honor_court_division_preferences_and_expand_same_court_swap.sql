CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available_courts_count INTEGER;
  live_matches_count INTEGER;
  latest_bracket_edition_id UUID;
  should_validate_live_capacity BOOLEAN := false;
  court_sequence_conflict_message TEXT;
BEGIN
  IF current_setting('app.skip_match_conflict_trigger', TRUE) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Os times da partida devem ser diferentes.';
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status THEN
    IF NEW.scheduled_date IS NULL THEN
      RAISE EXCEPTION 'Informe o dia da fila para partidas agendadas.';
    END IF;
  END IF;

  IF NEW.status = 'LIVE'::public.match_status AND NEW.scheduled_date IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      should_validate_live_capacity := true;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      should_validate_live_capacity := true;
    END IF;
  END IF;

  IF should_validate_live_capacity THEN
    SELECT editions_table.id
    INTO latest_bracket_edition_id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = NEW.championship_id
      AND editions_table.season_year = NEW.season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1;

    IF latest_bracket_edition_id IS NOT NULL THEN
      SELECT count(*)
      INTO available_courts_count
      FROM public.championship_bracket_days AS days_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.bracket_day_id = days_table.id
      JOIN public.championship_bracket_courts AS courts_table
        ON courts_table.bracket_location_id = locations_table.id
      JOIN public.championship_bracket_court_sports AS court_sports_table
        ON court_sports_table.bracket_court_id = courts_table.id
      WHERE days_table.bracket_edition_id = latest_bracket_edition_id
        AND days_table.event_date = NEW.scheduled_date
        AND court_sports_table.sport_id = NEW.sport_id;

      IF COALESCE(available_courts_count, 0) > 0 THEN
        SELECT count(*)
        INTO live_matches_count
        FROM public.matches AS matches_table
        WHERE matches_table.championship_id = NEW.championship_id
          AND matches_table.season_year = NEW.season_year
          AND matches_table.sport_id = NEW.sport_id
          AND matches_table.status = 'LIVE'::public.match_status
          AND matches_table.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
          AND matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

        IF live_matches_count >= available_courts_count THEN
          RAISE EXCEPTION 'Todas as quadras compatíveis desta modalidade já estão ocupadas neste dia.';
        END IF;
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status
    AND NEW.court_name IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.location, '')), '') IS NOT NULL
    AND NULLIF(trim(COALESCE(NEW.court_name, '')), '') IS NOT NULL THEN
    court_sequence_conflict_message := public.resolve_scheduled_match_court_sequence_conflict(
      NEW.championship_id,
      NEW.season_year,
      NEW.scheduled_date,
      NEW.location,
      NEW.court_name,
      NEW.start_time,
      NEW.scheduled_slot,
      NEW.queue_position,
      NEW.created_at,
      NEW.id,
      NEW.home_team_id,
      NEW.away_team_id
    );

    IF court_sequence_conflict_message IS NOT NULL THEN
      RAISE EXCEPTION '%', court_sequence_conflict_message;
    END IF;
  END IF;

  IF NEW.end_time IS NOT NULL AND NEW.start_time IS NULL THEN
    RAISE EXCEPTION 'A partida não pode ter horário final sem horário inicial.';
  END IF;

  IF NEW.start_time IS NOT NULL
    AND NEW.end_time IS NOT NULL
    AND NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'Horário final da partida deve ser maior que o horário inicial.';
  END IF;

  RETURN NEW;
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
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.created_at,
    matches_table.home_team_id,
    matches_table.away_team_id,
    COALESCE(matches_table.scheduled_slot, matches_table.queue_position) AS queue_slot
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
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.end_time,
    matches_table.created_at,
    matches_table.home_team_id,
    matches_table.away_team_id,
    COALESCE(matches_table.scheduled_slot, matches_table.queue_position) AS queue_slot
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
    OR source_match.location IS DISTINCT FROM target_match.location
    OR source_match.court_name IS DISTINCT FROM target_match.court_name THEN
    RAISE EXCEPTION 'A troca exige jogos do mesmo dia, modalidade e quadra.';
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

  SELECT COALESCE(MAX(COALESCE(matches_table.scheduled_slot, matches_table.queue_position)), 0) + 1000
  INTO temporary_slot_base
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = source_match.championship_id
    AND matches_table.season_year = source_match.season_year
    AND matches_table.scheduled_date = source_match.scheduled_date
    AND matches_table.sport_id = source_match.sport_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;

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
      queue_position = target_slot,
      scheduled_slot = target_slot,
      start_time = target_match.start_time,
      end_time = target_match.end_time
    WHERE id = source_match.id;

    UPDATE public.matches
    SET
      queue_position = source_slot,
      scheduled_slot = source_slot,
      start_time = source_match.start_time,
      end_time = source_match.end_time
    WHERE id = target_match.id;

    WITH affected_scopes AS (
      SELECT DISTINCT
        scope_values.sport_id,
        scope_values.naipe,
        scope_values.division
      FROM (
        VALUES
          (source_match.sport_id, source_match.naipe, source_match.division),
          (target_match.sport_id, target_match.naipe, target_match.division)
      ) AS scope_values (sport_id, naipe, division)
    ),
    ordered_matches AS (
      SELECT
        matches_table.id,
        ROW_NUMBER() OVER (
          PARTITION BY
            matches_table.sport_id,
            matches_table.naipe,
            COALESCE(matches_table.division::text, 'WITHOUT_DIVISION')
          ORDER BY
            matches_table.scheduled_date ASC,
            COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
            matches_table.start_time ASC NULLS LAST,
            matches_table.created_at ASC,
            matches_table.id ASC
        ) AS new_queue_position
      FROM public.matches AS matches_table
      JOIN affected_scopes
        ON affected_scopes.sport_id = matches_table.sport_id
        AND affected_scopes.naipe = matches_table.naipe
        AND affected_scopes.division IS NOT DISTINCT FROM matches_table.division
      WHERE matches_table.championship_id = source_match.championship_id
        AND matches_table.season_year = source_match.season_year
        AND matches_table.scheduled_date = source_match.scheduled_date
        AND matches_table.status = 'SCHEDULED'::public.match_status
    )
    UPDATE public.matches AS matches_table
    SET queue_position = ordered_matches.new_queue_position
    FROM ordered_matches
    WHERE ordered_matches.id = matches_table.id;

    PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
    PERFORM set_config('app.skip_queue_trigger', 'false', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
      PERFORM set_config('app.skip_queue_trigger', 'false', true);
      RAISE;
  END;

  SELECT public.resolve_scheduled_match_court_sequence_conflict(
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.scheduled_slot,
    matches_table.queue_position,
    matches_table.created_at,
    matches_table.id,
    matches_table.home_team_id,
    matches_table.away_team_id
  )
  INTO conflict_message
  FROM public.matches AS matches_table
  WHERE matches_table.id = source_match.id
  LIMIT 1;

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

  SELECT public.resolve_scheduled_match_court_sequence_conflict(
    matches_table.championship_id,
    matches_table.season_year,
    matches_table.scheduled_date,
    matches_table.location,
    matches_table.court_name,
    matches_table.start_time,
    matches_table.scheduled_slot,
    matches_table.queue_position,
    matches_table.created_at,
    matches_table.id,
    matches_table.home_team_id,
    matches_table.away_team_id
  )
  INTO conflict_message
  FROM public.matches AS matches_table
  WHERE matches_table.id = target_match.id
  LIMIT 1;

  IF conflict_message IS NOT NULL THEN
    RAISE EXCEPTION '%', conflict_message;
  END IF;

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

COMMENT ON FUNCTION public.swap_match_queue_slots(UUID, UUID)
IS 'Troca a posição da fila entre dois jogos agendados da mesma quadra e do mesmo dia, recalculando a fila operacional afetada e bloqueando conflitos consecutivos.';

WITH inferred_location_priorities AS (
  SELECT
    days_table.bracket_edition_id,
    locations_table.location_group_id,
    court_sports_table.sport_id,
    CASE
      WHEN COUNT(*) FILTER (WHERE court_sports_table.preferred_division IS NOT NULL) > 0
        THEN 'DIVISION'::public.bracket_court_priority_mode
      WHEN COUNT(*) FILTER (WHERE court_sports_table.preferred_naipe IS NOT NULL) > 0
        THEN 'NAIPE'::public.bracket_court_priority_mode
      ELSE 'NONE'::public.bracket_court_priority_mode
    END AS priority_mode
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  JOIN public.championship_bracket_court_sports AS court_sports_table
    ON court_sports_table.bracket_court_id = courts_table.id
  WHERE locations_table.location_group_id IS NOT NULL
    AND (
      court_sports_table.preferred_division IS NOT NULL
      OR court_sports_table.preferred_naipe IS NOT NULL
    )
  GROUP BY
    days_table.bracket_edition_id,
    locations_table.location_group_id,
    court_sports_table.sport_id
)
INSERT INTO public.championship_bracket_location_sport_priorities (
  bracket_edition_id,
  location_group_id,
  sport_id,
  priority_mode
)
SELECT
  inferred_location_priorities.bracket_edition_id,
  inferred_location_priorities.location_group_id,
  inferred_location_priorities.sport_id,
  inferred_location_priorities.priority_mode
FROM inferred_location_priorities
ON CONFLICT (bracket_edition_id, location_group_id, sport_id)
DO UPDATE SET
  priority_mode = EXCLUDED.priority_mode,
  updated_at = now()
WHERE public.championship_bracket_location_sport_priorities.priority_mode = 'NONE'::public.bracket_court_priority_mode;

DO $$
DECLARE
  affected_bracket_edition_id UUID;
  remaining_conflicts_count INTEGER := 0;
  redistribution_pass INTEGER := 0;
  max_redistribution_passes CONSTANT INTEGER := 5;
BEGIN
  LOOP
    redistribution_pass := redistribution_pass + 1;
    EXIT WHEN redistribution_pass > max_redistribution_passes;

    FOR affected_bracket_edition_id IN
      SELECT DISTINCT bracket_editions_table.id
      FROM public.championship_bracket_editions AS bracket_editions_table
      JOIN public.championships AS championships_table
        ON championships_table.id = bracket_editions_table.championship_id
      WHERE championships_table.status = 'UPCOMING'::public.championship_status
        AND (
          EXISTS (
            SELECT 1
            FROM public.championship_bracket_location_sport_priorities AS priorities_table
            WHERE priorities_table.bracket_edition_id = bracket_editions_table.id
              AND priorities_table.priority_mode <> 'NONE'::public.bracket_court_priority_mode
          )
          OR EXISTS (
            SELECT 1
            FROM public.matches AS matches_table
            JOIN public.championship_bracket_matches AS bracket_matches_table
              ON bracket_matches_table.match_id = matches_table.id
            WHERE bracket_matches_table.bracket_edition_id = bracket_editions_table.id
              AND matches_table.status = 'SCHEDULED'::public.match_status
              AND matches_table.scheduled_date IS NOT NULL
              AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
              AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
          )
        )
    LOOP
      PERFORM set_config('app.skip_queue_trigger', 'true', true);
      PERFORM set_config('app.skip_match_conflict_trigger', 'true', true);
      PERFORM public.redistribute_bracket_scheduled_matches(affected_bracket_edition_id);
      PERFORM set_config('app.skip_match_conflict_trigger', 'false', true);
      PERFORM set_config('app.skip_queue_trigger', 'false', true);
    END LOOP;

    WITH remaining_conflicts AS (
      SELECT 1
      FROM (
        SELECT
          bracket_matches_table.bracket_edition_id,
          matches_table.id,
          matches_table.home_team_id,
          matches_table.away_team_id,
          lag(matches_table.home_team_id) OVER court_sequence AS previous_home_team_id,
          lag(matches_table.away_team_id) OVER court_sequence AS previous_away_team_id
        FROM public.matches AS matches_table
        JOIN public.championship_bracket_matches AS bracket_matches_table
          ON bracket_matches_table.match_id = matches_table.id
        JOIN public.championship_bracket_editions AS bracket_editions_table
          ON bracket_editions_table.id = bracket_matches_table.bracket_edition_id
        JOIN public.championships AS championships_table
          ON championships_table.id = bracket_editions_table.championship_id
        WHERE matches_table.status = 'SCHEDULED'::public.match_status
          AND championships_table.status = 'UPCOMING'::public.championship_status
          AND matches_table.scheduled_date IS NOT NULL
          AND NULLIF(trim(COALESCE(matches_table.location, '')), '') IS NOT NULL
          AND NULLIF(trim(COALESCE(matches_table.court_name, '')), '') IS NOT NULL
        WINDOW court_sequence AS (
          PARTITION BY
            bracket_matches_table.bracket_edition_id,
            matches_table.scheduled_date,
            public.normalize_bracket_entity_name(matches_table.location),
            public.normalize_bracket_entity_name(matches_table.court_name)
          ORDER BY
            CASE
              WHEN matches_table.start_time IS NULL THEN 1
              ELSE 0
            END,
            matches_table.start_time ASC NULLS LAST,
            COALESCE(matches_table.scheduled_slot, matches_table.queue_position) ASC NULLS LAST,
            COALESCE(matches_table.queue_position, matches_table.scheduled_slot) ASC NULLS LAST,
            matches_table.created_at ASC,
            matches_table.id ASC
        )
      ) AS ordered_matches
      WHERE ordered_matches.previous_home_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
        OR ordered_matches.previous_away_team_id IN (ordered_matches.home_team_id, ordered_matches.away_team_id)
    )
    SELECT count(*)
    INTO remaining_conflicts_count
    FROM remaining_conflicts;

    EXIT WHEN remaining_conflicts_count = 0;
  END LOOP;

  IF remaining_conflicts_count > 0 THEN
    RAISE EXCEPTION
      'Ainda restam % conflito(s) consecutivos na mesma quadra após % tentativas de redistribuição.',
      remaining_conflicts_count,
      max_redistribution_passes;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
