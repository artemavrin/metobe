-- Organizations, O2 (D48, ARCH §20.4): when the platform turned a person off. Nullable, so the previous release keeps
-- working on it; the organization cannot undo it, unlike `disabled_at` (ORGS-PLAN §6).
ALTER TABLE "user" ADD COLUMN "blocked_at" timestamp;
