-- Migration: sincronizar equipes de matches para championship_bracket_matches
-- Quando home_team_id ou away_team_id de um match é alterado via admin,
-- o registro correspondente em championship_bracket_matches é atualizado automaticamente.
-- Os nomes são derivados via JOIN no RPC get_championship_bracket_view (não são colunas armazenadas).

-- Função de trigger
CREATE OR REPLACE FUNCTION public.sync_bracket_match_teams_from_match()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.home_team_id IS DISTINCT FROM OLD.home_team_id
     OR NEW.away_team_id IS DISTINCT FROM OLD.away_team_id THEN
    UPDATE public.championship_bracket_matches cbm
    SET
      home_team_id = NEW.home_team_id,
      away_team_id = NEW.away_team_id
    WHERE cbm.match_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger que dispara após UPDATE em matches
DROP TRIGGER IF EXISTS sync_bracket_match_teams_trigger ON public.matches;
CREATE TRIGGER sync_bracket_match_teams_trigger
  AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.sync_bracket_match_teams_from_match();

-- Corrigir registros já dessincronizados (executa uma vez durante a migration):
UPDATE public.championship_bracket_matches cbm
SET
  home_team_id = m.home_team_id,
  away_team_id = m.away_team_id
FROM public.matches m
WHERE cbm.match_id = m.id
  AND (
    cbm.home_team_id IS DISTINCT FROM m.home_team_id
    OR cbm.away_team_id IS DISTINCT FROM m.away_team_id
  );
