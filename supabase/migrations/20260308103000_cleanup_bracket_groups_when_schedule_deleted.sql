CREATE OR REPLACE FUNCTION public.cleanup_bracket_competition_on_match_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.phase = 'GROUP_STAGE'::public.bracket_phase
    AND NOT EXISTS (
      SELECT 1
      FROM public.championship_bracket_matches AS bracket_matches_table
      JOIN public.matches AS matches_table
        ON matches_table.id = bracket_matches_table.match_id
      WHERE bracket_matches_table.competition_id = OLD.competition_id
        AND bracket_matches_table.phase = 'GROUP_STAGE'::public.bracket_phase
    ) THEN
    DELETE FROM public.championship_bracket_matches AS bracket_matches_table
    WHERE bracket_matches_table.competition_id = OLD.competition_id;

    DELETE FROM public.championship_bracket_groups AS groups_table
    WHERE groups_table.competition_id = OLD.competition_id;
  END IF;

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
    updated_at = now()
  WHERE editions_table.id = OLD.bracket_edition_id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.cleanup_bracket_competition_on_match_delete() IS 'Remove mata-mata e chaves órfãs quando o último jogo válido da fase de grupos é excluído e sincroniza o status da edição.';

DROP TRIGGER IF EXISTS cleanup_bracket_matches_on_match_delete_trigger ON public.matches;
DROP FUNCTION IF EXISTS public.cleanup_bracket_matches_on_match_delete();

DROP TRIGGER IF EXISTS cleanup_bracket_competition_on_match_delete_trigger ON public.championship_bracket_matches;

CREATE TRIGGER cleanup_bracket_competition_on_match_delete_trigger
AFTER DELETE ON public.championship_bracket_matches
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_bracket_competition_on_match_delete();

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
DELETE FROM public.championship_bracket_groups AS groups_table
WHERE groups_table.competition_id IN (
  SELECT competitions_without_group_matches.id
  FROM competitions_without_group_matches
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
