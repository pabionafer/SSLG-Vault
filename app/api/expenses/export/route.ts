import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";

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

    const from = sp.get("from");
    const to = sp.get("to");
    const year = sp.get("academic_year");

    const data = await fetchAllByKeyset((cursor) => {
      let q = db
        .from("expenses")
        .select("id,expense_date,description,category:categories(name),amount,status,payee,voucher_no,academic_year,semester,created_by")
        .is("deleted_at", null)
        .neq("status", "void");
      if (from) q = q.gte("expense_date", from);
      if (to) q = q.lte("expense_date", to);
      if (year) q = q.eq("academic_year", year);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    });

    const rows = data.map((r) => ({
      ...r,
      category: (r.category as unknown as { name: string } | null)?.name ?? "",
      amount: Number(r.amount).toFixed(2),
    }));
    rows.sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)));

    await logAction(auth.profile.username, "export", "expenses", null, { rows: rows.length });
    return csvResponse(
      toCsv(rows, COLUMNS),
      `expenses-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  } catch (err) {
    return serverError(err);
  }
}
