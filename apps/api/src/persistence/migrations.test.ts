import { describe, expect, it } from "vitest";

import { createDatabaseConnection } from "./database.js";
import { getAppliedMigrations, runMigrations } from "./migrations.js";

describe("SQLite migrations", () => {
  it("applies the initial schema from an empty database", () => {
    const connection = createDatabaseConnection({ databasePath: ":memory:" });

    try {
      expect(runMigrations(connection.sqlite)).toEqual(["0001_initial_schema"]);
      expect(runMigrations(connection.sqlite)).toEqual([]);
      expect(getAppliedMigrations(connection.sqlite)).toEqual(["0001_initial_schema"]);

      const tableNames = connection.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);

      expect(tableNames).toEqual([
        "accounts",
        "asset_variants",
        "assets",
        "auth_identities",
        "book_pages",
        "books",
        "exports",
        "pages",
        "schema_migrations",
        "sessions",
      ]);
    } finally {
      connection.close();
    }
  });
});
