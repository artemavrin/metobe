// S23 (ARCH §20.10): sign-in and seats in one transaction. Better Auth 1.7.5 in process on the database spike_s23, no
// HTTP server and no mail: codes come from `createVerificationOTP`, as the invite and claim actions take them now.
//
//   ./setup.sh
//   S23_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:5432/spike_s23 node --import tsx s23.ts
//   TRIALS=50 …
//
// Prints one line per scenario; the README keeps the numbers of the last run.

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { resetSchema } from "./schema.ts";
import {
  NO_FREE_SEATS,
  acceptInvitation,
  afterHookSaw,
  issueClaimToken,
  issueInvitation,
  makeAuth,
  redeemClaim,
  signUpInTransaction,
} from "./seats.ts";
import type { Auth, Variant } from "./seats.ts";

const URL = process.env.S23_DATABASE_URL ?? "";
if (!/\/spike_s23(\?|$)/u.test(URL)) {
  throw new Error("S23_DATABASE_URL must point at the database spike_s23");
}
const TRIALS = Number(process.env.TRIALS ?? 50);

const connect = (max = 10) => {
  const client = postgres(URL, { max, onnotice: () => {} });
  return { client, db: drizzle(client) };
};

type Db = PostgresJsDatabase;

/** A fresh org with `seats` seats of one tariff, its domain, and nobody in it yet. */
const seedOrg = async (db: Db, seats: number) => {
  const orgId = randomUUID();
  const tariffId = randomUUID();
  const domain = `${orgId.slice(0, 8)}.example.test`;
  await db.execute(sql`insert into organizations (id, name) values (${orgId}, 'Org')`);
  await db.execute(sql`insert into tariffs (id, name) values (${tariffId}, 'Обычный')`);
  await db.execute(sql`insert into org_seats values (${orgId}, ${tariffId}, ${seats})`);
  await db.execute(sql`insert into organization_domains values (${domain}, ${orgId}, ${tariffId})`);
  return { domain, orgId, tariffId };
};

const countIn = async (db: Db, orgId: string) => {
  const [row] = await db.execute<{ users: number; sessions: number }>(sql`
    select (select count(*)::int from "user" where organization_id = ${orgId}) as users,
           (select count(*)::int from session s join "user" u on u.id = s.user_id where u.organization_id = ${orgId})
             as sessions
  `);
  return row ?? { sessions: 0, users: 0 };
};

type Outcome = "in" | "no-seats" | `error: ${string}`;

const outcomeOf = (error: unknown): Outcome => {
  const e = error as { body?: { code?: string; message?: string }; message?: string };
  if (e.body?.code === "NO_FREE_SEATS") {
    return "no-seats";
  }
  return `error: ${e.body?.code ?? e.message ?? String(error)}`;
};

/** The sign-in action: a code, then `signInEmailOTP` — wrapped in our transaction for variant B. */
const signInByCode = async (auth: Auth, email: string, wrap: boolean): Promise<Outcome> => {
  const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  try {
    const call = () => auth.api.signInEmailOTP({ body: { email, otp } });
    await (wrap ? signUpInTransaction(auth, call) : call());
    return "in";
  } catch (error) {
    return outcomeOf(error);
  }
};

const tally = (outcomes: string[]) => {
  const counts: Record<string, number> = {};
  for (const o of outcomes) {
    counts[o] = (counts[o] ?? 0) + 1;
  }
  return counts;
};

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

const report: Record<string, unknown> = {};
const log = (name: string, value: unknown) => {
  report[name] = value;
  console.log(name.padEnd(34), JSON.stringify(value));
};

// ——— 1, 2. Domain sign-in: two people take the last seat at once ———

const domainRace = async (db: Db, variant: Variant) => {
  const auth = makeAuth(db, variant);
  let overbooked = 0;
  let exactlyOne = 0;
  let orphans = 0;
  let loserCodeKept = 0;
  const outcomes: string[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const org = await seedOrg(db, 1);
    const emails = [`a@${org.domain}`, `b@${org.domain}`];
    const results = await Promise.all(emails.map((e) => signInByCode(auth, e, variant === "shared-tx")));
    outcomes.push(...results);
    const { users, sessions } = await countIn(db, org.orgId);
    if (users > 1) {
      overbooked++;
    }
    if (users === 1 && results.filter((r) => r === "in").length === 1) {
      exactlyOne++;
    }
    if (users !== sessions) {
      orphans++;
    }
    // The refused one: is their code still there to use once a seat is added?
    const loser = emails[results.indexOf("no-seats")];
    if (loser) {
      const kept = await db.execute(sql`select 1 from verification where identifier = ${`sign-in-otp-${loser}`}`);
      if (kept.length > 0) {
        loserCodeKept++;
      }
    }
  }
  return { exactlyOne, loserCodeKept, orphans, outcomes: tally(outcomes), overbooked, trials: TRIALS };
};

