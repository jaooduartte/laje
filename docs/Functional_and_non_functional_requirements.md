# Requisitos Funcionais e Não Funcionais – Aplicação LAJE

## 1. Requisitos Funcionais

### 1.1 Acesso e autenticação

- **RF-AUTH-01** – O sistema deve permitir login administrativo por identificador (e-mail ou usuário) e senha.
- **RF-AUTH-02** – O sistema deve oferecer um fluxo de primeiro acesso no qual o usuário informa o identificador e, caso a senha esteja pendente, defina uma nova senha (com confirmação) antes de acessar o painel.
- **RF-AUTH-03** – O sistema deve registrar ações de login administrativo para fins de auditoria.
- **RF-AUTH-04** – O sistema deve validar se o usuário autenticado possui permissão para acessar o painel administrativo e, em caso negativo, redirecioná-lo para a página de login.
- **RF-AUTH-05** – O sistema deve permitir logout com limpeza de sessão do usuário.

### 1.2 Controle de acesso público (manutenção)

- **RF-PUB-01** – O sistema deve permitir configurar bloqueio de acesso público de forma global e por página (Ao Vivo, Campeonatos, Agenda, Calendário da Liga).
- **RF-PUB-02** – O sistema deve exibir uma mensagem customizável quando uma página estiver em manutenção.
- **RF-PUB-03** – Usuários autenticados com permissão de administrador devem continuar acessando páginas públicas mesmo quando bloqueadas para o público geral.
- **RF-PUB-04** – Na página inicial, links para páginas bloqueadas devem aparecer desabilitados e sinalizados como “em manutenção” para visitantes não autenticados, mantendo-os ativos para administradores.

### 1.3 Páginas públicas

- **RF-PUB-05** – A página inicial deve exibir links de navegação para Ao Vivo, Campeonatos, Agenda, Calendário da Liga e Admin, com desabilitação conforme configuração de manutenção.
- **RF-PUB-06** – A página Ao Vivo deve listar jogos ao vivo, jogos em breve e jogos finalizados, permitindo seleção de campeonato, exibição de tabelas de classificação e chave quando aplicável, e filtros por esporte e naipe.
- **RF-PUB-07** – A página Campeonatos deve permitir selecionar campeonato e temporada, visualizar tabelas de classificação por esporte, naipe e divisão, e visualizar a chave com times, jogos e vencedores.
- **RF-PUB-08** – A página Agenda deve listar jogos por data, com filtros por campeonato, esporte e naipe, exibindo local, quadra, horário e placar.
- **RF-PUB-09** – A página Calendário da Liga deve listar eventos da liga com tipo de evento, organizador, times organizadores (quando houver), data, local e nome.

### 1.4 Tabelas de classificação (standings)

- **RF-STAND-01** – O sistema deve atualizar automaticamente as tabelas de classificação ao finalizar jogos, calculando vitórias, empates, derrotas, gols marcados, gols sofridos, saldo de gols, pontos (por modalidade) e cartões quando aplicável.
- **RF-STAND-02** – O sistema deve ordenar as tabelas de classificação seguindo regras de desempate por modalidade definido pelo regulamento do campeonato.
- **RF-STAND-03** – O sistema deve disponibilizar standings por campeonato, temporada, esporte, naipe e divisão, exibindo de forma agregada os dados de cada time.

### 1.5 Chave do campeonato (bracket)

- **RF-BRACK-01** – O sistema deve disponibilizar um método para geração automática da fase de grupos, incluindo definição de participantes, modalidades, naipes, configuração de grupos, classificados por grupo e agenda (datas, horários, locais e quadras).
- **RF-BRACK-02** – O sistema deve permitir a distribuição manual de times entre grupos por competição (combinação de esporte, naipe e divisão).
- **RF-BRACK-03** – O sistema deve gerar a fase de mata-mata a partir da configuração da chave, com opção de jogo de terceiro lugar ou outras políticas de definição de terceiro lugar.
- **RF-BRACK-04** – O sistema deve permitir a visualização unificada da chave (fase de grupos e mata-mata), com histórico por temporada.
- **RF-BRACK-05** – O sistema deve atualizar automaticamente a chave e sua visualização quando jogos forem alterados ou excluídos, mantendo a progressão dos times conforme os resultados.

