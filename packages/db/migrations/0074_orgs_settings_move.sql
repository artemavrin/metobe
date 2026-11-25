-- Organization settings, step 3 of the organizations work (D48, ARCH §20.6, ORGS-PLAN O3): the organization's parts of
-- `system_settings.policies` live in `organizations.settings` from now on. Expand copied them once, but the release
-- before this one went on writing them in `policies`, so they are copied again — the install's settings read as they
-- did. Only the organization's parts: the data protection's service address and switch stay with the platform
-- (`policies.privacy.url`, `.bundled`). The keys are not removed from `policies`: the release before still reads them
-- there, and a rollback must find them; contract takes them out. Nothing to copy when there is no organization yet
-- (the claim makes it) or no policies; runs once, like every migration.
UPDATE "organizations" AS o
SET "settings" = o."settings" || coalesce(jsonb_strip_nulls(jsonb_build_object(
	'access', s."policies" -> 'access',
	'personalConnections', s."policies" -> 'personalConnections',
	'personalApprovalDefaults', s."policies" -> 'personalApprovalDefaults',
	'privacy', CASE WHEN jsonb_typeof(s."policies" -> 'privacy') = 'object' THEN (s."policies" -> 'privacy') - 'url' - 'bundled' END
)), '{}'::jsonb)
FROM "system_settings" AS s
WHERE s."id" = 1
	AND o."id" = (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1);
