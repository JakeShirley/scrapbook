import type { EntityKind, OpaqueId } from "@scrapbook/domain";

type InternalEntityKind = "authIdentity" | "assetVariant" | "bookPage" | "bookAsset";

const internalPrefixes: Record<InternalEntityKind, string> = {
  authIdentity: "auth_identity",
  assetVariant: "asset_variant",
  bookPage: "book_page",
  bookAsset: "book_asset",
};

export const createEntityId = <Kind extends EntityKind>(kind: Kind): OpaqueId<Kind> =>
  `${kind}_${crypto.randomUUID()}` as OpaqueId<Kind>;

export const createInternalId = (kind: InternalEntityKind): string =>
  `${internalPrefixes[kind]}_${crypto.randomUUID()}`;
