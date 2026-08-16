-- Classificação geral oficial do INTERLAJE 2026.
-- A pontuação geral é concedida pela colocação final de cada competição
-- (modalidade + naipe + divisão), e não pela soma de pontos de partidas.

CREATE OR REPLACE FUNCTION public.resolve_interlaje_position_points(_final_position INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.resolve_individual_event_position_points(_final_position);
$$;

CREATE TABLE IF NOT EXISTS public.championship_overall_competition_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  sport_id UUID NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  naipe public.match_naipe NOT NULL,
  division public.team_division NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  final_position INTEGER NOT NULL CHECK (final_position BETWEEN 1 AND 20),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AUTO_KNOCKOUT')),
  justification TEXT NULL,
  confirmed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NULLS NOT DISTINCT garante uma única competição "sem divisão" sem usar
-- division::text em uma expressão de índice. O cast de enum para texto não é
-- IMMUTABLE no PostgreSQL e por isso o índice anterior não podia ser criado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_overall_competition_placements_team_key'
      AND conrelid = 'public.championship_overall_competition_placements'::regclass
  ) THEN
    ALTER TABLE public.championship_overall_competition_placements
      ADD CONSTRAINT championship_overall_competition_placements_team_key
      UNIQUE NULLS NOT DISTINCT (championship_id, season_year, sport_id, naipe, division, team_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'championship_overall_competition_placements_position_key'
      AND conrelid = 'public.championship_overall_competition_placements'::regclass
  ) THEN
    ALTER TABLE public.championship_overall_competition_placements
      ADD CONSTRAINT championship_overall_competition_placements_position_key
      UNIQUE NULLS NOT DISTINCT (championship_id, season_year, sport_id, naipe, division, final_position);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.championship_overall_score_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type = 'OPENING_CEREMONY'),
  points NUMERIC NOT NULL CHECK (points = 8),
  justification TEXT NOT NULL CHECK (char_length(trim(justification)) > 0),
  granted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year, team_id, adjustment_type)
);

CREATE TABLE IF NOT EXISTS public.championship_overall_tie_break_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id UUID NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  season_year INTEGER NOT NULL,
  points_total NUMERIC NOT NULL,
  team_signature TEXT NOT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (championship_id, season_year, points_total, team_signature)
);

CREATE TABLE IF NOT EXISTS public.championship_overall_tie_break_resolution_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id UUID NOT NULL REFERENCES public.championship_overall_tie_break_resolutions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  draw_order INTEGER NOT NULL CHECK (draw_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resolution_id, team_id),
  UNIQUE (resolution_id, draw_order)
);

CREATE OR REPLACE FUNCTION public.set_championship_overall_standings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_championship_overall_competition_placements_updated_at ON public.championship_overall_competition_placements;
CREATE TRIGGER set_championship_overall_competition_placements_updated_at
  BEFORE UPDATE ON public.championship_overall_competition_placements
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_overall_standings_updated_at();

DROP TRIGGER IF EXISTS set_championship_overall_score_adjustments_updated_at ON public.championship_overall_score_adjustments;
CREATE TRIGGER set_championship_overall_score_adjustments_updated_at
  BEFORE UPDATE ON public.championship_overall_score_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_overall_standings_updated_at();

DROP TRIGGER IF EXISTS set_championship_overall_tie_break_resolutions_updated_at ON public.championship_overall_tie_break_resolutions;
CREATE TRIGGER set_championship_overall_tie_break_resolutions_updated_at
  BEFORE UPDATE ON public.championship_overall_tie_break_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.set_championship_overall_standings_updated_at();

ALTER TABLE public.championship_overall_competition_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_overall_score_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_overall_tie_break_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.championship_overall_tie_break_resolution_teams ENABLE ROW LEVEL SECURITY;

