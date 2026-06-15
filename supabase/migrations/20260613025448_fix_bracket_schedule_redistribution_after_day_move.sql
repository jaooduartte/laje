-- Corrige a redistribuição da agenda do chaveamento após mover jogos de dia ou
-- alterar prioridades de quadra.
--
-- Problemas corrigidos:
-- 1. O projeto remoto estava com uma versão antiga de update_bracket_day_schedule,
--    que não preservava corretamente a redistribuição por múltiplas quadras.
-- 2. update_bracket_court_priorities referenciava redistribute_bracket_scheduled_matches,
--    mas a função compartilhada não existia no banco remoto.
-- 3. O trigger assign_match_queue_position interferia durante updates em lote,
--    reatribuindo slots/fila no meio da redistribuição.
-- 4. queue_position não era recalculado após a redistribuição, causando ordem
--    incorreta quando a tela era filtrada por modalidade/naipe/divisão.

CREATE OR REPLACE FUNCTION public.redistribute_bracket_scheduled_matches(
  _bracket_edition_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_championship_id UUID;
  v_season_year INTEGER;
  v_last_event_date DATE;
  day_record RECORD;
  pending_match_record RECORD;
  current_slot INTEGER;
  current_slot_total_count INTEGER;
  current_slot_placed_count INTEGER;
  sport_day_court_count INTEGER;
  sport_slot_count INTEGER;
  naipe_court_count INTEGER;
  naipe_has_preference BOOLEAN;
  naipe_slot_count INTEGER;
  has_other_naipe_pending BOOLEAN;
  division_court_count INTEGER;
  division_has_preference BOOLEAN;
  division_slot_count INTEGER;
  has_other_division_pending BOOLEAN;
  same_team_conflict BOOLEAN;
BEGIN
  SELECT cbe.championship_id, cbe.season_year
  INTO v_championship_id, v_season_year
  FROM public.championship_bracket_editions AS cbe
  WHERE cbe.id = _bracket_edition_id
  LIMIT 1;

  IF v_championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida.';
  END IF;

  DROP TABLE IF EXISTS tmp_redis_day_caps;
  CREATE TEMP TABLE tmp_redis_day_caps (
    event_date DATE PRIMARY KEY,
    total_courts INTEGER NOT NULL,
    max_slots INTEGER NOT NULL
  ) ON COMMIT DROP;

  SELECT MAX(d.event_date)
  INTO v_last_event_date
  FROM public.championship_bracket_days AS d
  WHERE d.bracket_edition_id = _bracket_edition_id;

  INSERT INTO tmp_redis_day_caps (event_date, total_courts, max_slots)
  SELECT
    d.event_date,
    COUNT(DISTINCT c.id)::integer AS total_courts,
    CASE
      WHEN d.event_date = v_last_event_date THEN 2147483647
      ELSE GREATEST(1, FLOOR(
        (
          EXTRACT(EPOCH FROM d.end_time) / 60.0
          - EXTRACT(EPOCH FROM d.start_time) / 60.0
          - COALESCE((
              SELECT SUM(
                EXTRACT(EPOCH FROM b.break_end_time) / 60.0
                - EXTRACT(EPOCH FROM b.break_start_time) / 60.0
              )
              FROM public.championship_bracket_day_breaks AS b
              WHERE b.bracket_day_id = d.id
            ),
            COALESCE(
              EXTRACT(EPOCH FROM d.break_end_time) / 60.0
              - EXTRACT(EPOCH FROM d.break_start_time) / 60.0,
              0.0
            ))
        )
        / GREATEST(1, COALESCE((
            SELECT MIN(public.resolve_championship_sport_duration_minutes(v_championship_id, cs2.sport_id))
            FROM public.championship_bracket_court_sports AS cs2
            JOIN public.championship_bracket_courts AS c2 ON c2.id = cs2.bracket_court_id
            JOIN public.championship_bracket_locations AS l2 ON l2.id = c2.bracket_location_id
            WHERE l2.bracket_day_id = d.id
          ), 35))
      ))::INTEGER
    END AS max_slots
  FROM public.championship_bracket_days AS d
  JOIN public.championship_bracket_locations AS l ON l.bracket_day_id = d.id
  JOIN public.championship_bracket_courts AS c ON c.bracket_location_id = l.id
  WHERE d.bracket_edition_id = _bracket_edition_id
  GROUP BY d.id, d.event_date, d.start_time, d.end_time, d.break_start_time, d.break_end_time;

  DROP TABLE IF EXISTS tmp_redis_sport_courts;
  CREATE TEMP TABLE tmp_redis_sport_courts (
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    court_count INTEGER NOT NULL,
    PRIMARY KEY (event_date, sport_id)
  ) ON COMMIT DROP;

  INSERT INTO tmp_redis_sport_courts (event_date, sport_id, court_count)
  SELECT
    d.event_date,
    cs.sport_id,
    COUNT(DISTINCT c.id)::integer
  FROM public.championship_bracket_days AS d
  JOIN public.championship_bracket_locations AS l ON l.bracket_day_id = d.id
  JOIN public.championship_bracket_courts AS c ON c.bracket_location_id = l.id
  JOIN public.championship_bracket_court_sports AS cs ON cs.bracket_court_id = c.id
  WHERE d.bracket_edition_id = _bracket_edition_id
  GROUP BY d.event_date, cs.sport_id;

  DROP TABLE IF EXISTS tmp_redis_sport_naipe_courts;
  CREATE TEMP TABLE tmp_redis_sport_naipe_courts (
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    court_count INTEGER NOT NULL,
    has_preference BOOLEAN NOT NULL,
    PRIMARY KEY (event_date, sport_id, naipe)
  ) ON COMMIT DROP;

  INSERT INTO tmp_redis_sport_naipe_courts (event_date, sport_id, naipe, court_count, has_preference)
  SELECT
    d.event_date,
    cs.sport_id,
    naipe_values.naipe,
    COUNT(DISTINCT c.id) FILTER (
      WHERE cs.preferred_naipe IS NULL OR cs.preferred_naipe = naipe_values.naipe
    )::integer,
    bool_or(cs.preferred_naipe IS NOT NULL)
  FROM public.championship_bracket_days AS d
  JOIN public.championship_bracket_locations AS l ON l.bracket_day_id = d.id
  JOIN public.championship_bracket_courts AS c ON c.bracket_location_id = l.id
  JOIN public.championship_bracket_court_sports AS cs ON cs.bracket_court_id = c.id
  CROSS JOIN (SELECT unnest(enum_range(NULL::public.match_naipe)) AS naipe) AS naipe_values
  WHERE d.bracket_edition_id = _bracket_edition_id
  GROUP BY d.event_date, cs.sport_id, naipe_values.naipe;

  DROP TABLE IF EXISTS tmp_redis_sport_division_courts;
  CREATE TEMP TABLE tmp_redis_sport_division_courts (
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    division public.team_division NOT NULL,
    court_count INTEGER NOT NULL,
    has_preference BOOLEAN NOT NULL,
    PRIMARY KEY (event_date, sport_id, division)
  ) ON COMMIT DROP;

  INSERT INTO tmp_redis_sport_division_courts (event_date, sport_id, division, court_count, has_preference)
  SELECT
    d.event_date,
    cs.sport_id,
    division_values.division,
    COUNT(DISTINCT c.id) FILTER (
      WHERE cs.preferred_division IS NULL OR cs.preferred_division = division_values.division
    )::integer,
    bool_or(cs.preferred_division IS NOT NULL)
  FROM public.championship_bracket_days AS d
  JOIN public.championship_bracket_locations AS l ON l.bracket_day_id = d.id
  JOIN public.championship_bracket_courts AS c ON c.bracket_location_id = l.id
  JOIN public.championship_bracket_court_sports AS cs ON cs.bracket_court_id = c.id
  CROSS JOIN (SELECT unnest(enum_range(NULL::public.team_division)) AS division) AS division_values
  WHERE d.bracket_edition_id = _bracket_edition_id
  GROUP BY d.event_date, cs.sport_id, division_values.division;

  DROP TABLE IF EXISTS tmp_redis_pending_matches;
  CREATE TEMP TABLE tmp_redis_pending_matches (
    order_index BIGINT PRIMARY KEY,
    match_id UUID NOT NULL,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_redis_pending_matches (order_index, match_id, sport_id, naipe, division, home_team_id, away_team_id)
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
        m.scheduled_date ASC,
        COALESCE(m.scheduled_slot, m.queue_position) ASC NULLS LAST,
        COALESCE(m.queue_position, m.scheduled_slot) ASC NULLS LAST,
        m.created_at ASC,
        m.id ASC
    ),
    m.id,
    m.sport_id,
    m.naipe,
    m.division,
    m.home_team_id,
    m.away_team_id
  FROM public.matches AS m
  WHERE m.championship_id = v_championship_id
    AND m.season_year = v_season_year
    AND m.status = 'SCHEDULED'::public.match_status;

  DROP TABLE IF EXISTS tmp_redis_assignments;
  CREATE TEMP TABLE tmp_redis_assignments (
    match_id UUID PRIMARY KEY,
    sport_id UUID NOT NULL,
    naipe public.match_naipe NOT NULL,
    division public.team_division NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    new_scheduled_date DATE NOT NULL,
    new_scheduled_slot INTEGER NOT NULL
  ) ON COMMIT DROP;

  FOR day_record IN
    SELECT event_date, total_courts, max_slots
    FROM tmp_redis_day_caps
    ORDER BY event_date ASC
  LOOP
    current_slot := 1;

    WHILE current_slot <= day_record.max_slots
      AND EXISTS (
        SELECT 1
        FROM tmp_redis_pending_matches AS pm
        JOIN tmp_redis_sport_courts AS sc
          ON sc.event_date = day_record.event_date
          AND sc.sport_id = pm.sport_id
          AND sc.court_count > 0
      )
    LOOP
      current_slot_placed_count := 0;

      FOR pending_match_record IN
        SELECT pm.*
        FROM tmp_redis_pending_matches AS pm
        ORDER BY pm.order_index ASC
      LOOP
        SELECT COUNT(*)
        INTO current_slot_total_count
        FROM tmp_redis_assignments AS a
        WHERE a.new_scheduled_date = day_record.event_date
          AND a.new_scheduled_slot = current_slot;

        EXIT WHEN current_slot_total_count >= day_record.total_courts;

        SELECT sc.court_count
        INTO sport_day_court_count
        FROM tmp_redis_sport_courts AS sc
        WHERE sc.event_date = day_record.event_date
          AND sc.sport_id = pending_match_record.sport_id;

        IF COALESCE(sport_day_court_count, 0) < 1 THEN
          CONTINUE;
        END IF;

        SELECT COUNT(*)
        INTO sport_slot_count
        FROM tmp_redis_assignments AS a
        WHERE a.new_scheduled_date = day_record.event_date
          AND a.new_scheduled_slot = current_slot
          AND a.sport_id = pending_match_record.sport_id;

        IF sport_slot_count >= sport_day_court_count THEN
          CONTINUE;
        END IF;

        SELECT nc.court_count, nc.has_preference
        INTO naipe_court_count, naipe_has_preference
        FROM tmp_redis_sport_naipe_courts AS nc
        WHERE nc.event_date = day_record.event_date
          AND nc.sport_id = pending_match_record.sport_id
          AND nc.naipe = pending_match_record.naipe;

        IF COALESCE(naipe_has_preference, false)
          AND COALESCE(naipe_court_count, 0) < sport_day_court_count THEN
          SELECT COUNT(*)
          INTO naipe_slot_count
          FROM tmp_redis_assignments AS a
          WHERE a.new_scheduled_date = day_record.event_date
            AND a.new_scheduled_slot = current_slot
            AND a.sport_id = pending_match_record.sport_id
            AND a.naipe = pending_match_record.naipe;

          IF naipe_slot_count >= COALESCE(naipe_court_count, 0) THEN
            has_other_naipe_pending := EXISTS (
              SELECT 1
              FROM tmp_redis_pending_matches AS pm
              JOIN tmp_redis_sport_naipe_courts AS onc
                ON onc.event_date = day_record.event_date
                AND onc.sport_id = pm.sport_id
                AND onc.naipe = pm.naipe
                AND onc.court_count > 0
              WHERE pm.sport_id = pending_match_record.sport_id
                AND pm.naipe != pending_match_record.naipe
            );

            IF has_other_naipe_pending THEN
              CONTINUE;
            END IF;
          END IF;
        END IF;

        IF pending_match_record.division IS NOT NULL THEN
          SELECT dc.court_count, dc.has_preference
          INTO division_court_count, division_has_preference
          FROM tmp_redis_sport_division_courts AS dc
          WHERE dc.event_date = day_record.event_date
            AND dc.sport_id = pending_match_record.sport_id
            AND dc.division = pending_match_record.division;

          IF COALESCE(division_has_preference, false)
            AND COALESCE(division_court_count, 0) < sport_day_court_count THEN
            SELECT COUNT(*)
            INTO division_slot_count
            FROM tmp_redis_assignments AS a
            WHERE a.new_scheduled_date = day_record.event_date
              AND a.new_scheduled_slot = current_slot
              AND a.sport_id = pending_match_record.sport_id
              AND a.division = pending_match_record.division;

            IF division_slot_count >= COALESCE(division_court_count, 0) THEN
              has_other_division_pending := EXISTS (
                SELECT 1
                FROM tmp_redis_pending_matches AS pm
                JOIN tmp_redis_sport_division_courts AS odc
                  ON odc.event_date = day_record.event_date
                  AND odc.sport_id = pm.sport_id
                  AND odc.division = pm.division
                  AND odc.court_count > 0
                WHERE pm.sport_id = pending_match_record.sport_id
                  AND pm.division IS NOT NULL
                  AND pm.division != pending_match_record.division
              );

              IF has_other_division_pending THEN
                CONTINUE;
              END IF;
            END IF;
          END IF;
        END IF;

        same_team_conflict := EXISTS (
          SELECT 1
          FROM tmp_redis_assignments AS a
          WHERE a.new_scheduled_date = day_record.event_date
            AND a.new_scheduled_slot = current_slot
            AND (
              a.home_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
              OR a.away_team_id IN (pending_match_record.home_team_id, pending_match_record.away_team_id)
            )
        );

        IF same_team_conflict THEN
          CONTINUE;
        END IF;

        INSERT INTO tmp_redis_assignments (
          match_id, sport_id, naipe, division, home_team_id, away_team_id,
          new_scheduled_date, new_scheduled_slot
        ) VALUES (
          pending_match_record.match_id,
          pending_match_record.sport_id,
          pending_match_record.naipe,
          pending_match_record.division,
          pending_match_record.home_team_id,
          pending_match_record.away_team_id,
          day_record.event_date,
          current_slot
        );

        DELETE FROM tmp_redis_pending_matches
        WHERE order_index = pending_match_record.order_index;

        current_slot_placed_count := current_slot_placed_count + 1;
      END LOOP;

      EXIT WHEN current_slot_placed_count = 0 AND NOT EXISTS (
        SELECT 1
        FROM tmp_redis_pending_matches AS pm
        JOIN tmp_redis_sport_courts AS sc
          ON sc.event_date = day_record.event_date
          AND sc.sport_id = pm.sport_id
          AND sc.court_count > 0
      );

      current_slot := current_slot + 1;
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM tmp_redis_pending_matches) THEN
    RAISE EXCEPTION 'Dias insuficientes na agenda: há jogos cuja modalidade não possui quadra nos dias configurados.';
  END IF;

  DROP TABLE IF EXISTS tmp_redis_assignment_queue_positions;
  CREATE TEMP TABLE tmp_redis_assignment_queue_positions (
    match_id UUID PRIMARY KEY,
    new_queue_position INTEGER NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_redis_assignment_queue_positions (match_id, new_queue_position)
  SELECT
    ordered_assignments.match_id,
    ordered_assignments.new_queue_position
  FROM (
    SELECT
      a.match_id,
      CASE
        WHEN s.code = 'BEACH_SOCCER' THEN
          ROW_NUMBER() OVER (
            PARTITION BY a.sport_id, a.division
            ORDER BY a.new_scheduled_date ASC, a.new_scheduled_slot ASC, a.match_id ASC
          )
        ELSE
          ROW_NUMBER() OVER (
            PARTITION BY a.sport_id, a.naipe, a.division
            ORDER BY a.new_scheduled_date ASC, a.new_scheduled_slot ASC, a.match_id ASC
          )
      END::INTEGER AS new_queue_position
    FROM tmp_redis_assignments AS a
    JOIN public.sports AS s
      ON s.id = a.sport_id
  ) AS ordered_assignments;

  PERFORM set_config('app.skip_queue_trigger', 'true', true);

  UPDATE public.matches AS m
  SET
    scheduled_date = a.new_scheduled_date,
    scheduled_slot = a.new_scheduled_slot,
    queue_position = q.new_queue_position
  FROM tmp_redis_assignments AS a
  JOIN tmp_redis_assignment_queue_positions AS q
    ON q.match_id = a.match_id
  WHERE m.id = a.match_id
    AND (
      m.scheduled_date IS DISTINCT FROM a.new_scheduled_date
      OR m.scheduled_slot IS DISTINCT FROM a.new_scheduled_slot
      OR m.queue_position IS DISTINCT FROM q.new_queue_position
    );

  PERFORM set_config('app.skip_queue_trigger', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bracket_day_schedule(
  _bracket_edition_id UUID,
  _schedule_updates JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_championship_id UUID;
  v_update JSONB;
  v_break JSONB;
  v_day_id UUID;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar agenda do chaveamento.';
  END IF;

  SELECT cbe.championship_id
  INTO v_championship_id
  FROM public.championship_bracket_editions AS cbe
  JOIN public.championships AS c ON c.id = cbe.championship_id
  WHERE cbe.id = _bracket_edition_id
    AND c.status = 'UPCOMING'::public.championship_status
  LIMIT 1;

  IF v_championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição de chaveamento inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  FOR v_update IN SELECT * FROM jsonb_array_elements(_schedule_updates) LOOP
    SELECT id INTO v_day_id
    FROM public.championship_bracket_days
    WHERE bracket_edition_id = _bracket_edition_id
      AND event_date = (v_update->>'date')::date
    LIMIT 1;

    IF v_day_id IS NULL THEN
      RAISE EXCEPTION 'Dia % não encontrado na edição do chaveamento.', v_update->>'date';
    END IF;

    IF (v_update->>'end_time')::time <= (v_update->>'start_time')::time THEN
      RAISE EXCEPTION 'Horário de fim deve ser maior que o horário de início para o dia %.', v_update->>'date';
    END IF;

    UPDATE public.championship_bracket_days
    SET
      start_time = (v_update->>'start_time')::time,
      end_time = (v_update->>'end_time')::time,
      break_start_time = CASE
        WHEN jsonb_array_length(COALESCE(v_update->'breaks', '[]'::jsonb)) > 0
          THEN ((v_update->'breaks'->0)->>'break_start_time')::time
        ELSE NULL
      END,
      break_end_time = CASE
        WHEN jsonb_array_length(COALESCE(v_update->'breaks', '[]'::jsonb)) > 0
          THEN ((v_update->'breaks'->0)->>'break_end_time')::time
        ELSE NULL
      END
    WHERE id = v_day_id;

    DELETE FROM public.championship_bracket_day_breaks
    WHERE bracket_day_id = v_day_id;

    FOR v_break IN SELECT * FROM jsonb_array_elements(COALESCE(v_update->'breaks', '[]'::jsonb)) LOOP
      INSERT INTO public.championship_bracket_day_breaks (
        bracket_day_id,
        break_start_time,
        break_end_time,
        position
      )
      VALUES (
        v_day_id,
        (v_break->>'break_start_time')::time,
        (v_break->>'break_end_time')::time,
        COALESCE((v_break->>'position')::integer, 1)
      );
    END LOOP;
  END LOOP;

  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bracket_court_priorities(
  _bracket_edition_id UUID,
  _court_priorities JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_championship_id UUID;
  v_item JSONB;
  v_court_id UUID;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para editar prioridades de quadras.';
  END IF;

  SELECT cbe.championship_id
  INTO v_championship_id
  FROM public.championship_bracket_editions AS cbe
  JOIN public.championships AS c ON c.id = cbe.championship_id
  WHERE cbe.id = _bracket_edition_id
    AND c.status = 'UPCOMING'::public.championship_status
  LIMIT 1;

  IF v_championship_id IS NULL THEN
    RAISE EXCEPTION 'Edição inválida ou campeonato fora do status Configurando campeonato.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_court_priorities, '[]'::jsonb)) LOOP
    v_court_id := (v_item->>'bracket_court_id')::uuid;

    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_courts AS courts_table
      JOIN public.championship_bracket_locations AS locations_table
        ON locations_table.id = courts_table.bracket_location_id
      JOIN public.championship_bracket_days AS days_table
        ON days_table.id = locations_table.bracket_day_id
      WHERE courts_table.id = v_court_id
        AND days_table.bracket_edition_id = _bracket_edition_id
    ) THEN
      RAISE EXCEPTION 'Quadra não pertence a esta edição do chaveamento.';
    END IF;

    UPDATE public.championship_bracket_court_sports
    SET
      preferred_naipe = NULLIF(trim(COALESCE(v_item->>'preferred_naipe', '')), '')::public.match_naipe,
      preferred_division = NULLIF(trim(COALESCE(v_item->>'preferred_division', '')), '')::public.team_division
    WHERE bracket_court_id = v_court_id
      AND sport_id = (v_item->>'sport_id')::uuid;
  END LOOP;

  PERFORM public.redistribute_bracket_scheduled_matches(_bracket_edition_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redistribute_bracket_scheduled_matches(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redistribute_bracket_scheduled_matches(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redistribute_bracket_scheduled_matches(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.update_bracket_day_schedule(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bracket_court_priorities(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
