-- Preserva o comportamento existente por padrão e permite alternar a
-- prioridade de naipe depois de uma fase eliminatória exclusiva.
ALTER TABLE public.championship_bracket_court_sports
  ADD COLUMN IF NOT EXISTS
    alternate_naipe_after_exclusive_knockout_phase BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.championship_bracket_court_sports
  .alternate_naipe_after_exclusive_knockout_phase
IS
  'Em GROUP_NAIPE com dois naipes, a próxima fase eliminatória compartilhada começa pelo outro naipe depois de uma fase exclusiva.';

-- O payload da etapa 11 permanece como fonte única de verdade para a tabela
-- materializada usada pelo agendador.
CREATE OR REPLACE FUNCTION public.sync_bracket_court_sequence_mode_from_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_payload JSONB;
  resolved_event_date DATE;
  resolved_location_name TEXT;
  resolved_court_name TEXT;
  configured_preference JSONB;
  configured_preferred_sport_id UUID;
  configured_sequence_mode TEXT;
  configured_preferred_naipe TEXT;
  configured_preferred_division TEXT;
BEGIN
  SELECT editions_table.payload_snapshot, days_table.event_date,
    locations_table.name, courts_table.name
  INTO resolved_payload, resolved_event_date,
    resolved_location_name, resolved_court_name
  FROM public.championship_bracket_courts AS courts_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.id = courts_table.bracket_location_id
  JOIN public.championship_bracket_days AS days_table
    ON days_table.id = locations_table.bracket_day_id
  JOIN public.championship_bracket_editions AS editions_table
    ON editions_table.id = days_table.bracket_edition_id
  WHERE courts_table.id = NEW.bracket_court_id
  LIMIT 1;

  NEW.alternate_naipe_after_exclusive_knockout_phase := false;

  IF resolved_payload IS NULL OR resolved_event_date IS NULL THEN
    NEW.sequence_mode := 'FLEXIBLE'::public.bracket_court_sequence_mode;
    RETURN NEW;
  END IF;

  SELECT court_configuration.value -> 'sport_preference'
  INTO configured_preference
  FROM jsonb_array_elements(CASE
    WHEN jsonb_typeof(resolved_payload -> 'schedule_days') = 'array'
      THEN resolved_payload -> 'schedule_days'
    ELSE '[]'::jsonb
  END) AS day_configuration(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE
    WHEN jsonb_typeof(day_configuration.value -> 'locations') = 'array'
      THEN day_configuration.value -> 'locations'
    ELSE '[]'::jsonb
  END) AS location_configuration(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE
    WHEN jsonb_typeof(location_configuration.value -> 'courts') = 'array'
      THEN location_configuration.value -> 'courts'
    ELSE '[]'::jsonb
  END) AS court_configuration(value)
  WHERE day_configuration.value ->> 'date' = resolved_event_date::text
    AND public.normalize_bracket_entity_name(location_configuration.value ->> 'name') =
      public.normalize_bracket_entity_name(resolved_location_name)
    AND public.normalize_bracket_entity_name(court_configuration.value ->> 'name') =
      public.normalize_bracket_entity_name(resolved_court_name)
  LIMIT 1;

  IF jsonb_typeof(configured_preference) IS DISTINCT FROM 'object' THEN
    NEW.sequence_mode := 'FLEXIBLE'::public.bracket_court_sequence_mode;
    RETURN NEW;
  END IF;

  configured_preferred_sport_id := CASE
    WHEN NULLIF(trim(COALESCE(configured_preference ->> 'preferred_sport_id', '')), '') IS NULL
      THEN NULL
    ELSE (configured_preference ->> 'preferred_sport_id')::uuid
  END;

  IF configured_preferred_sport_id IS DISTINCT FROM NEW.sport_id THEN
    NEW.sequence_mode := 'FLEXIBLE'::public.bracket_court_sequence_mode;
    RETURN NEW;
  END IF;

  configured_sequence_mode := upper(trim(COALESCE(configured_preference ->> 'sequence_mode', 'FLEXIBLE')));
  configured_preferred_naipe := NULLIF(trim(COALESCE(configured_preference ->> 'preferred_naipe', '')), '');
  configured_preferred_division := NULLIF(trim(COALESCE(configured_preference ->> 'preferred_division', '')), '');

  IF configured_sequence_mode = 'GROUP_NAIPE'
    AND configured_preferred_naipe IN ('FEMININO', 'MASCULINO', 'MISTO') THEN
    NEW.sequence_mode := 'GROUP_NAIPE'::public.bracket_court_sequence_mode;
    NEW.preferred_naipe := configured_preferred_naipe::public.match_naipe;
    NEW.preferred_division := NULL;
    NEW.alternate_naipe_after_exclusive_knockout_phase :=
      COALESCE((configured_preference ->> 'alternate_naipe_after_exclusive_knockout_phase')::boolean, false);
  ELSIF configured_sequence_mode = 'GROUP_DIVISION'
    AND configured_preferred_division IN ('DIVISAO_PRINCIPAL', 'DIVISAO_ACESSO') THEN
    NEW.sequence_mode := 'GROUP_DIVISION'::public.bracket_court_sequence_mode;
    NEW.preferred_naipe := NULL;
    NEW.preferred_division := configured_preferred_division::public.team_division;
  ELSE
    NEW.sequence_mode := 'FLEXIBLE'::public.bracket_court_sequence_mode;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_bracket_court_sequence_mode_from_payload_trigger
  ON public.championship_bracket_court_sports;

