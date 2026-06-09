import { readFile } from "node:fs/promises";
import path from "node:path";

type Comparison = {
  after: string;
  before: string;
  diff: string;
  hasDiff: boolean;
  mismatchRatio: number;
  mismatchedPixels: number;
  name: string;
};

type Metadata = {
  changedCount: number;
  comparisons: Comparison[];
  hasVisualDiff: boolean;
};

type GitHubComment = {
  body: string;
  id: number;
};

const args = parseArgs(process.argv.slice(2));
const pullRequestNumber = getRequiredArg(args, "pull-request");
const mergeBaseSha = getRequiredArg(args, "merge-base-sha");
const headSha = getRequiredArg(args, "head-sha");
const screenshotBranch = getRequiredArg(args, "screenshot-branch");
const repository = getRequiredArg(args, "repository");
const runId = getRequiredArg(args, "run-id");
const screenshotsDirectory = getRequiredArg(args, "screenshots-dir");
const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is required to update the app visual diff comment.");
}

const [owner, repo] = repository.split("/");

if (!owner || !repo) {
  throw new Error(`Repository must be in owner/name form: ${repository}`);
}

const marker = "<!-- zakka-app-visual-diffs -->";
const metadata = JSON.parse(
  await readFile(path.join(screenshotsDirectory, "metadata.json"), "utf8"),
) as Metadata;
const body = buildCommentBody(metadata);
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2022-11-28",
};
const comments = (await githubJson(
  `/repos/${owner}/${repo}/issues/${pullRequestNumber}/comments?per_page=100`,
  { headers },
)) as GitHubComment[];
const existing = comments.find((comment) => comment.body.includes(marker));

if (existing) {
  await githubJson(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
    body: JSON.stringify({ body }),
    headers,
    method: "PATCH",
  });
} else {
  await githubJson(`/repos/${owner}/${repo}/issues/${pullRequestNumber}/comments`, {
    body: JSON.stringify({ body }),
    headers,
    method: "POST",
  });
}

console.log("Updated app visual diff pull request comment.");

function buildCommentBody(metadata: Metadata) {
  const changedComparisons = metadata.comparisons.filter((comparison) => comparison.hasDiff);
  const artifactUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const lines = [
    marker,
    "## App visual diffs",
    "",
    "Before screenshots are rendered from the pull request merge base. After screenshots are rendered from this pull request head.",
    "",
    `Merge base: \`${shortSha(mergeBaseSha)}\`  `,
    `Pull request head: \`${shortSha(headSha)}\``,
    "",
  ];

  if (changedComparisons.length === 0) {
    lines.push(
      "No app visual differences were detected.",
      "",
      `[Download screenshot artifact](${artifactUrl})`,
    );
    return lines.join("\n");
  }

  lines.push(
    `Detected visual differences in ${changedComparisons.length} screenshot(s). Magenta pixels in Diff mark changed pixels.`,
    "",
  );

  for (const comparison of changedComparisons) {
    lines.push(
      `### ${formatScenarioName(comparison.name)}`,
      "",
      `Changed pixels: ${comparison.mismatchedPixels.toLocaleString()} (${formatPercent(comparison.mismatchRatio)})`,
      "",
      "| Before | After | Diff |",
      "| --- | --- | --- |",
      `| ${imageLink(comparison.before, `${comparison.name} before`)} | ${imageLink(comparison.after, `${comparison.name} after`)} | ${imageLink(comparison.diff, `${comparison.name} diff`)} |`,
      "",
    );
  }

  lines.push(`[Download screenshot artifact](${artifactUrl})`);

  return lines.join("\n");
}

function imageLink(filename: string, alt: string) {
  const rawUrl = `https://github.com/${repository}/raw/${screenshotBranch}/${filename}?run=${runId}`;
  const fileUrl = `https://github.com/${repository}/blob/${screenshotBranch}/${filename}`;

  return `[![${alt}](${rawUrl})](${fileUrl})`;
}

function formatScenarioName(name: string) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

function shortSha(value: string) {
  return value.slice(0, 12);
}

async function githubJson(pathname: string, init: RequestInit) {
  const response = await fetch(`${apiUrl}${pathname}`, init);

  if (!response.ok) {
    throw new Error(`GitHub API request failed with ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

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
