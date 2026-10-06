import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";

// GET /api/financial-report/by-category?from=&to=&academic_year= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let expQ = db
      .from("expenses")
      .select("amount,expense_date,status,category:categories(name)")
      .is("deleted_at", null);
    let incQ = db
      .from("income")
      .select("amount,income_date,category:categories(name)")
      .is("deleted_at", null);

    const from = sp.get("from");
    const to = sp.get("to");
    const year = sp.get("academic_year");
    if (from) {
      expQ = expQ.gte("expense_date", from);
      incQ = incQ.gte("income_date", from);
    }
    if (to) {
      expQ = expQ.lte("expense_date", to);
      incQ = incQ.lte("income_date", to);
    }
    if (year) {
      expQ = expQ.eq("academic_year", year);
      incQ = incQ.eq("academic_year", year);
    }

    const [{ data: expenses, error: eErr }, { data: income, error: iErr }] = await Promise.all([expQ, incQ]);
    if (eErr) return serverError(eErr);
    if (iErr) return serverError(iErr);

    const expenseTotals = new Map<string, number>();
    const incomeTotals = new Map<string, number>();
    for (const e of expenses ?? []) {
      if (e.status === "void") continue;
      const name = (e.category as unknown as { name: string } | null)?.name ?? "Uncategorized";
      expenseTotals.set(name, (expenseTotals.get(name) ?? 0) + Number(e.amount));
    }
    for (const i of income ?? []) {
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
