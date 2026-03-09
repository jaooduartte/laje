CREATE OR REPLACE FUNCTION public.cleanup_bracket_matches_on_match_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  affected_competition_id UUID;
BEGIN
  FOR affected_competition_id IN
    SELECT DISTINCT bracket_matches_table.competition_id
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = OLD.id
  LOOP
    DELETE FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = OLD.id
      AND bracket_matches_table.competition_id = affected_competition_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = affected_competition_id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    ) THEN
      DELETE FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.competition_id = affected_competition_id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_bracket_matches_on_match_delete_trigger ON public.matches;

CREATE TRIGGER cleanup_bracket_matches_on_match_delete_trigger
AFTER DELETE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_bracket_matches_on_match_delete();

NOTIFY pgrst, 'reload schema';
