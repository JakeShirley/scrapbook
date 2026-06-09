import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const pullRequestNumber = getRequiredArg(args, "pull-request");
const screenshotsDirectory = getRequiredArg(args, "screenshots-dir");
const githubOutputPath = args.get("github-output") ?? process.env.GITHUB_OUTPUT;
const publishWorktreeDirectory =
  args.get("worktree-dir") ??
  path.join(os.tmpdir(), `zakka-visual-diff-publish-${pullRequestNumber}`);
const branch = `app-visual-diffs-pr-${pullRequestNumber}`;

await rm(publishWorktreeDirectory, { force: true, recursive: true });
runGit(["worktree", "add", "--detach", publishWorktreeDirectory, "HEAD"]);

try {
  runGit(["config", "user.name", "github-actions[bot]"], publishWorktreeDirectory);
  runGit(
    ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
    publishWorktreeDirectory,
  );
  runGit(["checkout", "--orphan", branch], publishWorktreeDirectory);

  try {
    runGit(["rm", "-rf", "."], publishWorktreeDirectory);
  } catch {
    console.log("No tracked files to remove from visual diff branch.");
  }

  await removeWorktreeFiles(publishWorktreeDirectory);
  await mkdir(publishWorktreeDirectory, { recursive: true });
  await cp(screenshotsDirectory, publishWorktreeDirectory, { recursive: true });
  runGit(["add", "."], publishWorktreeDirectory);
  runGit(
    ["commit", "-m", `Update app visual diffs for PR #${pullRequestNumber}`],
    publishWorktreeDirectory,
  );
  runGit(["push", "origin", `HEAD:${branch}`, "--force"], publishWorktreeDirectory);
} finally {
  runGit(["worktree", "remove", "--force", publishWorktreeDirectory]);
}

if (githubOutputPath) {
  await writeFile(githubOutputPath, `branch=${branch}\n`, { flag: "a" });
}

console.log(`Published visual diff branch ${branch}.`);

function parseArgs(values: string[]) {
  const parsed = new Map<string, string>();

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--") {
      continue;
    }

    if (!value.startsWith("--")) {
      continue;
    }

    parsed.set(value.slice(2), values[index + 1] ?? "");
    index += 1;
  }

  return parsed;
}

function getRequiredArg(args: Map<string, string>, name: string) {
  const value = args.get(name);

  if (!value) {
    throw new Error(`Missing required --${name} argument.`);
  }

  return value;
}

function runGit(args: string[], cwd = process.cwd()) {
  execFileSync("git", args, { cwd, stdio: "inherit" });
}

async function removeWorktreeFiles(directory: string) {
  for (const entry of await readdir(directory)) {
    if (entry === ".git") {
      continue;
    }

    await rm(path.join(directory, entry), { force: true, recursive: true });
  }
}
