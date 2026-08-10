-- Planejador autoritativo de agenda do mata-mata.
--
-- Responsabilidades:
-- - projetar todas as partidas reais esperadas do mata-mata;
-- - representar BYEs sem criar partidas/reservas artificiais;
-- - respeitar a conclusão da fase de grupos;
-- - respeitar dependências entre rodadas sem intervalo mínimo de descanso;
-- - respeitar disponibilidade da modalidade/competição da etapa 9;
-- - NÃO aplicar disponibilidade específica das atléticas da etapa 10;
-- - NÃO aplicar descanso mínimo das atléticas no mata-mata;
-- - respeitar compatibilidade modalidade x quadra;
-- - respeitar períodos, pausas e bloqueios de recurso;
-- - preservar finais manuais como ocupações fixas e autoritativas;
-- - permitir que uma partida da rodada seguinte comece exatamente
--   no instante em que as duas partidas alimentadoras terminarem;
-- - impedir que finais manuais sejam deslocadas por dependências;
-- - registrar conflitos quando a agenda projetada não couber;
-- - gravar as reservas que posteriormente serão reutilizadas
--   pelos jogos reais.
--
-- A função pode operar em dois modos:
--
-- _strict = true
--   usada na geração definitiva. Qualquer conflito invalida o planejamento.
--
-- _strict = false
--   usada posteriormente pela prévia da etapa 13. Os horários possíveis são
--   preservados e os conflitos são retornados como JSON para visualização.


CREATE OR REPLACE FUNCTION
  public.rebuild_championship_knockout_schedule_reservations(
    _bracket_edition_id UUID,
    _strict BOOLEAN DEFAULT true
  )
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  edition_record RECORD;
  competition_record RECORD;
  pending_record RECORD;
  feeder_record RECORD;
  court_record RECORD;
  period_record RECORD;
  manual_final_record RECORD;

  competition_key_value TEXT;

  direct_qualified_team_count INTEGER;
  qualified_team_count INTEGER;
  bracket_size INTEGER;
  bracket_size_cursor INTEGER;
  total_rounds INTEGER;

  round_number_value INTEGER;
  round_match_count INTEGER;
  slot_number_value INTEGER;

  first_round_home_seed INTEGER;
  first_round_away_seed INTEGER;

  is_bye_value BOOLEAN;
  is_manual_final_value BOOLEAN;

  group_match_count INTEGER;
  group_schedule_complete BOOLEAN;
  group_ready_at TIMESTAMPTZ;

  remaining_automatic_count INTEGER;

  dependency_ready_at TIMESTAMPTZ;
  feeder_count INTEGER;

  resolved_phase
    public.bracket_knockout_priority_phase;

  resolved_division_scope
    public.bracket_knockout_division_scope;

  resolved_preferred_court_group_id UUID;

  period_start_at TIMESTAMPTZ;
  period_end_at TIMESTAMPTZ;

  day_start_at TIMESTAMPTZ;
  day_end_at TIMESTAMPTZ;
  day_middle_at TIMESTAMPTZ;

  candidate_start_at TIMESTAMPTZ;
  candidate_end_at TIMESTAMPTZ;
  candidate_conflict_end_at TIMESTAMPTZ;

  candidate_is_valid BOOLEAN;
  candidate_priority_rank INTEGER;

  best_pending_row_id BIGINT;

  best_start_at TIMESTAMPTZ;
  best_end_at TIMESTAMPTZ;

  best_scheduled_date DATE;

  best_schedule_period
    public.championship_schedule_period;

  best_location_name TEXT;
  best_court_name TEXT;

  best_location_group_id UUID;
  best_court_group_id UUID;

  best_bracket_day_id UUID;
  best_bracket_court_id UUID;

  best_duration_minutes INTEGER;
  best_priority_rank INTEGER;

  best_location_position INTEGER;
  best_court_position INTEGER;

  selected_scheduled_slot INTEGER;
  selected_queue_position INTEGER;

  conflict_count INTEGER;
  expected_match_count INTEGER;
  scheduled_match_count INTEGER;

  first_conflict_message TEXT;

  result_conflicts JSONB;

  manual_dependency_ready_at TIMESTAMPTZ;
