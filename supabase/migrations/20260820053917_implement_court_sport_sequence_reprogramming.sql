-- ============================================================
-- 1. Permite ALTERNATE_NAIPE na combinação de preferências
-- ============================================================

ALTER TABLE public.championship_bracket_court_sports
  DROP CONSTRAINT IF EXISTS
    championship_bracket_court_sports_sequence_mode_preferences_check;

ALTER TABLE public.championship_bracket_court_sports
  ADD CONSTRAINT
    championship_bracket_court_sports_sequence_mode_preferences_check
  CHECK (
    sequence_mode =
      'FLEXIBLE'::public.bracket_court_sequence_mode

    OR (
      sequence_mode IN (
        'GROUP_NAIPE'::public.bracket_court_sequence_mode,
        'ALTERNATE_NAIPE'::public.bracket_court_sequence_mode
      )
      AND preferred_naipe IS NOT NULL
      AND preferred_division IS NULL
    )

    OR (
      sequence_mode =
        'GROUP_DIVISION'::public.bracket_court_sequence_mode
      AND preferred_division IS NOT NULL
      AND preferred_naipe IS NULL
    )
  );

-- ============================================================
-- 2. Permite que uma reprogramação explícita ignore
--    temporariamente o snapshot da etapa 11
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.sync_bracket_court_sequence_mode_from_payload()
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
  /*
   * Alterações normais continuam protegidas pelo payload_snapshot.
   *
   * Somente a RPC de reprogramação pode ativar este flag dentro
   * da própria transação.
   */
  IF current_setting(
    'app.allow_court_sequence_reprogramming',
    true
  ) = 'true'
  THEN
    RETURN NEW;
  END IF;

  SELECT
    editions_table.payload_snapshot,
    days_table.event_date,
    locations_table.name,
    courts_table.name
  INTO
    resolved_payload,
    resolved_event_date,
    resolved_location_name,
    resolved_court_name
  FROM public.championship_bracket_courts
    AS courts_table
  JOIN public.championship_bracket_locations
    AS locations_table
    ON locations_table.id =
      courts_table.bracket_location_id
  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.id =
      locations_table.bracket_day_id
  JOIN public.championship_bracket_editions
    AS editions_table
    ON editions_table.id =
      days_table.bracket_edition_id
  WHERE courts_table.id =
    NEW.bracket_court_id
  LIMIT 1;

  NEW.alternate_naipe_after_exclusive_knockout_phase :=
    false;

  IF resolved_payload IS NULL
    OR resolved_event_date IS NULL
  THEN
    NEW.sequence_mode :=
      'FLEXIBLE'::public.bracket_court_sequence_mode;

    RETURN NEW;
  END IF;

  configured_preference := NULL;

  SELECT
    court_configuration.value
      -> 'sport_preference'
  INTO configured_preference
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        resolved_payload -> 'schedule_days'
      ) = 'array'
      THEN resolved_payload -> 'schedule_days'
      ELSE '[]'::jsonb
    END
  ) AS day_configuration(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        day_configuration.value -> 'locations'
      ) = 'array'
      THEN day_configuration.value -> 'locations'
      ELSE '[]'::jsonb
    END
  ) AS location_configuration(value)

  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        location_configuration.value -> 'courts'
      ) = 'array'
      THEN location_configuration.value -> 'courts'
      ELSE '[]'::jsonb
    END
  ) AS court_configuration(value)

  WHERE
    day_configuration.value ->> 'date' =
      resolved_event_date::text

    AND public.normalize_bracket_entity_name(
      location_configuration.value ->> 'name'
    ) =
      public.normalize_bracket_entity_name(
        resolved_location_name
      )

    AND public.normalize_bracket_entity_name(
      court_configuration.value ->> 'name'
    ) =
      public.normalize_bracket_entity_name(
        resolved_court_name
      )

  LIMIT 1;

  IF jsonb_typeof(configured_preference)
    IS DISTINCT FROM 'object'
  THEN
    NEW.sequence_mode :=
      'FLEXIBLE'::public.bracket_court_sequence_mode;

    RETURN NEW;
  END IF;

  configured_preferred_sport_id := CASE
    WHEN NULLIF(
      trim(
        COALESCE(
          configured_preference
            ->> 'preferred_sport_id',
          ''
        )
      ),
      ''
    ) IS NULL
    THEN NULL

    ELSE (
      configured_preference
        ->> 'preferred_sport_id'
    )::uuid
  END;

  IF configured_preferred_sport_id
    IS DISTINCT FROM NEW.sport_id
  THEN
    NEW.sequence_mode :=
      'FLEXIBLE'::public.bracket_court_sequence_mode;

    RETURN NEW;
  END IF;

  configured_sequence_mode := upper(
    trim(
      COALESCE(
        configured_preference
          ->> 'sequence_mode',
        'FLEXIBLE'
      )
    )
  );

  configured_preferred_naipe := NULLIF(
    trim(
      COALESCE(
        configured_preference
          ->> 'preferred_naipe',
        ''
      )
    ),
    ''
  );

  configured_preferred_division := NULLIF(
    trim(
      COALESCE(
        configured_preference
          ->> 'preferred_division',
        ''
      )
    ),
    ''
  );

  IF configured_sequence_mode = 'GROUP_NAIPE'
    AND configured_preferred_naipe IN (
      'FEMININO',
      'MASCULINO',
      'MISTO'
    )
  THEN
    NEW.sequence_mode :=
      'GROUP_NAIPE'
        ::public.bracket_court_sequence_mode;

    NEW.preferred_naipe :=
      configured_preferred_naipe
        ::public.match_naipe;

    NEW.preferred_division := NULL;

    NEW.alternate_naipe_after_exclusive_knockout_phase :=
      COALESCE(
        (
          configured_preference
            ->> 'alternate_naipe_after_exclusive_knockout_phase'
        )::boolean,
        false
      );

  ELSIF configured_sequence_mode =
      'GROUP_DIVISION'
    AND configured_preferred_division IN (
      'DIVISAO_PRINCIPAL',
      'DIVISAO_ACESSO'
    )
  THEN
    NEW.sequence_mode :=
      'GROUP_DIVISION'
        ::public.bracket_court_sequence_mode;

    NEW.preferred_naipe := NULL;

    NEW.preferred_division :=
      configured_preferred_division
        ::public.team_division;

  ELSE
    NEW.sequence_mode :=
      'FLEXIBLE'
        ::public.bracket_court_sequence_mode;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Reprogramming revision também observa court_sports
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.bump_championship_bracket_reprogramming_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edition_id_value UUID;
BEGIN
  edition_id_value := CASE TG_TABLE_NAME
    WHEN 'championship_bracket_competitions'
      THEN COALESCE(
        NEW.bracket_edition_id,
        OLD.bracket_edition_id
      )

    WHEN 'championship_bracket_location_sport_priorities'
      THEN COALESCE(
        NEW.bracket_edition_id,
        OLD.bracket_edition_id
      )

    WHEN 'championship_bracket_knockout_court_priorities'
      THEN COALESCE(
        NEW.bracket_edition_id,
        OLD.bracket_edition_id
      )

    WHEN 'championship_bracket_days'
      THEN COALESCE(
        NEW.bracket_edition_id,
        OLD.bracket_edition_id
      )

    ELSE NULL
  END;

  IF edition_id_value IS NULL
    AND TG_TABLE_NAME =
      'championship_bracket_day_breaks'
  THEN
    SELECT bracket_edition_id
    INTO edition_id_value
    FROM public.championship_bracket_days
    WHERE id = COALESCE(
      NEW.bracket_day_id,
      OLD.bracket_day_id
    );
  END IF;

  IF edition_id_value IS NULL
    AND TG_TABLE_NAME =
      'championship_bracket_locations'
  THEN
    SELECT days_table.bracket_edition_id
    INTO edition_id_value
    FROM public.championship_bracket_days
      AS days_table
    WHERE days_table.id = COALESCE(
      NEW.bracket_day_id,
      OLD.bracket_day_id
    );
  END IF;

  IF edition_id_value IS NULL
    AND TG_TABLE_NAME =
      'championship_bracket_courts'
  THEN
    SELECT days_table.bracket_edition_id
    INTO edition_id_value
    FROM public.championship_bracket_locations
      AS locations_table
    JOIN public.championship_bracket_days
      AS days_table
      ON days_table.id =
        locations_table.bracket_day_id
    WHERE locations_table.id = COALESCE(
      NEW.bracket_location_id,
      OLD.bracket_location_id
    );
  END IF;

  IF edition_id_value IS NULL
    AND TG_TABLE_NAME =
      'championship_bracket_court_sports'
  THEN
    SELECT days_table.bracket_edition_id
    INTO edition_id_value
    FROM public.championship_bracket_courts
      AS courts_table
    JOIN public.championship_bracket_locations
      AS locations_table
      ON locations_table.id =
        courts_table.bracket_location_id
    JOIN public.championship_bracket_days
      AS days_table
      ON days_table.id =
        locations_table.bracket_day_id
    WHERE courts_table.id = COALESCE(
      NEW.bracket_court_id,
      OLD.bracket_court_id
    );
  END IF;

  IF edition_id_value IS NOT NULL THEN
    UPDATE public.championship_bracket_editions
    SET
      reprogramming_revision =
        reprogramming_revision + 1
    WHERE id = edition_id_value;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS
  championship_bracket_court_sports_reprogramming_revision
