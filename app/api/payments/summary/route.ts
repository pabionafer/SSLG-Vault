import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { sum, round2 } from "@/lib/formulas";

// GET /api/payments/summary?from=&to=&academic_year=&mode= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db.from("payments").select("amount,mode,status,payment_date,academic_year");
    q = q.is("deleted_at", null).eq("status", "posted");
    const from = sp.get("from");
    if (from) q = q.gte("payment_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("payment_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    const mode = sp.get("mode");
    if (mode) q = q.eq("mode", mode);
    const sem = sp.get("semester");
    if (sem) q = q.eq("semester", sem);

    const { data, error } = await q.limit(20000);
    if (error) return serverError(error);

    const rows = data ?? [];
    const by_mode: Record<string, { count: number; total: number }> = {};
    const by_date: Record<string, number> = {};
    for (const r of rows) {
      const m = by_mode[r.mode] ?? { count: 0, total: 0 };
      m.count += 1;
      m.total += Number(r.amount);
      by_mode[r.mode] = m;
      by_date[r.payment_date] = (by_date[r.payment_date] ?? 0) + Number(r.amount);
    }
    for (const k of Object.keys(by_mode)) by_mode[k].total = round2(by_mode[k].total);

    return ok({
      count: rows.length,
      total: sum(rows.map((r) => Number(r.amount))),
      by_mode,
      by_date: Object.fromEntries(
        Object.entries(by_date)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, round2(v)]),
      ),
    });
  } catch (err) {
    return serverError(err);
  }
}
