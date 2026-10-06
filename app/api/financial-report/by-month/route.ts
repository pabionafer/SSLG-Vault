import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";

// GET /api/financial-report/by-month?from=&to=&academic_year= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let payQ = db.from("payments").select("amount,payment_date").eq("status", "posted").is("deleted_at", null);
    let incQ = db.from("income").select("amount,income_date").is("deleted_at", null);
    let expQ = db.from("expenses").select("amount,expense_date,status").is("deleted_at", null);

    const from = sp.get("from");
    const to = sp.get("to");
    const year = sp.get("academic_year");
    if (from) {
      payQ = payQ.gte("payment_date", from);
      incQ = incQ.gte("income_date", from);
      expQ = expQ.gte("expense_date", from);
    }
    if (to) {
      payQ = payQ.lte("payment_date", to);
      incQ = incQ.lte("income_date", to);
      expQ = expQ.lte("expense_date", to);
    }
    if (year) {
      payQ = payQ.eq("academic_year", year);
      incQ = incQ.eq("academic_year", year);
      expQ = expQ.eq("academic_year", year);
    }

    const [{ data: payments, error: pErr }, { data: income, error: iErr }, { data: expenses, error: eErr }] =
      await Promise.all([payQ, incQ, expQ]);
    if (pErr) return serverError(pErr);
    if (iErr) return serverError(iErr);
    if (eErr) return serverError(eErr);

    const months = new Map<string, { payments: number; income: number; expenses: number }>();
    const bump = (key: string, field: "payments" | "income" | "expenses", amount: number) => {
      const entry = months.get(key) ?? { payments: 0, income: 0, expenses: 0 };
      entry[field] += amount;
      months.set(key, entry);
    };
    for (const p of payments ?? []) bump(p.payment_date.slice(0, 7), "payments", Number(p.amount));
    for (const i of income ?? []) bump(i.income_date.slice(0, 7), "income", Number(i.amount));
    for (const e of expenses ?? []) {
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
