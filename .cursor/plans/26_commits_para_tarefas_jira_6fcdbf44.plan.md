---
name: 26 commits para tarefas JIRA
overview: Lista dos 26 commits do repositório laje com título e descrição prontos para criação de tarefas no JIRA, em ordem cronológica (do mais antigo ao mais recente).
todos: []
isProject: false
---

# Títulos e descrições dos 26 commits para JIRA

Use cada bloco abaixo como base para criar uma tarefa no JIRA. A ordem é cronológica (commit mais antigo = tarefa 1).

---

## 1. Setup inicial do projeto

**Título:** Setup do template Vite + React + Shadcn + TypeScript  
**Descrição:** Inicialização do projeto a partir do template `new_style_vite_react_shadcn_ts_testing_2026-01-08`. Inclusão de dependências (package.json), configuração ESLint, Vite, Tailwind, PostCSS, componentes UI (shadcn), estrutura de pastas (src/components/ui, pages, hooks), estilos globais e página inicial (Index). Inclusão de testes de exemplo e configuração Vitest.

---

## 2. Primeira implementação e integração

**Título:** Implementação inicial da aplicação e integração com backend  
**Descrição:** Alterações gerais na aplicação: atualização do index.html, inclusão de dependências no package.json, ajustes no App.tsx. Criação dos componentes Header, LiveMatchBanner, MatchCard, SportFilter, StandingsTable. Implementação dos componentes de admin (AdminMatchControl, AdminMatches, AdminSports, AdminTeams). Criação dos hooks useAuth, useMatches, useSports, useStandings, useTeams. Páginas Admin, Agenda, Index e Login. Cliente Supabase, tipos e migração inicial. Ajustes no Tailwind e estilos em index.css.

---

## 3. Conexão ao Lovable Cloud e MVP

**Título:** Conexão ao Lovable Cloud e configuração do backend Supabase para MVP  
**Descrição:** Configuração do backend Supabase para autenticação e base de dados; definição de variáveis de ambiente; ativação do fluxo de admin; seed de dados iniciais para o MVP "LAJE Ao Vivo".

---

## 4. Refatoração de layout e campeonatos

**Título:** Refatoração de layout, campeonatos e gestão de partidas/equipas  
**Descrição:** Atualização de layout (Header, LiveMatchBanner, MatchCard, StandingsTable). Expansão de AdminMatchControl, AdminMatches, AdminSports e AdminTeams. Novo date-time-picker e melhorias no sonner. Hooks useAuth, useChampionships, useMatches, useStandings, useTeams e useSelectedChampionship. Tipos e lib championship. Páginas Admin, Agenda, Championships, Index e Login ampliadas. Migrações: championships/divisions/pontos, status de campeonato, naipe em partidas, refactor de modalidades. Novos assets (logos campeonatos, favicon, logo). Ajustes no .gitignore e config.

---

## 5. Ignorar variantes de ambiente

**Título:** Atualizar .gitignore para variantes de ambiente  
**Descrição:** Inclusão no .gitignore de entradas para ignorar ficheiros de variantes de ambiente (env), evitando commit de configurações locais.

---

## 6. Melhorias gerais (feat: updates)

**Título:** Melhorias em README, componentes e regras de desempate  
**Descrição:** Atualização do README. Ajustes em LiveMatchBanner, MatchCard, TeamStandingsTable, AdminMatchControl, AdminMatches, AdminSports, AdminTeams e Admin. Melhorias em Agenda, Championships e Index. Nova lógica de standings (lib/standings). Migrações: correção de funções após modo naipe, recriação de triggers de partidas sem naipe, permissão de sobreposição de localização no CLV.

---

## 7. Regras de cartões, desempate e desportos

**Título:** Regras de cartões, critérios de desempate e gestão de modalidades oficiais  
**Descrição:** Alterações em LiveMatchBanner, MatchCard, TeamStandingsTable, AdminMatchControl, AdminMatches, AdminSports (simplificação), championship, standings e tipos. Ajustes em Admin, Agenda, Championships e Index. Migrações: regras de cartões e desempate, seed de desportos da plataforma e sincronização de regras, imposição de modalidades oficiais CLV.

---

## 8. Autenticação e deploy

**Título:** Melhorar fluxo de autenticação e configuração de deploy  
**Descrição:** Adição de vercel.json com configuração de redirecionamento e reescrita para suportar SPA e fluxo de autenticação em produção (Vercel).

---

## 9. Roles e permissões no painel admin

**Título:** Implementar roles e permissões no painel de administração  
**Descrição:** Integração de roles no painel admin (incluindo role "mesa"). Ajustes em useAuth, AdminMatchControl, AdminMatches, Admin, Agenda e Login. Migrações: role mesa e permissões do painel admin. Controlo de acesso por perfil (UI e lógica).

---

## 10. Rotas, eventos de liga e gestão no admin

