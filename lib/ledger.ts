import { createAdminClient } from "@/lib/supabase/admin";
import type { LedgerRow } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";

/** All posted money rows (payments + income + expenses) for yearly balances. */
export async function fetchLedgerRows(): Promise<LedgerRow[]> {
  const db = createAdminClient();
  const [payments, income, expenses] = await Promise.all([
    fetchAllByKeyset((cursor) =>
      db
        .from("payments")
        .select("id,academic_year,amount")
        .eq("status", "posted")
        .is("deleted_at", null)
        .gt("id", cursor)
        .limit(PAGE_LIMIT)
        .order("id", { ascending: true }),
    ),
    fetchAllByKeyset((cursor) =>
      db
        .from("income")
        .select("id,academic_year,amount")
        .is("deleted_at", null)
        .gt("id", cursor)
        .limit(PAGE_LIMIT)
        .order("id", { ascending: true }),
    ),
    fetchAllByKeyset((cursor) =>
      db
        .from("expenses")
        .select("id,academic_year,amount,status")
        .is("deleted_at", null)
        .gt("id", cursor)
        .limit(PAGE_LIMIT)
        .order("id", { ascending: true }),
    ),
  ]);

  const rows: LedgerRow[] = [];
  for (const r of payments) rows.push({ academic_year: r.academic_year, kind: "payment", amount: Number(r.amount) });
  for (const r of income) rows.push({ academic_year: r.academic_year, kind: "income", amount: Number(r.amount) });
  for (const r of expenses) {
    if (r.status === "void") continue;
    rows.push({ academic_year: r.academic_year, kind: "expense", amount: Number(r.amount) });
  }
  return rows;
}
