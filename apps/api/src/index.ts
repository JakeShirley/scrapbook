import { serve } from "@hono/node-server";
import { loadConfig } from "@scrapbook/config";

import { createApp } from "./app.js";

const config = loadConfig();
const app = createApp();

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
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
