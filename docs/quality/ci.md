# CI do frontend

O workflow `.github/workflows/ci.yml` executa em `pull_request` e manualmente por `workflow_dispatch`, evitando duas execuções para o mesmo commit de uma PR.

O job `Quality Gate` usa Node.js 22, `npm ci` e executa, nesta ordem:

1. typecheck incremental;
2. ESLint com zero warnings;
3. Prettier incremental sobre arquivos alterados;
4. testes automatizados com Vitest;
5. build de produção com Vite.

O workflow possui apenas permissão de leitura do conteúdo do repositório e não depende de credenciais AWS, Supabase ou Vercel de produção. O Vitest fornece valores de teste não secretos para a configuração pública do client Supabase; os testes não se conectam a um projeto Supabase.
