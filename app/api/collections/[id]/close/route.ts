import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/collections/[id]/close — mark inactive; starts the 30-day purge clock (treasurer+)
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("collections")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return notFound("Collection not found");
    if (existing.status === "inactive") return conflict("Collection is already closed");

    const { data, error } = await db
      .from("collections")
      .update({ status: "inactive", deactivated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "update", "collections", id, { note: "closed" });
    return ok({ collection: data });
  } catch (err) {
    return serverError(err);
  }
}
