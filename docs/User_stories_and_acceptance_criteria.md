# Backlog – Aplicação Laje (Épicos, Histórias e Critérios de Aceite)

## Épico 1 – Autenticação e Acesso ao Painel Admin

### US-AUTH-01 – Login administrativo

**Como** administrador  
**Quero** acessar o sistema usando meu identificador (e-mail ou usuário) e senha  
**Para que** eu possa entrar no painel administrativo e gerenciar campeonatos e jogos  

**Critérios de aceite**

- Deve existir uma tela de login com campos de identificador e senha.  
- Ao informar credenciais válidas, o usuário deve ser direcionado ao painel admin.  
- Ao informar credenciais inválidas, o sistema deve exibir mensagem de erro clara, sem revelar detalhes de segurança.  
- Após login bem-sucedido, o sistema deve registrar um evento de acesso para auditoria.  

***

### US-AUTH-02 – Primeiro acesso com definição de senha

**Como** administrador recém-cadastrado  
**Quero** definir minha senha no primeiro acesso  
**Para que** eu possa ativar minha conta com segurança  

**Critérios de aceite**

- Ao informar identificador de usuário cuja senha esteja pendente, o sistema deve solicitar definição de nova senha e confirmação.  
- A senha deve ser validada (mínimo de caracteres, confirmação igual, etc.).  
- Após definir a senha com sucesso, o usuário deve ser autenticado automaticamente e redirecionado ao painel admin.  
- O status da senha do usuário deve ser atualizado para ativo.  

***

### US-AUTH-03 – Logout

**Como** administrador autenticado  
**Quero** sair da aplicação  
**Para que** minha sessão não permaneça ativa em dispositivos compartilhados  

**Critérios de aceite**

- Deve existir uma ação visível de logout no cabeçalho ou menu do painel admin.  
- Ao acionar o logout, a sessão deve ser invalidada e dados sensíveis de sessão limpos.  
- Após o logout, o usuário deve ser redirecionado para a página de login.  

***

### US-ADMIN-01 – Restrição de acesso ao painel admin

**Como** visitante não autenticado  
**Quero** ser impedido de acessar o painel admin  
**Para que** apenas usuários autorizados possam gerenciar os dados do sistema  

**Critérios de aceite**

- Acessos diretos à rota do painel admin sem autenticação devem ser redirecionados para a tela de login.  
- Usuários autenticados sem permissão de admin devem ser bloqueados e receber mensagem de acesso negado ou redirecionamento apropriado.  

***

## Épico 2 – Controle de Acesso Público e Páginas Públicas

### US-PUB-01 – Configuração de manutenção por página

**Como** administrador  
**Quero** bloquear o acesso público a determinadas páginas e configurar uma mensagem de manutenção  
**Para que** eu possa realizar ajustes sem impactar a experiência dos visitantes  

**Critérios de aceite**

- Deve existir uma interface no admin para configurar bloqueio global e por página (Home, Ao Vivo, Campeonatos, Agenda, Calendário da Liga).  
- Quando uma página estiver bloqueada, visitantes não autenticados devem ver uma mensagem de manutenção customizável.  
- Usuários admin autenticados devem continuar acessando normalmente as páginas bloqueadas.  

***

### US-PUB-02 – Navegação pública com indicação de manutenção

**Como** visitante  
**Quero** ver claramente quais páginas estão em manutenção  
**Para que** eu entenda por que não consigo acessá-las  

**Critérios de aceite**

- Na Home, links para páginas bloqueadas devem aparecer desabilitados com indicação visual de “em manutenção”.  
- Para administradores autenticados, os mesmos links devem aparecer ativos.  

***

### US-PUB-03 – Página Ao Vivo

**Como** torcedor  
**Quero** acompanhar os jogos ao vivo, em breve e finalizados em um único lugar  
**Para que** eu possa acompanhar resultados e andamento dos campeonatos  

