import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2, sum } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";
import { readFilters, applySemester } from "@/lib/report-data";

// GET /api/financial-report/by-mode?from=&to=&academic_year=&semester= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const f = readFilters(req.nextUrl.searchParams);

    const data = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("payments")
        .select("id,amount,mode,payment_date,academic_year")
        .eq("status", "posted")
        .is("deleted_at", null);
      if (f.from) q = q.gte("payment_date", f.from);
      if (f.to) q = q.lte("payment_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const by_mode: Record<string, { count: number; total: number }> = {};
    for (const r of data) {
      const entry = by_mode[r.mode] ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(r.amount);
      by_mode[r.mode] = entry;
    }
    for (const k of Object.keys(by_mode)) by_mode[k].total = round2(by_mode[k].total);

    return ok({
      count: data.length,
      total: sum(data.map((r) => Number(r.amount))),
      by_mode,
    });
  } catch (err) {
    return serverError(err);
  }
}
