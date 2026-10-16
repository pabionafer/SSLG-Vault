import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";

// GET /api/igps/stats — portfolio snapshot (igpEditor)
export async function GET() {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const [igps, incomeRows] = await Promise.all([
      fetchAllByKeyset((cursor) =>
        db
          .from("igps")
          .select("id,name,is_active")
          .is("deleted_at", null)
          .gt("id", cursor)
          .limit(PAGE_LIMIT)
          .order("id", { ascending: true }),
      ),
      fetchAllByKeyset((cursor) =>
        db
          .from("income")
          .select("id,igp_id,amount")
          .is("deleted_at", null)
          .not("igp_id", "is", null)
          .gt("id", cursor)
          .limit(PAGE_LIMIT)
          .order("id", { ascending: true }),
      ),
    ]);

    // Income still pointing at a trashed IGP must not inflate the snapshot.
    const liveIgpIds = new Set(igps.map((i) => String(i.id)));
    const totals = new Map<string, number>();
    for (const r of incomeRows) {
      const key = String(r.igp_id);
      if (!liveIgpIds.has(key)) continue;
      totals.set(key, (totals.get(key) ?? 0) + Number(r.amount));
    }

    const top = igps
      .map((igp) => ({
        igp_id: igp.id,
        name: igp.name,
        total_income: round2(totals.get(String(igp.id)) ?? 0),
      }))
      .sort((a, b) => b.total_income - a.total_income)
      .slice(0, 10);

    const grand = round2([...totals.values()].reduce((acc, v) => acc + v, 0));
    return ok({
      total: igps.length,
      active: igps.filter((i) => i.is_active).length,
      total_income: grand,
      top,
    });
  } catch (err) {
    return serverError(err);
  }
}
