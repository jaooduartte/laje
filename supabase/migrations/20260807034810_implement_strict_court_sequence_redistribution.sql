-- Implementa o sequenciamento estrito por naipe ou divisão na redistribuição.
--
-- Regras:
-- - estado independente por dia, quadra e modalidade;
-- - começa pelo naipe/divisão preferencial;
-- - depois que avança para o próximo grupo, não retorna ao anterior;
-- - se o grupo atual possuir partidas pendentes, mas nenhuma puder entrar
--   por descanso ou conflito, o horário físico fica vazio;
-- - partidas originalmente pertencentes ao dia têm precedência;
-- - prioridades globais continuam aplicáveis somente ao modo FLEXIBLE;
-- - finais manuais são preservadas nos horários definidos pelo bloco de finais.

DO $migration$
DECLARE
  function_signature REGPROCEDURE :=
    to_regprocedure(
      'public.redistribute_bracket_scheduled_matches(uuid)'
    );

  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT;
  target_block TEXT;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION
      'A função redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  IF strpos(
    function_definition,
    'tmp_global_strict_blocked_slots'
  ) > 0 THEN
    RETURN;
  END IF;

  updated_definition := function_definition;


  -- Variáveis de controle do agrupamento estrito.
  source_block := $source$
  slot_last_division public.team_division;
  has_reserved_division_pending BOOLEAN;
$source$;

  target_block := $target$
  slot_last_division public.team_division;

  has_same_day_pending BOOLEAN;
  strict_group_pending BOOLEAN;
  slot_match_assigned BOOLEAN;

  strict_active_naipe public.match_naipe;
  strict_active_division public.team_division;

  strict_completed_naipes public.match_naipe[];
  strict_completed_divisions public.team_division[];

  has_reserved_division_pending BOOLEAN;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível adicionar as variáveis do sequenciamento estrito.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Estado do sequenciamento por dia, quadra e modalidade.
  source_block := $source$
  CREATE TEMP TABLE tmp_global_day_courts (
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    location_id UUID NOT NULL,
    location_group_id UUID NOT NULL,
    location_name TEXT NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    is_primary_sport BOOLEAN NOT NULL,
    priority_mode public.bracket_court_priority_mode NOT NULL,
    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,
    next_available_at TIMESTAMPTZ NOT NULL,
    assigned_count INTEGER NOT NULL DEFAULT 0,
    last_naipe public.match_naipe NULL,
    last_division public.team_division NULL,
    PRIMARY KEY (court_id, sport_id, bracket_day_id)
  ) ON COMMIT DROP;
$source$;

  target_block := $target$
  CREATE TEMP TABLE tmp_global_day_courts (
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    location_id UUID NOT NULL,
    location_group_id UUID NOT NULL,
    location_name TEXT NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    is_primary_sport BOOLEAN NOT NULL,

    priority_mode
      public.bracket_court_priority_mode
      NOT NULL,

    sequence_mode
      public.bracket_court_sequence_mode
      NOT NULL,

    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,

    active_sequence_naipe
      public.match_naipe NULL,

    active_sequence_division
      public.team_division NULL,

    completed_sequence_naipes
      public.match_naipe[]
      NOT NULL
      DEFAULT ARRAY[]::public.match_naipe[],

    completed_sequence_divisions
      public.team_division[]
      NOT NULL
      DEFAULT ARRAY[]::public.team_division[],

    next_available_at TIMESTAMPTZ NOT NULL,
    assigned_count INTEGER NOT NULL DEFAULT 0,
    last_naipe public.match_naipe NULL,
    last_division public.team_division NULL,

    PRIMARY KEY (
      court_id,
      sport_id,
      bracket_day_id
    )
  ) ON COMMIT DROP;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível ampliar tmp_global_day_courts.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Colunas inseridas no estado das quadras.
  source_block := $source$
    is_primary_sport,
    priority_mode,
    primary_naipe,
    primary_division,
    next_available_at
  )
