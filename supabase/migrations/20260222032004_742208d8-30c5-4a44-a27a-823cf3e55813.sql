
-- Create enums
CREATE TYPE public.match_status AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED');
CREATE TYPE public.app_role AS ENUM ('admin');

-- Create tables
CREATE TABLE public.sports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Joinville',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  home_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  away_team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status public.match_status NOT NULL DEFAULT 'SCHEDULED',
  home_score INTEGER NOT NULL DEFAULT 0,
  away_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  goals_for INTEGER NOT NULL DEFAULT 0,
  goals_against INTEGER NOT NULL DEFAULT 0,
  goal_diff INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sport_id, team_id)
);

-- User roles table for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Security definer function to check admin role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Convenience function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Enable RLS on all tables
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies
CREATE POLICY "Public can view sports" ON public.sports FOR SELECT USING (true);
CREATE POLICY "Public can view teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public can view matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public can view standings" ON public.standings FOR SELECT USING (true);

-- Admin write policies for sports
CREATE POLICY "Admin can insert sports" ON public.sports FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin can update sports" ON public.sports FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin can delete sports" ON public.sports FOR DELETE TO authenticated USING (public.is_admin());

-- Admin write policies for teams
CREATE POLICY "Admin can insert teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin can update teams" ON public.teams FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin can delete teams" ON public.teams FOR DELETE TO authenticated USING (public.is_admin());

-- Admin write policies for matches
CREATE POLICY "Admin can insert matches" ON public.matches FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin can update matches" ON public.matches FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin can delete matches" ON public.matches FOR DELETE TO authenticated USING (public.is_admin());

-- Admin write policies for standings
CREATE POLICY "Admin can insert standings" ON public.standings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin can update standings" ON public.standings FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin can delete standings" ON public.standings FOR DELETE TO authenticated USING (public.is_admin());

-- User roles RLS - only admins can view roles
CREATE POLICY "Admin can view roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin());

-- Function to validate match time conflicts
CREATE OR REPLACE FUNCTION public.validate_match_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
      AND location = NEW.location
      AND start_time < NEW.end_time
      AND end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: já existe um jogo neste local no período informado.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_match_conflict
BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_match_conflict();

-- Function to update standings when match finishes
CREATE OR REPLACE FUNCTION public.update_standings_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only run when status changes to FINISHED
  IF NEW.status = 'FINISHED' AND (OLD.status IS NULL OR OLD.status != 'FINISHED') THEN
    -- Ensure standings rows exist for both teams
    INSERT INTO public.standings (sport_id, team_id)
    VALUES (NEW.sport_id, NEW.home_team_id)
    ON CONFLICT (sport_id, team_id) DO NOTHING;

    INSERT INTO public.standings (sport_id, team_id)
    VALUES (NEW.sport_id, NEW.away_team_id)
    ON CONFLICT (sport_id, team_id) DO NOTHING;

    -- Update home team standings
    UPDATE public.standings SET
      played = played + 1,
      goals_for = goals_for + NEW.home_score,
      goals_against = goals_against + NEW.away_score,
      goal_diff = goal_diff + NEW.home_score - NEW.away_score,
      wins = wins + CASE WHEN NEW.home_score > NEW.away_score THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.home_score < NEW.away_score THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.home_score > NEW.away_score THEN 3
        WHEN NEW.home_score = NEW.away_score THEN 1
        ELSE 0 END,
      updated_at = now()
    WHERE sport_id = NEW.sport_id AND team_id = NEW.home_team_id;

    -- Update away team standings
    UPDATE public.standings SET
      played = played + 1,
      goals_for = goals_for + NEW.away_score,
      goals_against = goals_against + NEW.home_score,
      goal_diff = goal_diff + NEW.away_score - NEW.home_score,
      wins = wins + CASE WHEN NEW.away_score > NEW.home_score THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN NEW.away_score < NEW.home_score THEN 1 ELSE 0 END,
      points = points + CASE
        WHEN NEW.away_score > NEW.home_score THEN 3
        WHEN NEW.home_score = NEW.away_score THEN 1
        ELSE 0 END,
      updated_at = now()
    WHERE sport_id = NEW.sport_id AND team_id = NEW.away_team_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_standings_trigger
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_standings_on_finish();

-- Enable realtime for matches and standings
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.standings;
