# LAJE-89 — Atualizações públicas em AWS com controle de custos

## Contexto e decisão

A LAJE deve funcionar sem Supabase Realtime no backend AWS. O frontend `laje` já separa `VITE_BACKEND_PROVIDER=supabase` do ambiente `aws`. A `laje-api` utiliza ECS Fargate, Amazon RDS e API Gateway HTTP já existentes, enquanto o Supabase ainda atende a produção legada.

Avaliamos:

| Tecnologia                                | Vantagem                                                                  | Limitação/custo neste projeto                                                            | Decisão                                         |
| ----------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Supabase Realtime                         | Push já em operação na produção legada                                    | Nova arquitetura permaneceria dependente do fornecedor                                   | Continuar **somente** no deploy legado Supabase |
| WebSocket/API Gateway WebSocket           | Baixa latência, presença                                                  | Serviço novo, cobrança por mensagens/conexões, auth/reconexão e coordenação entre tasks  | **Não** provisionar agora                       |
| SSE/streaming HTTP                        | Push unidirecional                                                        | Exige gateway/timeout/infra com suporte real a long-lived streams, mais conexões abertas | Não usar no staging atual                       |
| Polling inteligente sobre GETs existentes | Sem recursos AWS novos, restaura funcionalidade, comportamento previsível | Latência de dezenas de segundos e custo por request / consultas RDS                      | **Fase 1 aprovada para implementação**          |

Em vez de acrescentar serviços pagos, `useAwsRealtimePolling` utiliza um único timer por aba, agenda refetch de hooks AWS com intervalo mínimo de 15 segundos e para de fazer consultas quando `document.visibilityState=hidden` ou `navigator.onLine=false`. Quando a aba volta a ficar visível ou a rede reconecta, solicita atualização somente se houver decorrido ao menos 10 segundos desde a última consulta daquele assinante. Requisições em andamento não são duplicadas; erros não desativam novas tentativas. A escolha AWS é avaliada no hook de configuração, não em serviços novos.

## Branch compartilhada e isolamento das duas publicações Vercel

**Não criar uma segunda branch principal.** Os projetos Vercel `laje` e `laje-tcc` compilam a mesma `main` do repositório `jaooduartte/laje`, mas em projetos isolados e com variáveis independentes:

- `laje` preserva `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` e usa `BACKEND_PROVIDER=supabase` (padrão quando não existe `VITE_API_URL`). Todos os canais Supabase Realtime e Presence continuam funcionando como antes.
- `laje-tcc` define `VITE_BACKEND_PROVIDER=aws` e `VITE_API_URL`, portanto usa as leituras de `laje-api` e **não inicializa os canais Realtime** nos hooks migrados. Não depende de chaves Supabase.
- O merge na `main` pode disparar **dois deploys Vercel**. Essa é a preferência expressa para manter código único; cada build recebe suas próprias variáveis de ambiente. Não alterar as envs do projeto `laje`.
- Os dois bundles passam por CI em builds separados. Um build aprovado **não** substitui os testes funcionais de duas sessões em `laje-tcc`.

## Hooks com atualização automática AWS

| Fluxo                                      | Hook                                       | Intervalo enquanto visível      |
| ------------------------------------------ | ------------------------------------------ | ------------------------------- |
| Página ao vivo e callbacks de jogos/chaves | `useLiveChampionshipRealtime`              | 30 segundos                     |
| Jogos, placar e partidas                   | `useMatches`                               | 30s com jogo LIVE; 90s sem LIVE |
| Classificação por modalidade               | `useStandings`                             | 90 segundos                     |
| Chaveamento atual                          | `useChampionshipBracket`                   | 90 segundos                     |
| Eventos públicos                           | `useLeagueEvents`                          | 180 segundos                    |
| Campeonatos e seleção                      | `useChampionships`                         | 180 segundos                    |
| Modalidades                                | `useSports`                                | 180 segundos                    |
| Reservas pendentes (painel)                | `usePendingLeagueEventReservationRequests` | 60 segundos                     |
| Revisões de súmulas pendentes              | `usePendingScoreSheetReviewCount`          | 60 segundos                     |
| Desclassificações por equipe               | `useCompetitionTeamDisqualifications`      | 120 segundos                    |
| Histórico de chaveamento                   | `useChampionshipBracketHistory`            | 180 segundos                    |

Os hooks já possuem leitura pela API AWS, e o polling apenas refaz essas leituras. Nada escreve no banco. Cada assinatura só existe quando o respectivo componente está montado e com `enabled/realtimeEnabled`. O agendador é compartilhado por aba, pausa quando oculta/offline e evita refresh sobreposto. **Não cria recursos AWS.**

## RPCs migradas para leitura da API AWS (segunda fase)