$source$;

  target_block := $target$
    is_primary_sport,
    priority_mode,
    sequence_mode,
    primary_naipe,
    primary_division,
    active_sequence_naipe,
    active_sequence_division,
    next_available_at
  )
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível ampliar o INSERT de tmp_global_day_courts.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- O modo estrito ignora a prioridade global e começa pelo grupo escolhido
  -- na etapa 11.
  source_block := $source$
    COALESCE(location_priorities_table.priority_mode, 'NONE'::public.bracket_court_priority_mode),
    court_sports_table.preferred_naipe,
    court_sports_table.preferred_division,
    public.combine_bracket_schedule_timestamp(days_table.event_date, days_table.start_time)
$source$;

  target_block := $target$
    CASE
      WHEN court_sports_table.sequence_mode =
        'FLEXIBLE'::public.bracket_court_sequence_mode
      THEN COALESCE(
        location_priorities_table.priority_mode,
        'NONE'::public.bracket_court_priority_mode
      )
      ELSE
        'NONE'::public.bracket_court_priority_mode
    END,

    court_sports_table.sequence_mode,
    court_sports_table.preferred_naipe,
    court_sports_table.preferred_division,

    CASE
      WHEN court_sports_table.sequence_mode =
        'GROUP_NAIPE'
          ::public.bracket_court_sequence_mode
      THEN court_sports_table.preferred_naipe
      ELSE NULL
    END,

    CASE
      WHEN court_sports_table.sequence_mode =
        'GROUP_DIVISION'
          ::public.bracket_court_sequence_mode
      THEN court_sports_table.preferred_division
      ELSE NULL
    END,

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.start_time
    )
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível carregar sequence_mode nas quadras.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Finais manuais já materializadas não entram novamente na redistribuição.
  -- Seus intervalos serão tratados como ocupações fixas da quadra.
  source_block := $source$
  DROP TABLE IF EXISTS tmp_global_locked_matches;
$source$;

  target_block := $target$
  DROP TABLE IF EXISTS
    tmp_global_manual_final_matches;

  CREATE TEMP TABLE
    tmp_global_manual_final_matches (
      match_id UUID PRIMARY KEY,
      event_date DATE NOT NULL,
      location_name TEXT NOT NULL,
      court_name TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL
    )
  ON COMMIT DROP;

  INSERT INTO
    tmp_global_manual_final_matches (
      match_id,
      event_date,
      location_name,
      court_name,
      start_time,
      end_time
    )
  SELECT
    matches_table.id,
    matches_table.scheduled_date,
    matches_table.location,
    matches_table.court_name,

    COALESCE(
      matches_table.start_time,

      public.combine_bracket_schedule_timestamp(
        matches_table.scheduled_date,
        bracket_matches_table.planned_start_time
      )
    ),

    COALESCE(
      matches_table.end_time,

      public.combine_bracket_schedule_timestamp(
        matches_table.scheduled_date,
        bracket_matches_table.planned_end_time
      )
    )

  FROM public.matches AS matches_table

  JOIN public.championship_bracket_matches
    AS bracket_matches_table
    ON bracket_matches_table.match_id =
      matches_table.id

  WHERE bracket_matches_table.bracket_edition_id =
      _bracket_edition_id

    AND matches_table.status =
      'SCHEDULED'::public.match_status

    AND bracket_matches_table.phase =
      'KNOCKOUT'::public.bracket_phase

    AND bracket_matches_table.is_third_place =
      false

    AND bracket_matches_table.planned_period
      IS NOT NULL

    AND bracket_matches_table
      .planned_court_group_id IS NOT NULL

    AND bracket_matches_table
      .planned_start_time IS NOT NULL

    AND bracket_matches_table
      .planned_end_time IS NOT NULL

    AND matches_table.scheduled_date
      IS NOT NULL

    AND NULLIF(
      trim(COALESCE(matches_table.location, '')),
      ''
    ) IS NOT NULL

    AND NULLIF(
      trim(COALESCE(matches_table.court_name, '')),
      ''
    ) IS NOT NULL;

  DROP TABLE IF EXISTS tmp_global_locked_matches;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível adicionar a reserva das finais manuais.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Remove as finais manuais da fila pendente.
  source_block := $source$
  WHERE bracket_matches_table.bracket_edition_id = _bracket_edition_id
    AND matches_table.status = 'SCHEDULED'::public.match_status;
