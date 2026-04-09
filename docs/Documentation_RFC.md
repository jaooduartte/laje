# RFC — LAJE App: Gestão e Divulgação de Campeonatos Universitários

**Engenharia de Software – Católica SC**

---

# Identificação

- **Título do Projeto:**  
  LAJE App

- **Linha de Projeto (Direction):**  
  Web Apps

- **Autor:**  
  João Paulo Duarte Xavier

- **Data da Proposta:**  
  08/04/2026

- **Versão:**  
  1.0

---

# 1. Visão do Produto e Impacto (O Problema)

O LAJE App é uma aplicação web voltada à gestão operacional e à divulgação pública de campeonatos universitários organizados pela Liga das Atléticas de Joinville (LAJE). A proposta do projeto consiste em centralizar, em um único sistema, a administração de jogos, classificações, chaveamentos, agenda e eventos institucionais, além de disponibilizar essas informações ao público de forma estruturada e atualizada em tempo quase real.

Atualmente, o projeto já possui base funcional implementada no repositório, bem como documentação técnica organizada em `README`, diretório `docs/` e Wiki do GitHub. Esta RFC tem como objetivo consolidar o entendimento do problema, justificar a solução proposta e alinhar o projeto às diretrizes da linha de Web Apps do Portfólio.

---

## 1.1 Contexto e Problema

A organização de campeonatos universitários envolve múltiplos processos que precisam ocorrer de forma coordenada, tais como:

- definição de campeonatos e edições (ano);
- cadastro de modalidades e participantes;
- criação e gestão de partidas;
- operação ao vivo com atualização de placares;
- cálculo de classificação;
- geração e acompanhamento de chaveamentos;
- divulgação pública de agenda, resultados e eventos institucionais.

Quando esses processos são executados de forma fragmentada — por meio de planilhas, mensagens informais, anotações manuais e múltiplas ferramentas desconectadas — surgem problemas recorrentes relacionados à consistência, rastreabilidade e velocidade de atualização.

No contexto da LAJE, os principais problemas identificados são:

1. **Fragmentação da informação**  
   Dados de campeonatos, jogos, classificação e calendário ficam distribuídos em diferentes fontes, dificultando a gestão centralizada.

2. **Atualização tardia das informações públicas**  
   A ausência de um fluxo integrado leva à dependência de atualizações manuais, prejudicando o acompanhamento em tempo real.

3. **Dependência de processos manuais**  
   Operações como atualização de placar, recomputação de classificação e ajustes de agenda demandam retrabalho e aumentam o risco de erro.

4. **Baixa rastreabilidade administrativa**  
   Não há controle claro sobre quem realizou alterações, quando elas ocorreram e qual era o estado anterior dos dados.

5. **Desalinhamento entre operação interna e informação pública**  
   A ausência de uma fonte única de verdade pode gerar inconsistência entre o que a organização registra e o que o público visualiza.

Soluções existentes no mercado tendem a resolver partes do problema, como agenda, chaveamento ou divulgação, mas raramente oferecem integração completa entre operação administrativa, regras de domínio e experiência pública.

O LAJE App propõe uma solução integrada, com base única de dados e fluxos automatizados que conectam operação interna e visualização pública.

**Estado atual do sistema:**
- modelagem de campeonatos, jogos, classificação e chaveamento implementada;
- autenticação administrativa com permissões por perfil;
- logs de ações administrativas;
- atualização em tempo real em fluxos relevantes.

**Direcionamento futuro:**
- validação estruturada com usuários reais;
- implementação de pipeline CI/CD;
- adoção de monitoramento e observabilidade;
- ampliação da cobertura de testes conforme diretrizes do Portfólio.

---

## 1.2 Origem da Demanda e Evidências

Este projeto está sendo estruturado como uma solução voltada à comunidade LAJE e ao ecossistema universitário relacionado, caracterizando uma demanda comunitária real, ainda que nesta etapa não exista uma formalização documental de parceiro externo específico anexada à RFC.

### Origem da demanda

A demanda nasce da observação de um cenário recorrente em ligas e campeonatos universitários: a operação esportiva e a comunicação pública dependem de organização manual, ferramentas dispersas e processos pouco integrados. No caso da LAJE, a própria estrutura do domínio já exige:

