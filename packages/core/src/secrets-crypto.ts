import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Pure AES-256-GCM helpers for ARCH §17.2, free of the DB and env so they can be tested directly.

export interface SecretsKey {
  /** Short fingerprint stored with each row, so rotation knows which key wrote it. */
  id: string;
  key: Buffer;
}

export interface Sealed {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

/** A key from its base64 form (`openssl rand -base64 32`); anything but 32 bytes is rejected. */
export const parseKey = (base64: string): SecretsKey => {
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(
      "SECRETS_KEY must be 32 random bytes in base64: openssl rand -base64 32"
    );
  }
  return {
    id: createHash("sha256").update(key).digest("hex").slice(0, 12),
    key,
  };
};

/** Binds a ciphertext to its row: the same value under another owner or purpose will not decrypt. */
export const aadFor = (ownerType: string, ownerId: string, purpose: string) =>
  Buffer.from(`${ownerType}:${ownerId}:${purpose}`);

export const seal = (
  plaintext: string,
  aad: Buffer,
  { id, key }: SecretsKey
): Sealed => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  return {
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    keyId: id,
  };
};

/** Picks the key by the row's key_id; a wrong key, a moved row or tampering all throw. */
export const open = (
  sealed: Sealed,
  aad: Buffer,
  keys: SecretsKey[]
): string => {
  const match = keys.find((k) => k.id === sealed.keyId);
  if (!match) {
    throw new Error(
      `secret was encrypted with an unknown key (${sealed.keyId}); set SECRETS_KEY_PREVIOUS to rotate`
    );
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    match.key,
    Buffer.from(sealed.iv, "base64")
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf-8");
};

/** What the UI may show: a known prefix and the last four characters — «sk-…a1B2», «AQVN…Hc4x», «••••x7Qp». */
export const hintFor = (value: string) => {
  const tail = value.slice(-4);
  if (value.length < 12) {
    return `••••${tail}`;
  }
  const prefix = /^[A-Za-z]{2,6}[-_]/u.exec(value)?.[0] ?? value.slice(0, 4);
  return `${prefix}…${tail}`;
};
