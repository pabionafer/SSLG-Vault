import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";
import { readFilters, applySemester } from "@/lib/report-data";

// GET /api/financial-report/by-category?from=&to=&academic_year=&semester= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const f = readFilters(req.nextUrl.searchParams);

    const expenses = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("expenses")
        .select("id,amount,expense_date,status,category:categories(name)")
        .is("deleted_at", null);
      if (f.from) q = q.gte("expense_date", f.from);
      if (f.to) q = q.lte("expense_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const income = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("income")
        .select("id,amount,income_date,category:categories(name)")
        .is("deleted_at", null);
      if (f.from) q = q.gte("income_date", f.from);
      if (f.to) q = q.lte("income_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const expenseTotals = new Map<string, number>();
    const incomeTotals = new Map<string, number>();
    for (const e of expenses) {
      if (e.status === "void") continue;
      const name = (e.category as unknown as { name: string } | null)?.name ?? "Uncategorized";
      expenseTotals.set(name, (expenseTotals.get(name) ?? 0) + Number(e.amount));
    }
    for (const i of income) {
      const name = (i.category as unknown as { name: string } | null)?.name ?? "Uncategorized";
      incomeTotals.set(name, (incomeTotals.get(name) ?? 0) + Number(i.amount));
    }

    const toSorted = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([category, total]) => ({ category, total: round2(total) }))
        .sort((a, b) => b.total - a.total);

    return ok({ expenses: toSorted(expenseTotals), income: toSorted(incomeTotals) });
  } catch (err) {
    return serverError(err);
  }
}
