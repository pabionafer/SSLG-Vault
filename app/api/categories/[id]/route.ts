import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { notFound, ok, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/categories/[id] (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db.from("categories").select("*").eq("id", id).maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Category not found");
    return ok({ category: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  is_active: z.boolean().optional(),
});

// PATCH /api/categories/[id] (treasurer+)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  if (Object.keys(body.data).length === 0) return ok({ category: null, note: "no changes" });

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("categories")
      .update(body.data)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return conflict("Category name already exists");
      return serverError(error);
    }
    if (!data) return notFound("Category not found");
    await logAction(auth.profile.username, "update", "categories", id, body.data);
    return ok({ category: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/categories/[id] — deactivate (treasurer+)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("categories")
      .update({ is_active: false })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Category not found");
    await logAction(auth.profile.username, "delete", "categories", id, { target: data.name });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
