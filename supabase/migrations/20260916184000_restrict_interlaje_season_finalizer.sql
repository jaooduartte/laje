-- LAJE-103
-- O fechamento de divisões é disparado pelo trigger transacional de encerramento.
-- Não expomos o RPC mutável diretamente a qualquer usuário autenticado.

REVOKE ALL ON FUNCTION public.finalize_interlaje_season_divisions(UUID, INTEGER, UUID)
  FROM anon, authenticated;
