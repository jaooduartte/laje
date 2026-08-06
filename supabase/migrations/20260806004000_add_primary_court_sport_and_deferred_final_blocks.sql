ALTER TABLE public.championship_bracket_courts
  ADD COLUMN IF NOT EXISTS preferred_sport_id UUID NULL;

DO $migration_add_preferred_sport_foreign_key$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'championship_bracket_courts_preferred_sport_id_fkey'
      AND conrelid =
        'public.championship_bracket_courts'::regclass
  ) THEN
    ALTER TABLE public.championship_bracket_courts
      ADD CONSTRAINT
        championship_bracket_courts_preferred_sport_id_fkey
      FOREIGN KEY (preferred_sport_id)
      REFERENCES public.sports(id)
      ON DELETE SET NULL;
  END IF;
END;
$migration_add_preferred_sport_foreign_key$;

CREATE INDEX IF NOT EXISTS
  championship_bracket_courts_preferred_sport_idx
ON public.championship_bracket_courts (
  preferred_sport_id
)
WHERE preferred_sport_id IS NOT NULL;

COMMENT ON COLUMN
  public.championship_bracket_courts.preferred_sport_id
IS
  'Modalidade preferencial da quadra neste dia. A preferência é flexível; preferred_naipe e preferred_division permanecem como refinamentos opcionais na linha correspondente de championship_bracket_court_sports.';

CREATE OR REPLACE FUNCTION
  public.resolve_championship_competition_expected_knockout_rounds(
    _competition_id UUID
  )
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  competition_record RECORD;
  group_count_value INTEGER;
  direct_qualified_team_count INTEGER;
  target_bracket_size INTEGER := 1;
  total_rounds INTEGER := 0;
BEGIN
  SELECT
    competitions_table.qualifiers_per_group,
    competitions_table
      .should_complete_knockout_with_best_second_placed_teams
  INTO competition_record
  FROM public.championship_bracket_competitions
    AS competitions_table
  WHERE competitions_table.id = _competition_id
  LIMIT 1;

  IF competition_record.qualifiers_per_group IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer
  INTO group_count_value
  FROM public.championship_bracket_groups
    AS groups_table
  WHERE groups_table.competition_id = _competition_id;

  direct_qualified_team_count := GREATEST(
    0,
    group_count_value
      * competition_record.qualifiers_per_group
  );

  IF competition_record.qualifiers_per_group = 1
    AND competition_record
      .should_complete_knockout_with_best_second_placed_teams =
        true
  THEN
    WHILE
      target_bracket_size <= direct_qualified_team_count
    LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  ELSE
    WHILE
      target_bracket_size < direct_qualified_team_count
    LOOP
      target_bracket_size := target_bracket_size * 2;
    END LOOP;
  END IF;

  IF target_bracket_size < 2 THEN
    RETURN 0;
  END IF;

  WHILE target_bracket_size > 1 LOOP
    target_bracket_size := target_bracket_size / 2;
    total_rounds := total_rounds + 1;
  END LOOP;

  RETURN total_rounds;
END;
$function$;

COMMENT ON FUNCTION
  public.resolve_championship_competition_expected_knockout_rounds(
    UUID
  )
IS
  'Resolve a quantidade final de rodadas do mata-mata sem depender de placeholders já materializados.';

REVOKE ALL ON FUNCTION
  public.resolve_championship_competition_expected_knockout_rounds(
    UUID
  )
FROM PUBLIC;

CREATE OR REPLACE FUNCTION
  public.sync_championship_bracket_court_sport_preferences(
    _bracket_edition_id UUID,
    _payload JSONB
  )
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  edition_record RECORD;
  schedule_day_record JSONB;
  location_record JSONB;
  court_record JSONB;
  resolved_bracket_court_id UUID;
  normalized_location_name TEXT;
  normalized_court_name TEXT;
  configured_sport_id UUID;
  resolved_preferred_sport_id UUID;
  resolved_preferred_naipe public.match_naipe;
  resolved_preferred_division public.team_division;
  uses_divisions BOOLEAN;