**Critérios de aceite**

- A página Ao Vivo deve listar jogos com status ao vivo, em breve e finalizados, identificando claramente cada status.  
- Deve ser possível filtrar por campeonato, esporte e naipe.  
- Quando aplicável, deve ser possível visualizar a tabela de classificação e a chave associadas ao campeonato selecionado.  

***

### US-PUB-04 – Página Campeonatos

**Como** torcedor  
**Quero** visualizar classificação e chave dos campeonatos  
**Para que** eu entenda a situação dos times em cada temporada  

**Critérios de aceite**

- Deve ser possível selecionar campeonato e temporada.  
- Deve ser exibida tabela de classificação por esporte, naipe e divisão.  
- Deve ser exibida a chave do campeonato (fase de grupos e mata-mata) com times, jogos e vencedores.  

***

### US-PUB-05 – Página Agenda de Jogos

**Como** torcedor  
**Quero** ver uma agenda de jogos por data  
**Para que** eu possa me planejar para assistir às partidas  

**Critérios de aceite**

- A página Agenda deve listar jogos por data, com campeonato, esporte, naipe, local, quadra, horário e placar (quando houver).  
- Deve ser possível filtrar por campeonato, esporte e naipe.  

***

### US-PUB-06 – Calendário da Liga

**Como** participante ou torcedor da liga  
**Quero** ver um calendário de eventos da liga  
**Para que** eu acompanhe festivais, campeonatos e outros eventos relevantes  

**Critérios de aceite**

- A página Calendário da Liga deve listar eventos com tipo, organizador, times organizadores (quando houver), data, local e nome.  
- Os eventos devem estar ordenados por data.  

***

## Épico 3 – Gestão de Campeonatos, Jogos e Standings

### US-CHAMP-01 – Cadastro de campeonatos

**Como** administrador  
**Quero** cadastrar campeonatos com código, nome, status e temporada  
**Para que** eu possa organizar diferentes edições ao longo dos anos  

**Critérios de aceite**

- Deve ser possível criar, editar e encerrar campeonatos.  
- Cada campeonato deve ter código único, nome, status, temporada atual, configuração de divisões e local padrão.  
- Deve ser possível trocar o status do campeonato (planejamento, em breve, em andamento, encerrado).  

***

### US-MATCH-01 – CRUD de jogos

**Como** administrador de campeonatos  
**Quero** cadastrar e manter jogos com seus detalhes  
**Para que** a agenda e os resultados sejam gerenciados de forma organizada  

**Critérios de aceite**

- Deve ser possível criar, editar e excluir jogos com campeonato, temporada, esporte, divisão, naipe, times, local, quadra, data/hora de início e fim e status.  
- Ao excluir jogos, as tabelas de classificação relacionadas devem ser recalculadas.  
- Ao gerar agenda automaticamente, o sistema deve validar conflitos de horário/local/quadra e informar ao usuário.  

***

### US-MATCH-02 – Placar e regras por esporte

**Como** operador de mesa ou administrador  
**Quero** registrar o placar dos jogos conforme a regra do esporte  
**Para que** o resultado reflita corretamente a modalidade jogada  

**Critérios de aceite**

- Para esportes definidos por pontos, o sistema deve permitir registrar gols/pontos por time.  
- Para esportes por sets, o sistema deve permitir cadastrar sets e seus resultados.  
- Para esportes que utilizam cartões, o sistema deve permitir registrar cartões amarelos e vermelhos por time.  

***

### US-MATCH-03 – Controle ao vivo de jogo

**Como** operador de mesa  
**Quero** atualizar placar, sets e cartões em tempo real  
**Para que** o público acompanhe a partida ao vivo com informações atualizadas  

**Critérios de aceite**

