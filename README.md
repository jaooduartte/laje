Aplicação web da **Liga das Atléticas de Joinville (LAJE)** para gestão administrativa e exibição pública de campeonatos, jogos, placares ao vivo, classificações, chaveamentos e calendário da liga.

Este repositório mantém o frontend usado em dois deployments independentes:

| Deployment | Backend | Uso |
| --- | --- | --- |
| Projeto Vercel `laje` | Supabase | Produção operacional permanente da LAJE. |
| Projeto Vercel `laje-tcc` | API `laje-api` e PostgreSQL na AWS | Ambiente web documentado para o TCC e o Portfólio. |

O projeto `laje` permanece no Supabase. O deployment `laje-tcc` usa exclusivamente a API AWS e seus próprios dados; não há sincronização automática entre os ambientes.

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

As variáveis `VITE_*` são públicas no bundle do navegador e não devem receber segredos. O mesmo código oferece dois providers por deployment:

- `VITE_BACKEND_PROVIDER=supabase`: usado pelo projeto Vercel `laje`; requer `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- `VITE_BACKEND_PROVIDER=aws`: usado pelo projeto Vercel `laje-tcc`; requer `VITE_API_URL` apontando para a base `/api/v1` da `laje-api`. Nesse modo, o cliente Supabase não é inicializado.

Por compatibilidade, quando o provider não está definido, a presença de `VITE_API_URL` seleciona AWS; sem essa variável, o frontend usa Supabase. Novos deployments devem declarar o provider explicitamente. O projeto `laje` continua usando Supabase como produção operacional; não está previsto migrá-lo nem alterar suas variáveis para AWS. Os ambientes não compartilham uma base de dados nem sincronizam alterações.

O frontend `laje-tcc` usa o proxy Vite descrito na [Wiki](https://github.com/jaooduartte/laje/wiki/Setup-e-Configura%C3%A7%C3%A3o-do-Ambiente) no desenvolvimento local.

Os fluxos já roteados para a API devem usar seus contratos `/api/v1`. A revisão atual encontrou criação e exclusão de atléticas em `AdminTeams.tsx` e gravação da configuração de WO em `AdminSports.tsx` feitas por um cliente fora da API. Esses pontos não comprovam cobertura completa da arquitetura AWS do TCC e precisam ser migrados ou excluídos da demonstração até haver endpoints correspondentes.

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

O GitHub Actions valida pull requests para `main`, pushes na `main` e execução manual, incluindo o build configurado para a API AWS. A Vercel publica somente commits da `main` e não cria previews automáticos de branches, conforme `vercel.json`. Consulte [CI/CD e ambientes Vercel](docs/quality/ci.md) para os controles de publicação.

## Observação

Este `README` funciona como uma porta de entrada rápida.  
Toda a documentação detalhada e atualizada do projeto deve ser consultada na Wiki.
