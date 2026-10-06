// Smoke test: logs in and exercises every implemented endpoint.
// Run dev server first:  npm run dev  then  npm run smoke
import process from "node:process";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const IDENT = process.env.SMOKE_USER ?? "admin";
const PASS = process.env.SMOKE_PASS ?? "Vault#Admin2026!";

let cookies = "";

async function login(identifier = IDENT, password = PASS): Promise<number> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (res.ok) {
    cookies = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  return res.status;
}

interface Case {
  method: string;
  path: string;
  body?: unknown;
  expect: number[];
  label?: string;
}

let failures = 0;
let createdUserId: string | null = null;
let categoryId: string | null = null;
let collectionId: string | null = null;

async function run(c: Case): Promise<void> {
  const headers: Record<string, string> = {};
  if (cookies) headers.cookie = cookies;
  if (c.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(`${BASE}${c.path}`, {
    method: c.method,
    headers,
    body: c.body !== undefined ? JSON.stringify(c.body) : undefined,
  });
  const good = c.expect.includes(res.status);
  const text = await res.text();
  console.log(`${good ? "ok  " : "FAIL"} ${c.method} ${c.path} -> ${res.status}${good ? "" : ` (expected ${c.expect.join("|")}) ${text.slice(0, 200)}`}`);
  if (!good) failures += 1;

  if (res.ok && text.length < 4000) {
    try {
      const json = JSON.parse(text);
      if (c.method === "POST" && c.path === "/api/users" && json?.id) createdUserId = json.id;
      if (json?.category?.id && c.method === "POST" && c.path === "/api/categories") categoryId = json.category.id;
      if (json?.collection?.id && c.method === "POST" && c.path === "/api/collections") collectionId = json.collection.id;
    } catch {
      /* not json */
    }
  }
}

const status = await login();
console.log(`login (${IDENT}) -> ${status}`);
if (status !== 200) {
  console.log("cannot login — is the dev server running?");
  process.exit(1);
}

// --- users (8) -------------------------------------------------------------
await run({ method: "GET", path: "/api/users", expect: [200] });
await run({
  method: "POST",
  path: "/api/users",
  body: { email: "smoketester@sslg.edu.ph", password: "Smoke#Test123", username: "smoketester", full_name: "Smoke Tester", role: "officer" },
  expect: [201, 409],
});
if (!createdUserId) {
  // user already existed — look it up
  const res = await fetch(`${BASE}/api/users?q=smoketester`, { headers: { cookie: cookies } });
  const j = await res.json().catch(() => ({ items: [] }));
  createdUserId = j.items?.[0]?.id ?? null;
}
if (createdUserId) {
  await run({ method: "GET", path: `/api/users/${createdUserId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/users/${createdUserId}`, body: { full_name: "Smoke Tester II" }, expect: [200] });
  await run({ method: "POST", path: `/api/users/${createdUserId}/password`, body: { password: "Smoke#Test123" }, expect: [200] });
  await run({ method: "GET", path: `/api/users/${createdUserId}/audit`, expect: [200] });
  await run({ method: "DELETE", path: `/api/users/${createdUserId}`, expect: [200] });
} else {
  console.log("FAIL setup: could not create/find smoke user");
  failures += 1;
}
await run({ method: "PATCH", path: "/api/users/me", body: { bio: "smoke test" }, expect: [200] });
// unauthenticated check with no cookie
{
  const res = await fetch(`${BASE}/api/users`);
  const good = res.status === 401;
  console.log(`${good ? "ok  " : "FAIL"} GET /api/users (no cookie) -> ${res.status} (expected 401)`);
  if (!good) failures += 1;
}

// --- categories (7) --------------------------------------------------------
await run({ method: "GET", path: "/api/categories", expect: [200] });
await run({ method: "GET", path: "/api/categories/stats", expect: [200] });
await run({
  method: "POST",
  path: "/api/categories",
  body: { name: `Smoke Cat ${Date.now()}`, type: "expense" },
  expect: [201],
});
if (categoryId) {
  await run({ method: "GET", path: `/api/categories/${categoryId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/categories/${categoryId}`, body: { name: "Smoke Cat Renamed" }, expect: [200] });
  await run({ method: "DELETE", path: `/api/categories/${categoryId}`, expect: [200] });
  await run({ method: "POST", path: `/api/categories/${categoryId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no category id");
  failures += 1;
}

// --- collections (7) -------------------------------------------------------
await run({
  method: "POST",
  path: "/api/collections",
  body: { collection_date: "2026-10-07", academic_year: "2026-2027", semester: "1st Semester", notes: "smoke" },
  expect: [201],
});
await run({ method: "GET", path: "/api/collections", expect: [200] });
if (collectionId) {
  await run({ method: "GET", path: `/api/collections/${collectionId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/collections/${collectionId}`, body: { notes: "smoke updated" }, expect: [200] });
  await run({ method: "POST", path: `/api/collections/${collectionId}/close`, expect: [200] });
  await run({ method: "POST", path: `/api/collections/${collectionId}/close`, expect: [409] });
  await run({ method: "DELETE", path: `/api/collections/${collectionId}`, expect: [200] });
  await run({ method: "POST", path: `/api/collections/${collectionId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no collection id");
  failures += 1;
}

console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
