import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = "pryfscgeduwecclusbyt";

function readEnv() {
  const env = {};
  const raw = readFileSync(path.join(root, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function parseDbUrl(url) {
  const m = url.match(/^postgres(?:ql)?:\/\/([^:\/]+):(.+)@([^:\/]+):(\d+)\/([^?]+)$/);
  if (!m) throw new Error("DATABASE_URL is not a valid postgres URL");
  const [, user, password, host, port, database] = m;
  return { user, password, host, port: Number(port), database };
}

// The direct host (db.<ref>.supabase.co) is IPv6-only on this project and this
// machine has no IPv6 route, so fall back to the region's IPv4 pooler hosts.
function candidates(base) {
  const regions = ["ap-southeast-2", "ap-southeast-1", "ap-northeast-1", "us-east-1"];
  const list = [{ label: `direct ${base.host}:${base.port}`, cfg: { host: base.host, port: base.port, user: base.user } }];
  for (const r of regions) {
    for (const port of [5432, 6543]) {
      list.push({
        label: `pooler ${r}:${port} (user postgres.${REF})`,
        cfg: { host: `aws-0-${r}.pooler.supabase.com`, port, user: `postgres.${REF}` },
      });
      list.push({
        label: `pooler ${r}:${port} (user postgres)`,
        cfg: { host: `aws-0-${r}.pooler.supabase.com`, port, user: "postgres" },
      });
    }
  }
  return list;
}

async function connect(base, password, database) {
  for (const c of candidates(base)) {
    const client = new pg.Client({
      ...c.cfg,
      password,
      database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await client.connect();
      await client.query("select 1");
      console.log(`Connected via ${c.label}`);
      return client;
    } catch (err) {
      console.log(`  failed: ${c.label} — ${err.message}`);
      await client.end().catch(() => {});
    }
  }
  throw new Error("No connection path worked");
}

const env = readEnv();
const direct = parseDbUrl(env.DATABASE_URL);
const { password, database } = direct;
const schema = readFileSync(path.join(root, "scripts", "schema.sql"), "utf8");

let client;
try {
  client = await connect({ host: direct.host, port: direct.port, user: direct.user }, password, database);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exit(1);
}

try {
  await client.query(schema);
  console.log("\nschema.sql applied");

  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`);
  console.log(`\nTables (${rows.length}):`);
  for (const r of rows) console.log(`  - ${r.table_name}`);

  const { rows: pol } = await client.query(`
    select distinct tablename from pg_policies
    where schemaname = 'public' and policyname = 'authenticated_read'
    order by tablename`);
  console.log(`\nRLS authenticated_read policies: ${pol.length}/16`);

  const { rows: seeds } = await client.query(`
    select (select count(*) from public.categories) as categories,
           (select count(*) from public.system_settings) as settings`);
  console.log(`Seeds: ${seeds[0].categories} categories, ${seeds[0].settings} settings`);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
