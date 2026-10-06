import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2, sum } from "@/lib/formulas";

// GET /api/financial-report/by-mode?from=&to=&academic_year= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db.from("payments").select("amount,mode,payment_date,academic_year").eq("status", "posted").is("deleted_at", null);
    const from = sp.get("from");
    if (from) q = q.gte("payment_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("payment_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);

    const { data, error } = await q.limit(20000);
    if (error) return serverError(error);

    const by_mode: Record<string, { count: number; total: number }> = {};
    for (const r of data ?? []) {
      const entry = by_mode[r.mode] ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(r.amount);
      by_mode[r.mode] = entry;
    }
    for (const k of Object.keys(by_mode)) by_mode[k].total = round2(by_mode[k].total);

    return ok({
      count: data?.length ?? 0,
      total: sum((data ?? []).map((r) => Number(r.amount))),
      by_mode,
    });
  } catch (err) {
    return serverError(err);
  }
}
