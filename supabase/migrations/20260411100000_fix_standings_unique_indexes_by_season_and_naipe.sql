DROP INDEX IF EXISTS public.standings_championship_season_sport_team_division_unique_idx;
DROP INDEX IF EXISTS public.standings_championship_season_sport_team_without_division_unique_idx;
DROP INDEX IF EXISTS public.standings_championship_sport_naipe_team_division_unique_idx;
DROP INDEX IF EXISTS public.standings_championship_sport_naipe_team_without_division_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS standings_champ_season_sport_naipe_team_division_uidx
  ON public.standings (championship_id, season_year, sport_id, naipe, team_id, division)
  WHERE division IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS standings_champ_season_sport_naipe_team_without_division_uidx
  ON public.standings (championship_id, season_year, sport_id, naipe, team_id)
  WHERE division IS NULL;

NOTIFY pgrst, 'reload schema';
