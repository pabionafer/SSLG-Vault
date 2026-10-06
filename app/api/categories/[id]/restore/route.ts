import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/categories/[id]/restore (treasurer+)
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("categories")
      .update({ is_active: true })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Category not found");
    await logAction(auth.profile.username, "restore", "categories", id, { target: data.name });
    return ok({ category: data });
  } catch (err) {
    return serverError(err);
  }
}
