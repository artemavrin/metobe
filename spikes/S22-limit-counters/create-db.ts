// Creates the spike database next to the dev one. Only `spike_s22` is touched.
import postgres from "postgres";

const url = new URL(process.env.DATABASE_URL!);
const name = url.pathname.slice(1);
if (name !== "spike_s22") throw new Error(`refusing to run against ${name}`);
url.pathname = "/postgres";
const admin = postgres(url.toString(), { max: 1 });
const rows = await admin`select 1 from pg_database where datname = ${name}`;
if (rows.length === 0) await admin.unsafe(`create database ${name}`);
console.log(rows.length === 0 ? "created" : "exists", name);
await admin.end();
