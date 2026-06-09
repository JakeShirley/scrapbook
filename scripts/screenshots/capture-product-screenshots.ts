import { spawn } from "node:child_process";
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const outputDirectory = path.join(repoRoot, "docs", "product-screenshots");

const productScenarios: { rename: string; scenario: string }[] = [
  { rename: "books.png", scenario: "books" },
  { rename: "book-editor.png", scenario: "book-editor" },
  { rename: "book-editor-effects.png", scenario: "book-editor-washi-text-settings" },
  { rename: "library.png", scenario: "library" },
  { rename: "image-grid.png", scenario: "image-grid" },
];

const grepPattern = ` (${productScenarios.map(({ scenario }) => escapeRegex(scenario)).join("|")}) desktop$`;

await runPlaywright(grepPattern);
await renameCapturedFiles();

console.log(`\nProduct screenshots written to ${path.relative(repoRoot, outputDirectory)}/`);
for (const { rename: target } of productScenarios) {
  console.log(`  - ${target}`);
}

function escapeRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runPlaywright(grep: string) {
  return new Promise<void>((resolve, reject) => {
    const quotedGrep = JSON.stringify(grep);
    const command = `pnpm --filter @scrapbook/web screenshots:capture --grep ${quotedGrep}`;

    const child = spawn(command, {
      cwd: repoRoot,
      env: {
        ...process.env,
        SCRAPBOOK_SCREENSHOT_DIR: outputDirectory,
      },
      shell: true,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`playwright exited with code ${code ?? "null"}`));
    });
  });
}

async function renameCapturedFiles() {
  const captured = new Set(await readdir(outputDirectory));

  for (const { rename: target, scenario } of productScenarios) {
    const source = `${scenario}-desktop.png`;
    if (!captured.has(source)) {
      throw new Error(`Expected ${source} in ${outputDirectory} but it was not produced.`);
    }
    await rename(path.join(outputDirectory, source), path.join(outputDirectory, target));
  }
}
