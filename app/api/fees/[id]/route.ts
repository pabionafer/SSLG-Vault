import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { notFound, ok, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/fees/[id] — fee + target rows (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("fees")
      .select("*, category:categories(id,name), fee_targets(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Fee not found");
    return ok({ fee: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category_id: z.coerce.number().int().positive().nullish(),
  amount: z.coerce.number().min(0).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .or(z.literal("")),
  description: z.string().max(500).nullish(),
  is_active: z.boolean().optional(),
});

// PATCH /api/fees/[id] (treasurer+)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  const updates: Record<string, unknown> = { ...body.data };
  if (updates.due_date === "") updates.due_date = null;
  if (Object.keys(updates).length === 0) return ok({ fee: null, note: "no changes" });

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("fees")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return conflict("A fee with this name already exists for the period");
      return serverError(error);
    }
    if (!data) return notFound("Fee not found");
    await logAction(auth.profile.username, "update", "fees", id, updates);
    return ok({ fee: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/fees/[id] — soft delete (treasurer+)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("fees")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Fee not found");
    await logAction(auth.profile.username, "delete", "fees", id, { name: data.name });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
