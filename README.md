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

Requer Node.js 22 ou superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

As variáveis `VITE_*` são públicas no bundle do navegador e não devem receber segredos. Durante a migração, o frontend ainda usa Supabase em fluxos existentes e pode receber `VITE_API_URL` para integração progressiva com a `laje-api`.

## Quality gate

Antes de abrir ou atualizar uma PR, execute:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Para aplicar a formatação automaticamente nos arquivos alterados em relação à `main`:

```bash
npm run format
```

O repositório possui dívida TypeScript anterior à adoção deste quality gate. O `npm run typecheck` usa `scripts/typecheck-baseline.json` para registrar somente esses diagnósticos legados: qualquer diagnóstico novo ou alteração não registrada reprova o gate. Conforme a dívida for corrigida, o baseline deve apenas diminuir até chegar a zero.

A formatação também é incremental nesta etapa: o Prettier valida os arquivos modificados pela branch/PR sem exigir a reformatação massiva do código legado em uma única entrega.

O GitHub Actions executa o mesmo quality gate automaticamente em `push` e `pull_request`.

## Observação

Este `README` funciona como uma porta de entrada rápida.  
Toda a documentação detalhada e atualizada do projeto deve ser consultada na Wiki.
