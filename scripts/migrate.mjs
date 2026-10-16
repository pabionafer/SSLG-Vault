// Migration runner + backup tool for SSLG-Vault.
//
//   node scripts/migrate.mjs status           — show applied / pending migrations
//   node scripts/migrate.mjs apply            — run pending scripts/migrations/*.sql
//   node scripts/migrate.mjs backup [label]   — dump every public table to backups/
//
// Each migration file runs inside its own transaction and is recorded in
// public.schema_migrations (checksum included) so re-runs are no-ops and
// tampering with an applied file is reported.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnv() {
  const env = {};
  const file = path.join(root, ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v && !(k in env)) env[k] = v;
  }
  return env;
}

/** Parse postgres://user:pass@host:port/db even when the password contains @ or : */
function parseDatabaseUrl(url) {
  if (!url) throw new Error("DATABASE_URL is not set (.env.local or environment)");
  const withoutScheme = url.replace(/^postgres(?:ql)?:\/\//, "");
  const at = withoutScheme.lastIndexOf("@");
  if (at < 0) throw new Error("DATABASE_URL is malformed");
  const userinfo = withoutScheme.slice(0, at);
  const [hostPort, database = "postgres"] = withoutScheme.slice(at + 1).split("/");
  const [host, port] = hostPort.split(":");
  const colon = userinfo.indexOf(":");
  return {
    user: decodeURIComponent(userinfo.slice(0, colon)),
    password: decodeURIComponent(userinfo.slice(colon + 1)),
    host,
    port: Number(port || 5432),
    database,
    ssl: { rejectUnauthorized: false },
  };
}

function connect(env) {
  return new pg.Client(parseDatabaseUrl(env.DATABASE_URL));
}

const MIGRATIONS_DIR = path.join(root, "scripts", "migrations");

function migrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function ensureLedger(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      id          text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )`);
}

async function status(client) {
  await ensureLedger(client);
  const { rows } = await client.query("select id, checksum, applied_at from public.schema_migrations order by id");
  const applied = new Map(rows.map((r) => [r.id, r]));
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const sum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    const row = applied.get(file);
    if (!row) console.log(`PENDING  ${file} (${sum})`);
    else if (row.checksum !== sum)
      console.log(`CHANGED  ${file} — applied as ${row.checksum} but file is now ${sum}`);
    else console.log(`applied  ${file} at ${row.applied_at.toISOString()}`);
  }
  for (const id of applied.keys()) {
    if (!migrationFiles().includes(id)) console.log(`UNKNOWN  ${id} recorded in schema_migrations but file is missing`);
  }
}

async function apply(client) {
  await ensureLedger(client);
  const { rows } = await client.query("select id, checksum from public.schema_migrations");
  const applied = new Map(rows.map((r) => [r.id, r.checksum]));
  let ran = 0;
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const sum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    if (applied.has(file)) {
      if (applied.get(file) !== sum) {
        console.error(`ERROR ${file} was already applied with a different checksum — create a new migration instead.`);
        process.exitCode = 1;
      }
      continue;
    }
    console.log(`applying ${file} ...`);
    const started = Date.now();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (id, checksum) values ($1, $2)", [file, sum]);
      await client.query("commit");
      console.log(`  ok (${Date.now() - started}ms)`);
      ran++;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`  FAILED: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(ran === 0 ? "nothing to apply" : `${ran} migration(s) applied`);
}

async function backup(client, label) {
  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  const out = { created_at: new Date().toISOString(), label: label ?? null, tables: {} };
  let total = 0;
  for (const { table_name } of tables) {
    const { rows } = await client.query(`select * from public."${table_name}"`);
    out.tables[table_name] = rows;
    total += rows.length;
    console.log(`  ${table_name}: ${rows.length} row(s)`);
  }
  const dir = path.join(root, "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = out.created_at.replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}${label ? `_${label}` : ""}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`backup written: ${path.relative(root, file)} (${tables.length} tables, ${total} rows)`);
}

const cmd = process.argv[2] ?? "apply";
const client = connect(readEnv());
try {
  await client.connect();
  if (cmd === "status") await status(client);
  else if (cmd === "apply") await apply(client);
  else if (cmd === "backup") await backup(client, process.argv[3]);
  else {
    console.error(`unknown command "${cmd}" — use apply | status | backup`);
    process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => {});
}
