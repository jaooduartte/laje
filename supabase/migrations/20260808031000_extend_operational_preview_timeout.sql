-- A prévia operacional completa gera temporariamente:
--
-- - fase de grupos;
-- - redistribuição dos jogos;
-- - reservas das finais manuais;
-- - projeção integral do mata-mata;
-- - reservas de quartas/semifinais/finais;
-- - timeline e diagnósticos.
--
-- O role authenticated do Supabase possui statement_timeout de 8s.
--
-- A projeção completa do INTERLAJE ultrapassa esse limite depois da
-- correção que passou a considerar todos os jogos do mata-mata.
--
-- O timeout maior é aplicado SOMENTE ao RPC administrativo de preview.
-- Não alteramos o timeout global do role authenticated.

ALTER FUNCTION
  public.preview_championship_bracket_groups(
    UUID,
    JSONB
  )
SET statement_timeout = '30s';


COMMENT ON FUNCTION
  public.preview_championship_bracket_groups(
    UUID,
    JSONB
  )
IS
  'Simula em rollback a geração completa do chaveamento e devolve a prévia operacional. Possui timeout próprio de 30 segundos por executar geração, redistribuição, projeção completa do mata-mata e montagem da timeline.';


NOTIFY pgrst, 'reload schema';