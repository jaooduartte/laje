# LAJE-38 — cobertura e evidências do frontend

## Metas obrigatórias

A diretriz [Portfólio Web Apps](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md) exige cobertura unitária com TDD de 25% do frontend e 75% do backend e, no mínimo, três fluxos de negócio completos. **Não somar as medições dos dois repositórios.**

## Reprodução

```bash
npm ci
npm test
npm run test:smoke
npm run test:coverage
```

O Vitest com `@vitest/coverage-v8@3.2.4` gera `coverage/frontend/coverage-summary.json`, `coverage/frontend/lcov.info` e `coverage/frontend/index.html`. O gate exige 25% de linhas em `src/**/*.{ts,tsx}`, incluindo arquivos de produção não exercitados. São excluídos testes, infraestrutura de testes, definições de tipos e o módulo de tipos gerados do Supabase; **não reduzir esse escopo para elevar a cobertura**. O CI publica o artefato `laje-frontend-coverage` mesmo em falhas. Consultar os números reais do CI; **a mera configuração do gate não comprova aprovação**.

## Matriz automatizada dos três fluxos

| Fluxo                                                       | Teste de smoke (mocks, sem dados reais)                                                                        | Evidência complementar necessária                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Autenticação administrativa                                 | `src/components/guards/AdminRouteGuard.test.tsx`                                                               | Sessão e permissões HTTP na `laje-api`, além de validação de login integrado. |
| Operação de jogos ao vivo                                   | `src/components/admin/AdminMatchControl.test.tsx`                                                              | Comandos de iniciar/placar/finalizar pela API e demonstração em staging.      |
| Consulta pública de campeonatos, classificação e calendário | `src/components/TeamStandingsTable.test.tsx` e `src/domain/calendar-subscription/calendarSubscription.test.ts` | Consultas REST à API e navegação pública completa em staging.                 |

`npm run test:smoke` exercita os testes acima sem acessar produção. Esses testes validam cenários críticos, mas **não substituem a demonstração dos três fluxos completos de ponta a ponta**.

## Processo TDD e prova de autoria

Para cada nova regra ou correção: registrar um teste reprovando (red), implementar a menor alteração (green), refatorar sem regressões e manter commits e PRs com essa trilha. Anexar à prova de autoria links do CI, relatórios HTML/LCOV, cobertura percentual e evidências de staging. A produção Vercel/Supabase operacional não deve ser alterada pela execução de testes.

A medição da `laje-api` acontece de forma independente, no repositório do backend.
