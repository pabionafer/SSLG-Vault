import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2, sum } from "@/lib/formulas";

// GET /api/expenses/summary?from=&to=&academic_year=&semester= (expenseManager)
export async function GET(req: NextRequest) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db.from("expenses").select("amount,status,expense_date,category_id,category:categories(name)");
    q = q.is("deleted_at", null);
    const from = sp.get("from");
    if (from) q = q.gte("expense_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("expense_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    const sem = sp.get("semester");
    if (sem) q = q.eq("semester", sem);

    const { data, error } = await q.limit(20000);
    if (error) return serverError(error);

    const rows = (data ?? []).filter((r) => r.status !== "void");
    const by_status: Record<string, { count: number; total: number }> = {};
    const by_category: { category: string; total: number }[] = [];
    const catTotals = new Map<string, number>();

    for (const r of data ?? []) {
      const s = by_status[r.status] ?? { count: 0, total: 0 };
      s.count += 1;
      s.total += Number(r.amount);
      by_status[r.status] = s;
      if (r.status === "void") continue;
      const name = (r.category as unknown as { name: string } | null)?.name ?? "Uncategorized";
      catTotals.set(name, (catTotals.get(name) ?? 0) + Number(r.amount));
    }
    for (const [k, v] of catTotals) by_category.push({ category: k, total: round2(v) });
    by_category.sort((a, b) => b.total - a.total);
    for (const k of Object.keys(by_status)) by_status[k].total = round2(by_status[k].total);

    return ok({
      count: rows.length,
      total: sum(rows.map((r) => Number(r.amount))),
      by_status,
      by_category,
    });
  } catch (err) {
    return serverError(err);
  }
}
