import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "kind", label: "Type" },
  { key: "description", label: "Description" },
  { key: "reference", label: "Reference" },
  { key: "academic_year", label: "Academic Year" },
  { key: "amount", label: "Amount" },
  { key: "sign", label: "Sign" },
];

// GET /api/financial-report/export?from=&to=&academic_year= — full ledger CSV (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const year = sp.get("academic_year");

    let payQ = db
      .from("payments")
      .select("receipt_no,payment_date,amount,mode,academic_year,student:students(first_name,last_name),fee:fees(name)")
      .eq("status", "posted")
      .is("deleted_at", null);
    let incQ = db
      .from("income")
      .select("description,reference_no,income_date,amount,academic_year")
      .is("deleted_at", null);
    let expQ = db
      .from("expenses")
      .select("description,voucher_no,expense_date,amount,academic_year,status")
      .is("deleted_at", null);

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

    const rows: Record<string, unknown>[] = [];
    for (const p of payments ?? []) {
      const student = p.student as unknown as { first_name: string; last_name: string } | null;
      const fee = p.fee as unknown as { name: string } | null;
      rows.push({
        date: p.payment_date,
        kind: "payment",
        description: student ? `${student.last_name}, ${student.first_name}${fee ? ` — ${fee.name}` : ""}` : (fee?.name ?? "Payment"),
        reference: p.receipt_no,
        academic_year: p.academic_year,
        amount: Number(p.amount).toFixed(2),
        sign: "+",
      });
    }
    for (const i of income ?? []) {
      rows.push({
        date: i.income_date,
        kind: "income",
        description: i.description,
        reference: i.reference_no ?? "",
        academic_year: i.academic_year,
        amount: Number(i.amount).toFixed(2),
        sign: "+",
      });
    }
    for (const e of expenses ?? []) {
      if (e.status === "void") continue;
      rows.push({
        date: e.expense_date,
        kind: "expense",
        description: e.description,
        reference: e.voucher_no ?? "",
        academic_year: e.academic_year,
        amount: Number(e.amount).toFixed(2),
        sign: "-",
      });
    }
    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    await logAction(auth.profile.username, "export", "financial_report", null, { rows: rows.length });
    return csvResponse(
      toCsv(rows, COLUMNS),
      `financial-report-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  } catch (err) {
    return serverError(err);
  }
}
