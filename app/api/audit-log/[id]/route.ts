import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/audit-log/[id] (admin)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db.from("audit_log").select("*").eq("id", id).maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Audit entry not found");
    return ok({ entry: data });
  } catch (err) {
    return serverError(err);
  }
}
