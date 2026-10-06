import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";

// GET /api/categories/stats — counts per type (any logged-in user)
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const { data, error } = await db.from("categories").select("type,is_active");
    if (error) return serverError(error);

    const stats: Record<string, { total: number; active: number }> = {};
    for (const row of data ?? []) {
      const s = stats[row.type] ?? { total: 0, active: 0 };
      s.total += 1;
      if (row.is_active) s.active += 1;
      stats[row.type] = s;
    }
    return ok({ stats });
  } catch (err) {
    return serverError(err);
  }
}