- Usuários com permissão adequada devem conseguir iniciar um jogo (status ao vivo), atualizar placar/sets/cartões e encerrar o jogo (status finalizado).  
- Alterações devem ser refletidas em tempo quase real na página pública de jogos ao vivo.  
- Usuários sem permissão de edição na aba de controle ao vivo não devem conseguir alterar o placar.  

***

### US-STAND-01 – Cálculo automático de standings

**Como** organizador de campeonato  
**Quero** que a tabela de classificação seja atualizada automaticamente  
**Para que** eu não precise recalcular manualmente os resultados de cada rodada  

**Critérios de aceite**

- Ao concluir um jogo, o sistema deve atualizar estatísticas por time (vitórias, empates, derrotas, gols pró, gols contra, saldo, pontos e cartões quando aplicável).  
- O sistema deve aplicar regras de pontuação específicas por modalidade (pontuação por vitória, empate e derrota).  

***

### US-STAND-02 – Regras de desempate por modalidade

**Como** organizador de campeonato  
**Quero** configurar regras de desempate por modalidade  
**Para que** a classificação reflita corretamente as regras da competição  

**Critérios de aceite**

- Deve ser possível definir ordem de critérios de desempate (por exemplo: pontos, saldo de gols, confronto direto, cartões).  
- A tabela de classificação deve respeitar a ordem de critérios configurada para cada modalidade.  

***

## Épico 4 – Chave do Campeonato (Bracket)

### US-BRACK-01 – Wizard da fase de grupos

**Como** organizador de campeonato  
**Quero** configurar a chave do campeonato por meio de um assistente em passos  
**Para que** eu organize grupos, participantes e agenda de forma guiada  

**Critérios de aceite**

- O assistente deve contemplar passos como: participantes, modalidades, naipes, configuração de grupos, distribuição de times, agenda e revisão.  
- Deve haver validações em cada passo com mensagens claras de erro e, quando possível, sugestões de ajuste.  
- Ao concluir o assistente, grupos, jogos da fase de grupos e agenda devem ser gerados conforme as configurações definidas.  

***

### US-BRACK-02 – Distribuição manual de times em grupos

**Como** organizador de campeonato  
**Quero** ajustar manualmente os times nos grupos  
**Para que** eu possa equilibrar os confrontos e atender critérios esportivos  

**Critérios de aceite**

- Deve ser possível arrastar ou selecionar times para realocá-los entre grupos antes da confirmação final.  
- Alterações de distribuição devem ser refletidas na geração de jogos da fase de grupos.  

***

### US-BRACK-03 – Geração e visualização do mata-mata

**Como** torcedor  
**Quero** visualizar a fase de mata-mata do campeonato  
**Para que** eu entenda o caminho dos times até a final  

**Critérios de aceite**

- O sistema deve gerar automaticamente confrontos de mata-mata a partir da classificação da fase de grupos e regras definidas.  
- Deve haver opção de configurar jogo de terceiro lugar ou outras regras de definição de terceiro.  
- A visualização da chave deve apresentar em um único fluxo a fase de grupos e o mata-mata, com histórico por temporada.  
- Ao atualizar resultados de jogos, o avanço de times nas fases seguintes deve ser recalculado automaticamente.  

***

## Épico 5 – Cadastros de Domínio (Times, Esportes, Eventos e Usuários)

### US-TEAM-01 – Cadastro de times

**Como** administrador  
**Quero** cadastrar times com suas informações básicas  
**Para que** eles possam ser associados a jogos e campeonatos  

**Critérios de aceite**

- Deve ser possível criar, editar e excluir times com nome, cidade e divisão.  
- Times cadastrados devem poder ser selecionados na criação de jogos e eventos da liga.  

***

### US-SPORT-01 – Cadastro e regras de esportes

**Como** administrador  
**Quero** configurar esportes e suas regras  
**Para que** o sistema se adapte às diferentes modalidades praticadas  

**Critérios de aceite**

