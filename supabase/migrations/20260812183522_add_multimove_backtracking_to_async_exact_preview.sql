-- LAJE-81: amplia a realocação da prévia exata para permitir cadeias de
-- múltiplas movimentações sem alterar as regras de descanso existentes.

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.is_match_slot_static_eligible(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH context AS (
    SELECT
      jobs_table.payload,
      competitions_table.sport_id,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key,
      matches_table.home_team_id,
      matches_table.away_team_id,
      slots_table.event_date,
      slots_table.start_at,
      slots_table.end_at,
      slots_table.preferred_naipe,
      slots_table.preferred_division,
      slots_table.sequence_mode
    FROM championship_bracket_preview_private.jobs AS jobs_table

    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.job_id = jobs_table.id
      AND matches_table.id = _match_id

    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id

    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = jobs_table.id
      AND slots_table.id = _slot_id
      AND slots_table.sport_id = competitions_table.sport_id

    WHERE jobs_table.id = _job_id
  )

  SELECT COALESCE((
    SELECT
      (
        context.sequence_mode <> 'GROUP_NAIPE'
        OR context.preferred_naipe IS NULL
        OR context.preferred_naipe = context.naipe
      )

      AND (
        context.preferred_division IS NULL
        OR context.preferred_division IS NOT DISTINCT FROM context.division
        OR context.sequence_mode <> 'GROUP_DIVISION'
      )

      AND public.is_championship_bracket_competition_slot_playable(
        context.payload,
        context.competition_key,
        context.event_date,
        context.start_at,
        context.end_at
      )

      AND public.is_championship_bracket_team_slot_playable(
        context.payload,
        context.home_team_id,
        context.competition_key,
        context.event_date,
        context.start_at,
        context.end_at
      )

      AND public.is_championship_bracket_team_slot_playable(
        context.payload,
        context.away_team_id,
        context.competition_key,
        context.event_date,
        context.start_at,
        context.end_at
      )

      AND championship_bracket_preview_private.is_job_slot_within_day_bounds(
        _job_id,
        _slot_id
      )

    FROM context
  ), false);
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.is_match_slot_static_eligible (UUID, UUID, BIGINT)
FROM PUBLIC, anon, authenticated;


COMMENT ON FUNCTION championship_bracket_preview_private.is_match_slot_static_eligible(
  UUID,
  UUID,
  BIGINT
) IS
'Valida somente as restrições fixas do payload para um jogo ocupar um slot. Não considera ocupação atual, descanso, limite dinâmico de partidas do alvo nem ordem dinâmica das rodadas, permitindo que o mecanismo de backtracking analise realocações.';

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_match_slot_blockers(
  _job_id UUID,
  _match_id UUID,
  _slot_id BIGINT
)
RETURNS TABLE (
  blocker_match_id UUID,
  blocker_slot_id BIGINT,
  blocker_is_assigned BOOLEAN,
  blocker_reasons TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH context AS (
    SELECT
      jobs_table.payload,

      matches_table.id AS match_id,
      matches_table.competition_id,
      matches_table.group_id,
      matches_table.round_number,

      competitions_table.sport_id,

      slots_table.id AS slot_id,
      slots_table.event_date,
      slots_table.court_key,
      slots_table.start_at,
      slots_table.end_at,

      slot_target.has_sport_targets,
      slot_target.planned_match_count

    FROM championship_bracket_preview_private.jobs AS jobs_table

    JOIN championship_bracket_preview_private.matches AS matches_table
      ON matches_table.job_id = jobs_table.id
      AND matches_table.id = _match_id

    JOIN championship_bracket_preview_private.competitions AS competitions_table
      ON competitions_table.id = matches_table.competition_id

    JOIN championship_bracket_preview_private.slots AS slots_table
      ON slots_table.job_id = jobs_table.id
      AND slots_table.id = _slot_id
      AND slots_table.sport_id = competitions_table.sport_id

    CROSS JOIN LATERAL
      championship_bracket_preview_private.resolve_slot_sport_target(
        jobs_table.payload,
        slots_table.event_date,
        slots_table.court_key,
        slots_table.sport_id
      ) AS slot_target

    WHERE jobs_table.id = _job_id
  ),

/*
 * 1. Outro jogo já ocupa fisicamente a mesma quadra
 *    no mesmo intervalo.
 */


occupation_blockers AS (
    SELECT
      occupied_assignment.match_id AS blocker_match_id,
      occupied_assignment.slot_id AS blocker_slot_id,
      true AS blocker_is_assigned,
      'COURT_OCCUPATION'::text AS blocker_reason

    FROM context

    JOIN championship_bracket_preview_private.assignments
      AS occupied_assignment
      ON occupied_assignment.job_id = _job_id
      AND occupied_assignment.match_id <> _match_id

    JOIN championship_bracket_preview_private.slots
      AS occupied_slot
      ON occupied_slot.id = occupied_assignment.slot_id

    WHERE occupied_slot.court_key = context.court_key
      AND occupied_slot.start_at < context.end_at
      AND occupied_slot.end_at > context.start_at
  ),

/*
 * 2. Jogos que impedem o encaixe pela regra atual de
 *    descanso da atlética.
 *
 *    Importante:
 *    a regra de descanso NÃO é alterada aqui.
 */


rest_blockers AS (
    SELECT
      previous_assignment.match_id AS blocker_match_id,
      previous_assignment.slot_id AS blocker_slot_id,
      true AS blocker_is_assigned,
      'TEAM_REST_CONSTRAINT'::text AS blocker_reason

    FROM championship_bracket_preview_private.assignments
      AS previous_assignment

    WHERE previous_assignment.job_id = _job_id
      AND previous_assignment.match_id <> _match_id

      AND championship_bracket_preview_private.is_match_rest_conflict(
        _job_id,
        _match_id,
        _slot_id,
        previous_assignment.match_id
      )
  ),

/*
 * 3. Rodadas anteriores que ainda não foram encaixadas.
 *
 *    Esses jogos também são considerados dependências do
 *    candidato. O solver poderá tentar encaixá-los antes.
 */


pending_round_blockers AS (
    SELECT
      earlier_match.id AS blocker_match_id,
      NULL::bigint AS blocker_slot_id,
      false AS blocker_is_assigned,
      'EARLIER_ROUND_PENDING'::text AS blocker_reason

    FROM context

    JOIN championship_bracket_preview_private.matches
      AS earlier_match
      ON earlier_match.job_id = _job_id
      AND earlier_match.id <> _match_id
      AND earlier_match.competition_id = context.competition_id
      AND earlier_match.group_id = context.group_id
      AND earlier_match.round_number < context.round_number
      AND earlier_match.assigned = false
  ),

/*
 * 4. Jogos já programados cuja posição cronológica entra em
 *    conflito com a rodada do candidato.
 */


assigned_round_blockers AS (
    SELECT
      ordered_match.id AS blocker_match_id,
      ordered_assignment.slot_id AS blocker_slot_id,
      true AS blocker_is_assigned,
      'ROUND_ORDER_CONSTRAINT'::text AS blocker_reason

    FROM context

    JOIN championship_bracket_preview_private.matches
      AS ordered_match
      ON ordered_match.job_id = _job_id
      AND ordered_match.id <> _match_id
      AND ordered_match.competition_id = context.competition_id
      AND ordered_match.group_id = context.group_id

    JOIN championship_bracket_preview_private.assignments
      AS ordered_assignment
      ON ordered_assignment.job_id = _job_id
      AND ordered_assignment.match_id = ordered_match.id

    JOIN championship_bracket_preview_private.slots
      AS ordered_slot
      ON ordered_slot.id = ordered_assignment.slot_id

    WHERE (
      (
        ordered_match.round_number < context.round_number
        AND ordered_slot.end_at > context.start_at
      )
      OR
      (
        ordered_match.round_number > context.round_number
        AND context.end_at > ordered_slot.start_at
      )
    )
  ),

/*
 * 5. Verifica se a meta de jogos daquela combinação
 *    dia + quadra + modalidade já foi totalmente ocupada.
 */
target_capacity_state AS (
    SELECT context.*, (
            SELECT count(*)
            FROM
                championship_bracket_preview_private.assignments AS target_assignment
                JOIN championship_bracket_preview_private.slots AS target_slot ON target_slot.id = target_assignment.slot_id
            WHERE
                target_assignment.job_id = _job_id
                AND target_assignment.match_id <> _match_id
                AND target_slot.event_date = context.event_date
                AND target_slot.court_key = context.court_key
                AND target_slot.sport_id = context.sport_id
        ) AS assigned_target_count
    FROM context
),

/*
 * Se a meta já estiver cheia, qualquer um dos jogos atualmente
 * ocupando aquela meta pode ser candidato a realocação.
 */


target_capacity_blockers AS (
    SELECT
      target_assignment.match_id AS blocker_match_id,
      target_assignment.slot_id AS blocker_slot_id,
      true AS blocker_is_assigned,
      'TARGET_CAPACITY'::text AS blocker_reason

    FROM target_capacity_state AS target_state

    JOIN championship_bracket_preview_private.assignments
      AS target_assignment
      ON target_assignment.job_id = _job_id
      AND target_assignment.match_id <> _match_id

    JOIN championship_bracket_preview_private.slots
      AS target_slot
      ON target_slot.id = target_assignment.slot_id

    WHERE target_state.has_sport_targets
      AND COALESCE(target_state.planned_match_count, 0)
        <= target_state.assigned_target_count

      AND target_slot.event_date = target_state.event_date
      AND target_slot.court_key = target_state.court_key
      AND target_slot.sport_id = target_state.sport_id
  ),

  all_blockers AS (
    SELECT * FROM occupation_blockers

    UNION ALL

    SELECT * FROM rest_blockers

    UNION ALL

    SELECT * FROM pending_round_blockers

    UNION ALL

    SELECT * FROM assigned_round_blockers

    UNION ALL

    SELECT * FROM target_capacity_blockers
  )

SELECT
    all_blockers.blocker_match_id,
    all_blockers.blocker_slot_id,
    all_blockers.blocker_is_assigned,
    array_agg (
        DISTINCT all_blockers.blocker_reason
        ORDER BY all_blockers.blocker_reason
    ) AS blocker_reasons
FROM all_blockers
GROUP BY
    all_blockers.blocker_match_id,
    all_blockers.blocker_slot_id,
    all_blockers.blocker_is_assigned
ORDER BY all_blockers.blocker_is_assigned DESC, all_blockers.blocker_match_id;

$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.resolve_match_slot_blockers (UUID, UUID, BIGINT)
FROM PUBLIC, anon, authenticated;


COMMENT ON FUNCTION championship_bracket_preview_private.resolve_match_slot_blockers(
  UUID,
  UUID,
  BIGINT
) IS
'Retorna os jogos que bloqueiam a colocação de uma partida em determinado slot por ocupação física, descanso, ordem de rodadas ou capacidade da meta. Também informa rodadas anteriores ainda pendentes para permitir resolução recursiva.';

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
  _job_id UUID,
  _match_id UUID,
  _origin_slot_id BIGINT DEFAULT NULL,
  _excluded_slot_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  _maximum_candidates INTEGER DEFAULT 300
)
RETURNS TABLE (
  slot_id BIGINT,
  event_date DATE,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  location_key UUID,
  court_key UUID,
  sequence_index INTEGER,
  day_distance INTEGER,
  time_distance_seconds NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
  WITH origin_context AS (
    SELECT
      origin_slot.event_date,
      origin_slot.start_at
    FROM championship_bracket_preview_private.slots AS origin_slot
    WHERE origin_slot.job_id = _job_id
      AND origin_slot.id = _origin_slot_id
  ),

  candidate_slots AS (
    SELECT
      slots_table.id AS slot_id,
      slots_table.event_date,
      slots_table.start_at,
      slots_table.end_at,
      slots_table.location_key,
      slots_table.court_key,
      slots_table.sequence_index,

      CASE
        WHEN origin_context.event_date IS NULL THEN 0
        ELSE abs(
          slots_table.event_date - origin_context.event_date
        )
      END::integer AS day_distance,

      CASE
        WHEN origin_context.start_at IS NULL THEN 0::numeric
        ELSE abs(
          extract(
            epoch FROM (
              slots_table.start_at - origin_context.start_at
            )
          )
        )
      END AS time_distance_seconds

    FROM championship_bracket_preview_private.slots AS slots_table

    LEFT JOIN origin_context
      ON true

    WHERE slots_table.job_id = _job_id

      AND (
        _origin_slot_id IS NULL
        OR slots_table.id <> _origin_slot_id
      )

      
AND NOT (
  slots_table.id = ANY(
    COALESCE(
      _excluded_slot_ids,
      ARRAY[]::BIGINT[]
    )
  )
)

AND NOT EXISTS (
  SELECT 1

  FROM championship_bracket_preview_private.slots AS reserved_slot

  WHERE reserved_slot.job_id = _job_id

    AND reserved_slot.id = ANY(
      COALESCE(
        _excluded_slot_ids,
        ARRAY[]::BIGINT[]
      )
    )

    AND reserved_slot.court_key = slots_table.court_key

    AND reserved_slot.start_at < slots_table.end_at
    AND reserved_slot.end_at > slots_table.start_at
)

AND championship_bracket_preview_private.is_match_slot_static_eligible(
  _job_id,
  _match_id,
  slots_table.id
)
  )

SELECT candidate_slots.slot_id, candidate_slots.event_date, candidate_slots.start_at, candidate_slots.end_at, candidate_slots.location_key, candidate_slots.court_key, candidate_slots.sequence_index, candidate_slots.day_distance, candidate_slots.time_distance_seconds
FROM candidate_slots
ORDER BY

/*
 * Primeiro tentamos preservar o dia original.
 */
candidate_slots.day_distance,

/*
 * Dentro dele, tentamos horários próximos.
 *
 * Se isso não resolver, a consulta continua naturalmente
 * para horários mais distantes e posteriormente outros dias.
 */
candidate_slots.time_distance_seconds,
candidate_slots.event_date,
candidate_slots.start_at,
candidate_slots.location_key,
candidate_slots.court_key,
candidate_slots.sequence_index,
candidate_slots.slot_id
LIMIT greatest(
        COALESCE(_maximum_candidates, 300),
        1
    );

$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
  UUID,
  UUID,
  BIGINT,
  BIGINT[],
  INTEGER
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
  UUID,
  UUID,
  BIGINT,
  BIGINT[],
  INTEGER
) IS
'Lista deterministicamente os destinos estruturalmente válidos para realocar uma partida. Prioriza horários próximos do slot original, mas continua a busca por períodos mais distantes e outros dias configurados no payload.';

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_resolve_match_slot_backtracking(
  _job_id UUID,
  _match_id UUID,
  _target_slot_id BIGINT,
  _match_number INTEGER,
  _path_match_ids UUID[],
  _reserved_slot_ids BIGINT[],
  _depth INTEGER,
  _maximum_depth INTEGER,
  _maximum_candidates_per_match INTEGER,
  _maximum_relocations INTEGER,
  _relocations_used INTEGER,
  _deadline TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  blocker_record RECORD;
  candidate_slot_record RECORD;
  target_event_date DATE;
  target_court_key UUID;
  target_start_at TIMESTAMPTZ;
  target_end_at TIMESTAMPTZ;
  target_round_number INTEGER;
  has_hard_blockers BOOLEAN := false;
BEGIN
  IF clock_timestamp() >= _deadline THEN
    RETURN false;
  END IF;

  IF _depth > GREATEST(_maximum_depth, 1) THEN
    RETURN false;
  END IF;

  IF _relocations_used >= GREATEST(_maximum_relocations, 1) THEN
    RETURN false;
  END IF;

  SELECT
    target_slot.event_date,
    target_slot.court_key,
    target_slot.start_at,
    target_slot.end_at,
    target_match.round_number
  INTO
    target_event_date,
    target_court_key,
    target_start_at,
    target_end_at,
    target_round_number
  FROM championship_bracket_preview_private.slots AS target_slot
  JOIN championship_bracket_preview_private.matches AS target_match
    ON target_match.job_id = target_slot.job_id
    AND target_match.id = _match_id
  WHERE target_slot.job_id = _job_id
    AND target_slot.id = _target_slot_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF championship_bracket_preview_private.is_match_slot_eligible(
    _job_id,
    _match_id,
    _target_slot_id,
    true
  ) THEN
    INSERT INTO championship_bracket_preview_private.assignments (
      job_id,
      match_id,
      slot_id,
      match_number
    )
    VALUES (
      _job_id,
      _match_id,
      _target_slot_id,
      _match_number
    );

    UPDATE championship_bracket_preview_private.matches
    SET assigned = true
    WHERE job_id = _job_id
      AND id = _match_id;

    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.resolve_match_slot_blockers(
      _job_id,
      _match_id,
      _target_slot_id
    ) AS blockers
    WHERE blockers.blocker_match_id <> _match_id
      AND NOT (
        blockers.blocker_match_id = ANY(
          COALESCE(
            _path_match_ids,
            ARRAY[]::UUID[]
          )
        )
      )
      AND blockers.blocker_reasons && ARRAY[
        'EARLIER_ROUND_PENDING',
        'COURT_OCCUPATION',
        'TEAM_REST_CONSTRAINT',
        'ROUND_ORDER_CONSTRAINT'
      ]::TEXT[]
  )
  INTO has_hard_blockers;

  FOR blocker_record IN
    SELECT
      blockers.blocker_match_id,
      blockers.blocker_slot_id,
      blockers.blocker_is_assigned,
      blockers.blocker_reasons,
      blocker_match.round_number AS blocker_round_number
    FROM championship_bracket_preview_private.resolve_match_slot_blockers(
      _job_id,
      _match_id,
      _target_slot_id
    ) AS blockers
    LEFT JOIN championship_bracket_preview_private.matches AS blocker_match
      ON blocker_match.job_id = _job_id
      AND blocker_match.id = blockers.blocker_match_id
    WHERE blockers.blocker_match_id <> _match_id
      AND NOT (
        blockers.blocker_match_id = ANY(
          COALESCE(
            _path_match_ids,
            ARRAY[]::UUID[]
          )
        )
      )
      AND (
        (
          has_hard_blockers
          AND blockers.blocker_reasons && ARRAY[
            'EARLIER_ROUND_PENDING',
            'COURT_OCCUPATION',
            'TEAM_REST_CONSTRAINT',
            'ROUND_ORDER_CONSTRAINT'
          ]::TEXT[]
        )
        OR (
          NOT has_hard_blockers
          AND 'TARGET_CAPACITY' = ANY(
            blockers.blocker_reasons
          )
        )
      )
    ORDER BY
      CASE
        WHEN 'EARLIER_ROUND_PENDING' = ANY(blockers.blocker_reasons)
          THEN 1
        WHEN 'COURT_OCCUPATION' = ANY(blockers.blocker_reasons)
          THEN 2
        WHEN 'TEAM_REST_CONSTRAINT' = ANY(blockers.blocker_reasons)
          THEN 3
        WHEN 'ROUND_ORDER_CONSTRAINT' = ANY(blockers.blocker_reasons)
          THEN 4
        ELSE 5
      END,
      blockers.blocker_match_id
  LOOP
    FOR candidate_slot_record IN
      SELECT candidate_slot.*
      FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
        _job_id,
        blocker_record.blocker_match_id,
        blocker_record.blocker_slot_id,
        _reserved_slot_ids,
        _maximum_candidates_per_match
      ) AS candidate_slot
      WHERE (
        NOT (
          'TARGET_CAPACITY' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR candidate_slot.event_date <> target_event_date
        OR candidate_slot.court_key <> target_court_key
      )
      AND (
        NOT (
          'EARLIER_ROUND_PENDING' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR candidate_slot.end_at <= target_start_at
      )
      AND (
        NOT (
          'ROUND_ORDER_CONSTRAINT' = ANY(
            blocker_record.blocker_reasons
          )
        )
        OR blocker_record.blocker_round_number IS NULL
        OR (
          blocker_record.blocker_round_number < target_round_number
          AND candidate_slot.end_at <= target_start_at
        )
        OR (
          blocker_record.blocker_round_number > target_round_number
          AND candidate_slot.start_at >= target_end_at
        )
        OR blocker_record.blocker_round_number = target_round_number
      )
    LOOP
      EXIT WHEN clock_timestamp() >= _deadline;

      BEGIN
        IF NOT championship_bracket_preview_private.try_place_match_backtracking(
          _job_id,
          blocker_record.blocker_match_id,
          candidate_slot_record.slot_id,
          _path_match_ids,
          _reserved_slot_ids,
          _depth + 1,
          _maximum_depth,
          _maximum_candidates_per_match,
          _maximum_relocations,
          _deadline
        ) THEN
          RAISE EXCEPTION
            USING
              ERRCODE = 'LJ002',
              MESSAGE = 'Relocation branch failed';
        END IF;

        IF championship_bracket_preview_private.try_resolve_match_slot_backtracking(
          _job_id,
          _match_id,
          _target_slot_id,
          _match_number,
          array_append(
            COALESCE(
              _path_match_ids,
              ARRAY[]::UUID[]
            ),
            blocker_record.blocker_match_id
          ),
          _reserved_slot_ids,
          _depth + 1,
          _maximum_depth,
          _maximum_candidates_per_match,
          _maximum_relocations,
          _relocations_used + 1,
          _deadline
        ) THEN
          RETURN true;
        END IF;

        RAISE EXCEPTION
          USING
            ERRCODE = 'LJ002',
            MESSAGE = 'Relocation branch reached dead end';

      EXCEPTION
        WHEN SQLSTATE 'LJ002' THEN
          NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_resolve_match_slot_backtracking(
  UUID,
  UUID,
  BIGINT,
  INTEGER,
  UUID[],
  BIGINT[],
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_place_match_backtracking(
  _job_id UUID,
  _match_id UUID,
  _target_slot_id BIGINT,
  _path_match_ids UUID[] DEFAULT ARRAY[]::UUID[],
  _reserved_slot_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[],
  _depth INTEGER DEFAULT 0,
  _maximum_depth INTEGER DEFAULT 12,
  _maximum_candidates_per_match INTEGER DEFAULT 120,
  _maximum_relocations_per_level INTEGER DEFAULT 40,
  _deadline TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  current_assignment RECORD;
  has_current_assignment BOOLEAN := false;
  original_match_number INTEGER;
  effective_deadline TIMESTAMPTZ :=
    COALESCE(
      _deadline,
      clock_timestamp() + interval '8 seconds'
    );
  next_path UUID[];
  next_reserved_slots BIGINT[];
BEGIN
  IF clock_timestamp() >= effective_deadline THEN
    RETURN false;
  END IF;

  IF _depth > GREATEST(
    COALESCE(_maximum_depth, 12),
    1
  ) THEN
    RETURN false;
  END IF;

  IF _match_id = ANY(
    COALESCE(
      _path_match_ids,
      ARRAY[]::UUID[]
    )
  ) THEN
    RETURN false;
  END IF;

  IF NOT championship_bracket_preview_private.is_match_slot_static_eligible(
    _job_id,
    _match_id,
    _target_slot_id
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots AS target_slot
    JOIN championship_bracket_preview_private.slots AS reserved_slot
      ON reserved_slot.job_id = target_slot.job_id
      AND reserved_slot.id = ANY(
        COALESCE(
          _reserved_slot_ids,
          ARRAY[]::BIGINT[]
        )
      )
      AND reserved_slot.court_key = target_slot.court_key
      AND reserved_slot.start_at < target_slot.end_at
      AND reserved_slot.end_at > target_slot.start_at
    WHERE target_slot.job_id = _job_id
      AND target_slot.id = _target_slot_id
  ) THEN
    RETURN false;
  END IF;

  SELECT
    assignment.slot_id,
    assignment.match_number,
    assignment.assigned_at
  INTO current_assignment
  FROM championship_bracket_preview_private.assignments AS assignment
  WHERE assignment.job_id = _job_id
    AND assignment.match_id = _match_id;

  has_current_assignment := FOUND;

  IF has_current_assignment THEN
    original_match_number :=
      current_assignment.match_number;

    IF current_assignment.slot_id = _target_slot_id
      AND championship_bracket_preview_private.is_match_slot_eligible(
        _job_id,
        _match_id,
        _target_slot_id,
        true
      )
    THEN
      RETURN true;
    END IF;
  END IF;

  next_path :=
    array_append(
      COALESCE(
        _path_match_ids,
        ARRAY[]::UUID[]
      ),
      _match_id
    );

  next_reserved_slots :=
    array_append(
      COALESCE(
        _reserved_slot_ids,
        ARRAY[]::BIGINT[]
      ),
      _target_slot_id
    );

  BEGIN
    IF has_current_assignment THEN
      DELETE FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
        AND match_id = _match_id;

      UPDATE championship_bracket_preview_private.matches
      SET assigned = false
      WHERE job_id = _job_id
        AND id = _match_id;
    END IF;

    IF championship_bracket_preview_private.try_resolve_match_slot_backtracking(
      _job_id,
      _match_id,
      _target_slot_id,
      original_match_number,
      next_path,
      next_reserved_slots,
      _depth,
      GREATEST(
        COALESCE(_maximum_depth, 12),
        1
      ),
      GREATEST(
        COALESCE(_maximum_candidates_per_match, 120),
        1
      ),
      GREATEST(
        COALESCE(_maximum_relocations_per_level, 40),
        1
      ),
      0,
      effective_deadline
    ) THEN
      RETURN true;
    END IF;

    RAISE EXCEPTION
      USING
        ERRCODE = 'LJ001',
        MESSAGE = 'Backtracking branch failed';

  EXCEPTION
    WHEN SQLSTATE 'LJ001' THEN
      RETURN false;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_place_match_backtracking(
  UUID,
  UUID,
  BIGINT,
  UUID[],
  BIGINT[],
  INTEGER,
  INTEGER,
  INTEGER,
  INTEGER,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.try_relocate_for_match(
  _job_id UUID,
  _pending_match_id UUID,
  _maximum_moves INTEGER DEFAULT 100
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
AS $function$
DECLARE
  candidate_slot_record RECORD;
  effective_deadline TIMESTAMPTZ := clock_timestamp() + interval '8 seconds';
  candidate_limit INTEGER := LEAST(
    GREATEST(
      COALESCE(_maximum_moves, 100) * 3,
      300
    ),
    1000
  );
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.matches AS pending_match
    WHERE pending_match.job_id = _job_id
      AND pending_match.id = _pending_match_id
      AND pending_match.assigned = false
  ) THEN
    RETURN false;
  END IF;

  FOR candidate_slot_record IN
    SELECT
      slots_table.id AS slot_id
    FROM championship_bracket_preview_private.slots AS slots_table
    WHERE slots_table.job_id = _job_id
      AND championship_bracket_preview_private.is_match_slot_eligible(
        _job_id,
        _pending_match_id,
        slots_table.id,
        true
      )
    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,
      slots_table.cursor_position
    LIMIT candidate_limit
  LOOP
    INSERT INTO championship_bracket_preview_private.assignments (
      job_id,
      match_id,
      slot_id
    )
    VALUES (
      _job_id,
      _pending_match_id,
      candidate_slot_record.slot_id
    );

    UPDATE championship_bracket_preview_private.matches
    SET assigned = true
    WHERE job_id = _job_id
      AND id = _pending_match_id;

    RETURN true;
  END LOOP;

  FOR candidate_slot_record IN
    SELECT candidate_slot.*
    FROM championship_bracket_preview_private.resolve_match_relocation_candidate_slots(
      _job_id,
      _pending_match_id,
      NULL,
      ARRAY[]::BIGINT[],
      candidate_limit
    ) AS candidate_slot
    ORDER BY
      candidate_slot.event_date,
      candidate_slot.start_at,
      candidate_slot.location_key,
      candidate_slot.court_key,
      candidate_slot.sequence_index,
      candidate_slot.slot_id
  LOOP
    EXIT WHEN clock_timestamp() >= effective_deadline;

    IF championship_bracket_preview_private.try_place_match_backtracking(
      _job_id,
      _pending_match_id,
      candidate_slot_record.slot_id,
      ARRAY[]::UUID[],
      ARRAY[]::BIGINT[],
      0,
      12,
      120,
      40,
      effective_deadline
    ) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION championship_bracket_preview_private.try_relocate_for_match (UUID, UUID, INTEGER)
FROM PUBLIC, anon, authenticated;

ALTER TABLE championship_bracket_preview_private.matches
ADD COLUMN IF NOT EXISTS relocation_attempt_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS championship_bracket_preview_matches_relocation_attempt_idx ON championship_bracket_preview_private.matches (
    job_id,
    assigned,
    relocation_attempt_count,
    priority_weight DESC,
    round_number,
    slot_number
);

CREATE OR REPLACE FUNCTION championship_bracket_preview_private.process_batch(
  _job_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, championship_bracket_preview_private
SET statement_timeout = '15s'
AS $function$
DECLARE
  started_clock TIMESTAMPTZ := clock_timestamp();
  job_record RECORD;
  slot_record RECORD;
  candidate RECORD;
  batch_slots INTEGER := 0;
  candidates INTEGER := 0;
  slot_candidates INTEGER := 0;
  produced INTEGER := 0;
  pending_count INTEGER;
  processed_count INTEGER;
  remaining_relocation_candidates INTEGER;
  maximum_relocation_attempts INTEGER := 8;
  relocation_succeeded BOOLEAN := false;
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    hashtextextended(
      'championship-bracket-preview-global',
      0
    )
  ) THEN
    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      2
    );
  END IF;

  SELECT *
  INTO job_record
  FROM championship_bracket_preview_private.jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF job_record.status IN (
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'CONSUMED'
  ) THEN
    RETURN jsonb_build_object(
      'continue',
      false
    );
  END IF;

  IF job_record.status IN (
    'QUEUED',
    'INITIALIZING'
  ) THEN
    PERFORM championship_bracket_preview_private.initialize_job(
      _job_id
    );

    PERFORM championship_bracket_preview_private.rebuild_job_round_robin_matches(
      _job_id
    );

    SELECT *
    INTO job_record
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id;
  END IF;

  IF job_record.algorithm_version IN (
    'async-exact-v4',
    'async-exact-v5'
  )
    AND job_record.processed_slots = 0
    AND NOT EXISTS (
      SELECT 1
      FROM championship_bracket_preview_private.assignments
      WHERE job_id = _job_id
    )
  THEN
    PERFORM championship_bracket_preview_private.rebuild_job_slots(
      _job_id
    );

    SELECT *
    INTO job_record
    FROM championship_bracket_preview_private.jobs
    WHERE id = _job_id;
  END IF;

  FOR slot_record IN
    SELECT
      slots_table.*,
      slot_target.has_sport_targets,
      slot_target.planned_match_count,
      GREATEST(
        slot_target.planned_match_count
          - COALESCE(
            target_usage.assigned_match_count,
            0
          ),
        0
      ) AS remaining_target_count
    FROM championship_bracket_preview_private.slots AS slots_table

    CROSS JOIN LATERAL
      championship_bracket_preview_private.resolve_slot_sport_target(
        job_record.payload,
        slots_table.event_date,
        slots_table.court_key,
        slots_table.sport_id
      ) AS slot_target

    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS assigned_match_count
      FROM championship_bracket_preview_private.assignments
        AS target_assignments
      JOIN championship_bracket_preview_private.slots
        AS assigned_slots
        ON assigned_slots.id = target_assignments.slot_id
      WHERE target_assignments.job_id = _job_id
        AND assigned_slots.event_date =
          slots_table.event_date
        AND assigned_slots.court_key =
          slots_table.court_key
        AND assigned_slots.sport_id =
          slots_table.sport_id
    ) AS target_usage
      ON true

    WHERE slots_table.job_id = _job_id
      AND slots_table.processed = false

      AND slots_table.event_date = (
        SELECT min(next_slot.event_date)
        FROM championship_bracket_preview_private.slots
          AS next_slot
        WHERE next_slot.job_id = _job_id
          AND next_slot.processed = false
      )

    ORDER BY
      slots_table.event_date,
      slots_table.start_at,
      slots_table.location_position,
      slots_table.court_position,

      CASE
        WHEN NOT slot_target.has_sport_targets
          OR slot_target.planned_match_count >
            COALESCE(
              target_usage.assigned_match_count,
              0
            )
        THEN 0
        ELSE 1
      END,

      GREATEST(
        slot_target.planned_match_count
          - COALESCE(
            target_usage.assigned_match_count,
            0
          ),
        0
      ) DESC,

      CASE
        WHEN slots_table.preferred_sport
          THEN 0
        ELSE 1
      END,

      slots_table.sport_id,
      slots_table.cursor_position

    LIMIT 20
    FOR UPDATE OF slots_table SKIP LOCKED

  LOOP
    EXIT WHEN
      clock_timestamp() - started_clock
        >= interval '5 seconds';

    batch_slots := batch_slots + 1;

    SELECT count(*)
    INTO slot_candidates
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
      AND competitions_table.sport_id =
        slot_record.sport_id;

    candidates :=
      candidates + slot_candidates;

    SELECT
      matches_table.*,
      competitions_table.naipe,
      competitions_table.division,
      competitions_table.competition_key
    INTO candidate
    FROM championship_bracket_preview_private.matches
      AS matches_table
    JOIN championship_bracket_preview_private.competitions
      AS competitions_table
      ON competitions_table.id =
        matches_table.competition_id
    WHERE matches_table.job_id = _job_id
      AND matches_table.assigned = false
      AND competitions_table.sport_id =
        slot_record.sport_id

      AND (
        NOT slot_record.has_sport_targets
        OR slot_record.planned_match_count > (
          SELECT count(*)
          FROM championship_bracket_preview_private.assignments
            AS target_assignments
          JOIN championship_bracket_preview_private.slots
            AS assigned_slots
            ON assigned_slots.id =
              target_assignments.slot_id
          WHERE target_assignments.job_id = _job_id
            AND assigned_slots.event_date =
              slot_record.event_date
            AND assigned_slots.court_key =
              slot_record.court_key
            AND assigned_slots.sport_id =
              slot_record.sport_id
        )
      )

      AND (
        slot_record.sequence_mode <> 'GROUP_NAIPE'
        OR slot_record.preferred_naipe IS NULL
        OR competitions_table.naipe =
          slot_record.preferred_naipe
      )

      AND public.is_championship_bracket_competition_slot_playable(
        job_record.payload,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )

      AND public.is_championship_bracket_team_slot_playable(
        job_record.payload,
        matches_table.home_team_id,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )

      AND public.is_championship_bracket_team_slot_playable(
        job_record.payload,
        matches_table.away_team_id,
        competitions_table.competition_key,
        slot_record.event_date,
        slot_record.start_at,
        slot_record.end_at
      )

      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
          AS occupied_assignment
        JOIN championship_bracket_preview_private.slots
          AS occupied_slot
          ON occupied_slot.id =
            occupied_assignment.slot_id
        WHERE occupied_assignment.job_id = _job_id
          AND occupied_slot.court_key =
            slot_record.court_key
          AND occupied_slot.start_at <
            slot_record.end_at
          AND occupied_slot.end_at >
            slot_record.start_at
      )

      AND championship_bracket_preview_private.is_job_slot_within_day_bounds(
        _job_id,
        slot_record.id
      )

      AND championship_bracket_preview_private.is_match_round_order_eligible(
        _job_id,
        matches_table.id,
        slot_record.id
      )

      AND NOT EXISTS (
        SELECT 1
        FROM championship_bracket_preview_private.assignments
          AS previous_assignment
        WHERE previous_assignment.job_id = _job_id

          AND championship_bracket_preview_private.is_match_rest_conflict(
            _job_id,
            matches_table.id,
            slot_record.id,
            previous_assignment.match_id
          )
      )

    ORDER BY
      CASE
        WHEN slot_record.preferred_naipe IS NOT NULL
          AND competitions_table.naipe
            IS DISTINCT FROM
              slot_record.preferred_naipe
        THEN 1
        ELSE 0
      END,

      CASE
        WHEN slot_record.preferred_division IS NOT NULL
          AND competitions_table.division
            IS DISTINCT FROM
              slot_record.preferred_division
        THEN 1
        ELSE 0
      END,

      matches_table.priority_weight DESC,
      matches_table.round_number,
      matches_table.slot_number,
      matches_table.id

    LIMIT 1;

    IF candidate.id IS NOT NULL THEN
      INSERT INTO championship_bracket_preview_private.assignments (
        job_id,
        match_id,
        slot_id
      )
      VALUES (
        _job_id,
        candidate.id,
        slot_record.id
      )
      ON CONFLICT DO NOTHING;

      UPDATE championship_bracket_preview_private.matches
      SET
        assigned = true,
        relocation_attempt_count = 0
      WHERE job_id = _job_id
        AND id = candidate.id;

      produced := produced + 1;
    END IF;

    UPDATE championship_bracket_preview_private.slots
    SET processed = true
    WHERE id = slot_record.id;
  END LOOP;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false;

  SELECT count(*)
  INTO processed_count
  FROM championship_bracket_preview_private.slots
  WHERE job_id = _job_id
    AND processed;

  UPDATE championship_bracket_preview_private.jobs
  SET
    processed_slots = processed_count,

    current_processing_date = (
      SELECT max(event_date)
      FROM championship_bracket_preview_private.slots
      WHERE job_id = _job_id
        AND processed
    ),

    progress_percentage = LEAST(
      90,
      5 + (
        85
        * processed_count::numeric
        / GREATEST(total_slots, 1)
      )
    ),

    heartbeat_at = now(),
    updated_at = now()

  WHERE id = _job_id;

  INSERT INTO championship_bracket_preview_private.stage_metrics (
    job_id,
    stage,
    batch_number,
    duration_ms,
    processed_slots,
    candidates_examined,
    produced_rows
  )
  VALUES (
    _job_id,
    'SCHEDULING',
    job_record.attempt_count + 1,
    (
      EXTRACT(
        EPOCH FROM (
          clock_timestamp() - started_clock
        )
      ) * 1000
    )::integer,
    batch_slots,
    candidates,
    produced
  );

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Montando manifesto final',
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM championship_bracket_preview_private.slots
    WHERE job_id = _job_id
      AND processed = false
  ) THEN
    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  SELECT pending_match.*
  INTO candidate
  FROM championship_bracket_preview_private.matches
    AS pending_match
  WHERE pending_match.job_id = _job_id
    AND pending_match.assigned = false
    AND pending_match.relocation_attempt_count
      < maximum_relocation_attempts
  ORDER BY
    pending_match.relocation_attempt_count,
    pending_match.priority_weight DESC,
    pending_match.round_number,
    pending_match.slot_number,
    pending_match.id
  LIMIT 1;

  IF FOUND THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      stage = format(
        'Reorganizando grade: tentativa %s de %s',
        candidate.relocation_attempt_count + 1,
        maximum_relocation_attempts
      ),
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    relocation_succeeded :=
      championship_bracket_preview_private.try_relocate_for_match(
        _job_id,
        candidate.id,
        100
      );

    IF relocation_succeeded THEN
      produced := produced + 1;

      UPDATE championship_bracket_preview_private.matches
      SET relocation_attempt_count = 0
      WHERE job_id = _job_id
        AND assigned = false;

      SELECT count(*)
      INTO pending_count
      FROM championship_bracket_preview_private.matches
      WHERE job_id = _job_id
        AND assigned = false;

      IF pending_count = 0 THEN
        UPDATE championship_bracket_preview_private.jobs
        SET
          status = 'FINALIZING',
          stage = 'Montando manifesto final após reorganização',
          progress_percentage = 90,
          heartbeat_at = now(),
          updated_at = now()
        WHERE id = _job_id;

        RETURN jsonb_build_object(
          'continue',
          true,
          'delay',
          0
        );
      END IF;

      UPDATE championship_bracket_preview_private.jobs
      SET
        stage = format(
          'Reorganizando grade: %s jogo(s) pendente(s)',
          pending_count
        ),
        progress_percentage = 90,
        heartbeat_at = now(),
        updated_at = now()
      WHERE id = _job_id;

      RETURN jsonb_build_object(
        'continue',
        true,
        'delay',
        0
      );
    END IF;

    UPDATE championship_bracket_preview_private.matches
    SET relocation_attempt_count =
      relocation_attempt_count + 1
    WHERE job_id = _job_id
      AND id = candidate.id
      AND assigned = false;
  END IF;

  SELECT count(*)
  INTO remaining_relocation_candidates
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false
    AND relocation_attempt_count
      < maximum_relocation_attempts;

  SELECT count(*)
  INTO pending_count
  FROM championship_bracket_preview_private.matches
  WHERE job_id = _job_id
    AND assigned = false;

  IF pending_count = 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      status = 'FINALIZING',
      stage = 'Montando manifesto final após reorganização',
      progress_percentage = 90,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  IF remaining_relocation_candidates > 0 THEN
    UPDATE championship_bracket_preview_private.jobs
    SET
      stage = format(
        'Reorganizando grade: %s jogo(s) pendente(s)',
        pending_count
      ),
      progress_percentage = 90,
      heartbeat_at = now(),
      updated_at = now()
    WHERE id = _job_id;

    RETURN jsonb_build_object(
      'continue',
      true,
      'delay',
      0
    );
  END IF;

  UPDATE championship_bracket_preview_private.jobs
  SET
    status = 'FAILED',
    stage = 'Falha',
    progress_percentage = 100,

    error_message = format(
      'Não foi possível encaixar %s jogo(s) na grade após múltiplas tentativas de reorganização.',
      pending_count
    ),

    diagnostics =
      championship_bracket_preview_private.build_unassigned_match_diagnostics(
        _job_id
      ),

    completed_at = now(),
    expires_at = now() + interval '24 hours',
    heartbeat_at = now(),
    updated_at = now()

  WHERE id = _job_id;

  RETURN jsonb_build_object(
    'continue',
    false
  );
END;
$function$;

ALTER TABLE championship_bracket_preview_private.jobs
ALTER COLUMN algorithm_version
SET DEFAULT 'async-exact-v5';

DO $$
DECLARE
  function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.start_championship_bracket_preview_job(uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v4',
    'async-exact-v5'
  );

  SELECT pg_get_functiondef(
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v4',
    'async-exact-v5'
  );

  SELECT pg_get_functiondef(
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  )
  INTO function_definition;

  EXECUTE replace(
    function_definition,
    'async-exact-v4',
    'async-exact-v5'
  );
END;
$$;

UPDATE championship_bracket_preview_private.jobs
SET
    status = 'CANCELLED',
    stage = 'Substituída pelo algoritmo async-exact-v5',
    expires_at = now() + interval '24 hours',
    heartbeat_at = now(),
    updated_at = now()
WHERE
    algorithm_version = 'async-exact-v4'
    AND status IN (
        'QUEUED',
        'INITIALIZING',
        'SCHEDULING',
        'FINALIZING'
    );

DO $$
DECLARE
  start_definition TEXT;
  status_definition TEXT;
  creation_definition TEXT;
  algorithm_default TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'championship_bracket_preview_private'
      AND table_name = 'matches'
      AND column_name = 'relocation_attempt_count'
  ) THEN
    RAISE EXCEPTION 'relocation_attempt_count não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.is_match_slot_static_eligible(uuid,uuid,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION 'is_match_slot_static_eligible não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_match_slot_blockers(uuid,uuid,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION 'resolve_match_slot_blockers não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.resolve_match_relocation_candidate_slots(uuid,uuid,bigint,bigint[],integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'resolve_match_relocation_candidate_slots não foi criada.';
  END IF;

  IF to_regprocedure(
  'championship_bracket_preview_private.try_resolve_match_slot_backtracking(uuid,uuid,bigint,integer,uuid[],bigint[],integer,integer,integer,integer,integer,timestamptz)'
) IS NULL THEN
  RAISE EXCEPTION 'try_resolve_match_slot_backtracking não foi criada.';
END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.try_place_match_backtracking(uuid,uuid,bigint,uuid[],bigint[],integer,integer,integer,integer,timestamptz)'
  ) IS NULL THEN
    RAISE EXCEPTION 'try_place_match_backtracking não foi criada.';
  END IF;

  IF to_regprocedure(
    'championship_bracket_preview_private.try_relocate_for_match(uuid,uuid,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'try_relocate_for_match não foi encontrada.';
  END IF;

  SELECT pg_get_expr(
    attribute_default.adbin,
    attribute_default.adrelid
  )
  INTO algorithm_default
  FROM pg_attrdef AS attribute_default
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = attribute_default.adrelid
    AND attribute.attnum = attribute_default.adnum
  JOIN pg_class AS relation
    ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'championship_bracket_preview_private'
    AND relation.relname = 'jobs'
    AND attribute.attname = 'algorithm_version';

  IF algorithm_default IS NULL
    OR position('async-exact-v5' IN algorithm_default) = 0
  THEN
    RAISE EXCEPTION 'O default de algorithm_version não foi atualizado para async-exact-v5.';
  END IF;

  SELECT pg_get_functiondef(
    'public.start_championship_bracket_preview_job(uuid,jsonb)'::regprocedure
  )
  INTO start_definition;

  SELECT pg_get_functiondef(
    'public.get_championship_bracket_preview_job_status(uuid)'::regprocedure
  )
  INTO status_definition;

  SELECT pg_get_functiondef(
    'public.create_championship_bracket_from_preview_job(uuid,uuid,jsonb)'::regprocedure
  )
  INTO creation_definition;

  IF position('async-exact-v5' IN start_definition) = 0
    OR position('async-exact-v4' IN start_definition) > 0
  THEN
    RAISE EXCEPTION 'start_championship_bracket_preview_job não está integralmente em async-exact-v5.';
  END IF;

  IF position('async-exact-v5' IN status_definition) = 0
    OR position('async-exact-v4' IN status_definition) > 0
  THEN
    RAISE EXCEPTION 'get_championship_bracket_preview_job_status não está integralmente em async-exact-v5.';
  END IF;

  IF position('async-exact-v5' IN creation_definition) = 0
    OR position('async-exact-v4' IN creation_definition) > 0
  THEN
    RAISE EXCEPTION 'create_championship_bracket_from_preview_job não está integralmente em async-exact-v5.';
  END IF;
END;
$$;