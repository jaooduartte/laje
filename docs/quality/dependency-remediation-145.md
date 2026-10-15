# LAJE-145 — Remediação de dependências do frontend

## Auditoria antes e depois

A auditoria inicial completa da LAJE-39 encontrou **3 Critical e 32 High** na árvore npm do frontend. Após as atualizações controladas, incluindo a substituição de Tailwind CSS 3 por 4, a [prévia isolada #38691471002](https://github.com/jaooduartte/laje/actions/runs/38691471002) registrou **0 Critical, 0 High, 4 Moderate e 0 Low** em `npm audit` completo. São entradas da árvore npm, não necessariamente CVEs independentes.

As versões presentes no manifesto e no lockfile são produzidas pelo npm no runner, sem `npm audit fix --force` ou `--legacy-peer-deps`.

## Pacotes e configuração

- `vite@8.3.4`, `vitest@5.0.4`, `@vitest/coverage-v8@5.0.4` e `@vitejs/plugin-react-swc@4.3.3`.
- `tailwindcss@4.3.3` e `@tailwindcss/postcss@4.3.3`, com carregamento explícito do tema legado por `@config`.
- `tw-animate-css@1.4.0` substitui o plugin legado `tailwindcss-animate`, preservando as classes usuais de entrada e accordion.
- `lovable-tagger` foi retirado por não integrar o produto publicado; **a marcação visual específica da IDE Lovable deixa de existir no ambiente dev**. O plugin React SWC permanece.
- O modo escuro recebe `@custom-variant dark`; ajustes TypeScript/Supabase da mudança de ferramentas permanecem delimitados à compatibilidade.

## Evidências automatizadas

A [prévia #38691471002](https://github.com/jaooduartte/laje/actions/runs/38691471002) concluiu com sucesso: `npm ci`, `npm audit` (0 High/Critical), `npm run typecheck`, `npm run lint`, 87 smoke tests, builds de produção e desenvolvimento. Também verificou a existência das classes CSS `bg-primary`, `text-foreground`, `border-border`, `dark`, `animate-in` e `accordion-down` no CSS gerado. **Isso não prova equivalência visual entre Tailwind 3 e 4.**

A CI completa da PR deve continuar passando os 1.092 testes e a cobertura obrigatória de pelo menos 25% de linhas; a [CI anterior #38690763140](https://github.com/jaooduartte/laje/actions/runs/38690763140) comprovou 1.092 testes e 48,75% de linhas antes da migração para Tailwind 4.

## Revisão visual necessária antes do merge

Comparar **ambos** os modos de backend, `laje` (Vercel/Supabase, permanecerá operacional) e `laje-tcc` (Vercel/AWS/RDS), sempre em ambiente isolado de teste. Revisar autenticação, navegação pública, calendário, classificação, modalidades, jogos ao vivo, tabelas, chaves, filtros, componentes Radix e formulários de administração; conferir desktop/mobile, modo claro/escuro e animações. O build e os testes não substituem essa conferência.

Sem aplicar alterações na produção, migrar banco de dados ou fazer merge sem a revisão da PR. Não modificar o site legado `laje` para usar o backend AWS: a migração de infraestrutura pertence exclusivamente ao `laje-tcc`.

Jira: [LAJE-145](https://joaoduartte.atlassian.net/browse/LAJE-145), [LAJE-39](https://joaoduartte.atlassian.net/browse/LAJE-39).
