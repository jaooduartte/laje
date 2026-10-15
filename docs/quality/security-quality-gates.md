# LAJE-39 — análise estática, segurança contínua e quality gate

## Escopo e atendimento ao Portfólio

Esta implementação atende ao requisito de **análise estática de código e segurança** da linha Web Apps do [The Portfolio Playbook](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md).
Ambos os repositórios públicos usam GitHub Actions e GitHub Code Scanning, sem depender de contas externas ou segredos adicionais.
Este documento refere-se ao repositório **`jaooduartte/laje`**; o outro repositório possui workflow equivalente.

## Ferramentas e execução

- **CodeQL SAST**: varre JavaScript/TypeScript com `security-extended` no PR para `main`, push para `main`, execução manual e agendamento semanal. O SARIF vai para a aba **Security → Code scanning** e é armazenado como artefato por 30 dias. Um script lê o SARIF original e **reprova qualquer alerta de segurança High (pontuação >=7) ou Critical (>=9)**; falha fechada se o relatório não existe ou é inválido.
- **Dependency Review**: em toda PR para `main`, reprova dependências novas/vulneráveis High/Critical nos escopos `runtime`, `development` e `unknown`, consultando a base de advisories do GitHub. Não interpreta alterações de lockfile como automaticamente seguras.
- **npm audit**: verifica **toda** a árvore travada em `package-lock.json`, incluindo dependências de desenvolvimento, em PR, push, execução manual e semanal. `npm audit --audit-level=high` reprova High/Critical existentes. O JSON vai para o artefato `laje-npm-audit`; os totais por severidade aparecem no resumo do job.
- **Qualidade e cobertura**: o CI principal permanece responsável por typecheck, ESLint sem warnings, formatação, testes e builds. A cobertura fica separada, sem misturar os denominadores: frontend >=25%; backend >=75%. O workflow de segurança **não substitui** essas medições.

## Painéis e evidências para a banca

- [GitHub Code scanning](https://github.com/jaooduartte/laje/security/code-scanning): regras, severidade, arquivos atingidos, histórico e alertas.
- [GitHub Dependabot alerts](https://github.com/jaooduartte/laje/security/dependabot): advisories de dependências quando o recurso estiver habilitado para o repositório.
- [GitHub Actions — Security & Static Analysis](https://github.com/jaooduartte/laje/actions/workflows/security.yml): status das verificações, sumários High/Critical, relatórios SARIF/JSON e datas das execuções.
- [GitHub Actions — CI](https://github.com/jaooduartte/laje/actions/workflows/ci.yml): quality gate estático (TypeScript/ESLint/Prettier), testes, cobertura e builds.

Para reproduzir a auditoria das dependências localmente: `npm ci --ignore-scripts && npm audit --audit-level=high`. O CodeQL roda no workflow com a suite `security-extended` e os resultados são analisados pelo script `scripts/ci/codeql-severity-gate.mjs`.

## Proteção da branch `main` (recomendação opcional)

As diretrizes do Portfólio Web Apps exigem pipeline CI/CD, análise estática, segurança e cobertura mínima de testes, mas **não exigem explicitamente branch protection ou GitHub rulesets**. Por decisão registrada na [LAJE-147](https://joaoduartte.atlassian.net/browse/LAJE-147), a proteção obrigatória da `main` foi **adiada** e não bloqueia a LAJE-39.

Os workflows de CI e segurança continuam reprovando verificações quando encontram erros de tipagem, lint, formatação, cobertura insuficiente ou vulnerabilidades High/Critical. **Sem checks exigidos por branch protection, esses erros não impedem tecnicamente o merge**. A equipe deve conferir os resultados e não aprovar merges com checks reprovados.

Como melhoria futura opcional, um administrador poderá exigir PR, `Quality Gate`, `CodeQL SAST (High/Critical gate)`, `Dependency Review (new High/Critical)` e `Dependency Audit (High/Critical gate)`. Não aplicar alteração de ruleset sem autorização.

## Limites e tratamento de achados

CodeQL identifica padrões de risco, não substitui pentest, validação de autenticação/permissões nem revisão manual. Achados devem receber issue no Jira com severidade, arquivo/regra, impacto e mitigação; correções são tratadas em PRs próprias. Não desligar o gate, adicionar exceção silenciosa, alterar thresholds ou omitir dependências para obter um check verde. Dados e credenciais de produção não são lidos nem modificados por estes workflows.

**Observação arquitetural:** o frontend operacional `laje` permanece Vercel/Supabase; a instância de TCC `laje-tcc` usa a API AWS/RDS conforme o plano. Este trabalho modifica apenas o CI e a documentação, sem mudanças no banco ou deploy.

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
