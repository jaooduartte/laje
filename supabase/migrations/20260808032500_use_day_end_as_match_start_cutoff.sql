-- Trata o horário final da agenda diária como limite para INICIAR
-- um novo jogo, e não como limite obrigatório para TERMINAR o jogo.
--
-- Exemplo para um dia configurado até 20:00:
--
-- 19:50 → 20:30  permitido
-- 20:00 → 20:40  não inicia
-- 20:01 → 20:41  não inicia
--
-- O jogo continua:
--
-- - não podendo atravessar uma pausa configurada;
-- - não podendo atravessar a meia-noite;
-- - respeitando o início configurado do dia.
--
-- Esta função é utilizada na construção dos slots operacionais
-- da redistribuição.

CREATE OR REPLACE FUNCTION
  public.resolve_bracket_court_next_available_start(
    _bracket_day_id UUID,
    _bracket_court_id UUID,
    _candidate_start TIMESTAMPTZ,
    _duration_minutes INTEGER
  )
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  bracket_day_record RECORD;
  break_record RECORD;

  current_start TIMESTAMPTZ;
  current_end TIMESTAMPTZ;

  configured_day_start_at TIMESTAMPTZ;
  configured_day_end_at TIMESTAMPTZ;
  next_midnight_at TIMESTAMPTZ;

  has_conflicting_break BOOLEAN;
BEGIN
  IF _duration_minutes IS NULL
    OR _duration_minutes <= 0
  THEN
    RETURN NULL;
  END IF;


  SELECT
    event_date,
    start_time,
    end_time
  INTO bracket_day_record

  FROM public.championship_bracket_days

  WHERE id =
    _bracket_day_id

  LIMIT 1;


  IF bracket_day_record.event_date
    IS NULL
  THEN
    RETURN NULL;
  END IF;


  configured_day_start_at :=
    public.combine_bracket_schedule_timestamp(
      bracket_day_record.event_date,
      bracket_day_record.start_time
    );


  configured_day_end_at :=
    public.combine_bracket_schedule_timestamp(
      bracket_day_record.event_date,
      bracket_day_record.end_time
    );


  /*
   * A agenda nunca faz rollover automático de uma partida
   * atravessando a meia-noite.
   *
   * O próximo jogo deve ser programado explicitamente em outro dia.
   */
  next_midnight_at :=
    (
      (
        bracket_day_record.event_date
        + 1
      )::timestamp
      AT TIME ZONE 'America/Sao_Paulo'
    );


  current_start :=
    GREATEST(
      _candidate_start,
      configured_day_start_at
    );


  LOOP
    /*
     * O horário final configurado para o dia é o último limite
     * operacional para INICIAR uma nova partida.
     *
     * Ex.:
     *
     * limite = 20:00
     *
     * 19:59 → permitido
     * 20:00 → não inicia
     */
    IF current_start >=
      configured_day_end_at
    THEN
      RETURN NULL;
    END IF;


    current_end :=
      current_start
      + make_interval(
          mins => _duration_minutes
        );


    /*
     * Mesmo podendo ultrapassar o horário configurado de término
     * da agenda, uma partida automática nunca atravessa a meia-noite.
     *
     * Terminar exatamente 00:00 também é rejeitado.
     */
    IF current_end >=
      next_midnight_at
    THEN
      RETURN NULL;
    END IF;


    has_conflicting_break :=
      false;


    FOR break_record IN
      SELECT
        public.combine_bracket_schedule_timestamp(
          bracket_day_record.event_date,
          bracket_day_breaks_table.break_start_time
        ) AS break_start_at,

        public.combine_bracket_schedule_timestamp(
          bracket_day_record.event_date,
          bracket_day_breaks_table.break_end_time
        ) AS break_end_at

      FROM
        public.championship_bracket_day_breaks
          AS bracket_day_breaks_table

      WHERE bracket_day_breaks_table.bracket_day_id =
          _bracket_day_id

        AND (
          bracket_day_breaks_table.scope_type =
            'ALL_COURTS'
              ::public.bracket_day_break_scope_type

          OR (
            bracket_day_breaks_table.scope_type =
              'COURT'
                ::public.bracket_day_break_scope_type

            AND bracket_day_breaks_table.bracket_court_id =
              _bracket_court_id
          )
        )

      ORDER BY
        bracket_day_breaks_table.break_start_time ASC,
        bracket_day_breaks_table.position ASC
    LOOP
      /*
       * Continua proibido atravessar uma pausa.
       *
       * Se houver conflito, o candidato é empurrado exatamente
       * para o final da pausa.
       */
      IF current_start <
          break_record.break_end_at

        AND current_end >
          break_record.break_start_at
      THEN
        current_start :=
          break_record.break_end_at;

        has_conflicting_break :=
          true;

        EXIT;
      END IF;
    END LOOP;


    EXIT WHEN NOT
      has_conflicting_break;
  END LOOP;


  RETURN current_start;
END;
$function$;


COMMENT ON FUNCTION
  public.resolve_bracket_court_next_available_start(
    UUID,
    UUID,
    TIMESTAMPTZ,
    INTEGER
  )
IS
  'Resolve o próximo início disponível de uma partida na quadra. O horário final configurado do dia é limite de início, não de término; partidas podem terminar depois desse horário, mas não podem atravessar pausas nem a meia-noite.';


NOTIFY pgrst, 'reload schema';