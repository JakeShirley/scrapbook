import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";

import { runMigrations } from "./migrations.js";
import * as schema from "./schema.js";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export type DatabaseConnection = {
  db: AppDatabase;
  sqlite: Database.Database;
  path: string;
  close: () => void;
};

export type CreateDatabaseConnectionOptions =
  | {
      dataDir: string;
      databasePath?: never;
      migrate?: boolean;
    }
  | {
      dataDir?: never;
      databasePath: string;
      migrate?: boolean;
    };

export const databaseFileName = "scrapbook.sqlite";

export const resolveDatabasePath = (dataDir: string): string => join(dataDir, databaseFileName);

export const createDatabaseConnection = (
  options: CreateDatabaseConnectionOptions,
): DatabaseConnection => {
  const databasePath =
    "databasePath" in options ? options.databasePath : resolveDatabasePath(options.dataDir);

  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");

  if (databasePath !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }

  if (options.migrate === true) {
    runMigrations(sqlite);
  }

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    path: databasePath,
    close: () => sqlite.close(),
  };
};
