# LAJE-145 — Remediação de dependências, evidências e risco residual

A LAJE-39 identificou no `laje` originalmente **3 entradas Critical, 32 High, 6 Moderate e 1 Low** no relatório `npm audit` completo. A contagem se refere às entradas da árvore de dependências, não a CVEs únicos.

## Correções e compatibilidade

O manifesto e o `package-lock.json` foram atualizados de maneira controlada, sem `npm audit fix --force`, e passaram pela instalação com `npm ci`.

| Dependência principal      | Versão aplicada |
| -------------------------- | --------------- |
| `vite`                     | 8.3.4           |
| `vitest`                   | 5.0.4           |
| `@vitest/coverage-v8`      | 5.0.4           |
| `@vitejs/plugin-react-swc` | 4.3.3           |

As atualizações da tipagem foram limitadas à compatibilidade do cliente Supabase tipado, ao filtro `group_number`, e ao uso de arrays sem `Array.at` no target ES2020. O baseline TypeScript **não foi ampliado**: um erro obsoleto que desapareceu na nova compilação foi removido do baseline. Uma diretiva ESLint não mais necessária foi removida.

A prévia isolada [#38688209906](https://github.com/jaooduartte/laje/actions/runs/38688209906) comprovou `npm ci`, `npm run test:coverage` e `npm run build` aprovados para a combinação major; o workflow normal da PR confirma também `typecheck`, lint, smoke tests e build AWS.

## Resultado da auditoria e tratamento pendente

A auditoria após atualização demonstrou **0 Critical, 5 High, 7 Moderate**, com High remanescentes em `braces`, `chokidar`, `fast-glob`, `micromatch` e `tailwindcss`, relacionados à cadeia do Tailwind CSS 3. Um alerta em dependência de build/desenvolvimento **não equivale automaticamente** a vulnerabilidade explorável no site publicado. Porém, isso **ainda não demonstra** que não haja exposição; é necessário conferir a árvore efetivamente instalada em produção, os avisos de segurança e os scripts/processos de build.

É preciso definir uma remediação sem sacrificar os estilos da aplicação; uma migração de Tailwind 3 para 4 requer avaliação de configuração/plugins/design system, build do frontend legado e AWS, validação visual e testes. Não sugerir que `npm audit` completo passou enquanto restarem cinco ocorrências High, e não baixar thresholds nem ignorar dependências para produzir resultado artificial.

Após aprovação da PR e integração com a LAJE-39, repetir os scans e comparar os respectivos artefatos. Esta PR não executa deploy nem modifica produção. Referências: [LAJE-145](https://joaoduartte.atlassian.net/browse/LAJE-145), [LAJE-39](https://joaoduartte.atlassian.net/browse/LAJE-39).