$source$;

  target_block := $target$
  WHERE bracket_matches_table.bracket_edition_id =
      _bracket_edition_id

    AND matches_table.status =
      'SCHEDULED'::public.match_status

    AND NOT (
      bracket_matches_table.phase =
        'KNOCKOUT'::public.bracket_phase

      AND bracket_matches_table.is_third_place =
        false

      AND bracket_matches_table.planned_period
        IS NOT NULL

      AND bracket_matches_table
        .planned_court_group_id IS NOT NULL

      AND bracket_matches_table
        .planned_start_time IS NOT NULL

      AND bracket_matches_table
        .planned_end_time IS NOT NULL
    );
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível excluir as finais manuais da fila.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Os slots precisam conhecer o modo da modalidade na quadra.
  source_block := $source$
  CREATE TEMP TABLE tmp_global_court_slots (
    slot_id BIGSERIAL PRIMARY KEY,
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    location_name TEXT NOT NULL,
    location_group_id UUID NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    is_primary_sport BOOLEAN NOT NULL,
    priority_mode public.bracket_court_priority_mode NOT NULL,
    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,
    slot_start_at TIMESTAMPTZ NOT NULL,
    slot_end_at TIMESTAMPTZ NOT NULL,
    court_sequence_index INTEGER NOT NULL
  ) ON COMMIT DROP;
$source$;

  target_block := $target$
  CREATE TEMP TABLE tmp_global_court_slots (
    slot_id BIGSERIAL PRIMARY KEY,
    bracket_day_id UUID NOT NULL,
    event_date DATE NOT NULL,
    sport_id UUID NOT NULL,
    duration_minutes INTEGER NOT NULL,
    location_name TEXT NOT NULL,
    location_group_id UUID NOT NULL,
    location_position INTEGER NOT NULL,
    court_id UUID NOT NULL,
    court_group_id UUID NOT NULL,
    court_name TEXT NOT NULL,
    court_position INTEGER NOT NULL,
    is_primary_sport BOOLEAN NOT NULL,

    priority_mode
      public.bracket_court_priority_mode
      NOT NULL,

    sequence_mode
      public.bracket_court_sequence_mode
      NOT NULL,

    primary_naipe public.match_naipe NULL,
    primary_division public.team_division NULL,
    slot_start_at TIMESTAMPTZ NOT NULL,
    slot_end_at TIMESTAMPTZ NOT NULL,
    court_sequence_index INTEGER NOT NULL
  ) ON COMMIT DROP;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível ampliar tmp_global_court_slots.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block := $source$
        is_primary_sport,
        priority_mode,
        primary_naipe,
        primary_division,
        slot_start_at,
$source$;

  target_block := $target$
        is_primary_sport,
        priority_mode,
        sequence_mode,
        primary_naipe,
        primary_division,
        slot_start_at,
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível ampliar as colunas dos slots.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block := $source$
        day_court_record.is_primary_sport,
        day_court_record.priority_mode,
        day_court_record.primary_naipe,
        day_court_record.primary_division,
        slot_start_at,
$source$;

  target_block := $target$
        day_court_record.is_primary_sport,
        day_court_record.priority_mode,
        day_court_record.sequence_mode,
        day_court_record.primary_naipe,
        day_court_record.primary_division,
        slot_start_at,
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível preencher sequence_mode nos slots.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Registra intervalos que devem continuar vazios quando o grupo estrito
  -- estiver temporariamente impedido pelas regras de descanso.
  source_block := $source$
  FOR slot_record IN
