import pixelmatch from "pixelmatch";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

type Comparison = {
  after: string;
  before: string;
  diff: string;
  filename: string;
  hasDiff: boolean;
  height: number;
  mismatchRatio: number;
  mismatchedPixels: number;
  name: string;
  width: number;
};

const args = parseArgs(process.argv.slice(2));
const beforeDirectory = getRequiredArg(args, "before");
const afterDirectory = getRequiredArg(args, "after");
const outputDirectory = getRequiredArg(args, "out");
const githubOutputPath = args.get("github-output") ?? process.env.GITHUB_OUTPUT;

await mkdir(outputDirectory, { recursive: true });

const filenames = await getScreenshotFilenames(beforeDirectory, afterDirectory);
const comparisons: Comparison[] = [];

for (const filename of filenames) {
  const name = filename.replace(/\.png$/i, "");
  const beforePath = path.join(beforeDirectory, filename);
  const afterPath = path.join(afterDirectory, filename);
  const before = await readPngOrBlank(beforePath);
  const after = await readPngOrBlank(afterPath);
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const normalizedBefore = normalizePng(before, width, height);
  const normalizedAfter = normalizePng(after, width, height);
  const diff = new PNG({ height, width });
  const mismatchedPixels = pixelmatch(
    normalizedBefore.data,
    normalizedAfter.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 },
  );
  const comparison = {
    after: `after-${filename}`,
    before: `before-${filename}`,
    diff: `diff-${filename}`,
    filename,
    hasDiff: mismatchedPixels > 0,
    height,
    mismatchRatio: width * height === 0 ? 0 : mismatchedPixels / (width * height),
    mismatchedPixels,
    name,
    width,
  } satisfies Comparison;

  await writeFile(path.join(outputDirectory, comparison.before), PNG.sync.write(normalizedBefore));
  await writeFile(path.join(outputDirectory, comparison.after), PNG.sync.write(normalizedAfter));
  await writeFile(path.join(outputDirectory, comparison.diff), PNG.sync.write(diff));
  comparisons.push(comparison);
}

const changedComparisons = comparisons.filter((comparison) => comparison.hasDiff);
const metadata = {
  changedCount: changedComparisons.length,
  comparisons,
  generatedAt: new Date().toISOString(),
  hasVisualDiff: changedComparisons.length > 0,
};

await writeFile(
  path.join(outputDirectory, "metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

if (githubOutputPath) {
  await writeFile(
    githubOutputPath,
    `has-visual-diff=${String(metadata.hasVisualDiff)}\nchanged-count=${metadata.changedCount}\n`,
    { flag: "a" },
  );
}

console.log(
  metadata.hasVisualDiff
    ? `Detected visual differences in ${metadata.changedCount} screenshot(s).`
    : "No visual differences detected.",
);

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

async function getScreenshotFilenames(beforeDir: string, afterDir: string) {
  const names = new Set<string>();

  for (const directory of [beforeDir, afterDir]) {
    for (const filename of await readdir(directory)) {
      if (filename.endsWith(".png")) {
        names.add(filename);
      }
    }
  }

  return [...names].sort((left, right) => left.localeCompare(right));
}

async function readPngOrBlank(filePath: string) {
  try {
    return PNG.sync.read(await readFile(filePath));
  } catch {
    return new PNG({ height: 1, width: 1 });
  }
}

function normalizePng(source: PNG, width: number, height: number) {
  const normalized = new PNG({ height, width, fill: true });

  normalized.data.fill(255);

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (source.width * y + x) << 2;
      const targetOffset = (width * y + x) << 2;

      normalized.data[targetOffset] = source.data[sourceOffset];
      normalized.data[targetOffset + 1] = source.data[sourceOffset + 1];
      normalized.data[targetOffset + 2] = source.data[sourceOffset + 2];
      normalized.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }

  return normalized;
}
