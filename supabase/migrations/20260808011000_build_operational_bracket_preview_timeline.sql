-- Constrói a timeline operacional anonimizada da Etapa 13.
--
-- A função utiliza o estado temporário criado por
-- generate_championship_bracket_groups() e as reservas temporárias
-- calculadas por rebuild_championship_knockout_schedule_reservations().
--
-- Nenhum nome ou identificador de atlética é retornado.
--
-- A timeline contém:
-- - jogos da fase de grupos;
-- - mata-mata projetado;
-- - finais manuais;
-- - intervalos;
-- - sessões individuais;
-- - bloqueios/reservas de recurso;
-- - janelas vazias.
--
-- match_number é exclusivamente visual:
-- - COURT: sequência por local + quadra entre todos os dias;
-- - SPORT_NAIPE: sequência por modalidade + naipe entre todos os dias.
--
-- queue_position e scheduled_slot continuam sendo conceitos
-- operacionais e não são reutilizados como numeração visual.


CREATE OR REPLACE FUNCTION
  public.build_championship_bracket_operational_preview(
    _bracket_edition_id UUID,
    _payload JSONB,
    _knockout_result JSONB
  )
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  edition_record RECORD;

  match_numbering_mode_value TEXT;

  group_stage_match_count INTEGER := 0;
  expected_knockout_match_count INTEGER := 0;
  scheduled_match_count INTEGER := 0;

  occupied_minutes_value INTEGER := 0;
  available_minutes_value INTEGER := 0;
  free_windows_value INTEGER := 0;

  conflict_count_value INTEGER := 0;

  utilization_percentage_value NUMERIC := 0;

  summary_result JSONB;
  days_result JSONB;

  strict_blocked_table_exists BOOLEAN := false;
