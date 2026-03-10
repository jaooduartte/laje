CREATE OR REPLACE FUNCTION public.cleanup_bracket_on_match_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  affected_edition_id UUID;
BEGIN
  FOR affected_edition_id IN
    DELETE FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.match_id = OLD.id
    RETURNING bracket_matches_table.bracket_edition_id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.bracket_edition_id = affected_edition_id
        AND bracket_matches_table.match_id IS NOT NULL
    ) THEN
      DELETE FROM public.championship_bracket_days AS bracket_days_table
      WHERE bracket_days_table.bracket_edition_id = affected_edition_id;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.cleanup_bracket_on_match_delete() IS
  'Remove vínculos do jogo excluído no chaveamento e limpa dias/horários quando a edição não possui mais jogos vinculados.';

DROP TRIGGER IF EXISTS cleanup_bracket_on_match_delete_trigger ON public.matches;

CREATE TRIGGER cleanup_bracket_on_match_delete_trigger
AFTER DELETE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_bracket_on_match_delete();

WITH competitions_without_group_matches AS (
  SELECT competitions_table.id
  FROM public.championship_bracket_competitions AS competitions_table
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    JOIN public.matches AS matches_table
      ON matches_table.id = bracket_matches_table.match_id
    WHERE bracket_matches_table.competition_id = competitions_table.id
      AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
  )
)
DELETE FROM public.championship_bracket_matches AS bracket_matches_table
WHERE bracket_matches_table.competition_id IN (
  SELECT competitions_without_group_matches.id
  FROM competitions_without_group_matches
);

WITH editions_without_scheduled_matches AS (
  SELECT editions_table.id
  FROM public.championship_bracket_editions AS editions_table
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.bracket_edition_id = editions_table.id
      AND bracket_matches_table.match_id IS NOT NULL
  )
)
DELETE FROM public.championship_bracket_days AS bracket_days_table
WHERE bracket_days_table.bracket_edition_id IN (
  SELECT editions_without_scheduled_matches.id
  FROM editions_without_scheduled_matches
);

UPDATE public.championship_bracket_editions AS editions_table
SET
  status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      WHERE bracket_matches_table.bracket_edition_id = editions_table.id
        AND bracket_matches_table.phase = 'KNOCKOUT'::public.bracket_phase
    ) THEN 'KNOCKOUT_GENERATED'::public.bracket_edition_status
    WHEN EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.bracket_edition_id = editions_table.id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    ) THEN 'GROUPS_GENERATED'::public.bracket_edition_status
    ELSE 'DRAFT'::public.bracket_edition_status
  END,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