$source$;

  target_block := $target$
  DROP TABLE IF EXISTS
    tmp_global_strict_blocked_slots;

  CREATE TEMP TABLE
    tmp_global_strict_blocked_slots (
      event_date DATE NOT NULL,
      location_name TEXT NOT NULL,
      court_name TEXT NOT NULL,
      slot_start_at TIMESTAMPTZ NOT NULL,
      slot_end_at TIMESTAMPTZ NOT NULL,

      PRIMARY KEY (
        event_date,
        location_name,
        court_name,
        slot_start_at,
        slot_end_at
      )
    )
  ON COMMIT DROP;

  FOR slot_record IN
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível criar o controle de horários vazios.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Reservas de finais e bloqueios estritos ocupam a quadra física,
  -- independentemente da modalidade do slot atual.
  source_block := $source$
      sport_id ASC
  LOOP
    IF EXISTS (
$source$;

  target_block := $target$
      sport_id ASC
  LOOP
    IF EXISTS (
      SELECT 1
      FROM tmp_global_manual_final_matches
        AS manual_final_matches_table
      WHERE manual_final_matches_table.event_date =
          slot_record.event_date

        AND public.normalize_bracket_entity_name(
          manual_final_matches_table.location_name
        ) =
          public.normalize_bracket_entity_name(
            slot_record.location_name
          )

        AND public.normalize_bracket_entity_name(
          manual_final_matches_table.court_name
        ) =
          public.normalize_bracket_entity_name(
            slot_record.court_name
          )

        AND manual_final_matches_table.start_time <
          slot_record.slot_end_at

        AND manual_final_matches_table.end_time >
          slot_record.slot_start_at
    )
    OR EXISTS (
      SELECT 1
      FROM tmp_global_strict_blocked_slots
        AS blocked_slots_table
      WHERE blocked_slots_table.event_date =
          slot_record.event_date

        AND blocked_slots_table.location_name =
          slot_record.location_name

        AND blocked_slots_table.court_name =
          slot_record.court_name

        AND blocked_slots_table.slot_start_at <
          slot_record.slot_end_at

        AND blocked_slots_table.slot_end_at >
          slot_record.slot_start_at
    )
    THEN
      CONTINUE;
    END IF;

    slot_match_assigned := false;

    IF EXISTS (
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível proteger os horários físicos reservados.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Carrega o estado atual do grupo estrito.
  source_block := $source$
    SELECT
      day_courts_table.last_naipe,
      day_courts_table.last_division
    INTO
      slot_last_naipe,
      slot_last_division
    FROM tmp_global_day_courts AS day_courts_table
$source$;

  target_block := $target$
    SELECT
      day_courts_table.last_naipe,
      day_courts_table.last_division,

      day_courts_table.active_sequence_naipe,
      day_courts_table.active_sequence_division,

      day_courts_table.completed_sequence_naipes,
      day_courts_table.completed_sequence_divisions

    INTO
      slot_last_naipe,
      slot_last_division,

      strict_active_naipe,
      strict_active_division,

      strict_completed_naipes,
      strict_completed_divisions

    FROM tmp_global_day_courts AS day_courts_table
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível carregar o estado do grupo estrito.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Resolve o grupo atual. A troca ocorre somente quando não existe mais
  -- nenhuma partida pendente do grupo atual dentro da afinidade do dia.
  source_block := $source$
    has_reserved_division_pending := false;
    has_reserved_naipe_pending := false;

    IF slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
$source$;

  target_block := $target$
    has_reserved_division_pending := false;
    has_reserved_naipe_pending := false;

    SELECT EXISTS (
      SELECT 1
      FROM tmp_global_pending_matches
        AS pending_matches_table

      WHERE pending_matches_table.sport_id =
          slot_record.sport_id

        AND pending_matches_table
          .original_scheduled_date =
            slot_record.event_date

        AND (
          pending_matches_table
            .preferred_knockout_court_group_id
              IS NULL

          OR pending_matches_table
            .preferred_knockout_court_group_id =
              slot_record.court_group_id
        )
    )
    INTO has_same_day_pending;

    strict_group_pending := false;

    IF slot_record.sequence_mode =
      'GROUP_NAIPE'
        ::public.bracket_court_sequence_mode
    THEN
      LOOP
        EXIT WHEN strict_active_naipe IS NULL;

        SELECT EXISTS (
          SELECT 1
          FROM tmp_global_pending_matches
            AS pending_matches_table

          WHERE pending_matches_table.sport_id =
              slot_record.sport_id

            AND pending_matches_table.naipe
              IS NOT DISTINCT FROM
                strict_active_naipe

            AND (
              pending_matches_table
                .preferred_knockout_court_group_id
                  IS NULL

              OR pending_matches_table
                .preferred_knockout_court_group_id =
                  slot_record.court_group_id
            )

            AND (
              NOT has_same_day_pending

              OR pending_matches_table
                .original_scheduled_date =
                  slot_record.event_date
            )
        )
        INTO strict_group_pending;

        EXIT WHEN strict_group_pending;

        strict_completed_naipes :=
          COALESCE(
            strict_completed_naipes,
            ARRAY[]::public.match_naipe[]
          );

        IF NOT (
          strict_active_naipe =
            ANY(strict_completed_naipes)
        )
        THEN
          strict_completed_naipes :=
            array_append(
              strict_completed_naipes,
              strict_active_naipe
            );
        END IF;

        SELECT pending_matches_table.naipe
        INTO strict_active_naipe
        FROM tmp_global_pending_matches
          AS pending_matches_table

        WHERE pending_matches_table.sport_id =
            slot_record.sport_id

          AND NOT (
            pending_matches_table.naipe =
              ANY(strict_completed_naipes)
          )

          AND (
            pending_matches_table
              .preferred_knockout_court_group_id
                IS NULL

            OR pending_matches_table
              .preferred_knockout_court_group_id =
                slot_record.court_group_id
          )

          AND (
            NOT has_same_day_pending

            OR pending_matches_table
              .original_scheduled_date =
                slot_record.event_date
          )

        GROUP BY pending_matches_table.naipe

        ORDER BY
          CASE pending_matches_table.naipe
            WHEN 'FEMININO'
              ::public.match_naipe
              THEN 1

            WHEN 'MASCULINO'
              ::public.match_naipe
              THEN 2

            WHEN 'MISTO'
              ::public.match_naipe
              THEN 3

            ELSE 99
          END,

          pending_matches_table.naipe

        LIMIT 1;

        UPDATE tmp_global_day_courts
          AS day_courts_table

        SET
          active_sequence_naipe =
            strict_active_naipe,

          completed_sequence_naipes =
            strict_completed_naipes

        WHERE day_courts_table.bracket_day_id =
            slot_record.bracket_day_id

          AND day_courts_table.court_id =
            slot_record.court_id

          AND day_courts_table.sport_id =
            slot_record.sport_id;
      END LOOP;

    ELSIF slot_record.sequence_mode =
      'GROUP_DIVISION'
        ::public.bracket_court_sequence_mode
    THEN
      LOOP
        EXIT WHEN strict_active_division IS NULL;

        SELECT EXISTS (
          SELECT 1
          FROM tmp_global_pending_matches
            AS pending_matches_table

          WHERE pending_matches_table.sport_id =
              slot_record.sport_id

            AND pending_matches_table.division
              IS NOT DISTINCT FROM
                strict_active_division

            AND (
              pending_matches_table
                .preferred_knockout_court_group_id
                  IS NULL

              OR pending_matches_table
                .preferred_knockout_court_group_id =
                  slot_record.court_group_id
            )

            AND (
              NOT has_same_day_pending

              OR pending_matches_table
                .original_scheduled_date =
                  slot_record.event_date
            )
        )
        INTO strict_group_pending;

        EXIT WHEN strict_group_pending;

        strict_completed_divisions :=
          COALESCE(
            strict_completed_divisions,
            ARRAY[]::public.team_division[]
          );

        IF NOT (
          strict_active_division =
            ANY(strict_completed_divisions)
        )
        THEN
          strict_completed_divisions :=
            array_append(
              strict_completed_divisions,
              strict_active_division
            );
        END IF;

        SELECT pending_matches_table.division
        INTO strict_active_division
        FROM tmp_global_pending_matches
          AS pending_matches_table

        WHERE pending_matches_table.sport_id =
            slot_record.sport_id

          AND pending_matches_table.division
            IS NOT NULL

          AND NOT (
            pending_matches_table.division =
              ANY(strict_completed_divisions)
          )

          AND (
            pending_matches_table
              .preferred_knockout_court_group_id
                IS NULL

            OR pending_matches_table
              .preferred_knockout_court_group_id =
                slot_record.court_group_id
          )

          AND (
            NOT has_same_day_pending

            OR pending_matches_table
              .original_scheduled_date =
                slot_record.event_date
          )

        GROUP BY pending_matches_table.division

        ORDER BY
          CASE pending_matches_table.division
            WHEN 'DIVISAO_PRINCIPAL'
              ::public.team_division
              THEN 1

            WHEN 'DIVISAO_ACESSO'
              ::public.team_division
              THEN 2

            ELSE 99
          END,

          pending_matches_table.division

        LIMIT 1;

        UPDATE tmp_global_day_courts
          AS day_courts_table

        SET
          active_sequence_division =
            strict_active_division,

          completed_sequence_divisions =
            strict_completed_divisions

        WHERE day_courts_table.bracket_day_id =
            slot_record.bracket_day_id

          AND day_courts_table.court_id =
            slot_record.court_id

          AND day_courts_table.sport_id =
            slot_record.sport_id;
      END LOOP;
    END IF;

    IF slot_record.priority_mode = 'DIVISION'::public.bracket_court_priority_mode
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível inserir a transição dos grupos estritos.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Prioridades flexíveis também respeitam a afinidade original do dia.
  source_block := $source$
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          )
      )
      INTO has_reserved_division_pending;
