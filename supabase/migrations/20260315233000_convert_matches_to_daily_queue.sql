ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS scheduled_date DATE NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS queue_position INTEGER NULL;

COMMENT ON COLUMN public.matches.scheduled_date IS 'Dia planejado da fila operacional da partida.';
COMMENT ON COLUMN public.matches.queue_position IS 'Posição da partida na fila do dia planejado.';
COMMENT ON COLUMN public.matches.start_time IS 'Horário real em que a partida começou.';
COMMENT ON COLUMN public.matches.end_time IS 'Horário real em que a partida terminou.';
COMMENT ON COLUMN public.matches.court_name IS 'Quadra real utilizada na operação da partida, definida no momento da execução.';

UPDATE public.matches AS matches_table
SET scheduled_date = timezone('America/Sao_Paulo', matches_table.start_time)::date
WHERE matches_table.scheduled_date IS NULL
  AND matches_table.start_time IS NOT NULL;

WITH ordered_matches AS (
  SELECT
    matches_table.id,
    row_number() OVER (
      PARTITION BY matches_table.championship_id, matches_table.season_year, matches_table.scheduled_date
      ORDER BY
        COALESCE(matches_table.start_time, matches_table.created_at) ASC,
        matches_table.created_at ASC,
        matches_table.id ASC
    ) AS resolved_queue_position
  FROM public.matches AS matches_table
  WHERE matches_table.scheduled_date IS NOT NULL
)
UPDATE public.matches AS matches_table
SET queue_position = ordered_matches.resolved_queue_position
FROM ordered_matches
WHERE ordered_matches.id = matches_table.id
  AND matches_table.queue_position IS NULL;

UPDATE public.matches AS matches_table
SET
  start_time = NULL,
  end_time = NULL,
  court_name = NULL
WHERE matches_table.status = 'SCHEDULED'::public.match_status
  AND matches_table.scheduled_date IS NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN start_time DROP NOT NULL;

ALTER TABLE public.matches
  ALTER COLUMN end_time DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_queue_position_positive'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_queue_position_positive
      CHECK (queue_position IS NULL OR queue_position > 0);
  END IF;
END
$$;

DROP INDEX IF EXISTS public.matches_championship_season_year_start_time_idx;

CREATE INDEX IF NOT EXISTS matches_championship_season_year_scheduled_date_idx
  ON public.matches (championship_id, season_year, scheduled_date, queue_position);

CREATE UNIQUE INDEX IF NOT EXISTS matches_championship_season_year_queue_position_uidx
  ON public.matches (championship_id, season_year, scheduled_date, queue_position)
  WHERE scheduled_date IS NOT NULL AND queue_position IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Os times da partida devem ser diferentes.';
  END IF;

  IF NEW.status = 'SCHEDULED'::public.match_status THEN
    IF NEW.scheduled_date IS NULL THEN
      RAISE EXCEPTION 'Informe o dia da fila para partidas agendadas.';
    END IF;

    NEW.start_time := NULL;
    NEW.end_time := NULL;
    NEW.court_name := NULL;
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

CREATE OR REPLACE FUNCTION public.assign_match_queue_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status != 'SCHEDULED'::public.match_status OR NEW.scheduled_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
    OR NEW.championship_id IS DISTINCT FROM OLD.championship_id
    OR NEW.season_year IS DISTINCT FROM OLD.season_year
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.queue_position IS NULL THEN
    SELECT COALESCE(max(matches_table.queue_position), 0) + 1
    INTO NEW.queue_position
    FROM public.matches AS matches_table
    WHERE matches_table.championship_id = NEW.championship_id
      AND matches_table.season_year = NEW.season_year
      AND matches_table.scheduled_date = NEW.scheduled_date
      AND matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_match_queue_position_trigger ON public.matches;

CREATE TRIGGER assign_match_queue_position_trigger
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.assign_match_queue_position();

