import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";

// GET /api/financial-report/by-fee?academic_year=&semester= — collection progress per fee (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let feeQ = db.from("fees").select("id,name,amount,academic_year,semester,due_date").is("deleted_at", null).eq("is_active", true);
    const year = sp.get("academic_year");
    if (year) feeQ = feeQ.eq("academic_year", year);
    const sem = sp.get("semester");
    if (sem) feeQ = feeQ.eq("semester", sem);

    const [{ data: fees, error: fErr }, { data: payments, error: pErr }] = await Promise.all([
      feeQ,
      db.from("payments").select("fee_id,amount").eq("status", "posted").is("deleted_at", null),
    ]);
    if (fErr) return serverError(fErr);
    if (pErr) return serverError(pErr);

    const collectedBy = new Map<string, { total: number; count: number }>();
    let unassigned_total = 0;
    for (const p of payments ?? []) {
      if (p.fee_id == null) {
        unassigned_total += Number(p.amount);
        continue;
      }
      const key = String(p.fee_id);
      const entry = collectedBy.get(key) ?? { total: 0, count: 0 };
      entry.total += Number(p.amount);
      entry.count += 1;
      collectedBy.set(key, entry);
    }

    const items = (fees ?? []).map((fee) => {
      const collected = collectedBy.get(String(fee.id)) ?? { total: 0, count: 0 };
      const amount = Number(fee.amount);
      return {
        fee_id: fee.id,
        name: fee.name,
        amount,
        collected: round2(collected.total),
        balance: round2(Math.max(0, amount - collected.total)),
        payments: collected.count,
        academic_year: fee.academic_year,
        semester: fee.semester,
        due_date: fee.due_date,
        progress: amount > 0 ? round2((collected.total / amount) * 100) : 0,
      };
    });
    items.sort((a, b) => b.balance - a.balance);

    return ok({ items, unassigned_total: round2(unassigned_total) });
  } catch (err) {
    return serverError(err);
  }
}
