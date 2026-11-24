import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import postgres from "postgres";

// Seeds spike_s27: N people with a session each, one OpenAI-compatible source pointing at the mock, one model.
// Writes cookies.json (the signed Better Auth session cookie per person) for the load driver.
const url = process.env.DATABASE_URL;
if (!url?.endsWith("/spike_s27")) {
  throw new Error("DATABASE_URL must point at spike_s27");
}
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}
const USERS = Number(process.env.USERS ?? 400);
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:3428/v1";

const sql = postgres(url, { max: 4, onnotice: () => {} });

await sql`truncate "user", sources, providers cascade`;

const [provider] = await sql`
  insert into providers (slug, title) values ('other', 'Mock') returning id`;
const [source] = await sql`
  insert into sources (kind, base_url, title, options, local, proxy_mode, health)
  values ('openai-compatible', ${MOCK}, 'S27 mock', '{}'::jsonb, true, 'direct',
          ${sql.json({ checkedAt: new Date().toISOString(), state: "ok" })})
  returning id`;
const [model] = await sql`
  insert into models (source_id, provider_id, model_id, title, enabled, context_window, capabilities, capabilities_source)
  values (${source.id}, ${provider.id}, 'mock-1', 'Mock 1', true, 128000,
          ${sql.json({ reasoning: false, structured: false, tools: true, vision: false })}, 'manual')
  returning id`;

const sign = (token: string) =>
  encodeURIComponent(
    `${token}.${createHmac("sha256", secret).update(token).digest("base64")}`
  );

const people: { cookie: string; email: string; userId: string }[] = [];
const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
for (let i = 0; i < USERS; i += 1) {
  const userId = randomUUID();
  const email = `s27-${i}@spike.test`;
  const token = randomBytes(24).toString("base64url");
  await sql`insert into "user" (id, name, email, email_verified, role)
            values (${userId}, ${`S27 ${i}`}, ${email}, true, 'user')`;
  await sql`insert into session (id, expires_at, token, updated_at, user_id)
            values (${randomUUID()}, ${expires}, ${token}, now(), ${userId})`;
  people.push({ cookie: `better-auth.session_token=${sign(token)}`, email, userId });
}
writeFileSync(
  new URL("cookies.json", import.meta.url),
  JSON.stringify({ modelId: model.id, people })
);
console.log(`seeded ${USERS} people, model ${model.id}`);
await sql.end();