### 1.6 Jogos (matches)

- **RF-MATCH-01** – O sistema deve permitir o cadastro, edição e exclusão de jogos no painel administrativo, incluindo campeonato, temporada, esporte, divisão, naipe, times, local, quadra, data/hora de início e fim e status (agendado, ao vivo, finalizado).
- **RF-MATCH-02** – O sistema deve suportar placar por pontos (gols) ou por sets, conforme a regra do esporte, permitindo o registro e persistência dos sets quando aplicável.
- **RF-MATCH-03** – O sistema deve permitir o registro de cartões amarelos e vermelhos por time nos esportes que utilizam essa regra.
- **RF-MATCH-04** – O sistema deve oferecer um controle ao vivo de jogo, permitindo iniciar, atualizar placar/sets/cartões em tempo real e encerrar o jogo, restrito a usuários com permissão adequada.
- **RF-MATCH-05** – O sistema deve reconstruir as tabelas de classificação ao excluir um jogo e validar conflitos de horário, local e quadra na geração de agenda, exibindo mensagens de conflito.
- **RF-MATCH-06** – O sistema deve vincular jogos à chave do campeonato (fase de grupos e mata-mata), garantindo atualização automática de vencedor e progressão no mata-mata conforme o resultado.

### 1.7 Times e esportes

- **RF-TEAM-01** – O sistema deve permitir o cadastro, edição e exclusão de times com nome, cidade e divisão (principal, acesso ou sem divisão).
- **RF-SPORT-01** – O sistema deve permitir o cadastro de esportes e sua vinculação aos campeonatos com configuração de modo de naipe, regra de resultado (pontos ou sets), regra de desempate, pontuação por resultado, suporte a cartões e duração padrão de partida.
- **RF-SPORT-02** – O sistema deve manter regras específicas por esporte, como forma de pontuação, critérios de desempate e aplicação de cartões.

### 1.8 Campeonatos

- **RF-CHAMP-01** – O sistema deve permitir o cadastro de campeonatos com código, nome, status (planejamento, em breve, em andamento, encerrado), temporada atual, uso de divisões e local padrão.
- **RF-CHAMP-02** – O sistema deve permitir filtrar e operar jogos, chave e demais ações no admin por campeonato e status, incluindo transições de status ao longo do ciclo do campeonato.
- **RF-CHAMP-03** – O sistema deve suportar múltiplas temporadas por campeonato, sincronizando dados de chave e standings por ano de temporada.

### 1.9 Eventos da liga

- **RF-EVNT-01** – O sistema deve permitir o cadastro, edição e exclusão de eventos da liga com nome, tipo de evento, tipo de organizador, data e local.
- **RF-EVNT-02** – O sistema deve permitir associar múltiplos times como organizadores de um evento, incluindo times que existam apenas para fins de evento.
- **RF-EVNT-03** – O sistema deve listar os eventos da liga ordenados por data na página de calendário.

### 1.10 Painel administrativo – estrutura e permissões

- **RF-ADM-01** – O sistema deve restringir o acesso ao painel administrativo a usuários autenticados com permissão e com pelo menos uma aba com nível de acesso diferente de “nenhum”.
- **RF-ADM-02** – O painel administrativo deve ser organizado em abas (Jogos, Controle ao vivo, Times, Esportes, Eventos, Logs, Usuários, Conta, Configurações), exibidas de acordo com as permissões de visualização e edição.
- **RF-ADM-03** – O sistema deve permitir configurar perfis de permissão por aba, com níveis “nenhum”, “visualizar” e “editar”, incluindo perfis de sistema (por exemplo, admin, eventos, mesa) e perfis customizados.
- **RF-ADM-04** – O sistema deve disponibilizar, para o usuário logado, o contexto de permissão no admin (perfil, nome do perfil e permissões por aba) para controle de acesso na interface.
- **RF-ADM-05** – O sistema deve garantir que somente usuários com permissão de edição na aba de Controle possam alterar placar e status de jogos ao vivo, conforme políticas definidas no backend.

