# LAJE-39 — análise estática, segurança contínua e quality gate

## Escopo e atendimento ao Portfólio

Esta implementação atende ao requisito de **análise estática de código e segurança** da linha Web Apps do [The Portfolio Playbook](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md).
Os repositórios usam GitHub Actions para executar verificações de qualidade e segurança, com análise estática pelo SonarQube Cloud.
Este documento refere-se ao repositório **`jaooduartte/laje`**; o outro repositório possui workflow equivalente.

## Ferramentas e execução

- **SonarQube Cloud**: analisa PRs internas para `main` e atualizações de `main`, importa `coverage/frontend/lcov.info` e aguarda o Quality Gate para concluir o CI. A integração foi validada em PR e em `main`.
- **Dependency Review**: em toda PR para `main`, reprova dependências novas/vulneráveis High/Critical nos escopos `runtime`, `development` e `unknown`, consultando a base de advisories do GitHub. Não interpreta alterações de lockfile como automaticamente seguras.
- **npm audit**: verifica **toda** a árvore travada em `package-lock.json`, incluindo dependências de desenvolvimento, em PR, push, execução manual e semanal. `npm audit --audit-level=high` reprova High/Critical existentes. O JSON vai para o artefato `laje-npm-audit`; os totais por severidade aparecem no resumo do job.
- **Qualidade e cobertura**: o CI principal permanece responsável por typecheck, ESLint sem warnings, formatação, testes e builds. A cobertura fica separada, sem misturar os denominadores: frontend >=25%; backend >=75%. O workflow de segurança **não substitui** essas medições.

## SonarQube Cloud e substituição do CodeQL — LAJE-151

A análise SonarQube Cloud está ativa para PRs internas destinadas a `main` e para atualizações de `main`. O job aguarda o Quality Gate do Sonar. PRs de forks continuam executando os demais checks, mas não recebem secrets e, por isso, não executam a análise Sonar. A configuração usa `sonar-project.properties` e o LCOV já produzido em `coverage/frontend/lcov.info`.

Cada repositório precisa ter as variáveis `SONAR_ORGANIZATION` e `SONAR_PROJECT_KEY` e o secret `SONAR_TOKEN` cadastrados nas configurações do GitHub. O token não deve ser gravado no repositório nem impresso nos logs. O projeto Sonar precisa estar vinculado ao repositório GitHub correspondente.

O mínimo global de cobertura do Vitest continua em 25% de linhas. No plano Free, o Quality Gate Sonar usa o gate padrão Sonar way, que exige 80% de cobertura em código novo; essa condição é diferente da meta global do projeto. A cobertura global de 25% não substitui nem altera a condição do Sonar para código novo.

As análises Sonar das PRs #78 e #52 e de `main` nos dois repositórios foram aprovadas. Após essa validação, o CodeQL foi removido dos workflows ativos pelas PRs #79 (frontend) e #53 (API), já integradas à `main`. Os registros históricos de achados e execuções do CodeQL permanecem neste documento como histórico; não representam uma análise ativa. SonarQube Cloud, `npm audit`, Dependency Review, testes, lint, typecheck, builds e os mínimos globais de cobertura continuam ativos. Esta migração não altera branch protection, Vercel, AWS/RDS ou Supabase de produção.

## Painéis e evidências para a banca