- Deve ser possível cadastrar esportes e configurá-los com modo de naipe, forma de resultado (pontos ou sets), regras de desempate, pontuação por resultado, suporte a cartões e duração padrão de partida.  
- As regras configuradas devem ser usadas no cálculo de standings, controle ao vivo e telas públicas.  

***

### US-EVENT-01 – Cadastro de eventos da liga

**Como** organizador da liga  
**Quero** cadastrar eventos da liga  
**Para que** o público tenha visibilidade da agenda da liga além dos jogos  

**Critérios de aceite**

- Deve ser possível criar, editar e excluir eventos com nome, tipo, tipo de organizador, data e local.  
- Deve ser possível associar um ou mais times como organizadores do evento, inclusive times usados apenas em eventos.  
- Os eventos devem aparecer no Calendário da Liga em ordem cronológica.  

***

### US-USER-01 – Gestão de usuários admin

**Como** administrador do sistema  
**Quero** gerenciar usuários administrativos, perfis e roles  
**Para que** eu controle quem pode acessar e alterar cada área do painel  

**Critérios de aceite**

- Deve ser possível listar usuários com nome, e-mail, identificador de login, perfil, status da senha e último acesso.  
- Deve ser possível criar usuários definindo identificador, nome, senha opcional, perfil e role.  
- Usuários com senha pendente devem concluir a definição de senha no primeiro acesso.  
- Deve ser possível editar dados de usuário e perfis customizados, respeitando restrições de perfis críticos (por exemplo, admin).  

***

## Épico 6 – Logs, Realtime, Tema e Configurações

### US-LOG-01 – Consulta a logs de auditoria

**Como** administrador  
**Quero** consultar logs de ações administrativas  
**Para que** eu tenha rastreabilidade de alterações e acessos sensíveis  

**Critérios de aceite**

- Deve existir uma aba de Logs no painel admin.  
- Deve ser possível filtrar logs por tipo de ação, recurso, usuário (ator) e período.  
- Para jogos, deve ser possível visualizar o antes e depois do placar e status, quando alterados.  

***

### US-REAL-01 – Atualização em tempo real de jogos

**Como** torcedor  
**Quero** ver o placar dos jogos atualizado em tempo quase real  
**Para que** eu acompanhe os jogos ao vivo sem recarregar a página  

**Critérios de aceite**

- Alterações de placar, sets e status feitas no painel admin devem ser refletidas na página pública em tempo quase real.  
- O sistema deve aplicar mecanismos para evitar excesso de requisições (por exemplo, debounce).  

***

### US-REAL-02 – Presença online e experiência ao vivo

**Como** administrador ou organizador  
**Quero** visualizar quantos usuários estão online em determinadas páginas  
**Para que** eu entenda o engajamento das transmissões e páginas ao vivo  

**Critérios de aceite**

- Deve ser possível exibir contagem de visitantes online em áreas configuradas (por exemplo, página Ao Vivo).  
- Quando pertinente, deve ser possível listar identificadores de visitantes online, respeitando regras de privacidade.  

***

### US-THEME-01 – Tema automático (claro/escuro)

**Como** usuário do site  
**Quero** que o tema da interface se adapte automaticamente ao meu sistema  
**Para que** eu tenha uma experiência visual consistente com minhas preferências  

**Critérios de aceite**

- O sistema deve detectar a preferência de tema do sistema operacional (claro/escuro).  
- A interface deve aplicar automaticamente o tema correspondente, permitindo também que o usuário altere manualmente, se configurado.  

***

### US-CONFIG-01 – Configuração centralizada de acesso público

**Como** administrador  
**Quero** gerenciar configurações de acesso público em uma única tela  
**Para que** eu ajuste rapidamente o que fica disponível para visitantes  

**Critérios de aceite**

- Deve haver uma aba de Configurações no painel admin com controles de bloqueio global, bloqueio por página e mensagem padrão de manutenção.  
- Apenas usuários com permissão de edição nessa aba devem conseguir salvar alterações.  

***
