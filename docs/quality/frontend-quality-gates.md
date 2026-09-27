# Quality gates do frontend

O frontend `laje` passou a executar um quality gate incremental antes de merge.

## Comandos

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

## TypeScript

A ativação do `tsc --noEmit` identificou 38 diagnósticos já existentes no código de produção. Eles estão explicitamente registrados em `scripts/typecheck-baseline.json` para permitir adoção imediata do gate sem misturar uma correção transversal de tipagem nesta entrega.

O script `scripts/typecheck-baseline.mjs` reprova qualquer diagnóstico novo ou qualquer mudança não refletida no baseline. À medida que a dívida for corrigida, o baseline deve ser reduzido até zero; ele não deve crescer para acomodar novos erros.

## Formatação

O projeto possui código legado anterior à adoção do Prettier. Nesta etapa, a validação é incremental: arquivos alterados em relação à `main` são verificados pelo Prettier. Isso impede novas divergências sem gerar uma PR massiva de reformatação do repositório inteiro.

## Dependências

O `npm ci` permanece baseado no `package-lock.json`. A análise de vulnerabilidades e o quality gate de segurança são tratados na tarefa específica de análise estática e segurança do projeto, sem ocultar os avisos produzidos pelo `npm audit` durante a instalação.