### 1.11 Usuários e conta admin

- **RF-USER-01** – O sistema deve listar usuários administrativos com nome, e-mail, identificador de login, perfil, status da senha (pendente ou ativo) e último acesso, permitindo ordenação por diferentes critérios.
- **RF-USER-02** – O sistema deve permitir a criação de usuários administrativos com identificador, nome, senha opcional, perfil e role, admitindo fluxo de primeiro acesso para definição de senha.
- **RF-USER-03** – O sistema deve permitir a edição de dados de usuários (nome, identificador de login e senha), bem como a gestão de perfis de permissão e perfis customizados, respeitando restrições de edição para perfis de sistema sensíveis.
- **RF-USER-04** – O sistema deve disponibilizar uma aba de Conta para exibir e editar os dados da conta logada (nome, identificador e senha).
- **RF-USER-05** – O sistema deve manter o campo de “último acesso” sincronizado com os registros de atividade de login.

### 1.12 Logs de auditoria

- **RF-LOG-01** – O sistema deve registrar ações administrativas relevantes (inclusão, edição, exclusão, alteração de senha e login), incluindo tipo de ação, recurso afetado, identificador do registro, dados anteriores e novos, ator e metadados.
- **RF-LOG-02** – O sistema deve auditar alterações em recursos críticos como campeonatos, esportes, times, jogos, eventos da liga, organizadores de eventos, usuários e configurações de acesso público.
- **RF-LOG-03** – O painel de Logs deve permitir filtrar por tipo de ação, recurso, ator e período, exibindo diferenças relevantes (por exemplo, placar anterior e novo de jogos).

### 1.13 Configurações de acesso público (admin)

- **RF-SETT-01** – O sistema deve disponibilizar uma aba de Configurações no painel administrativo para edição centralizada das configurações de acesso público (bloqueio global, bloqueio por página e mensagem de manutenção), restrita a usuários com permissão de edição.

### 1.14 Experiência e dados em tempo real

- **RF-REAL-01** – O sistema deve atualizar informações de jogos em tempo real para usuários conectados, com reconsulta otimizada para evitar excesso de requisições.
- **RF-REAL-02** – O sistema deve atualizar a visualização da chave do campeonato em tempo real ao detectar alterações em jogos ou estrutura da chave.
- **RF-REAL-03** – O sistema deve registrar e exibir, quando configurado, a presença de visitantes online em áreas selecionadas (por exemplo, página Ao Vivo), com contagem e lista de usuários.
- **RF-REAL-04** – O sistema deve ajustar automaticamente o tema claro/escuro com base na preferência do sistema do usuário.

### 1.15 Navegação e redirecionamentos

- **RF-NAV-01** – O sistema deve manter redirecionamentos de rotas legadas para as novas rotas de páginas públicas.
- **RF-NAV-02** – O sistema deve exibir uma página de erro 404 para rotas não definidas.
- **RF-NAV-03** – O cabeçalho do site deve apresentar links de navegação para as páginas públicas e para o painel administrativo, exibindo o estado de login do usuário.

---

## 2. Requisitos Não Funcionais

### 2.1 Tecnologia e arquitetura

- **RNF-ARCH-01** – O frontend deve ser desenvolvido com framework moderno baseado em componentes, tipagem estática e bundler de alta performance.
- **RNF-ARCH-02** – O backend e a camada de dados devem ser baseados em banco relacional com suporte a autenticação, notificações em tempo real e execução de regras de negócio no banco.
- **RNF-ARCH-03** – O projeto deve seguir uma organização em camadas, separando páginas por rota, componentes reutilizáveis, hooks, regras de domínio e utilitários.

### 2.2 Segurança

- **RNF-SEC-01** – A autenticação deve ser baseada em provedor seguro de identidade, com senhas armazenadas de forma protegida no backend.
- **RNF-SEC-02** – A autorização ao painel administrativo e suas abas deve ser controlada por roles e perfis, com verificação de permissão no backend.
- **RNF-SEC-03** – O sistema deve aplicar cabeçalhos de segurança adequados no frontend para reduzir riscos comuns de segurança.
- **RNF-SEC-04** – O sistema deve registrar logs de auditoria para operações críticas e evitar exposição de dados sensíveis em respostas públicas.

