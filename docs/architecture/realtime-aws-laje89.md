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

## Hooks migrados nesta PR

| Fluxo                             | Hook                          | Atualização no modo AWS                                                          |
| --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Página ao vivo, partidas e chaves | `useLiveChampionshipRealtime` | 30 segundos, callbacks agrupados                                                 |
| Listas de jogos/placares          | `useMatches`                  | 30 segundos quando há partida ao vivo, caso contrário 90 segundos                |
| Classificação                     | `useStandings`                | 90 segundos                                                                      |
| Chaveamento                       | `useChampionshipBracket`      | 90 segundos                                                                      |
| Eventos públicos                  | `useLeagueEvents`             | 180 segundos                                                                     |
| Visitantes online                 | `OnlineVisitorsBadge`         | **Oculta** em AWS, sem fingir que ausência de Presence significa zero visitantes |

Os hooks já chamam a API AWS para obter dados. O polling somente repete as leituras e nunca escreve no RDS. O backend Supabase mantém seus canais originais intactos durante a migração. Em AWS não há chamadas à `supabase.channel()` nestes cinco fluxos.

**Presença online:** o sistema legado utiliza `supabase.channel(...presence)`. Como o backend AWS ainda não fornece presença real, esconder o contador é mais correto que exibir zero. Antes de restabelecer esse recurso no produto final, decidir se o painel realmente exige essa métrica e, se sim, implementar presença com TTL e identidade de sessão (sem expor PII), com orçamento e teste para múltiplas tasks. Não criar uma simulação que exiba contagem inverídica.

## Orçamento / proteção até dezembro de 2026

- **Custo fixo adicional da fase 1: zero.** Nenhum novo WebSocket API, ELB, banco, Lambda, DynamoDB, Redis, NAT Gateway ou serviço cron.
- A AWS ainda cobra por **requisições e tráfego existentes**, conforme plano/conta e região; **não** prometer custo total zero. O volume de requisições cresce com o número de abas abertas e espectadores; sob 100 espectadores _ativos e contínuos_ em uma tela ao vivo de três leituras a cada 30 segundos, o limite teórico daquele fluxo é aproximadamente 10 requisições/s (sem contar outros hooks). Essa é uma hipótese de dimensionamento, **não** tráfego medido.
- Intervalos maiores em classificação, chaveamento e eventos diminuem o tráfego. O componente de partidas muda de 90 para 30 segundos quando há jogos `LIVE`.
- Não executar polling em background, não manter contadores de presença que exigem ping contínuo, não ativar servidor WebSocket separado.
- Após publicar **somente em staging**, usar métricas CloudWatch/API Gateway `Count`, p95 latência, 4xx/5xx, ALB, CPU/RDS e Cost Explorer por serviço/tag para verificar se o custo projetado cabe até 31/12/2026. Reduzir frequências se necessário; otimizar mais tarde com uma revisão/ETag barata caso audiência cresça.
- Não provisionar produção AWS antecipadamente. Mantém-se o guardrail da LAJE-139.

## Testes e limitações

Testes unitários exercitam timer compartilhado, pausa oculta/offline, retomada/reconexão, prevenção de requests sobrepostos, cleanup e isolamento Supabase/AWS. É necessária validação posterior em `laje-tcc` com **duas sessões**: atualizar placar pelo admin, confirmar atualização da página ao vivo em até uma janela de polling, verificar chaves e classificação e observar traces API e custo. O código não sincroniza presença ainda.

Existem outros hooks com canais Supabase (premiações, administração, desempates, disciplina, calendários, inscrições). Antes de marcar a LAJE-89 como concluída, inventariar e migrar fluxos ainda exigidos pela arquitetura final, incluindo autenticação e permissões adequadas no AWS, validar o comportamento de eventos e os requisitos de Presence. Não declarar equivalência total apenas com a fase 1.

A implementação em duas fases está alinhada aos requisitos de evidência, testes/CI, revisão por pares e deploy da documentação de Portfólio; a Vercel é mantida como exceção autorizada pelo professor, sem interferir nos serviços AWS.

**Jira:** [LAJE-89](https://joaoduartte.atlassian.net/browse/LAJE-89)
