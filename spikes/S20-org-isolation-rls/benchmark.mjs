import postgres from "postgres";
import { performance } from "node:perf_hooks";

const organizationIds = [
  "00000000-0000-4000-8000-00000000000a",
  "00000000-0000-4000-8000-00000000000b",
];
const adminUrl = process.env.S20_ADMIN_DATABASE_URL;
if (!adminUrl) {
  throw new Error("Set S20_ADMIN_DATABASE_URL to a DSN whose database is spike_s20.");
}
const parsedAdminUrl = new URL(adminUrl);
if (parsedAdminUrl.pathname !== "/spike_s20") {
  throw new Error("Refusing to run: S20_ADMIN_DATABASE_URL must target only /spike_s20.");
}
const appUrl = new URL(parsedAdminUrl);
appUrl.username = "spike_s20_app";
appUrl.password = "s20-local-only";

const sessions = Number(process.env.S20_SESSIONS ?? 40);
const durationMs = Number(process.env.S20_DURATION_MS ?? 120_000);
const warmupMs = Number(process.env.S20_WARMUP_MS ?? 5_000);
const intervalMs = Number(process.env.S20_INTERVAL_MS ?? 1_000);
const poolMax = 10;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (sorted, p) => sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
const admin = postgres(parsedAdminUrl.toString(), { max: 1, idle_timeout: 0 });
const app = postgres(appUrl.toString(), { max: poolMax, idle_timeout: 0, prepare: false });

async function setRls(enabled) {
  const action = enabled ? "ENABLE" : "DISABLE";
  await admin.unsafe(`ALTER TABLE public.catalog_items ${action} ROW LEVEL SECURITY`);
  await admin.unsafe(`ALTER TABLE public.model_runs ${action} ROW LEVEL SECURITY`);
}

async function runPhase(name, withRls, phaseDurationMs = durationMs) {
  const samples = [];
  const backendPids = new Set();
  const errors = [];
  const startedAt = performance.now();
  const endAt = startedAt + phaseDurationMs;

  await Promise.all(
    Array.from({ length: sessions }, async (_, sessionIndex) => {
      const orgId = organizationIds[sessionIndex % organizationIds.length];
      let nextAt = startedAt + (sessionIndex * intervalMs) / sessions;
      while (performance.now() < endAt) {
        const delay = nextAt - performance.now();
        if (delay > 0) await wait(delay);
        if (performance.now() >= endAt) break;
        const transactionStartedAt = performance.now();
        try {
          const [row] = await app.begin(async (tx) => {
            if (withRls) {
              await tx`SELECT set_config('app.org_id', ${orgId}, true)`;
            }
            return tx`
              SELECT
                pg_backend_pid() AS pid,
                (SELECT count(*)::integer FROM public.catalog_items WHERE organization_id = ${orgId}) AS catalog_count,
                (SELECT count(*)::integer FROM public.model_runs WHERE organization_id = ${orgId}) AS model_run_count
            `;
          });
          samples.push(performance.now() - transactionStartedAt);
          backendPids.add(Number(row.pid));
          if (row.catalog_count !== 5000 || row.model_run_count !== 50000) {
            errors.push(`unexpected counts ${row.catalog_count}/${row.model_run_count}`);
          }
        } catch (error) {
          errors.push(String(error));
        }
        nextAt += intervalMs;
      }
    }),
  );

  const sorted = samples.toSorted((a, b) => a - b);
  return {
    mode: name,
    logicalChatSessions: sessions,
    configuredPoolMax: poolMax,
    observedBackendConnections: backendPids.size,
    transactions: samples.length,
    durationSeconds: Math.round((performance.now() - startedAt) / 1000),
    p50Ms: Number(percentile(sorted, 50).toFixed(3)),
    p95Ms: Number(percentile(sorted, 95).toFixed(3)),
    errors: errors.length,
    firstError: errors[0] ?? null,
  };
}

async function leakReproduction() {
  const pool = postgres(appUrl.toString(), { max: 1, idle_timeout: 0, prepare: false });
  const first = await pool.reserve();
  await first`SELECT set_config('app.org_id', ${organizationIds[0]}, false)`;
  const [orgA] = await first`
    SELECT pg_backend_pid() AS pid, array_agg(DISTINCT organization_id::text) AS visible_orgs
    FROM public.catalog_items
  `;
  first.release();

  const second = await pool.reserve();
  const [orgBRequestWithoutContext] = await second`
    SELECT pg_backend_pid() AS pid, array_agg(DISTINCT organization_id::text) AS visible_orgs
    FROM public.catalog_items
  `;
  second.release();
  const [orgBInsideLocalTransaction] = await pool.begin(async (tx) => {
    await tx`SELECT set_config('app.org_id', ${organizationIds[1]}, true)`;
    return tx`
      SELECT pg_backend_pid() AS pid, array_agg(DISTINCT organization_id::text) AS visible_orgs
      FROM public.catalog_items
    `;
  });
  const [afterLocalTransaction] = await pool`
    SELECT pg_backend_pid() AS pid, array_agg(DISTINCT organization_id::text) AS visible_orgs
    FROM public.catalog_items
  `;
  await pool.end();
  return {
    expectedOrgForSecondRequest: organizationIds[1],
    firstRequest: orgA,
    secondRequestWithoutSetConfig: orgBRequestWithoutContext,
    orgBInsideTransactionLocal: orgBInsideLocalTransaction,
    afterTransactionLocalRevertsToSessionSetting: afterLocalTransaction,
    samePooledBackend:
      Number(orgA.pid) === Number(orgBRequestWithoutContext.pid) &&
      Number(orgA.pid) === Number(orgBInsideLocalTransaction.pid) &&
      Number(orgA.pid) === Number(afterLocalTransaction.pid),
  };
}

