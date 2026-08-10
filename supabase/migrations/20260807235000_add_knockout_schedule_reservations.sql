CREATE TABLE IF NOT EXISTS
  public.championship_bracket_knockout_schedule_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    bracket_edition_id UUID NOT NULL,
    competition_id UUID NOT NULL,

    round_number INTEGER NOT NULL,
    slot_number INTEGER NOT NULL,

    is_third_place BOOLEAN NOT NULL DEFAULT false,

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

    scheduled_slot INTEGER NOT NULL,
    queue_position INTEGER NOT NULL,

    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,

    duration_minutes INTEGER NOT NULL,

    is_manual_final BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT
      cb_ko_schedule_reservation_edition_fkey
      FOREIGN KEY (bracket_edition_id)
      REFERENCES public.championship_bracket_editions(id)
      ON DELETE CASCADE,

    CONSTRAINT
      cb_ko_schedule_reservation_competition_fkey
      FOREIGN KEY (competition_id)
      REFERENCES public.championship_bracket_competitions(id)
      ON DELETE CASCADE,

    CONSTRAINT
      cb_ko_schedule_reservation_day_fkey
      FOREIGN KEY (bracket_day_id)
      REFERENCES public.championship_bracket_days(id)
      ON DELETE CASCADE,

    CONSTRAINT
      cb_ko_schedule_reservation_court_fkey
      FOREIGN KEY (bracket_court_id)
      REFERENCES public.championship_bracket_courts(id)
      ON DELETE CASCADE,

    CONSTRAINT
      cb_ko_schedule_reservation_unique
      UNIQUE (
        competition_id,
        round_number,
        slot_number
      ),

    CONSTRAINT
      cb_ko_schedule_reservation_round_check
      CHECK (round_number > 0),

    CONSTRAINT
      cb_ko_schedule_reservation_slot_check
      CHECK (slot_number > 0),

    CONSTRAINT
      cb_ko_schedule_reservation_scheduled_slot_check
      CHECK (scheduled_slot > 0),

    CONSTRAINT
      cb_ko_schedule_reservation_queue_check
      CHECK (queue_position > 0),

    CONSTRAINT
      cb_ko_schedule_reservation_duration_check
      CHECK (duration_minutes > 0),

    CONSTRAINT
      cb_ko_schedule_reservation_interval_check
      CHECK (end_at > start_at),

    CONSTRAINT
      cb_ko_schedule_reservation_start_date_check
      CHECK (
        (
          start_at
          AT TIME ZONE 'America/Sao_Paulo'
        )::date = scheduled_date
      ),

    CONSTRAINT
      cb_ko_schedule_reservation_end_date_check
      CHECK (
        (
          end_at
          AT TIME ZONE 'America/Sao_Paulo'
        )::date = scheduled_date
      )
  );


CREATE INDEX IF NOT EXISTS
  cb_ko_schedule_reservation_edition_idx
ON public.championship_bracket_knockout_schedule_reservations (
  bracket_edition_id
);


CREATE INDEX IF NOT EXISTS
  cb_ko_schedule_reservation_competition_idx
ON public.championship_bracket_knockout_schedule_reservations (
  competition_id,
  round_number,
  slot_number
);


CREATE INDEX IF NOT EXISTS
  cb_ko_schedule_reservation_court_time_idx
ON public.championship_bracket_knockout_schedule_reservations (
  bracket_edition_id,
  scheduled_date,
  bracket_court_id,
  start_at,
  end_at
);


COMMENT ON TABLE
  public.championship_bracket_knockout_schedule_reservations
IS
  'Reservas autoritativas de agenda do mata-mata calculadas antes da definição dos classificados. Os jogos reais reutilizam estes horários quando os times passam a ser conhecidos.';


COMMENT ON COLUMN
  public.championship_bracket_knockout_schedule_reservations.is_manual_final
IS
  'Indica que a reserva corresponde a uma final principal programada manualmente na etapa 11.';


COMMENT ON COLUMN
  public.championship_bracket_knockout_schedule_reservations.scheduled_slot
IS
  'Posição física/operacional reservada na quadra. Não representa a numeração visual configurável do jogo.';


COMMENT ON COLUMN
  public.championship_bracket_knockout_schedule_reservations.queue_position
IS
  'Posição operacional persistida para materialização futura do jogo. Não deve ser usada para implementar match_numbering_mode.';


ALTER TABLE
  public.championship_bracket_knockout_schedule_reservations
ENABLE ROW LEVEL SECURITY;


