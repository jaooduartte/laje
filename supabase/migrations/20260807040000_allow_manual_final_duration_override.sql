CREATE OR REPLACE FUNCTION public.get_championship_knockout_final_program_schedule(
  _bracket_edition_id uuid
)
RETURNS TABLE(
  competition_id uuid,
  sport_id uuid,
  naipe match_naipe,
  division team_division,
  scheduled_date date,
  schedule_period championship_schedule_period,
  location_name text,
  court_name text,
  location_group_id uuid,
  court_group_id uuid,
  bracket_day_id uuid,
  bracket_court_id uuid,
  display_order integer,
  naipe_position integer,
  expected_final_round integer,
  duration_minutes integer,
  planned_start_at timestamp with time zone,
  planned_end_at timestamp with time zone,
  planned_scheduled_slot integer,
  planned_queue_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  edition_record RECORD;

  program_block_record JSONB;
  program_block_ordinality BIGINT;
  naipe_sequence_record RECORD;

  resolved_sport_id UUID;
  resolved_naipe public.match_naipe;

  resolved_division_scope
    public.bracket_knockout_division_scope;

  resolved_competition_id UUID;
  resolved_division public.team_division;
  resolved_expected_final_round INTEGER;

  resolved_duration_minutes INTEGER;
  resolved_duration_override_minutes INTEGER;
  resolved_duration_override_numeric NUMERIC;

  matching_competitions_count INTEGER;

  resolved_scheduled_date DATE;

  resolved_period
    public.championship_schedule_period;

  resolved_location_name TEXT;
  resolved_court_name TEXT;

  resolved_location_group_id UUID;
  resolved_court_group_id UUID;
  resolved_bracket_day_id UUID;
  resolved_bracket_court_id UUID;

  resolved_display_order INTEGER;
  resolved_naipe_position INTEGER;

  resolved_day_start_time TIME;
  resolved_day_end_time TIME;
  resolved_day_break_start_time TIME;
  resolved_day_break_end_time TIME;

  resolved_day_start_at TIMESTAMPTZ;
  resolved_day_end_at TIMESTAMPTZ;
  resolved_day_middle_at TIMESTAMPTZ;

  resolved_period_start_at TIMESTAMPTZ;
  resolved_period_end_at TIMESTAMPTZ;

  resolved_next_day_start_at TIMESTAMPTZ;

  resolved_period_enabled BOOLEAN;

  schedule_entry_record RECORD;

  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;

  existing_conflict_end_at TIMESTAMPTZ;
  programmed_final_conflict_end_at TIMESTAMPTZ;

  resolved_start_at TIMESTAMPTZ;
  resolved_end_at TIMESTAMPTZ;
BEGIN
  SELECT
    editions_table.id,
    editions_table.championship_id,
    editions_table.season_year,
    editions_table.payload_snapshot
  INTO edition_record
  FROM public.championship_bracket_editions
    AS editions_table
  WHERE editions_table.id = _bracket_edition_id
  LIMIT 1;

  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION
      'Edição de chaveamento inválida para calcular os blocos de finais.';
  END IF;

  DROP TABLE IF EXISTS
    tmp_championship_final_program_schedule;

  CREATE TEMP TABLE
    tmp_championship_final_program_schedule (
      row_id BIGSERIAL PRIMARY KEY,

      competition_id UUID NOT NULL,
      sport_id UUID NOT NULL,
      naipe public.match_naipe NOT NULL,
      division public.team_division NULL,

      scheduled_date DATE NOT NULL,

      schedule_period
        public.championship_schedule_period
        NOT NULL,

      location_name TEXT NOT NULL,
      court_name TEXT NOT NULL,

      location_group_id UUID NOT NULL,
      court_group_id UUID NOT NULL,
      bracket_day_id UUID NOT NULL,
      bracket_court_id UUID NOT NULL,

      block_ordinality INTEGER NOT NULL,
      display_order INTEGER NOT NULL,
      naipe_position INTEGER NOT NULL,

      expected_final_round INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,

      period_start_at TIMESTAMPTZ NOT NULL,
      period_end_at TIMESTAMPTZ NOT NULL,

      planned_start_at TIMESTAMPTZ NULL,
      planned_end_at TIMESTAMPTZ NULL
    )
  ON COMMIT DROP;

  IF jsonb_typeof(
    edition_record.payload_snapshot
      -> 'knockout_program_blocks'
  ) IS DISTINCT FROM 'array'
  THEN
    RETURN;
  END IF;

  FOR
    program_block_record,
    program_block_ordinality
  IN
    SELECT
      program_block.value,
      program_block.ordinality
    FROM jsonb_array_elements(
      edition_record.payload_snapshot
        -> 'knockout_program_blocks'
    )
    WITH ORDINALITY
      AS program_block(value, ordinality)
    WHERE COALESCE(
      program_block.value ->> 'phase',
      ''
    ) = 'FINAL'
  LOOP
    IF jsonb_typeof(program_block_record)
      IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION
        'Bloco de finais inválido na posição %.',
        program_block_ordinality;
    END IF;

    IF NULLIF(
      trim(
        COALESCE(
          program_block_record ->> 'sport_id',
          ''
        )
      ),
      ''
    ) IS NULL
    THEN
      RAISE EXCEPTION
        'Modalidade não informada no bloco de finais %.',
        program_block_ordinality;
    END IF;

    resolved_sport_id :=
      (
        program_block_record ->> 'sport_id'
      )::uuid;

    IF NULLIF(
      trim(
        COALESCE(
          program_block_record ->> 'date',
          ''
        )
      ),
      ''
    ) IS NULL
    THEN
      RAISE EXCEPTION
        'Data não informada no bloco de finais %.',
        program_block_ordinality;
    END IF;

    resolved_scheduled_date :=
      (
        program_block_record ->> 'date'
      )::date;

    resolved_location_name := NULLIF(
      trim(
        COALESCE(
          program_block_record ->> 'location_name',
          ''
        )
      ),
      ''
    );

    resolved_court_name := NULLIF(
      trim(
        COALESCE(
          program_block_record ->> 'court_name',
          ''
        )
      ),
      ''
    );

    IF resolved_location_name IS NULL
      OR resolved_court_name IS NULL
    THEN
      RAISE EXCEPTION
        'Local e quadra são obrigatórios no bloco de finais %.',
        program_block_ordinality;
    END IF;

    IF NULLIF(
      trim(
        COALESCE(
          program_block_record ->> 'period',
          ''
        )
      ),
      ''
    ) IS NULL
    THEN
      RAISE EXCEPTION
        'Período não informado no bloco de finais %.',
        program_block_ordinality;
    END IF;

    resolved_period :=
      (
        program_block_record ->> 'period'
      )::public.championship_schedule_period;

    resolved_division_scope :=
      COALESCE(
        NULLIF(
          trim(
            COALESCE(
              program_block_record
                ->> 'division_scope',
              ''
            )
          ),
          ''
        ),
        'ALL'
      )::public.bracket_knockout_division_scope;

    resolved_display_order := GREATEST(
      1,
      COALESCE(
        NULLIF(
          trim(
            COALESCE(
              program_block_record
                ->> 'display_order',
              ''
            )
          ),
          ''
        )::integer,
        program_block_ordinality::integer
      )
    );

    /*
     * Duração especial da final.
     *
     * Campo ausente ou JSON null:
     * usa a duração padrão da modalidade.
     *
     * Campo informado:
     * precisa ser um inteiro positivo.
     */
    resolved_duration_override_minutes := NULL;
    resolved_duration_override_numeric := NULL;

    IF
      program_block_record
        ? 'match_duration_minutes_override'
      AND jsonb_typeof(
        program_block_record
          -> 'match_duration_minutes_override'
      ) IS DISTINCT FROM 'null'
    THEN
      IF jsonb_typeof(
        program_block_record
          -> 'match_duration_minutes_override'
      ) IS DISTINCT FROM 'number'
      THEN
        RAISE EXCEPTION
          'A duração especial do bloco de finais % precisa ser um número inteiro maior que zero.',
          program_block_ordinality;
      END IF;

      BEGIN
        resolved_duration_override_numeric :=
          (
            program_block_record
              ->> 'match_duration_minutes_override'
          )::numeric;
      EXCEPTION
        WHEN invalid_text_representation
          OR numeric_value_out_of_range
        THEN
          RAISE EXCEPTION
            'A duração especial do bloco de finais % é inválida.',
            program_block_ordinality;
      END;

      IF
        resolved_duration_override_numeric <= 0
        OR resolved_duration_override_numeric <>
          trunc(resolved_duration_override_numeric)
        OR resolved_duration_override_numeric >
          2147483647
      THEN
        RAISE EXCEPTION
          'A duração especial do bloco de finais % precisa ser um número inteiro maior que zero.',
          program_block_ordinality;
      END IF;

      resolved_duration_override_minutes :=
        resolved_duration_override_numeric::integer;
    END IF;

    IF jsonb_typeof(
      program_block_record -> 'naipe_sequence'
    ) IS DISTINCT FROM 'array'
      OR jsonb_array_length(
        program_block_record -> 'naipe_sequence'
      ) = 0
    THEN
      RAISE EXCEPTION
        'O bloco de finais % não possui sequência de naipes.',
        program_block_ordinality;
    END IF;

    resolved_bracket_day_id := NULL;
    resolved_bracket_court_id := NULL;
    resolved_location_group_id := NULL;
    resolved_court_group_id := NULL;

    SELECT
      days_table.id,
      days_table.start_time,
      days_table.end_time,
      days_table.break_start_time,
      days_table.break_end_time,

      locations_table.name,
      locations_table.location_group_id,

      courts_table.id,
      courts_table.name,
      courts_table.court_group_id
    INTO
      resolved_bracket_day_id,
      resolved_day_start_time,
      resolved_day_end_time,
      resolved_day_break_start_time,
      resolved_day_break_end_time,

      resolved_location_name,
      resolved_location_group_id,

      resolved_bracket_court_id,
      resolved_court_name,
      resolved_court_group_id
    FROM public.championship_bracket_days
      AS days_table
    JOIN public.championship_bracket_locations
      AS locations_table
      ON locations_table.bracket_day_id =
        days_table.id
    JOIN public.championship_bracket_courts
      AS courts_table
      ON courts_table.bracket_location_id =
        locations_table.id
    WHERE days_table.bracket_edition_id =
        _bracket_edition_id
      AND days_table.event_date =
        resolved_scheduled_date
      AND public.normalize_bracket_entity_name(
        locations_table.name
      ) =
        public.normalize_bracket_entity_name(
          resolved_location_name
        )
      AND public.normalize_bracket_entity_name(
        courts_table.name
      ) =
        public.normalize_bracket_entity_name(
          resolved_court_name
        )
    LIMIT 1;

    IF resolved_bracket_day_id IS NULL
      OR resolved_bracket_court_id IS NULL
    THEN
      RAISE EXCEPTION
        'A quadra % • % não existe na agenda de %.',
        resolved_location_name,
        resolved_court_name,
        resolved_scheduled_date;
    END IF;

    /*
     * IMPORTANTE:
     *
     * Não validar championship_bracket_court_sports aqui.
     *
     * Um bloco manual de FINAL pode utilizar uma quadra
     * que não esteja vinculada à modalidade nas regras
     * normais da agenda.
     *
     * Essa exceção existe somente nesta programação
     * manual de final.
     */

    resolved_period_enabled := NULL;

    SELECT
      COALESCE(
        (
          period_record.value ->> 'enabled'
        )::boolean,
        true
      )
    INTO resolved_period_enabled
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(
          edition_record.payload_snapshot
            -> 'schedule_periods'
        ) = 'array'
        THEN
          edition_record.payload_snapshot
            -> 'schedule_periods'
        ELSE
          '[]'::jsonb
      END
    ) AS period_record(value)
    WHERE (
      period_record.value ->> 'date'
    )::date = resolved_scheduled_date
      AND period_record.value ->> 'period' =
        resolved_period::text
    LIMIT 1;

    resolved_period_enabled :=
      COALESCE(resolved_period_enabled, true);

    IF NOT resolved_period_enabled THEN
      RAISE EXCEPTION
        'O período % está desativado em % e não pode receber o bloco de finais %.',
        resolved_period,
        resolved_scheduled_date,
        program_block_ordinality;
    END IF;

    resolved_day_start_at :=
      public.combine_bracket_schedule_timestamp(
        resolved_scheduled_date,
        resolved_day_start_time
      );

    resolved_day_end_at :=
      public.combine_bracket_schedule_timestamp(
        resolved_scheduled_date,
        resolved_day_end_time
      );

    resolved_day_middle_at :=
      resolved_day_start_at
      + (
        (
          resolved_day_end_at
          - resolved_day_start_at
        ) / 2.0
      );

    IF resolved_period =
      'MATUTINO'::public.championship_schedule_period
    THEN
      resolved_period_start_at :=
        resolved_day_start_at;

      resolved_period_end_at :=
        CASE
          WHEN resolved_day_break_start_time
            IS NOT NULL
            AND resolved_day_break_start_time >
              resolved_day_start_time
          THEN
            public.combine_bracket_schedule_timestamp(
              resolved_scheduled_date,
              resolved_day_break_start_time
            )
          ELSE
            resolved_day_middle_at
        END;
    ELSE
      resolved_period_start_at :=
        CASE
          WHEN resolved_day_break_end_time
            IS NOT NULL
            AND resolved_day_break_end_time <
              resolved_day_end_time
          THEN
            public.combine_bracket_schedule_timestamp(
              resolved_scheduled_date,
              resolved_day_break_end_time
            )
          ELSE
            resolved_day_middle_at
        END;

      resolved_period_end_at :=
        resolved_day_end_at;
    END IF;

    IF resolved_period_start_at >=
      resolved_period_end_at
    THEN
      RAISE EXCEPTION
        'O período % de % não possui uma janela válida para iniciar as finais.',
        resolved_period,
        resolved_scheduled_date;
    END IF;

    resolved_next_day_start_at :=
      public.combine_bracket_schedule_timestamp(
        resolved_scheduled_date + 1,
        time '00:00'
      );

    FOR naipe_sequence_record IN
      SELECT
        naipe_record.value,
        naipe_record.ordinality::integer
          AS naipe_position
      FROM jsonb_array_elements_text(
        program_block_record -> 'naipe_sequence'
      )
      WITH ORDINALITY
        AS naipe_record(value, ordinality)
      ORDER BY naipe_record.ordinality ASC
    LOOP
      resolved_naipe :=
        naipe_sequence_record.value
          ::public.match_naipe;

      resolved_naipe_position :=
        naipe_sequence_record.naipe_position;

      SELECT COUNT(*)::integer
      INTO matching_competitions_count
      FROM public.championship_bracket_competitions
        AS competitions_table
      WHERE competitions_table.bracket_edition_id =
          _bracket_edition_id
        AND competitions_table.sport_id =
          resolved_sport_id
        AND competitions_table.naipe =
          resolved_naipe
        AND (
          (
            resolved_division_scope =
              'ALL'::public
                .bracket_knockout_division_scope
            AND competitions_table.division IS NULL
          )
          OR (
            resolved_division_scope =
              'DIVISAO_PRINCIPAL'::public
                .bracket_knockout_division_scope
            AND competitions_table.division =
              'DIVISAO_PRINCIPAL'::public
                .team_division
          )
          OR (
            resolved_division_scope =
              'DIVISAO_ACESSO'::public
                .bracket_knockout_division_scope
            AND competitions_table.division =
              'DIVISAO_ACESSO'::public
                .team_division
          )
        );

      IF matching_competitions_count = 0 THEN
        RAISE EXCEPTION
          'Não existe competição ativa para a final da modalidade %, naipe % e escopo %.',
          resolved_sport_id,
          resolved_naipe,
          resolved_division_scope;
      END IF;

      IF matching_competitions_count > 1 THEN
        RAISE EXCEPTION
          'Existe mais de uma competição correspondente à final da modalidade %, naipe % e escopo %.',
          resolved_sport_id,
          resolved_naipe,
          resolved_division_scope;
      END IF;

      SELECT
        competitions_table.id,
        competitions_table.division
      INTO
        resolved_competition_id,
        resolved_division
      FROM public.championship_bracket_competitions
        AS competitions_table
      WHERE competitions_table.bracket_edition_id =
          _bracket_edition_id
        AND competitions_table.sport_id =
          resolved_sport_id
        AND competitions_table.naipe =
          resolved_naipe
        AND (
          (
            resolved_division_scope =
              'ALL'::public
                .bracket_knockout_division_scope
            AND competitions_table.division IS NULL
          )
          OR (
            resolved_division_scope =
              'DIVISAO_PRINCIPAL'::public
                .bracket_knockout_division_scope
            AND competitions_table.division =
              'DIVISAO_PRINCIPAL'::public
                .team_division
          )
          OR (
            resolved_division_scope =
              'DIVISAO_ACESSO'::public
                .bracket_knockout_division_scope
            AND competitions_table.division =
              'DIVISAO_ACESSO'::public
                .team_division
          )
        )
      LIMIT 1;

      resolved_expected_final_round :=
        public
          .resolve_championship_competition_expected_knockout_rounds(
            resolved_competition_id
          );

      IF resolved_expected_final_round < 1 THEN
        RAISE EXCEPTION
          'A competição % não possui quantidade suficiente de classificados para uma final.',
          resolved_competition_id;
      END IF;

      resolved_duration_minutes :=
        COALESCE(
          resolved_duration_override_minutes,

          GREATEST(
            1,
            public.resolve_championship_sport_duration_minutes(
              edition_record.championship_id,
              resolved_sport_id
            )
          )
        );

      INSERT INTO
        tmp_championship_final_program_schedule (
          competition_id,
          sport_id,
          naipe,
          division,

          scheduled_date,
          schedule_period,

          location_name,
          court_name,

          location_group_id,
          court_group_id,
          bracket_day_id,
          bracket_court_id,

          block_ordinality,
          display_order,
          naipe_position,

          expected_final_round,
          duration_minutes,

          period_start_at,
          period_end_at
        )
      VALUES (
        resolved_competition_id,
        resolved_sport_id,
        resolved_naipe,
        resolved_division,

        resolved_scheduled_date,
        resolved_period,

        resolved_location_name,
        resolved_court_name,

        resolved_location_group_id,
        resolved_court_group_id,
        resolved_bracket_day_id,
        resolved_bracket_court_id,

        program_block_ordinality::integer,
        resolved_display_order,
        resolved_naipe_position,

        resolved_expected_final_round,
        resolved_duration_minutes,

        resolved_period_start_at,
        resolved_period_end_at
      );
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM tmp_championship_final_program_schedule
      AS final_program_table
    GROUP BY final_program_table.competition_id
    HAVING COUNT(*) > 1
  )
  THEN
    RAISE EXCEPTION
      'Uma mesma competição foi configurada em mais de um bloco de finais.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_championship_final_program_schedule
      AS final_program_table
    GROUP BY
      final_program_table.scheduled_date,
      final_program_table.bracket_court_id,
      final_program_table.schedule_period,
      final_program_table.display_order
    HAVING COUNT(
      DISTINCT final_program_table.block_ordinality
    ) > 1
  )
  THEN
    RAISE EXCEPTION
      'Existem dois blocos de finais com a mesma ordem na mesma quadra e período.';
  END IF;

  /*
   * Programa cada final em ordem.
   *
   * O período escolhido define somente o ponto inicial
   * mínimo da programação.
   *
   * Depois disso a final pode:
   * - atravessar o intervalo;
   * - ultrapassar o término do período;
   * - ultrapassar o end_time configurado do dia.
   *
   * Mas nunca pode:
   * - sobrepor outro jogo na mesma quadra;
   * - sobrepor outra final já programada;
   * - atravessar a meia-noite.
   */
  FOR schedule_entry_record IN
    SELECT final_program_table.*
    FROM tmp_championship_final_program_schedule
      AS final_program_table
    ORDER BY
      final_program_table.scheduled_date ASC,
      final_program_table.period_start_at ASC,
      final_program_table.location_name ASC,
      final_program_table.court_name ASC,
      final_program_table.display_order ASC,
      final_program_table.block_ordinality ASC,
      final_program_table.naipe_position ASC,
      final_program_table.row_id ASC
  LOOP
    /*
     * Jogos já concretos na mesma quadra precisam possuir
     * início e fim para podermos calcular intervalos.
     *
     * Finais que pertencem aos próprios blocos manuais
     * são excluídas daqui, pois serão recalculadas abaixo.
     */
    IF EXISTS (
      SELECT 1
      FROM public.matches AS matches_table
      JOIN public.championship_bracket_matches
        AS bracket_matches_table
        ON bracket_matches_table.match_id =
          matches_table.id
      WHERE bracket_matches_table
          .bracket_edition_id =
            _bracket_edition_id
        AND matches_table.scheduled_date =
          schedule_entry_record.scheduled_date
        AND public.normalize_bracket_entity_name(
          matches_table.location
        ) =
          public.normalize_bracket_entity_name(
            schedule_entry_record.location_name
          )
        AND public.normalize_bracket_entity_name(
          matches_table.court_name
        ) =
          public.normalize_bracket_entity_name(
            schedule_entry_record.court_name
          )
        AND NOT EXISTS (
          SELECT 1
          FROM
            tmp_championship_final_program_schedule
              AS configured_final_table
          WHERE configured_final_table.competition_id =
              bracket_matches_table.competition_id
            AND bracket_matches_table.phase =
              'KNOCKOUT'::public.bracket_phase
            AND bracket_matches_table.is_third_place =
              false
            AND bracket_matches_table.round_number =
              configured_final_table
                .expected_final_round
        )
        AND (
          matches_table.start_time IS NULL
          OR matches_table.end_time IS NULL
        )
    )
    THEN
      RAISE EXCEPTION
        'Existem jogos sem horário concreto em % • % no dia %. Redistribua a grade antes de programar as finais.',
        schedule_entry_record.location_name,
        schedule_entry_record.court_name,
        schedule_entry_record.scheduled_date;
    END IF;

    candidate_start_at :=
      schedule_entry_record.period_start_at;

    /*
     * Procura conflitos de intervalo.
     *
     * Diferente da grade normal, não utilizamos
     * resolve_bracket_court_next_available_start(),
     * pois finais manuais podem cruzar break e day_end.
     */
    LOOP
      candidate_end_at :=
        candidate_start_at
        + make_interval(
          mins =>
            schedule_entry_record.duration_minutes
        );

      IF candidate_end_at >=
        public.combine_bracket_schedule_timestamp(
          schedule_entry_record.scheduled_date + 1,
          time '00:00'
        )
      THEN
        RAISE EXCEPTION
          'A final de % em % • % ultrapassaria a meia-noite do dia %.',
          schedule_entry_record.naipe,
          schedule_entry_record.location_name,
          schedule_entry_record.court_name,
          schedule_entry_record.scheduled_date;
      END IF;

      existing_conflict_end_at := NULL;
      programmed_final_conflict_end_at := NULL;

      /*
       * Jogo já existente na mesma quadra cujo intervalo
       * cruza o candidato atual.
       */
      SELECT MAX(matches_table.end_time)
      INTO existing_conflict_end_at
      FROM public.matches AS matches_table
      JOIN public.championship_bracket_matches
        AS bracket_matches_table
        ON bracket_matches_table.match_id =
          matches_table.id
      WHERE bracket_matches_table.bracket_edition_id =
          _bracket_edition_id
        AND matches_table.scheduled_date =
          schedule_entry_record.scheduled_date
        AND public.normalize_bracket_entity_name(
          matches_table.location
        ) =
          public.normalize_bracket_entity_name(
            schedule_entry_record.location_name
          )
        AND public.normalize_bracket_entity_name(
          matches_table.court_name
        ) =
          public.normalize_bracket_entity_name(
            schedule_entry_record.court_name
          )
        AND matches_table.start_time IS NOT NULL
        AND matches_table.end_time IS NOT NULL
        AND matches_table.start_time <
          candidate_end_at
        AND matches_table.end_time >
          candidate_start_at
        AND NOT EXISTS (
          SELECT 1
          FROM
            tmp_championship_final_program_schedule
              AS configured_final_table
          WHERE configured_final_table.competition_id =
              bracket_matches_table.competition_id
            AND bracket_matches_table.phase =
              'KNOCKOUT'::public.bracket_phase
            AND bracket_matches_table.is_third_place =
              false
            AND bracket_matches_table.round_number =
              configured_final_table
                .expected_final_round
        );

      /*
       * Outra final manual já calculada anteriormente
       * no mesmo dia e na mesma quadra.
       */
      SELECT MAX(
        previous_final_table.planned_end_at
      )
      INTO programmed_final_conflict_end_at
      FROM tmp_championship_final_program_schedule
        AS previous_final_table
      WHERE previous_final_table.row_id <>
          schedule_entry_record.row_id
        AND previous_final_table.scheduled_date =
          schedule_entry_record.scheduled_date
        AND previous_final_table.bracket_court_id =
          schedule_entry_record.bracket_court_id
        AND previous_final_table.planned_start_at
          IS NOT NULL
        AND previous_final_table.planned_end_at
          IS NOT NULL
        AND previous_final_table.planned_start_at <
          candidate_end_at
        AND previous_final_table.planned_end_at >
          candidate_start_at;

      EXIT WHEN
        existing_conflict_end_at IS NULL
        AND programmed_final_conflict_end_at IS NULL;

      candidate_start_at := GREATEST(
        candidate_start_at,
        COALESCE(
          existing_conflict_end_at,
          candidate_start_at
        ),
        COALESCE(
          programmed_final_conflict_end_at,
          candidate_start_at
        )
      );
    END LOOP;

    resolved_start_at := candidate_start_at;

    resolved_end_at :=
      resolved_start_at
      + make_interval(
        mins =>
          schedule_entry_record.duration_minutes
      );

    /*
     * Único limite absoluto de encerramento:
     * a final precisa terminar antes do início
     * do próximo dia civil.
     *
     * 23:00 -> 00:00 também é rejeitado.
     */
    IF resolved_end_at >=
      public.combine_bracket_schedule_timestamp(
        schedule_entry_record.scheduled_date + 1,
        time '00:00'
      )
    THEN
      RAISE EXCEPTION
        'A final de % em % • % ultrapassaria a meia-noite do dia %.',
        schedule_entry_record.naipe,
        schedule_entry_record.location_name,
        schedule_entry_record.court_name,
        schedule_entry_record.scheduled_date;
    END IF;

    UPDATE
      tmp_championship_final_program_schedule
        AS final_program_table
    SET
      planned_start_at = resolved_start_at,
      planned_end_at = resolved_end_at
    WHERE final_program_table.row_id =
      schedule_entry_record.row_id;
  END LOOP;

  RETURN QUERY
  WITH numbered_finals AS (
    SELECT
      final_program_table.*,

      ROW_NUMBER() OVER (
        PARTITION BY
          final_program_table.scheduled_date
        ORDER BY
          final_program_table.planned_start_at ASC,
          final_program_table.location_name ASC,
          final_program_table.court_name ASC,
          final_program_table.display_order ASC,
          final_program_table.naipe_position ASC,
          final_program_table.row_id ASC
      )::integer AS final_day_position,

      ROW_NUMBER() OVER (
        PARTITION BY
          final_program_table.scheduled_date,
          final_program_table.sport_id,
          final_program_table.naipe,
          public.coerce_division_for_index(
            final_program_table.division
          )
        ORDER BY
          final_program_table.planned_start_at ASC,
          final_program_table.display_order ASC,
          final_program_table.naipe_position ASC,
          final_program_table.row_id ASC
      )::integer AS final_scope_position
    FROM tmp_championship_final_program_schedule
      AS final_program_table
  )
  SELECT
    numbered_finals.competition_id,
    numbered_finals.sport_id,
    numbered_finals.naipe,
    numbered_finals.division,

    numbered_finals.scheduled_date,
    numbered_finals.schedule_period,

    numbered_finals.location_name,
    numbered_finals.court_name,

    numbered_finals.location_group_id,
    numbered_finals.court_group_id,
    numbered_finals.bracket_day_id,
    numbered_finals.bracket_court_id,

    numbered_finals.display_order,
    numbered_finals.naipe_position,
    numbered_finals.expected_final_round,
    numbered_finals.duration_minutes,

    numbered_finals.planned_start_at,
    numbered_finals.planned_end_at,

    (
      COALESCE(
        (
          SELECT MAX(matches_table.scheduled_slot)
          FROM public.matches AS matches_table
          JOIN public.championship_bracket_matches
            AS bracket_matches_table
            ON bracket_matches_table.match_id =
              matches_table.id
          WHERE bracket_matches_table
              .bracket_edition_id =
                _bracket_edition_id
            AND matches_table.scheduled_date =
              numbered_finals.scheduled_date
            AND matches_table.start_time <=
              numbered_finals.planned_start_at
            AND NOT EXISTS (
              SELECT 1
              FROM
                tmp_championship_final_program_schedule
                  AS configured_final_table
              WHERE configured_final_table
                  .competition_id =
                    bracket_matches_table
                      .competition_id
                AND bracket_matches_table.phase =
                  'KNOCKOUT'::public.bracket_phase
                AND bracket_matches_table
                  .is_third_place = false
                AND bracket_matches_table
                  .round_number =
                    configured_final_table
                      .expected_final_round
            )
        ),
        0
      )
      + numbered_finals.final_day_position
    )::integer AS planned_scheduled_slot,

    (
      COALESCE(
        (
          SELECT MAX(matches_table.queue_position)
          FROM public.matches AS matches_table
          JOIN public.championship_bracket_matches
            AS bracket_matches_table
            ON bracket_matches_table.match_id =
              matches_table.id
          WHERE bracket_matches_table
              .bracket_edition_id =
                _bracket_edition_id
            AND matches_table.scheduled_date =
              numbered_finals.scheduled_date
            AND matches_table.sport_id =
              numbered_finals.sport_id
            AND matches_table.naipe =
              numbered_finals.naipe
            AND public.coerce_division_for_index(
              matches_table.division
            ) IS NOT DISTINCT FROM
              public.coerce_division_for_index(
                numbered_finals.division
              )
            AND NOT EXISTS (
              SELECT 1
              FROM
                tmp_championship_final_program_schedule
                  AS configured_final_table
              WHERE configured_final_table
                  .competition_id =
                    bracket_matches_table
                      .competition_id
                AND bracket_matches_table.phase =
                  'KNOCKOUT'::public.bracket_phase
                AND bracket_matches_table
                  .is_third_place = false
                AND bracket_matches_table
                  .round_number =
                    configured_final_table
                      .expected_final_round
            )
        ),
        0
      )
      + numbered_finals.final_scope_position
    )::integer AS planned_queue_position
  FROM numbered_finals
  ORDER BY
    numbered_finals.scheduled_date ASC,
    numbered_finals.planned_start_at ASC,
    numbered_finals.location_name ASC,
    numbered_finals.court_name ASC,
    numbered_finals.display_order ASC,
    numbered_finals.naipe_position ASC;
END;
$function$;