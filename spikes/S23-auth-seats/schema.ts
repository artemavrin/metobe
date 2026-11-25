// S23: the tables of the spike, in spike_s23 only. Better Auth's four as in packages/db/src/schema/auth.ts (only the
// columns this spike needs) plus what ARCH §20.4 adds for organizations and seats.

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  role: text("role").default("user").notNull(),
  organizationId: text("organization_id"),
  orgRole: text("org_role"),
  tariffId: text("tariff_id"),
  disabledAt: timestamp("disabled_at"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authSchema = { account, session, user, verification };

/** Drops and makes every table of the spike: each scenario starts from nothing. */
export const resetSchema = async (db: PostgresJsDatabase) => {
  await db.execute(sql.raw(`
    drop table if exists organization_domains, invitations, org_seats, tariffs, organizations, verification, account,
      session, "user", claim_tokens cascade;

    create table organizations (
      id text primary key,
      name text not null,
      status text not null default 'active',
      created_at timestamp not null default now()
    );
    create table tariffs (id text primary key, name text not null);
    -- One row per (organization, tariff): the row every change of seats locks (ARCH §20.10).
    create table org_seats (
      organization_id text not null references organizations(id) on delete cascade,
      tariff_id text not null references tariffs(id),
      seats integer not null,
      primary key (organization_id, tariff_id)
    );
    -- Who comes in by the code of the mail without an invitation, and on which tariff (O6). A domain is one org's.
    create table organization_domains (
      domain text primary key,
      organization_id text not null references organizations(id) on delete cascade,
      tariff_id text references tariffs(id)
    );

    create table "user" (
      id text primary key,
      name text not null,
      email text not null unique,
      email_verified boolean not null default false,
      image text,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now(),
      role text not null default 'user',
      organization_id text references organizations(id),
      org_role text,
      tariff_id text references tariffs(id),
      disabled_at timestamp
    );
    create index user_organization_id_idx on "user"(organization_id, tariff_id);
    create table session (
      id text primary key,
      expires_at timestamp not null,
      token text not null unique,
      created_at timestamp not null default now(),
      updated_at timestamp not null,
      ip_address text,
      user_agent text,
      user_id text not null references "user"(id) on delete cascade
    );
    create table account (
      id text primary key,
      account_id text not null,
      provider_id text not null,
      user_id text not null references "user"(id) on delete cascade,
      access_token text, refresh_token text, id_token text,
      access_token_expires_at timestamp, refresh_token_expires_at timestamp,
      scope text, password text,
      created_at timestamp not null default now(),
      updated_at timestamp not null
    );
    create table verification (
      id text primary key,
      identifier text not null,
      value text not null,
      expires_at timestamp not null,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    );
    create index verification_identifier_idx on verification(identifier);

    create table invitations (
      id text primary key,
      token_hash text not null unique,
      email text,
      organization_id text not null references organizations(id) on delete cascade,
      org_role text not null default 'member',
      tariff_id text references tariffs(id),
      expires_at timestamp not null,
      accepted_at timestamp,
      accepted_by text
    );
    create table claim_tokens (
      id serial primary key,
      token_hash text not null unique,
      expires_at timestamp not null,
      used_at timestamp
    );
  `));
};
