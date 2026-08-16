DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'championship_season_division_format'
  ) THEN
    CREATE TYPE public.championship_season_division_format AS ENUM (
      'SEPARATED',
      'UNIFIED'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'championship_season_division_settlement_mode'
  ) THEN
    CREATE TYPE public.championship_season_division_settlement_mode AS ENUM (
      'NONE',
      'PROMOTION_RELEGATION',
      'TOP_N_TO_PRINCIPAL'
    );
  END IF;
END
$$;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.teams.is_active IS 'Define se a atlética continua disponível para novos fluxos operacionais.';

CREATE TABLE IF NOT EXISTS public.championship_season_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL CHECK (season_year >= 2024),
  division_format public.championship_season_division_format NOT NULL DEFAULT 'UNIFIED',
  division_settlement_mode public.championship_season_division_settlement_mode NOT NULL DEFAULT 'NONE',
  principal_slots_count INTEGER NULL CHECK (principal_slots_count IS NULL OR principal_slots_count > 0),
  principal_relegation_count INTEGER NULL CHECK (principal_relegation_count IS NULL OR principal_relegation_count >= 0),
  access_promotion_count INTEGER NULL CHECK (access_promotion_count IS NULL OR access_promotion_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT championship_season_settings_unique UNIQUE (championship_id, season_year)
);

CREATE TABLE IF NOT EXISTS public.championship_season_division_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL CHECK (season_year >= 2024),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  previous_division public.team_division NULL,
  next_division public.team_division NULL,
  source_division public.team_division NULL,
  ranking_position INTEGER NOT NULL CHECK (ranking_position > 0),
  rule_code TEXT NOT NULL,
  confirmed_by UUID NULL,
  confirmed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT championship_season_division_movements_unique UNIQUE (championship_id, season_year, team_id)
);

CREATE INDEX IF NOT EXISTS championship_season_settings_championship_year_idx
  ON public.championship_season_settings (championship_id, season_year DESC);

CREATE INDEX IF NOT EXISTS championship_season_division_movements_championship_year_idx
  ON public.championship_season_division_movements (championship_id, season_year DESC, ranking_position ASC);

CREATE OR REPLACE FUNCTION public.set_championship_season_tables_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_championship_season_settings_updated_at_trigger
  ON public.championship_season_settings;

CREATE TRIGGER set_championship_season_settings_updated_at_trigger
BEFORE UPDATE ON public.championship_season_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_season_tables_updated_at();

DROP TRIGGER IF EXISTS set_championship_season_division_movements_updated_at_trigger
  ON public.championship_season_division_movements;

CREATE TRIGGER set_championship_season_division_movements_updated_at_trigger
BEFORE UPDATE ON public.championship_season_division_movements
FOR EACH ROW
EXECUTE FUNCTION public.set_championship_season_tables_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_active_team_reference(_team_id UUID, _context TEXT)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  is_team_active BOOLEAN;
BEGIN
  IF _team_id IS NULL THEN
    RETURN;
  END IF;

  SELECT teams.is_active
  INTO is_team_active
  FROM public.teams AS teams
  WHERE teams.id = _team_id;

  IF is_team_active IS FALSE THEN
    RAISE EXCEPTION 'A atlética selecionada está inativa e não pode ser usada em %.', _context;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_active_teams_on_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.home_team_id IS DISTINCT FROM OLD.home_team_id THEN
    PERFORM public.ensure_active_team_reference(NEW.home_team_id, 'novos jogos');
  END IF;

  IF TG_OP = 'INSERT' OR NEW.away_team_id IS DISTINCT FROM OLD.away_team_id THEN
    PERFORM public.ensure_active_team_reference(NEW.away_team_id, 'novos jogos');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_active_teams_on_matches_trigger
  ON public.matches;

CREATE TRIGGER validate_active_teams_on_matches_trigger
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_teams_on_matches();

CREATE OR REPLACE FUNCTION public.validate_active_team_on_league_events()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.organizer_team_id IS DISTINCT FROM OLD.organizer_team_id THEN
    PERFORM public.ensure_active_team_reference(NEW.organizer_team_id, 'novos eventos');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_active_team_on_league_events_trigger
  ON public.league_events;

CREATE TRIGGER validate_active_team_on_league_events_trigger
BEFORE INSERT OR UPDATE ON public.league_events
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_team_on_league_events();

CREATE OR REPLACE FUNCTION public.validate_active_team_on_league_event_organizer_teams()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    PERFORM public.ensure_active_team_reference(NEW.team_id, 'novos eventos');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_active_team_on_league_event_organizer_teams_trigger
  ON public.league_event_organizer_teams;

CREATE TRIGGER validate_active_team_on_league_event_organizer_teams_trigger
BEFORE INSERT OR UPDATE ON public.league_event_organizer_teams
FOR EACH ROW
EXECUTE FUNCTION public.validate_active_team_on_league_event_organizer_teams();

COMMENT ON TABLE public.championship_season_settings IS 'Configuração sazonal explícita por campeonato e ano.';
COMMENT ON TABLE public.championship_season_division_movements IS 'Prévia e confirmação da movimentação de divisões ao fim da temporada.';