// ——— 3. Variant B, a direct POST past the action: no transaction of ours ———

const directPost = async (db: Db) => {
  const auth = makeAuth(db, "shared-tx");
  const org = await seedOrg(db, 5);
  const email = `direct@${org.domain}`;
  const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  const response = await auth.handler(
    new Request("http://localhost:3999/api/auth/sign-in/email-otp", {
      body: JSON.stringify({ email, otp }),
      headers: { "content-type": "application/json", origin: "http://localhost:3999" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as { code?: string };
  // An address of no listed domain, through the action: the hook answers `false`, as `canSignUp` does now.
  const stranger = await signInByCode(auth, "x@unlisted.example.test", true);
  return { code: body.code, status: response.status, stranger, users: (await countIn(db, org.orgId)).users };
};

// ——— 4, 5. Invitations: our own transaction ———

const insertOpenInvitation = async (db: Db, orgId: string, tariffId: string) => {
  const issued = await issueInvitation(db, { orgId, tariffId }, { lock: false });
  if (!issued.ok) {
    throw new Error("seed invitation refused");
  }
  return issued.token;
};

/**
 * Two open invitations, one seat: the seats were cut after the invitations went out (as the platform can) — the one
 * way two invitations can be open on one free seat while each invitation holds a seat. Both accept at once.
 */
const acceptRace = async (db: Db, lock: boolean) => {
  let overbooked = 0;
  let exactlyOne = 0;
  const outcomes: string[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const org = await seedOrg(db, 2);
    const tokens = [
      await insertOpenInvitation(db, org.orgId, org.tariffId),
      await insertOpenInvitation(db, org.orgId, org.tariffId),
    ];
    await db.execute(sql`update org_seats set seats = 1 where organization_id = ${org.orgId}`);
    const results = await Promise.all(
      tokens.map((token, n) =>
        acceptInvitation(db, { email: `inv${n}@${org.domain}`, name: `Inv ${n}`, token }, { lock }),
      ),
    );
    outcomes.push(...results.map((r) => (r.ok ? "in" : r.reason)));
    const { users } = await countIn(db, org.orgId);
    if (users > 1) {
      overbooked++;
    }
    if (users === 1) {
      exactlyOne++;
    }
  }
  return { exactlyOne, outcomes: tally(outcomes), overbooked, trials: TRIALS };
};

const issueRace = async (db: Db, lock: boolean) => {
  let overbooked = 0;
  const outcomes: string[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const org = await seedOrg(db, 1);
    const results = await Promise.all([
      issueInvitation(db, { orgId: org.orgId, tariffId: org.tariffId }, { lock }),
      issueInvitation(db, { orgId: org.orgId, tariffId: org.tariffId }, { lock }),
    ]);
    outcomes.push(...results.map((r) => (r.ok ? "issued" : r.reason)));
    const [open] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from invitations where organization_id = ${org.orgId}`,
    );
    if ((open?.n ?? 0) > 1) {
      overbooked++;
    }
  }
  return { outcomes: tally(outcomes), overbooked, trials: TRIALS };
};

// ——— 6. One seat: a domain sign-in (variant B) against an invitation going out ———

const mixedRace = async (db: Db) => {
  const auth = makeAuth(db, "shared-tx");
  let overbooked = 0;
  const outcomes: string[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const org = await seedOrg(db, 1);
    const [signIn, issued] = await Promise.all([
      signInByCode(auth, `d@${org.domain}`, true),
      issueInvitation(db, { orgId: org.orgId, tariffId: org.tariffId }),
    ]);
    outcomes.push(`signIn:${signIn}`, `invite:${issued.ok ? "issued" : issued.reason}`);
    const { users } = await countIn(db, org.orgId);
    const [open] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from invitations where organization_id = ${org.orgId}`,
    );
    if (users + (open?.n ?? 0) > 1) {
      overbooked++;
    }
  }
  return { outcomes: tally(outcomes), overbooked, trials: TRIALS };
};

// ——— 7. Claim: the first organization, then the sign-in through Better Auth ———

const claimE2e = async (db: Db) => {
  const auth = makeAuth(db, "shared-tx");
  const tokens = [await issueClaimToken(db), await issueClaimToken(db)];
  const results = await Promise.all(
    tokens.map((token, n) =>
      redeemClaim(db, { email: `owner${n}@example.test`, name: `Owner ${n}`, orgName: "Первая", token }),
    ),
  );
  const winner = results.findIndex((r) => r.ok);
  const email = `owner${winner}@example.test`;
  // As the claim action: the link is the proof, so a code is made and spent at once.
  const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  const { headers } = await auth.api.signInEmailOTP({ body: { email, otp }, returnHeaders: true });
  const cookie = (headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  const [orgs] = await db.execute<{ n: number }>(sql`select count(*)::int as n from organizations`);
  const u = session?.user as { organizationId?: string; orgRole?: string; role?: string } | undefined;
  return {
    claims: results.map((r) => (r.ok ? "ok" : r.reason)),
    orgs: orgs?.n,
    session: Boolean(session),
    sessionOrgMatches: u?.organizationId === (results[winner] as { orgId?: string }).orgId,
    sessionOrgRole: u?.orgRole,
    sessionRole: u?.role,
  };
};

// ——— 8. Time of one sign-up, nobody competing ———

const timing = async (db: Db, variant: Variant) => {
  const auth = makeAuth(db, variant);
  const org = await seedOrg(db, 1000);
  const ms: number[] = [];
  for (let i = 0; i < 40; i++) {
    const email = `t${i}@${org.domain}`;
    const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
    const start = performance.now();
    const call = () => auth.api.signInEmailOTP({ body: { email, otp } });
    await (variant === "shared-tx" ? signUpInTransaction(auth, call) : call());
    ms.push(performance.now() - start);
  }
  return { p50: Number(percentile(ms, 50).toFixed(1)), p95: Number(percentile(ms, 95).toFixed(1)) };
};

// ——— 9. 20 at once on 5 seats, pool of 10: who waits on the lock holds a connection ———

const stampede = async (sessionCheck: "pool" | "tx") => {
  const { client, db } = connect(10);
  const auth = makeAuth(db, "shared-tx", { sessionCheck });
  const org = await seedOrg(db, 5);
  const emails = Array.from({ length: 20 }, (_, i) => `s${i}@${org.domain}`);
  const otps = await Promise.all(
    emails.map((email) => auth.api.createVerificationOTP({ body: { email, type: "sign-in" } })),
  );
  const start = performance.now();
  const run = Promise.all(
    emails.map(async (email, i) => {
      try {
        await signUpInTransaction(auth, () => auth.api.signInEmailOTP({ body: { email, otp: otps[i] ?? "" } }));
        return "in";
      } catch (error) {
        return outcomeOf(error);
      }
    }),
  );
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 10_000));
  const result = await Promise.race([run, timeout]);
  const elapsedMs = Math.round(performance.now() - start);
  await client.end({ timeout: 0 }).catch(() => {});
  if (result === "timeout") {
    return { elapsedMs, result: "hung >10 s" };
  }
  return { elapsedMs, outcomes: tally(result) };
};

const main = async () => {
  const { client, db } = connect(10);
  await resetSchema(db);

  log("7 claim e2e", await claimE2e(db));
  log("1 domain, hook own tx (A)", await domainRace(db, "own-tx"));
  log("2 domain, shared tx (B)", await domainRace(db, "shared-tx"));
  log("3 B: direct POST", await directPost(db));
  log("4 accept, FOR UPDATE", await acceptRace(db, true));
  log("4c accept, no lock", await acceptRace(db, false));
  log("5 issue, FOR UPDATE", await issueRace(db, true));
  log("5c issue, no lock", await issueRace(db, false));
  log("6 domain B vs invite", await mixedRace(db));
  log("8 timing A, ms", await timing(db, "own-tx"));
  log("8 timing B, ms", await timing(db, "shared-tx"));
  log("after hook saw the user", afterHookSaw);
  await client.end();
  log("9 stampede, check via pool", await stampede("pool"));
  log("9 stampede, check via tx", await stampede("tx"));
  console.log(`message: ${NO_FREE_SEATS}`);
  process.exit(0);
};

await main();
