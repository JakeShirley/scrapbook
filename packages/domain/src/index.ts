export type EntityKind = "account" | "album" | "asset" | "book" | "export" | "page" | "session";

export type OpaqueId<Kind extends EntityKind> = `${Kind}_${string}`;

export type ISODateTime = string;

export type Timestamped = {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export const createTimestamp = (date: Date = new Date()): ISODateTime => date.toISOString();

export const assertNever = (value: never): never => {
  throw new Error(`Unhandled value: ${String(value)}`);
};
