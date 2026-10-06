import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { listResponse, paging, notFound, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/users/[id]/audit — audit trail for one user (admin)
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: profile } = await db.from("profiles").select("username").eq("id", id).maybeSingle();
    if (!profile) return notFound("User not found");

    const p = paging(req, 50);
    const { data, count, error } = await db
      .from("audit_log")
      .select("*", { count: "exact" })
      .or(`username.eq.${profile.username},target_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}
