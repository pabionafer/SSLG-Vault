import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { listResponse, paging, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/audit-log?username=&action=&target_table=&from=&to=&q= (admin)
export async function GET(req: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req, 50);
    const sp = req.nextUrl.searchParams;

    let q = db.from("audit_log").select("*", { count: "exact" });
    const username = sp.get("username");
    if (username) q = q.eq("username", username);
    const action = sp.get("action");
    if (action) q = q.eq("action", action);
    const table = sp.get("target_table");
    if (table) q = q.eq("target_table", table);
    const from = sp.get("from");
    if (from) q = q.gte("created_at", `${from}T00:00:00`);
    const to = sp.get("to");
    if (to) q = q.lte("created_at", `${to}T23:59:59.999`);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(`target_id.ilike.%${term}%,details::text.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}
