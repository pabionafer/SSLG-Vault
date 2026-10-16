// Smoke test: logs in and exercises every implemented endpoint.
// Run dev server first:  npm run dev  then  npm run smoke
import process from "node:process";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const IDENT = process.env.SMOKE_USER ?? "admin";
const PASS = process.env.SMOKE_PASS;
if (!PASS) {
  console.error("SMOKE_PASS is not set. Add SMOKE_PASS=... to .env.local (never commit it).");
  process.exit(1);
}

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
let studentId: string | null = null;
let feeId: string | null = null;
let clearanceId: string | null = null;
let paymentId: string | null = null;
let receiptId: string | null = null;
let clearanceItemId: number | null = null;
let expenseId: string | null = null;
let igpId: string | null = null;
let incomeId: string | null = null;
let auditId: string | null = null;

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

  if (res.ok && text.length < 50000) {
    try {
      const json = JSON.parse(text);
      if (c.method === "POST" && c.path === "/api/users" && json?.id) createdUserId = json.id;
      if (json?.category?.id && c.method === "POST" && c.path === "/api/categories") categoryId = json.category.id;
      if (json?.collection?.id && c.method === "POST" && c.path === "/api/collections") collectionId = json.collection.id;
      if (json?.student?.id && c.method === "POST" && c.path === "/api/students") studentId = json.student.id;
      if (json?.fee?.id && c.method === "POST" && c.path === "/api/fees" && !feeId) {
        feeId = json.fee.id;
      }
      if (json?.payment?.id && c.method === "POST" && c.path === "/api/payments") paymentId = String(json.payment.id);
      if (json?.receipt?.id && c.method === "POST" && c.path === "/api/receipts") receiptId = String(json.receipt.id);
      if (json?.clearance?.id && c.method === "POST" && c.path === "/api/clearances") {
        clearanceId = String(json.clearance.id);
        clearanceItemId = null;
      }
      if (json?.items?.[0]?.id && c.path.startsWith("/api/clearances/")) clearanceItemId = json.items[0].id;
      if (json?.expense?.id && c.method === "POST" && c.path === "/api/expenses") expenseId = String(json.expense.id);
      if (json?.igp?.id && c.method === "POST" && c.path === "/api/igps") igpId = String(json.igp.id);
      if (json?.income?.id && c.method === "POST" && c.path === "/api/income") incomeId = String(json.income.id);
      if (json?.items?.[0]?.id && c.path === "/api/audit-log") auditId = String(json.items[0].id);
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
  await run({ method: "PATCH", path: `/api/categories/${categoryId}`, body: { name: `Smoke Cat Renamed ${Date.now()}` }, expect: [200] });
  await run({ method: "DELETE", path: `/api/categories/${categoryId}`, expect: [200] });
  await run({ method: "POST", path: `/api/categories/${categoryId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no category id");
  failures += 1;
}

// --- collections (8) -------------------------------------------------------
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
  // reopen so the payment below can join the batch (closed batches reject new payments)
  await run({ method: "PATCH", path: `/api/collections/${collectionId}`, body: { status: "active" }, expect: [200] });
} else {
  console.log("FAIL setup: no collection id");
  failures += 1;
}

// --- students (11) ---------------------------------------------------------
const sno = `SMOKE-${Date.now()}`;
await run({
  method: "POST",
  path: "/api/students",
  body: { student_no: sno, first_name: "Juan", last_name: "Dela Cruz", year_level: 1, course: "BSIT", section: "A" },
  expect: [201],
});
if (!studentId) {
  const res = await fetch(`${BASE}/api/students?q=${sno}`, { headers: { cookie: cookies } });
  const j = await res.json().catch(() => ({ items: [] }));
  studentId = j.items?.[0]?.id ?? null;
}
await run({ method: "GET", path: "/api/students", expect: [200] });
if (studentId) {
  await run({ method: "GET", path: `/api/students/${studentId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/students/${studentId}`, body: { section: "B" }, expect: [200] });
  await run({ method: "GET", path: `/api/students/${studentId}/fees`, expect: [200] });
  await run({ method: "GET", path: `/api/students/${studentId}/payments`, expect: [200] });
  await run({ method: "GET", path: `/api/students/${studentId}/clearances`, expect: [200] });
} else {
  console.log("FAIL setup: no student id");
  failures += 1;
}
await run({
  method: "POST",
  path: "/api/students/import",
  body: {
    dry_run: true,
    rows: [{ student_no: "IMP-1", first_name: "Maria", last_name: "Santos", year_level: 2 }],
  },
  expect: [200],
});
await run({
  method: "POST",
  path: "/api/students/import",
  body: {
    rows: [{ student_no: `IMP-${Date.now()}`, first_name: "Maria", last_name: "Santos", year_level: 2 }],
  },
  expect: [201],
});
{
  const res = await fetch(`${BASE}/api/students/export`, { headers: { cookie: cookies } });
  const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
  console.log(`${good ? "ok  " : "FAIL"} GET /api/students/export -> ${res.status} ${res.headers.get("content-type")}`);
  if (!good) failures += 1;
}
if (studentId) {
  await run({ method: "DELETE", path: `/api/students/${studentId}`, expect: [200] });
  await run({ method: "POST", path: `/api/students/${studentId}/restore`, expect: [200] });
}

// --- fees (10) -------------------------------------------------------------
await run({
  method: "POST",
  path: "/api/fees",
  body: {
    name: `Smoke Fee ${Date.now()}`,
    amount: 1500,
    academic_year: "2026-2027",
    semester: "1st Semester",
    due_date: "2026-11-30",
  },
  expect: [201],
});
if (!feeId) {
  const res = await fetch(`${BASE}/api/fees?q=Smoke%20Fee`, { headers: { cookie: cookies } });
  const j = await res.json().catch(() => ({ items: [] }));
  feeId = j.items?.[0]?.id ?? null;
}
await run({ method: "GET", path: "/api/fees", expect: [200] });
if (feeId) {
  await run({ method: "GET", path: `/api/fees/${feeId}`, expect: [200] });
  await run({ method: "GET", path: `/api/fees/${feeId}/targets`, expect: [200] });
  await run({ method: "PUT", path: `/api/fees/${feeId}/targets`, body: { targets: [{ year_level: 1 }] }, expect: [200] });
  await run({ method: "PUT", path: `/api/fees/${feeId}/targets`, body: { targets: [] }, expect: [200] });
  await run({ method: "GET", path: `/api/fees/${feeId}/stats`, expect: [200] });
  await run({ method: "GET", path: `/api/fees/${feeId}/defaulters`, expect: [200] });
  await run({ method: "PATCH", path: `/api/fees/${feeId}`, body: { amount: 1600 }, expect: [200] });
  await run({ method: "DELETE", path: `/api/fees/${feeId}`, expect: [200] });
  await run({ method: "POST", path: `/api/fees/${feeId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no fee id");
  failures += 1;
}

// --- payments (11) + receipts (3) + clearances (8) + defaulters (3) --------
// an overdue fee so the defaulters report has at least one row
await run({
  method: "POST",
  path: "/api/fees",
  body: {
    name: `Smoke Overdue Fee ${Date.now()}`,
    amount: 500,
    academic_year: "2026-2027",
    semester: "1st Semester",
    due_date: "2026-09-01",
  },
  expect: [201],
});

await run({
  method: "POST",
  path: "/api/payments",
  body: {
    student_id: Number(studentId),
    fee_id: Number(feeId),
    collection_id: Number(collectionId),
    amount: 1600,
    payment_date: "2026-10-07",
    mode: "cash",
    academic_year: "2026-2027",
    semester: "1st Semester",
  },
  expect: [201],
});
await run({ method: "GET", path: "/api/payments", expect: [200] });
if (paymentId && studentId) {
  await run({ method: "GET", path: `/api/payments/${paymentId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/payments/${paymentId}`, body: { remarks: "smoke edited" }, expect: [200] });
  await run({ method: "GET", path: "/api/payments/summary?from=2026-01-01", expect: [200] });
  await run({
    method: "POST",
    path: "/api/payments/bulk",
    body: {
      payments: [
        { student_id: Number(studentId), amount: 100, payment_date: "2026-10-07", academic_year: "2026-2027" },
        { student_id: Number(studentId), amount: 250, payment_date: "2026-10-07", academic_year: "2026-2027", mode: "gcash" },
      ],
    },
    expect: [201],
  });
  await run({ method: "GET", path: `/api/payments/${paymentId}/receipt`, expect: [200] });
} else {
  console.log("FAIL setup: no payment id");
  failures += 1;
}

// --- receipts (3; PDF comes in phase 10) ------------------------------------
if (paymentId) {
  await run({ method: "POST", path: "/api/receipts", body: { payment_id: Number(paymentId) }, expect: [201] });
}
await run({ method: "GET", path: "/api/receipts", expect: [200] });
if (receiptId) {
  await run({ method: "GET", path: `/api/receipts/${receiptId}`, expect: [200] });
}
if (paymentId) {
  await run({ method: "POST", path: "/api/receipts", body: { payment_id: Number(paymentId) }, expect: [409] });
}

// --- defaulters (3; PDF comes in phase 10) ----------------------------------
await run({ method: "GET", path: "/api/defaulters", expect: [200] });
{
  const res = await fetch(`${BASE}/api/defaulters/summary`, { headers: { cookie: cookies } });
  const j = await res.json().catch(() => ({}));
  const good = res.status === 200 && typeof j.count === "number" && j.count >= 1 && j.total_balance > 0;
  console.log(`${good ? "ok  " : "FAIL"} GET /api/defaulters/summary -> ${res.status} count=${j.count} total=${j.total_balance}`);
  if (!good) failures += 1;
}
{
  const res = await fetch(`${BASE}/api/defaulters/export`, { headers: { cookie: cookies } });
  const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
  console.log(`${good ? "ok  " : "FAIL"} GET /api/defaulters/export -> ${res.status} ${res.headers.get("content-type")}`);
  if (!good) failures += 1;
}

// --- clearances: settle every open fee first so approval can pass ----------
if (studentId) {
  const res = await fetch(`${BASE}/api/students/${studentId}/fees`, { headers: { cookie: cookies } });
  const j = await res.json().catch(() => ({ items: [] }));
  for (const item of j.items ?? []) {
    if (!(item.balance > 0)) continue;
    const pr = await fetch(`${BASE}/api/payments`, {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({
        student_id: Number(studentId),
        fee_id: Number(item.fee_id),
        amount: item.balance,
        payment_date: "2026-10-07",
        mode: "cash",
        academic_year: item.academic_year,
        semester: item.semester,
      }),
    });
    const good = pr.status === 201;
    console.log(`${good ? "ok  " : "FAIL"} pay off fee ${item.name} (${item.balance}) -> ${pr.status}`);
    if (!good) failures += 1;
  }
}

if (studentId) {
  await run({
    method: "POST",
    path: "/api/clearances",
    body: { student_id: Number(studentId), purpose: "Smoke clearance", academic_year: "2026-2027" },
    expect: [201],
  });
}
await run({ method: "GET", path: "/api/clearances", expect: [200] });
if (clearanceId) {
  await run({ method: "GET", path: `/api/clearances/${clearanceId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/clearances/${clearanceId}`, body: { purpose: "Smoke clearance updated" }, expect: [200] });
  if (clearanceItemId) {
    await run({
      method: "PATCH",
      path: `/api/clearances/${clearanceId}`,
      body: { items: [{ id: clearanceItemId, status: "cleared", remarks: "signed by smoke" }] },
      expect: [200],
    });
  }
  await run({ method: "POST", path: `/api/clearances/${clearanceId}/approve`, expect: [200] });
  await run({ method: "POST", path: `/api/clearances/${clearanceId}/approve`, expect: [409] });
  await run({ method: "POST", path: `/api/clearances/${clearanceId}/release`, expect: [200] });
  await run({ method: "DELETE", path: `/api/clearances/${clearanceId}`, expect: [200] });
}
// reject path (fresh clearance for the same student)
if (studentId) {
  await run({
    method: "POST",
    path: "/api/clearances",
    body: { student_id: Number(studentId), purpose: "Smoke clearance reject" },
    expect: [201],
  });
}
if (clearanceId) {
  await run({ method: "POST", path: `/api/clearances/${clearanceId}/reject`, body: { remarks: "smoke" }, expect: [200] });
  await run({ method: "POST", path: `/api/clearances/${clearanceId}/approve`, expect: [409] });
  await run({ method: "POST", path: `/api/clearances/${clearanceId}/release`, expect: [409] });
  await run({ method: "DELETE", path: `/api/clearances/${clearanceId}`, expect: [200] });
}

// --- payment lifecycle: void, trash, purge schedule, restore ----------------
if (paymentId) {
  await run({ method: "POST", path: `/api/payments/${paymentId}/void`, body: { reason: "smoke void" }, expect: [200] });
  await run({ method: "POST", path: `/api/payments/${paymentId}/void`, body: { reason: "again" }, expect: [409] });
  await run({ method: "DELETE", path: `/api/payments/${paymentId}`, expect: [200] });
  await run({ method: "GET", path: "/api/payments?trash=true", expect: [200] });
  await run({ method: "POST", path: `/api/payments/${paymentId}/schedule-purge`, expect: [200] });
  await run({ method: "POST", path: `/api/payments/${paymentId}/schedule-purge`, expect: [409] });
  await run({ method: "POST", path: `/api/payments/${paymentId}/restore`, expect: [200] });
}

// --- expenses (8) -----------------------------------------------------------
await run({
  method: "POST",
  path: "/api/expenses",
  body: {
    description: "Smoke expense — office supplies",
    amount: 123.45,
    expense_date: "2026-10-07",
    academic_year: "2026-2027",
    semester: "1st Semester",
    payee: "Smoke Store",
    voucher_no: `SV-${Date.now()}`,
  },
  expect: [201],
});
await run({ method: "GET", path: "/api/expenses", expect: [200] });
if (expenseId) {
  await run({ method: "GET", path: `/api/expenses/${expenseId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/expenses/${expenseId}`, body: { amount: 150.5, status: "posted" }, expect: [200] });
  await run({ method: "GET", path: "/api/expenses/summary?from=2026-01-01", expect: [200] });
  {
    const res = await fetch(`${BASE}/api/expenses/export`, { headers: { cookie: cookies } });
    const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
    console.log(`${good ? "ok  " : "FAIL"} GET /api/expenses/export -> ${res.status} ${res.headers.get("content-type")}`);
    if (!good) failures += 1;
  }
  await run({ method: "DELETE", path: `/api/expenses/${expenseId}`, expect: [200] });
  await run({ method: "POST", path: `/api/expenses/${expenseId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no expense id");
  failures += 1;
}

// --- igps (7) ---------------------------------------------------------------
await run({
  method: "POST",
  path: "/api/igps",
  body: { name: `Smoke IGP ${Date.now()}`, description: "canteen stall", custodian: "Smoke Officer" },
  expect: [201],
});
await run({ method: "GET", path: "/api/igps", expect: [200] });
if (igpId) {
  await run({ method: "GET", path: `/api/igps/${igpId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/igps/${igpId}`, body: { custodian: "Smoke Custodian" }, expect: [200] });
  await run({ method: "GET", path: "/api/igps/stats", expect: [200] });
  await run({ method: "DELETE", path: `/api/igps/${igpId}`, expect: [200] });
  await run({ method: "POST", path: `/api/igps/${igpId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no igp id");
  failures += 1;
}

// --- income (7) -------------------------------------------------------------
if (igpId) {
  await run({
    method: "POST",
    path: "/api/income",
    body: {
      description: "Smoke IGP earnings",
      amount: 75,
      source: "igp",
      igp_id: Number(igpId),
      income_date: "2026-10-07",
      academic_year: "2026-2027",
      semester: "1st Semester",
    },
    expect: [201],
  });
}
await run({ method: "GET", path: "/api/income", expect: [200] });
if (incomeId) {
  await run({ method: "GET", path: `/api/income/${incomeId}`, expect: [200] });
  await run({ method: "PATCH", path: `/api/income/${incomeId}`, body: { amount: 80 }, expect: [200] });
  {
    const res = await fetch(`${BASE}/api/income/export`, { headers: { cookie: cookies } });
    const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
    console.log(`${good ? "ok  " : "FAIL"} GET /api/income/export -> ${res.status} ${res.headers.get("content-type")}`);
    if (!good) failures += 1;
  }
  await run({ method: "DELETE", path: `/api/income/${incomeId}`, expect: [200] });
  await run({ method: "POST", path: `/api/income/${incomeId}/restore`, expect: [200] });
} else {
  console.log("FAIL setup: no income id");
  failures += 1;
}

// --- financial report (6; PDF comes in phase 10) ----------------------------
await run({ method: "GET", path: "/api/financial-report?academic_year=2026-2027", expect: [200] });
await run({ method: "GET", path: "/api/financial-report/by-month?academic_year=2026-2027", expect: [200] });
await run({ method: "GET", path: "/api/financial-report/by-category", expect: [200] });
await run({ method: "GET", path: "/api/financial-report/by-fee?academic_year=2026-2027", expect: [200] });
await run({ method: "GET", path: "/api/financial-report/by-mode", expect: [200] });
{
  const res = await fetch(`${BASE}/api/financial-report/export`, { headers: { cookie: cookies } });
  const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
  console.log(`${good ? "ok  " : "FAIL"} GET /api/financial-report/export -> ${res.status} ${res.headers.get("content-type")}`);
  if (!good) failures += 1;
}

// --- audit log (4) ----------------------------------------------------------
await run({ method: "GET", path: "/api/audit-log", expect: [200] });
if (auditId) {
  await run({ method: "GET", path: `/api/audit-log/${auditId}`, expect: [200] });
}
await run({ method: "GET", path: "/api/audit-log/stats", expect: [200] });
{
  const res = await fetch(`${BASE}/api/audit-log/export`, { headers: { cookie: cookies } });
  const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
  console.log(`${good ? "ok  " : "FAIL"} GET /api/audit-log/export -> ${res.status} ${res.headers.get("content-type")}`);
  if (!good) failures += 1;
}

// --- yearly balance (4) -----------------------------------------------------
await run({ method: "GET", path: "/api/yearly-balance", expect: [200] });
await run({
  method: "POST",
  path: "/api/yearly-balance",
  body: { academic_year: "2026-2027" },
  expect: [200, 201],
});
await run({ method: "GET", path: "/api/yearly-balance/2026-2027", expect: [200] });
{
  const res = await fetch(`${BASE}/api/yearly-balance/export`, { headers: { cookie: cookies } });
  const good = res.status === 200 && (res.headers.get("content-type") ?? "").includes("csv");
  console.log(`${good ? "ok  " : "FAIL"} GET /api/yearly-balance/export -> ${res.status} ${res.headers.get("content-type")}`);
  if (!good) failures += 1;
}

console.log(failures === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
