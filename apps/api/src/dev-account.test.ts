import { describe, expect, it } from "vitest";

import { verifyPassword } from "./auth.js";
import {
  developmentAccountEmail,
  developmentAccountPassword,
  ensureDevelopmentAccount,
} from "./dev-account.js";
import { createDatabaseConnection } from "./persistence/database.js";
import { runMigrations } from "./persistence/migrations.js";
import { createRepositories } from "./persistence/repositories.js";

const createTestRepositories = () => {
  const connection = createDatabaseConnection({ databasePath: ":memory:" });

  runMigrations(connection.sqlite);

  return { connection, repositories: createRepositories(connection.db) };
};

describe("ensureDevelopmentAccount", () => {
  it("creates a sign-in ready account once and stays idempotent", async () => {
    const { connection, repositories } = createTestRepositories();

    try {
      const first = await ensureDevelopmentAccount(repositories);

      expect(first).toEqual({ email: developmentAccountEmail, created: true });

      const identity = repositories.authIdentities.findByProviderSubject(
        "email_password",
        developmentAccountEmail,
      );

      expect(identity?.passwordHash).toBeTruthy();
      expect(await verifyPassword(developmentAccountPassword, identity?.passwordHash ?? "")).toBe(
        true,
      );

      const second = await ensureDevelopmentAccount(repositories);

      expect(second).toEqual({ email: developmentAccountEmail, created: false });
      expect(repositories.accounts.findByPrimaryEmail(developmentAccountEmail)?.id).toBe(
        identity?.accountId,
      );
    } finally {
      connection.close();
    }
  });
});
