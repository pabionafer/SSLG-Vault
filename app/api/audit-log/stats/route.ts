import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/audit-log/stats — counts by action and by user (admin)
export async function GET() {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("audit_log")
      .select("action,username,target_table,created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) return serverError(error);

    const by_action: Record<string, number> = {};
    const by_user: Record<string, number> = {};
    const by_table: Record<string, number> = {};
    for (const row of data ?? []) {
      by_action[row.action] = (by_action[row.action] ?? 0) + 1;
      const user = row.username ?? "(system)";
      by_user[user] = (by_user[user] ?? 0) + 1;
      const table = row.target_table ?? "(none)";
      by_table[table] = (by_table[table] ?? 0) + 1;
    }
    const topUsers = Object.entries(by_user)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([username, count]) => ({ username, count }));

    return ok({
      sampled: data?.length ?? 0,
      by_action,
      by_table,
      top_users: topUsers,
    });
  } catch (err) {
    return serverError(err);
  }
}
