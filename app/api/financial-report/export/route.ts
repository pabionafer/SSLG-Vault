import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";
import { readFilters, applySemester } from "@/lib/report-data";

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "kind", label: "Type" },
  { key: "description", label: "Description" },
  { key: "reference", label: "Reference" },
  { key: "academic_year", label: "Academic Year" },
  { key: "amount", label: "Amount" },
  { key: "sign", label: "Sign" },
];

// GET /api/financial-report/export?from=&to=&academic_year=&semester= — full ledger CSV (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const f = readFilters(req.nextUrl.searchParams);

    const payments = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("payments")
        .select("id,receipt_no,payment_date,amount,mode,academic_year,student:students(first_name,last_name),fee:fees(name)")
        .eq("status", "posted")
        .is("deleted_at", null);
      if (f.from) q = q.gte("payment_date", f.from);
      if (f.to) q = q.lte("payment_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const income = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("income")
        .select("id,description,reference_no,income_date,amount,academic_year")
        .is("deleted_at", null);
      if (f.from) q = q.gte("income_date", f.from);
      if (f.to) q = q.lte("income_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const expenses = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("expenses")
        .select("id,description,voucher_no,expense_date,amount,academic_year,status")
        .is("deleted_at", null)
        .neq("status", "void");
      if (f.from) q = q.gte("expense_date", f.from);
      if (f.to) q = q.lte("expense_date", f.to);
      if (f.academic_year) q = q.eq("academic_year", f.academic_year);
      if (f.semester) q = applySemester(q, f.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const rows: Record<string, unknown>[] = [];
    for (const p of payments) {
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
    for (const i of income) {
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
    for (const e of expenses) {
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
