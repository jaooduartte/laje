DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS types_table
    JOIN pg_namespace AS namespaces_table
      ON namespaces_table.oid = types_table.typnamespace
    WHERE namespaces_table.nspname = 'public'
      AND types_table.typname = 'bracket_court_sequence_mode'
  ) THEN
    CREATE TYPE public.bracket_court_sequence_mode AS ENUM (
      'FLEXIBLE',
      'GROUP_NAIPE',
      'GROUP_DIVISION'
    );
  END IF;
END;
$$;

ALTER TABLE public.championship_bracket_court_sports
  ADD COLUMN IF NOT EXISTS sequence_mode
    public.bracket_court_sequence_mode
    NOT NULL
    DEFAULT 'FLEXIBLE'::public.bracket_court_sequence_mode;

COMMENT ON COLUMN
  public.championship_bracket_court_sports.sequence_mode
IS
  'Define se a modalidade permanece flexível ou é agrupada estritamente por naipe ou divisão na quadra.';

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
      sequence_mode =
        'GROUP_NAIPE'::public.bracket_court_sequence_mode
      AND preferred_naipe IS NOT NULL
      AND preferred_division IS NULL
    )

    OR (
      sequence_mode =
        'GROUP_DIVISION'::public.bracket_court_sequence_mode
      AND preferred_division IS NOT NULL
      AND preferred_naipe IS NULL
    )
  )
  NOT VALID;

ALTER TABLE public.championship_bracket_court_sports
  VALIDATE CONSTRAINT
    championship_bracket_court_sports_sequence_mode_preferences_check;


-- Mantém sequence_mode sincronizado com a configuração salva na etapa 11.
--
-- A leitura é feita diretamente do payload_snapshot da edição. Isso também
-- protege o modo estrito de atualizações posteriores realizadas pela agenda.
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

  WHERE day_configuration.value ->> 'date' =
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
      'GROUP_NAIPE'::public.bracket_court_sequence_mode;

    NEW.preferred_naipe :=
      configured_preferred_naipe
        ::public.match_naipe;

    NEW.preferred_division := NULL;

  ELSIF configured_sequence_mode = 'GROUP_DIVISION'
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
      'FLEXIBLE'::public.bracket_court_sequence_mode;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  sync_bracket_court_sequence_mode_from_payload_trigger
ON public.championship_bracket_court_sports;

CREATE TRIGGER
  sync_bracket_court_sequence_mode_from_payload_trigger
BEFORE INSERT OR UPDATE OF
  bracket_court_id,
  sport_id,
  preferred_naipe,
  preferred_division,
  sequence_mode
ON public.championship_bracket_court_sports
FOR EACH ROW
EXECUTE FUNCTION
  public.sync_bracket_court_sequence_mode_from_payload();


-- A prioridade global pós-geração pode alterar somente registros flexíveis.
-- O ROW_NUMBER também considera somente essas quadras, para que a alternância
-- comece na primeira quadra realmente editável.
CREATE OR REPLACE FUNCTION
  public.sync_bracket_global_court_preferences(
    _bracket_edition_id UUID,
    _location_group_id UUID,
    _sport_id UUID,
    _priority_mode
      public.bracket_court_priority_mode
  )
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  naipe_options public.match_naipe[];
  division_options public.team_division[];

  naipe_option_count INTEGER;
  division_option_count INTEGER;
BEGIN
  SELECT COALESCE(
    array_agg(
      ordered_naipes_table.naipe
      ORDER BY
        ordered_naipes_table.sort_order,
        ordered_naipes_table.naipe
    ),
    ARRAY[]::public.match_naipe[]
  )
  INTO naipe_options
  FROM (
    SELECT
      matches_table.naipe,

      MIN(
        CASE matches_table.naipe
          WHEN 'FEMININO'::public.match_naipe
            THEN 1

          WHEN 'MASCULINO'::public.match_naipe
            THEN 2

          ELSE 3
        END
      ) AS sort_order

    FROM public.matches AS matches_table

    JOIN public.championship_bracket_matches
      AS bracket_matches_table
      ON bracket_matches_table.match_id =
        matches_table.id

    WHERE bracket_matches_table.bracket_edition_id =
        _bracket_edition_id

      AND matches_table.sport_id =
        _sport_id

    GROUP BY matches_table.naipe
  ) AS ordered_naipes_table;

  SELECT COALESCE(
    array_agg(
      ordered_divisions_table.division
      ORDER BY
        ordered_divisions_table.sort_order,
        ordered_divisions_table.division
    ),
    ARRAY[]::public.team_division[]
  )
  INTO division_options
  FROM (
    SELECT
      matches_table.division,

      MIN(
        CASE matches_table.division
          WHEN 'DIVISAO_PRINCIPAL'
            ::public.team_division
            THEN 1

          WHEN 'DIVISAO_ACESSO'
            ::public.team_division
            THEN 2

          ELSE 99
        END
      ) AS sort_order

    FROM public.matches AS matches_table

    JOIN public.championship_bracket_matches
      AS bracket_matches_table
      ON bracket_matches_table.match_id =
        matches_table.id

    WHERE bracket_matches_table.bracket_edition_id =
        _bracket_edition_id

      AND matches_table.sport_id =
        _sport_id

      AND matches_table.division IS NOT NULL

    GROUP BY matches_table.division
  ) AS ordered_divisions_table;

  naipe_option_count :=
    COALESCE(
      array_length(naipe_options, 1),
      0
    );

  division_option_count :=
    COALESCE(
      array_length(division_options, 1),
      0
    );

  WITH ordered_courts AS (
    SELECT
      court_sports_table.id
        AS court_sport_id,

      ROW_NUMBER() OVER (
        PARTITION BY days_table.id
        ORDER BY
          courts_table.position ASC,
          courts_table.name ASC,
          courts_table.id ASC
      ) AS day_court_order

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

      AND locations_table.location_group_id =
        _location_group_id

      AND court_sports_table.sport_id =
        _sport_id

      AND court_sports_table.sequence_mode =
        'FLEXIBLE'
          ::public.bracket_court_sequence_mode
  )

  UPDATE public.championship_bracket_court_sports
    AS court_sports_table

  SET
    preferred_naipe = CASE
      WHEN _priority_mode =
          'NAIPE'
            ::public.bracket_court_priority_mode

        AND naipe_option_count > 0

      THEN naipe_options[
        (
          (
            ordered_courts.day_court_order - 1
          ) % naipe_option_count
        ) + 1
      ]

      ELSE NULL
    END,

    preferred_division = CASE
      WHEN _priority_mode =
          'DIVISION'
            ::public.bracket_court_priority_mode

        AND division_option_count > 0

      THEN division_options[
        (
          (
            ordered_courts.day_court_order - 1
          ) % division_option_count
        ) + 1
      ]

      ELSE NULL
    END

  FROM ordered_courts

  WHERE ordered_courts.court_sport_id =
    court_sports_table.id;
END;
$$;

COMMENT ON FUNCTION
  public.sync_bracket_global_court_preferences(
    UUID,
    UUID,
    UUID,
    public.bracket_court_priority_mode
  )
IS
  'Aplica prioridades globais somente às quadras com sequenciamento FLEXIBLE.';

NOTIFY pgrst, 'reload schema';