import { loadConfig } from "@scrapbook/config";

import { createDatabaseConnection } from "./database.js";
import { getAppliedMigrations, runMigrations } from "./migrations.js";

const config = loadConfig();
const connection = createDatabaseConnection({ dataDir: config.SCRAPBOOK_DATA_DIR });

try {
  const appliedNow = runMigrations(connection.sqlite);
  const applied = getAppliedMigrations(connection.sqlite);

  console.log(`SQLite database: ${connection.path}`);
  console.log(`Applied ${appliedNow.length} new migration(s); ${applied.length} total.`);
} finally {
  connection.close();
}