### 2.3 Usabilidade e acessibilidade

- **RNF-UX-01** – O sistema deve fornecer feedback visual consistente (toasts, estados de carregamento e mensagens de erro compreensíveis) nas principais operações.
- **RNF-UX-02** – Os componentes de interface devem seguir boas práticas de acessibilidade, incluindo suporte a tema claro/escuro.
- **RNF-UX-03** – O assistente de configuração da chave do campeonato deve ser estruturado em passos com validação e mensagens de erro por etapa, incluindo mensagens de conflito com sugestões quando possível.
- **RNF-UX-04** – Os formulários devem incluir validação de campos e tratamento de erros de API com mensagens claras para o usuário.

### 2.4 Performance e disponibilidade

- **RNF-PERF-01** – O sistema deve aplicar debounce em operações de atualização em tempo real para reduzir o número de requisições.
- **RNF-PERF-02** – O sistema deve aplicar timeout em operações que resolvem o contexto administrativo para evitar travamento da interface.
- **RNF-PERF-03** – Consultas e assinaturas em tempo real devem ser condicionadas a filtros (por exemplo, campeonato e temporada) para limitar o volume de dados transferido.
- **RNF-PERF-04** – O sistema deve ser distribuído em modo de produção através de processo de build otimizado.

### 2.5 Manutenibilidade e qualidade

- **RNF-MAINT-01** – O projeto deve utilizar tipagem estática em todo o código, com tipos de domínio centralizados.
- **RNF-MAINT-02** – As mudanças de schema de banco de dados e funções devem ser versionadas por meio de migrações.
- **RNF-MAINT-03** – As regras de esporte, critérios de desempate, constantes e enums devem ser centralizados em módulos específicos de domínio.
- **RNF-MAINT-04** – O projeto deve incluir scripts de lint, testes automatizados e preview de build para garantir qualidade contínua.

### 2.6 Compatibilidade e internacionalização

- **RNF-COMP-01** – A interface do sistema deve ser apresentada em português, incluindo labels, mensagens e placeholders.
- **RNF-COMP-02** – A exibição de datas e horários deve utilizar o fuso horário de referência da liga (por exemplo, America/Sao_Paulo).
- **RNF-COMP-03** – O sistema deve ser compatível com navegadores modernos e possuir layout responsivo, adaptando-se a diferentes tamanhos de tela.

### 2.7 Operação e observabilidade

- **RNF-OPS-01** – Erros de API e timeouts devem ser logados no console de desenvolvimento e comunicados ao usuário por meio de toasts ou mensagens apropriadas.
- **RNF-OPS-02** – Recursos de presença e atualização em tempo real devem ser utilizados para oferecer experiência ao vivo sem necessidade de polling intenso.

---

## 3. Resumo por Módulo

| Módulo | Principais requisitos funcionais |
|------|------|
| Autenticação | Login por identificador/senha, primeiro acesso com definição de senha, verificação de acesso ao admin |
| Acesso público | Bloqueio global e por página, mensagem de manutenção, admin sempre acessa |
| Páginas públicas | Home, Ao Vivo, Campeonatos, Agenda, Calendário da Liga |
| Standings | Cálculo automático por jogo, desempate por modalidade, exibição agregada por time |
| Chave (Bracket) | Assistente (grupos + agenda), geração de mata-mata, visualização e histórico por temporada |
| Jogos | CRUD, placar/sets/cartões, controle ao vivo, integração com chave e standings |
| Times/Esportes | CRUD, regras específicas por esporte (pontos/sets, desempate) |
| Campeonatos | Status, temporadas, rollover, seleção no admin e no público |
| Eventos da liga | CRUD, múltiplos organizadores, tipos e datas |
| Admin | Abas com níveis de permissão, perfis e roles, gestão de conta e usuários |
| Logs | Auditoria por recurso e tipo de ação, filtros e exibição de diferenças relevantes |
| Realtime/Tema | Atualização de jogos e chave, visitantes online, tema automático |