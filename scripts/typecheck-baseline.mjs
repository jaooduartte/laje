import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(repositoryRoot, "scripts", "typecheck-baseline.json");
const tscPath = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const configurations = ["tsconfig.typecheck.json", "tsconfig.node.json"];

function collectDiagnostics(config) {
  const result = spawnSync(
    process.execPath,
    [tscPath, "--noEmit", "--pretty", "false", "-p", config],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: process.env,
    },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const diagnostics = new Map();
  const diagnosticPattern = /^(.+?)\(\d+,\d+\): error TS(\d+):/gm;

  for (const match of output.matchAll(diagnosticPattern)) {
    const filePath = match[1].replaceAll("\\", "/");
    const key = `${filePath}|TS${match[2]}`;
    diagnostics.set(key, (diagnostics.get(key) ?? 0) + 1);
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && diagnostics.size === 0) {
    process.stderr.write(output);
    throw new Error(`TypeScript falhou sem diagnóstico reconhecível em ${config}.`);
  }

  return { diagnostics, output };
}

const actualDiagnostics = new Map();
let rawOutput = "";

for (const config of configurations) {
  const result = collectDiagnostics(config);
  rawOutput += result.output;

  for (const [key, count] of result.diagnostics) {
    actualDiagnostics.set(key, (actualDiagnostics.get(key) ?? 0) + count);
  }
}

const expectedDiagnostics = new Map(Object.entries(baseline));
const unexpected = [];
const missing = [];

for (const [key, count] of actualDiagnostics) {
  const expectedCount = expectedDiagnostics.get(key) ?? 0;
  if (count !== expectedCount) {
    unexpected.push(`${key}: esperado ${expectedCount}, encontrado ${count}`);
  }
}

for (const [key, expectedCount] of expectedDiagnostics) {
  const actualCount = actualDiagnostics.get(key) ?? 0;
  if (actualCount !== expectedCount && !unexpected.some((item) => item.startsWith(`${key}:`))) {
    missing.push(`${key}: esperado ${expectedCount}, encontrado ${actualCount}`);
  }
}

if (unexpected.length > 0 || missing.length > 0) {
  console.error("O conjunto de erros TypeScript mudou em relação ao baseline versionado.");
  [...unexpected, ...missing].forEach((item) => console.error(`- ${item}`));
  console.error("\nSaída completa do TypeScript:\n");
  process.stderr.write(rawOutput);
  process.exit(1);
}

if (actualDiagnostics.size > 0) {
  const total = [...actualDiagnostics.values()].reduce((sum, count) => sum + count, 0);
  console.warn(
    `Typecheck incremental aprovado com ${total} diagnóstico(s) legado(s) já registrados no baseline. Novos diagnósticos reprovam o gate.`,
  );
} else {
  console.log("Typecheck aprovado sem diagnósticos.");
}
