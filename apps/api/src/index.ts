import { serve } from "@hono/node-server";
import { loadConfig } from "@scrapbook/config";

import { createApp } from "./app.js";
import { createDatabaseConnection } from "./persistence/database.js";
import { createRepositories } from "./persistence/repositories.js";
import { createDiskStorage } from "./storage/disk.js";

const config = loadConfig();
const databaseConnection = createDatabaseConnection({
  dataDir: config.SCRAPBOOK_DATA_DIR,
  migrate: true,
});
const storage = createDiskStorage({ rootDir: config.SCRAPBOOK_DATA_DIR });
await storage.ensureReady();

const staticAssetsDir = process.env.WEB_ASSETS_DIR;
const app = createApp({
  repositories: createRepositories(databaseConnection.db),
  sessionCookieSecure: config.NODE_ENV === "production",
  ...(staticAssetsDir ? { staticAssetsDir } : {}),
  storage,
});

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.API_HOST,
    port: config.API_PORT,
  },
  (info) => {
    console.log(`Scrapbook API listening on http://${info.address}:${info.port}`);
  },
);

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`Received ${signal}; shutting down API server`);
  server.close(() => {
    databaseConnection.close();
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