CREATE OR REPLACE FUNCTION public.validate_mesa_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.home_score < 0
    OR NEW.away_score < 0
    OR NEW.home_yellow_cards < 0
    OR NEW.away_yellow_cards < 0
    OR NEW.home_red_cards < 0
    OR NEW.away_red_cards < 0 THEN
    RAISE EXCEPTION 'Placar e cartões não podem ser negativos.';
  END IF;

  IF public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true) THEN
    RETURN NEW;
  END IF;

  IF NEW.championship_id != OLD.championship_id
    OR NEW.sport_id != OLD.sport_id
    OR NEW.home_team_id != OLD.home_team_id
    OR NEW.away_team_id != OLD.away_team_id
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
    OR NEW.division IS DISTINCT FROM OLD.division
    OR NEW.naipe IS DISTINCT FROM OLD.naipe
    OR NEW.supports_cards IS DISTINCT FROM OLD.supports_cards
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Perfil com acesso ao Controle ao Vivo pode alterar apenas placar, cartões, status, quadra real e horários reais da partida.';
  END IF;

  IF OLD.status = 'FINISHED'::public.match_status
    AND NEW.status != 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'Partida encerrada não pode voltar para outro status.';
  END IF;

  IF OLD.status = 'SCHEDULED'::public.match_status
    AND NEW.status = 'FINISHED'::public.match_status THEN
    RAISE EXCEPTION 'A partida precisa iniciar antes de ser encerrada.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_championship_knockout_match_schedule(
  _championship_id UUID,
  _bracket_match_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bracket_match_record RECORD;
  selected_queue_date DATE;
  selected_location_name TEXT;
  new_match_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,
    editions_table.season_year
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  JOIN public.championship_bracket_competitions AS competitions_table
    ON competitions_table.id = bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id = _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF bracket_match_record.match_id IS NOT NULL THEN
    RETURN bracket_match_record.match_id;
  END IF;

  IF bracket_match_record.home_team_id IS NULL OR bracket_match_record.away_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    schedule_candidates.event_date,
    schedule_candidates.location_name
  INTO
    selected_queue_date,
    selected_location_name
  FROM (
    SELECT DISTINCT
      days_table.event_date,
      days_table.start_time,
      locations_table.position,
      locations_table.name AS location_name
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = bracket_match_record.bracket_edition_id
      AND court_sports_table.sport_id = bracket_match_record.sport_id
  ) AS schedule_candidates
  ORDER BY
    schedule_candidates.event_date ASC,
    schedule_candidates.start_time ASC,
    schedule_candidates.position ASC,
    schedule_candidates.location_name ASC
  LIMIT 1;

  IF selected_queue_date IS NULL OR selected_location_name IS NULL THEN
    RAISE EXCEPTION 'Não há local compatível configurado para gerar a fila do mata-mata nesta modalidade.';
  END IF;

  INSERT INTO public.matches (
    championship_id,
    division,
    naipe,
    sport_id,
    home_team_id,
    away_team_id,
    location,
    court_name,
    scheduled_date,
    queue_position,
    start_time,
    end_time,
    season_year,
    status
  ) VALUES (
    _championship_id,
    bracket_match_record.division,
    bracket_match_record.naipe,
    bracket_match_record.sport_id,
    bracket_match_record.home_team_id,
    bracket_match_record.away_team_id,
    selected_location_name,
    NULL,
    selected_queue_date,
    NULL,
    NULL,
    NULL,
    bracket_match_record.season_year,
    'SCHEDULED'::public.match_status
  )
  RETURNING id INTO new_match_id;

  UPDATE public.championship_bracket_matches
  SET match_id = new_match_id
  WHERE id = _bracket_match_id;

  RETURN new_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_championship_bracket_groups(
  _championship_id UUID,
  _payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_variable
DECLARE
  bracket_edition_id UUID;
  participant_record JSONB;
  modality_record JSONB;
  competition_record JSONB;
  group_record JSONB;
  schedule_day_record JSONB;
  location_record JSONB;
  court_record JSONB;
  court_sport_record JSONB;
  competition_id UUID;
  group_id UUID;
  bracket_day_id UUID;
  bracket_location_id UUID;
  bracket_court_id UUID;
  team_id UUID;
  sport_id UUID;
  naipe_value public.match_naipe;
  division_value public.team_division;
  groups_count_value INTEGER;
  qualifiers_per_group_value INTEGER;
  third_place_mode_value public.bracket_third_place_mode;
  normalized_location_name TEXT;
  normalized_court_name TEXT;
  new_match_id UUID;
  group_team_ids UUID[];
  group_team_count INTEGER;
  min_group_size INTEGER;
  max_group_size INTEGER;
  current_group_size INTEGER;
  competition_match_slot INTEGER;
  existing_matches_count INTEGER;
  championship_uses_divisions BOOLEAN;
  championship_current_season_year INTEGER;
  group_number_value INTEGER;
  group_match_slot INTEGER;
  pending_group_match_record RECORD;
  selected_queue_date DATE;
  selected_location_name TEXT;
  sport_name TEXT;
BEGIN
  IF NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para gerar chaveamento.';
  END IF;

  SELECT
    championships_table.uses_divisions,
    championships_table.current_season_year
  INTO
    championship_uses_divisions,
    championship_current_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
    AND championships_table.status = 'PLANNING'::public.championship_status
  LIMIT 1;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido ou fora do status Em breve.';
  END IF;

  SELECT count(*)
  INTO existing_matches_count
  FROM public.matches AS matches_table
  WHERE matches_table.championship_id = _championship_id
    AND matches_table.season_year = championship_current_season_year;

  IF existing_matches_count > 0 THEN
    RAISE EXCEPTION 'Este campeonato já possui jogos cadastrados. A geração automática exige campeonato sem jogos.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'participants', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'participants', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma atlética participante informada.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'competitions', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'competitions', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma configuração de competição informada.';
  END IF;

  IF jsonb_typeof(COALESCE(_payload->'schedule_days', '[]'::jsonb)) != 'array'
    OR jsonb_array_length(COALESCE(_payload->'schedule_days', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhuma janela de agenda informada.';
  END IF;

  INSERT INTO public.championship_bracket_editions (
    championship_id,
    season_year,
    status,
    payload_snapshot,
    created_by
  ) VALUES (
    _championship_id,
    championship_current_season_year,
    'DRAFT'::public.bracket_edition_status,
    COALESCE(_payload, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO bracket_edition_id;

  FOR participant_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'participants', '[]'::jsonb))
  LOOP
    team_id := (participant_record->>'team_id')::uuid;

    INSERT INTO public.championship_bracket_team_registrations (
      bracket_edition_id,
      team_id
    ) VALUES (
      bracket_edition_id,
      team_id
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_team_registrations_upsert_unique
    DO NOTHING;

    FOR modality_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(participant_record->'modalities', '[]'::jsonb))
    LOOP
      sport_id := (modality_record->>'sport_id')::uuid;
      naipe_value := (modality_record->>'naipe')::public.match_naipe;
      division_value := CASE
        WHEN trim(COALESCE(modality_record->>'division', '')) = '' THEN NULL
        ELSE (modality_record->>'division')::public.team_division
      END;

      IF championship_uses_divisions AND division_value IS NULL THEN
        RAISE EXCEPTION 'Divisão é obrigatória para campeonatos que usam divisões.';
      END IF;

      IF NOT championship_uses_divisions THEN
        division_value := NULL;
      END IF;

      INSERT INTO public.championship_bracket_team_modalities (
        bracket_edition_id,
        team_id,
        sport_id,
        naipe,
        division
      ) VALUES (
        bracket_edition_id,
        team_id,
        sport_id,
        naipe_value,
        division_value
      )
      ON CONFLICT ON CONSTRAINT championship_bracket_team_modalities_upsert_unique
      DO NOTHING;
    END LOOP;
  END LOOP;

  FOR competition_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'competitions', '[]'::jsonb))
  LOOP
    sport_id := (competition_record->>'sport_id')::uuid;
    naipe_value := (competition_record->>'naipe')::public.match_naipe;
    division_value := CASE
      WHEN trim(COALESCE(competition_record->>'division', '')) = '' THEN NULL
      ELSE (competition_record->>'division')::public.team_division
    END;
    groups_count_value := GREATEST(1, COALESCE((competition_record->>'groups_count')::integer, 1));
    qualifiers_per_group_value := GREATEST(1, COALESCE((competition_record->>'qualifiers_per_group')::integer, 1));
    third_place_mode_value := COALESCE(
      (competition_record->>'third_place_mode')::public.bracket_third_place_mode,
      'NONE'::public.bracket_third_place_mode
    );

    IF championship_uses_divisions AND division_value IS NULL THEN
      RAISE EXCEPTION 'Divisão é obrigatória para configuração da competição.';
    END IF;

    IF NOT championship_uses_divisions THEN
      division_value := NULL;
    END IF;

    INSERT INTO public.championship_bracket_competitions (
      bracket_edition_id,
      sport_id,
      naipe,
      division,
      groups_count,
      qualifiers_per_group,
      third_place_mode
    ) VALUES (
      bracket_edition_id,
      sport_id,
      naipe_value,
      division_value,
      groups_count_value,
      qualifiers_per_group_value,
      third_place_mode_value
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_competitions_upsert_unique
    DO UPDATE SET
      groups_count = EXCLUDED.groups_count,
      qualifiers_per_group = EXCLUDED.qualifiers_per_group,
      third_place_mode = EXCLUDED.third_place_mode
    RETURNING id INTO competition_id;

    min_group_size := 2147483647;
    max_group_size := 0;

    FOR group_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(competition_record->'groups', '[]'::jsonb))
    LOOP
      INSERT INTO public.championship_bracket_groups (
        competition_id,
        group_number
      ) VALUES (
        competition_id,
        GREATEST(1, COALESCE((group_record->>'group_number')::integer, 1))
      )
      ON CONFLICT ON CONSTRAINT championship_bracket_groups_upsert_unique
      DO UPDATE SET group_number = EXCLUDED.group_number
      RETURNING id INTO group_id;

      current_group_size := 0;

      FOR modality_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(group_record->'team_ids', '[]'::jsonb))
      LOOP
        team_id := trim(both '"' from modality_record::text)::uuid;

        INSERT INTO public.championship_bracket_group_teams (
          group_id,
          team_id,
          position
        ) VALUES (
          group_id,
          team_id,
          current_group_size + 1
        )
        ON CONFLICT ON CONSTRAINT championship_bracket_group_teams_upsert_unique
        DO UPDATE SET position = EXCLUDED.position;

        current_group_size := current_group_size + 1;
      END LOOP;

      IF current_group_size < 2 THEN
        RAISE EXCEPTION 'Cada chave precisa ter no mínimo 2 atléticas.';
      END IF;

      min_group_size := LEAST(min_group_size, current_group_size);
      max_group_size := GREATEST(max_group_size, current_group_size);
    END LOOP;

    IF min_group_size = 2147483647 THEN
      RAISE EXCEPTION 'Nenhuma chave configurada para a competição.';
    END IF;

    IF max_group_size - min_group_size > 1 THEN
      RAISE EXCEPTION 'Distribuição inválida: diferença entre chaves não pode ser maior que 1.';
    END IF;
  END LOOP;

  FOR schedule_day_record IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(_payload->'schedule_days', '[]'::jsonb))
  LOOP
    INSERT INTO public.championship_bracket_days (
      bracket_edition_id,
      event_date,
      start_time,
      end_time,
      break_start_time,
      break_end_time
    ) VALUES (
      bracket_edition_id,
      (schedule_day_record->>'date')::date,
      (schedule_day_record->>'start_time')::time,
      (schedule_day_record->>'end_time')::time,
      CASE
        WHEN trim(COALESCE(schedule_day_record->>'break_start_time', '')) = '' THEN NULL
        ELSE (schedule_day_record->>'break_start_time')::time
      END,
      CASE
        WHEN trim(COALESCE(schedule_day_record->>'break_end_time', '')) = '' THEN NULL
        ELSE (schedule_day_record->>'break_end_time')::time
      END
    )
    ON CONFLICT ON CONSTRAINT championship_bracket_days_upsert_unique
    DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      break_start_time = EXCLUDED.break_start_time,
      break_end_time = EXCLUDED.break_end_time
    RETURNING id INTO bracket_day_id;

    FOR location_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(schedule_day_record->'locations', '[]'::jsonb))
    LOOP
      normalized_location_name := trim(COALESCE(location_record->>'name', ''));

      IF normalized_location_name = '' THEN
        RAISE EXCEPTION 'Local inválido na configuração de agenda.';
      END IF;

      INSERT INTO public.championship_bracket_locations (
        bracket_day_id,
        name,
        position
      ) VALUES (
        bracket_day_id,
        normalized_location_name,
        GREATEST(1, COALESCE((location_record->>'position')::integer, 1))
      )
      ON CONFLICT ON CONSTRAINT championship_bracket_locations_upsert_unique
      DO UPDATE SET position = EXCLUDED.position
      RETURNING id INTO bracket_location_id;

      FOR court_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(location_record->'courts', '[]'::jsonb))
      LOOP
        normalized_court_name := trim(COALESCE(court_record->>'name', ''));

        IF normalized_court_name = '' THEN
          RAISE EXCEPTION 'Quadra inválida na configuração de agenda.';
        END IF;

        INSERT INTO public.championship_bracket_courts (
          bracket_location_id,
          name,
          position
        ) VALUES (
          bracket_location_id,
          normalized_court_name,
          GREATEST(1, COALESCE((court_record->>'position')::integer, 1))
        )
        ON CONFLICT ON CONSTRAINT championship_bracket_courts_upsert_unique
        DO UPDATE SET position = EXCLUDED.position
        RETURNING id INTO bracket_court_id;

        FOR court_sport_record IN
          SELECT value
          FROM jsonb_array_elements(COALESCE(court_record->'sport_ids', '[]'::jsonb))
        LOOP
          INSERT INTO public.championship_bracket_court_sports (
            bracket_court_id,
            sport_id
          ) VALUES (
            bracket_court_id,
            trim(both '"' from court_sport_record::text)::uuid
          )
          ON CONFLICT ON CONSTRAINT championship_bracket_court_sports_upsert_unique
          DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  CREATE TEMP TABLE IF NOT EXISTS temp_pending_group_matches (
    competition_id UUID NOT NULL,
    group_id UUID NOT NULL,
    group_number INTEGER NOT NULL,
    naipe public.match_naipe NOT NULL,
    naipe_priority INTEGER NOT NULL,
    group_match_slot INTEGER NOT NULL,
    competition_slot_number INTEGER NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL
  ) ON COMMIT DROP;

  FOR sport_id, division_value IN
    SELECT
      competitions_table.sport_id,
      competitions_table.division
    FROM public.championship_bracket_competitions AS competitions_table
    WHERE competitions_table.bracket_edition_id = bracket_edition_id
    GROUP BY competitions_table.sport_id, competitions_table.division
    ORDER BY min(competitions_table.created_at) ASC, competitions_table.sport_id ASC, competitions_table.division ASC NULLS FIRST
  LOOP
    TRUNCATE temp_pending_group_matches;

    FOR competition_id, naipe_value IN
      SELECT
        competitions_table.id,
        competitions_table.naipe
      FROM public.championship_bracket_competitions AS competitions_table
      WHERE competitions_table.bracket_edition_id = bracket_edition_id
        AND competitions_table.sport_id = sport_id
        AND competitions_table.division IS NOT DISTINCT FROM division_value
      ORDER BY
        CASE competitions_table.naipe
          WHEN 'MASCULINO'::public.match_naipe THEN 1
          WHEN 'FEMININO'::public.match_naipe THEN 2
          WHEN 'MISTO'::public.match_naipe THEN 3
          ELSE 4
        END ASC,
        competitions_table.created_at ASC,
        competitions_table.id ASC
    LOOP
      competition_match_slot := 1;

      FOR group_id, group_number_value IN
        SELECT
          groups_table.id,
          groups_table.group_number
        FROM public.championship_bracket_groups AS groups_table
        WHERE groups_table.competition_id = competition_id
        ORDER BY groups_table.group_number ASC
      LOOP
        SELECT array_agg(group_teams_table.team_id ORDER BY group_teams_table.position ASC)
        INTO group_team_ids
        FROM public.championship_bracket_group_teams AS group_teams_table
        WHERE group_teams_table.group_id = group_id;

        group_team_count := COALESCE(cardinality(group_team_ids), 0);

        IF group_team_count < 2 THEN
          RAISE EXCEPTION 'Grupo inválido: é necessário no mínimo duas atléticas por grupo.';
        END IF;

        group_match_slot := 1;

        FOR existing_matches_count IN 1..group_team_count - 1
        LOOP
          FOR qualifiers_per_group_value IN existing_matches_count + 1..group_team_count
          LOOP
            INSERT INTO temp_pending_group_matches (
              competition_id,
              group_id,
              group_number,
              naipe,
              naipe_priority,
              group_match_slot,
              competition_slot_number,
              home_team_id,
              away_team_id
            ) VALUES (
              competition_id,
              group_id,
              group_number_value,
              naipe_value,
              CASE naipe_value
                WHEN 'MASCULINO'::public.match_naipe THEN 1
                WHEN 'FEMININO'::public.match_naipe THEN 2
                WHEN 'MISTO'::public.match_naipe THEN 3
                ELSE 4
              END,
              group_match_slot,
              competition_match_slot,
              group_team_ids[existing_matches_count],
              group_team_ids[qualifiers_per_group_value]
            );

            group_match_slot := group_match_slot + 1;
            competition_match_slot := competition_match_slot + 1;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;

    FOR pending_group_match_record IN
      SELECT
        pending_group_matches_table.competition_id,
        pending_group_matches_table.group_id,
        pending_group_matches_table.group_number,
        pending_group_matches_table.naipe,
        pending_group_matches_table.competition_slot_number,
        pending_group_matches_table.home_team_id,
        pending_group_matches_table.away_team_id
      FROM temp_pending_group_matches AS pending_group_matches_table
      ORDER BY
        pending_group_matches_table.group_match_slot ASC,
        pending_group_matches_table.group_number ASC,
        pending_group_matches_table.naipe_priority ASC,
        pending_group_matches_table.competition_slot_number ASC
    LOOP
      competition_id := pending_group_match_record.competition_id;
      group_id := pending_group_match_record.group_id;
      naipe_value := pending_group_match_record.naipe;
      competition_match_slot := pending_group_match_record.competition_slot_number;
      group_team_ids := ARRAY[
        pending_group_match_record.home_team_id,
        pending_group_match_record.away_team_id
      ];

      SELECT
        schedule_candidates.event_date,
        schedule_candidates.location_name
      INTO
        selected_queue_date,
        selected_location_name
      FROM (
        SELECT DISTINCT
          days_table.event_date,
          days_table.start_time,
          locations_table.position,
          locations_table.name AS location_name
        FROM public.championship_bracket_days AS days_table
        JOIN public.championship_bracket_locations AS locations_table
          ON locations_table.bracket_day_id = days_table.id
        JOIN public.championship_bracket_courts AS courts_table
          ON courts_table.bracket_location_id = locations_table.id
        JOIN public.championship_bracket_court_sports AS court_sports_table
          ON court_sports_table.bracket_court_id = courts_table.id
        WHERE days_table.bracket_edition_id = bracket_edition_id
          AND court_sports_table.sport_id = sport_id
      ) AS schedule_candidates
      ORDER BY
        schedule_candidates.event_date ASC,
        schedule_candidates.start_time ASC,
        schedule_candidates.position ASC,
        schedule_candidates.location_name ASC
      LIMIT 1;

      IF selected_queue_date IS NULL OR selected_location_name IS NULL THEN
        SELECT COALESCE(sports_table.name, sport_id::text)
        INTO sport_name
        FROM public.sports AS sports_table
        WHERE sports_table.id = sport_id
        LIMIT 1;

        RAISE EXCEPTION 'Não há local compatível configurado para a modalidade %.', sport_name;
      END IF;

      INSERT INTO public.matches (
        championship_id,
        division,
        naipe,
        sport_id,
        home_team_id,
        away_team_id,
        location,
        court_name,
        scheduled_date,
        queue_position,
        start_time,
        end_time,
        season_year,
        status
      ) VALUES (
        _championship_id,
        division_value,
        naipe_value,
        sport_id,
        group_team_ids[1],
        group_team_ids[2],
        selected_location_name,
        NULL,
        selected_queue_date,
        NULL,
        NULL,
        NULL,
        championship_current_season_year,
        'SCHEDULED'::public.match_status
      )
      RETURNING id INTO new_match_id;

      INSERT INTO public.championship_bracket_matches (
        bracket_edition_id,
        competition_id,
        group_id,
        phase,
        round_number,
        slot_number,
        match_id,
        home_team_id,
        away_team_id
      ) VALUES (
        bracket_edition_id,
        competition_id,
        group_id,
        'GROUP_STAGE'::public.bracket_phase,
        1,
        competition_match_slot,
        new_match_id,
        group_team_ids[1],
        group_team_ids[2]
      );
    END LOOP;
  END LOOP;

  UPDATE public.championship_bracket_editions
  SET
    status = 'GROUPS_GENERATED'::public.bracket_edition_status,
    updated_at = now()
  WHERE id = bracket_edition_id;

  UPDATE public.championships
  SET status = 'UPCOMING'::public.championship_status
  WHERE id = _championship_id;

  RETURN bracket_edition_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_championship_bracket_view(UUID);

