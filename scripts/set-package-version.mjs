#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2]?.trim();

if (!version) {
  throw new Error("Usage: node scripts/set-package-version.mjs <version>");
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${version}`);
}

const manifestPaths = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/api-contract/package.json",
  "packages/config/package.json",
  "packages/domain/package.json",
  "packages/editor-core/package.json",
  "packages/test-utils/package.json",
];

for (const manifestPath of manifestPaths) {
  if (!existsSync(manifestPath)) {
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
