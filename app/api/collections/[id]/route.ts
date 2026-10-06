import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, parseBody, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/collections/[id] â€” detail + payments in the batch (treasurer+)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("collections")
      .select("*, payments(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Collection not found");

    const { payments: paymentsRaw, ...collection } = data;
    const activePayments = (paymentsRaw ?? []).filter(
      (p: { deleted_at: string | null; status: string }) => !p.deleted_at && p.status !== "void",
    );
    const total = activePayments.reduce(
      (acc: number, p: { amount: number }) => acc + Number(p.amount),
      0,
    );
    return ok({
      collection: { ...collection, total_amount: Number(total.toFixed(2)) },
      payments: activePayments,
    });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  collection_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).nullish(),
  status: z.enum(["active", "inactive"]).optional(),
});

// PATCH /api/collections/[id] (treasurer+)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const updates: Record<string, unknown> = { ...body.data };
    if (updates.status === "active") updates.deactivated_at = null;
    if (Object.keys(updates).length === 0) return ok({ collection: null, note: "no changes" });

    const { data, error } = await db
      .from("collections")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Collection not found");

    await logAction(auth.profile.username, "update", "collections", id, updates);
    return ok({ collection: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/collections/[id] â€” soft delete to Trash (treasurer+)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("collections")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Collection not found");
    await logAction(auth.profile.username, "delete", "collections", id, {});
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
