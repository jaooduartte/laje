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

function runPrettier(mode, files) {
  return spawnSync(
    "npx",
    ["--yes", "prettier@3.9.9", mode, "--ignore-path", ".prettierignore", ...files],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: process.env,
      stdio: "inherit",
    },
  );
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

if (writeMode) {
  const prettier = runPrettier("--write", changedFiles);
  process.exit(prettier.status ?? 1);
}

const prettier = runPrettier("--check", changedFiles);
if (prettier.status === 0) {
  process.exit(0);
}

console.error("\nSugestão automática de correção:\n");
const writer = runPrettier("--write", changedFiles);
if (writer.status === 0) {
  const formattedDiff = runGit(["diff", "--", ...changedFiles]);
  process.stderr.write(formattedDiff.stdout ?? "");
}

process.exit(prettier.status ?? 1);