BEGIN
  SELECT
    editions_table.id,
    championships_table.uses_divisions
  INTO edition_record
  FROM public.championship_bracket_editions
    AS editions_table
  JOIN public.championships AS championships_table
    ON championships_table.id =
      editions_table.championship_id
  WHERE editions_table.id = _bracket_edition_id
  LIMIT 1;

  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION
      'Edição de chaveamento inválida para sincronizar preferências de quadra.';
  END IF;

  uses_divisions := CASE
    WHEN NULLIF(
      trim(
        COALESCE(
          _payload
            -> 'season_settings'
            ->> 'division_format',
          ''
        )
      ),
      ''
    ) = 'SEPARATED'
      THEN true

    WHEN NULLIF(
      trim(
        COALESCE(
          _payload
            -> 'season_settings'
            ->> 'division_format',
          ''
        )
      ),
      ''
    ) = 'UNIFIED'
      THEN false

    ELSE COALESCE(
      edition_record.uses_divisions,
      false
    )
  END;

  UPDATE public.championship_bracket_courts
    AS courts_table
  SET preferred_sport_id = NULL
  FROM
    public.championship_bracket_locations
      AS locations_table,
    public.championship_bracket_days
      AS days_table
  WHERE locations_table.id =
      courts_table.bracket_location_id
    AND days_table.id =
      locations_table.bracket_day_id
    AND days_table.bracket_edition_id =
      _bracket_edition_id;

  UPDATE public.championship_bracket_court_sports
    AS court_sports_table
  SET
    preferred_naipe = NULL,
    preferred_division = NULL
  FROM
    public.championship_bracket_courts
      AS courts_table,
    public.championship_bracket_locations
      AS locations_table,
    public.championship_bracket_days
      AS days_table
  WHERE courts_table.id =
      court_sports_table.bracket_court_id
    AND locations_table.id =
      courts_table.bracket_location_id
    AND days_table.id =
      locations_table.bracket_day_id
    AND days_table.bracket_edition_id =
      _bracket_edition_id;

  FOR schedule_day_record IN
    SELECT value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(
          _payload -> 'schedule_days'
        ) = 'array'
          THEN _payload -> 'schedule_days'
        ELSE '[]'::jsonb
      END
    )
  LOOP
    FOR location_record IN
      SELECT value
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(
            schedule_day_record -> 'locations'
          ) = 'array'
            THEN schedule_day_record -> 'locations'
          ELSE '[]'::jsonb
        END
      )
    LOOP
      normalized_location_name := NULLIF(
        trim(
          COALESCE(
            location_record ->> 'name',
            ''
          )
        ),
        ''
      );

      FOR court_record IN
        SELECT value
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(
              location_record -> 'courts'
            ) = 'array'
              THEN location_record -> 'courts'
            ELSE '[]'::jsonb
          END
        )
      LOOP
        normalized_court_name := NULLIF(
          trim(
            COALESCE(
              court_record ->> 'name',
              ''
            )
          ),
          ''
        );

        SELECT courts_table.id
        INTO resolved_bracket_court_id
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
            (
              schedule_day_record ->> 'date'
            )::date
          AND public.normalize_bracket_entity_name(
            locations_table.name
          ) =
            public.normalize_bracket_entity_name(
              normalized_location_name
            )
          AND public.normalize_bracket_entity_name(
            courts_table.name
          ) =
            public.normalize_bracket_entity_name(
              normalized_court_name
            )
        LIMIT 1;

        IF resolved_bracket_court_id IS NULL THEN
          RAISE EXCEPTION
            'Não foi possível localizar a quadra % • % em % para sincronizar a preferência.',
            normalized_location_name,
            normalized_court_name,
            schedule_day_record ->> 'date';
        END IF;

        resolved_preferred_sport_id := CASE
          WHEN jsonb_typeof(
            court_record -> 'sport_preference'
          ) = 'object'
            AND NULLIF(
              trim(
                COALESCE(
                  court_record
                    -> 'sport_preference'
                    ->> 'preferred_sport_id',
                  ''
                )
              ),
              ''
            ) IS NOT NULL
          THEN (
            court_record
              -> 'sport_preference'
              ->> 'preferred_sport_id'
          )::uuid
          ELSE NULL
        END;

        resolved_preferred_naipe := CASE
          WHEN resolved_preferred_sport_id
            IS NOT NULL
            AND NULLIF(
              trim(
                COALESCE(
                  court_record
                    -> 'sport_preference'
                    ->> 'preferred_naipe',
                  ''
                )
              ),
              ''
            ) IS NOT NULL
          THEN (
            court_record
              -> 'sport_preference'
              ->> 'preferred_naipe'
          )::public.match_naipe
          ELSE NULL
        END;

        resolved_preferred_division := CASE
          WHEN uses_divisions
            AND resolved_preferred_sport_id
              IS NOT NULL
            AND NULLIF(
              trim(
                COALESCE(
                  court_record
                    -> 'sport_preference'
                    ->> 'preferred_division',
                  ''
                )
              ),
              ''
            ) IS NOT NULL
          THEN (
            court_record
              -> 'sport_preference'
              ->> 'preferred_division'
          )::public.team_division
          ELSE NULL
        END;

        IF resolved_preferred_sport_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(
                  court_record -> 'sport_ids'
                ) = 'array'
                  THEN court_record -> 'sport_ids'
                ELSE '[]'::jsonb
              END
            ) AS configured_sport(value)
            WHERE configured_sport.value::uuid =
              resolved_preferred_sport_id
          )
        THEN
          RAISE EXCEPTION
            'A modalidade preferencial da quadra % não está vinculada à quadra.',
            normalized_court_name;
        END IF;

        IF resolved_preferred_sport_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM
              public.championship_bracket_competitions
                AS competitions_table
            WHERE competitions_table
                .bracket_edition_id =
                  _bracket_edition_id
              AND competitions_table.sport_id =
                resolved_preferred_sport_id
              AND (
                resolved_preferred_naipe IS NULL
                OR competitions_table.naipe =
                  resolved_preferred_naipe
              )
              AND (
                resolved_preferred_division IS NULL
                OR competitions_table.division =
                  resolved_preferred_division
              )
          )
        THEN
          RAISE EXCEPTION
            'A preferência configurada para a quadra % não possui competição ativa correspondente.',
            normalized_court_name;
        END IF;

        UPDATE public.championship_bracket_courts
          AS courts_table
        SET
          preferred_sport_id =
            resolved_preferred_sport_id
        WHERE courts_table.id =
          resolved_bracket_court_id;

        DELETE FROM
          public.championship_bracket_court_sports
            AS court_sports_table
        WHERE court_sports_table.bracket_court_id =
            resolved_bracket_court_id
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(
                  court_record -> 'sport_ids'
                ) = 'array'
                  THEN court_record -> 'sport_ids'
                ELSE '[]'::jsonb
              END
            ) AS configured_sport(value)
            WHERE configured_sport.value::uuid =
              court_sports_table.sport_id
          );

        FOR configured_sport_id IN
          SELECT configured_sport.value::uuid
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(
                court_record -> 'sport_ids'
              ) = 'array'
                THEN court_record -> 'sport_ids'
              ELSE '[]'::jsonb
            END
          ) AS configured_sport(value)
        LOOP
          INSERT INTO
            public.championship_bracket_court_sports (
              bracket_court_id,
              sport_id,
              preferred_naipe,
              preferred_division
            )
          VALUES (
            resolved_bracket_court_id,
            configured_sport_id,

            CASE
              WHEN configured_sport_id =
                resolved_preferred_sport_id
              THEN resolved_preferred_naipe
              ELSE NULL
            END,

            CASE
              WHEN configured_sport_id =
                resolved_preferred_sport_id
              THEN resolved_preferred_division
              ELSE NULL
            END
          )
          ON CONFLICT ON CONSTRAINT
            championship_bracket_court_sports_upsert_unique
          DO UPDATE SET
            preferred_naipe =
              EXCLUDED.preferred_naipe,
            preferred_division =
              EXCLUDED.preferred_division;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION
  public.sync_championship_bracket_court_sport_preferences(
    UUID,
    JSONB
  )
