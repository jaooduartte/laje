Aplicação web da **Liga das Atléticas de Joinville (LAJE)** para gestão administrativa e exibição pública de campeonatos, jogos, placares ao vivo, classificações, chaveamentos e calendário da liga.

## Documentação

A documentação oficial do projeto está centralizada na Wiki do repositório:

👉 **[Acessar Wiki do projeto](https://github.com/jaooduartte/laje/wiki)**

Na Wiki estão documentados:

- visão geral do sistema
- arquitetura
- modelagem de dados
- fluxos principais
- funcionalidades
- requisitos
- histórias de usuário
- regras oficiais
- setup e configuração do ambiente

## Objetivo

O sistema foi desenvolvido para apoiar a operação da LAJE, concentrando em um único ambiente:

- gestão de campeonatos e temporadas
- organização de modalidades, naipes e divisões
- cadastro e acompanhamento de jogos
- controle ao vivo
- classificação automática
- chaveamento
- agenda e calendário da liga
- administração do sistema

## Desenvolvimento local

Use Node.js 22 para manter o mesmo runtime adotado pelo CI.

```bash
npm ci
cp .env.example .env
npm run dev
```

As variáveis públicas do frontend ficam documentadas em `.env.example` e são lidas de forma centralizada em `src/config/environment.ts`. Durante a migração, `VITE_API_URL` é opcional; as variáveis públicas do Supabase continuam obrigatórias enquanto o frontend ainda utiliza esses serviços.

Principais comandos de qualidade:

```bash
npm run typecheck
npm run lint
npm run format
npm run format:check
npm test
npm run build
```

`npm run format:check` valida com Prettier apenas os arquivos alterados em relação à `main`, permitindo adoção incremental da padronização sem gerar uma reformatação massiva do código legado. O workflow `.github/workflows/ci.yml` executa automaticamente typecheck, lint, formatação, testes e build em pushes e pull requests.

## Observação

Este `README` funciona como uma porta de entrada rápida.  
Toda a documentação detalhada e atualizada do projeto deve ser consultada na Wiki.