- [SonarQube Cloud — frontend](https://sonarcloud.io/dashboard?id=jaooduartte_laje): Quality Gate, issues e métricas da análise estática.
- [GitHub Dependabot alerts](https://github.com/jaooduartte/laje/security/dependabot): advisories de dependências quando o recurso estiver habilitado para o repositório.
- [GitHub Actions — Security & Dependency Audit](https://github.com/jaooduartte/laje/actions/workflows/security.yml): status do Dependency Review, `npm audit`, sumários High/Critical e artefatos JSON.
- [GitHub Actions — CI](https://github.com/jaooduartte/laje/actions/workflows/ci.yml): quality gate estático (TypeScript/ESLint/Prettier), testes, cobertura e builds.

Para reproduzir a auditoria das dependências localmente: `npm ci --ignore-scripts && npm audit --audit-level=high`. A análise estática e o Quality Gate são executados pelo workflow do SonarQube Cloud.

## Proteção da branch `main` (recomendação opcional)

As diretrizes do Portfólio Web Apps exigem pipeline CI/CD, análise estática, segurança e cobertura mínima de testes, mas **não exigem explicitamente branch protection ou GitHub rulesets**. Por decisão registrada na [LAJE-147](https://joaoduartte.atlassian.net/browse/LAJE-147), a proteção obrigatória da `main` foi **adiada** e não bloqueia a LAJE-39.

Os workflows de CI e segurança continuam reprovando verificações quando encontram erros de tipagem, lint, formatação, cobertura insuficiente ou vulnerabilidades High/Critical. **Sem checks exigidos por branch protection, esses erros não impedem tecnicamente o merge**. A equipe deve conferir os resultados e não aprovar merges com checks reprovados.

Como melhoria futura opcional, um administrador poderá exigir PR, `Quality Gate`, `Dependency Review (new High/Critical)` e `Dependency Audit (High/Critical gate)`. Não aplicar alteração de ruleset sem autorização.

## Limites e tratamento de achados

SonarQube Cloud identifica problemas de confiabilidade, segurança e manutenção, mas não substitui pentest, validação de autenticação/permissões nem revisão manual. Achados devem receber issue no Jira com severidade, arquivo/regra, impacto e mitigação; correções são tratadas em PRs próprias. Não adicionar exceções silenciosas, alterar thresholds ou omitir dependências para obter um check verde. Dados e credenciais de produção não são lidos nem modificados por estes workflows.

**Observação arquitetural:** o frontend operacional `laje` permanece Vercel/Supabase; a instância de TCC `laje-tcc` usa a API AWS/RDS conforme o plano. Esta etapa altera workflows, documentação e anotações exclusivas do CodeQL, sem mudança funcional, de banco ou deploy.

## Resultado do primeiro ciclo — 14/10/2026

- O CodeQL da PR #70 executou com sucesso, sem findings High/Critical no frontend.
- A auditoria `npm audit` revelou **3 entradas Critical e 32 High** já existentes no lockfile, incluindo tooling dev e dependências runtime; o gate reprovou corretamente. A remediação está registrada na [LAJE-145](https://joaoduartte.atlassian.net/browse/LAJE-145), sem ocultar o risco no CI.
- `Dependency Review` falhou porque **Dependency graph está desabilitado no repositório**. É necessário habilitá-lo com acesso admin. Os passos, inclusive branch protection, estão na [LAJE-147](https://joaoduartte.atlassian.net/browse/LAJE-147). Este impedimento não é vulnerabilidade do código nem deve ser contornado desabilitando o job.
- Até resolver essas pendências, a PR de implantação segue em rascunho e **não deve ser mesclada**. Check verde de lint/testes não representa aprovação do gate de segurança.

## Validação de integração — 15/10/2026

- A correção das dependências foi incorporada à `main` do frontend na [PR #71](https://github.com/jaooduartte/laje/pull/71): auditoria com **0 Critical e 0 High**, CI aprovada com 1.092 testes, 48,75% de cobertura e builds; as duas aplicações Vercel tiveram deployment `READY` do commit `babc87ff28a8d9ec422bf09622fbf5d244efbd06`.
- A atualização de rate limiting da API foi incorporada à `main` na [PR #45](https://github.com/jaooduartte/laje-api/pull/45); testes/CI e CodeQL foram aprovados, mas **não confundir merge com deploy**. O backend ECS de staging continuava numa imagem de 13/10/2026, antes da migration LAJE-146.
- `Dependency Graph` foi habilitado pelo responsável, e o `Dependency Review` passou nos dois repositórios.
- O resultado do primeiro ciclo, documentado acima, é histórico; a validação final da LAJE-39 deve ser feita nos workflows após estes merges e antes de concluir o Jira.
