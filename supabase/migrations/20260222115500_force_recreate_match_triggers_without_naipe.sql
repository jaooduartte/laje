DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championship_sports'
      AND column_name = 'naipe_mode'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championship_sports.naipe_mode não encontrada.';
  END IF;
END
$$;

DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT pg_trigger.tgname
    FROM pg_trigger
    WHERE pg_trigger.tgrelid = 'public.matches'::regclass
      AND NOT pg_trigger.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.matches', trigger_record.tgname);
  END LOOP;
END
$$;

DO $$
DECLARE
  function_record RECORD;
BEGIN
  FOR function_record IN
    SELECT
      pg_proc.proname AS function_name,
      pg_get_function_identity_arguments(pg_proc.oid) AS function_args
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname IN ('validate_match_conflict', 'update_standings_on_finish')
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.%I(%s)',
      function_record.function_name,
      function_record.function_args
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  championship_sport_naipe_mode public.championship_sport_naipe_mode;
  home_team_division public.team_division;
  away_team_division public.team_division;
BEGIN
  IF NEW.home_team_id = NEW.away_team_id THEN
    RAISE EXCEPTION 'Confronto inválido: os times devem ser diferentes.';
  END IF;

  IF NEW.championship_id IS NULL THEN
    SELECT championships_table.id
    INTO NEW.championship_id
    FROM public.championships AS championships_table
    WHERE championships_table.code = 'CLV'
    LIMIT 1;
  END IF;

  IF NEW.naipe IS NULL THEN
    NEW.naipe := 'MASCULINO'::public.match_naipe;
  END IF;

  SELECT championships_table.uses_divisions
  INTO championship_uses_divisions
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id;

  IF championship_uses_divisions IS NULL THEN
    RAISE EXCEPTION 'Campeonato inválido para a partida.';
  END IF;

  SELECT championship_sports_table.naipe_mode
  INTO championship_sport_naipe_mode
  FROM public.championship_sports AS championship_sports_table
  WHERE championship_sports_table.championship_id = NEW.championship_id
    AND championship_sports_table.sport_id = NEW.sport_id
  LIMIT 1;

  IF championship_sport_naipe_mode IS NULL THEN
    RAISE EXCEPTION 'Modalidade não vinculada ao campeonato selecionado.';
  END IF;

  IF championship_sport_naipe_mode = 'MISTO'::public.championship_sport_naipe_mode
    AND NEW.naipe != 'MISTO'::public.match_naipe THEN
    RAISE EXCEPTION 'Esta modalidade é mista e deve usar naipe Misto.';
  END IF;

  IF championship_sport_naipe_mode = 'MASCULINO_FEMININO'::public.championship_sport_naipe_mode
    AND NEW.naipe = 'MISTO'::public.match_naipe THEN
    RAISE EXCEPTION 'Esta modalidade aceita apenas naipes Masculino ou Feminino.';
  END IF;

  SELECT teams_table.division
  INTO home_team_division
  FROM public.teams AS teams_table
  WHERE teams_table.id = NEW.home_team_id;

  SELECT teams_table.division
  INTO away_team_division
  FROM public.teams AS teams_table
  WHERE teams_table.id = NEW.away_team_id;

  IF home_team_division IS NULL OR away_team_division IS NULL THEN
    RAISE EXCEPTION 'Os times precisam ter divisão cadastrada para criar partidas.';
  END IF;

  IF championship_uses_divisions THEN
    IF home_team_division != away_team_division THEN
      RAISE EXCEPTION 'Confronto inválido: em campeonatos com divisão, os times devem ser da mesma série.';
    END IF;

    NEW.division := home_team_division;
  ELSE
    NEW.division := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matches AS matches_table
    WHERE matches_table.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND matches_table.location = NEW.location
      AND matches_table.start_time < NEW.end_time
      AND matches_table.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: já existe um jogo neste local no período informado.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_standings_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  home_team_division public.team_division;
  away_team_division public.team_division;
  match_division public.team_division;
  match_naipe public.match_naipe;
  points_for_win INTEGER := 3;
  points_for_draw INTEGER := 1;
  points_for_loss INTEGER := 0;
