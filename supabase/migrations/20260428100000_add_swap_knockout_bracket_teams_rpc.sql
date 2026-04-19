-- Adds RPC to atomically swap two teams across all round-1 championship_bracket_matches
-- and their associated matches records for a given competition.
-- This enables manual bracket corrections without regenerating the KO.

CREATE OR REPLACE FUNCTION public.swap_championship_knockout_bracket_teams(
  _competition_id UUID,
  _team_a_id UUID,
  _team_b_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _max_round_number INTEGER;
BEGIN
  IF _team_a_id = _team_b_id THEN
    RETURN;
  END IF;

  SELECT MAX(round_number) INTO _max_round_number
  FROM public.championship_bracket_matches
  WHERE competition_id = _competition_id
    AND phase = 'KNOCKOUT';

  IF _max_round_number IS NULL THEN
    RAISE EXCEPTION 'Competição sem mata-mata gerado.';
  END IF;

  -- Swap em championship_bracket_matches (CASE atômico, sem conflito de constraints)
  UPDATE public.championship_bracket_matches
  SET
    home_team_id = CASE
      WHEN home_team_id = _team_a_id THEN _team_b_id
      WHEN home_team_id = _team_b_id THEN _team_a_id
      ELSE home_team_id
    END,
    away_team_id = CASE
      WHEN away_team_id = _team_a_id THEN _team_b_id
      WHEN away_team_id = _team_b_id THEN _team_a_id
      ELSE away_team_id
    END
  WHERE competition_id = _competition_id
    AND phase = 'KNOCKOUT'
    AND round_number = _max_round_number
    AND (
      home_team_id IN (_team_a_id, _team_b_id)
      OR away_team_id IN (_team_a_id, _team_b_id)
    );

  -- Swap nos matches associados
  UPDATE public.matches m
  SET
    home_team_id = CASE
      WHEN m.home_team_id = _team_a_id THEN _team_b_id
      WHEN m.home_team_id = _team_b_id THEN _team_a_id
      ELSE m.home_team_id
    END,
    away_team_id = CASE
      WHEN m.away_team_id = _team_a_id THEN _team_b_id
      WHEN m.away_team_id = _team_b_id THEN _team_a_id
      ELSE m.away_team_id
    END
  FROM public.championship_bracket_matches cbm
  WHERE cbm.competition_id = _competition_id
    AND cbm.phase = 'KNOCKOUT'
    AND cbm.round_number = _max_round_number
    AND cbm.match_id = m.id
    AND (
      m.home_team_id IN (_team_a_id, _team_b_id)
      OR m.away_team_id IN (_team_a_id, _team_b_id)
    );
END;
$$;