IS
  'Sincroniza preferred_sport_id e seus refinamentos opcionais a partir do payload da etapa 11.';

REVOKE ALL ON FUNCTION
  public.sync_championship_bracket_court_sport_preferences(
    UUID,
    JSONB
  )
FROM PUBLIC;

CREATE OR REPLACE FUNCTION
  public.get_championship_knockout_final_program_schedule(
    _bracket_edition_id UUID
  )
RETURNS TABLE (
  competition_id UUID,
  sport_id UUID,
  naipe public.match_naipe,
  division public.team_division,
  scheduled_date DATE,
  schedule_period public.championship_schedule_period,
  location_name TEXT,
  court_name TEXT,
  location_group_id UUID,
  court_group_id UUID,
  bracket_day_id UUID,
  bracket_court_id UUID,
  display_order INTEGER,
  naipe_position INTEGER,
  expected_final_round INTEGER,
  duration_minutes INTEGER,
  planned_start_at TIMESTAMPTZ,
  planned_end_at TIMESTAMPTZ,
  planned_scheduled_slot INTEGER,
  planned_queue_position INTEGER
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
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
  resolved_period_enabled BOOLEAN;

  schedule_entry_record RECORD;

  latest_existing_match_end_at TIMESTAMPTZ;
  latest_program_match_end_at TIMESTAMPTZ;
  candidate_start_at TIMESTAMPTZ;
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

    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_court_sports
        AS court_sports_table
      WHERE court_sports_table.bracket_court_id =
          resolved_bracket_court_id
        AND court_sports_table.sport_id =
          resolved_sport_id
    )
    THEN
      RAISE EXCEPTION
        'A quadra % não está vinculada à modalidade do bloco de finais %.',
        resolved_court_name,
        program_block_ordinality;
    END IF;

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
        'O período % de % não possui uma janela válida para as finais.',
        resolved_period,
        resolved_scheduled_date;
    END IF;

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

      resolved_duration_minutes := GREATEST(
        1,
        public.resolve_championship_sport_duration_minutes(
          edition_record.championship_id,
          resolved_sport_id
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

    SELECT MAX(matches_table.end_time)
    INTO latest_existing_match_end_at
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
      AND matches_table.start_time <
        schedule_entry_record.period_end_at
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

    SELECT MAX(
      previous_final_table.planned_end_at
    )
    INTO latest_program_match_end_at
    FROM tmp_championship_final_program_schedule
      AS previous_final_table
    WHERE previous_final_table.row_id <>
        schedule_entry_record.row_id
      AND previous_final_table.scheduled_date =
        schedule_entry_record.scheduled_date
      AND previous_final_table.bracket_court_id =
        schedule_entry_record.bracket_court_id
      AND previous_final_table.planned_end_at
        IS NOT NULL
      AND previous_final_table.planned_start_at <
        schedule_entry_record.period_end_at;

    candidate_start_at := GREATEST(
      schedule_entry_record.period_start_at,
      COALESCE(
        latest_existing_match_end_at,
        schedule_entry_record.period_start_at
      ),
      COALESCE(
        latest_program_match_end_at,
        schedule_entry_record.period_start_at
      )
    );

    IF candidate_start_at >=
      schedule_entry_record.period_end_at
    THEN
      RAISE EXCEPTION
        'Não existe espaço no período % para a final de % em % • %.',
        schedule_entry_record.schedule_period,
        schedule_entry_record.naipe,
        schedule_entry_record.location_name,
        schedule_entry_record.court_name;
    END IF;

    resolved_start_at :=
      public.resolve_bracket_court_next_available_start(
        schedule_entry_record.bracket_day_id,
        schedule_entry_record.bracket_court_id,
        candidate_start_at,
        schedule_entry_record.duration_minutes
      );

    IF resolved_start_at IS NULL THEN
      RAISE EXCEPTION
        'Não existe espaço disponível para a final de % em % • % no dia %.',
        schedule_entry_record.naipe,
        schedule_entry_record.location_name,
        schedule_entry_record.court_name,
        schedule_entry_record.scheduled_date;
    END IF;

    resolved_end_at :=
      resolved_start_at
      + make_interval(
        mins =>
          schedule_entry_record.duration_minutes
      );

    IF resolved_start_at <
        schedule_entry_record.period_start_at
      OR resolved_end_at >
        schedule_entry_record.period_end_at
    THEN
      RAISE EXCEPTION
        'A final de % ultrapassa o período % disponível em % • %.',
        schedule_entry_record.naipe,
        schedule_entry_record.schedule_period,
        schedule_entry_record.location_name,
        schedule_entry_record.court_name;
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

COMMENT ON FUNCTION
  public.get_championship_knockout_final_program_schedule(
    UUID
  )
IS
  'Calcula a agenda concreta das finais. Cada bloco começa após a ocupação anterior da quadra, respeita intervalo, período, duração da modalidade e capacidade final do dia.';

REVOKE ALL ON FUNCTION
  public.get_championship_knockout_final_program_schedule(
    UUID
  )
FROM PUBLIC;

CREATE OR REPLACE FUNCTION
  public.validate_championship_knockout_final_program_schedule(
    _bracket_edition_id UUID
  )
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM
    final_program_schedule.competition_id
  FROM
    public.get_championship_knockout_final_program_schedule(
      _bracket_edition_id
    ) AS final_program_schedule;
END;
$function$;

COMMENT ON FUNCTION
  public.validate_championship_knockout_final_program_schedule(
    UUID
  )
IS
  'Valida integralmente os blocos de finais e falha quando a quadra, competição, período ou capacidade de horário forem incompatíveis.';

REVOKE ALL ON FUNCTION
  public.validate_championship_knockout_final_program_schedule(
    UUID
  )
FROM PUBLIC;

CREATE OR REPLACE FUNCTION
  public.assign_championship_knockout_match_planned_schedule(
    _championship_id UUID,
    _bracket_match_id UUID
  )
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  bracket_match_record RECORD;

  competition_total_rounds INTEGER;

  resolved_phase
    public.bracket_knockout_priority_phase;

  resolved_division_scope
    public.bracket_knockout_division_scope;

  final_schedule_record RECORD;

  selected_queue_date DATE;
  selected_location_name TEXT;
  selected_court_name TEXT;

  selected_location_group_id UUID;
  selected_court_group_id UUID;

  selected_preferred_court_group_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.is_third_place,

    competitions_table.division,
    competitions_table.naipe,
    competitions_table.sport_id,

    editions_table.season_year
  INTO bracket_match_record
  FROM public.championship_bracket_matches
    AS bracket_matches_table
  JOIN public.championship_bracket_competitions
    AS competitions_table
    ON competitions_table.id =
      bracket_matches_table.competition_id
  JOIN public.championship_bracket_editions
    AS editions_table
    ON editions_table.id =
      bracket_matches_table.bracket_edition_id
  WHERE bracket_matches_table.id =
    _bracket_match_id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN;
  END IF;

  competition_total_rounds :=
    public
      .resolve_championship_competition_expected_knockout_rounds(
        bracket_match_record.competition_id
      );

  IF competition_total_rounds < 1 THEN
    SELECT MAX(
      bracket_matches_table.round_number
    ) FILTER (
      WHERE bracket_matches_table.is_third_place =
        false
    )
    INTO competition_total_rounds
    FROM public.championship_bracket_matches
      AS bracket_matches_table
    WHERE bracket_matches_table.competition_id =
      bracket_match_record.competition_id;
  END IF;

  resolved_phase :=
    public.resolve_bracket_knockout_match_phase(
      bracket_match_record.round_number,
      competition_total_rounds,
      bracket_match_record.is_third_place
    );

  resolved_division_scope :=
    public.resolve_bracket_knockout_division_scope(
      bracket_match_record.division
    );

  IF resolved_phase =
      'FINAL'::public
        .bracket_knockout_priority_phase
    AND bracket_match_record.is_third_place =
      false
  THEN
    SELECT final_schedule.*
    INTO final_schedule_record
    FROM
      public
        .get_championship_knockout_final_program_schedule(
          bracket_match_record.bracket_edition_id
        ) AS final_schedule
    WHERE final_schedule.competition_id =
      bracket_match_record.competition_id
    LIMIT 1;

    IF final_schedule_record.competition_id
      IS NOT NULL
    THEN
      UPDATE public.championship_bracket_matches
        AS bracket_matches_table
      SET
        planned_scheduled_date =
          final_schedule_record.scheduled_date,

        planned_period =
          final_schedule_record.schedule_period,

        planned_scheduled_slot =
          final_schedule_record
            .planned_scheduled_slot,

        planned_queue_position =
          final_schedule_record
            .planned_queue_position,

        planned_start_time =
          (
            final_schedule_record
              .planned_start_at
            AT TIME ZONE 'America/Sao_Paulo'
          )::time,

        planned_end_time =
          (
            final_schedule_record
              .planned_end_at
            AT TIME ZONE 'America/Sao_Paulo'
          )::time,

        planned_location_group_id =
          final_schedule_record.location_group_id,

        planned_court_group_id =
          final_schedule_record.court_group_id,

        planned_location_name =
          final_schedule_record.location_name,

        planned_court_name =
          final_schedule_record.court_name
      WHERE bracket_matches_table.id =
        _bracket_match_id;

      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
      FROM public.matches AS matches_table
      WHERE matches_table.championship_id =
          _championship_id
        AND matches_table.season_year =
          bracket_match_record.season_year
        AND matches_table.scheduled_date
          IS NOT NULL
    ),
    (
      SELECT MIN(days_table.event_date)
      FROM public.championship_bracket_days
        AS days_table
      WHERE days_table.bracket_edition_id =
        bracket_match_record.bracket_edition_id
    )
  )
  INTO selected_queue_date;

  selected_preferred_court_group_id :=
    public
      .resolve_bracket_knockout_priority_court_group_id(
        bracket_match_record.bracket_edition_id,
        bracket_match_record.sport_id,
        resolved_phase,
        resolved_division_scope
      );

  SELECT
    schedule_candidates.location_name,
    schedule_candidates.location_group_id
  INTO
    selected_location_name,
    selected_location_group_id
  FROM (
    SELECT DISTINCT
      locations_table.position,

      locations_table.name
        AS location_name,

      locations_table.location_group_id,
      courts_table.court_group_id
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
    JOIN public.championship_bracket_court_sports
      AS court_sports_table
      ON court_sports_table.bracket_court_id =
        courts_table.id
    WHERE days_table.bracket_edition_id =
        bracket_match_record.bracket_edition_id
      AND court_sports_table.sport_id =
        bracket_match_record.sport_id
      AND days_table.event_date =
        selected_queue_date
  ) AS schedule_candidates
  WHERE selected_preferred_court_group_id
      IS NULL
    OR schedule_candidates.court_group_id =
      selected_preferred_court_group_id
  ORDER BY
    schedule_candidates.position ASC,
    schedule_candidates.location_name ASC
  LIMIT 1;

  IF selected_location_name IS NULL THEN
    SELECT
      schedule_candidates.location_name,
      schedule_candidates.location_group_id
    INTO
      selected_location_name,
      selected_location_group_id
    FROM (
      SELECT DISTINCT
        locations_table.position,

        locations_table.name
          AS location_name,

        locations_table.location_group_id
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
      JOIN
        public.championship_bracket_court_sports
          AS court_sports_table
        ON court_sports_table.bracket_court_id =
          courts_table.id
      WHERE days_table.bracket_edition_id =
          bracket_match_record.bracket_edition_id
        AND court_sports_table.sport_id =
          bracket_match_record.sport_id
        AND days_table.event_date =
          selected_queue_date
    ) AS schedule_candidates
    ORDER BY
      schedule_candidates.position ASC,
      schedule_candidates.location_name ASC
    LIMIT 1;
  END IF;

  UPDATE public.championship_bracket_matches
    AS bracket_matches_table
  SET
    planned_scheduled_date =
      selected_queue_date,

    planned_period = NULL,
    planned_scheduled_slot = NULL,
    planned_queue_position = NULL,
    planned_start_time = NULL,
    planned_end_time = NULL,

    planned_location_group_id =
      selected_location_group_id,

    planned_court_group_id = NULL,

    planned_location_name =
      selected_location_name,

    planned_court_name = NULL
  WHERE bracket_matches_table.id =
    _bracket_match_id;
