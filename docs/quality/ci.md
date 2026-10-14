# CI/CD do frontend — LAJE-33

O workflow `.github/workflows/ci.yml` executa em `pull_request` direcionado à `main`, `push` na `main` (auditoria pós-merge) e `workflow_dispatch`. Não executa duas vezes a cada commit em branches intermediárias.

## Quality gate

O job `Quality Gate` usa Node.js 22 e `npm ci` e executa:

1. `npm run typecheck` (baseline incremental de TypeScript).
2. `npm run lint` (sem warnings).
3. `npm run format:check` (arquivos alterados).
4. `npm test` (Vitest).
5. `npm run build` no modo legado/Supabase.
6. `npm run build` no modo AWS-only, com `VITE_BACKEND_PROVIDER=aws`, `VITE_API_URL=https://example.invalid/api/v1` e sem variáveis Supabase.

O CI não precisa de credenciais de produção: os valores públicos usados no build AWS-only são fictícios. Variáveis `VITE_*` são embutidas no JavaScript entregue ao navegador e nunca devem conter segredos.

## Ambientes Vercel

O mesmo repositório GitHub alimenta dois projetos Vercel distintos:

- `laje`: produção atual com `VITE_BACKEND_PROVIDER=supabase`, preservada durante a migração.
- `laje-tcc`: integração AWS-only com `VITE_BACKEND_PROVIDER=aws` e `VITE_API_URL` configurada para a API AWS com o sufixo `/api/v1`.

O `vercel.json` permite deployment Git apenas para `main`, desabilitando previews automáticos de branches intermediárias. A integração Git da Vercel publica a `main`; o GitHub Actions desta pasta **valida**, mas não executa deploy nem garante que a publicação Vercel aguarde o CI pós-merge.

Antes de fazer merge, confirme o resultado verde do CI da PR e a revisão por pares. As políticas de branch protection não são aplicadas por este workflow. Reconfigurar ou promover o frontend produtivo para AWS está fora do escopo desta PR e requer os gates de cutover da LAJE-139.

## Evidências e rollback

- Referencie na PR o workflow de CI aprovado, o commit e a revisão.
- Verifique na Vercel qual projeto e commit estão em produção e quais variáveis públicas estão configuradas, sem incluir segredos em logs.
- Em falha após publicação, utilize o histórico de deployments da Vercel para restaurar uma versão anteriormente saudável, mantendo o projeto `laje` no modo Supabase até autorização do cutover.
- Para a API AWS, use o runbook do repositório `laje-api` em `docs/deployment.md`.

A meta de cobertura e os checks de segurança são acompanhados separadamente em LAJE-38 e LAJE-39. Consulte a Wiki para a documentação oficial de entrega.
