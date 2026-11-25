// S28: a synthetic installation at the schema of the current release (no organizations yet), sized like the live one.
// Usage: tsx seed.ts <live|year|stress>
import {
  buildFolder,
  connect,
  ms,
  recreateDb,
  runMigrations,
  URL,
} from "./lib";

export interface Profile {
  users: number;
  admins: number;
  sessions: number;
  chats: number;
  messages: number;
  /** Raw text per message, characters (hex — TOAST compresses it about 2×, like real JSON parts). */
  messageChars: number;
  runs: number;
  catalog: number;
  skills: number;
  invitations: number;
}

// live — a small installation: about ten people for a month, see README.
// year — a guess: the same people for 12 months (×12 the per-month rows, chats, messages).
// stress — not a live size: 200 people and a million model_runs, to see how the migration scales.
export const PROFILES: Record<string, Profile> = {
  live: {
    admins: 1,
    catalog: 6,
    chats: 50,
    invitations: 2,
    messageChars: 18_000,
    messages: 1000,
    runs: 1300,
    sessions: 24,
    skills: 3,
    users: 10,
  },
  stress: {
    admins: 5,
    catalog: 50,
    chats: 5000,
    invitations: 300,
    messageChars: 4000,
    messages: 20_000,
    runs: 1_000_000,
    sessions: 400,
    skills: 200,
    users: 200,
  },
  year: {
    admins: 1,
    catalog: 10,
    chats: 600,
    invitations: 15,
    messageChars: 18_000,
    messages: 12_000,
    runs: 16_000,
    sessions: 30,
    skills: 20,
    users: 10,
  },
};

export const seed = async (name: string) => {
  const p = PROFILES[name];
  if (!p) {
    throw new Error(`unknown profile ${name}`);
  }
  const t0 = performance.now();
  await recreateDb();
  await runMigrations(URL, await buildFolder(0));
  const sql = connect();
  try {
    await sql
      .unsafe(`
      insert into system_settings (id, policies) values (1, '{
        "mail": {"host": "smtp.example.test"},
        "access": {"domains": ["example.test"]},
        "privacy": {"mode": "mask", "keepDays": 30},
        "updates": {"channel": "stable"},
        "searchCheck": {"ok": true},
        "builtinTools": {"web": true},
        "personalConnections": {"allowed": true}
      }'::jsonb)
      on conflict (id) do update set policies = excluded.policies;

      insert into "user" (id, name, email, email_verified, role, created_at)
      select 'u' || g, 'User ' || g, 'u' || g || '@example.test', true,
        case when g = 1 then 'superuser' when g <= 1 + ${p.admins} then 'admin' else 'user' end,
        now() - interval '1 year' + g * interval '1 hour'
      from generate_series(1, ${p.users}) g;

      insert into session (id, expires_at, token, created_at, updated_at, user_id)
      select 's' || g, now() + interval '7 days', 'tok' || g, now(), now(), 'u' || (1 + g % ${p.users})
      from generate_series(1, ${p.sessions}) g;

      insert into chats (id, title, user_id, created_at, updated_at)
      select gen_random_uuid(), 'Chat ' || g, 'u' || (1 + g % ${p.users}),
        now() - random() * interval '1 year', now()
      from generate_series(1, ${p.chats}) g;

      create temp table chat_ids as select row_number() over () as n, id from chats;

      insert into messages (id, chat_id, role, parts, created_at)
      select gen_random_uuid(), c.id, case when g % 2 = 0 then 'user' else 'assistant' end,
        jsonb_build_array(jsonb_build_object('type', 'text', 'text', t.text)),
        now() - random() * interval '1 year'
      from generate_series(1, ${p.messages}) g
      join chat_ids c on c.n = 1 + g % ${p.chats}
      cross join lateral (
        select string_agg(md5(random()::text || g::text || k::text), '') as text
        from generate_series(1, ${Math.ceil(p.messageChars / 32)}) k
      ) t;

      insert into model_runs (user_id, chat_id, status, purpose, input_tokens, output_tokens, cache_read_tokens,
        cost, currency, latency_ms, created_at)
      select 'u' || (1 + g % ${p.users}),
        case when g % 3 = 0 then null else c.id end,
        (array['ok','ok','ok','error','aborted'])[1 + g % 5],
        (array['chat','chat','chat','title','memory','decide','describe','compact','task'])[1 + g % 9],
        (random() * 20000)::int, (random() * 2000)::int, (random() * 10000)::int,
        round((random() * 0.05)::numeric, 6), 'USD', (random() * 9000)::int,
        now() - random() * interval '1 year'
      from generate_series(1, ${p.runs}) g
      join chat_ids c on c.n = 1 + g % ${p.chats};

      -- A run of a person deleted since: the user_id was set null, the run must still get the organization.
      update model_runs set user_id = null where id in (select id from model_runs limit 3);

      insert into catalog_items (key, title, config)
      select 'mcp' || g, 'Service ' || g, '{"url": "https://mcp.example.test"}'::jsonb
      from generate_series(1, ${p.catalog}) g;

      insert into skills (name, description, instructions, owner_id)
      select 'skill-' || g, 'Does ' || g, 'Steps', case when g % 2 = 0 then null else 'u' || (1 + g % ${p.users}) end
      from generate_series(1, ${p.skills}) g;

      insert into invitations (role, token_hash, expires_at, created_by)
      select case when g % 5 = 0 then 'admin' else 'user' end, 'inv' || g, now() + interval '7 days', 'u1'
      from generate_series(1, ${p.invitations}) g;

      analyze;
    `)
      .simple();
    const [size] = await sql<{ bytes: string }[]>`
      select pg_database_size(current_database())::text as bytes`;
    return { bytes: Number(size?.bytes), ms: ms(t0) };
  } finally {
    await sql.end();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2] ?? "live";
  const r = await seed(name);
  console.log(
    `seed ${name}: ${(r.bytes / 1024 / 1024).toFixed(0)} MB in ${r.ms} ms`
  );
}