**Título:** Atualizar rotas, componentes UI e gestão de eventos de liga no admin  
**Descrição:** Novas rotas na aplicação. Melhorias no Header, LiveMatchBanner, MatchCard, SportFilter, StandingsTable, TeamStandingsTable. Criação de AdminLeagueEvents. Ajustes em AdminMatchControl, AdminMatches, AdminSports, AdminTeams. Guard AdminRouteGuard. Novos DTOs e repositório de league events, constantes e tipos. Hooks useAuth (renomeado/expandido), useChampionshipSelection, useLeagueEvents. Tipos Supabase para league events. Novos estilos e enums. Ficheiro CODEOWNERS.

---

## 11. Layout e responsividade

**Título:** Melhorar layout e responsividade dos componentes  
**Descrição:** Refatoração do Header, LiveMatchBanner, MatchCard, AdminLeagueEvents, AdminMatches, date-time-picker, AdminPageView, ChampionshipsPageView, LeagueCalendarPageView e LivePageView para melhor layout e comportamento em diferentes tamanhos de ecrã.

---

## 12. Web app manifest e suporte mobile

**Título:** Adicionar web app manifest e melhorar suporte mobile  
**Descrição:** Criação do ficheiro public/site.webmanifest com metadados da aplicação (nome, ícones, tema, display) e atualização do index.html com links e meta tags para melhor suporte em dispositivos móveis e instalação como PWA.

---

## 13. Eventos de liga, utilizadores admin e logs

**Título:** Gestão de eventos de liga, controlo de acesso de utilizadores e logs no admin  
**Descrição:** Expansão de AdminLeagueEvents, AdminLogs, AdminMatches, AdminTeams e criação de AdminUsers. DTOs e helpers de league events, repositório ampliado. useAuth com lógica de perfis e permissões. Tipos Supabase atualizados. Migrações: eventos multi-organizador, equipas só de evento, remoção de duplicados, roles eventos, logs, admin users, perfis customizados, permissões por perfil, edição de perfis (exceto admin), correção de funções de hash de password. Integração com calendário de liga e página de campeonatos.

---

## 14. Definições de acesso público no admin

**Título:** Implementar definições de acesso público no painel admin  
**Descrição:** Nova secção AdminPublicAccessSettings. PublicRouteGuard para controlar acesso a rotas públicas. Hook usePublicAccessSettings e lógica em lib/publicAccess. Migrações: tab de definições no admin, tabela e políticas de public_access_control_settings, blocos por página. Header e App atualizados. Asset offline.svg. Integração com LeagueCalendarPageView.

---

## 15. Tema automático e AppBadge

**Título:** Integrar tema automático e componente AppBadge na UI  
**Descrição:** Criação de AutomaticThemeProvider e useAutomaticTheme. Novo componente AppBadge e variantes de botão. Ficheiros theme.ts e theme.test.ts. Aplicação do tema e badges em Header, LiveMatchBanner, MatchCard, StandingsTable, TeamStandingsTable, componentes admin (LeagueEvents, Logs, MatchControl, Matches, PublicAccessSettings, Teams, Users), alert-dialog, calendar, date-time-picker, pagination, select, sonner, tabs. Constantes e tipos de league events e championship atualizados. Testes para AutomaticThemeProvider e theme.

---

## 16. Header, guard e estilo em eventos de liga

**Título:** Reforçar autenticação no header e guard e melhorar estilo em eventos de liga  
**Descrição:** Header e PublicRouteGuard com verificação de autenticação. Ajustes de estilo em LeagueCalendarPageView e constantes de league events. Pequenas alterações em LiveMatchBanner.

---

## 17. HomePage e navegação dinâmica

**Título:** Adicionar HomePage e navegação dinâmica no header  
**Descrição:** Criação das páginas HomePage e HomePageView. Novo ficheiro lib/navigation com itens de navegação dinâmica. Integração no App e Header. Ajustes em lib/publicAccess e enums. Atualização do NotFoundPageView.

---

## 18. Badge de visitantes online no admin

**Título:** Adicionar badge de visitantes online no painel admin  
**Descrição:** Novo componente OnlineVisitorsBadge e hook useOnlineVisitors para mostrar visitantes em tempo real. Integração no Header e AdminPageView. Novos enums. Ajustes em AdminMatches e button-variants.

---

## 19. Provider de visitantes online na App

**Título:** Integrar OnlineVisitorsProvider na App e melhorar badge de visitantes  
**Descrição:** Criação de OnlineVisitorsProvider e integração no App. Atualização do OnlineVisitorsBadge e da estrutura do AdminPageView para consumir o provider e exibir visitantes online de forma consistente.

---

## 20. Conta admin e wizard de chaveamento

