CREATE OR REPLACE FUNCTION public.save_match_sets(
  _match_id UUID,
  _sets JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  set_record JSONB;
  resolved_result_rule public.championship_sport_result_rule;
  resolved_match RECORD;
  home_sets INTEGER := 0;
  away_sets INTEGER := 0;
  is_interlaje_volleyball_final BOOLEAN := false;
  sets_required_to_win INTEGER := 2;
BEGIN
  IF NOT public.has_admin_tab_access('control'::public.admin_panel_tab, true)
    AND NOT public.has_admin_tab_access('matches'::public.admin_panel_tab, true) THEN
    RAISE EXCEPTION 'Usuário sem permissão para atualizar sets.';
  END IF;

  SELECT
    matches_table.id,
    matches_table.championship_id,
    matches_table.sport_id,
    championships_table.code AS championship_code,
    public.normalize_sport_name(sports_table.name) AS normalized_sport_name
  INTO resolved_match
  FROM public.matches AS matches_table
  JOIN public.championships AS championships_table
    ON championships_table.id = matches_table.championship_id
  JOIN public.sports AS sports_table
    ON sports_table.id = matches_table.sport_id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_match.id IS NULL THEN
    RAISE EXCEPTION 'Partida não encontrada para registro de sets.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = _match_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.next_bracket_match_id IS NULL
  )
  INTO is_interlaje_volleyball_final;

  IF is_interlaje_volleyball_final THEN
    sets_required_to_win := 3;
  END IF;

  resolved_result_rule := public.resolve_championship_sport_result_rule(
    resolved_match.championship_id,
    resolved_match.sport_id
  );

  DELETE FROM public.match_sets WHERE match_id = _match_id;

  FOR set_record IN SELECT value FROM jsonb_array_elements(COALESCE(_sets, '[]'::jsonb))
  LOOP
    INSERT INTO public.match_sets (match_id, set_number, home_points, away_points)
    VALUES (
      _match_id,
      GREATEST(1, COALESCE((set_record->>'set_number')::integer, 1)),
      GREATEST(0, COALESCE((set_record->>'home_points')::integer, 0)),
      GREATEST(0, COALESCE((set_record->>'away_points')::integer, 0))
    );

    IF COALESCE((set_record->>'home_points')::integer, 0) > COALESCE((set_record->>'away_points')::integer, 0) THEN
      home_sets := home_sets + 1;
    ELSIF COALESCE((set_record->>'away_points')::integer, 0) > COALESCE((set_record->>'home_points')::integer, 0) THEN
      away_sets := away_sets + 1;
    END IF;
  END LOOP;

  IF resolved_match.championship_code = 'INTERLAJE'::public.championship_code
    AND resolved_match.normalized_sport_name = 'voleibol'
    AND (
      home_sets > sets_required_to_win
      OR away_sets > sets_required_to_win
      OR (home_sets = sets_required_to_win AND away_sets >= sets_required_to_win)
      OR (away_sets = sets_required_to_win AND home_sets >= sets_required_to_win)
    ) THEN
    IF is_interlaje_volleyball_final THEN
      RAISE EXCEPTION 'Na final do Voleibol do INTERLAJE, a partida possui no máximo cinco sets e termina em 3 × 0, 3 × 1 ou 3 × 2.';
    END IF;

    RAISE EXCEPTION 'No Voleibol do INTERLAJE, uma partida possui no máximo três sets e termina em 2 × 0 ou 2 × 1.';
  END IF;

  IF resolved_result_rule = 'SETS'::public.championship_sport_result_rule THEN
    UPDATE public.matches
    SET home_score = home_sets, away_score = away_sets
    WHERE id = _match_id;
  END IF;
END;
$func$;

CREATE OR REPLACE FUNCTION public.validate_interlaje_volleyball_match_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  championship_code public.championship_code;
  normalized_sport_name TEXT;
  is_interlaje_volleyball_final BOOLEAN := false;
BEGIN
  IF NEW.status <> 'FINISHED'::public.match_status
    OR OLD.status = 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT
    championships_table.code,
    public.normalize_sport_name(sports_table.name)
  INTO championship_code, normalized_sport_name
  FROM public.championships AS championships_table
  JOIN public.sports AS sports_table ON sports_table.id = NEW.sport_id
  WHERE championships_table.id = NEW.championship_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.is_third_place = false
      AND bracket_matches_table.next_bracket_match_id IS NULL
  )
  INTO is_interlaje_volleyball_final;

  IF championship_code = 'INTERLAJE'::public.championship_code
    AND normalized_sport_name = 'voleibol'
    AND NOT (
      (
        is_interlaje_volleyball_final
        AND (
          (NEW.home_score = 3 AND NEW.away_score IN (0, 1, 2))
          OR (NEW.away_score = 3 AND NEW.home_score IN (0, 1, 2))
        )
      )
      OR (
        NOT is_interlaje_volleyball_final
        AND (
          (NEW.home_score = 2 AND NEW.away_score IN (0, 1))
          OR (NEW.away_score = 2 AND NEW.home_score IN (0, 1))
        )
      )
    ) THEN
    IF is_interlaje_volleyball_final THEN
      RAISE EXCEPTION 'Na final do Voleibol do INTERLAJE, a partida deve terminar em 3 × 0, 3 × 1 ou 3 × 2.';
    END IF;

    RAISE EXCEPTION 'No Voleibol do INTERLAJE, a partida deve terminar em 2 × 0 ou 2 × 1.';
  END IF;

  RETURN NEW;
END;
$func$;