$source$;

  target_block := $target$
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          )
          AND (
            NOT has_same_day_pending
            OR pending_matches_table.original_scheduled_date = slot_record.event_date
          )
      )
      INTO has_reserved_division_pending;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível aplicar afinidade diária à prioridade de divisão.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  source_block := $source$
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          )
      )
      INTO has_reserved_naipe_pending;
$source$;

  target_block := $target$
          AND (
            pending_matches_table.preferred_knockout_court_group_id IS NULL
            OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
          )
          AND (
            NOT has_same_day_pending
            OR pending_matches_table.original_scheduled_date = slot_record.event_date
          )
      )
      INTO has_reserved_naipe_pending;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível aplicar afinidade diária à prioridade de naipe.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Restringe os candidatos ao grupo estrito atual. Não existe fallback
  -- para outro naipe ou divisão enquanto esse grupo continuar pendente.
  source_block := $source$
      WHERE pending_matches_table.sport_id = slot_record.sport_id
        AND (
          pending_matches_table.preferred_knockout_court_group_id IS NULL
          OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
        )
        AND (
          slot_record.priority_mode <> 'DIVISION'::public.bracket_court_priority_mode
$source$;

  target_block := $target$
      WHERE pending_matches_table.sport_id = slot_record.sport_id

        AND (
          pending_matches_table.preferred_knockout_court_group_id IS NULL
          OR pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id
        )

        AND (
          NOT has_same_day_pending
          OR pending_matches_table.original_scheduled_date = slot_record.event_date
        )

        AND (
          slot_record.sequence_mode <>
            'GROUP_NAIPE'
              ::public.bracket_court_sequence_mode

          OR (
            strict_active_naipe IS NOT NULL

            AND pending_matches_table.naipe
              IS NOT DISTINCT FROM
                strict_active_naipe
          )
        )

        AND (
          slot_record.sequence_mode <>
            'GROUP_DIVISION'
              ::public.bracket_court_sequence_mode

          OR (
            strict_active_division IS NOT NULL

            AND pending_matches_table.division
              IS NOT DISTINCT FROM
                strict_active_division
          )
        )

        AND (
          slot_record.priority_mode <> 'DIVISION'::public.bracket_court_priority_mode
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível restringir os candidatos ao grupo estrito.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- Depois de testar todos os jogos do grupo, mantém o horário vazio quando
  -- os únicos candidatos falharam por descanso ou conflito.
  source_block := $source$
      DELETE FROM tmp_global_pending_matches
      WHERE order_index = pending_match_record.order_index;

      EXIT;
    END LOOP;
  END LOOP;
$source$;

  target_block := $target$
      DELETE FROM tmp_global_pending_matches
      WHERE order_index = pending_match_record.order_index;

      slot_match_assigned := true;

      EXIT;
    END LOOP;

    IF slot_record.sequence_mode <>
        'FLEXIBLE'
          ::public.bracket_court_sequence_mode

      AND strict_group_pending

      AND NOT slot_match_assigned
    THEN
      INSERT INTO
        tmp_global_strict_blocked_slots (
          event_date,
          location_name,
          court_name,
          slot_start_at,
          slot_end_at
        )
      VALUES (
        slot_record.event_date,
        slot_record.location_name,
        slot_record.court_name,
        slot_record.slot_start_at,
        slot_record.slot_end_at
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível implementar o bloqueio estrito sem fallback.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  EXECUTE updated_definition;
END;
$migration$;


COMMENT ON FUNCTION
  public.redistribute_bracket_scheduled_matches(UUID)
IS
  'Redistribui jogos respeitando descanso, afinidade de data, prioridades flexíveis e agrupamento estrito por naipe ou divisão. Finais manuais permanecem reservadas.';

NOTIFY pgrst, 'reload schema';