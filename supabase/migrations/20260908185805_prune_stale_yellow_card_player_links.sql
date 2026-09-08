CREATE OR REPLACE FUNCTION public.prune_stale_match_yellow_card_player_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  DELETE FROM public.match_yellow_card_players AS yellow_card_players
  WHERE yellow_card_players.match_id = NEW.id
    AND (
      (
        yellow_card_players.team_id = NEW.home_team_id
        AND yellow_card_players.card_order > COALESCE(NEW.home_yellow_cards, 0)
      )
      OR (
        yellow_card_players.team_id = NEW.away_team_id
        AND yellow_card_players.card_order > COALESCE(NEW.away_yellow_cards, 0)
      )
    );

  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION public.prune_stale_match_yellow_card_player_links() FROM PUBLIC;

DROP TRIGGER IF EXISTS prune_stale_match_yellow_card_player_links_trigger ON public.matches;

CREATE TRIGGER prune_stale_match_yellow_card_player_links_trigger
AFTER UPDATE OF home_yellow_cards, away_yellow_cards ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.prune_stale_match_yellow_card_player_links();

DELETE FROM public.match_yellow_card_players AS yellow_card_players
USING public.matches AS matches_table
WHERE yellow_card_players.match_id = matches_table.id
  AND (
    (
      yellow_card_players.team_id = matches_table.home_team_id
      AND yellow_card_players.card_order > COALESCE(matches_table.home_yellow_cards, 0)
    )
    OR (
      yellow_card_players.team_id = matches_table.away_team_id
      AND yellow_card_players.card_order > COALESCE(matches_table.away_yellow_cards, 0)
    )
  );
