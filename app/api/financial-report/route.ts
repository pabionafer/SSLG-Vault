import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportTotals } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";
import { readFilters, applySemester } from "@/lib/report-data";

// GET /api/financial-report?from=&to=&academic_year=&semester= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const f = readFilters(req.nextUrl.searchParams);

    const payments = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("payments")
        .select("id,amount,payment_date")
        .eq("status", "posted")
        .is("deleted_at", null);
      if (f.from) q = q.gte("payment_date", f.from);
      if (f.to) q = q.lte("payment_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const income = await fetchAllByKeyset((cursor) => {
      let q = db.from("income").select("id,amount,income_date").is("deleted_at", null);
      if (f.from) q = q.gte("income_date", f.from);
      if (f.to) q = q.lte("income_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const expensesAll = await fetchAllByKeyset((cursor) => {
      let q = db.from("expenses").select("id,amount,expense_date,status").is("deleted_at", null);
      if (f.from) q = q.gte("expense_date", f.from);
      if (f.to) q = q.lte("expense_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const expenses = expensesAll.filter((e) => e.status !== "void");
    const totals = reportTotals({
      payments: payments.map((p) => Number(p.amount)),
      other_income: income.map((i) => Number(i.amount)),
      expenses: expenses.map((e) => Number(e.amount)),
    });

    return ok({
      ...totals,
      counts: {
        payments: payments.length,
        income: income.length,
        expenses: expenses.length,
      },
      period: {
        from: f.from,
        to: f.to,
        academic_year: f.academic_year,
        semester: f.semester,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(err);
  }
}
