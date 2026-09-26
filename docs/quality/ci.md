# CI do frontend

O workflow `.github/workflows/ci.yml` executa em `push`, `pull_request` e manualmente por `workflow_dispatch`.

O job `Quality Gate` usa Node.js 22, `npm ci` e executa, nesta ordem:

1. typecheck incremental;
2. ESLint com zero warnings;
3. Prettier incremental sobre arquivos alterados;
4. testes automatizados com Vitest;
5. build de produção com Vite.

O workflow possui apenas permissão de leitura do conteúdo do repositório e não depende de credenciais AWS, Supabase ou Vercel de produção.
