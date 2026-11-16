import { randomBytes } from "node:crypto";

import { aadFor, open, parseKey, seal } from "./secrets-crypto";
import type { SecretsKey } from "./secrets-crypto";

// Pure helpers for the memory's sealed texts (ARCH §19.3), free of the DB and env so they can be tested directly.
// A person's texts are sealed with their own data key; the key itself is kept sealed with SECRETS_KEY (core/secrets).

/** A new data key: 32 random bytes. */
export const newDataKey = (): SecretsKey =>
  parseKey(randomBytes(32).toString("base64"));

/** Binds a text to its row and field: the same text moved to another owner, row or field will not open. */
export const memoryAad = (
  ownerId: string,
  table: string,
  rowId: string,
  field: string
) => aadFor("memory", ownerId, `${table}:${rowId}:${field}`);

/**
 * One column's worth: `iv.authTag.ciphertext`, each in base64 (which has no dots). The key is the owner's alone and
 * never changes, so — unlike a secret — the row does not name it.
 */
export const sealField = (plaintext: string, aad: Buffer, key: SecretsKey) => {
  const sealed = seal(plaintext, aad, key);
  return `${sealed.iv}.${sealed.authTag}.${sealed.ciphertext}`;
};

export const openField = (packed: string, aad: Buffer, key: SecretsKey) => {
  const [iv, authTag, ciphertext, ...rest] = packed.split(".");
  if (!(iv && authTag && ciphertext) || rest.length > 0) {
    throw new Error("memory text is not sealed in the expected form");
  }
  return open({ authTag, ciphertext, iv, keyId: key.id }, aad, [key]);
};
