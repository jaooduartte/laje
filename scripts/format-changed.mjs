import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writeMode = process.argv.includes("--write");
const supportedExtensionPattern = /\.(?:[cm]?[jt]sx?|json|md|css|html|ya?ml)$/i;

function runGit(args, options = {}) {
  return spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
}

function resolveDiffRange() {
  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    return `origin/${githubBaseRef}...HEAD`;
  }

  const githubBefore = process.env.GITHUB_EVENT_BEFORE;
  if (githubBefore && !/^0+$/.test(githubBefore)) {
    return `${githubBefore}...HEAD`;
  }

  const originMain = runGit(["rev-parse", "--verify", "origin/main"]);
  if (originMain.status === 0) {
    return "origin/main...HEAD";
  }

  const parent = runGit(["rev-parse", "--verify", "HEAD^"]);
  return parent.status === 0 ? "HEAD^...HEAD" : null;
}

const diffRange = resolveDiffRange();
if (!diffRange) {
  console.log("Nenhum histórico anterior disponível; verificação de formatação ignorada.");
  process.exit(0);
}

const diff = runGit(["diff", "--name-only", "--diff-filter=ACMR", diffRange]);
if (diff.status !== 0) {
  process.stderr.write(diff.stderr ?? "");
  process.exit(diff.status ?? 1);
}

const changedFiles = diff.stdout
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => supportedExtensionPattern.test(file))
  .filter((file) => existsSync(path.join(repositoryRoot, file)));

if (changedFiles.length === 0) {
  console.log("Nenhum arquivo alterado compatível com Prettier.");
  process.exit(0);
}

console.log(
  `${writeMode ? "Formatando" : "Verificando formatação de"} ${changedFiles.length} arquivo(s) alterado(s) em ${diffRange}.`,
);

const prettierArgs = [
  "--yes",
  "prettier@3.9.9",
  writeMode ? "--write" : "--check",
  "--ignore-path",
  ".prettierignore",
  ...changedFiles,
];

const prettier = spawnSync("npx", prettierArgs, {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: process.env,
  stdio: "inherit",
});

process.exit(prettier.status ?? 1);