REVOKE ALL ON TABLE
  public.championship_bracket_knockout_schedule_reservations
FROM PUBLIC, anon, authenticated;


DO $migration_patch_knockout_reservation_assignment$
DECLARE
  function_signature REGPROCEDURE :=
    to_regprocedure(
      'public.assign_championship_knockout_match_planned_schedule(uuid,uuid)'
    );

  function_definition TEXT;
  updated_definition TEXT;

  source_block TEXT;
  target_block TEXT;
BEGIN
  IF function_signature IS NULL THEN
    RAISE EXCEPTION
      'A função assign_championship_knockout_match_planned_schedule(uuid,uuid) não existe.';
  END IF;

  SELECT pg_get_functiondef(function_signature)
  INTO function_definition;

  -- Permite reaplicar a migration de forma segura caso o patch
  -- já esteja presente na função.
  IF strpos(
    function_definition,
    'championship_bracket_knockout_schedule_reservations'
  ) > 0 THEN
    RETURN;
  END IF;

  updated_definition := function_definition;


  -- Adiciona o registro usado para carregar uma reserva autoritativa.

  source_block :=
$source$
  final_schedule_record RECORD;
$source$;

  target_block :=
$target$
  final_schedule_record RECORD;
  reservation_record RECORD;
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar a declaração final_schedule_record na função de agenda do mata-mata.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  -- A final manual continua tendo precedência absoluta.
  --
  -- Portanto a reserva projetada é consultada somente depois da tentativa
  -- de resolver get_championship_knockout_final_program_schedule().
  --
  -- Para QF/SF e finais automáticas, a reserva passa a ser a fonte
  -- autoritativa antes do fallback legado de data/local.

  source_block :=
$source$
  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
$source$;

  target_block :=
$target$
  reservation_record := NULL;

  SELECT
    reservations_table.*
  INTO reservation_record
  FROM
    public.championship_bracket_knockout_schedule_reservations
      AS reservations_table
  WHERE reservations_table.bracket_edition_id =
      bracket_match_record.bracket_edition_id
    AND reservations_table.competition_id =
      bracket_match_record.competition_id
    AND reservations_table.round_number =
      bracket_match_record.round_number
    AND reservations_table.slot_number =
      bracket_match_record.slot_number
    AND reservations_table.is_third_place =
      bracket_match_record.is_third_place
  LIMIT 1;

  IF reservation_record.id IS NOT NULL THEN
    UPDATE public.championship_bracket_matches
      AS bracket_matches_table
    SET
      planned_scheduled_date =
        reservation_record.scheduled_date,

      planned_period =
        reservation_record.schedule_period,

      planned_scheduled_slot =
        reservation_record.scheduled_slot,

      planned_queue_position =
        reservation_record.queue_position,

      planned_start_time =
        (
          reservation_record.start_at
          AT TIME ZONE 'America/Sao_Paulo'
        )::time,

      planned_end_time =
        (
          reservation_record.end_at
          AT TIME ZONE 'America/Sao_Paulo'
        )::time,

      planned_location_group_id =
        reservation_record.location_group_id,

      planned_court_group_id =
        reservation_record.court_group_id,

      planned_location_name =
        reservation_record.location_name,

      planned_court_name =
        reservation_record.court_name

    WHERE bracket_matches_table.id =
      _bracket_match_id;

    RETURN;
  END IF;


  SELECT COALESCE(
    (
      SELECT MAX(matches_table.scheduled_date)
$target$;

  IF strpos(updated_definition, source_block) = 0 THEN
    RAISE EXCEPTION
      'Não foi possível localizar o fallback de agenda na função de mata-mata.';
  END IF;

  updated_definition :=
    replace(
      updated_definition,
      source_block,
      target_block
    );


  IF strpos(
    updated_definition,
    'championship_bracket_knockout_schedule_reservations'
  ) = 0
    OR strpos(
      updated_definition,
      'reservation_record'
    ) = 0
  THEN
    RAISE EXCEPTION
      'Não foi possível instalar o suporte às reservas autoritativas do mata-mata.';
  END IF;


  EXECUTE updated_definition;
END;
$migration_patch_knockout_reservation_assignment$;


COMMENT ON FUNCTION
  public.assign_championship_knockout_match_planned_schedule(
    UUID,
    UUID
  )
IS
  'Define a agenda planejada do mata-mata. Finais manuais mantêm precedência; quando existe uma reserva autoritativa projetada, QF/SF/finais automáticas reutilizam exatamente a data, quadra e horário reservados antes do fallback legado.';


NOTIFY pgrst, 'reload schema';