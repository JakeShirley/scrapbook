import { createHash } from "node:crypto";

export const checksumSha256 = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");