CREATE OR REPLACE FUNCTION public.get_championship_bracket_view(
  _championship_id UUID,
  _season_year INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  response JSONB;
  resolved_season_year INTEGER;
BEGIN
  SELECT COALESCE(
    _season_year,
    championships_table.current_season_year,
    date_part('year', timezone('America/Sao_Paulo', now()))::integer
  )
  INTO resolved_season_year
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id
  LIMIT 1;

  IF resolved_season_year IS NULL THEN
    resolved_season_year := date_part('year', timezone('America/Sao_Paulo', now()))::integer;
  END IF;

  WITH latest_edition AS (
    SELECT editions_table.id
    FROM public.championship_bracket_editions AS editions_table
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = resolved_season_year
    ORDER BY editions_table.created_at DESC
    LIMIT 1
  ),
  competitions AS (
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.groups_count,
      competitions_table.qualifiers_per_group,
      competitions_table.third_place_mode,
      sports_table.name AS sport_name
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN latest_edition
      ON latest_edition.id = competitions_table.bracket_edition_id
    JOIN public.sports AS sports_table
      ON sports_table.id = competitions_table.sport_id
  ),
  groups AS (
    SELECT
      groups_table.id,
      groups_table.competition_id,
      groups_table.group_number,
      jsonb_agg(
        jsonb_build_object(
          'team_id', teams_table.id,
          'team_name', teams_table.name,
          'team_city', teams_table.city,
          'position', group_teams_table.position
        )
        ORDER BY group_teams_table.position ASC
      ) AS teams
    FROM public.championship_bracket_groups AS groups_table
    JOIN public.championship_bracket_group_teams AS group_teams_table
      ON group_teams_table.group_id = groups_table.id
    JOIN public.teams AS teams_table
      ON teams_table.id = group_teams_table.team_id
    WHERE groups_table.competition_id IN (SELECT competitions.id FROM competitions)
    GROUP BY groups_table.id, groups_table.competition_id, groups_table.group_number
  ),
  bracket_matches AS (
    SELECT
      bracket_matches_table.id,
      bracket_matches_table.competition_id,
      bracket_matches_table.group_id,
      bracket_matches_table.phase,
      bracket_matches_table.round_number,
      bracket_matches_table.slot_number,
      bracket_matches_table.match_id,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id,
      bracket_matches_table.is_bye,
      bracket_matches_table.is_third_place,
      matches_table.status,
      matches_table.scheduled_date,
      matches_table.queue_position,
      matches_table.start_time,
      matches_table.end_time,
      matches_table.location,
      matches_table.court_name,
      home_teams_table.name AS home_team_name,
      away_teams_table.name AS away_team_name,
      winner_teams_table.name AS winner_team_name
    FROM public.championship_bracket_matches AS bracket_matches_table
    LEFT JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    LEFT JOIN public.teams AS home_teams_table
      ON home_teams_table.id = bracket_matches_table.home_team_id
    LEFT JOIN public.teams AS away_teams_table
      ON away_teams_table.id = bracket_matches_table.away_team_id
    LEFT JOIN public.teams AS winner_teams_table
      ON winner_teams_table.id = bracket_matches_table.winner_team_id
    WHERE bracket_matches_table.bracket_edition_id IN (SELECT latest_edition.id FROM latest_edition)
  )
  SELECT jsonb_build_object(
    'edition', (
      SELECT to_jsonb(editions_table)
      FROM public.championship_bracket_editions AS editions_table
      WHERE editions_table.id IN (SELECT latest_edition.id FROM latest_edition)
      LIMIT 1
    ),
    'competitions', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', competitions.id,
            'sport_id', competitions.sport_id,
            'sport_name', competitions.sport_name,
            'naipe', competitions.naipe,
            'division', competitions.division,
            'groups_count', competitions.groups_count,
            'qualifiers_per_group', competitions.qualifiers_per_group,
            'third_place_mode', competitions.third_place_mode,
            'groups', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', groups.id,
                    'group_number', groups.group_number,
                    'teams', groups.teams,
                    'matches', COALESCE(
                      (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', bracket_matches.id,
                            'match_id', bracket_matches.match_id,
                            'status', bracket_matches.status,
                            'scheduled_date', bracket_matches.scheduled_date,
                            'queue_position', bracket_matches.queue_position,
                            'start_time', bracket_matches.start_time,
                            'end_time', bracket_matches.end_time,
                            'location', bracket_matches.location,
                            'court_name', bracket_matches.court_name,
                            'home_team_id', bracket_matches.home_team_id,
                            'away_team_id', bracket_matches.away_team_id,
                            'home_team_name', bracket_matches.home_team_name,
                            'away_team_name', bracket_matches.away_team_name,
                            'winner_team_id', bracket_matches.winner_team_id,
                            'winner_team_name', bracket_matches.winner_team_name
                          )
                          ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                        )
                        FROM bracket_matches
                        WHERE bracket_matches.group_id = groups.id
                          AND bracket_matches.phase = 'GROUP_STAGE'::public.bracket_phase
                      ),
                      '[]'::jsonb
                    )
                  )
                  ORDER BY groups.group_number ASC
                )
                FROM groups
                WHERE groups.competition_id = competitions.id
              ),
              '[]'::jsonb
            ),
            'knockout_matches', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', bracket_matches.id,
                    'round_number', bracket_matches.round_number,
                    'slot_number', bracket_matches.slot_number,
                    'match_id', bracket_matches.match_id,
                    'status', bracket_matches.status,
                    'scheduled_date', bracket_matches.scheduled_date,
                    'queue_position', bracket_matches.queue_position,
                    'start_time', bracket_matches.start_time,
                    'end_time', bracket_matches.end_time,
                    'location', bracket_matches.location,
                    'court_name', bracket_matches.court_name,
                    'home_team_id', bracket_matches.home_team_id,
                    'away_team_id', bracket_matches.away_team_id,
                    'home_team_name', bracket_matches.home_team_name,
                    'away_team_name', bracket_matches.away_team_name,
                    'winner_team_id', bracket_matches.winner_team_id,
                    'winner_team_name', bracket_matches.winner_team_name,
                    'is_bye', bracket_matches.is_bye,
                    'is_third_place', bracket_matches.is_third_place
                  )
                  ORDER BY bracket_matches.round_number ASC, bracket_matches.slot_number ASC
                )
                FROM bracket_matches
                WHERE bracket_matches.competition_id = competitions.id
                  AND bracket_matches.phase = 'KNOCKOUT'::public.bracket_phase
              ),
              '[]'::jsonb
            )
          )
          ORDER BY competitions.sport_name ASC, competitions.naipe ASC, competitions.division ASC NULLS FIRST
        )
        FROM competitions
      ),
      '[]'::jsonb
    )
  )
  INTO response;

  RETURN COALESCE(
    response,
    jsonb_build_object(
      'edition', NULL,
      'competitions', '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.create_championship_knockout_match_schedule(UUID, UUID) IS 'Cria o jogo real do mata-mata como item de fila diária, sem horário planejado e com local fixo.';
COMMENT ON FUNCTION public.generate_championship_bracket_groups(UUID, JSONB) IS 'Cria edição de chaveamento por temporada e gera a fase de grupos em fila diária, sem horários planejados por partida.';
COMMENT ON FUNCTION public.get_championship_bracket_view(UUID, INTEGER) IS 'Retorna a visão consolidada do chaveamento com fila diária, horário real e local planejado por temporada.';

NOTIFY pgrst, 'reload schema';
