import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";
import { readFilters, applySemester } from "@/lib/report-data";

// GET /api/financial-report/by-month?from=&to=&academic_year=&semester= (treasurer)
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

    const expenses = await fetchAllByKeyset((cursor) => {
      let q = db.from("expenses").select("id,amount,expense_date,status").is("deleted_at", null);
      if (f.from) q = q.gte("expense_date", f.from);
      if (f.to) q = q.lte("expense_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const months = new Map<string, { payments: number; income: number; expenses: number }>();
    const bump = (key: string, field: "payments" | "income" | "expenses", amount: number) => {
      const entry = months.get(key) ?? { payments: 0, income: 0, expenses: 0 };
      entry[field] += amount;
      months.set(key, entry);
    };
    for (const p of payments) bump(p.payment_date.slice(0, 7), "payments", Number(p.amount));
    for (const i of income) bump(i.income_date.slice(0, 7), "income", Number(i.amount));
    for (const e of expenses) {
      if (e.status === "void") continue;
      bump(e.expense_date.slice(0, 7), "expenses", Number(e.amount));
    }

    const items = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        payments: round2(v.payments),
        income: round2(v.income),
        expenses: round2(v.expenses),
        net: round2(v.payments + v.income - v.expenses),
      }));

    return ok({ items });
  } catch (err) {
    return serverError(err);
  }
}
