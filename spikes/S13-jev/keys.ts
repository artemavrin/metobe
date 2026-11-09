// Source keys from the dev DB, decrypted with SECRETS_KEY. Never printed.

import { execFileSync } from "node:child_process";

import { aadFor, open, parseKey } from "../../packages/core/src/secrets-crypto.ts";

const psql = (sql: string) =>
  execFileSync("psql", [process.env.DATABASE_URL!, "-AtF", "\t", "-c", sql], {
    encoding: "utf-8",
  }).trim();

/** The key and options of the first enabled source of this kind. */
export const sourceKey = (kind: "gateway" | "yandex") => {
  const row = psql(`select s.ciphertext, s.iv, s.auth_tag, s.key_id, s.owner_id, src.options from secrets s
    join sources src on src.id::text = s.owner_id
    where src.kind = '${kind}' and src.enabled and s.owner_type = 'source' and s.purpose = 'api_key' limit 1`);
  if (!row) throw new Error(`no enabled ${kind} source with a key in the dev DB`);
  const [ciphertext, iv, authTag, keyId, ownerId, options] = row.split("\t");
  const key = open(
    { authTag, ciphertext, iv, keyId },
    aadFor("source", ownerId, "api_key"),
    [parseKey(process.env.SECRETS_KEY!)]
  );
  return { key, options: JSON.parse(options || "{}") as Record<string, string> };
};

/** Price per 1M tokens of a model from the dev catalog, with its currency. */
export const catalogPrice = (sourceKind: string, modelId: string) => {
  const row = psql(`select m.price_input, m.price_output, m.price_unit_tokens, m.price_currency from models m
    join sources s on s.id = m.source_id where s.kind = '${sourceKind}' and m.model_id = '${modelId}' limit 1`);
  if (!row) return undefined;
  const [input, output, unit, currency] = row.split("\t");
  const per = 1_000_000 / Number(unit || 1_000_000);
  return { currency, input: Number(input) * per, output: Number(output) * per };
};