A [PR backend #39](https://github.com/jaooduartte/laje-api/pull/39) implementa um catálogo **fechado** de endpoints em `/api/v1/realtime-read/:championshipId/:snapshot`, reutilizando as funções SQL PostgreSQL já existentes. A PR frontend #65 adapta os oito hooks abaixo, preservando as chamadas originais ao Supabase na configuração legada:

- `usePendingAwardDraws` — premiações pendentes (**autenticação AWS obrigatória**).
- `usePendingTieBreaks` — desempates pendentes (**autenticação AWS obrigatória**).
- `useInterlajeCompetitionStandings` — pontuação por competição do Interlaje.
- `useInterlajeOverallStandings` — ranking geral com normalização de desclassificações.
- `useChampionshipAwardsRankings` — rankings para premiações.
- `useChampionshipCorrectedGroupStandings` — classificação corrigida por grupo.
- `useChampionshipBracketResolvedTieBreakOrders` — ordens resolvidas de desempate.
- `useChampionshipYellowCardDiscipline` — disciplina/cartões amarelos.

A API também expõe os snapshots auxiliares `interlaje-position-points` e `competition-disqualifications`, usados pelo algoritmo existente de normalização do Interlaje no frontend. Os retornos das funções tabulares são agregados no PostgreSQL em JSONB para preservar valores numéricos na serialização, e as consultas recebem parâmetros validados.

**Ordem mandatória:** mesclar/implantar primeiro a PR backend #39 no staging, confirmar as funções do RDS e o status HTTP, e **somente depois** mesclar a PR frontend #65 na `main` única que compila `laje` (Supabase) e `laje-tcc` (AWS) com variáveis de ambiente distintas. Até ocorrer esse deploy, a integração está **implementada no código, mas não validada em staging**.

Os snapshots não criam serviços AWS novos. As operações administrativas exigem token de usuário AWS. A equivalência de conteúdo com as RPCs Supabase deve ser comprovada em ensaios de duas sessões e dados de staging antes do encerramento da LAJE-89; CI por si só não comprova a existência efetiva das funções no RDS ou a paridade semântica. Não executar merge nem alterar produção sem revisão por pares.

## Presença online

No backend Supabase, `useOnlineVisitors` mantém os canais Presence normalmente. No AWS não há um mecanismo de presença confiável: `OnlineVisitorsBadge` e os indicadores online/offline de `AdminUsers` ficam **ocultos**, em vez de mostrar zero ou classificar todos como offline. O recurso de presença pode ser explicitamente não suportado em `laje-tcc` até uma decisão do produto; não implementar ping ou armazenamento permanente sem orçamento aprovado.

## Orçamento / proteção até dezembro de 2026

- **Custo fixo adicional da fase 1: zero.** Nenhum novo WebSocket API, ELB, banco, Lambda, DynamoDB, Redis, NAT Gateway ou serviço cron.
- A AWS ainda cobra por **requisições e tráfego existentes**, conforme plano/conta e região; **não** prometer custo total zero. O volume de requisições cresce com o número de abas abertas e espectadores; sob 100 espectadores _ativos e contínuos_ em uma tela ao vivo de três leituras a cada 30 segundos, o limite teórico daquele fluxo é aproximadamente 10 requisições/s (sem contar outros hooks). Essa é uma hipótese de dimensionamento, **não** tráfego medido.
- Intervalos maiores em classificação, chaveamento e eventos diminuem o tráfego. O componente de partidas muda de 90 para 30 segundos quando há jogos `LIVE`.
- Não executar polling em background, não manter contadores de presença que exigem ping contínuo, não ativar servidor WebSocket separado.
- Após publicar **somente em staging**, usar métricas CloudWatch/API Gateway `Count`, p95 latência, 4xx/5xx, ALB, CPU/RDS e Cost Explorer por serviço/tag para verificar se o custo projetado cabe até 31/12/2026. Reduzir frequências se necessário; otimizar mais tarde com uma revisão/ETag barata caso audiência cresça.
- Não provisionar produção AWS antecipadamente. Mantém-se o guardrail da LAJE-139.

## Testes e limitações

Testes unitários exercitam timer compartilhado, pausa oculta/offline, retomada/reconexão, prevenção de requests sobrepostos, cleanup e isolamento Supabase/AWS. É necessária validação posterior em `laje-tcc` com **duas sessões**: atualizar placar pelo admin, confirmar atualização da página ao vivo em até uma janela de polling, verificar chaves e classificação e observar traces API e custo. O código não sincroniza presença ainda.

A PR backend #39 adiciona os endpoints ausentes e a PR frontend #65 realiza a integração, mas o critério de aceite ainda depende de deploy AWS, verificação da existência das funções no RDS, paridade de dados, testes de presença/atualização, compatibilidade Supabase legado e revisão por pares antes da LAJE-139.

A implementação em duas fases está alinhada aos requisitos de evidência, testes/CI, revisão por pares e deploy da documentação de Portfólio; a Vercel é mantida como exceção autorizada pelo professor, sem interferir nos serviços AWS.

**Jira:** [LAJE-89](https://joaoduartte.atlassian.net/browse/LAJE-89)
