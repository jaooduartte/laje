ALTER TABLE public.championship_overall_score_adjustments
  DROP CONSTRAINT IF EXISTS championship_overall_score_adjustments_points_check;
ALTER TABLE public.championship_overall_score_adjustments
  ADD CONSTRAINT championship_overall_score_adjustments_points_check
  CHECK (
    adjustment_type <> 'OPENING_CEREMONY'
    OR (points > 0 AND points = trunc(points))
  );

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

  IF _eligible IS NOT TRUE THEN
    DELETE FROM public.championship_overall_score_adjustments
    WHERE championship_id = _championship_id
      AND season_year = _season_year
      AND team_id = _team_id
      AND adjustment_type = 'OPENING_CEREMONY';
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
END;
$$;

NOTIFY pgrst, 'reload schema';