**Título:** Implementar conta admin e wizard de chaveamento de campeonato  
**Descrição:** Novo componente AdminAccount e AdminChampionshipBracketWizardModal (wizard para criação/configuração de chaves). Expansão de AdminLogs (paginação), AdminMatchControl (gestão de sets), AdminMatches, AdminSports, AdminUsers. ChampionshipBracketBoard. Novos DTOs e repositórios: AdminUserDTO, ChampionshipBracketSetup, ChampionshipBracketWizardDraft, constantes e tipos de bracket. Regras por desporto (beach soccer, beach tennis, beach volleyball, futevôlei). Hooks useAuth e useChampionshipBracket. Migrações: geração de championship_brackets, rebuild de standings ao apagar partida, qualificação knockout (melhores segundos), variáveis de bracket, índices e constraints de bracket, fluxo de conta admin e login. README atualizado com estados de campeonato. Melhorias em Login e páginas de campeonatos, agenda e live.

---

## 21. Partidas, equipas, filtros e knockout no admin

**Título:** Melhorar gestão de partidas e equipas no admin, filtros e progressão knockout  
**Descrição:** Melhorias em MatchCard, AdminChampionshipBracketWizardModal, AdminLeagueEvents, AdminLogs, AdminMatchControl, AdminMatches, AdminTeams, AdminUsers. ChampionshipBracketBoard ampliado. Novos hooks useChampionshipBracketHistory e melhorias em useChampionshipBracket, useMatches, useStandings. Libs championship e championshipHistory, random e types. Migrações: limpeza de knockout ao apagar schedule, limpeza de bracket groups, progressão automática do knockout, intercalação de jogos da fase de grupos, correção de ambiguidade de variáveis no knockout, pairings do primeiro round por ordem de grupo, anos de época e rollover, sincronização de funções de bracket com season_year. Paginação (app-pagination-controls). Ajustes em Championships, Live, Schedule e vite.config.

---

## 22. Refatorar AdminAccount e AdminUsers

**Título:** Refatorar AdminAccount e AdminUsers para gestão de utilizadores e erros  
**Descrição:** Simplificação de AdminAccount e AdminUsers: consolidação de operações de gravação, melhor tratamento de erros e fluxo de gestão de utilizadores. Ajustes em AdminLogs e AdminMatches. Helpers de league events. Alterações em AdminPage e LeagueCalendarPageView.

---

## 23. Correção do tamanho do badge

**Título:** Corrigir tamanho do badge na HomePage  
**Descrição:** Ajuste pontual no tamanho do badge na HomePageView (1 ficheiro alterado).

---

## 24. Consistência visual dos componentes UI

**Título:** Atualizar componentes UI para consistência visual e UX  
**Descrição:** Ajustes de cores de fundo, bordas e efeitos de hover em componentes de admin e campeonatos: Header, SportFilter, StandingsTable, TeamStandingsTable, AdminAccount, AdminChampionshipBracketWizardModal, AdminLeagueEvents, AdminLogs, AdminMatches, AdminPublicAccessSettings, AdminTeams, AdminUsers, ChampionshipBracketBoard. Atualização de componentes UI (alert-dialog, app-badge, app-pagination-controls, button-variants, chart, command, context-menu, date-time-picker, dialog, drawer, dropdown-menu, hover-card, input, menubar, navigation-menu, popover, select, sheet, sidebar, sonner, switch, table, tabs, textarea, toast, tooltip). Ajustes em DTOs e constantes de league events, index.css, championship, enums. Alterações em AdminPage, AdminPageView, ChampionshipsPageView, HomePageView, LeagueCalendarPageView, LoginPageView. Migração: sync admin users last_access com activity_logs.

---

## 25. (Opcional) Migração de limpeza de knockout

**Título:** Corrigir limpeza de dados knockout após eliminação de partida  
**Descrição:** Ficheiro de migração não commitado (apenas em working tree): `20260310120000_fix_knockout_cleanup_after_match_deletion.sql`. Pode ser ignorado para as 26 tarefas JIRA se considerar apenas commits já no histórico; ou criar uma tarefa “Fix knockout cleanup after match deletion” se quiser incluir esta alteração no JIRA.

---

## Resumo para JIRA

- **Tarefas 1–24:** Correspondem aos 24 commits do histórico (do template até ao último commit de estilo).
- **Tarefa 25:** Pode ser o commit “fix size badge” (item 23) ou o item 25 acima, consoante quiser 25 ou 26 tarefas.
- **Tarefa 26:** Se quiser exatamente 26 tarefas, use o item 25 (migração de knockout) como tarefa 26; caso contrário, use os 25 primeiros itens (1–25) excluindo a “Opcional”.

Recomendação: usar os **26 blocos** (1 a 24 + “Correção do tamanho do badge” como 25 + “Consistência visual” como 26), ou tratar o item “Opcional” como tarefa de manutenção futura e criar 25 tarefas (1–24 + uma tarefa que agrupe “fix badge” e “style UI” se preferir menos itens).