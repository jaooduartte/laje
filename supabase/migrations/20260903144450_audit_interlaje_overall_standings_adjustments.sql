CREATE OR REPLACE FUNCTION public.save_interlaje_opening_ceremony_bonus_points(
  _championship_id UUID,
  _season_year INTEGER,
  _points INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
  championship_code_value public.championship_code;
  previous_points INTEGER;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para configurar o bônus da abertura.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'O bônus da abertura é exclusivo do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'PLANNING'::public.championship_status,
    'UPCOMING'::public.championship_status,
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'O bônus da abertura não pode ser configurado com o campeonato encerrado.';
  END IF;

  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade inteira positiva de pontos.';
  END IF;

  SELECT settings_table.points
  INTO previous_points
  FROM public.championship_opening_ceremony_bonus_settings AS settings_table
  WHERE settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year
  FOR UPDATE;

  INSERT INTO public.championship_opening_ceremony_bonus_settings (
    championship_id,
    season_year,
    points
  ) VALUES (
    _championship_id,
    _season_year,
    _points
  )
  ON CONFLICT (championship_id, season_year)
  DO UPDATE SET points = EXCLUDED.points, updated_at = now();

  UPDATE public.championship_overall_score_adjustments
  SET points = _points, updated_at = now()
  WHERE championship_id = _championship_id
    AND season_year = _season_year
    AND adjustment_type = 'OPENING_CEREMONY';

  IF previous_points IS DISTINCT FROM _points THEN
    PERFORM public.write_admin_action_log(
      CASE WHEN previous_points IS NULL THEN 'INSERT'::public.admin_action_type ELSE 'UPDATE'::public.admin_action_type END,
      'public.championship_opening_ceremony_bonus_settings',
      format('%s:%s', _championship_id, _season_year),
      'Atualizou a pontuação do bônus da abertura.',
      CASE WHEN previous_points IS NULL THEN NULL ELSE jsonb_build_object('points', previous_points) END,
      jsonb_build_object('points', _points),
      jsonb_build_object('championship_id', _championship_id, 'season_year', _season_year)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_opening_ceremony_bonus(
  _championship_id UUID,
  _season_year INTEGER,
  _team_id UUID,
  _eligible BOOLEAN,
  _justification TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
  championship_code_value public.championship_code;
  configured_points INTEGER;
  previous_points INTEGER;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para registrar o bônus da abertura.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'O bônus da abertura é exclusivo do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'As atléticas só podem receber o bônus da abertura em revisão ou em andamento.';
  END IF;

  SELECT adjustments_table.points
  INTO previous_points
  FROM public.championship_overall_score_adjustments AS adjustments_table
  WHERE adjustments_table.championship_id = _championship_id
    AND adjustments_table.season_year = _season_year
    AND adjustments_table.team_id = _team_id
    AND adjustments_table.adjustment_type = 'OPENING_CEREMONY'
  FOR UPDATE;

  IF _eligible IS NOT TRUE THEN
    DELETE FROM public.championship_overall_score_adjustments
    WHERE championship_id = _championship_id
      AND season_year = _season_year
      AND team_id = _team_id
      AND adjustment_type = 'OPENING_CEREMONY';

    IF previous_points IS NOT NULL THEN
      PERFORM public.write_admin_action_log(
        'DELETE'::public.admin_action_type,
        'public.championship_overall_score_adjustments',
        _team_id::text,
        'Removeu uma atlética do bônus da abertura.',
        jsonb_build_object('team_id', _team_id, 'eligible', true, 'points', previous_points),
        NULL,
        jsonb_build_object('championship_id', _championship_id, 'season_year', _season_year)
      );
    END IF;

    RETURN;
  END IF;

  SELECT settings_table.points
  INTO configured_points
  FROM public.championship_opening_ceremony_bonus_settings AS settings_table
  WHERE settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year;

  IF configured_points IS NULL THEN
    RAISE EXCEPTION 'Configure a quantidade de pontos antes de marcar as atléticas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_team_registrations AS registrations_table
    JOIN public.championship_bracket_editions AS editions_table
      ON editions_table.id = registrations_table.bracket_edition_id
    JOIN public.teams AS teams_table
      ON teams_table.id = registrations_table.team_id
    WHERE registrations_table.team_id = _team_id
      AND editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND teams_table.is_active IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'Atlética ativa não está inscrita nesta edição do INTERLAJE.';
  END IF;

  INSERT INTO public.championship_overall_score_adjustments (
    championship_id,
    season_year,
    team_id,
    adjustment_type,
    points,
    justification,
    granted_by
  ) VALUES (
    _championship_id,
    _season_year,
    _team_id,
    'OPENING_CEREMONY',
    configured_points,
    'Presença confirmada na abertura.',
    auth.uid()
  )
  ON CONFLICT (championship_id, season_year, team_id, adjustment_type)
  DO UPDATE SET
    points = EXCLUDED.points,
    justification = EXCLUDED.justification,
    granted_by = EXCLUDED.granted_by,
    granted_at = now(),
    updated_at = now();

  IF previous_points IS DISTINCT FROM configured_points THEN
    PERFORM public.write_admin_action_log(
      CASE WHEN previous_points IS NULL THEN 'INSERT'::public.admin_action_type ELSE 'UPDATE'::public.admin_action_type END,
      'public.championship_overall_score_adjustments',
      _team_id::text,
      'Atualizou a elegibilidade de uma atlética para o bônus da abertura.',
      CASE WHEN previous_points IS NULL THEN NULL ELSE jsonb_build_object('team_id', _team_id, 'eligible', true, 'points', previous_points) END,
      jsonb_build_object('team_id', _team_id, 'eligible', true, 'points', configured_points),
      jsonb_build_object('championship_id', _championship_id, 'season_year', _season_year)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_walkover_penalty_points(
  _championship_id UUID,
  _season_year INTEGER,
  _points INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
  championship_code_value public.championship_code;
  previous_points INTEGER;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para configurar a penalidade por W.O.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'A penalidade por W.O. é exclusiva do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'PLANNING'::public.championship_status,
    'UPCOMING'::public.championship_status,
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'A penalidade por W.O. não pode ser configurada com o campeonato encerrado.';
  END IF;

  IF _points IS NULL OR _points <= 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade inteira positiva de pontos por W.O.';
  END IF;

  SELECT settings_table.points
  INTO previous_points
  FROM public.championship_walkover_penalty_settings AS settings_table
  WHERE settings_table.championship_id = _championship_id
    AND settings_table.season_year = _season_year
  FOR UPDATE;

  INSERT INTO public.championship_walkover_penalty_settings (
    championship_id,
    season_year,
    points
  ) VALUES (
    _championship_id,
    _season_year,
    _points
  )
  ON CONFLICT (championship_id, season_year)
  DO UPDATE SET points = EXCLUDED.points, updated_at = now();

  IF previous_points IS DISTINCT FROM _points THEN
    PERFORM public.write_admin_action_log(
      CASE WHEN previous_points IS NULL THEN 'INSERT'::public.admin_action_type ELSE 'UPDATE'::public.admin_action_type END,
      'public.championship_walkover_penalty_settings',
      format('%s:%s', _championship_id, _season_year),
      'Atualizou a pontuação da penalidade por W.O.',
      CASE WHEN previous_points IS NULL THEN NULL ELSE jsonb_build_object('points', previous_points) END,
      jsonb_build_object('points', _points),
      jsonb_build_object('championship_id', _championship_id, 'season_year', _season_year)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_walkover_penalty_counts(
  _championship_id UUID,
  _season_year INTEGER,
  _counts JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_status_value public.championship_status;
  championship_code_value public.championship_code;
  previous_counts JSONB;
  current_counts JSONB;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_admin_tab_access('opening_ceremony_bonus'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para registrar penalidades por W.O.';
  END IF;

  SELECT championships_table.status, championships_table.code
  INTO championship_status_value, championship_code_value
  FROM public.championships AS championships_table
  WHERE championships_table.id = _championship_id;

  IF championship_code_value IS DISTINCT FROM 'INTERLAJE'::public.championship_code THEN
    RAISE EXCEPTION 'A penalidade por W.O. é exclusiva do INTERLAJE.';
  END IF;

  IF championship_status_value NOT IN (
    'PLANNING'::public.championship_status,
    'UPCOMING'::public.championship_status,
    'REVIEW'::public.championship_status,
    'IN_PROGRESS'::public.championship_status
  ) THEN
    RAISE EXCEPTION 'As penalidades por W.O. não podem ser alteradas com o campeonato encerrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.championship_walkover_penalty_settings AS settings_table
    WHERE settings_table.championship_id = _championship_id
      AND settings_table.season_year = _season_year
  ) THEN
    RAISE EXCEPTION 'Configure a pontuação da penalidade por W.O. antes de informar as atléticas.';
  END IF;

  IF jsonb_typeof(COALESCE(_counts, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Informe uma lista válida de penalidades por W.O.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
      AS counts_input(team_id UUID, walkover_count INTEGER)
    WHERE counts_input.team_id IS NULL
      OR counts_input.walkover_count IS NULL
      OR counts_input.walkover_count < 0
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
      AS counts_input(team_id UUID, walkover_count INTEGER)
    GROUP BY counts_input.team_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada atlética deve ter uma quantidade inteira não negativa de W.O.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
      AS counts_input(team_id UUID, walkover_count INTEGER)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_team_registrations AS registrations_table
      JOIN public.championship_bracket_editions AS editions_table
        ON editions_table.id = registrations_table.bracket_edition_id
      JOIN public.teams AS teams_table
        ON teams_table.id = registrations_table.team_id
      WHERE registrations_table.team_id = counts_input.team_id
        AND editions_table.championship_id = _championship_id
        AND editions_table.season_year = _season_year
        AND teams_table.is_active IS DISTINCT FROM false
    )
  ) THEN
    RAISE EXCEPTION 'Atlética ativa não está inscrita nesta edição do INTERLAJE.';
  END IF;

  PERFORM 1
  FROM public.championship_walkover_penalty_counts AS counts_table
  JOIN jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
    ON counts_input.team_id = counts_table.team_id
  WHERE counts_table.championship_id = _championship_id
    AND counts_table.season_year = _season_year
  FOR UPDATE OF counts_table;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('team_id', counts_table.team_id, 'walkover_count', counts_table.walkover_count)
      ORDER BY counts_table.team_id
    ),
    '[]'::jsonb
  )
  INTO previous_counts
  FROM public.championship_walkover_penalty_counts AS counts_table
  JOIN jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
    ON counts_input.team_id = counts_table.team_id
  WHERE counts_table.championship_id = _championship_id
    AND counts_table.season_year = _season_year;

  DELETE FROM public.championship_walkover_penalty_counts AS counts_table
  USING jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
  WHERE counts_table.championship_id = _championship_id
    AND counts_table.season_year = _season_year
    AND counts_table.team_id = counts_input.team_id
    AND counts_input.walkover_count = 0;

  INSERT INTO public.championship_walkover_penalty_counts (
    championship_id,
    season_year,
    team_id,
    walkover_count
  )
  SELECT
    _championship_id,
    _season_year,
    counts_input.team_id,
    counts_input.walkover_count
  FROM jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
  WHERE counts_input.walkover_count > 0
  ON CONFLICT (championship_id, season_year, team_id)
  DO UPDATE SET
    walkover_count = EXCLUDED.walkover_count,
    updated_at = now();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('team_id', counts_table.team_id, 'walkover_count', counts_table.walkover_count)
      ORDER BY counts_table.team_id
    ),
    '[]'::jsonb
  )
  INTO current_counts
  FROM public.championship_walkover_penalty_counts AS counts_table
  JOIN jsonb_to_recordset(COALESCE(_counts, '[]'::jsonb))
    AS counts_input(team_id UUID, walkover_count INTEGER)
    ON counts_input.team_id = counts_table.team_id
  WHERE counts_table.championship_id = _championship_id
    AND counts_table.season_year = _season_year;

  IF previous_counts IS DISTINCT FROM current_counts THEN
    PERFORM public.write_admin_action_log(
      'UPDATE'::public.admin_action_type,
      'public.championship_walkover_penalty_counts',
      format('%s:%s', _championship_id, _season_year),
      'Atualizou as contagens de W.O. por atlética.',
      jsonb_build_object('counts', previous_counts),
      jsonb_build_object('counts', current_counts),
      jsonb_build_object('championship_id', _championship_id, 'season_year', _season_year)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_interlaje_opening_ceremony_bonus_points(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_interlaje_opening_ceremony_bonus(UUID, INTEGER, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_interlaje_walkover_penalty_points(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_interlaje_walkover_penalty_counts(UUID, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_interlaje_opening_ceremony_bonus_points(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_opening_ceremony_bonus(UUID, INTEGER, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_walkover_penalty_points(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_walkover_penalty_counts(UUID, INTEGER, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