BEGIN
  SELECT
    editions_table.id,
    editions_table.championship_id,
    editions_table.season_year
  INTO edition_record
  FROM public.championship_bracket_editions
    AS editions_table
  WHERE editions_table.id =
    _bracket_edition_id
  LIMIT 1;


  IF edition_record.id IS NULL THEN
    RAISE EXCEPTION
      'Edição inválida para montar a prévia operacional.';
  END IF;


  match_numbering_mode_value :=
    CASE
      WHEN COALESCE(
        _payload ->> 'match_numbering_mode',
        ''
      ) = 'SPORT_NAIPE'
      THEN
        'SPORT_NAIPE'

      ELSE
        'COURT'
    END;


  /*
   * Entradas concretas da timeline.
   *
   * EMPTY será incluído posteriormente, depois da união dos
   * intervalos ocupados.
   */
  DROP TABLE IF EXISTS
    tmp_bracket_preview_entries;

  CREATE TEMP TABLE
    tmp_bracket_preview_entries (
      row_id BIGSERIAL PRIMARY KEY,

      entry_type TEXT NOT NULL,

      scheduled_date DATE NOT NULL,

      bracket_day_id UUID NOT NULL,
      bracket_court_id UUID NOT NULL,

      location_group_id UUID NOT NULL,
      court_group_id UUID NOT NULL,

      location_name TEXT NOT NULL,
      court_name TEXT NOT NULL,

      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,

      duration_minutes INTEGER NOT NULL,

      match_kind TEXT NULL,
      match_number INTEGER NULL,

      sport_id UUID NULL,
      sport_name TEXT NULL,

      naipe public.match_naipe NULL,
      division public.team_division NULL,

      phase TEXT NULL,
      phase_label TEXT NULL,

      group_number INTEGER NULL,
      round_number INTEGER NULL,

      projected BOOLEAN NOT NULL DEFAULT false,
      manual_final BOOLEAN NOT NULL DEFAULT false,

      reason_code TEXT NULL,
      reason TEXT NULL,

      operational_order INTEGER NULL,

      source_identity TEXT NULL
    )
  ON COMMIT DROP;


  /*
   * Jogos reais da fase de grupos.
   *
   * Não selecionamos home_team_id / away_team_id.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      match_kind,

      sport_id,
      sport_name,

      naipe,
      division,

      phase,
      phase_label,

      group_number,
      round_number,

      projected,
      manual_final,

      operational_order,

      source_identity
    )
  SELECT
    'MATCH',

    matches_table.scheduled_date,

    days_table.id,
    courts_table.id,

    locations_table.location_group_id,
    courts_table.court_group_id,

    locations_table.name,
    courts_table.name,

    matches_table.start_time,
    matches_table.end_time,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            matches_table.end_time
            - matches_table.start_time
          )
        ) / 60.0
      )::integer
    ),

    'GROUP_STAGE',

    competitions_table.sport_id,
    sports_table.name,

    competitions_table.naipe,
    competitions_table.division,

    'GROUP_STAGE',
    'Grupos',

    groups_table.group_number,
    1,

    false,
    false,

    COALESCE(
      matches_table.scheduled_slot,
      matches_table.queue_position,
      bracket_matches_table.slot_number
    ),

    matches_table.id::text

  FROM public.championship_bracket_matches
    AS bracket_matches_table

  JOIN public.matches
    AS matches_table
    ON matches_table.id =
      bracket_matches_table.match_id

  JOIN public.championship_bracket_competitions
    AS competitions_table
    ON competitions_table.id =
      bracket_matches_table.competition_id

  LEFT JOIN public.championship_bracket_groups
    AS groups_table
    ON groups_table.id =
      bracket_matches_table.group_id

  LEFT JOIN public.sports
    AS sports_table
    ON sports_table.id =
      competitions_table.sport_id

  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.bracket_edition_id =
      _bracket_edition_id

    AND days_table.event_date =
      matches_table.scheduled_date

  JOIN public.championship_bracket_locations
    AS locations_table
    ON locations_table.bracket_day_id =
      days_table.id

    AND public.normalize_bracket_entity_name(
      locations_table.name
    ) =
      public.normalize_bracket_entity_name(
        matches_table.location
      )

  JOIN public.championship_bracket_courts
    AS courts_table
    ON courts_table.bracket_location_id =
      locations_table.id

    AND public.normalize_bracket_entity_name(
      courts_table.name
    ) =
      public.normalize_bracket_entity_name(
        COALESCE(
          matches_table.court_name,
          ''
        )
      )

  WHERE bracket_matches_table.bracket_edition_id =
      _bracket_edition_id

    AND bracket_matches_table.phase =
      'GROUP_STAGE'::public.bracket_phase

    AND matches_table.start_time
      IS NOT NULL

    AND matches_table.end_time
      IS NOT NULL

    AND matches_table.scheduled_date
      IS NOT NULL;


  /*
   * Reservas do mata-mata.
   *
   * Essas partidas ainda podem não possuir atléticas definidas,
   * mas já possuem modalidade, naipe, divisão, fase, quadra e
   * horário autoritativos.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      match_kind,

      sport_id,
      sport_name,

      naipe,
      division,

      phase,
      phase_label,

      group_number,
      round_number,

      projected,
      manual_final,

      operational_order,

      source_identity
    )
  SELECT
    'MATCH',

    reservations_table.scheduled_date,

    reservations_table.bracket_day_id,
    reservations_table.bracket_court_id,

    reservations_table.location_group_id,
    reservations_table.court_group_id,

    reservations_table.location_name,
    reservations_table.court_name,

    reservations_table.start_at,
    reservations_table.end_at,

    reservations_table.duration_minutes,

    CASE
      WHEN reservations_table.is_manual_final
      THEN
        'MANUAL_FINAL'

      ELSE
        'KNOCKOUT'
    END,

    competitions_table.sport_id,
    sports_table.name,

    competitions_table.naipe,
    competitions_table.division,

    CASE
      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        )
      THEN
        'FINAL'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 1
      THEN
        'SEMIFINAL'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 2
      THEN
        'QUARTERFINAL'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 3
      THEN
        'ROUND_OF_16'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 4
      THEN
        'ROUND_OF_32'

      ELSE
        NULL
    END,

    CASE
      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        )
      THEN
        'Final'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 1
      THEN
        'Semifinal'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 2
      THEN
        'Quartas de final'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 3
      THEN
        'Oitavas de final'

      WHEN reservations_table.round_number =
        public.resolve_championship_competition_expected_knockout_rounds(
          competitions_table.id
        ) - 4
      THEN
        '32-avos de final'

      ELSE
        'Mata-mata'
    END,

    NULL,
    reservations_table.round_number,

    true,
    reservations_table.is_manual_final,

    reservations_table.scheduled_slot,

    reservations_table.id::text

  FROM
    public.championship_bracket_knockout_schedule_reservations
      AS reservations_table

  JOIN public.championship_bracket_competitions
    AS competitions_table
    ON competitions_table.id =
      reservations_table.competition_id

  LEFT JOIN public.sports
    AS sports_table
    ON sports_table.id =
      competitions_table.sport_id

  WHERE reservations_table.bracket_edition_id =
    _bracket_edition_id;


  /*
   * Intervalos modernos.
   *
   * ALL_COURTS é replicado para todas as quadras do dia.
   * COURT é inserido apenas na quadra correspondente.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      projected,
      manual_final,

      reason_code,
      reason
    )
  SELECT DISTINCT
    'BREAK',

    days_table.event_date,

    days_table.id,
    courts_table.id,

    locations_table.location_group_id,
    courts_table.court_group_id,

    locations_table.name,
    courts_table.name,

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      breaks_table.break_start_time
    ),

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      breaks_table.break_end_time
    ),

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            breaks_table.break_end_time
            - breaks_table.break_start_time
          )
        ) / 60.0
      )::integer
    ),

    false,
    false,

    'SCHEDULE_BREAK',
    'Intervalo da agenda'

  FROM public.championship_bracket_day_breaks
    AS breaks_table

  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.id =
      breaks_table.bracket_day_id

  JOIN public.championship_bracket_locations
    AS locations_table
    ON locations_table.bracket_day_id =
      days_table.id

  JOIN public.championship_bracket_courts
    AS courts_table
    ON courts_table.bracket_location_id =
      locations_table.id

    AND (
      breaks_table.scope_type =
        'ALL_COURTS'
          ::public.bracket_day_break_scope_type

      OR (
        breaks_table.scope_type =
          'COURT'
            ::public.bracket_day_break_scope_type

        AND breaks_table.bracket_court_id =
          courts_table.id
      )
    )

  WHERE days_table.bracket_edition_id =
    _bracket_edition_id;


  /*
   * Compatibilidade com o intervalo legado diretamente no dia.
   *
   * Só incluímos quando não existe uma pausa moderna idêntica
   * aplicável à quadra.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      projected,
      manual_final,

      reason_code,
      reason
    )
  SELECT
    'BREAK',

    days_table.event_date,

    days_table.id,
    courts_table.id,

    locations_table.location_group_id,
    courts_table.court_group_id,

    locations_table.name,
    courts_table.name,

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.break_start_time
    ),

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.break_end_time
    ),

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            days_table.break_end_time
            - days_table.break_start_time
          )
        ) / 60.0
      )::integer
    ),

    false,
    false,

    'SCHEDULE_BREAK',
    'Intervalo da agenda'

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

    AND days_table.break_start_time
      IS NOT NULL

    AND days_table.break_end_time
      IS NOT NULL

    AND NOT EXISTS (
      SELECT 1

      FROM public.championship_bracket_day_breaks
        AS breaks_table

      WHERE breaks_table.bracket_day_id =
          days_table.id

        AND breaks_table.break_start_time =
          days_table.break_start_time

        AND breaks_table.break_end_time =
          days_table.break_end_time

        AND (
          breaks_table.scope_type =
            'ALL_COURTS'
              ::public.bracket_day_break_scope_type

          OR (
            breaks_table.scope_type =
              'COURT'
                ::public.bracket_day_break_scope_type

            AND breaks_table.bracket_court_id =
              courts_table.id
          )
        )
    );


  /*
   * Sessões individuais configuradas no payload.
   *
   * Como a sessão informa um período, e não um horário absoluto,
   * o intervalo mostrado corresponde à janela MATUTINO/VESPERTINO
   * do dia.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      sport_id,
      sport_name,

      naipe,
      division,

      projected,
      manual_final,

      reason_code,
      reason,

      source_identity
    )
  SELECT
    'INDIVIDUAL_SESSION',

    days_table.event_date,

    days_table.id,
    courts_table.id,

    locations_table.location_group_id,
    courts_table.court_group_id,

    locations_table.name,
    courts_table.name,

    CASE
      WHEN session_record.value
        ->> 'period' = 'MATUTINO'
      THEN
        public.combine_bracket_schedule_timestamp(
          days_table.event_date,
          days_table.start_time
        )

      ELSE
        CASE
          WHEN days_table.break_end_time
            IS NOT NULL

            AND days_table.break_end_time <
              days_table.end_time
          THEN
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.break_end_time
            )

          ELSE
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.start_time
            )
            + (
              (
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.end_time
                )
                -
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.start_time
                )
              ) / 2.0
            )
        END
    END,

    CASE
      WHEN session_record.value
        ->> 'period' = 'MATUTINO'
      THEN
        CASE
          WHEN days_table.break_start_time
            IS NOT NULL

            AND days_table.break_start_time >
              days_table.start_time
          THEN
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.break_start_time
            )

          ELSE
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.start_time
            )
            + (
              (
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.end_time
                )
                -
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.start_time
                )
              ) / 2.0
            )
        END

      ELSE
        public.combine_bracket_schedule_timestamp(
          days_table.event_date,
          days_table.end_time
        )
    END,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            (
              CASE
                WHEN session_record.value
                  ->> 'period' = 'MATUTINO'
                THEN
                  CASE
                    WHEN days_table.break_start_time
                      IS NOT NULL

                      AND days_table.break_start_time >
                        days_table.start_time
                    THEN
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.break_start_time
                      )

                    ELSE
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.start_time
                      )
                      + (
                        (
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.end_time
                          )
                          -
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.start_time
                          )
                        ) / 2.0
                      )
                  END

                ELSE
                  public.combine_bracket_schedule_timestamp(
                    days_table.event_date,
                    days_table.end_time
                  )
              END
            )
            -
            (
              CASE
                WHEN session_record.value
                  ->> 'period' = 'MATUTINO'
                THEN
                  public.combine_bracket_schedule_timestamp(
                    days_table.event_date,
                    days_table.start_time
                  )

                ELSE
                  CASE
                    WHEN days_table.break_end_time
                      IS NOT NULL

                      AND days_table.break_end_time <
                        days_table.end_time
                    THEN
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.break_end_time
                      )

                    ELSE
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.start_time
                      )
                      + (
                        (
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.end_time
                          )
                          -
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.start_time
                          )
                        ) / 2.0
                      )
                  END
              END
            )
          )
        ) / 60.0
      )::integer
    ),

    NULLIF(
      session_record.value
        ->> 'sport_id',
      ''
    )::uuid,

    sports_table.name,

    NULLIF(
      session_record.value
        ->> 'naipe',
      ''
    )::public.match_naipe,

    CASE
      WHEN NULLIF(
        session_record.value
          ->> 'division',
        ''
      ) IS NULL
      THEN
        NULL

      ELSE
        (
          session_record.value
            ->> 'division'
        )::public.team_division
    END,

    false,
    false,

    'INDIVIDUAL_SESSION',

    CASE
      WHEN COALESCE(
        (
          session_record.value
            ->> 'exclusive_lock_enabled'
        )::boolean,
        false
      )
      THEN
        'Sessão individual com bloqueio exclusivo do recurso'

      ELSE
        'Sessão individual'
    END,

    'individual_session:'
      || session_record.ordinality::text

  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        _payload
          -> 'individual_session_configs'
      ) = 'array'
      THEN
        _payload
          -> 'individual_session_configs'

      ELSE
        '[]'::jsonb
    END
  )
  WITH ORDINALITY
    AS session_record(
      value,
      ordinality
    )

  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.bracket_edition_id =
      _bracket_edition_id

    AND days_table.event_date =
      (
        session_record.value
          ->> 'scheduled_date'
      )::date

  JOIN public.championship_bracket_locations
    AS locations_table
    ON locations_table.bracket_day_id =
      days_table.id

    AND public.normalize_bracket_entity_name(
      locations_table.name
    ) =
      public.normalize_bracket_entity_name(
        COALESCE(
          session_record.value
            ->> 'location_name',
          ''
        )
      )

  JOIN public.championship_bracket_courts
    AS courts_table
    ON courts_table.bracket_location_id =
      locations_table.id

    AND public.normalize_bracket_entity_name(
      courts_table.name
    ) =
      public.normalize_bracket_entity_name(
        COALESCE(
          session_record.value
            ->> 'court_name',
          ''
        )
      )

  LEFT JOIN public.sports
    AS sports_table
    ON sports_table.id =
      NULLIF(
        session_record.value
          ->> 'sport_id',
        ''
      )::uuid

  WHERE session_record.value
    ->> 'period'
    IN (
      'MATUTINO',
      'VESPERTINO'
    );


  /*
   * Bloqueios HARD de recurso.
   *
   * Não duplicamos uma reserva quando já existe uma sessão
   * individual equivalente no mesmo recurso/período.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      sport_id,
      sport_name,

      naipe,
      division,

      projected,
      manual_final,

      reason_code,
      reason,

      source_identity
    )
  SELECT
    'RESERVATION',

    days_table.event_date,

    days_table.id,
    courts_table.id,

    locations_table.location_group_id,
    courts_table.court_group_id,

    locations_table.name,
    courts_table.name,

    CASE
      WHEN lock_record.value
        ->> 'period' = 'MATUTINO'
      THEN
        public.combine_bracket_schedule_timestamp(
          days_table.event_date,
          days_table.start_time
        )

      ELSE
        CASE
          WHEN days_table.break_end_time
            IS NOT NULL

            AND days_table.break_end_time <
              days_table.end_time
          THEN
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.break_end_time
            )

          ELSE
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.start_time
            )
            + (
              (
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.end_time
                )
                -
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.start_time
                )
              ) / 2.0
            )
        END
    END,

    CASE
      WHEN lock_record.value
        ->> 'period' = 'MATUTINO'
      THEN
        CASE
          WHEN days_table.break_start_time
            IS NOT NULL

            AND days_table.break_start_time >
              days_table.start_time
          THEN
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.break_start_time
            )

          ELSE
            public.combine_bracket_schedule_timestamp(
              days_table.event_date,
              days_table.start_time
            )
            + (
              (
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.end_time
                )
                -
                public.combine_bracket_schedule_timestamp(
                  days_table.event_date,
                  days_table.start_time
                )
              ) / 2.0
            )
        END

      ELSE
        public.combine_bracket_schedule_timestamp(
          days_table.event_date,
          days_table.end_time
        )
    END,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            (
              CASE
                WHEN lock_record.value
                  ->> 'period' = 'MATUTINO'
                THEN
                  CASE
                    WHEN days_table.break_start_time
                      IS NOT NULL

                      AND days_table.break_start_time >
                        days_table.start_time
                    THEN
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.break_start_time
                      )

                    ELSE
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.start_time
                      )
                      + (
                        (
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.end_time
                          )
                          -
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.start_time
                          )
                        ) / 2.0
                      )
                  END

                ELSE
                  public.combine_bracket_schedule_timestamp(
                    days_table.event_date,
                    days_table.end_time
                  )
              END
            )
            -
            (
              CASE
                WHEN lock_record.value
                  ->> 'period' = 'MATUTINO'
                THEN
                  public.combine_bracket_schedule_timestamp(
                    days_table.event_date,
                    days_table.start_time
                  )

                ELSE
                  CASE
                    WHEN days_table.break_end_time
                      IS NOT NULL

                      AND days_table.break_end_time <
                        days_table.end_time
                    THEN
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.break_end_time
                      )

                    ELSE
                      public.combine_bracket_schedule_timestamp(
                        days_table.event_date,
                        days_table.start_time
                      )
                      + (
                        (
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.end_time
                          )
                          -
                          public.combine_bracket_schedule_timestamp(
                            days_table.event_date,
                            days_table.start_time
                          )
                        ) / 2.0
                      )
                  END
              END
            )
          )
        ) / 60.0
      )::integer
    ),

    CASE
      WHEN NULLIF(
        lock_record.value
          ->> 'sport_id',
        ''
      ) IS NULL
      THEN
        NULL

      ELSE
        (
          lock_record.value
            ->> 'sport_id'
        )::uuid
    END,

    sports_table.name,

    CASE
      WHEN NULLIF(
        lock_record.value
          ->> 'naipe',
        ''
      ) IS NULL
      THEN
        NULL

      ELSE
        (
          lock_record.value
            ->> 'naipe'
        )::public.match_naipe
    END,

    CASE
      WHEN NULLIF(
        lock_record.value
          ->> 'division',
        ''
      ) IS NULL
      THEN
        NULL

      ELSE
        (
          lock_record.value
            ->> 'division'
        )::public.team_division
    END,

    false,
    false,

    'RESOURCE_LOCK',
    'Reserva exclusiva do recurso',

    'resource_lock:'
      || lock_record.ordinality::text

  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(
        _payload
          -> 'resource_locks'
      ) = 'array'
      THEN
        _payload
          -> 'resource_locks'

      ELSE
        '[]'::jsonb
    END
  )
  WITH ORDINALITY
    AS lock_record(
      value,
      ordinality
    )

  JOIN public.championship_bracket_days
    AS days_table
    ON days_table.bracket_edition_id =
      _bracket_edition_id

    AND days_table.event_date =
      (
        lock_record.value
          ->> 'date'
      )::date

  JOIN public.championship_bracket_locations
    AS locations_table
    ON locations_table.bracket_day_id =
      days_table.id

    AND public.normalize_bracket_entity_name(
      locations_table.name
    ) =
      public.normalize_bracket_entity_name(
        COALESCE(
          lock_record.value
            ->> 'location_name',
          ''
        )
      )

  JOIN public.championship_bracket_courts
    AS courts_table
    ON courts_table.bracket_location_id =
      locations_table.id

    AND public.normalize_bracket_entity_name(
      courts_table.name
    ) =
      public.normalize_bracket_entity_name(
        COALESCE(
          lock_record.value
            ->> 'court_name',
          ''
        )
      )

  LEFT JOIN public.sports
    AS sports_table
    ON sports_table.id =
      CASE
        WHEN NULLIF(
          lock_record.value
            ->> 'sport_id',
          ''
        ) IS NULL
        THEN
          NULL

        ELSE
          (
            lock_record.value
              ->> 'sport_id'
          )::uuid
      END

  WHERE COALESCE(
      lock_record.value
        ->> 'lock_mode',
      ''
    ) = 'HARD'

    AND lock_record.value
      ->> 'period'
      IN (
        'MATUTINO',
        'VESPERTINO'
      )

    AND NOT EXISTS (
      SELECT 1

      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(
            _payload
              -> 'individual_session_configs'
          ) = 'array'
          THEN
            _payload
              -> 'individual_session_configs'

          ELSE
            '[]'::jsonb
        END
      ) AS session_record(value)

      WHERE session_record.value
          ->> 'scheduled_date' =
            lock_record.value
              ->> 'date'

        AND session_record.value
          ->> 'period' =
            lock_record.value
              ->> 'period'

        AND public.normalize_bracket_entity_name(
          COALESCE(
            session_record.value
              ->> 'location_name',
            ''
          )
        ) =
          public.normalize_bracket_entity_name(
            COALESCE(
              lock_record.value
                ->> 'location_name',
              ''
            )
          )

        AND public.normalize_bracket_entity_name(
          COALESCE(
            session_record.value
              ->> 'court_name',
            ''
          )
        ) =
          public.normalize_bracket_entity_name(
            COALESCE(
              lock_record.value
                ->> 'court_name',
              ''
            )
          )
    );


  /*
   * Numeração visual.
   */
  IF match_numbering_mode_value =
    'SPORT_NAIPE'
  THEN
    WITH numbered_matches AS (
      SELECT
        entries_table.row_id,

        ROW_NUMBER() OVER (
          PARTITION BY
            entries_table.sport_id,
            entries_table.naipe

          ORDER BY
            entries_table.scheduled_date ASC,
            entries_table.start_at ASC,

            COALESCE(
              entries_table.operational_order,
              2147483647
            ) ASC,

            entries_table.location_name ASC,
            entries_table.court_name ASC,
            entries_table.row_id ASC
        )::integer AS resolved_number

      FROM tmp_bracket_preview_entries
        AS entries_table

      WHERE entries_table.entry_type =
        'MATCH'
    )
    UPDATE tmp_bracket_preview_entries
      AS entries_table
    SET match_number =
      numbered_matches.resolved_number
    FROM numbered_matches
    WHERE numbered_matches.row_id =
      entries_table.row_id;

  ELSE
    WITH numbered_matches AS (
      SELECT
        entries_table.row_id,

        ROW_NUMBER() OVER (
          PARTITION BY
            public.normalize_bracket_entity_name(
              entries_table.location_name
            ),

            public.normalize_bracket_entity_name(
              entries_table.court_name
            )

          ORDER BY
            entries_table.scheduled_date ASC,
            entries_table.start_at ASC,

            COALESCE(
              entries_table.operational_order,
              2147483647
            ) ASC,

            entries_table.row_id ASC
        )::integer AS resolved_number

      FROM tmp_bracket_preview_entries
        AS entries_table

      WHERE entries_table.entry_type =
        'MATCH'
    )
    UPDATE tmp_bracket_preview_entries
      AS entries_table
    SET match_number =
      numbered_matches.resolved_number
    FROM numbered_matches
    WHERE numbered_matches.row_id =
      entries_table.row_id;
  END IF;


  /*
   * Limites efetivos de cada timeline.
   *
   * Se uma final manual ultrapassar o horário configurado de fim
   * do dia, a timeline visual é estendida para mostrar a final.
   */
  DROP TABLE IF EXISTS
    tmp_bracket_preview_court_bounds;

  CREATE TEMP TABLE
    tmp_bracket_preview_court_bounds
  ON COMMIT DROP
  AS
  SELECT
    days_table.id
      AS bracket_day_id,

    days_table.event_date,

    courts_table.id
      AS bracket_court_id,

    locations_table.location_group_id,
    courts_table.court_group_id,

    locations_table.name
      AS location_name,

    courts_table.name
      AS court_name,

    locations_table.position
      AS location_position,

    courts_table.position
      AS court_position,

    public.combine_bracket_schedule_timestamp(
      days_table.event_date,
      days_table.start_time
    ) AS timeline_start_at,

    GREATEST(
      public.combine_bracket_schedule_timestamp(
        days_table.event_date,
        days_table.end_time
      ),

      COALESCE(
        (
          SELECT MAX(
            entries_table.end_at
          )

          FROM tmp_bracket_preview_entries
            AS entries_table

          WHERE entries_table.bracket_day_id =
              days_table.id

            AND entries_table.bracket_court_id =
              courts_table.id
        ),

        public.combine_bracket_schedule_timestamp(
          days_table.event_date,
          days_table.end_time
        )
      )
    ) AS timeline_end_at

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
    _bracket_edition_id;


  /*
   * Une intervalos ocupados sobrepostos.
   *
   * Isso evita que, por exemplo, uma final manual atravessando
   * um intervalo gere minutos duplicados de ocupação.
   */
  DROP TABLE IF EXISTS
    tmp_bracket_preview_occupied_intervals;

  CREATE TEMP TABLE
    tmp_bracket_preview_occupied_intervals
  ON COMMIT DROP
  AS
  WITH clipped_entries AS (
    SELECT
      bounds_table.bracket_day_id,
      bounds_table.bracket_court_id,

      GREATEST(
        entries_table.start_at,
        bounds_table.timeline_start_at
      ) AS start_at,

      LEAST(
        entries_table.end_at,
        bounds_table.timeline_end_at
      ) AS end_at

    FROM tmp_bracket_preview_entries
      AS entries_table

    JOIN tmp_bracket_preview_court_bounds
      AS bounds_table
      ON bounds_table.bracket_day_id =
        entries_table.bracket_day_id

      AND bounds_table.bracket_court_id =
        entries_table.bracket_court_id

    WHERE entries_table.entry_type <>
        'EMPTY'

      AND entries_table.end_at >
        bounds_table.timeline_start_at

      AND entries_table.start_at <
        bounds_table.timeline_end_at
  ),

  ordered_entries AS (
    SELECT
      clipped_entries.*,

      MAX(
        clipped_entries.end_at
      ) OVER (
        PARTITION BY
          clipped_entries.bracket_day_id,
          clipped_entries.bracket_court_id

        ORDER BY
          clipped_entries.start_at ASC,
          clipped_entries.end_at ASC

        ROWS BETWEEN
          UNBOUNDED PRECEDING
          AND 1 PRECEDING
      ) AS previous_max_end_at

    FROM clipped_entries
  ),

  island_markers AS (
    SELECT
      ordered_entries.*,

      CASE
        WHEN ordered_entries.previous_max_end_at
          IS NULL

          OR ordered_entries.start_at >
            ordered_entries.previous_max_end_at
        THEN
          1

        ELSE
          0
      END AS starts_new_island

    FROM ordered_entries
  ),

  grouped_entries AS (
    SELECT
      island_markers.*,

      SUM(
        island_markers.starts_new_island
      ) OVER (
        PARTITION BY
          island_markers.bracket_day_id,
          island_markers.bracket_court_id

        ORDER BY
          island_markers.start_at ASC,
          island_markers.end_at ASC

        ROWS UNBOUNDED PRECEDING
      ) AS island_number

    FROM island_markers
  )

  SELECT
    grouped_entries.bracket_day_id,
    grouped_entries.bracket_court_id,
    grouped_entries.island_number,

    MIN(
      grouped_entries.start_at
    ) AS start_at,

    MAX(
      grouped_entries.end_at
    ) AS end_at

  FROM grouped_entries

  GROUP BY
    grouped_entries.bracket_day_id,
    grouped_entries.bracket_court_id,
    grouped_entries.island_number;


  /*
   * Janela vazia quando a quadra não possui nenhuma ocupação.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      projected,
      manual_final,

      reason_code,
      reason
    )
  SELECT
    'EMPTY',

    bounds_table.event_date,

    bounds_table.bracket_day_id,
    bounds_table.bracket_court_id,

    bounds_table.location_group_id,
    bounds_table.court_group_id,

    bounds_table.location_name,
    bounds_table.court_name,

    bounds_table.timeline_start_at,
    bounds_table.timeline_end_at,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            bounds_table.timeline_end_at
            - bounds_table.timeline_start_at
          )
        ) / 60.0
      )::integer
    ),

    false,
    false,

    'NO_ELIGIBLE_MATCH',

    'Nenhum jogo elegível ou nenhuma ocupação programada nesta janela.'

  FROM tmp_bracket_preview_court_bounds
    AS bounds_table

  WHERE NOT EXISTS (
    SELECT 1

    FROM tmp_bracket_preview_occupied_intervals
      AS occupied_table

    WHERE occupied_table.bracket_day_id =
        bounds_table.bracket_day_id

      AND occupied_table.bracket_court_id =
        bounds_table.bracket_court_id
  );


  /*
   * Janela vazia antes da primeira ocupação.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      projected,
      manual_final,

      reason_code,
      reason
    )
  SELECT
    'EMPTY',

    bounds_table.event_date,

    bounds_table.bracket_day_id,
    bounds_table.bracket_court_id,

    bounds_table.location_group_id,
    bounds_table.court_group_id,

    bounds_table.location_name,
    bounds_table.court_name,

    bounds_table.timeline_start_at,

    first_occupied.start_at,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            first_occupied.start_at
            - bounds_table.timeline_start_at
          )
        ) / 60.0
      )::integer
    ),

    false,
    false,

    'NO_ELIGIBLE_MATCH',

    'Nenhum jogo elegível ou nenhuma ocupação programada nesta janela.'

  FROM tmp_bracket_preview_court_bounds
    AS bounds_table

  JOIN LATERAL (
    SELECT
      occupied_table.start_at

    FROM tmp_bracket_preview_occupied_intervals
      AS occupied_table

    WHERE occupied_table.bracket_day_id =
        bounds_table.bracket_day_id

      AND occupied_table.bracket_court_id =
        bounds_table.bracket_court_id

    ORDER BY
      occupied_table.start_at ASC

    LIMIT 1
  ) AS first_occupied
    ON true

  WHERE first_occupied.start_at >
    bounds_table.timeline_start_at;


  /*
   * Janelas vazias entre ocupações.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      projected,
      manual_final,

      reason_code,
      reason
    )
  SELECT
    'EMPTY',

    bounds_table.event_date,

    bounds_table.bracket_day_id,
    bounds_table.bracket_court_id,

    bounds_table.location_group_id,
    bounds_table.court_group_id,

    bounds_table.location_name,
    bounds_table.court_name,

    gaps.previous_end_at,
    gaps.start_at,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            gaps.start_at
            - gaps.previous_end_at
          )
        ) / 60.0
      )::integer
    ),

    false,
    false,

    'NO_ELIGIBLE_MATCH',

    'Nenhum jogo elegível ou nenhuma ocupação programada nesta janela.'

  FROM tmp_bracket_preview_court_bounds
    AS bounds_table

  JOIN (
    SELECT
      occupied_table.bracket_day_id,
      occupied_table.bracket_court_id,

      occupied_table.start_at,

      LAG(
        occupied_table.end_at
      ) OVER (
        PARTITION BY
          occupied_table.bracket_day_id,
          occupied_table.bracket_court_id

        ORDER BY
          occupied_table.start_at ASC,
          occupied_table.end_at ASC
      ) AS previous_end_at

    FROM tmp_bracket_preview_occupied_intervals
      AS occupied_table
  ) AS gaps
    ON gaps.bracket_day_id =
      bounds_table.bracket_day_id

    AND gaps.bracket_court_id =
      bounds_table.bracket_court_id

  WHERE gaps.previous_end_at
      IS NOT NULL

    AND gaps.start_at >
      gaps.previous_end_at;


  /*
   * Janela vazia depois da última ocupação.
   */
  INSERT INTO
    tmp_bracket_preview_entries (
      entry_type,

      scheduled_date,

      bracket_day_id,
      bracket_court_id,

      location_group_id,
      court_group_id,

      location_name,
      court_name,

      start_at,
      end_at,

      duration_minutes,

      projected,
      manual_final,

      reason_code,
      reason
    )
  SELECT
    'EMPTY',

    bounds_table.event_date,

    bounds_table.bracket_day_id,
    bounds_table.bracket_court_id,

    bounds_table.location_group_id,
    bounds_table.court_group_id,

    bounds_table.location_name,
    bounds_table.court_name,

    last_occupied.end_at,

    bounds_table.timeline_end_at,

    GREATEST(
      1,

      ROUND(
        EXTRACT(
          EPOCH FROM (
            bounds_table.timeline_end_at
            - last_occupied.end_at
          )
        ) / 60.0
      )::integer
    ),

    false,
    false,

    'NO_ELIGIBLE_MATCH',

    'Nenhum jogo elegível ou nenhuma ocupação programada nesta janela.'

  FROM tmp_bracket_preview_court_bounds
    AS bounds_table

  JOIN LATERAL (
    SELECT
      occupied_table.end_at

    FROM tmp_bracket_preview_occupied_intervals
      AS occupied_table

    WHERE occupied_table.bracket_day_id =
        bounds_table.bracket_day_id

      AND occupied_table.bracket_court_id =
        bounds_table.bracket_court_id

    ORDER BY
      occupied_table.end_at DESC

    LIMIT 1
  ) AS last_occupied
    ON true

  WHERE last_occupied.end_at <
    bounds_table.timeline_end_at;


  /*
   * Quando a redistribuição deixou um slot vazio deliberadamente
   * pelo agrupamento estrito da Etapa 11, especializamos o motivo.
   *
   * A tabela é temporária e só existe quando a redistribuição
   * passou pela implementação de sequenciamento estrito.
   */
  strict_blocked_table_exists :=
    to_regclass(
      'pg_temp.tmp_global_strict_blocked_slots'
    ) IS NOT NULL;


  IF strict_blocked_table_exists
  THEN
    EXECUTE $dynamic$
      UPDATE tmp_bracket_preview_entries
        AS entries_table

      SET
        reason_code =
          'STRICT_SEQUENCE_BLOCKED',

        reason =
          'Janela mantida vazia pelo agrupamento estrito configurado na Etapa 11.'

      WHERE entries_table.entry_type =
          'EMPTY'

        AND EXISTS (
          SELECT 1

          FROM pg_temp.tmp_global_strict_blocked_slots
            AS blocked_slots_table

          WHERE blocked_slots_table.event_date =
              entries_table.scheduled_date

            AND public.normalize_bracket_entity_name(
              blocked_slots_table.location_name
            ) =
              public.normalize_bracket_entity_name(
                entries_table.location_name
              )

            AND public.normalize_bracket_entity_name(
              blocked_slots_table.court_name
            ) =
              public.normalize_bracket_entity_name(
                entries_table.court_name
              )

            AND blocked_slots_table.slot_start_at <
              entries_table.end_at

            AND blocked_slots_table.slot_end_at >
              entries_table.start_at
        )
    $dynamic$;
  END IF;


  /*
   * Métricas.
   *
   * occupied_minutes considera a união de todos os intervalos não
   * vazios: jogos, finais, pausas, reservas e sessões.
   *
   * Portanto sobreposições não são contadas duas vezes.
   */
  SELECT
    COUNT(*)::integer
  INTO group_stage_match_count
  FROM tmp_bracket_preview_entries
    AS entries_table
  WHERE entries_table.entry_type =
      'MATCH'

    AND entries_table.match_kind =
      'GROUP_STAGE';


  expected_knockout_match_count :=
    COALESCE(
      NULLIF(
        _knockout_result
          ->> 'expected_matches',
        ''
      )::integer,
      0
    );


  SELECT
    COUNT(*)::integer
  INTO scheduled_match_count
  FROM tmp_bracket_preview_entries
    AS entries_table
  WHERE entries_table.entry_type =
    'MATCH';


  SELECT
    COALESCE(
      SUM(
        ROUND(
          EXTRACT(
            EPOCH FROM (
              occupied_table.end_at
              - occupied_table.start_at
            )
          ) / 60.0
        )::integer
      ),
      0
    )::integer
  INTO occupied_minutes_value
  FROM tmp_bracket_preview_occupied_intervals
    AS occupied_table;


  SELECT
    COALESCE(
      SUM(
        ROUND(
          EXTRACT(
            EPOCH FROM (
              bounds_table.timeline_end_at
              - bounds_table.timeline_start_at
            )
          ) / 60.0
        )::integer
      ),
      0
    )::integer
  INTO available_minutes_value
  FROM tmp_bracket_preview_court_bounds
    AS bounds_table;


  SELECT
    COUNT(*)::integer
  INTO free_windows_value
  FROM tmp_bracket_preview_entries
    AS entries_table
  WHERE entries_table.entry_type =
    'EMPTY';


  conflict_count_value :=
    COALESCE(
      NULLIF(
        _knockout_result
          ->> 'conflict_count',
        ''
      )::integer,
      0
    );


  utilization_percentage_value :=
    CASE
      WHEN available_minutes_value <= 0
      THEN
        0

      ELSE
        ROUND(
          (
            occupied_minutes_value::numeric
            * 100
          )
          /
          available_minutes_value::numeric,
          2
        )
    END;


  summary_result :=
    jsonb_build_object(
      'total_matches',
        group_stage_match_count
        + expected_knockout_match_count,

      'group_stage_matches',
        group_stage_match_count,

      'knockout_matches',
        expected_knockout_match_count,

      'scheduled_matches',
        scheduled_match_count,

      'occupied_minutes',
        occupied_minutes_value,

      'available_minutes',
        available_minutes_value,

      'utilization_percentage',
        utilization_percentage_value,

      'free_windows',
        free_windows_value,

      'conflict_count',
        conflict_count_value,

      'warning_count',
        0,

      'games_by_day',
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'date',
                  matches_by_day.scheduled_date,

                'matches',
                  matches_by_day.match_count
              )
              ORDER BY
                matches_by_day.scheduled_date ASC
            )

            FROM (
              SELECT
                entries_table.scheduled_date,

                COUNT(*)::integer
                  AS match_count

              FROM tmp_bracket_preview_entries
                AS entries_table

              WHERE entries_table.entry_type =
                'MATCH'

              GROUP BY
                entries_table.scheduled_date
            ) AS matches_by_day
          ),

          '[]'::jsonb
        )
    );


  /*
   * JSON hierárquico:
   *
   * dia
   *   → local
   *     → quadra
   *       → timeline
   */
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date',
            days_table.event_date,

          'start_time',
            to_char(
              days_table.start_time,
              'HH24:MI'
            ),

          'end_time',
            to_char(
              days_table.end_time,
              'HH24:MI'
            ),

          'occupied_minutes',
            COALESCE(
              (
                SELECT SUM(
                  ROUND(
                    EXTRACT(
                      EPOCH FROM (
                        occupied_table.end_at
                        - occupied_table.start_at
                      )
                    ) / 60.0
                  )::integer
                )::integer

                FROM tmp_bracket_preview_occupied_intervals
                  AS occupied_table

                WHERE occupied_table.bracket_day_id =
                  days_table.id
              ),
              0
            ),

          'available_minutes',
            COALESCE(
              (
                SELECT SUM(
                  ROUND(
                    EXTRACT(
                      EPOCH FROM (
                        bounds_table.timeline_end_at
                        - bounds_table.timeline_start_at
                      )
                    ) / 60.0
                  )::integer
                )::integer

                FROM tmp_bracket_preview_court_bounds
                  AS bounds_table

                WHERE bounds_table.bracket_day_id =
                  days_table.id
              ),
              0
            ),

          'utilization_percentage',
            CASE
              WHEN COALESCE(
                (
                  SELECT SUM(
                    EXTRACT(
                      EPOCH FROM (
                        bounds_table.timeline_end_at
                        - bounds_table.timeline_start_at
                      )
                    )
                  )

                  FROM tmp_bracket_preview_court_bounds
                    AS bounds_table

                  WHERE bounds_table.bracket_day_id =
                    days_table.id
                ),
                0
              ) <= 0
              THEN
                0

              ELSE
                ROUND(
                  (
                    COALESCE(
                      (
                        SELECT SUM(
                          EXTRACT(
                            EPOCH FROM (
                              occupied_table.end_at
                              - occupied_table.start_at
                            )
                          )
                        )

                        FROM tmp_bracket_preview_occupied_intervals
                          AS occupied_table

                        WHERE occupied_table.bracket_day_id =
                          days_table.id
                      ),
                      0
                    )::numeric
                    * 100
                  )
                  /
                  (
                    SELECT SUM(
                      EXTRACT(
                        EPOCH FROM (
                          bounds_table.timeline_end_at
                          - bounds_table.timeline_start_at
                        )
                      )
                    )::numeric

                    FROM tmp_bracket_preview_court_bounds
                      AS bounds_table

                    WHERE bounds_table.bracket_day_id =
                      days_table.id
                  ),
                  2
                )
            END,

          'free_windows',
            (
              SELECT COUNT(*)::integer

              FROM tmp_bracket_preview_entries
                AS entries_table

              WHERE entries_table.bracket_day_id =
                  days_table.id

                AND entries_table.entry_type =
                  'EMPTY'
            ),

          'breaks',
            COALESCE(
              (
                SELECT jsonb_agg(
                  DISTINCT jsonb_build_object(
                    'start_time',
                      to_char(
                        breaks_table.break_start_time,
                        'HH24:MI'
                      ),

                    'end_time',
                      to_char(
                        breaks_table.break_end_time,
                        'HH24:MI'
                      )
                  )
                )

                FROM public.championship_bracket_day_breaks
                  AS breaks_table

                WHERE breaks_table.bracket_day_id =
                    days_table.id

                  AND breaks_table.scope_type =
                    'ALL_COURTS'
                      ::public.bracket_day_break_scope_type
              ),

              CASE
                WHEN days_table.break_start_time
                    IS NOT NULL

                  AND days_table.break_end_time
                    IS NOT NULL
                THEN
                  jsonb_build_array(
                    jsonb_build_object(
                      'start_time',
                        to_char(
                          days_table.break_start_time,
                          'HH24:MI'
                        ),

                      'end_time',
                        to_char(
                          days_table.break_end_time,
                          'HH24:MI'
                        )
                    )
                  )

                ELSE
                  '[]'::jsonb
              END
            ),

          'locations',
            COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'location_key',
                      locations_table.location_group_id::text,

                    'location_name',
                      locations_table.name,

                    'courts',
                      COALESCE(
                        (
                          SELECT jsonb_agg(
                            jsonb_build_object(
                              'court_key',
                                courts_table.court_group_id::text,

                              'court_name',
                                courts_table.name,

                              'occupied_minutes',
                                COALESCE(
                                  (
                                    SELECT SUM(
                                      ROUND(
                                        EXTRACT(
                                          EPOCH FROM (
                                            occupied_table.end_at
                                            - occupied_table.start_at
                                          )
                                        ) / 60.0
                                      )::integer
                                    )::integer

                                    FROM tmp_bracket_preview_occupied_intervals
                                      AS occupied_table

                                    WHERE occupied_table.bracket_day_id =
                                        days_table.id

                                      AND occupied_table.bracket_court_id =
                                        courts_table.id
                                  ),
                                  0
                                ),

                              'available_minutes',
                                COALESCE(
                                  (
                                    SELECT
                                      ROUND(
                                        EXTRACT(
                                          EPOCH FROM (
                                            bounds_table.timeline_end_at
                                            - bounds_table.timeline_start_at
                                          )
                                        ) / 60.0
                                      )::integer

                                    FROM tmp_bracket_preview_court_bounds
                                      AS bounds_table

                                    WHERE bounds_table.bracket_day_id =
                                        days_table.id

                                      AND bounds_table.bracket_court_id =
                                        courts_table.id

                                    LIMIT 1
                                  ),
                                  0
                                ),

                              'utilization_percentage',
                                CASE
                                  WHEN COALESCE(
                                    (
                                      SELECT EXTRACT(
                                        EPOCH FROM (
                                          bounds_table.timeline_end_at
                                          - bounds_table.timeline_start_at
                                        )
                                      )

                                      FROM tmp_bracket_preview_court_bounds
                                        AS bounds_table

                                      WHERE bounds_table.bracket_day_id =
                                          days_table.id

                                        AND bounds_table.bracket_court_id =
                                          courts_table.id

                                      LIMIT 1
                                    ),
                                    0
                                  ) <= 0
                                  THEN
                                    0

                                  ELSE
                                    ROUND(
                                      (
                                        COALESCE(
                                          (
                                            SELECT SUM(
                                              EXTRACT(
                                                EPOCH FROM (
                                                  occupied_table.end_at
                                                  - occupied_table.start_at
                                                )
                                              )
                                            )

                                            FROM tmp_bracket_preview_occupied_intervals
                                              AS occupied_table

                                            WHERE occupied_table.bracket_day_id =
                                                days_table.id

                                              AND occupied_table.bracket_court_id =
                                                courts_table.id
                                          ),
                                          0
                                        )::numeric
                                        * 100
                                      )
                                      /
                                      (
                                        SELECT EXTRACT(
                                          EPOCH FROM (
                                            bounds_table.timeline_end_at
                                            - bounds_table.timeline_start_at
                                          )
                                        )::numeric

                                        FROM tmp_bracket_preview_court_bounds
                                          AS bounds_table

                                        WHERE bounds_table.bracket_day_id =
                                            days_table.id

                                          AND bounds_table.bracket_court_id =
                                            courts_table.id

                                        LIMIT 1
                                      ),
                                      2
                                    )
                                END,

                              'free_windows',
                                (
                                  SELECT COUNT(*)::integer

                                  FROM tmp_bracket_preview_entries
                                    AS entries_table

                                  WHERE entries_table.bracket_day_id =
                                      days_table.id

                                    AND entries_table.bracket_court_id =
                                      courts_table.id

                                    AND entries_table.entry_type =
                                      'EMPTY'
                                ),

                              'entries',
                                COALESCE(
                                  (
                                    SELECT jsonb_agg(
                                      jsonb_build_object(
                                        'type',
                                          entries_table.entry_type,

                                        'start_time',
                                          to_char(
                                            entries_table.start_at
                                              AT TIME ZONE
                                                'America/Sao_Paulo',
                                            'HH24:MI'
                                          ),

                                        'end_time',
                                          to_char(
                                            entries_table.end_at
                                              AT TIME ZONE
                                                'America/Sao_Paulo',
                                            'HH24:MI'
                                          ),

                                        'duration_minutes',
                                          entries_table.duration_minutes,

                                        'match_kind',
                                          entries_table.match_kind,

                                        'match_number',
                                          entries_table.match_number,

                                        'sport_id',
                                          entries_table.sport_id,

                                        'sport_name',
                                          entries_table.sport_name,

                                        'naipe',
                                          entries_table.naipe,

                                        'division',
                                          entries_table.division,

                                        'phase',
                                          entries_table.phase,

                                        'phase_label',
                                          entries_table.phase_label,

                                        'group_number',
                                          entries_table.group_number,

                                        'round_number',
                                          entries_table.round_number,

                                        'projected',
                                          entries_table.projected,

                                        'manual_final',
                                          entries_table.manual_final,

                                        'reason_code',
                                          entries_table.reason_code,

                                        'reason',
                                          entries_table.reason
                                      )

                                      ORDER BY
                                        entries_table.start_at ASC,

                                        CASE
                                          WHEN entries_table.entry_type =
                                            'BREAK'
                                          THEN 1

                                          WHEN entries_table.entry_type =
                                            'RESERVATION'
                                          THEN 2

                                          WHEN entries_table.entry_type =
                                            'INDIVIDUAL_SESSION'
                                          THEN 3

                                          WHEN entries_table.entry_type =
                                            'MATCH'
                                          THEN 4

                                          ELSE 5
                                        END ASC,

                                        entries_table.row_id ASC
                                    )

                                    FROM tmp_bracket_preview_entries
                                      AS entries_table

                                    WHERE entries_table.bracket_day_id =
                                        days_table.id

                                      AND entries_table.bracket_court_id =
                                        courts_table.id
                                  ),

                                  '[]'::jsonb
                                )
                            )

                            ORDER BY
                              courts_table.position ASC,
                              courts_table.name ASC
                          )

                          FROM public.championship_bracket_courts
                            AS courts_table

                          WHERE courts_table.bracket_location_id =
                            locations_table.id
                        ),

                        '[]'::jsonb
                      )
                  )

                  ORDER BY
                    locations_table.position ASC,
                    locations_table.name ASC
                )

                FROM public.championship_bracket_locations
                  AS locations_table

                WHERE locations_table.bracket_day_id =
                  days_table.id
              ),

              '[]'::jsonb
            )
        )

        ORDER BY
          days_table.event_date ASC
      ),

      '[]'::jsonb
    )
  INTO days_result

  FROM public.championship_bracket_days
    AS days_table

  WHERE days_table.bracket_edition_id =
    _bracket_edition_id;


  RETURN jsonb_build_object(
    'summary',
      summary_result,

    'days',
      days_result
  );
