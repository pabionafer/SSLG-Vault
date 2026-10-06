import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";

// GET /api/igps/stats — portfolio snapshot (igpEditor)
export async function GET() {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const [{ data: igps, error: iErr }, { data: incomeRows, error: nErr }] = await Promise.all([
      db.from("igps").select("id,name,is_active").is("deleted_at", null),
      db.from("income").select("igp_id,amount").is("deleted_at", null).not("igp_id", "is", null).limit(20000),
    ]);
    if (iErr) return serverError(iErr);
    if (nErr) return serverError(nErr);

    const totals = new Map<string, number>();
    for (const r of incomeRows ?? []) {
      totals.set(String(r.igp_id), (totals.get(String(r.igp_id)) ?? 0) + Number(r.amount));
    }

    const top = (igps ?? [])
      .map((igp) => ({
        igp_id: igp.id,
        name: igp.name,
        total_income: round2(totals.get(String(igp.id)) ?? 0),
      }))
      .sort((a, b) => b.total_income - a.total_income)
      .slice(0, 10);

    const grand = round2([...totals.values()].reduce((acc, v) => acc + v, 0));
    return ok({
      total: igps?.length ?? 0,
      active: (igps ?? []).filter((i) => i.is_active).length,
      total_income: grand,
      top,
    });
  } catch (err) {
    return serverError(err);
  }
}
