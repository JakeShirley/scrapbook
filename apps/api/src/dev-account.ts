import { hashPassword, normalizeEmail } from "./auth.js";
import type { Repositories } from "./persistence/repositories.js";

export const developmentAccountEmail = "dev@zakka.local";
export const developmentAccountPassword = "zakka-dev-password";
export const developmentAccountDisplayName = "Zakka Developer";

export type DevelopmentAccountSeedResult = {
  email: string;
  created: boolean;
};

export const ensureDevelopmentAccount = async (
  repositories: Repositories,
): Promise<DevelopmentAccountSeedResult> => {
  const email = normalizeEmail(developmentAccountEmail);
  const existingAccount = repositories.accounts.findByPrimaryEmail(email);
  const existingIdentity = repositories.authIdentities.findByProviderSubject(
    "email_password",
    email,
  );

  if (existingAccount || existingIdentity) {
    return { email, created: false };
  }

  const account = repositories.accounts.create({
    displayName: developmentAccountDisplayName,
    primaryEmail: email,
  });

  repositories.authIdentities.create({
    accountId: account.id,
    provider: "email_password",
    providerSubject: email,
    passwordHash: await hashPassword(developmentAccountPassword),
  });

  return { email, created: true };
};