-- Também torna uma nova tentativa segura caso uma execução tenha alcançado a
-- criação das tabelas antes de falhar. Isso só recria políticas destas novas
-- tabelas de classificação geral; não afeta qualquer configuração do wizard.
DROP POLICY IF EXISTS championship_overall_competition_placements_public_select ON public.championship_overall_competition_placements;
DROP POLICY IF EXISTS championship_overall_competition_placements_authenticated_write ON public.championship_overall_competition_placements;
DROP POLICY IF EXISTS championship_overall_score_adjustments_public_select ON public.championship_overall_score_adjustments;
DROP POLICY IF EXISTS championship_overall_score_adjustments_authenticated_write ON public.championship_overall_score_adjustments;
DROP POLICY IF EXISTS championship_overall_tie_break_resolutions_public_select ON public.championship_overall_tie_break_resolutions;
DROP POLICY IF EXISTS championship_overall_tie_break_resolutions_authenticated_write ON public.championship_overall_tie_break_resolutions;
DROP POLICY IF EXISTS championship_overall_tie_break_resolution_teams_public_select ON public.championship_overall_tie_break_resolution_teams;
DROP POLICY IF EXISTS championship_overall_tie_break_resolution_teams_authenticated_write ON public.championship_overall_tie_break_resolution_teams;