async function localSettingIsolation() {
  const pool = postgres(appUrl.toString(), { max: 1, idle_timeout: 0, prepare: false });
  const scopedRows = [];
  for (const orgId of organizationIds) {
    const [row] = await pool.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${orgId}, true)`;
      return tx`
        SELECT
          (SELECT count(*)::integer FROM public.catalog_items) AS catalog_visible,
          (SELECT array_agg(DISTINCT organization_id::text) FROM public.catalog_items) AS catalog_org_ids,
          (SELECT count(*)::integer FROM public.model_runs) AS model_runs_visible,
          (SELECT array_agg(DISTINCT organization_id::text) FROM public.model_runs) AS model_runs_org_ids
      `;
    });
    scopedRows.push({
      catalogVisible: row.catalog_visible,
      catalogOrgIds: row.catalog_org_ids,
      modelRunsVisible: row.model_runs_visible,
      modelRunsOrgIds: row.model_runs_org_ids,
    });
  }
  const [unset] = await pool`
    SELECT
      (SELECT count(*)::integer FROM public.catalog_items) AS catalog_visible,
      (SELECT count(*)::integer FROM public.model_runs) AS model_runs_visible
  `;
  let catalogWriteErrorCode = null;
  try {
    await pool.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${organizationIds[0]}, true)`;
      await tx`
        INSERT INTO public.catalog_items (organization_id, item_key, payload)
        VALUES (${organizationIds[1]}, 'spike-rls-cross-tenant-probe', '{}'::jsonb)
      `;
    });
  } catch (error) {
    catalogWriteErrorCode = error.code ?? null;
  }
  if (catalogWriteErrorCode === null) {
    await admin`
      DELETE FROM public.catalog_items
      WHERE item_key = 'spike-rls-cross-tenant-probe'
    `;
  }
  let modelRunWriteErrorCode = null;
  try {
    await pool.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${organizationIds[0]}, true)`;
      await tx`
        INSERT INTO public.model_runs (organization_id, model, created_at, input_tokens, output_tokens)
        VALUES (${organizationIds[1]}, 'spike-rls-cross-tenant-probe', now(), 0, 0)
      `;
    });
  } catch (error) {
    modelRunWriteErrorCode = error.code ?? null;
  }
  if (modelRunWriteErrorCode === null) {
    await admin`
      DELETE FROM public.model_runs
      WHERE model = 'spike-rls-cross-tenant-probe'
    `;
  }
  await pool.end();
  return {
    transactionLocalRows: scopedRows,
    rowsWithNoTransactionContext: {
      catalog: unset.catalog_visible,
      modelRuns: unset.model_runs_visible,
    },
    crossOrgCatalogInsertDenied: catalogWriteErrorCode === "42501",
    crossOrgCatalogInsertSqlState: catalogWriteErrorCode,
    crossOrgModelRunInsertDenied: modelRunWriteErrorCode === "42501",
    crossOrgModelRunInsertSqlState: modelRunWriteErrorCode,
  };
}

try {
  console.log(`Starting baseline: ${sessions} sessions, ${durationMs / 1000}s, pool ${poolMax}`);
  await setRls(false);
  const baselineWarmup = await runPhase("baseline warmup", false, warmupMs);
  console.log(`Baseline warmup complete: ${baselineWarmup.transactions} transactions`);
  const withoutRls = await runPhase("without RLS", false);
  console.log(
    `Baseline complete: ${withoutRls.transactions} transactions, p95 ${withoutRls.p95Ms} ms`,
  );
  console.log(`Starting RLS phase: ${sessions} sessions, ${durationMs / 1000}s, pool ${poolMax}`);
  await setRls(true);
  const rlsWarmup = await runPhase("RLS warmup", true, warmupMs);
  console.log(`RLS warmup complete: ${rlsWarmup.transactions} transactions`);
  const withRls = await runPhase("with RLS + set_config(local)", true);
  console.log(`RLS phase complete: ${withRls.transactions} transactions, p95 ${withRls.p95Ms} ms`);
  const sessionLeak = await leakReproduction();
  const transactionLocal = await localSettingIsolation();
  console.log(
    JSON.stringify(
      {
        config: {
          sessions,
          durationSeconds: durationMs / 1000,
          warmupSeconds: warmupMs / 1000,
          intervalMs,
          poolMax,
        },
        warmupTransactions: {
          withoutRls: baselineWarmup.transactions,
          withRls: rlsWarmup.transactions,
        },
        withoutRls,
        withRls,
        rlsLatencyDeltaMs: Number((withRls.p95Ms - withoutRls.p95Ms).toFixed(3)),
        sessionLeak,
        transactionLocal,
      },
      null,
      2,
    ),
  );
  if (withoutRls.errors || withRls.errors) process.exitCode = 1;
} finally {
  await app.end();
  await admin.end();
}