END;
$function$;


COMMENT ON FUNCTION
  public.build_championship_bracket_operational_preview(
    UUID,
    JSONB,
    JSONB
  )
IS
  'Monta a prévia operacional anonimizada do chaveamento: grupos, mata-mata projetado, finais manuais, intervalos, sessões individuais, reservas e janelas vazias, incluindo métricas e numeração visual configurável.';


REVOKE ALL ON FUNCTION
  public.build_championship_bracket_operational_preview(
    UUID,
    JSONB,
    JSONB
  )
FROM PUBLIC, anon, authenticated;


/*
 * Atualiza o RPC para utilizar a timeline operacional rica.
 */
CREATE OR REPLACE FUNCTION
  public.preview_championship_bracket_groups(
    _championship_id UUID,
    _payload JSONB
  )
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  generated_edition_id UUID;

  knockout_result JSONB;
  operational_preview JSONB;

  preview_result JSONB;

  diagnostics_result JSONB;

  resolved_match_numbering_mode TEXT;

  knockout_conflict_count INTEGER := 0;
BEGIN
  resolved_match_numbering_mode :=
    CASE
      WHEN COALESCE(
        _payload ->> 'match_numbering_mode',
        ''
      ) = 'SPORT_NAIPE'
      THEN
        'SPORT_NAIPE'

      ELSE
        'COURT'
    END;


  BEGIN
    SELECT
      public.generate_championship_bracket_groups(
        _championship_id,
        COALESCE(
          _payload,
          '{}'::jsonb
        )
      )
    INTO generated_edition_id;


    IF generated_edition_id IS NULL
    THEN
      RAISE EXCEPTION
        'Não foi possível determinar a edição temporária gerada para a prévia.';
    END IF;


    knockout_result :=
      public
        .rebuild_championship_knockout_schedule_reservations(
          generated_edition_id,
          false
        );


    knockout_conflict_count :=
      COALESCE(
        NULLIF(
          knockout_result
            ->> 'conflict_count',
          ''
        )::integer,
        0
      );


    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'code',
              conflict_record.value
                ->> 'code',

            'severity',
              'ERROR',

            'message',
              conflict_record.value
                ->> 'message',

            'date',
              NULL,

            'location_name',
              NULL,

            'court_name',
              NULL,

            'sport_id',
              competitions_table.sport_id,

            'sport_name',
              sports_table.name,

            'naipe',
              competitions_table.naipe,

            'division',
              competitions_table.division,

            'phase',
              CASE
                WHEN NULLIF(
                  conflict_record.value
                    ->> 'round_number',
                  ''
                ) IS NULL
                THEN
                  NULL

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public.resolve_championship_competition_expected_knockout_rounds(
                    competitions_table.id
                  )
                THEN
                  'FINAL'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public.resolve_championship_competition_expected_knockout_rounds(
                    competitions_table.id
                  ) - 1
                THEN
                  'SEMIFINAL'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public.resolve_championship_competition_expected_knockout_rounds(
                    competitions_table.id
                  ) - 2
                THEN
                  'QUARTERFINAL'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public.resolve_championship_competition_expected_knockout_rounds(
                    competitions_table.id
                  ) - 3
                THEN
                  'ROUND_OF_16'

                WHEN (
                  conflict_record.value
                    ->> 'round_number'
                )::integer =
                  public.resolve_championship_competition_expected_knockout_rounds(
                    competitions_table.id
                  ) - 4
                THEN
                  'ROUND_OF_32'

                ELSE
                  NULL
              END
          )

          ORDER BY
            conflict_record.ordinality ASC
        ),
        '[]'::jsonb
      )
    INTO diagnostics_result

    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(
          knockout_result
            -> 'conflicts'
        ) = 'array'
        THEN
          knockout_result
            -> 'conflicts'

        ELSE
          '[]'::jsonb
      END
    )
    WITH ORDINALITY
      AS conflict_record(
        value,
        ordinality
      )

    LEFT JOIN
      public.championship_bracket_competitions
        AS competitions_table
      ON competitions_table.id =
        CASE
          WHEN NULLIF(
            conflict_record.value
              ->> 'competition_id',
            ''
          ) IS NULL
          THEN
            NULL

          ELSE
            (
              conflict_record.value
                ->> 'competition_id'
            )::uuid
        END

    LEFT JOIN public.sports
      AS sports_table
      ON sports_table.id =
        competitions_table.sport_id;


    operational_preview :=
      public
        .build_championship_bracket_operational_preview(
          generated_edition_id,
          COALESCE(
            _payload,
            '{}'::jsonb
          ),
          knockout_result
        );


    preview_result :=
      jsonb_build_object(
        'ok',
          true,

        'message',
          CASE
            WHEN knockout_conflict_count > 0
            THEN
              format(
                'A prévia encontrou %s conflito(s) na programação projetada do mata-mata.',
                knockout_conflict_count
              )

            ELSE
              NULL
          END,

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          operational_preview
            -> 'summary',

        'days',
          COALESCE(
            operational_preview
              -> 'days',
            '[]'::jsonb
          ),

        'diagnostics',
          diagnostics_result
      );


    /*
     * Rollback forçado de toda a simulação.
     */
    RAISE EXCEPTION
      USING
        ERRCODE = 'P0001',
        MESSAGE = '__preview_success__';


  EXCEPTION
    WHEN SQLSTATE 'P0001'
    THEN
      IF SQLERRM =
        '__preview_success__'
      THEN
        RETURN preview_result;
      END IF;


      RETURN jsonb_build_object(
        'ok',
          false,

        'message',
          SQLERRM,

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          NULL,

        'days',
          '[]'::jsonb,

        'diagnostics',
          '[]'::jsonb
      );


    WHEN OTHERS
    THEN
      RETURN jsonb_build_object(
        'ok',
          false,

        'message',
          SQLERRM,

        'match_numbering_mode',
          resolved_match_numbering_mode,

        'summary',
          NULL,

        'days',
          '[]'::jsonb,

        'diagnostics',
          '[]'::jsonb
      );
  END;
END;
$function$;


COMMENT ON FUNCTION
  public.preview_championship_bracket_groups(
    UUID,
    JSONB
  )
IS
  'Simula em rollback a geração completa do chaveamento e devolve uma prévia operacional anonimizada por dia, local e quadra, incluindo grupos, mata-mata projetado, finais, reservas, intervalos e janelas vazias.';


NOTIFY pgrst, 'reload schema';