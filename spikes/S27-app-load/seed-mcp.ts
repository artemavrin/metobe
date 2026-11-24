import { readFileSync } from "node:fs";

import postgres from "postgres";

// Adds two MCP servers to spike_s27 (both at the mock-mcp on :3429, auth none): «Mock Docs», shared by everyone (one
// cached client), and «Mock CRM», per user (a connection for every seeded person → one cached client each).
const url = process.env.DATABASE_URL;
if (!url?.endsWith("/spike_s27")) {
  throw new Error("DATABASE_URL must point at spike_s27");
}
const { people } = JSON.parse(readFileSync(new URL("cookies.json", import.meta.url), "utf8")) as {
  people: { userId: string }[];
};
const sql = postgres(url, { max: 2, onnotice: () => {} });
await sql`truncate catalog_items cascade`;
const mcp = process.env.MCP_URL ?? "http://127.0.0.1:3429/mcp";
const config = sql.json({ auth: "none", transport: "http", url: mcp });
await sql`insert into catalog_items (key, title, config, credential_mode, proxy_mode, enabled, access)
          values ('mockdocs', 'Mock Docs', ${config}, 'shared', 'direct', true, 'all')`;
const [crm] = await sql`insert into catalog_items (key, title, config, credential_mode, proxy_mode, enabled, access)
          values ('mockcrm', 'Mock CRM', ${config}, 'per_user', 'direct', true, 'all') returning id`;
for (const p of people) {
  await sql`insert into connections (catalog_id, user_id, status) values (${crm.id}, ${p.userId}, 'active')`;
}
console.log(`catalog: 2 servers, ${people.length} connections`);
await sql.end();
