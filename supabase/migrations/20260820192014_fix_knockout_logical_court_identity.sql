CREATE OR REPLACE FUNCTION public.is_bracket_knockout_priority_court_match(
  _bracket_edition_id UUID,
  _priority_court_group_id UUID,
  _candidate_court_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  priority_location_name TEXT;
  priority_court_name TEXT;
  candidate_location_name TEXT;
  candidate_court_name TEXT;
BEGIN
  IF _bracket_edition_id IS NULL
    OR _priority_court_group_id IS NULL
    OR _candidate_court_group_id IS NULL
  THEN
    RETURN FALSE;
  END IF;

  IF _priority_court_group_id = _candidate_court_group_id THEN
    RETURN TRUE;
  END IF;

  SELECT locations_table.name, courts_table.name
  INTO priority_location_name, priority_court_name
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND courts_table.court_group_id = _priority_court_group_id
  ORDER BY
    days_table.event_date ASC,
    locations_table.position ASC,
    courts_table.position ASC
  LIMIT 1;

  SELECT locations_table.name, courts_table.name
  INTO candidate_location_name, candidate_court_name
  FROM public.championship_bracket_days AS days_table
  JOIN public.championship_bracket_locations AS locations_table
    ON locations_table.bracket_day_id = days_table.id
  JOIN public.championship_bracket_courts AS courts_table
    ON courts_table.bracket_location_id = locations_table.id
  WHERE days_table.bracket_edition_id = _bracket_edition_id
    AND courts_table.court_group_id = _candidate_court_group_id
  ORDER BY
    days_table.event_date ASC,
    locations_table.position ASC,
    courts_table.position ASC
  LIMIT 1;

  IF priority_location_name IS NULL
    OR priority_court_name IS NULL
    OR candidate_location_name IS NULL
    OR candidate_court_name IS NULL
  THEN
    RETURN FALSE;
  END IF;

  RETURN public.normalize_bracket_entity_name(priority_location_name) =
      public.normalize_bracket_entity_name(candidate_location_name)
    AND public.normalize_bracket_entity_name(priority_court_name) =
      public.normalize_bracket_entity_name(candidate_court_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_bracket_knockout_priority_court_group_id(
  _bracket_edition_id UUID,
  _sport_id UUID,
  _phase public.bracket_knockout_priority_phase,
  _division_scope public.bracket_knockout_division_scope
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  resolved_court_group_id UUID;
BEGIN
  IF _bracket_edition_id IS NULL
    OR _sport_id IS NULL
    OR _phase IS NULL
  THEN
    RETURN NULL;
  END IF;

  SELECT priorities_table.court_group_id
  INTO resolved_court_group_id
  FROM public.championship_bracket_knockout_court_priorities AS priorities_table
  WHERE priorities_table.bracket_edition_id = _bracket_edition_id
    AND priorities_table.sport_id = _sport_id
    AND priorities_table.phase = _phase
    AND priorities_table.division_scope = COALESCE(
      _division_scope,
      'ALL'::public.bracket_knockout_division_scope
    )
  LIMIT 1;

  IF resolved_court_group_id IS NULL
    AND COALESCE(
      _division_scope,
      'ALL'::public.bracket_knockout_division_scope
    ) <> 'ALL'::public.bracket_knockout_division_scope
  THEN
    SELECT priorities_table.court_group_id
    INTO resolved_court_group_id
    FROM public.championship_bracket_knockout_court_priorities AS priorities_table
    WHERE priorities_table.bracket_edition_id = _bracket_edition_id
      AND priorities_table.sport_id = _sport_id
      AND priorities_table.phase = _phase
      AND priorities_table.division_scope =
        'ALL'::public.bracket_knockout_division_scope
    LIMIT 1;
  END IF;

  IF resolved_court_group_id IS NOT NULL THEN
    RETURN resolved_court_group_id;
  END IF;

  WITH compatible_court_occurrences AS (
    SELECT
      days_table.event_date,
      locations_table.location_group_id,
      locations_table.position AS location_position,
      locations_table.name AS location_name,
      public.normalize_bracket_entity_name(locations_table.name)
        AS logical_location_name,
      courts_table.court_group_id,
      courts_table.position AS court_position,
      courts_table.name AS court_name,
      public.normalize_bracket_entity_name(courts_table.name)
        AS logical_court_name
    FROM public.championship_bracket_days AS days_table
    JOIN public.championship_bracket_locations AS locations_table
      ON locations_table.bracket_day_id = days_table.id
    JOIN public.championship_bracket_courts AS courts_table
      ON courts_table.bracket_location_id = locations_table.id
    JOIN public.championship_bracket_court_sports AS court_sports_table
      ON court_sports_table.bracket_court_id = courts_table.id
    WHERE days_table.bracket_edition_id = _bracket_edition_id
      AND court_sports_table.sport_id = _sport_id
  ),
  logical_courts AS (
    SELECT DISTINCT ON (logical_location_name, logical_court_name)
      location_group_id,
      location_position,
      location_name,
      logical_location_name,
      court_group_id,
      court_position,
      court_name,
      logical_court_name
    FROM compatible_court_occurrences
    ORDER BY
      logical_location_name ASC,
      logical_court_name ASC,
      location_position ASC,
      court_position ASC,
      event_date ASC,
      court_group_id ASC
  ),
  ordered_courts AS (
    SELECT
      logical_courts.*,
      ROW_NUMBER() OVER (
        ORDER BY
          location_position ASC,
          court_position ASC,
          location_name ASC,
          court_name ASC,
          court_group_id ASC
      ) AS overall_order
    FROM logical_courts
  )
  SELECT court_group_id
  INTO resolved_court_group_id
  FROM ordered_courts
  WHERE overall_order = CASE
    WHEN _phase = 'SEMIFINAL'::public.bracket_knockout_priority_phase
      AND COALESCE(
        _division_scope,
        'ALL'::public.bracket_knockout_division_scope
      ) = 'DIVISAO_ACESSO'::public.bracket_knockout_division_scope
      AND EXISTS (SELECT 1 FROM ordered_courts WHERE overall_order = 2)
      THEN 2
    ELSE 1
  END
  LIMIT 1;

  RETURN resolved_court_group_id;
END;
$$;

DO $migration_patch_knockout_logical_court$
DECLARE
  function_definition TEXT;
  one_line_pattern TEXT :=
    'pending_matches_table.preferred_knockout_court_group_id = slot_record.court_group_id';
  split_pattern TEXT :=
E'pending_matches_table
            .preferred_knockout_court_group_id =
              slot_record.court_group_id';
  replacement_expression TEXT :=
    'public.is_bracket_knockout_priority_court_match(' ||
    '_bracket_edition_id, ' ||
    'pending_matches_table.preferred_knockout_court_group_id, ' ||
    'slot_record.court_group_id' ||
    ')';
  one_line_count INTEGER;
  split_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.redistribute_bracket_scheduled_matches(uuid)'::regprocedure
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'redistribute_bracket_scheduled_matches(uuid) não existe.';
  END IF;

  one_line_count := (
    length(function_definition) - length(
      replace(function_definition, one_line_pattern, '')
    )
  ) / length(one_line_pattern);
  split_count := (
    length(function_definition) - length(
      replace(function_definition, split_pattern, '')
    )
  ) / length(split_pattern);

  IF one_line_count + split_count = 0 THEN
    RAISE EXCEPTION 'Nenhuma comparação de prioridade do mata-mata foi localizada no redistribuidor.';
  END IF;

  function_definition := replace(
    function_definition,
    one_line_pattern,
    replacement_expression
  );
  function_definition := replace(
    function_definition,
    split_pattern,
    replacement_expression
  );

  IF strpos(function_definition, one_line_pattern) > 0 THEN
    RAISE EXCEPTION 'Ainda existe comparação literal de court_group_id no formato de uma linha.';
  END IF;

  IF strpos(function_definition, split_pattern) > 0 THEN
    RAISE EXCEPTION 'Ainda existe comparação literal de court_group_id no formato multilinha.';
  END IF;

  EXECUTE function_definition;
END;
$migration_patch_knockout_logical_court$;

COMMENT ON FUNCTION public.is_bracket_knockout_priority_court_match(UUID, UUID, UUID)
IS 'Compara quadras de prioridade do mata-mata pela identidade lógica local + nome da quadra, independentemente do court_group_id materializado em cada data.';

NOTIFY pgrst, 'reload schema';
