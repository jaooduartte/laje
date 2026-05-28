-- Corrige RLS bloqueando a função get_championship_award_pending_draws quando chamada
-- pelo frontend autenticado (role 'authenticated'). A função recriada em 20260527000000
-- foi declarada sem SECURITY DEFINER, ao contrário das demais funções RPC de premiação
-- (get_championship_score_sheet_awards_rankings e save_championship_award_draw_result).
--
-- Sintoma: a função retorna 4 contextos de empate quando chamada como 'postgres',
-- mas retorna array vazio quando chamada via PostgREST como 'authenticated' — porque
-- o RLS das tabelas consultadas (championship_award_players, match_award_goal_scorers,
-- match_award_goalkeepers, etc.) restringe o acesso.
--
-- Correção: marca a função como SECURITY DEFINER e fixa o search_path para 'public'
-- (mesmo padrão de get_championship_score_sheet_awards_rankings e save_championship_award_draw_result).

ALTER FUNCTION public.get_championship_award_pending_draws(UUID, INTEGER)
  SECURITY DEFINER
  SET search_path = public;

NOTIFY pgrst, 'reload schema';