- gestão de campeonatos com temporadas e status;
- cadastro e manutenção de jogos;
- operação ao vivo com atualização de placar;
- cálculo automático de classificação;
- geração e acompanhamento de chaveamentos;
- calendário institucional da liga;
- controle de acesso administrativo com rastreabilidade.

Esse conjunto de necessidades não caracteriza um exercício técnico abstrato, mas sim um problema operacional concreto, com impacto direto sobre organizadores, operadores, atléticas participantes e público.

### Evidências atuais

Na presente etapa, a evidência adotada para sustentar a demanda é a **dor operacional observada no domínio**, refletida nos artefatos já produzidos e no próprio recorte funcional implementado no projeto. Entre os elementos que reforçam essa evidência estão:

- a documentação funcional já consolidada no repositório;
- a Wiki estruturada por arquitetura, fluxos, regras, funcionalidades e modelagem de dados;
- a presença de fluxos de negócio completos no sistema, como autenticação administrativa, controle ao vivo, classificação automática, chaveamento e calendário da liga;
- a existência de modelagem e regras específicas para o contexto competitivo da LAJE.


Essas evidências demonstram aderência a um problema real do domínio, embora **ainda não substituam uma validação formal com usuários finais**.

### Evidência empírica inicial (interações reais — 2026)

Além da análise do domínio e da modelagem funcional já implementada, foram observadas interações reais em grupos da LAJE (ano de 2026) envolvendo membros da organização e participantes da liga durante o uso inicial e apresentação do sistema.

Alguns feedbacks espontâneos registrados incluem:

> "fui tudo q eu pedi uma tabela decente"
> "ficou muito bom"
> "Caraca top"

Essas manifestações indicam percepção imediata de valor na organização e visualização das informações, especialmente em relação a tabelas, classificação e estruturação dos dados.

Também houve validação funcional direta de necessidades do sistema:

> "tem como fazer pontuação?"

Esse tipo de questionamento reforça que funcionalidades centrais do domínio (como pontuação e classificação) são esperadas pelos usuários e fazem parte do problema real.

Além disso, foi observada percepção de potencial de expansão do produto:

> "vamos vender isso pra outras ligas"

Como ponto de melhoria inicial identificado:

> "dps me ensinem a usar"

Esse feedback evidencia necessidade de evolução em usabilidade, onboarding ou documentação para operadores.

Embora esses registros não constituam ainda uma validação formal estruturada, eles funcionam como **evidência empírica inicial de aderência ao problema e aceitação da solução**, complementando a análise do domínio apresentada nesta RFC.

### Evidências futuras planejadas

Como evolução da RFC e do projeto, será realizada uma etapa posterior de validação com usuários experimentando a versão de testes do app. Essa próxima fase deverá coletar evidências como:

- feedback de organizadores e operadores sobre os fluxos administrativos;
- percepção de torcedores e comunidade acadêmica sobre clareza, navegabilidade e atualização das páginas públicas;
- observações de uso em cenários reais ou simulados;
- oportunidades de melhoria priorizadas a partir de teste com usuários.

Portanto, nesta RFC, a origem da demanda é assumida como **demanda comunitária da LAJE**, baseada em dor operacional observada, enquanto a validação empírica com usuários permanece registrada como **evidência a coletar nas próximas entregas**.

---

## 1.3 Análise de Soluções Existentes (Benchmark)

Para avaliar o espaço de solução, foram analisadas plataformas amplamente utilizadas que oferecem recursos relacionados à gestão de torneios, ligas, agenda, chaveamento e acompanhamento público. A comparação abaixo ajuda a identificar o que já existe no mercado e qual lacuna o LAJE App pretende atender de forma mais aderente ao seu nicho.

