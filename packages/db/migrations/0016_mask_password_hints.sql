-- A password's hint, and a short secret's, shows only that it is set (core/secrets-crypto `HIDDEN_HINT`). Hints
-- stored before kept a tail — four characters of a short secret, the password's end and, for a user's own MCP basic
-- auth, the login's start: short secrets (their hint began with «••••»), proxy passwords, and MCP basic auth,
-- whose secret is a `token` — of a shared server, or of a user's own connection to it.
UPDATE "secrets" SET "hint" = '••••••'
WHERE "hint" LIKE '••••%'
  OR "purpose" = 'password'
  OR ("purpose" = 'token' AND "owner_type" = 'catalog_item' AND "owner_id" IN (
    SELECT "id"::text FROM "catalog_items" WHERE "config"->>'auth' = 'basic'
  ))
  OR ("purpose" = 'token' AND "owner_type" = 'connection' AND "owner_id" IN (
    SELECT "connections"."id"::text FROM "connections"
    JOIN "catalog_items" ON "catalog_items"."id" = "connections"."catalog_id"
    WHERE "catalog_items"."config"->>'auth' = 'basic'
  ));
