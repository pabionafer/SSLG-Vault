import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";

const COLUMNS = [
  { key: "income_date", label: "Date" },
  { key: "source", label: "Source" },
  { key: "igp", label: "IGP" },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount" },
  { key: "reference_no", label: "Reference" },
  { key: "academic_year", label: "Academic Year" },
  { key: "semester", label: "Semester" },
  { key: "created_by", label: "Recorded By" },
];

// GET /api/income/export — CSV (igpManager)
export async function GET(req: NextRequest) {
  const auth = await requireRole("igpManager");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db
      .from("income")
      .select("*, igp:igps(name), category:categories(name)")
      .is("deleted_at", null);
    const from = sp.get("from");
    if (from) q = q.gte("income_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("income_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);

    const { data, error } = await q.order("income_date", { ascending: true }).limit(10000);
    if (error) return serverError(error);

    const rows = (data ?? []).map((r) => ({
      ...r,
      igp: (r.igp as unknown as { name: string } | null)?.name ?? "",
      category: (r.category as unknown as { name: string } | null)?.name ?? "",
      amount: Number(r.amount).toFixed(2),
    }));

    await logAction(auth.profile.username, "export", "income", null, { rows: rows.length });
    return csvResponse(toCsv(rows, COLUMNS), `income-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return serverError(err);
  }
}
