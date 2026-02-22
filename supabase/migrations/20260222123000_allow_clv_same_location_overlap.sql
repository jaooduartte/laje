DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'championships'
      AND column_name = 'code'
  ) THEN
    RAISE EXCEPTION 'Coluna public.championships.code não encontrada.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  championship_uses_divisions BOOLEAN;
  championship_code public.championship_code;
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

  SELECT
    championships_table.uses_divisions,
    championships_table.code
  INTO
    championship_uses_divisions,
    championship_code
  FROM public.championships AS championships_table
  WHERE championships_table.id = NEW.championship_id;

  IF championship_uses_divisions IS NULL OR championship_code IS NULL THEN
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

  IF championship_code != 'CLV'::public.championship_code AND EXISTS (
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

NOTIFY pgrst, 'reload schema';