ON public.championship_bracket_court_sports;

CREATE TRIGGER
  championship_bracket_court_sports_reprogramming_revision
AFTER INSERT OR UPDATE OR DELETE
ON public.championship_bracket_court_sports
FOR EACH ROW
EXECUTE FUNCTION
  public.bump_championship_bracket_reprogramming_revision();

-- ============================================================
-- 4. RPC específica da nova aba
-- ============================================================

CREATE OR REPLACE FUNCTION
  public.update_bracket_court_sequences(
    _bracket_edition_id UUID,
    _sequence_updates JSONB
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
  v_sport_id UUID;

  v_sequence_mode TEXT;

  v_preferred_naipe TEXT;
  v_preferred_division TEXT;

  v_location_group_id UUID;
BEGIN
  IF NOT public.has_admin_tab_access(
    'championship_schedule'
      ::public.admin_panel_tab,
    true
  )
  THEN
    RAISE EXCEPTION
      'Usuário sem permissão para reprogramar prioridades de quadra.';
  END IF;

  SELECT editions_table.championship_id
  INTO v_championship_id
  FROM public.championship_bracket_editions
    AS editions_table
  JOIN public.championships
    AS championships_table
    ON championships_table.id =
      editions_table.championship_id
  WHERE editions_table.id =
      _bracket_edition_id
    AND championships_table.status =
      'REVIEW'::public.championship_status
  LIMIT 1;

  IF v_championship_id IS NULL THEN
    RAISE EXCEPTION
      'A reprogramação só está disponível com o campeonato em revisão.';
  END IF;

  PERFORM set_config(
    'app.allow_court_sequence_reprogramming',
    'true',
    true
  );

  FOR v_item IN
    SELECT *
    FROM jsonb_array_elements(
      COALESCE(
        _sequence_updates,
        '[]'::jsonb
      )
    )
  LOOP
    v_court_id :=
      NULLIF(
        trim(
          COALESCE(
            v_item ->> 'bracket_court_id',
            ''
          )
        ),
        ''
      )::uuid;

    v_sport_id :=
      NULLIF(
        trim(
          COALESCE(
            v_item ->> 'sport_id',
            ''
          )
        ),
        ''
      )::uuid;

    v_sequence_mode :=
      upper(
        trim(
          COALESCE(
            v_item ->> 'sequence_mode',
            ''
          )
        )
      );

    v_preferred_naipe :=
      NULLIF(
        trim(
          COALESCE(
            v_item ->> 'preferred_naipe',
            ''
          )
        ),
        ''
      );

    v_preferred_division :=
      NULLIF(
        trim(
          COALESCE(
            v_item ->> 'preferred_division',
            ''
          )
        ),
        ''
      );

    IF v_court_id IS NULL
      OR v_sport_id IS NULL
    THEN
      RAISE EXCEPTION
        'Quadra ou modalidade inválida na reprogramação.';
    END IF;

    IF v_sequence_mode NOT IN (
      'FLEXIBLE',
      'GROUP_NAIPE',
      'ALTERNATE_NAIPE',
      'GROUP_DIVISION'
    )
    THEN
      RAISE EXCEPTION
        'Modo de sequenciamento inválido: %.',
        v_sequence_mode;
    END IF;

    IF v_sequence_mode IN (
      'GROUP_NAIPE',
      'ALTERNATE_NAIPE'
    )
    THEN
      IF v_preferred_naipe IS NULL
        OR v_preferred_naipe NOT IN (
          'FEMININO',
          'MASCULINO',
          'MISTO'
        )
      THEN
        RAISE EXCEPTION
          'Informe o naipe inicial para o sequenciamento por naipe.';
      END IF;

      v_preferred_division := NULL;

    ELSIF v_sequence_mode =
      'GROUP_DIVISION'
    THEN
      IF v_preferred_division IS NULL
        OR v_preferred_division NOT IN (
          'DIVISAO_PRINCIPAL',
          'DIVISAO_ACESSO'
        )
      THEN
        RAISE EXCEPTION
          'Informe a divisão inicial para o sequenciamento por divisão.';
      END IF;

      v_preferred_naipe := NULL;

    ELSE
      v_preferred_naipe := NULL;
      v_preferred_division := NULL;
    END IF;

    /*
     * Resolve e valida simultaneamente:
     *
     * - quadra pertence à edição;
     * - modalidade existe nessa quadra;
     * - modalidade é a modalidade principal
     *   definida para a quadra.
     */
    SELECT locations_table.location_group_id
    INTO v_location_group_id
    FROM public.championship_bracket_courts
      AS courts_table
    JOIN public.championship_bracket_locations
      AS locations_table
      ON locations_table.id =
        courts_table.bracket_location_id
    JOIN public.championship_bracket_days
      AS days_table
      ON days_table.id =
        locations_table.bracket_day_id
    JOIN public.championship_bracket_court_sports
      AS court_sports_table
      ON court_sports_table.bracket_court_id =
        courts_table.id
      AND court_sports_table.sport_id =
        v_sport_id
    WHERE courts_table.id =
        v_court_id
      AND days_table.bracket_edition_id =
        _bracket_edition_id
      AND courts_table.preferred_sport_id =
        v_sport_id
    LIMIT 1;

    IF v_location_group_id IS NULL THEN
      RAISE EXCEPTION
        'A modalidade não está definida como principal nesta quadra.';
    END IF;

    UPDATE public.championship_bracket_court_sports
      AS court_sports_table
    SET
      sequence_mode =
        v_sequence_mode
          ::public.bracket_court_sequence_mode,

      preferred_naipe = CASE
        WHEN v_preferred_naipe IS NULL
          THEN NULL
        ELSE
          v_preferred_naipe
            ::public.match_naipe
      END,

      preferred_division = CASE
        WHEN v_preferred_division IS NULL
          THEN NULL
        ELSE
          v_preferred_division
            ::public.team_division
      END,

      alternate_naipe_after_exclusive_knockout_phase =
        false

    WHERE court_sports_table.bracket_court_id =
        v_court_id
      AND court_sports_table.sport_id =
        v_sport_id;

    /*
     * A prioridade global antiga não deve interferir
     * quando a nova aba passa a controlar a quadra
     * diretamente.
     */
    DELETE FROM
      public.championship_bracket_location_sport_priorities
    WHERE bracket_edition_id =
        _bracket_edition_id
      AND location_group_id =
        v_location_group_id
      AND sport_id =
        v_sport_id;
  END LOOP;

  PERFORM set_config(
    'app.allow_court_sequence_reprogramming',
    'false',
    true
  );

  /*
   * Redistribui apenas uma vez após todas as alterações.
   */
  PERFORM public.redistribute_bracket_scheduled_matches(
    _bracket_edition_id
  );
END;
$$;

COMMENT ON FUNCTION
  public.update_bracket_court_sequences(
    UUID,
    JSONB
  )
IS
  'Reprograma o sequenciamento por modalidade na quadra principal durante REVIEW e redistribui a agenda uma única vez.';

-- ============================================================
-- 5. Adiciona COURT_SPORT_SEQUENCE ao executor seguro
--    sem sobrescrever ações adicionadas por migrations futuras
-- ============================================================

DO $migration_add_court_sport_sequence_action$
DECLARE
  function_definition TEXT;
  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.execute_championship_bracket_reconfiguration(uuid,text,jsonb)'
      ::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'execute_championship_bracket_reconfiguration não existe.';
  END IF;

  IF strpos(
    function_definition,
    'COURT_SPORT_SEQUENCE'
  ) > 0
  THEN
    RETURN;
  END IF;

  source_block :=
$source$
    WHEN 'KNOCKOUT_COURT_PRIORITIES' THEN
$source$;

  target_block :=
$target$
    WHEN 'COURT_SPORT_SEQUENCE' THEN
      PERFORM public.update_bracket_court_sequences(
        _bracket_edition_id,
        COALESCE(
          _payload->'sequence_updates',
          '[]'::jsonb
        )
      );

    WHEN 'KNOCKOUT_COURT_PRIORITIES' THEN
$target$;

  IF strpos(
    function_definition,
    source_block
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar KNOCKOUT_COURT_PRIORITIES no executor.';
  END IF;

  function_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );

  EXECUTE function_definition;
END;
$migration_add_court_sport_sequence_action$;

-- ============================================================
-- 6. Implementa alternância real de naipes no redistribuidor
-- ============================================================

DO $migration_implement_alternate_naipe$
DECLARE
  function_definition TEXT;
  source_block TEXT;
  target_block TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'
      ::regprocedure
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      'redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;

  IF strpos(
    function_definition,
    'alternate_naipe_sequence_priority'
  ) > 0
  THEN
    RETURN;
  END IF;

  source_block :=
$source$
        END ASC,
        CASE
          WHEN strict_current_knockout_round IS NOT NULL
$source$;

  target_block :=
$target$
        END ASC,

        /*
         * alternate_naipe_sequence_priority
         */

        CASE
          WHEN slot_record.sequence_mode =
              'ALTERNATE_NAIPE'
                ::public.bracket_court_sequence_mode
            AND slot_last_naipe IS NULL
            AND slot_record.primary_naipe IS NOT NULL
            AND pending_matches_table.naipe
              IS DISTINCT FROM
                slot_record.primary_naipe
          THEN 1

          WHEN slot_record.sequence_mode =
              'ALTERNATE_NAIPE'
                ::public.bracket_court_sequence_mode
            AND slot_last_naipe IS NOT NULL
            AND pending_matches_table.naipe
              IS NOT DISTINCT FROM
                slot_last_naipe
          THEN 1

          ELSE 0
        END ASC,

        CASE
          WHEN strict_current_knockout_round IS NOT NULL
$target$;

  IF strpos(
    function_definition,
    source_block
  ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível localizar o ponto de ordenação da fila para ALTERNATE_NAIPE.';
  END IF;

  function_definition :=
    replace(
      function_definition,
      source_block,
      target_block
    );

  EXECUTE function_definition;
END;
$migration_implement_alternate_naipe$;

NOTIFY pgrst, 'reload schema';