| Solução | Link | Público-alvo | Funcionalidades principais | Limitações em relação ao nicho LAJE |
|---|---|---|---|---|
| SportsEngine Tourney | [tourneymachine.com](https://www.tourneymachine.com/) | Organizadores de torneios esportivos, equipes e famílias | Agenda, brackets, standings, resultados e app móvel para acompanhamento | Foco amplo em torneios esportivos; não é orientado especificamente ao contexto institucional da LAJE nem à gestão integrada de calendário da liga, permissões administrativas customizadas e regras específicas do domínio universitário local |
| LeagueApps Tournaments | [leagueapps.com/tournaments](https://leagueapps.com/tournaments/) | Organizações esportivas, clubes e torneios juvenis | Inscrição, comunicação, agenda, brackets, standings, pagamentos e relatórios | Tem forte foco comercial e operacional para organizações esportivas generalistas; não é especializado na governança, regras e fluxos públicos específicos de uma liga universitária como a LAJE |
| Toornament | [developer.toornament.com](https://developer.toornament.com/) | Organizadores de competições, sobretudo torneios digitais e ecossistemas competitivos | Gestão de torneios, API, projetos, inscrições, check-in, controle de participantes e estrutura de competição | É bastante forte em competição e estruturação, mas sua aderência ao cenário institucional esportivo universitário é indireta; não contempla de forma nativa calendário institucional, operação local da liga e necessidades administrativas específicas do domínio |
| instantLIGA | [instantliga.com](https://instantliga.com/) | Clubes, escolas, organizadores e grupos que precisam criar torneios rapidamente | Criação de torneios, agenda, standings, brackets e compartilhamento de resultados | Resolve bem cenários genéricos e rápidos, mas com menor profundidade de personalização para permissões, auditoria, regras por campeonato e integração da experiência administrativa e pública em um contexto institucional próprio |

### Comparação

| Solução | Pontos Fortes | Limitações |
|---|---|---|
| SportsEngine Tourney | Forte operação de torneios, boa experiência de agenda e acompanhamento | Menor aderência ao recorte institucional e universitário da LAJE |
| LeagueApps | Ecossistema robusto de comunicação, agenda e administração esportiva | Orientação mais comercial e generalista, com menos foco no nicho local |
| Toornament | Estrutura competitiva madura, API e controle detalhado de torneios | Forte associação com cenários competitivos genéricos e digitais, não com a realidade operacional da LAJE |
| instantLIGA | Facilidade de uso e velocidade para estruturar torneios | Menor profundidade para governança, auditoria e customização de regras e fluxos institucionais |

### Diferencial do projeto

O diferencial do LAJE App não está em reinventar funcionalidades básicas de torneios, mas em **especializar a solução para o contexto da LAJE**, unificando em um mesmo produto:

- operação administrativa com perfis, permissões e auditoria;
- controle ao vivo e atualização pública em tempo real;
- classificação e chaveamento alinhados ao contexto competitivo da liga;
- calendário institucional que vai além das partidas;
- base única de dados para reduzir divergência entre operação interna e experiência pública.

Em vez de atender um mercado genérico de torneios, o projeto busca atender um nicho específico com regras, fluxos e necessidades próprias. Isso justifica a criação de uma solução dedicada, desde que sua aderência ao problema real continue sendo validada com usuários ao longo das próximas entregas.

---

## 1.4 Público-Alvo

O público-alvo do LAJE App está organizado em camadas, pois o sistema atende tanto operação interna quanto consumo público de informação.

### Público primário

**Administradores e organizadores da LAJE**  
Responsáveis pela gestão dos campeonatos, configurações do sistema, usuários, calendário e manutenção da base de dados operacionais. Espera-se perfil com conhecimento operacional do evento, mas não necessariamente conhecimento técnico avançado de software.

**Operadores de mesa e apoio à competição**  
Usuários que atuam diretamente no controle ao vivo das partidas, atualizando placar, status, sets e demais informações de jogo. Necessitam de interface objetiva, rápida e segura, adequada ao ritmo operacional de uma partida em andamento.

### Público secundário

**Atléticas, equipes participantes e representantes estudantis**  
Utilizam o sistema para acompanhar agenda, resultados, classificação, chaveamentos e eventos relacionados à liga. Seu contexto de uso tende a ser recorrente durante campeonatos e eventos institucionais.

**Torcedores e comunidade acadêmica**  
Usuários interessados em acompanhar jogos, standings, chaveamentos e calendário da liga por meio das páginas públicas. Esse grupo tende a valorizar atualização rápida, navegação clara e organização visual da informação.

### Características do uso

- o sistema deve ser acessível em dispositivos desktop e mobile;
- a área pública precisa ser compreensível para usuários sem treinamento;
- a área administrativa deve privilegiar confiabilidade operacional e clareza de estado;
- a solução precisa equilibrar profundidade funcional para a organização com simplicidade de consulta para o público.

---

## 1.5 Objetivos do Projeto

### Objetivo Geral

Desenvolver uma aplicação web capaz de centralizar a gestão operacional e a divulgação pública dos campeonatos e eventos da LAJE, reduzindo dependência de processos manuais e oferecendo uma base única, confiável e evolutiva para administração, acompanhamento em tempo real e consulta pública.

### Objetivos Específicos

1. Administrar campeonatos, modalidades, times, jogos e eventos da liga em uma estrutura integrada e organizada.
2. Operar partidas ao vivo com atualização em tempo real para público e equipe administrativa.
3. Automatizar a classificação e a progressão de chaveamento com base no estado persistido das partidas e nas regras configuradas.
4. Disponibilizar uma experiência pública clara para consulta de agenda, campeonatos, resultados, classificações, chaveamentos e calendário institucional.
5. Garantir controle de acesso administrativo, rastreabilidade das alterações e base técnica para evolução contínua do produto conforme as diretrizes do Portfólio.

---

## 1.6 Métricas de Sucesso (KPIs)

As métricas de sucesso do projeto devem combinar impacto funcional, experiência do usuário e maturidade técnica. Nesta etapa, parte dessas métricas já pode ser usada como referência de construção; outras dependem de coleta futura e evolução da infraestrutura do projeto.

### KPIs de produto e operação

1. **Cobertura dos fluxos de negócio principais**  
   O sistema deve contemplar ao menos três fluxos de negócio completos e utilizáveis, com prioridade para autenticação administrativa, operação de jogos ao vivo e atualização de classificação/chaveamento.

2. **Redução de retrabalho operacional**  
   Em validações futuras com usuários, espera-se evidenciar redução perceptível de esforço manual na gestão de jogos, resultados, classificação e agenda.

3. **Atualização pública em tempo quase real**  
   Alterações realizadas no contexto operacional devem refletir nas páginas públicas sem necessidade de recarregamento manual, dentro de uma janela compatível com uso real do sistema.

4. **Centralização da informação**  
   O projeto deve demonstrar capacidade de concentrar em um único ambiente os dados principais de campeonatos, jogos, standings, chaveamentos e calendário institucional.

### KPIs de entrega técnica

5. **Disponibilidade de ambiente acessível publicamente**  
   Como meta de aderência à linha de Web Apps, o sistema deve possuir ambiente público funcional e acessível nas próximas entregas, com link estável para demonstração.

6. **Evolução de pipeline e qualidade contínua**  
   O projeto deverá incorporar pipeline CI/CD, análise estática de código e segurança, e práticas de integração contínua conforme exigido pelo Playbook.

7. **Evolução de testes alinhada ao Portfólio**  
   A meta futura é amadurecer a estratégia de testes em direção aos percentuais esperados pela linha de Web Apps, com expansão progressiva da cobertura unitária e fortalecimento da abordagem orientada por testes.

8. **Observabilidade e monitoramento**  
   Como evolução planejada, o projeto deverá incorporar ferramenta de monitoramento e observabilidade para apoiar diagnóstico, estabilidade e análise de comportamento em produção.

### Leitura crítica dos KPIs

Nem todos os indicadores acima estão plenamente comprovados nesta fase. Alguns já podem ser avaliados pela base funcional e documental existente; outros dependem de deploy público definitivo, instrumentação técnica e coleta estruturada de feedback com usuários reais. Por isso, esta RFC registra os KPIs em dois horizontes:

- **estado atual:** base funcional, documentação consolidada e fluxos centrais implementados;
- **direcionamento futuro:** validação com usuários, CI/CD, observabilidade, análise estática e evolução formal da cobertura de testes.

---

## Nota de Situação da RFC nesta Etapa

O projeto já possui base funcional implementada e documentação suficiente para sustentar a formulação inicial da RFC. Entretanto, parte das evidências de validação com usuários ainda será coletada na próxima etapa, por meio de testes com a versão de demonstração do sistema. Além disso, requisitos técnicos adicionais recomendados ou obrigatórios pelo Playbook — como maturidade de CI/CD, observabilidade, análise estática e metas formais de testes — estão registrados nesta documentação como evolução planejada para as próximas entregas, e não como itens já concluídos.
