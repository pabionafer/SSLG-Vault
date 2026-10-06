import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportTotals } from "@/lib/formulas";

// GET /api/financial-report?from=&to=&academic_year=&semester= (treasurer)
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
    const sem = sp.get("semester");

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
    if (sem) {
      payQ = payQ.eq("semester", sem);
      incQ = incQ.eq("semester", sem);
      expQ = expQ.eq("semester", sem);
    }

    const [{ data: payments, error: pErr }, { data: income, error: iErr }, { data: expenses, error: eErr }] =
      await Promise.all([payQ, incQ, expQ]);
    if (pErr) return serverError(pErr);
    if (iErr) return serverError(iErr);
    if (eErr) return serverError(eErr);

    const postedExpenses = (expenses ?? []).filter((e) => e.status !== "void");
    const totals = reportTotals({
      payments: (payments ?? []).map((p) => Number(p.amount)),
      other_income: (income ?? []).map((i) => Number(i.amount)),
      expenses: postedExpenses.map((e) => Number(e.amount)),
    });

    return ok({
      ...totals,
      counts: {
        payments: payments?.length ?? 0,
        income: income?.length ?? 0,
        expenses: postedExpenses.length,
      },
      period: { from, to, academic_year: year, semester: sem },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(err);
  }
}
