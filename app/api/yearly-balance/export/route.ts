import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv, csvResponse } from "@/lib/csv";
import { yearlyBalances } from "@/lib/formulas";
import { fetchLedgerRows } from "@/lib/ledger";
import { logAction } from "@/lib/audit";

const COLUMNS = [
  { key: "academic_year", label: "Academic Year" },
  { key: "total_income", label: "Total Income" },
  { key: "total_expenses", label: "Total Expenses" },
  { key: "balance", label: "Balance" },
  { key: "snapshot_at", label: "Last Snapshot" },
  { key: "prepared_by", label: "Prepared By" },
];

// GET /api/yearly-balance/export — CSV (treasurer)
export async function GET() {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const rows = await fetchLedgerRows();
    const live = yearlyBalances(rows);

    const db = createAdminClient();
    const { data: snapshots, error } = await db.from("yearly_balances").select("*");
    if (error) return serverError(error);
    const snapBy = new Map((snapshots ?? []).map((s) => [s.academic_year, s]));

    const out = live.map((r) => {
      const snap = snapBy.get(r.academic_year);
      return {
        ...r,
        snapshot_at: snap ? new Date(snap.computed_at).toISOString() : "",
        prepared_by: snap?.prepared_by ?? "",
      };
    });

    await logAction(auth.profile.username, "export", "yearly_balances", null, { rows: out.length });
    return csvResponse(
      toCsv(out, COLUMNS),
      `yearly-balance-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  } catch (err) {
    return serverError(err);
  }
}
