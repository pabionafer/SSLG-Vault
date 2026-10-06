import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";

const COLUMNS = [
  { key: "expense_date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status" },
  { key: "payee", label: "Payee" },
  { key: "voucher_no", label: "Voucher No" },
  { key: "academic_year", label: "Academic Year" },
  { key: "semester", label: "Semester" },
  { key: "created_by", label: "Recorded By" },
];

// GET /api/expenses/export — CSV (expenseManager)
export async function GET(req: NextRequest) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db.from("expenses").select("*, category:categories(name)");
    q = q.is("deleted_at", null);
    const from = sp.get("from");
    if (from) q = q.gte("expense_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("expense_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);

    const { data, error } = await q.order("expense_date", { ascending: true }).limit(10000);
    if (error) return serverError(error);

    const rows = (data ?? []).map((r) => ({
      ...r,
      category: (r.category as unknown as { name: string } | null)?.name ?? "",
      amount: Number(r.amount).toFixed(2),
    }));

    await logAction(auth.profile.username, "export", "expenses", null, { rows: rows.length });
    return csvResponse(
      toCsv(rows, COLUMNS),
      `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  } catch (err) {
    return serverError(err);
  }
}
