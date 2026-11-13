# LAJE-90 — Auditoria inicial de LGPD, acessibilidade e licenças (13/11/2026)

> **Escopo e status:** análise estática por amostragem dos repositórios `jaooduartte/laje` (frontend compartilhado) e `jaooduartte/laje-api` (backend acadêmico AWS). Este relatório registra **evidências observadas**, alterações propostas e pendências; **não é certificação WCAG nem parecer jurídico de conformidade integral à LGPD**. O deployment operacional `laje`/Supabase não foi modificado; alterações propostas em componentes compartilhados só podem afetá-lo **após merge/deploy**, que requer revisão.

## Fontes acadêmicas e prazo

- [Normas do Portfólio](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/documentation/normas.md): LGPD, WCAG 2.1 e uso/licenciamento de terceiros são categorias **Core**; requer documentação no repositório e pôster.
- [Diretrizes Web Apps](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/directions/portfolio-directions-webapp.md): interface navegável, três fluxos, documentação, CI/CD, segurança e observabilidade. Meta de cobertura 75% backend / 25% frontend.
- [Portfólio](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/Portfolio.md) e [calendário](https://github.com/CatolicaSC-Portfolio/The-Portfolio-Playbook/blob/main/calendario.md): entrega, cinco orientações, prova de autoria e pôster PDF até **30/11/2026**; segundo exame até 03/12 se necessário; Demo Day 10, 15 e 16/12.

## 1. LGPD e proteção de dados (análise de código)

| Elemento                           | Evidência observada                                                                                                         | Resultado da auditoria                                                                                                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identificação administrativa       | `laje-api/src/modules/auth/auth.repository.ts` usa `login_identifier`, nome, e-mail, perfil, `password_hash`                | **Dados pessoais existentes**; registrar finalidade, base legal, responsáveis e retenção na política antes da entrega                                                                                                                                                    |
| Autenticação TCC                   | `laje-api/docs/authentication.md`, `auth.controller.ts`, `auth.crypto.ts`                                                   | Access token JWT de curta duração em memória; cookie refresh `HttpOnly`/`Secure` em produção; persistência de hash do token e revogação. Evidência favorável, não prova de ausência de vulnerabilidades                                                                  |
| Auditoria administrativa           | `auth.repository.ts` registra ator em `admin_action_logs`, inclusive `actor_email`, `actor_name`                            | **Confirmar** política de retenção, finalidade de auditoria, acesso e exclusão sob solicitação                                                                                                                                                                           |
| Observabilidade AWS                | `laje-api/docs/observability.md`, `src/common/middlewares/error-handler.middleware.ts`, frontend `src/lib/observability.ts` | Teste real da LAJE-40 confirmou `frontend_error` sem mensagens, stacks, URL ou dados pessoais e retenção de 7 dias nos logs CloudWatch                                                                                                                                   |
| Repositório legado `laje`/Supabase | `src/integrations/supabase/client.ts`; `src/hooks/useOnlineVisitors.ts`                                                     | No **deployment Supabase**, sessão persiste em `localStorage`; há UUID persistente de presença e `user_id` no Realtime. A funcionalidade **não é inicializada no modo AWS**. Avaliar base legal/transparência desse tratamento no ambiente operacional em escopo próprio |
| Políticas publicadas               | Não localizados componentes/rotas com nome de política de privacidade ou termos no inventário de arquivos do frontend       | **Pendente verificação funcional:** validar se existe aviso externo/links não versionados; não publicar texto com controlador ou dados de contato presumidos                                                                                                             |

**Pendências para o responsável (antes de declarar conformidade):** confirmar a entidade controladora e contato para solicitações; inventariar titulares e finalidades (administradores, participantes, usuários do calendário), bases legais adequadas, períodos de retenção no PostgreSQL, destinatários/operadores (AWS, Vercel, provedor de e-mail), transferências internacionais se aplicáveis, procedimento para acesso/correção/exclusão, tratamento de incidentes e avisos de transparência publicados. **Não afirmar que consentimento é sempre a base legal**; ela depende da finalidade concreta. Não incluir e-mails particulares ou segredos na política sem aprovação.

## 2. Acessibilidade WCAG 2.1 (amostra e correções)

| Evidência / critério                                             | Situação inicial                                                                                                       | Alteração LAJE-90                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WCAG 4.1.2, nome de componentes**: links do menu no mobile     | `Header.tsx` esconde o texto com `hidden sm:inline` e não tinha `aria-label` explícito em links e botões indisponíveis | Adicionados `aria-label` para cada item e `aria-label="Navegação principal"` no `nav`; teste automatizado para os links                                          |
| **WCAG 3.3.2 / 4.1.2**: identificação dos campos de autenticação | `LoginPageView.tsx` exibia somente `placeholder`, sem rótulo programático                                              | Adicionados nomes acessíveis ao usuário, senha e confirmação; layout preservado                                                                                  |
| **WCAG 4.1.3 / 3.3.1**: feedback do formulário                   | Erros eram exibidos em parágrafo sem semântica explícita; botão durante envio mostrava apenas ícone                    | Erro com `role="alert"`; botão ocupado recebe nome acessível `Enviando...`                                                                                       |
| Idioma geral                                                     | `index.html` declara `lang="pt-BR"`                                                                                    | Já implementado; identificar mensagens isoladas em inglês para padronizar em revisão futura                                                                      |
| Gráficos e filtros das páginas públicas                          | `HomePageView.tsx` usa Recharts; filtros em vários componentes Radix                                                   | **Não verificado por leitor de tela**; avaliar alternativas textuais, instruções para filtros e navegação por teclado                                            |
| Contraste, foco, zoom e mobile                                   | Existem tokens Tailwind, variantes de tema e estados de foco nos componentes                                           | **Teste manual pendente**: contraste WCAG AA 4,5:1 texto normal/3:1 texto grande, zoom 200%, navegação por Tab/Shift+Tab/Escape, foco visível e leitores de tela |

A correção é **parcial e verificável**. Nenhuma afirmação de conformidade WCAG 2.1 AA integral deve ser feita sem varredura automatizada e testes manuais com teclado/leitor de tela.

## 3. Inventário inicial de licenças npm

Fonte: campos `license` de **`package-lock.json`** da `main` em 13/11/2026. Os totais representam **entradas de pacote no lockfile**, inclusive versões e variantes de plataforma; não produtos licenciados únicos. Um campo de licença declarado não substitui a verificação do texto da licença/distribuição.

| Licença informada (SPDX) | `laje` frontend | `laje-api` backend |
| ------------------------ | --------------: | -----------------: |
| MIT                      |             406 |                178 |
| Apache-2.0               |              24 |                 13 |
| MPL-2.0                  |              24 |                  0 |
| ISC                      |              22 |                  9 |
| BSD-2-Clause             |              10 |                  7 |
| BSD-3-Clause             |               7 |                  2 |
| Apache-2.0 AND MIT       |              11 |                  0 |
| 0BSD                     |               2 |                  0 |
| BlueOak-1.0.0            |               1 |                  1 |
| Python-2.0               |               1 |                  0 |
| CC-BY-4.0                |               1 |                  0 |
| Unlicense                |               1 |                  1 |
| MIT AND ISC              |               1 |                  0 |
| **Total de entradas**    |         **511** |            **211** |

**Casos para conferência de obrigações:** `lightningcss` e builds nativos (MPL-2.0, 24 entradas); `caniuse-lite` (CC-BY-4.0, 1); `argparse` (Python-2.0, 1). Não foi detectada licença GPL/AGPL em metadados desses dois lockfiles, mas isso **não é prova de liberação jurídica** ou ausência de código/assets não inventariados.

**Licença dos códigos próprios:** o `package.json` do frontend não declara `license`; o backend declara `ISC`, mas nenhum `LICENSE` de projeto apareceu no inventário dos dois repositórios. **Decisão pendente do titular dos direitos:** definir se o código deve ter licença explícita e sob quais termos, sem assumir que repo público é automaticamente open-source.

**Assets e marcas ainda pendentes de comprovação de autoria/autorização:** `public/logo.png`, `public/championships/*.svg`, `docs/assets/*.png`, imagens e fontes de bibliotecas. Identificar proprietário, origem, permissão de uso e se requer atribuição; não atribuir licença unilateralmente à marca LAJE. Conferir assets carregados dinamicamente em URLs externas. O levantamento de pacotes **não cobre** esses materiais.

**Como reproduzir as contagens:** em cada repositório, executar `npm ci`, depois inspecionar `package-lock.json > packages[*].license`. Registrar a versão do lockfile no momento da avaliação e revisar licenças sempre que dependências forem atualizadas.

## 4. Critérios de homologação ainda abertos

- [x] Auditoria inicial versionada, com inventário de licenças dos dois lockfiles e evidências de arquitetura.
- [x] Correções pontuais de nome acessível para navegação móvel, campos de login e anúncio de erros; validações automatizadas previstas na PR LAJE-90.
- [ ] Validar na interface pública **teclado, leitor de tela, zoom 200% e contraste**, incluindo dashboards/gráficos e formulários administrativos.
- [ ] Revisar bases legais, aviso de privacidade, contato do controlador e procedimento de direitos dos titulares com a organização; publicar mensagem **somente após validação dos fatos**.
- [ ] Validar política de retenção de banco e logs de auditoria; exigir documentação das alterações para cumprir LGPD.
- [ ] Confirmar titularidade/autorizações das marcas, assets, fotos e texto das licenças que exigem atribuição.
- [ ] Realizar varredura de segredos/credenciais no histórico Git e distribuição, além dos quality gates existentes; este relatório **não equivale** a secret scanning forense.
- [ ] Verificar disponibilidade acadêmica: a decisão atual de manter desligamento AWS automático às 00h e ligar manualmente apenas na prova de autoria/Demo Day **não atende literalmente** à exigência do Playbook de aplicação pública e estável até a divulgação das notas. Registrar exceção formal/solução compatível antes de declarar conformidade de entrega.

**Conclusão:** LAJE-90 **em andamento**. Correções técnicas de baixo risco em PR sem merge/deploy; pendências acima exigem evidência humana ou auditoria ampliada. A entrega só deve declarar conformidade nos pontos efetivamente comprovados.