BEGIN
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
    match_naipe := COALESCE(NEW.naipe, 'MASCULINO'::public.match_naipe);

    SELECT championships_table.uses_divisions
    INTO championship_uses_divisions
    FROM public.championships AS championships_table
    WHERE championships_table.id = NEW.championship_id;

    IF championship_uses_divisions IS NULL THEN
      RAISE EXCEPTION 'Campeonato inválido para cálculo de classificação.';
    END IF;

    IF championship_uses_divisions THEN
      SELECT teams_table.division
      INTO home_team_division
      FROM public.teams AS teams_table
      WHERE teams_table.id = NEW.home_team_id;

      SELECT teams_table.division
      INTO away_team_division
      FROM public.teams AS teams_table
      WHERE teams_table.id = NEW.away_team_id;

      IF home_team_division IS NULL OR away_team_division IS NULL THEN
        RAISE EXCEPTION 'Times sem divisão definida em campeonato com divisão.';
      END IF;

      IF home_team_division != away_team_division THEN
        RAISE EXCEPTION 'Confronto inválido para classificação: divisões diferentes.';
      END IF;

      match_division := home_team_division;
    ELSE
      match_division := NULL;
    END IF;

    SELECT
      championship_sports_table.points_win,
      championship_sports_table.points_draw,
      championship_sports_table.points_loss
    INTO
      points_for_win,
      points_for_draw,
      points_for_loss
    FROM public.championship_sports AS championship_sports_table
    WHERE championship_sports_table.championship_id = NEW.championship_id
      AND championship_sports_table.sport_id = NEW.sport_id
    LIMIT 1;

    points_for_win := COALESCE(points_for_win, 3);
    points_for_draw := COALESCE(points_for_draw, 1);
    points_for_loss := COALESCE(points_for_loss, 0);

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings AS standings_table
      WHERE standings_table.championship_id = NEW.championship_id
        AND standings_table.sport_id = NEW.sport_id
        AND standings_table.naipe = match_naipe
        AND standings_table.team_id = NEW.home_team_id
        AND standings_table.division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        naipe,
        team_id,
        division
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        match_naipe,
        NEW.home_team_id,
        match_division
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.standings AS standings_table
      WHERE standings_table.championship_id = NEW.championship_id
        AND standings_table.sport_id = NEW.sport_id
        AND standings_table.naipe = match_naipe
        AND standings_table.team_id = NEW.away_team_id
        AND standings_table.division IS NOT DISTINCT FROM match_division
    ) THEN
      INSERT INTO public.standings (
        championship_id,
        sport_id,
        naipe,
        team_id,
        division
      ) VALUES (
        NEW.championship_id,
        NEW.sport_id,
        match_naipe,
        NEW.away_team_id,
        match_division
      );
    END IF;

    UPDATE public.standings
    SET
      played = played + 1,
      goals_for = goals_for + NEW.home_score,
      goals_against = goals_against + NEW.away_score,
      goal_diff = goal_diff + NEW.home_score - NEW.away_score,
      wins = wins + CASE WHEN NEW.home_score > NEW.away_score THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.home_score < NEW.away_score THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.home_score > NEW.away_score THEN points_for_win
        WHEN NEW.home_score = NEW.away_score THEN points_for_draw
        ELSE points_for_loss
      END,
      updated_at = now()
    WHERE championship_id = NEW.championship_id
      AND sport_id = NEW.sport_id
      AND naipe = match_naipe
      AND team_id = NEW.home_team_id
      AND division IS NOT DISTINCT FROM match_division;

    UPDATE public.standings
    SET
      played = played + 1,
      goals_for = goals_for + NEW.away_score,
      goals_against = goals_against + NEW.home_score,
      goal_diff = goal_diff + NEW.away_score - NEW.home_score,
      wins = wins + CASE WHEN NEW.away_score > NEW.home_score THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.away_score < NEW.home_score THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.away_score > NEW.home_score THEN points_for_win
        WHEN NEW.home_score = NEW.away_score THEN points_for_draw
        ELSE points_for_loss
      END,
      updated_at = now()
    WHERE championship_id = NEW.championship_id
      AND sport_id = NEW.sport_id
      AND naipe = match_naipe
      AND team_id = NEW.away_team_id
      AND division IS NOT DISTINCT FROM match_division;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_match_conflict
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_match_conflict();

CREATE TRIGGER update_standings_trigger
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_standings_on_finish();

NOTIFY pgrst, 'reload schema';
