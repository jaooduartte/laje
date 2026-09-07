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
    bracket_matches_table.slot_number
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

  PERFORM public.sync_championship_bracket_edition_status(current_bracket_match.bracket_edition_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_championship_knockout_match_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_penalty_shootout_knockout_match BOOLEAN := false;
BEGIN
  IF NEW.status != 'FINISHED'::public.match_status THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.sports AS sports_table
      ON sports_table.id = NEW.sport_id
    WHERE bracket_matches_table.match_id = NEW.id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND sports_table.code IN ('FUTEBOL_SOCIETY', 'BEACH_SOCCER', 'FUTSAL')
  )
  INTO is_penalty_shootout_knockout_match;

  IF NEW.home_score = NEW.away_score THEN
    IF is_penalty_shootout_knockout_match
      AND NEW.home_penalty_score IS NOT NULL
      AND NEW.away_penalty_score IS NOT NULL
      AND NEW.home_penalty_score != NEW.away_penalty_score THEN
      NEW.resolved_tie_break_winner_team_id := CASE
        WHEN NEW.home_penalty_score > NEW.away_penalty_score THEN NEW.home_team_id
        ELSE NEW.away_team_id
      END;
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.match_id = NEW.id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    ) THEN
      RAISE EXCEPTION 'Jogos do mata-mata não podem terminar empatados.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_championship_knockout_match_finish_trigger ON public.matches;
CREATE TRIGGER validate_championship_knockout_match_finish_trigger
BEFORE UPDATE OF
  status,
  home_score,
  away_score,
  home_penalty_score,
  away_penalty_score,
  resolved_tie_break_winner_team_id
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.validate_championship_knockout_match_finish();

CREATE OR REPLACE FUNCTION public.handle_championship_bracket_match_finished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  bracket_match_record RECORD;
  should_reconcile_group_competition BOOLEAN := false;
  should_propagate_knockout_progress BOOLEAN := false;
BEGIN
  SELECT
    bracket_matches_table.id,
    bracket_matches_table.bracket_edition_id,
    bracket_matches_table.competition_id,
    bracket_matches_table.phase
  INTO bracket_match_record
  FROM public.championship_bracket_matches AS bracket_matches_table
  WHERE bracket_matches_table.match_id = NEW.id
  LIMIT 1;

  IF bracket_match_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF bracket_match_record.phase = 'GROUP_STAGE'::public.bracket_phase THEN
    should_reconcile_group_competition := (
      (
        OLD.status IS DISTINCT FROM NEW.status
        AND (
          OLD.status = 'FINISHED'::public.match_status
          OR NEW.status = 'FINISHED'::public.match_status
        )
      )
      OR (
        OLD.status = 'FINISHED'::public.match_status
        AND NEW.status = 'FINISHED'::public.match_status
        AND (
          NEW.home_score IS DISTINCT FROM OLD.home_score
          OR NEW.away_score IS DISTINCT FROM OLD.away_score
          OR NEW.home_yellow_cards IS DISTINCT FROM OLD.home_yellow_cards
          OR NEW.away_yellow_cards IS DISTINCT FROM OLD.away_yellow_cards
          OR NEW.home_red_cards IS DISTINCT FROM OLD.home_red_cards
          OR NEW.away_red_cards IS DISTINCT FROM OLD.away_red_cards
          OR NEW.home_blue_cards IS DISTINCT FROM OLD.home_blue_cards
          OR NEW.away_blue_cards IS DISTINCT FROM OLD.away_blue_cards
          OR NEW.home_two_minute_penalties IS DISTINCT FROM OLD.home_two_minute_penalties
          OR NEW.away_two_minute_penalties IS DISTINCT FROM OLD.away_two_minute_penalties
          OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
          OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
          OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover
          OR NEW.is_double_walkover IS DISTINCT FROM OLD.is_double_walkover
          OR NEW.walkover_loser_team_id IS DISTINCT FROM OLD.walkover_loser_team_id
        )
      )
    );

    IF should_reconcile_group_competition THEN
      PERFORM public.generate_championship_knockout_for_competition(
        NEW.championship_id,
        bracket_match_record.competition_id,
        bracket_match_record.bracket_edition_id
      );
    END IF;

    PERFORM public.sync_championship_bracket_edition_status(bracket_match_record.bracket_edition_id);
    RETURN NEW;
  END IF;

  should_propagate_knockout_progress := (
    bracket_match_record.phase = 'KNOCKOUT'::public.bracket_phase
    AND NEW.status = 'FINISHED'::public.match_status
    AND (
      OLD.status != 'FINISHED'::public.match_status
      OR NEW.home_score IS DISTINCT FROM OLD.home_score
      OR NEW.away_score IS DISTINCT FROM OLD.away_score
      OR NEW.home_penalty_score IS DISTINCT FROM OLD.home_penalty_score
      OR NEW.away_penalty_score IS DISTINCT FROM OLD.away_penalty_score
      OR NEW.resolved_tie_breaker_rule IS DISTINCT FROM OLD.resolved_tie_breaker_rule
      OR NEW.resolved_tie_break_winner_team_id IS DISTINCT FROM OLD.resolved_tie_break_winner_team_id
      OR NEW.is_walkover IS DISTINCT FROM OLD.is_walkover
      OR NEW.is_double_walkover IS DISTINCT FROM OLD.is_double_walkover
      OR NEW.walkover_loser_team_id IS DISTINCT FROM OLD.walkover_loser_team_id
    )
  );

  IF should_propagate_knockout_progress THEN
    PERFORM public.propagate_championship_knockout_progress(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

DO $do$
DECLARE
  futsal_competition_id CONSTANT UUID := '8b13f9df-e83c-4345-b6b2-8edc5b5a701d'::UUID;
  futsal_bracket_edition_id CONSTANT UUID := '8e6464c7-b45e-43f7-b1eb-d67deb3b0c44'::UUID;
  propagated_match_count INTEGER := 0;
  knockout_match_record RECORD;
BEGIN
  FOR knockout_match_record IN
    SELECT bracket_matches_table.match_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = futsal_competition_id
      AND bracket_matches_table.bracket_edition_id = futsal_bracket_edition_id
      AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
      AND bracket_matches_table.round_number = 1
      AND matches_table.status = 'FINISHED'::public.match_status
    ORDER BY bracket_matches_table.slot_number
  LOOP
    PERFORM public.propagate_championship_knockout_progress(knockout_match_record.match_id);
    propagated_match_count := propagated_match_count + 1;
  END LOOP;

  IF propagated_match_count <> 4 THEN
    RAISE EXCEPTION 'Foram encontradas % quartas finalizadas do futsal masculino; eram esperadas 4.', propagated_match_count;
  END IF;
END;
$do$;

NOTIFY pgrst, 'reload schema';
