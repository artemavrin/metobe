// S23: seats under `SELECT … FOR UPDATE` of `org_seats (organization, tariff)` (ARCH §20.10), and the three ways a
// person comes in: an invitation (our own transaction, as `redeemInvitation` now), the claim (our own transaction, as
// `redeemClaimToken` now) and a sign-in by the mail's code with a listed domain — the one way Better Auth makes the user.

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { runWithTransaction } from "@better-auth/core/context";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { authSchema } from "./schema.ts";

type Db = PostgresJsDatabase;
/** A drizzle transaction or the database itself: both run `execute`. */
type Runner = Pick<Db, "execute">;

export const NO_FREE_SEATS = "Свободных мест нет. Владелец организации может добавить место";

export class NoFreeSeatsError extends Error {
  constructor() {
    super(NO_FREE_SEATS);
    this.name = "NoFreeSeatsError";
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Takes a seat of the tariff in the org, or throws `NoFreeSeatsError`. Locks the row `org_seats (org, tariff)` until the
 * transaction ends: every other change of these seats waits here, then counts what this one wrote.
 *
 * Occupied = active people on the tariff + open invitations to it (ARCH §20.10). An invitation already holds its seat,
 * so accepting one only checks the active people: when seats were cut below what is occupied, the first to accept wins.
 * `lock: false` — the control without the lock: the same count, open to the race.
 */
export const takeSeat = async (
  tx: Runner,
  input: { orgId: string; tariffId: string | null; kind: "accept" | "join" | "issue" },
  { lock = true }: { lock?: boolean } = {},
) => {
  // No tariff — self-hosted: no seats to count.
  if (!input.tariffId) {
    return;
  }
  const [row] = await tx.execute<{ seats: number }>(
    lock
      ? sql`select seats from org_seats where organization_id = ${input.orgId} and tariff_id = ${input.tariffId} for update`
      : sql`select seats from org_seats where organization_id = ${input.orgId} and tariff_id = ${input.tariffId}`,
  );
  if (!row) {
    throw new NoFreeSeatsError();
  }
  const [count] = await tx.execute<{ active: number; open: number }>(sql`
    select
      (select count(*)::int from "user" where organization_id = ${input.orgId} and tariff_id = ${input.tariffId}
        and disabled_at is null) as active,
      (select count(*)::int from invitations where organization_id = ${input.orgId} and tariff_id = ${input.tariffId}
        and accepted_at is null and expires_at > now()) as open
  `);
  const occupied = (count?.active ?? 0) + (input.kind === "accept" ? 0 : (count?.open ?? 0));
  if (occupied >= row.seats) {
    throw new NoFreeSeatsError();
  }
};

// ——— Invitations: our code, our transaction ———

export const issueInvitation = async (
  db: Db,
  input: { orgId: string; tariffId: string | null; email?: string },
  opts?: { lock?: boolean },
) => {
  const token = randomBytes(32).toString("base64url");
  try {
    await db.transaction(async (tx) => {
      await takeSeat(tx, { ...input, kind: "issue" }, opts);
      await tx.execute(sql`
        insert into invitations (id, token_hash, email, organization_id, tariff_id, expires_at)
        values (${randomUUID()}, ${hashToken(token)}, ${input.email ?? null}, ${input.orgId}, ${input.tariffId},
          now() + interval '7 days')
      `);
    });
  } catch (error) {
    if (error instanceof NoFreeSeatsError) {
      return { ok: false as const, reason: "no-seats" as const };
    }
    throw error;
  }
  return { ok: true as const, token };
};

export type AcceptResult = { ok: true; userId: string } | { ok: false; reason: "invalid-token" | "no-seats" };

/** `redeemInvitation` with organization and seat: the global advisory lock gives way to the row of the seats. */
export const acceptInvitation = async (
  db: Db,
  input: { email: string; name: string; token: string },
  opts?: { lock?: boolean },
): Promise<AcceptResult> => {
  try {
    return await db.transaction(async (tx) => {
      // `for update` of the invitation: one link makes one person even when two open it at once.
      const [inv] = await tx.execute<{ id: string; organization_id: string; org_role: string; tariff_id: string | null }>(
        sql`select id, organization_id, org_role, tariff_id from invitations
            where token_hash = ${hashToken(input.token)} and accepted_at is null and expires_at > now() for update`,
      );
      if (!inv) {
        return { ok: false, reason: "invalid-token" } as const;
      }
      await takeSeat(tx, { kind: "accept", orgId: inv.organization_id, tariffId: inv.tariff_id }, opts);
      const id = randomUUID();
      await tx.execute(sql`
        insert into "user" (id, email, email_verified, name, role, organization_id, org_role, tariff_id)
        values (${id}, ${input.email.toLowerCase()}, true, ${input.name}, 'user', ${inv.organization_id},
          ${inv.org_role}, ${inv.tariff_id})
      `);
      await tx.execute(sql`update invitations set accepted_at = now(), accepted_by = ${id} where id = ${inv.id}`);
      return { ok: true, userId: id } as const;
    });
  } catch (error) {
    if (error instanceof NoFreeSeatsError) {
      return { ok: false, reason: "no-seats" };
    }
    throw error;
  }
};

// ——— Claim: our code, our transaction ———

const CLAIM_LOCK_KEY = 7_272_702;

export const issueClaimToken = async (db: Db) => {
  const token = randomBytes(32).toString("base64url");
  await db.execute(
    sql`insert into claim_tokens (token_hash, expires_at) values (${hashToken(token)}, now() + interval '1 day')`,
  );
  return token;
};

/** `redeemClaimToken` plus the first organization: the superuser is made its owner, with no tariff (self-hosted). */
export const redeemClaim = (db: Db, input: { email: string; name: string; orgName: string; token: string }) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`);
    const taken = await tx.execute(sql`select 1 from "user" where role = 'superuser' limit 1`);
    if (taken.length > 0) {
      return { ok: false, reason: "already-claimed" } as const;
    }
    const used = await tx.execute(sql`
      update claim_tokens set used_at = now()
      where token_hash = ${hashToken(input.token)} and used_at is null and expires_at > now() returning id
    `);
    if (used.length === 0) {
      return { ok: false, reason: "invalid-token" } as const;
    }
    const orgId = randomUUID();
    await tx.execute(sql`insert into organizations (id, name) values (${orgId}, ${input.orgName})`);
    await tx.execute(sql`
      insert into "user" (id, email, email_verified, name, role, organization_id, org_role)
      values (${randomUUID()}, ${input.email.toLowerCase()}, true, ${input.name}, 'superuser', ${orgId}, 'owner')
    `);
    return { ok: true, orgId } as const;
  });

// ——— Domain sign-in: Better Auth makes the user ———

/**
 * The transaction Better Auth runs in, for our hooks: `drizzleAdapter` opens it with `db.transaction`, and this wrapper
 * keeps its handle where a hook can reach it — Better Auth hands a hook no transaction of its own.
 */
export const txScope = new AsyncLocalStorage<Runner>();

const scopedDb = (db: Db): Db =>
  new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "transaction") {
        return (run: (tx: Runner) => Promise<unknown>, config?: unknown) =>
          // oxlint-disable-next-line typescript/no-explicit-any -- the proxy passes drizzle's own arguments through
          (target.transaction as any)((tx: Runner) => txScope.run(tx, () => run(tx)), config);
      }
      return Reflect.get(target, prop, receiver);
    },
  });

const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

const findDomain = async (runner: Runner, email: string) => {
  const [row] = await runner.execute<{ organization_id: string; tariff_id: string | null }>(
    sql`select organization_id, tariff_id from organization_domains where domain = ${domainOf(email)}`,
  );
  return row ?? null;
};

const noSeats = () =>
  new APIError("FORBIDDEN", { code: "NO_FREE_SEATS", message: NO_FREE_SEATS });

/**
 * Variant A — what the hook can do on its own: a short transaction of its own around the count. Better Auth inserts the
 * user after it, as a separate statement, so the lock is gone by then.
 */
const ownTxBefore = (db: Db) => async (created: { email: string }) => {
  const domain = await findDomain(db, created.email);
  if (!domain) {
    return false;
  }
  try {
    await db.transaction((tx) =>
      takeSeat(tx, { kind: "join", orgId: domain.organization_id, tariffId: domain.tariff_id }),
    );
  } catch (error) {
    if (error instanceof NoFreeSeatsError) {
      throw noSeats();
    }
    throw error;
  }
  return {
    data: { ...created, organizationId: domain.organization_id, orgRole: "member", tariffId: domain.tariff_id },
  };
};

/**
 * Variant B — the hook inside the transaction that inserts the user: the caller opened it (`signUpInTransaction`). The
 * lock holds until the user, their session and the spent code are committed together; a refusal rolls all of it back.
 */
const sharedTxBefore = async (created: { email: string }) => {
  const tx = txScope.getStore();
  if (!tx) {
    // Not through our action (a direct POST to /api/auth/sign-in/email-otp): no transaction, so no new account.
    throw new APIError("FORBIDDEN", { code: "SIGN_UP_OUTSIDE_TRANSACTION", message: "Вход по домену — только из формы входа" });
  }
  const domain = await findDomain(tx, created.email);
  if (!domain) {
    return false;
  }
  try {
    await takeSeat(tx, { kind: "join", orgId: domain.organization_id, tariffId: domain.tariff_id });
  } catch (error) {
    if (error instanceof NoFreeSeatsError) {
      throw noSeats();
    }
    throw error;
  }
  return {
    data: { ...created, organizationId: domain.organization_id, orgRole: "member", tariffId: domain.tariff_id },
  };
};

export type Variant = "own-tx" | "shared-tx";

/** What `user.create.after` saw: whether the new user was already visible to another connection (committed). */
export const afterHookSaw = { committed: 0, notYet: 0 };

export const makeAuth = (
  db: Db,
  variant: Variant,
  {
    // As `isSignInAllowed` now: a read through the shared pool, outside the transaction.
    sessionCheck = "pool",
  }: { sessionCheck?: "pool" | "tx" } = {},
) => {
  const canSignIn = async (userId: string) => {
    const runner = (sessionCheck === "tx" ? txScope.getStore() : undefined) ?? db;
    const [found] = await runner.execute<{ disabled_at: Date | null }>(
      sql`select disabled_at from "user" where id = ${userId}`,
    );
    return !found?.disabled_at;
  };
  return betterAuth({
    advanced: { database: { generateId: () => randomUUID() } },
    baseURL: "http://localhost:3999",
    database: drizzleAdapter(variant === "shared-tx" ? scopedDb(db) : db, {
      provider: "pg",
      schema: authSchema,
      transaction: variant === "shared-tx",
    }),
    databaseHooks: {
      session: {
        create: { before: async (s) => ((await canSignIn(s.userId)) ? { data: s } : false) },
      },
      user: {
        create: {
          after: async (created) => {
            const seen = await db.execute(sql`select 1 from "user" where id = ${created.id}`);
            afterHookSaw[seen.length > 0 ? "committed" : "notYet"]++;
          },
          before: variant === "shared-tx" ? sharedTxBefore : ownTxBefore(db),
        },
      },
    },
    logger: { disabled: true },
    plugins: [
      emailOTP({
        allowedAttempts: 5,
        expiresIn: 600,
        sendVerificationOTP: async () => {},
        storeOTP: "hashed",
      }),
    ],
    secret: "spike-s23-secret-spike-s23-secret-0123456789",
    user: {
      additionalFields: {
        orgRole: { input: false, required: false, type: "string" },
        organizationId: { input: false, required: false, type: "string" },
        role: { defaultValue: "user", input: false, required: true, type: "string" },
        tariffId: { input: false, required: false, type: "string" },
      },
    },
  });
};

export type Auth = ReturnType<typeof makeAuth>;

/** Variant B: runs a Better Auth call inside one transaction of ours — the sign-in action would wrap `signInEmailOTP`. */
export const signUpInTransaction = async <T>(auth: Auth, run: () => Promise<T>) => {
  const ctx = await auth.$context;
  return runWithTransaction(ctx.adapter, run);
};
