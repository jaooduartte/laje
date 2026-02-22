# LAJE App

Aplicação web da **Liga das Atléticas de Joinville (LAJE)** para gestão e exibição de campeonatos, jogos, placares ao vivo e classificação.

## Visão geral

O projeto contempla três campeonatos fixos:

- **Copa Laje de Verão (CLV)**: sem separação por divisão (Divisão Principal e Divisão de Acesso competem juntas).
- **Copa Laje Society**: com divisão.
- **Interlaje**: com divisão.

Regras funcionais principais já implementadas:

- tema claro com paleta vermelha;
- status de campeonato: `Em planejamento`, `Em breve`, `Em andamento`, `Encerrado`;
- suporte a naipe em jogos: `Masculino`, `Feminino`, `Misto`;
- configuração por modalidade no campeonato:
  - tipo de naipe (`Mista` ou `Masculino e Feminino`);
  - pontuação (`Vitória`, `Empate`, `Derrota`);
- placar ao vivo no admin com auto-salvamento (debounce de 500ms);
- cálculo automático de classificação ao finalizar partidas;
- local padrão para novos jogos do CLV (replicação opcional).

## Telas da aplicação

- `/` -> **Ao Vivo** (campeonato em destaque por status).
- `/campeonatos` -> visão detalhada por campeonato:
  - jogos em andamento;
  - próximo jogo;
  - classificação;
  - jogos anteriores (com filtro por atlética e ano).
- `/agenda` -> agenda de jogos por campeonato/modalidade/time (e divisão quando aplicável).
- `/login` -> autenticação administrativa.
- `/admin` -> gestão de jogos, controle ao vivo, atléticas e modalidades.

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui + Radix UI
- Supabase (Auth, Postgres, Realtime, RLS)
- React Query
- Vitest + Testing Library

## Requisitos

- Node.js 18+
- npm 9+
- Projeto Supabase configurado

## Configuração de ambiente

Crie o arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_PROJECT_ID="SEU_PROJECT_ID"
VITE_SUPABASE_URL="https://SEU_PROJECT_ID.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="SUA_PUBLISHABLE_KEY"
VITE_SUPABASE_ANON_KEY_LEGACY="SUA_ANON_KEY_LEGACY"
DATABASE_URL="postgresql://postgres:SUA_SENHA@db.SEU_PROJECT_ID.supabase.co:5432/postgres"
```

Observações:

- no frontend, os campos usados diretamente são `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_ANON_KEY_LEGACY` e `DATABASE_URL` ficam para suporte de infraestrutura/scripts;
- **não versionar** o `.env` no Git.

## Configuração do Supabase

Arquivo `supabase/config.toml`:

```toml
project_id = "cugqidtapnqvonbdbbdf"
```

Para aplicar migrations com Supabase CLI:

```bash
supabase link --project-ref cugqidtapnqvonbdbbdf
supabase db push
```

## Banco de dados (resumo)

Principais entidades:

- `sports` (modalidades globais)
- `teams` (atléticas + cidade + divisão)
- `championships` (campeonatos fixos + status + local padrão)
- `championship_sports` (vínculo campeonato/modalidade + naipe_mode + pontuação)
- `matches` (jogos com campeonato, modalidade, naipe, divisão, status e placar)
- `standings` (classificação consolidada)
- `user_roles` (papéis administrativos)

Funções/trigger relevantes:

- `public.validate_match_conflict()` -> valida regras de confronto e conflitos de horário/local.
- `public.update_standings_on_finish()` -> atualiza classificação ao encerrar jogo.
- `public.is_admin()` -> autorização de acesso/admin via RLS.

## Usuário admin

Fluxo recomendado:

1. Criar o usuário em **Authentication > Users** no painel do Supabase.
2. Vincular papel admin na tabela `public.user_roles`:

```sql
insert into public.user_roles (user_id, role)
values ('UUID_DO_USUARIO', 'admin')
on conflict (user_id, role) do nothing;
```

## Rodando localmente

```bash
npm install
npm run dev
```

Aplicação em desenvolvimento:

- `http://localhost:8080`

## Scripts úteis

- `npm run dev` -> inicia ambiente local.
- `npm run build` -> build de produção.
- `npm run preview` -> preview do build.
- `npm run lint` -> validação de lint.
- `npm run test` -> testes unitários.
- `npm run test:watch` -> testes em modo watch.

## Branding e assets

- Logo: `public/logo.png`
- Favicon: `public/logo.png`
- Artes dos campeonatos: `public/championships`

## Regulamento CLV (base funcional aplicada)

A modelagem atual suporta, no CLV:

- modalidades por campeonato;
- pontuação por modalidade;
- naipe por partida;
- classificação por modalidade e naipe;
- divisão unificada para CLV.

Regras disciplinares e critérios avançados de desempate (cartões, WO específico por modalidade etc.) ainda podem ser evoluídos em próximas iterações conforme o regulamento oficial.