CREATE POLICY championship_overall_competition_placements_public_select
  ON public.championship_overall_competition_placements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY championship_overall_competition_placements_authenticated_write
  ON public.championship_overall_competition_placements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY championship_overall_score_adjustments_public_select
  ON public.championship_overall_score_adjustments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY championship_overall_score_adjustments_authenticated_write
  ON public.championship_overall_score_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY championship_overall_tie_break_resolutions_public_select
  ON public.championship_overall_tie_break_resolutions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY championship_overall_tie_break_resolutions_authenticated_write
  ON public.championship_overall_tie_break_resolutions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY championship_overall_tie_break_resolution_teams_public_select
  ON public.championship_overall_tie_break_resolution_teams FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY championship_overall_tie_break_resolution_teams_authenticated_write
  ON public.championship_overall_tie_break_resolution_teams FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_interlaje_auto_knockout_placements(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  sport_id UUID,
  naipe public.match_naipe,
  division public.team_division,
  team_id UUID,
  final_position INTEGER,
  source TEXT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH competition_context AS (
    SELECT competitions_table.id AS competition_id, competitions_table.sport_id, competitions_table.naipe, competitions_table.division
    FROM public.championship_bracket_competitions AS competitions_table
    JOIN public.championship_bracket_editions AS editions_table ON editions_table.id = competitions_table.bracket_edition_id
    JOIN public.championships AS championships_table ON championships_table.id = editions_table.championship_id
    WHERE editions_table.championship_id = _championship_id
      AND editions_table.season_year = _season_year
      AND championships_table.code = 'INTERLAJE'::public.championship_code
  ),
  final_matches AS (
    SELECT DISTINCT ON (bracket_matches_table.competition_id)
      bracket_matches_table.competition_id,
      bracket_matches_table.round_number,
      bracket_matches_table.home_team_id,
      bracket_matches_table.away_team_id,
      bracket_matches_table.winner_team_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND matches_table.status = 'FINISHED'::public.match_status
      AND bracket_matches_table.winner_team_id IS NOT NULL
    ORDER BY bracket_matches_table.competition_id, bracket_matches_table.round_number DESC, bracket_matches_table.slot_number ASC
  ),
  semifinal_losers AS (
    SELECT
      final_matches.competition_id,
      bracket_matches_table.winner_team_id AS semifinal_winner_team_id,
      CASE
        WHEN bracket_matches_table.winner_team_id = bracket_matches_table.home_team_id THEN bracket_matches_table.away_team_id
        WHEN bracket_matches_table.winner_team_id = bracket_matches_table.away_team_id THEN bracket_matches_table.home_team_id
        ELSE NULL
      END AS semifinal_loser_team_id
    FROM final_matches
    JOIN public.championship_bracket_matches AS bracket_matches_table
      ON bracket_matches_table.competition_id = final_matches.competition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.round_number = final_matches.round_number - 1
    JOIN public.matches AS matches_table ON matches_table.id = bracket_matches_table.match_id
      AND matches_table.status = 'FINISHED'::public.match_status
    WHERE bracket_matches_table.winner_team_id IS NOT NULL
  ),
  rows AS (
    SELECT competition_context.sport_id, competition_context.naipe, competition_context.division, final_matches.winner_team_id AS team_id, 1 AS final_position
    FROM competition_context JOIN final_matches ON final_matches.competition_id = competition_context.competition_id
    UNION ALL
    SELECT competition_context.sport_id, competition_context.naipe, competition_context.division,
      CASE WHEN final_matches.winner_team_id = final_matches.home_team_id THEN final_matches.away_team_id ELSE final_matches.home_team_id END, 2
    FROM competition_context JOIN final_matches ON final_matches.competition_id = competition_context.competition_id
    UNION ALL
    SELECT competition_context.sport_id, competition_context.naipe, competition_context.division, semifinal_losers.semifinal_loser_team_id, 3
    FROM competition_context
    JOIN final_matches ON final_matches.competition_id = competition_context.competition_id
    JOIN semifinal_losers ON semifinal_losers.competition_id = final_matches.competition_id
      AND semifinal_losers.semifinal_winner_team_id = final_matches.winner_team_id
    UNION ALL
    SELECT competition_context.sport_id, competition_context.naipe, competition_context.division, semifinal_losers.semifinal_loser_team_id, 4
    FROM competition_context
    JOIN final_matches ON final_matches.competition_id = competition_context.competition_id
    JOIN semifinal_losers ON semifinal_losers.competition_id = final_matches.competition_id
      AND semifinal_losers.semifinal_winner_team_id <> final_matches.winner_team_id
  )
  SELECT sport_id, naipe, division, team_id, final_position, 'AUTO_KNOCKOUT'::text
  FROM rows
  WHERE team_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_overall_competition_placements(
  _championship_id UUID,
  _season_year INTEGER,
  _sport_id UUID,
  _naipe public.match_naipe,
  _division public.team_division,
  _placements JSONB,
  _justification TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_automatic_placement BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.championships
    WHERE id = _championship_id AND code <> 'INTERLAJE'::public.championship_code
  ) THEN
    RAISE EXCEPTION 'A classificação geral oficial é exclusiva do INTERLAJE.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(team_id UUID, final_position INTEGER)
    GROUP BY placement_row.team_id HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(team_id UUID, final_position INTEGER)
    GROUP BY placement_row.final_position HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Uma atlética e uma colocação só podem ser informadas uma vez por competição.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.get_interlaje_auto_knockout_placements(_championship_id, _season_year) AS placement_row
    WHERE placement_row.sport_id = _sport_id
      AND placement_row.naipe = _naipe
      AND placement_row.division IS NOT DISTINCT FROM _division
  ) INTO has_automatic_placement;

  IF has_automatic_placement AND EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(team_id UUID, final_position INTEGER)
    WHERE placement_row.final_position <= 4
  ) THEN
    RAISE EXCEPTION 'As quatro primeiras colocações desta competição são derivadas automaticamente do mata-mata.';
  END IF;

  DELETE FROM public.championship_overall_competition_placements
  WHERE championship_id = _championship_id AND season_year = _season_year AND sport_id = _sport_id
    AND naipe = _naipe AND division IS NOT DISTINCT FROM _division;

  INSERT INTO public.championship_overall_competition_placements (
    championship_id, season_year, sport_id, naipe, division, team_id, final_position, source, justification, confirmed_by
  )
  SELECT _championship_id, _season_year, _sport_id, _naipe, _division,
    placement_row.team_id, placement_row.final_position, 'MANUAL', NULLIF(trim(_justification), ''), auth.uid()
  FROM jsonb_to_recordset(COALESCE(_placements, '[]'::jsonb)) AS placement_row(team_id UUID, final_position INTEGER)
  WHERE placement_row.team_id IS NOT NULL AND placement_row.final_position BETWEEN 1 AND 20;
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
BEGIN
  IF _eligible IS NOT TRUE THEN
    DELETE FROM public.championship_overall_score_adjustments
    WHERE championship_id = _championship_id AND season_year = _season_year AND team_id = _team_id
      AND adjustment_type = 'OPENING_CEREMONY';
    RETURN;
  END IF;

  IF NULLIF(trim(_justification), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a justificativa da presença na abertura.';
  END IF;

  INSERT INTO public.championship_overall_score_adjustments (
    championship_id, season_year, team_id, adjustment_type, points, justification, granted_by
  ) VALUES (_championship_id, _season_year, _team_id, 'OPENING_CEREMONY', 8, trim(_justification), auth.uid())
  ON CONFLICT (championship_id, season_year, team_id, adjustment_type)
  DO UPDATE SET justification = EXCLUDED.justification, granted_by = EXCLUDED.granted_by, granted_at = now(), updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_interlaje_overall_standings(
  _championship_id UUID,
  _season_year INTEGER
)
RETURNS TABLE(
  team_id UUID,
  team_name TEXT,
  placement_points NUMERIC,
  opening_bonus_points NUMERIC,
  overall_points NUMERIC,
  confirmed_competitions_count INTEGER,
  has_pending_tie_break BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH automatic_placements AS (
    SELECT * FROM public.get_interlaje_auto_knockout_placements(_championship_id, _season_year)
  ),
  official_placements AS (
    SELECT sport_id, naipe, division, team_id, final_position FROM automatic_placements
    UNION ALL
    SELECT placements_table.sport_id, placements_table.naipe, placements_table.division,
      placements_table.team_id, placements_table.final_position
    FROM public.championship_overall_competition_placements AS placements_table
    WHERE placements_table.championship_id = _championship_id AND placements_table.season_year = _season_year
      AND NOT EXISTS (
        SELECT 1 FROM automatic_placements
        WHERE automatic_placements.sport_id = placements_table.sport_id
          AND automatic_placements.naipe = placements_table.naipe
          AND automatic_placements.division IS NOT DISTINCT FROM placements_table.division
          AND automatic_placements.team_id = placements_table.team_id
      )
  ),
  placement_totals AS (
    SELECT team_id, COALESCE(sum(public.resolve_interlaje_position_points(final_position)), 0) AS placement_points,
      count(*)::integer AS confirmed_competitions_count
    FROM official_placements GROUP BY team_id
  ),
  opening_totals AS (
    SELECT team_id, COALESCE(sum(points), 0) AS opening_bonus_points
    FROM public.championship_overall_score_adjustments
    WHERE championship_id = _championship_id AND season_year = _season_year AND adjustment_type = 'OPENING_CEREMONY'
    GROUP BY team_id
  ),
  totals AS (
    SELECT teams_table.id AS team_id, teams_table.name AS team_name,
      COALESCE(placement_totals.placement_points, 0) AS placement_points,
      COALESCE(opening_totals.opening_bonus_points, 0) AS opening_bonus_points,
      COALESCE(placement_totals.placement_points, 0) + COALESCE(opening_totals.opening_bonus_points, 0) AS overall_points,
      COALESCE(placement_totals.confirmed_competitions_count, 0) AS confirmed_competitions_count
    FROM public.teams AS teams_table
    LEFT JOIN placement_totals ON placement_totals.team_id = teams_table.id
    LEFT JOIN opening_totals ON opening_totals.team_id = teams_table.id
    WHERE teams_table.is_active IS DISTINCT FROM false
      AND (placement_totals.team_id IS NOT NULL OR opening_totals.team_id IS NOT NULL)
  ),
  tie_groups AS (
    SELECT overall_points, array_agg(team_id ORDER BY team_id::text) AS team_ids
    FROM totals GROUP BY overall_points HAVING count(*) > 1
  ),
  resolved_ties AS (
    SELECT resolutions_table.points_total, resolution_teams_table.team_id, resolution_teams_table.draw_order
    FROM public.championship_overall_tie_break_resolutions AS resolutions_table
    JOIN public.championship_overall_tie_break_resolution_teams AS resolution_teams_table ON resolution_teams_table.resolution_id = resolutions_table.id
    WHERE resolutions_table.championship_id = _championship_id AND resolutions_table.season_year = _season_year
  )
  SELECT totals.team_id, totals.team_name, totals.placement_points, totals.opening_bonus_points,
    totals.overall_points, totals.confirmed_competitions_count,
    EXISTS (
      SELECT 1 FROM tie_groups
      WHERE tie_groups.overall_points = totals.overall_points
        AND NOT EXISTS (
          SELECT 1 FROM resolved_ties
          WHERE resolved_ties.points_total = totals.overall_points AND resolved_ties.team_id = totals.team_id
        )
    ) AS has_pending_tie_break
  FROM totals
  LEFT JOIN resolved_ties ON resolved_ties.points_total = totals.overall_points AND resolved_ties.team_id = totals.team_id
  ORDER BY totals.overall_points DESC, resolved_ties.draw_order ASC NULLS LAST, totals.team_name ASC;
$$;

CREATE OR REPLACE FUNCTION public.save_interlaje_overall_tie_break_resolution(
  _championship_id UUID,
  _season_year INTEGER,
  _team_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_points_total NUMERIC;
  current_signature TEXT;
  resolution_id_value UUID;
  team_id_value UUID;
  draw_position INTEGER := 0;
BEGIN
  IF COALESCE(cardinality(_team_ids), 0) < 2 THEN
    RAISE EXCEPTION 'Informe ao menos duas atléticas para decidir um empate geral.';
  END IF;

  SELECT overall_points
  INTO current_points_total
  FROM public.get_interlaje_overall_standings(_championship_id, _season_year)
  WHERE team_id = _team_ids[1]
  LIMIT 1;

  IF current_points_total IS NULL OR EXISTS (
    SELECT 1
    FROM public.get_interlaje_overall_standings(_championship_id, _season_year)
    WHERE team_id = ANY(_team_ids) AND overall_points IS DISTINCT FROM current_points_total
  ) THEN
    RAISE EXCEPTION 'A decisão manual só pode ser registrada entre atléticas empatadas na classificação geral atual.';
  END IF;

  SELECT string_agg(team_id::text, '|' ORDER BY team_id::text)
  INTO current_signature
  FROM unnest(_team_ids) AS team_id;

  INSERT INTO public.championship_overall_tie_break_resolutions (
    championship_id, season_year, points_total, team_signature, created_by
  ) VALUES (_championship_id, _season_year, current_points_total, current_signature, auth.uid())
  ON CONFLICT (championship_id, season_year, points_total, team_signature)
  DO UPDATE SET created_by = EXCLUDED.created_by, updated_at = now()
  RETURNING id INTO resolution_id_value;

  DELETE FROM public.championship_overall_tie_break_resolution_teams
  WHERE resolution_id = resolution_id_value;

  FOREACH team_id_value IN ARRAY _team_ids LOOP
    draw_position := draw_position + 1;
    INSERT INTO public.championship_overall_tie_break_resolution_teams (resolution_id, team_id, draw_order)
    VALUES (resolution_id_value, team_id_value, draw_position);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_interlaje_auto_knockout_placements(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_interlaje_overall_standings(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_overall_competition_placements(UUID, INTEGER, UUID, public.match_naipe, public.team_division, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_opening_ceremony_bonus(UUID, INTEGER, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_interlaje_overall_tie_break_resolution(UUID, INTEGER, UUID[]) TO authenticated;