CREATE TRIGGER sync_bracket_court_sequence_mode_from_payload_trigger
BEFORE INSERT OR UPDATE OF
  bracket_court_id, sport_id, preferred_naipe, preferred_division,
  sequence_mode, alternate_naipe_after_exclusive_knockout_phase
ON public.championship_bracket_court_sports
FOR EACH ROW
EXECUTE FUNCTION public.sync_bracket_court_sequence_mode_from_payload();

-- A prévia exata e a geração definitiva usam o mesmo redistribuidor. O patch
-- abaixo é aditivo e não altera a ordem de nenhuma preferência sem a flag.
DO $migration_alternate_naipe_after_exclusive_knockout_phase$
DECLARE
  function_definition TEXT;
  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'::regprocedure
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'A função redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;

  IF strpos(function_definition, 'strict_current_knockout_round') > 0 THEN
    RETURN;
  END IF;

  source_block := $source$
  strict_active_naipe public.match_naipe;
  strict_active_division public.team_division;
$source$;
  target_block := $target$
  strict_active_naipe public.match_naipe;
  strict_active_division public.team_division;
  strict_current_knockout_round INTEGER;
  strict_alternate_naipe_after_exclusive_knockout_phase BOOLEAN;
  strict_phase_naipes public.match_naipe[];
  strict_exclusive_knockout_naipe public.match_naipe;
$target$;
  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível adicionar o estado de alternância por naipe.';
  END IF;
  function_definition := replace(function_definition, source_block, target_block);

  source_block := $source$
    is_knockout BOOLEAN NOT NULL,
    preferred_knockout_court_group_id UUID NULL
$source$;
  target_block := $target$
    is_knockout BOOLEAN NOT NULL,
    knockout_round_number INTEGER NULL,
    preferred_knockout_court_group_id UUID NULL
$target$;
  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível adicionar o round eliminatório à fila.';
  END IF;
  function_definition := replace(function_definition, source_block, target_block);

  source_block := $source$
    created_at,
    is_knockout,
    preferred_knockout_court_group_id
$source$;
  target_block := $target$
    created_at,
    is_knockout,
    knockout_round_number,
    preferred_knockout_court_group_id
$target$;
  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível incluir o round eliminatório no INSERT da fila.';
  END IF;
  function_definition := replace(function_definition, source_block, target_block);

  source_block := $source$
    (
      bracket_matches_table.id IS NOT NULL
      AND bracket_matches_table.group_id IS NULL
    ) AS is_knockout,
    CASE
$source$;
  target_block := $target$
    (
      bracket_matches_table.id IS NOT NULL
      AND bracket_matches_table.group_id IS NULL
    ) AS is_knockout,
    CASE
      WHEN bracket_matches_table.id IS NOT NULL
        AND bracket_matches_table.group_id IS NULL
      THEN bracket_matches_table.round_number
      ELSE NULL
    END AS knockout_round_number,
    CASE
