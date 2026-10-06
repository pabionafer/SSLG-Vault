import { createAdminClient } from "@/lib/supabase/admin";
import type { LedgerRow } from "@/lib/formulas";

/** All posted money rows (payments + income + expenses) for yearly balances. */
export async function fetchLedgerRows(): Promise<LedgerRow[]> {
  const db = createAdminClient();
  const [p, i, e] = await Promise.all([
    db.from("payments").select("academic_year,amount").eq("status", "posted").is("deleted_at", null).limit(50000),
    db.from("income").select("academic_year,amount").is("deleted_at", null).limit(50000),
    db.from("expenses").select("academic_year,amount,status").is("deleted_at", null).limit(50000),
  ]);
  if (p.error) throw p.error;
  if (i.error) throw i.error;
  if (e.error) throw e.error;

  const rows: LedgerRow[] = [];
  for (const r of p.data ?? []) rows.push({ academic_year: r.academic_year, kind: "payment", amount: Number(r.amount) });
  for (const r of i.data ?? []) rows.push({ academic_year: r.academic_year, kind: "income", amount: Number(r.amount) });
  for (const r of e.data ?? []) {
    if (r.status === "void") continue;
    rows.push({ academic_year: r.academic_year, kind: "expense", amount: Number(r.amount) });
  }
  return rows;
}
