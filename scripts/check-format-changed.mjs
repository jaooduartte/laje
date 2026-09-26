import { execFileSync } from "node:child_process";

const supportedFilePattern = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|css|scss|html)$/i;
const ignoredFiles = new Set(["package-lock.json", "bun.lockb"]);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function isUsableSha(value) {
  return Boolean(value && !/^0+$/.test(value));
}

function resolveBaseSha() {
  if (isUsableSha(process.env.FORMAT_BASE_SHA)) {
    return process.env.FORMAT_BASE_SHA;
  }

  for (const args of [
    ["merge-base", "HEAD", "origin/main"],
    ["merge-base", "HEAD", "main"],
    ["rev-parse", "HEAD^"],
  ]) {
    try {
      const sha = git(args);
      if (isUsableSha(sha)) {
        return sha;
      }
    } catch {
      // Try the next fallback when a local ref is unavailable.
    }
  }

  return null;
}

const baseSha = resolveBaseSha();
const headSha = process.env.FORMAT_HEAD_SHA || "HEAD";

if (!baseSha) {
  console.log("No base commit available; skipping incremental Prettier check.");
  process.exit(0);
}

const changedFiles = git([
  "diff",
  "--name-only",
  "--diff-filter=ACMRT",
  baseSha,
  headSha,
])
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => supportedFilePattern.test(file))
  .filter((file) => !ignoredFiles.has(file));

if (changedFiles.length === 0) {
  console.log("No changed files require Prettier validation.");
  process.exit(0);
}

console.log(`Checking Prettier formatting for ${changedFiles.length} changed file(s).`);

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npxCommand, ["--yes", "prettier@3.9.9", "--check", ...changedFiles], {
  stdio: "inherit",
});