END;
$function$;

COMMENT ON FUNCTION
  public.assign_championship_knockout_match_planned_schedule(
    UUID,
    UUID
  )
IS
  'Define a agenda planejada do mata-mata. Finais com bloco manual recebem data, quadra e horários concretos calculados após a ocupação anterior da quadra.';


DO $migration_integrate_court_preferences_into_generation$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
  next_function_definition TEXT;
BEGIN
  function_signature :=
    to_regprocedure(
      'public.generate_championship_bracket_groups(uuid,jsonb)'
    );

  IF function_signature IS NULL THEN
    RAISE EXCEPTION
      'Função generate_championship_bracket_groups(uuid,jsonb) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF strpos(
    function_definition,
    'sync_championship_bracket_court_sport_preferences'
  ) = 0
  THEN
    next_function_definition := replace(
      function_definition,

      E'  END LOOP;\n\n'
      || E'  DROP TABLE IF EXISTS temp_day_sport_court_counts;',

      E'  END LOOP;\n\n'
      || E'  PERFORM public.sync_championship_bracket_court_sport_preferences(\n'
      || E'    bracket_edition_id,\n'
      || E'    _payload\n'
      || E'  );\n\n'
      || E'  DROP TABLE IF EXISTS temp_day_sport_court_counts;'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível localizar o ponto de sincronização das preferências na função de geração.';
    END IF;

    function_definition :=
      next_function_definition;
  END IF;

  IF strpos(
    function_definition,
    'validate_championship_knockout_final_program_schedule'
  ) = 0
  THEN
    next_function_definition := replace(
      function_definition,

      E'  PERFORM public.redistribute_bracket_scheduled_matches(bracket_edition_id);\n\n'
      || E'  RETURN bracket_edition_id;',

      E'  PERFORM public.redistribute_bracket_scheduled_matches(bracket_edition_id);\n\n'
      || E'  PERFORM public.validate_championship_knockout_final_program_schedule(\n'
      || E'    bracket_edition_id\n'
      || E'  );\n\n'
      || E'  RETURN bracket_edition_id;'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível localizar o encerramento da função de geração para validar os blocos de finais.';
    END IF;

    function_definition :=
      next_function_definition;
  END IF;

  EXECUTE function_definition;
END;
$migration_integrate_court_preferences_into_generation$;


DO $migration_integrate_primary_sport_into_redistribution$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
  next_function_definition TEXT;
BEGIN
  function_signature :=
    to_regprocedure(
      'public.redistribute_bracket_scheduled_matches(uuid)'
    );

  IF function_signature IS NULL THEN
    RAISE EXCEPTION
      'Função redistribute_bracket_scheduled_matches(uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF strpos(
    function_definition,
    'is_primary_sport BOOLEAN NOT NULL'
  ) = 0
  THEN
    next_function_definition := replace(
      function_definition,

      E'    court_position INTEGER NOT NULL,\n'
      || E'    priority_mode public.bracket_court_priority_mode NOT NULL,',

      E'    court_position INTEGER NOT NULL,\n'
      || E'    is_primary_sport BOOLEAN NOT NULL,\n'
      || E'    priority_mode public.bracket_court_priority_mode NOT NULL,'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível adicionar is_primary_sport às tabelas temporárias da redistribuição.';
    END IF;

    function_definition :=
      next_function_definition;

    next_function_definition := replace(
      function_definition,

      E'    court_position,\n'
      || E'    priority_mode,\n'
      || E'    primary_naipe,',

      E'    court_position,\n'
      || E'    is_primary_sport,\n'
      || E'    priority_mode,\n'
      || E'    primary_naipe,'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível incluir is_primary_sport no INSERT das quadras temporárias.';
    END IF;

    function_definition :=
      next_function_definition;

    next_function_definition := replace(
      function_definition,

      E'    courts_table.name,\n'
      || E'    courts_table.position,\n'
      || E'    COALESCE(location_priorities_table.priority_mode,',

      E'    courts_table.name,\n'
      || E'    courts_table.position,\n'
      || E'    (\n'
      || E'      courts_table.preferred_sport_id IS NOT NULL\n'
      || E'      AND courts_table.preferred_sport_id =\n'
      || E'        court_sports_table.sport_id\n'
      || E'    ) AS is_primary_sport,\n'
      || E'    COALESCE(location_priorities_table.priority_mode,'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível calcular a modalidade principal das quadras.';
    END IF;

    function_definition :=
      next_function_definition;

    next_function_definition := replace(
      function_definition,

      E'        court_position,\n'
      || E'        priority_mode,\n'
      || E'        primary_naipe,',

      E'        court_position,\n'
      || E'        is_primary_sport,\n'
      || E'        priority_mode,\n'
      || E'        primary_naipe,'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível incluir is_primary_sport nos slots temporários.';
    END IF;

    function_definition :=
      next_function_definition;

    next_function_definition := replace(
      function_definition,

      E'        day_court_record.court_name,\n'
      || E'        day_court_record.court_position,\n'
      || E'        day_court_record.priority_mode,',

      E'        day_court_record.court_name,\n'
      || E'        day_court_record.court_position,\n'
      || E'        day_court_record.is_primary_sport,\n'
      || E'        day_court_record.priority_mode,'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível transportar is_primary_sport para os slots.';
    END IF;

    function_definition :=
      next_function_definition;

    next_function_definition := replace(
      function_definition,

      E'    ORDER BY event_date ASC, slot_start_at ASC, location_position ASC, court_position ASC, court_name ASC\n'
      || E'  LOOP\n'
      || E'    SELECT',

      E'    ORDER BY\n'
      || E'      event_date ASC,\n'
      || E'      slot_start_at ASC,\n'
      || E'      CASE WHEN is_primary_sport THEN 0 ELSE 1 END ASC,\n'
      || E'      location_position ASC,\n'
      || E'      court_position ASC,\n'
      || E'      court_name ASC,\n'
      || E'      sport_id ASC\n'
      || E'  LOOP\n'
      || E'    IF EXISTS (\n'
      || E'      SELECT 1\n'
      || E'      FROM tmp_global_assignments\n'
      || E'        AS existing_court_assignments\n'
      || E'      WHERE existing_court_assignments.new_scheduled_date =\n'
      || E'          slot_record.event_date\n'
      || E'        AND existing_court_assignments.location_name =\n'
      || E'          slot_record.location_name\n'
      || E'        AND existing_court_assignments.court_name =\n'
      || E'          slot_record.court_name\n'
      || E'        AND existing_court_assignments.planned_start_at <\n'
      || E'          slot_record.slot_end_at\n'
      || E'        AND existing_court_assignments.planned_end_at >\n'
      || E'          slot_record.slot_start_at\n'
      || E'    ) THEN\n'
      || E'      CONTINUE;\n'
      || E'    END IF;\n\n'
      || E'    SELECT'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível priorizar a modalidade principal ou proteger a quadra contra dupla ocupação.';
    END IF;

    function_definition :=
      next_function_definition;

    next_function_definition := replace(
      function_definition,

      E'      ORDER BY\n'
      || E'        CASE\n'
      || E'          WHEN slot_record.priority_mode =',

      E'      ORDER BY\n'
      || E'        CASE\n'
      || E'          WHEN slot_record.is_primary_sport\n'
      || E'            AND (\n'
      || E'              slot_record.primary_naipe IS NULL\n'
      || E'              OR pending_matches_table.naipe IS NOT DISTINCT FROM\n'
      || E'                slot_record.primary_naipe\n'
      || E'            )\n'
      || E'            AND (\n'
      || E'              slot_record.primary_division IS NULL\n'
      || E'              OR pending_matches_table.division IS NOT DISTINCT FROM\n'
      || E'                slot_record.primary_division\n'
      || E'            )\n'
      || E'          THEN 0\n'
      || E'          WHEN slot_record.is_primary_sport\n'
      || E'          THEN 1\n'
      || E'          ELSE 0\n'
      || E'        END ASC,\n'
      || E'        CASE\n'
      || E'          WHEN slot_record.priority_mode ='
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível incluir os refinamentos opcionais na ordenação dos jogos.';
    END IF;

    function_definition :=
      next_function_definition;
  END IF;

  EXECUTE function_definition;
END;
$migration_integrate_primary_sport_into_redistribution$;


DO $migration_fix_knockout_planned_timestamp_materialization$
DECLARE
  function_signature REGPROCEDURE;
  function_definition TEXT;
  next_function_definition TEXT;
BEGIN
  function_signature :=
    to_regprocedure(
      'public.create_championship_knockout_match_schedule(uuid,uuid)'
    );

  IF function_signature IS NULL THEN
    RAISE EXCEPTION
      'Função create_championship_knockout_match_schedule(uuid,uuid) não encontrada.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF strpos(
    function_definition,
    'combine_bracket_schedule_timestamp('
  ) = 0
  THEN
    next_function_definition := replace(
      function_definition,

      E'      bracket_match_record.planned_start_time,\n'
      || E'      bracket_match_record.planned_end_time,',

      E'      CASE\n'
      || E'        WHEN bracket_match_record.planned_start_time IS NULL\n'
      || E'        THEN NULL\n'
      || E'        ELSE public.combine_bracket_schedule_timestamp(\n'
      || E'          bracket_match_record.planned_scheduled_date,\n'
      || E'          bracket_match_record.planned_start_time\n'
      || E'        )\n'
      || E'      END,\n'
      || E'      CASE\n'
      || E'        WHEN bracket_match_record.planned_end_time IS NULL\n'
      || E'        THEN NULL\n'
      || E'        ELSE public.combine_bracket_schedule_timestamp(\n'
      || E'          bracket_match_record.planned_scheduled_date,\n'
      || E'          bracket_match_record.planned_end_time\n'
      || E'        )\n'
      || E'      END,'
    );

    IF next_function_definition =
      function_definition
    THEN
      RAISE EXCEPTION
        'Não foi possível ajustar a materialização dos horários planejados das finais.';
    END IF;

    function_definition :=
      next_function_definition;
  END IF;

  EXECUTE function_definition;
END;
$migration_fix_knockout_planned_timestamp_materialization$;


COMMENT ON FUNCTION
  public.create_championship_knockout_match_schedule(
    UUID,
    UUID
  )
IS
  'Materializa o jogo real do mata-mata. Finais com programação manual herdam data, quadra, horário, slot e posição de fila calculados previamente.';


NOTIFY pgrst, 'reload schema';