$target$;
  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível resolver o round eliminatório da fila.';
  END IF;
  function_definition := replace(function_definition, source_block, target_block);

  source_block := $source$
    has_reserved_division_pending := false;
    has_reserved_naipe_pending := false;

    SELECT EXISTS (
$source$;
  target_block := $target$
    has_reserved_division_pending := false;
    has_reserved_naipe_pending := false;
    strict_current_knockout_round := NULL;
    strict_alternate_naipe_after_exclusive_knockout_phase := false;
    strict_phase_naipes := ARRAY[]::public.match_naipe[];
    strict_exclusive_knockout_naipe := NULL;

    IF slot_record.sequence_mode =
        'GROUP_NAIPE'::public.bracket_court_sequence_mode
    THEN
      SELECT court_sports_table.alternate_naipe_after_exclusive_knockout_phase
      INTO strict_alternate_naipe_after_exclusive_knockout_phase
      FROM public.championship_bracket_court_sports AS court_sports_table
      WHERE court_sports_table.bracket_court_id = slot_record.court_id
        AND court_sports_table.sport_id = slot_record.sport_id
      LIMIT 1;

      IF COALESCE(strict_alternate_naipe_after_exclusive_knockout_phase, false) THEN
        SELECT MIN(pending_matches_table.knockout_round_number)
        INTO strict_current_knockout_round
        FROM tmp_global_pending_matches AS pending_matches_table
        WHERE pending_matches_table.sport_id = slot_record.sport_id
          AND pending_matches_table.is_knockout
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          );

        IF strict_current_knockout_round IS NOT NULL THEN
          SELECT ARRAY_AGG(DISTINCT pending_matches_table.naipe)
          INTO strict_phase_naipes
          FROM tmp_global_pending_matches AS pending_matches_table
          WHERE pending_matches_table.sport_id = slot_record.sport_id
            AND pending_matches_table.knockout_round_number = strict_current_knockout_round
            AND (
              pending_matches_table.preferred_knockout_court_group_id IS NULL
              OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
            );

          IF COALESCE(array_length(strict_phase_naipes, 1), 0) = 1 THEN
            strict_active_naipe := strict_phase_naipes[1];
          ELSIF COALESCE(array_length(strict_phase_naipes, 1), 0) = 2 THEN
            SELECT phase_summary.naipe
            INTO strict_exclusive_knockout_naipe
            FROM (
              SELECT
                previous_matches_table.round_number,
                MIN(previous_scheduled_matches_table.naipe)
                  AS naipe
              FROM public.championship_bracket_matches AS previous_matches_table
              JOIN public.matches AS previous_scheduled_matches_table
                ON previous_scheduled_matches_table.id = previous_matches_table.match_id
              WHERE previous_matches_table.bracket_edition_id = _bracket_edition_id
                AND previous_scheduled_matches_table.sport_id = slot_record.sport_id
                AND previous_matches_table.group_id IS NULL
                AND previous_matches_table.is_third_place = false
                AND previous_matches_table.round_number < strict_current_knockout_round
              GROUP BY previous_matches_table.round_number
              HAVING COUNT(DISTINCT previous_scheduled_matches_table.naipe) = 1
            ) AS phase_summary
            ORDER BY phase_summary.round_number DESC
            LIMIT 1;

            IF strict_exclusive_knockout_naipe IS NOT NULL THEN
              SELECT pending_matches_table.naipe
              INTO strict_active_naipe
              FROM tmp_global_pending_matches AS pending_matches_table
              WHERE pending_matches_table.sport_id = slot_record.sport_id
                AND pending_matches_table.knockout_round_number = strict_current_knockout_round
                AND pending_matches_table.naipe IS DISTINCT FROM strict_exclusive_knockout_naipe
              ORDER BY pending_matches_table.naipe
              LIMIT 1;
            END IF;
          END IF;

          strict_completed_naipes := ARRAY[]::public.match_naipe[];
        END IF;
      END IF;
    END IF;

    SELECT EXISTS (
$target$;
  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível iniciar a alternância na fase eliminatória.';
  END IF;
  function_definition := replace(function_definition, source_block, target_block);

  source_block := $source$
        CASE
          WHEN slot_record.sequence_mode = 'GROUP_DIVISION'::public.bracket_court_sequence_mode
            AND strict_active_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM strict_active_division THEN 1
          WHEN slot_record.sequence_mode = 'GROUP_NAIPE'::public.bracket_court_sequence_mode
            AND strict_active_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM strict_active_naipe THEN 1
          WHEN slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
            AND slot_record.primary_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM slot_record.primary_division THEN 1
          WHEN slot_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
            AND slot_record.primary_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM slot_record.primary_naipe THEN 1
          ELSE 0
        END ASC,
$source$;
  target_block := $target$
        CASE
          WHEN strict_current_knockout_round IS NOT NULL
            AND pending_matches_table.is_knockout
            AND pending_matches_table.knockout_round_number IS DISTINCT FROM strict_current_knockout_round THEN 1
          ELSE 0
        END ASC,
        CASE
          WHEN slot_record.sequence_mode = 'GROUP_DIVISION'::public.bracket_court_sequence_mode
            AND strict_active_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM strict_active_division THEN 1
          WHEN slot_record.sequence_mode = 'GROUP_NAIPE'::public.bracket_court_sequence_mode
            AND strict_active_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM strict_active_naipe THEN 1
          WHEN slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
            AND slot_record.primary_division IS NOT NULL
            AND pending_matches_table.division IS DISTINCT FROM slot_record.primary_division THEN 1
          WHEN slot_record.priority_mode = 'NAIPE'::public.bracket_court_priority_mode
            AND slot_record.primary_naipe IS NOT NULL
            AND pending_matches_table.naipe IS DISTINCT FROM slot_record.primary_naipe THEN 1
          ELSE 0
        END ASC,
$target$;
  IF strpos(function_definition, source_block) = 0 THEN
    RAISE EXCEPTION 'Não foi possível priorizar a rodada eliminatória atual.';
  END IF;
  function_definition := replace(function_definition, source_block, target_block);

  EXECUTE function_definition;
END;
$migration_alternate_naipe_after_exclusive_knockout_phase$;

NOTIFY pgrst, 'reload schema';
