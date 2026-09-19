CREATE OR REPLACE FUNCTION public.propagate_championship_knockout_progress(_match_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_bracket_match RECORD;
  resolved_winner_team_id UUID;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.match_id,
    bracket_matches_table.home_team_id,
    bracket_matches_table.away_team_id,
    bracket_matches_table.round_number,
    bracket_matches_table.slot_number,
    bracket_matches_table.next_bracket_match_id
  INTO current_bracket_match
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = _match_id
    AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
  LIMIT 1;

  IF current_bracket_match.id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    CASE
      WHEN matches_table.home_score > matches_table.away_score THEN matches_table.home_team_id
      WHEN matches_table.away_score > matches_table.home_score THEN matches_table.away_team_id
      WHEN matches_table.home_score = matches_table.away_score
        AND sports_table.code IN ('FUTEBOL_SOCIETY', 'BEACH_SOCCER', 'FUTSAL')
        AND matches_table.home_penalty_score > matches_table.away_penalty_score
      THEN matches_table.home_team_id
      WHEN matches_table.home_score = matches_table.away_score
        AND sports_table.code IN ('FUTEBOL_SOCIETY', 'BEACH_SOCCER', 'FUTSAL')
        AND matches_table.away_penalty_score > matches_table.home_penalty_score
      THEN matches_table.away_team_id
      WHEN matches_table.home_score = matches_table.away_score THEN matches_table.resolved_tie_break_winner_team_id
      ELSE NULL
    END
  INTO resolved_winner_team_id
  FROM public.matches AS matches_table
  JOIN public.sports AS sports_table
    ON sports_table.id = matches_table.sport_id
  WHERE matches_table.id = _match_id
  LIMIT 1;

  IF resolved_winner_team_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.championship_bracket_matches AS bracket_matches_table
  SET
    winner_team_id = resolved_winner_team_id,
    is_bye = false
  WHERE bracket_matches_table.id = current_bracket_match.id;

  IF current_bracket_match.next_bracket_match_id IS NOT NULL THEN
    PERFORM public.ensure_championship_knockout_next_round_match(
      (
        SELECT editions_table.championship_id
        FROM public.championship_bracket_editions AS editions_table
        WHERE editions_table.id = current_bracket_match.bracket_edition_id
        LIMIT 1
      ),
      current_bracket_match.competition_id,
      current_bracket_match.round_number,
      ((current_bracket_match.slot_number + 1) / 2)
    );

    PERFORM public.ensure_championship_knockout_third_place_match(
      (
        SELECT editions_table.championship_id
        FROM public.championship_bracket_editions AS editions_table
        WHERE editions_table.id = current_bracket_match.bracket_edition_id
        LIMIT 1
      ),
      current_bracket_match.competition_id,
      current_bracket_match.round_number
    );
  END IF;

  PERFORM public.sync_championship_bracket_edition_status(current_bracket_match.bracket_edition_id);
END;
$function$;
