import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";

const COLUMNS = [
  { key: "created_at", label: "When" },
  { key: "username", label: "User" },
  { key: "action", label: "Action" },
  { key: "target_table", label: "Table" },
  { key: "target_id", label: "Target" },
  { key: "details", label: "Details" },
];

// GET /api/audit-log/export — CSV (admin)
export async function GET(req: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db.from("audit_log").select("*");
    const username = sp.get("username");
    if (username) q = q.eq("username", username);
    const action = sp.get("action");
    if (action) q = q.eq("action", action);
    const from = sp.get("from");
    if (from) q = q.gte("created_at", `${from}T00:00:00`);
    const to = sp.get("to");
    if (to) q = q.lte("created_at", `${to}T23:59:59.999`);

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) return serverError(error);

    const rows = (data ?? []).map((r) => ({
      ...r,
      created_at: new Date(r.created_at).toISOString(),
      details: JSON.stringify(r.details ?? {}),
    }));

    await logAction(auth.profile.username, "export", "audit_log", null, { rows: rows.length });
    return csvResponse(toCsv(rows, COLUMNS), `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return serverError(err);
  }
}
