# LAJE-40 — Captura de falhas do frontend acadêmico

Esta instrumentação é exclusiva do projeto Vercel **`laje-tcc`**, que usa `VITE_BACKEND_PROVIDER=aws` e `VITE_API_URL`. O projeto operacional **`laje`** mantém Supabase e continua sem o coletor de erros AWS.

O módulo `src/lib/observability.ts` instala handlers de `error` e `unhandledrejection` e expõe `reportBrowserFailure`. `src/components/observability/AwsErrorBoundary.tsx` intercepta falhas de renderização React. A integração HTTP em `src/integrations/laje-api/client.ts` registra falhas de rede e respostas 5xx, correlacionadas ao cabeçalho `x-request-id` quando disponível.

Os eventos são enviados por POST a `/api/v1/observability/client-errors` **sem autenticação e sem credenciais**, de forma *best-effort* e **apenas** no modo AWS. O payload contém somente categoria enumerada, código de falha restrito, status 5xx e UUID válido. **Não coleta** descrição da exceção, stack trace, URL, dados de usuário, cookies, headers ou corpo HTTP. O backend valida estritamente e aplica throttling. Se o backend estiver desligado intencionalmente (LAJE-152), a telemetria poderá se perder; isso é esperado e não pode bloquear a interface.

Os registros ficam no grupo CloudWatch Logs `/laje/staging/api` (evento `frontend_error`), consultáveis por Logs Insights conforme o [runbook AWS da LAJE-40](https://github.com/jaooduartte/laje-api/blob/main/docs/observability.md).

**Teste:** no projeto `laje-tcc` com ECS/RDS ligados, provocar exceção controlada somente em ambiente de testes autorizado; verificar o log `frontend_error` e inspecionar o Network tab para confirmar ausência de dados pessoais. No deployment operacional `laje`, confirmar a inexistência de POST para `/observability/client-errors`. Erros HTTP 4xx esperados não são telemetria de incidentes.

O merge dos PRs não publica a versão AWS nem cria dashboard automaticamente. Não há SDK terceirizado ou coleta de session replay; o uso do dashboard CloudWatch pode ter cobrança mensal, e os logs podem gerar custo de ingestão/consulta.