BEGIN
  IF _bracket_edition_id IS NULL THEN
    RAISE EXCEPTION
      'A edição de chaveamento é obrigatória para planejar o mata-mata.';
  END IF;


  SELECT
    editions_table.id,
    editions_table.championship_id,
    editions_table.season_year,
    editions_table.payload_snapshot
  INTO edition_record
  FROM public.championship_bracket_editions
    AS editions_table
  WHERE editions_table.id =
    _bracket_edition_id
  LIMIT 1;


  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION
      'Edição de chaveamento inválida para planejar o mata-mata.';
  END IF;


  /*
   * Evita que duas reconstruções concorrentes da mesma edição
   * alterem a tabela de reservas simultaneamente.
   */
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'championship_knockout_schedule:'
        || _bracket_edition_id::text,
      0
    )
  );


  DELETE FROM
    public.championship_bracket_knockout_schedule_reservations
  WHERE bracket_edition_id =
    _bracket_edition_id;


  DROP TABLE IF EXISTS
    tmp_knockout_schedule_conflicts;

  CREATE TEMP TABLE
    tmp_knockout_schedule_conflicts (
      row_id BIGSERIAL PRIMARY KEY,

      conflict_code TEXT NOT NULL,
      conflict_message TEXT NOT NULL,

      competition_id UUID NULL,
      round_number INTEGER NULL,
      slot_number INTEGER NULL
    )
  ON COMMIT DROP;


  /*
   * Primeiro calculamos as finais manuais.
   *
   * Elas precisam existir desde o início do planejamento porque
   * funcionam como intervalos fixos da quadra. As demais partidas
   * automáticas podem ser deslocadas ao redor delas, mas nunca
   * deslocam a própria final manual.
   */
  DROP TABLE IF EXISTS
    tmp_knockout_manual_finals;

  CREATE TEMP TABLE
    tmp_knockout_manual_finals
  ON COMMIT DROP
  AS
  SELECT
    final_schedule.*
  FROM
    public.get_championship_knockout_final_program_schedule(
      _bracket_edition_id
    ) AS final_schedule;


  /*
   * Representação temporária de todos os nós projetados do mata-mata.
   *
   * BYEs são mantidos apenas para preservar corretamente as
   * dependências do bracket. Eles não serão gravados como reserva.
   */
  DROP TABLE IF EXISTS
    tmp_knockout_pending_matches;

  CREATE TEMP TABLE
    tmp_knockout_pending_matches (
      row_id BIGSERIAL PRIMARY KEY,

      competition_id UUID NOT NULL,

      sport_id UUID NOT NULL,
      naipe public.match_naipe NOT NULL,
      division public.team_division NULL,

      total_rounds INTEGER NOT NULL,

      round_number INTEGER NOT NULL,
      slot_number INTEGER NOT NULL,

      duration_minutes INTEGER NOT NULL,

      is_bye BOOLEAN NOT NULL DEFAULT false,
      is_manual_final BOOLEAN NOT NULL DEFAULT false,

      group_ready_at TIMESTAMPTZ NULL,

      planned_start_at TIMESTAMPTZ NULL,
      planned_end_at TIMESTAMPTZ NULL,

      failed BOOLEAN NOT NULL DEFAULT false,

      UNIQUE (
        competition_id,
        round_number,
        slot_number
      )
    )
  ON COMMIT DROP;


  /*
   * Monta o bracket anônimo de cada competição.
   *
   * A regra replica o tamanho esperado utilizado pela geração real:
   *
   * - classificação normal:
   *     próximo power-of-two >= classificados diretos;
   *
   * - qualifiers_per_group = 1 com complementação pelos melhores
   *   segundos:
   *     próximo power-of-two > classificados diretos.
   */
  FOR competition_record IN
    SELECT
      competitions_table.id,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.groups_count,
      competitions_table.qualifiers_per_group,

      competitions_table
        .should_complete_knockout_with_best_second_placed_teams,

      COALESCE(
        championship_sports_table
          .default_match_duration_minutes,

        sports_table
          .default_match_duration_minutes,

        30
      )::integer AS duration_minutes

    FROM public.championship_bracket_competitions
      AS competitions_table

    LEFT JOIN public.championship_sports
      AS championship_sports_table
      ON championship_sports_table.championship_id =
        edition_record.championship_id
      AND championship_sports_table.sport_id =
        competitions_table.sport_id

    LEFT JOIN public.sports
      AS sports_table
      ON sports_table.id =
        competitions_table.sport_id

    WHERE competitions_table.bracket_edition_id =
      _bracket_edition_id

    ORDER BY
      competitions_table.created_at ASC,
      competitions_table.id ASC
  LOOP
    direct_qualified_team_count :=
      GREATEST(
        0,
        competition_record.groups_count
          * competition_record.qualifiers_per_group
      );


    IF competition_record.qualifiers_per_group = 1
      AND competition_record
        .should_complete_knockout_with_best_second_placed_teams =
          true
    THEN
      bracket_size := 1;

      WHILE
        bracket_size <=
          direct_qualified_team_count
      LOOP
        bracket_size :=
          bracket_size * 2;
      END LOOP;

      /*
       * Neste modo o próprio algoritmo de classificação completa
       * o bracket utilizando os melhores segundos colocados.
       */
      qualified_team_count :=
        bracket_size;
    ELSE
      qualified_team_count :=
        direct_qualified_team_count;

      bracket_size := 1;

      WHILE
        bracket_size <
          qualified_team_count
      LOOP
        bracket_size :=
          bracket_size * 2;
      END LOOP;
    END IF;


    IF qualified_team_count < 2
      OR bracket_size < 2
    THEN
      CONTINUE;
    END IF;


    total_rounds := 0;
    bracket_size_cursor :=
      bracket_size;

    WHILE bracket_size_cursor > 1
    LOOP
      bracket_size_cursor :=
        bracket_size_cursor / 2;

      total_rounds :=
        total_rounds + 1;
    END LOOP;


    /*
     * Momento em que a fase de grupos desta competição termina.
     *
     * O primeiro jogo efetivamente disputado do mata-mata pode
     * começar exatamente neste horário. Não existe descanso
     * adicional obrigatório no mata-mata.
     */
    SELECT
      COUNT(*)::integer,

      COALESCE(
        bool_and(
          matches_table.start_time IS NOT NULL
          AND matches_table.end_time IS NOT NULL
        ),
        false
      ),

      MAX(matches_table.end_time)

    INTO
      group_match_count,
      group_schedule_complete,
      group_ready_at

    FROM public.championship_bracket_matches
      AS bracket_matches_table

    JOIN public.matches
      AS matches_table
      ON matches_table.id =
        bracket_matches_table.match_id

    WHERE bracket_matches_table.competition_id =
        competition_record.id

      AND bracket_matches_table.phase =
        'GROUP_STAGE'::public.bracket_phase;


    IF group_match_count < 1
      OR group_schedule_complete IS NOT TRUE
      OR group_ready_at IS NULL
    THEN
      INSERT INTO
        tmp_knockout_schedule_conflicts (
          conflict_code,
          conflict_message,
          competition_id
        )
      VALUES (
        'GROUP_STAGE_NOT_SCHEDULED',

        'A fase de grupos da competição não possui todos os horários necessários para determinar o início do mata-mata.',

        competition_record.id
      );
    END IF;


    FOR round_number_value IN
      1..total_rounds
    LOOP
      round_match_count :=
        power(
          2,
          total_rounds
            - round_number_value
        )::integer;


      FOR slot_number_value IN
        1..round_match_count
      LOOP
        is_bye_value := false;


        /*
         * O gerador oficial usa a ordem:
         *
         * 1 x último seed
         * 2 x penúltimo seed
         * 3 x antepenúltimo seed
         * ...
         *
         * Portanto os BYEs da primeira rodada podem ser previstos
         * apenas com a quantidade de classificados, sem conhecer
         * quais atléticas serão classificadas.
         */
        IF round_number_value = 1
          AND qualified_team_count <
            bracket_size
        THEN
          first_round_home_seed :=
            slot_number_value;

          first_round_away_seed :=
            bracket_size
              + 1
              - slot_number_value;

          is_bye_value :=
            (
              first_round_home_seed >
                qualified_team_count
            )
            <>
            (
              first_round_away_seed >
                qualified_team_count
            );
        END IF;


        SELECT EXISTS (
          SELECT 1
          FROM tmp_knockout_manual_finals
            AS manual_finals_table
          WHERE manual_finals_table.competition_id =
              competition_record.id

            AND manual_finals_table.expected_final_round =
              round_number_value
        )
        INTO is_manual_final_value;


        is_manual_final_value :=
          is_manual_final_value
          AND round_number_value =
            total_rounds
          AND slot_number_value = 1;


        INSERT INTO
          tmp_knockout_pending_matches (
            competition_id,
            sport_id,
            naipe,
            division,
            total_rounds,
            round_number,
            slot_number,
            duration_minutes,
            is_bye,
            is_manual_final,
            group_ready_at,
            planned_start_at,
            planned_end_at
          )
        VALUES (
          competition_record.id,
          competition_record.sport_id,
          competition_record.naipe,
          competition_record.division,
          total_rounds,
          round_number_value,
          slot_number_value,
          competition_record.duration_minutes,
          is_bye_value,
          is_manual_final_value,
          group_ready_at,

          CASE
            WHEN is_bye_value
            THEN group_ready_at
            ELSE NULL
          END,

          CASE
            WHEN is_bye_value
            THEN group_ready_at
            ELSE NULL
          END
        );
      END LOOP;
    END LOOP;
  END LOOP;


  /*
   * Agenda das partidas automáticas.
   *
   * A cada iteração escolhemos globalmente o próximo horário
   * cronológico possível entre todas as partidas cujas dependências
   * já estão resolvidas.
   */
  LOOP
    SELECT COUNT(*)::integer
    INTO remaining_automatic_count
    FROM tmp_knockout_pending_matches
      AS pending_table
    WHERE pending_table.is_bye = false
      AND pending_table.is_manual_final = false
      AND pending_table.failed = false
      AND pending_table.planned_start_at
        IS NULL;


    EXIT WHEN
      remaining_automatic_count = 0;


    best_pending_row_id := NULL;

    best_start_at := NULL;
    best_end_at := NULL;

    best_scheduled_date := NULL;
    best_schedule_period := NULL;

    best_location_name := NULL;
    best_court_name := NULL;

    best_location_group_id := NULL;
    best_court_group_id := NULL;

    best_bracket_day_id := NULL;
    best_bracket_court_id := NULL;

    best_duration_minutes := NULL;

    best_priority_rank := NULL;
    best_location_position := NULL;
    best_court_position := NULL;


    FOR pending_record IN
      SELECT
        pending_table.*
      FROM tmp_knockout_pending_matches
        AS pending_table
      WHERE pending_table.is_bye = false
        AND pending_table.is_manual_final = false
        AND pending_table.failed = false
        AND pending_table.planned_start_at
          IS NULL
      ORDER BY
        pending_table.round_number ASC,
        pending_table.competition_id ASC,
        pending_table.slot_number ASC
    LOOP
      dependency_ready_at := NULL;


      IF pending_record.round_number = 1
      THEN
        dependency_ready_at :=
          pending_record.group_ready_at;
      ELSE
        SELECT
          COUNT(*)::integer,

          MAX(
            feeder_table.planned_end_at
          )
        INTO
          feeder_count,
          dependency_ready_at
        FROM tmp_knockout_pending_matches
          AS feeder_table
        WHERE feeder_table.competition_id =
            pending_record.competition_id

          AND feeder_table.round_number =
            pending_record.round_number - 1

          AND feeder_table.slot_number IN (
            (pending_record.slot_number * 2) - 1,
            pending_record.slot_number * 2
          )

          AND feeder_table.failed = false

          AND feeder_table.planned_end_at
            IS NOT NULL;


        IF feeder_count <> 2
        THEN
          dependency_ready_at := NULL;
        END IF;
      END IF;


      /*
       * Enquanto as partidas alimentadoras não possuírem horário,
       * este nó ainda não pode competir por uma vaga na agenda.
       */
      IF dependency_ready_at IS NULL
      THEN
        CONTINUE;
      END IF;


      resolved_phase :=
        public.resolve_bracket_knockout_match_phase(
          pending_record.round_number,
          pending_record.total_rounds,
          false
        );


      resolved_division_scope :=
        public.resolve_bracket_knockout_division_scope(
          pending_record.division
        );


      resolved_preferred_court_group_id :=
        public
          .resolve_bracket_knockout_priority_court_group_id(
            _bracket_edition_id,
            pending_record.sport_id,
            resolved_phase,
            resolved_division_scope
          );


      competition_key_value :=
        pending_record.sport_id::text
        || '::'
        || pending_record.naipe::text
        || '::'
        || COALESCE(
          pending_record.division::text,
          'WITHOUT_DIVISION'
        );


      FOR court_record IN
        SELECT
          days_table.id
            AS bracket_day_id,

          days_table.event_date,

          days_table.start_time
            AS day_start_time,

          days_table.end_time
            AS day_end_time,

          days_table.break_start_time,
          days_table.break_end_time,

          locations_table.name
            AS location_name,

          locations_table.location_group_id,

          locations_table.position
            AS location_position,

          courts_table.id
            AS bracket_court_id,

          courts_table.name
            AS court_name,

          courts_table.court_group_id,

          courts_table.position
            AS court_position,

          court_sports_table.sequence_mode,
          court_sports_table.preferred_naipe,
          court_sports_table.preferred_division

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
            _bracket_edition_id

          AND court_sports_table.sport_id =
            pending_record.sport_id

        ORDER BY
          days_table.event_date ASC,
          locations_table.position ASC,
          courts_table.position ASC,
          locations_table.name ASC,
          courts_table.name ASC
      LOOP
        /*
         * GROUP_NAIPE:
         *
         * enquanto ainda existir qualquer partida automática
         * pendente do naipe preferencial daquela modalidade,
         * os outros naipes não utilizam esta quadra.
         *
         * Isso é deliberadamente estrito:
         * se o naipe ativo estiver temporariamente impedido,
         * a quadra pode ficar vazia em vez de quebrar o agrupamento.
         *
         * Finais manuais não participam deste bloqueio.
         */
        IF court_record.sequence_mode =
            'GROUP_NAIPE'
              ::public.bracket_court_sequence_mode

          AND court_record.preferred_naipe
            IS NOT NULL

          AND pending_record.naipe IS DISTINCT FROM
            court_record.preferred_naipe

          AND EXISTS (
            SELECT 1
            FROM tmp_knockout_pending_matches
              AS strict_pending_table
            WHERE strict_pending_table.sport_id =
                pending_record.sport_id

              AND strict_pending_table.naipe =
                court_record.preferred_naipe

              AND strict_pending_table.is_bye =
                false

              AND strict_pending_table.is_manual_final =
                false

              AND strict_pending_table.failed =
                false

              AND strict_pending_table.planned_start_at
                IS NULL
          )
        THEN
          CONTINUE;
        END IF;


        /*
         * GROUP_DIVISION:
         *
         * mesma regra, agora pelo agrupamento Principal/Acesso.
         */
        IF court_record.sequence_mode =
            'GROUP_DIVISION'
              ::public.bracket_court_sequence_mode

          AND court_record.preferred_division
            IS NOT NULL

          AND pending_record.division
            IS DISTINCT FROM
              court_record.preferred_division

          AND EXISTS (
            SELECT 1
            FROM tmp_knockout_pending_matches
              AS strict_pending_table
            WHERE strict_pending_table.sport_id =
                pending_record.sport_id

              AND strict_pending_table.division =
                court_record.preferred_division

              AND strict_pending_table.is_bye =
                false

              AND strict_pending_table.is_manual_final =
                false

              AND strict_pending_table.failed =
                false

              AND strict_pending_table.planned_start_at
                IS NULL
          )
        THEN
          CONTINUE;
        END IF;


        day_start_at :=
          public.combine_bracket_schedule_timestamp(
            court_record.event_date,
            court_record.day_start_time
          );


        day_end_at :=
          public.combine_bracket_schedule_timestamp(
            court_record.event_date,
            court_record.day_end_time
          );


        day_middle_at :=
          day_start_at
          + (
            (
              day_end_at
              - day_start_at
            ) / 2.0
          );


        FOR period_record IN
          SELECT
            'MATUTINO'
              ::public.championship_schedule_period
                AS period

          UNION ALL

          SELECT
            'VESPERTINO'
              ::public.championship_schedule_period
                AS period
        LOOP
          /*
           * Períodos globais desabilitados continuam sendo
           * restrições duras.
           */
          IF NOT public.is_schedule_period_enabled_by_payload(
            edition_record.payload_snapshot,
            court_record.event_date,
            period_record.period
          )
          THEN
            CONTINUE;
          END IF;


          /*
           * Disponibilidade da modalidade/naipe/divisão da etapa 9.
           *
           * Esta verificação vale para o mata-mata.
           *
           * Não existe aqui qualquer consulta à disponibilidade
           * específica das atléticas da etapa 10.
           */
          IF NOT public.is_competition_period_enabled_by_payload(
            edition_record.payload_snapshot,
            competition_key_value,
            court_record.event_date,
            period_record.period
          )
          THEN
            CONTINUE;
          END IF;


          /*
           * Bloqueios HARD representam ocupação exclusiva do recurso.
           */
          IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(
                  edition_record.payload_snapshot
                    -> 'resource_locks'
                ) = 'array'
                THEN
                  edition_record.payload_snapshot
                    -> 'resource_locks'
                ELSE
                  '[]'::jsonb
              END
            ) AS lock_record(value)

            WHERE COALESCE(
              lock_record.value ->> 'lock_mode',
              ''
            ) = 'HARD'

              AND NULLIF(
                lock_record.value ->> 'date',
                ''
              )::date =
                court_record.event_date

              AND COALESCE(
                lock_record.value ->> 'period',
                ''
              ) =
                period_record.period::text

              AND public.normalize_bracket_entity_name(
                COALESCE(
                  lock_record.value
                    ->> 'location_name',
                  ''
                )
              ) =
                public.normalize_bracket_entity_name(
                  court_record.location_name
                )

              AND public.normalize_bracket_entity_name(
                COALESCE(
                  lock_record.value
                    ->> 'court_name',
                  ''
                )
              ) =
                public.normalize_bracket_entity_name(
                  court_record.court_name
                )
          )
          THEN
            CONTINUE;
          END IF;


          IF period_record.period =
            'MATUTINO'
              ::public.championship_schedule_period
          THEN
            period_start_at :=
              day_start_at;

            period_end_at :=
              CASE
                WHEN court_record.break_start_time
                  IS NOT NULL

                  AND court_record.break_start_time >
                    court_record.day_start_time
                THEN
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    court_record.break_start_time
                  )

                ELSE
                  day_middle_at
              END;
          ELSE
            period_start_at :=
              CASE
                WHEN court_record.break_end_time
                  IS NOT NULL

                  AND court_record.break_end_time <
                    court_record.day_end_time
                THEN
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    court_record.break_end_time
                  )

                ELSE
                  day_middle_at
              END;

            period_end_at :=
              day_end_at;
          END IF;


          IF period_start_at >=
            period_end_at
          THEN
            CONTINUE;
          END IF;


          candidate_start_at :=
            GREATEST(
              period_start_at,
              dependency_ready_at
            );


          IF candidate_start_at >=
            period_end_at
          THEN
            CONTINUE;
          END IF;


          candidate_is_valid :=
            false;


          /*
           * Empurra o início para frente enquanto houver:
           *
           * - partida existente;
           * - reserva automática já calculada;
           * - final manual fixa;
           * - pausa geral;
           * - pausa específica da quadra.
           *
           * Como o próximo início sempre se torna o fim de algum
           * conflito, não precisamos utilizar intervalos artificiais
           * ou arredondamento de minutos.
           */
          LOOP
            candidate_end_at :=
              candidate_start_at
              + make_interval(
                mins =>
                  pending_record.duration_minutes
              );


            IF candidate_end_at >
              period_end_at
            THEN
              EXIT;
            END IF;


            candidate_conflict_end_at :=
              NULL;


            SELECT
              MAX(conflicts.conflict_end_at)
            INTO candidate_conflict_end_at
            FROM (
              /*
               * Partidas já materializadas:
               * grupos ou qualquer outro jogo real que ocupe a quadra.
               */
              SELECT
                matches_table.end_time
                  AS conflict_end_at

              FROM public.matches
                AS matches_table

              WHERE matches_table.start_time
                  IS NOT NULL

                AND matches_table.end_time
                  IS NOT NULL

                AND public.normalize_bracket_entity_name(
                  matches_table.location
                ) =
                  public.normalize_bracket_entity_name(
                    court_record.location_name
                  )

                AND public.normalize_bracket_entity_name(
                  COALESCE(
                    matches_table.court_name,
                    ''
                  )
                ) =
                  public.normalize_bracket_entity_name(
                    court_record.court_name
                  )

                AND matches_table.start_time <
                  candidate_end_at

                AND matches_table.end_time >
                  candidate_start_at


              UNION ALL


              /*
               * Reservas automáticas escolhidas anteriormente.
               */
              SELECT
                reservations_table.end_at
                  AS conflict_end_at

              FROM
                public
                  .championship_bracket_knockout_schedule_reservations
                    AS reservations_table

              WHERE reservations_table.bracket_edition_id =
                  _bracket_edition_id

                AND reservations_table.bracket_court_id =
                  court_record.bracket_court_id

                AND reservations_table.scheduled_date =
                  court_record.event_date

                AND reservations_table.start_at <
                  candidate_end_at

                AND reservations_table.end_at >
                  candidate_start_at


              UNION ALL


              /*
               * Finais manuais ainda não inseridas na tabela definitiva,
               * mas que já funcionam como ocupação fixa da quadra.
               */
              SELECT
                manual_finals_table.planned_end_at
                  AS conflict_end_at

              FROM tmp_knockout_manual_finals
                AS manual_finals_table

              WHERE manual_finals_table.scheduled_date =
                  court_record.event_date

                AND public.normalize_bracket_entity_name(
                  manual_finals_table.location_name
                ) =
                  public.normalize_bracket_entity_name(
                    court_record.location_name
                  )

                AND public.normalize_bracket_entity_name(
                  manual_finals_table.court_name
                ) =
                  public.normalize_bracket_entity_name(
                    court_record.court_name
                  )

                AND manual_finals_table.planned_start_at <
                  candidate_end_at

                AND manual_finals_table.planned_end_at >
                  candidate_start_at


              UNION ALL


              /*
               * Pausas modernas da agenda.
               */
              SELECT
                public.combine_bracket_schedule_timestamp(
                  court_record.event_date,
                  breaks_table.break_end_time
                ) AS conflict_end_at

              FROM public.championship_bracket_day_breaks
                AS breaks_table

              WHERE breaks_table.bracket_day_id =
                  court_record.bracket_day_id

                AND (
                  breaks_table.scope_type =
                    'ALL_COURTS'
                      ::public.bracket_day_break_scope_type

                  OR (
                    breaks_table.scope_type =
                      'COURT'
                        ::public.bracket_day_break_scope_type

                    AND breaks_table.bracket_court_id =
                      court_record.bracket_court_id
                  )
                )

                AND
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    breaks_table.break_start_time
                  ) <
                    candidate_end_at

                AND
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    breaks_table.break_end_time
                  ) >
                    candidate_start_at


              UNION ALL


              /*
               * Compatibilidade com o intervalo legado de pausa
               * ainda armazenado diretamente no dia.
               */
              SELECT
                public.combine_bracket_schedule_timestamp(
                  court_record.event_date,
                  court_record.break_end_time
                ) AS conflict_end_at

              WHERE court_record.break_start_time
                  IS NOT NULL

                AND court_record.break_end_time
                  IS NOT NULL

                AND
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    court_record.break_start_time
                  ) <
                    candidate_end_at

                AND
                  public.combine_bracket_schedule_timestamp(
                    court_record.event_date,
                    court_record.break_end_time
                  ) >
                    candidate_start_at
            ) AS conflicts;


            IF candidate_conflict_end_at
              IS NULL
            THEN
              candidate_is_valid :=
                true;

              EXIT;
            END IF;


            candidate_start_at :=
              candidate_conflict_end_at;


            IF candidate_start_at >=
              period_end_at
            THEN
              EXIT;
            END IF;
          END LOOP;


          IF candidate_is_valid
            IS NOT TRUE
          THEN
            CONTINUE;
          END IF;


          candidate_priority_rank :=
            CASE
              WHEN resolved_preferred_court_group_id
                IS NOT NULL

                AND court_record.court_group_id =
                  resolved_preferred_court_group_id

              THEN 0
              ELSE 1
            END;


          /*
           * Seleciona globalmente o horário mais cedo.
           *
           * Para empates no mesmo instante:
           * 1. prioridade de quadra do mata-mata;
           * 2. posição do local;
           * 3. posição da quadra;
           * 4. identificador da partida projetada.
           */
          IF best_pending_row_id
              IS NULL

            OR candidate_start_at <
              best_start_at

            OR (
              candidate_start_at =
                best_start_at

              AND candidate_priority_rank <
                best_priority_rank
            )

            OR (
              candidate_start_at =
                best_start_at

              AND candidate_priority_rank =
                best_priority_rank

              AND court_record.location_position <
                best_location_position
            )

            OR (
              candidate_start_at =
                best_start_at

              AND candidate_priority_rank =
                best_priority_rank

              AND court_record.location_position =
                best_location_position

              AND court_record.court_position <
                best_court_position
            )

            OR (
              candidate_start_at =
                best_start_at

              AND candidate_priority_rank =
                best_priority_rank

              AND court_record.location_position =
                best_location_position

              AND court_record.court_position =
                best_court_position

              AND pending_record.row_id <
                best_pending_row_id
            )
          THEN
            best_pending_row_id :=
              pending_record.row_id;

            best_start_at :=
              candidate_start_at;

            best_end_at :=
              candidate_end_at;

            best_scheduled_date :=
              court_record.event_date;

            best_schedule_period :=
              period_record.period;

            best_location_name :=
              court_record.location_name;

            best_court_name :=
              court_record.court_name;

            best_location_group_id :=
              court_record.location_group_id;

            best_court_group_id :=
              court_record.court_group_id;

            best_bracket_day_id :=
              court_record.bracket_day_id;

            best_bracket_court_id :=
              court_record.bracket_court_id;

            best_duration_minutes :=
              pending_record.duration_minutes;

            best_priority_rank :=
              candidate_priority_rank;

            best_location_position :=
              court_record.location_position;

            best_court_position :=
              court_record.court_position;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;


    /*
     * Nenhuma partida atualmente elegível encontrou horário.
     *
     * Em modo de preview marcamos uma partida como falha,
     * liberando o restante da simulação para produzir o máximo
     * possível da agenda e mostrar os demais horários ao usuário.
     */
    IF best_pending_row_id IS NULL
    THEN
      SELECT
        pending_table.*
      INTO pending_record
      FROM tmp_knockout_pending_matches
        AS pending_table
      WHERE pending_table.is_bye = false
        AND pending_table.is_manual_final = false
        AND pending_table.failed = false
        AND pending_table.planned_start_at
          IS NULL
      ORDER BY
        pending_table.round_number ASC,
        pending_table.competition_id ASC,
        pending_table.slot_number ASC
      LIMIT 1;


      IF pending_record.row_id IS NULL
      THEN
        EXIT;
      END IF;


      IF pending_record.round_number = 1
      THEN
        dependency_ready_at :=
          pending_record.group_ready_at;
      ELSE
        SELECT
          COUNT(*)::integer,
          MAX(feeder_table.planned_end_at)
        INTO
          feeder_count,
          dependency_ready_at
        FROM tmp_knockout_pending_matches
          AS feeder_table
        WHERE feeder_table.competition_id =
            pending_record.competition_id

          AND feeder_table.round_number =
            pending_record.round_number - 1

          AND feeder_table.slot_number IN (
            (pending_record.slot_number * 2) - 1,
            pending_record.slot_number * 2
          )

          AND feeder_table.failed = false

          AND feeder_table.planned_end_at
            IS NOT NULL;


        IF feeder_count <> 2
        THEN
          dependency_ready_at := NULL;
        END IF;
      END IF;


      INSERT INTO
        tmp_knockout_schedule_conflicts (
          conflict_code,
          conflict_message,
          competition_id,
          round_number,
          slot_number
        )
      VALUES (
        CASE
          WHEN dependency_ready_at IS NULL
          THEN
            'KNOCKOUT_DEPENDENCY_UNSCHEDULED'
          ELSE
            'KNOCKOUT_NO_AVAILABLE_SLOT'
        END,

        CASE
          WHEN dependency_ready_at IS NULL
          THEN
            'Não foi possível programar esta partida porque uma das partidas alimentadoras não possui horário válido.'
          ELSE
            'Não existe janela de agenda compatível para programar esta partida do mata-mata após a conclusão de suas dependências.'
        END,

        pending_record.competition_id,
        pending_record.round_number,
        pending_record.slot_number
      );


      UPDATE tmp_knockout_pending_matches
      SET failed = true
      WHERE row_id =
        pending_record.row_id;


      CONTINUE;
    END IF;


    SELECT
      pending_table.*
    INTO pending_record
    FROM tmp_knockout_pending_matches
      AS pending_table
    WHERE pending_table.row_id =
      best_pending_row_id;


    /*
     * scheduled_slot / queue_position permanecem valores
     * operacionais.
     *
     * A numeração visual COURT / SPORT_NAIPE é calculada
     * separadamente e não utiliza estes campos.
     */
    SELECT
      (
        1

        + COUNT(*) FILTER (
          WHERE chronology.source_type =
            'MATCH'
        )

        + COUNT(*) FILTER (
          WHERE chronology.source_type =
            'RESERVATION'
        )

        + COUNT(*) FILTER (
          WHERE chronology.source_type =
            'MANUAL_FINAL'
        )
      )::integer

    INTO selected_scheduled_slot

    FROM (
      SELECT
        'MATCH'::text
          AS source_type,

        matches_table.start_time
          AS start_at

      FROM public.matches
        AS matches_table

      WHERE matches_table.start_time
          IS NOT NULL

        AND public.normalize_bracket_entity_name(
          matches_table.location
        ) =
          public.normalize_bracket_entity_name(
            best_location_name
          )

        AND public.normalize_bracket_entity_name(
          COALESCE(
            matches_table.court_name,
            ''
          )
        ) =
          public.normalize_bracket_entity_name(
            best_court_name
          )

        AND (
          matches_table.start_time
          AT TIME ZONE 'America/Sao_Paulo'
        )::date =
          best_scheduled_date

        AND matches_table.start_time <
          best_start_at


      UNION ALL


      SELECT
        'RESERVATION'::text,

        reservations_table.start_at

      FROM
        public
          .championship_bracket_knockout_schedule_reservations
            AS reservations_table

      WHERE reservations_table.bracket_edition_id =
          _bracket_edition_id

        AND reservations_table.bracket_court_id =
          best_bracket_court_id

        AND reservations_table.scheduled_date =
          best_scheduled_date

        AND reservations_table.start_at <
          best_start_at


      UNION ALL


      SELECT
        'MANUAL_FINAL'::text,

        manual_finals_table.planned_start_at

      FROM tmp_knockout_manual_finals
        AS manual_finals_table

      WHERE manual_finals_table.scheduled_date =
          best_scheduled_date

        AND public.normalize_bracket_entity_name(
          manual_finals_table.location_name
        ) =
          public.normalize_bracket_entity_name(
            best_location_name
          )

        AND public.normalize_bracket_entity_name(
          manual_finals_table.court_name
        ) =
          public.normalize_bracket_entity_name(
            best_court_name
          )

        AND manual_finals_table.planned_start_at <
          best_start_at
    ) AS chronology;


    selected_scheduled_slot :=
      GREATEST(
        1,
        COALESCE(
          selected_scheduled_slot,
          1
        )
      );


    selected_queue_position :=
      selected_scheduled_slot;


    INSERT INTO
      public
        .championship_bracket_knockout_schedule_reservations (
          bracket_edition_id,
          competition_id,

          round_number,
          slot_number,

          is_third_place,

          scheduled_date,
          schedule_period,

          location_name,
          court_name,

          location_group_id,
          court_group_id,

          bracket_day_id,
          bracket_court_id,

          scheduled_slot,
          queue_position,

          start_at,
          end_at,

          duration_minutes,

          is_manual_final
        )
    VALUES (
      _bracket_edition_id,
      pending_record.competition_id,

      pending_record.round_number,
      pending_record.slot_number,

      false,

      best_scheduled_date,
      best_schedule_period,

      best_location_name,
      best_court_name,

      best_location_group_id,
      best_court_group_id,

      best_bracket_day_id,
      best_bracket_court_id,

      selected_scheduled_slot,
      selected_queue_position,

      best_start_at,
      best_end_at,

      best_duration_minutes,

      false
    );


    UPDATE tmp_knockout_pending_matches
    SET
      planned_start_at =
        best_start_at,

      planned_end_at =
        best_end_at

    WHERE row_id =
      best_pending_row_id;
  END LOOP;


  /*
   * As finais manuais são materializadas por último.
   *
   * Seus horários, entretanto, já foram considerados como bloqueios
   * fixos durante todo o planejamento automático.
   */
  FOR manual_final_record IN
    SELECT
      manual_finals_table.*
    FROM tmp_knockout_manual_finals
      AS manual_finals_table
    ORDER BY
      manual_finals_table.planned_start_at ASC,
      manual_finals_table.display_order ASC,
      manual_finals_table.naipe_position ASC
  LOOP
    SELECT
      pending_table.*
    INTO pending_record
    FROM tmp_knockout_pending_matches
      AS pending_table
    WHERE pending_table.competition_id =
        manual_final_record.competition_id

      AND pending_table.round_number =
        manual_final_record.expected_final_round

      AND pending_table.slot_number = 1
    LIMIT 1;


    IF pending_record.row_id IS NULL
    THEN
      INSERT INTO
        tmp_knockout_schedule_conflicts (
          conflict_code,
          conflict_message,
          competition_id,
          round_number,
          slot_number
        )
      VALUES (
        'MANUAL_FINAL_WITHOUT_PROJECTED_MATCH',

        'A final manual configurada não corresponde a uma final projetada válida para esta competição.',

        manual_final_record.competition_id,
        manual_final_record.expected_final_round,
        1
      );

      CONTINUE;
    END IF;


    manual_dependency_ready_at :=
      NULL;


    IF pending_record.round_number = 1
    THEN
      manual_dependency_ready_at :=
        pending_record.group_ready_at;
    ELSE
      SELECT
        COUNT(*)::integer,
        MAX(feeder_table.planned_end_at)
      INTO
        feeder_count,
        manual_dependency_ready_at
      FROM tmp_knockout_pending_matches
        AS feeder_table
      WHERE feeder_table.competition_id =
          pending_record.competition_id

        AND feeder_table.round_number =
          pending_record.round_number - 1

        AND feeder_table.slot_number IN (
          1,
          2
        )

        AND feeder_table.failed = false

        AND feeder_table.planned_end_at
          IS NOT NULL;


      IF feeder_count <> 2
      THEN
        manual_dependency_ready_at :=
          NULL;
      END IF;
    END IF;


    /*
     * Regra deliberada:
     *
     * semifinal termina 14:00
     * final manual começa 14:00
     * => válido.
     *
     * semifinal termina 14:01
     * final manual começa 14:00
     * => conflito.
     *
     * A final nunca é deslocada automaticamente.
     */
    IF manual_dependency_ready_at
        IS NULL

      OR manual_dependency_ready_at >
        manual_final_record.planned_start_at
    THEN
      INSERT INTO
        tmp_knockout_schedule_conflicts (
          conflict_code,
          conflict_message,
          competition_id,
          round_number,
          slot_number
        )
      VALUES (
        'MANUAL_FINAL_DEPENDENCY_CONFLICT',

        CASE
          WHEN manual_dependency_ready_at
            IS NULL
          THEN
            'A final manual não pode ser validada porque uma das partidas alimentadoras não possui horário válido.'
          ELSE
            'A final manual está programada antes da conclusão de uma das partidas alimentadoras. A final não será deslocada automaticamente.'
        END,

        manual_final_record.competition_id,
        manual_final_record.expected_final_round,
        1
      );
    END IF;


    INSERT INTO
      public
        .championship_bracket_knockout_schedule_reservations (
          bracket_edition_id,
          competition_id,

          round_number,
          slot_number,

          is_third_place,

          scheduled_date,
          schedule_period,

          location_name,
          court_name,

          location_group_id,
          court_group_id,

          bracket_day_id,
          bracket_court_id,

          scheduled_slot,
          queue_position,

          start_at,
          end_at,

          duration_minutes,

          is_manual_final
        )
    VALUES (
      _bracket_edition_id,
      manual_final_record.competition_id,

      manual_final_record.expected_final_round,
      1,

      false,

      manual_final_record.scheduled_date,
      manual_final_record.schedule_period,

      manual_final_record.location_name,
      manual_final_record.court_name,

      manual_final_record.location_group_id,
      manual_final_record.court_group_id,

      manual_final_record.bracket_day_id,
      manual_final_record.bracket_court_id,

      GREATEST(
        1,
        manual_final_record.planned_scheduled_slot
      ),

      GREATEST(
        1,
        manual_final_record.planned_queue_position
      ),

      manual_final_record.planned_start_at,
      manual_final_record.planned_end_at,

      manual_final_record.duration_minutes,

      true
    )
    ON CONFLICT (
      competition_id,
      round_number,
      slot_number
    )
    DO UPDATE SET
      bracket_edition_id =
        EXCLUDED.bracket_edition_id,

      scheduled_date =
        EXCLUDED.scheduled_date,

      schedule_period =
        EXCLUDED.schedule_period,

      location_name =
        EXCLUDED.location_name,

      court_name =
        EXCLUDED.court_name,

      location_group_id =
        EXCLUDED.location_group_id,

      court_group_id =
        EXCLUDED.court_group_id,

      bracket_day_id =
        EXCLUDED.bracket_day_id,

      bracket_court_id =
        EXCLUDED.bracket_court_id,

      scheduled_slot =
        EXCLUDED.scheduled_slot,

      queue_position =
        EXCLUDED.queue_position,

      start_at =
        EXCLUDED.start_at,

      end_at =
        EXCLUDED.end_at,

      duration_minutes =
        EXCLUDED.duration_minutes,

      is_manual_final =
        true;


    UPDATE tmp_knockout_pending_matches
    SET
      planned_start_at =
        manual_final_record.planned_start_at,

      planned_end_at =
        manual_final_record.planned_end_at

    WHERE row_id =
      pending_record.row_id;
  END LOOP;


  SELECT
    COUNT(*)::integer
  INTO expected_match_count
  FROM tmp_knockout_pending_matches
    AS pending_table
  WHERE pending_table.is_bye =
    false;


  SELECT
    COUNT(*)::integer
  INTO scheduled_match_count
  FROM
    public
      .championship_bracket_knockout_schedule_reservations
        AS reservations_table
  WHERE reservations_table.bracket_edition_id =
    _bracket_edition_id;


  SELECT
    COUNT(*)::integer
  INTO conflict_count
  FROM tmp_knockout_schedule_conflicts;


  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'code',
          conflicts_table.conflict_code,

          'message',
          conflicts_table.conflict_message,

          'competition_id',
          conflicts_table.competition_id,

          'round_number',
          conflicts_table.round_number,

          'slot_number',
          conflicts_table.slot_number
        )
        ORDER BY
          conflicts_table.row_id ASC
      ),
      '[]'::jsonb
    )
  INTO result_conflicts
  FROM tmp_knockout_schedule_conflicts
    AS conflicts_table;


  /*
   * Uma diferença entre a quantidade esperada e a quantidade
   * reservada também é considerada conflito, mesmo que nenhuma
   * mensagem específica tenha sido registrada anteriormente.
   */
  IF scheduled_match_count <>
      expected_match_count

    AND NOT EXISTS (
      SELECT 1
      FROM tmp_knockout_schedule_conflicts
    )
  THEN
    INSERT INTO
      tmp_knockout_schedule_conflicts (
        conflict_code,
        conflict_message
      )
    VALUES (
      'KNOCKOUT_INCOMPLETE_SCHEDULE',

      format(
        'A agenda do mata-mata reservou %s de %s partidas projetadas.',
        scheduled_match_count,
        expected_match_count
      )
    );


    conflict_count :=
      conflict_count + 1;


    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'code',
            conflicts_table.conflict_code,

            'message',
            conflicts_table.conflict_message,

            'competition_id',
            conflicts_table.competition_id,

            'round_number',
            conflicts_table.round_number,

            'slot_number',
            conflicts_table.slot_number
          )
          ORDER BY
            conflicts_table.row_id ASC
        ),
        '[]'::jsonb
      )
    INTO result_conflicts
    FROM tmp_knockout_schedule_conflicts
      AS conflicts_table;
  END IF;


  IF _strict
    AND conflict_count > 0
  THEN
    SELECT
      conflicts_table.conflict_message
    INTO first_conflict_message
    FROM tmp_knockout_schedule_conflicts
      AS conflicts_table
    ORDER BY
      conflicts_table.row_id ASC
    LIMIT 1;


    RAISE EXCEPTION
      'Não foi possível reservar toda a agenda do mata-mata: %',
      COALESCE(
        first_conflict_message,
        'existem conflitos de programação.'
      );
  END IF;


  RETURN jsonb_build_object(
    'ok',
      conflict_count = 0
      AND scheduled_match_count =
        expected_match_count,

    'expected_matches',
      expected_match_count,

    'scheduled_matches',
      scheduled_match_count,

    'conflict_count',
      conflict_count,

    'conflicts',
      result_conflicts
  );
END;
$function$;


COMMENT ON FUNCTION
  public.rebuild_championship_knockout_schedule_reservations(
    UUID,
    BOOLEAN
  )
IS
  'Reconstrói as reservas autoritativas do mata-mata sem depender dos classificados. Respeita dependências entre rodadas, disponibilidade da competição, períodos, pausas, recursos, compatibilidade de quadra e finais manuais; não aplica disponibilidade específica das atléticas nem descanso mínimo no mata-mata.';


REVOKE ALL ON FUNCTION
  public.rebuild_championship_knockout_schedule_reservations(
    UUID,
    BOOLEAN
  )
FROM PUBLIC, anon, authenticated;


NOTIFY pgrst, 'reload schema';