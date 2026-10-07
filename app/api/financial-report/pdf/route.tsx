import { type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportTotals, type ReportTotals } from "@/lib/formulas";
import {
  FinancialReportDocument,
  parseSettings,
  pdfResponse,
  type MonthRow,
  type SettingsMap,
} from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/financial-report/pdf?from=&to=&academic_year=&semester= (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  let docProps: {
    totals: ReportTotals;
    counts: { payments: number; income: number; expenses: number };
    byMonth: MonthRow[];
    period: string;
    settings: SettingsMap;
  } | null = null;
  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let payQ = db
      .from("payments")
      .select("amount,payment_date")
      .eq("status", "posted")
      .is("deleted_at", null);
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

    const [
      { data: payments, error: pErr },
      { data: income, error: iErr },
      { data: expenses, error: eErr },
      { data: settingRows },
    ] = await Promise.all([payQ, incQ, expQ, db.from("system_settings").select("key,value")]);
    if (pErr) return serverError(pErr);
    if (iErr) return serverError(iErr);
    if (eErr) return serverError(eErr);

    const postedExpenses = (expenses ?? []).filter((e) => e.status !== "void");
    const totals = reportTotals({
      payments: (payments ?? []).map((p) => Number(p.amount)),
      other_income: (income ?? []).map((i) => Number(i.amount)),
      expenses: postedExpenses.map((e) => Number(e.amount)),
    });

    const buckets = new Map<string, { income: number; expenses: number }>();
    const bucket = (date: string) => {
      const key = String(date).slice(0, 7);
      if (!buckets.has(key)) buckets.set(key, { income: 0, expenses: 0 });
      return buckets.get(key)!;
    };
    for (const p of payments ?? []) bucket(p.payment_date).income += Number(p.amount);
    for (const i of income ?? []) bucket(i.income_date).income += Number(i.amount);
    for (const e of postedExpenses) bucket(e.expense_date).expenses += Number(e.amount);
    const byMonth: MonthRow[] = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({
        month,
        income: Math.round(v.income * 100) / 100,
        expenses: Math.round(v.expenses * 100) / 100,
      }));

    const periodParts = [
      from || to ? `${from ?? "start"} → ${to ?? "today"}` : null,
      year ? `A.Y. ${year}` : null,
      sem ?? null,
    ].filter(Boolean);
    const period = periodParts.length > 0 ? periodParts.join(" · ") : "All dates";

    docProps = {
      totals,
      counts: {
        payments: payments?.length ?? 0,
        income: income?.length ?? 0,
        expenses: postedExpenses.length,
      },
      byMonth,
      period,
      settings: parseSettings(settingRows),
    };
  } catch (err) {
    return serverError(err);
  }

  const doc = (
    <FinancialReportDocument
      totals={docProps.totals}
      counts={docProps.counts}
      byMonth={docProps.byMonth}
      period={docProps.period}
      settings={docProps.settings}
    />
  );
  try {
    const buffer = await renderToBuffer(doc);
    return pdfResponse(buffer, "financial-report.pdf");
  } catch (err) {
    return serverError(err);
  }
}
