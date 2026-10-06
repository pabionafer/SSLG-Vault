import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, parseBody, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { refreshFeeItems } from "@/lib/clearance";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clearances/[id] — with live fee checklist (studentManager)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("clearances")
      .select("*, student:students(*)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Clearance not found");

    const { items, blockers } = await refreshFeeItems(id, String(data.student_id));
    return ok({ clearance: data, items, blockers });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  purpose: z.string().min(1).max(200).optional(),
  remarks: z.string().max(500).nullish(),
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        status: z.enum(["pending", "cleared", "not_applicable"]).optional(),
        remarks: z.string().max(300).nullish(),
      }),
    )
    .max(100)
    .optional(),
});

// PATCH /api/clearances/[id] — edit purpose/remarks and sign off checklist items (studentManager)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (body.data.purpose !== undefined) updates.purpose = body.data.purpose;
    if (body.data.remarks !== undefined) updates.remarks = body.data.remarks;

    if (Object.keys(updates).length > 0) {
      const { data, error } = await db
        .from("clearances")
        .update(updates)
        .eq("id", id)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle();
      if (error) return serverError(error);
      if (!data) return notFound("Clearance not found");
      await logAction(auth.profile.username, "update", "clearances", id, updates);
    }

    if (body.data.items?.length) {
      for (const item of body.data.items) {
        const patch: Record<string, unknown> = {};
        if (item.status) patch.status = item.status;
        if (item.remarks !== undefined) patch.remarks = item.remarks;
        if (item.status === "cleared") {
          patch.signed_by = auth.profile.username;
          patch.signed_at = new Date().toISOString();
        }
        const { error } = await db.from("clearance_items").update(patch).eq("id", item.id);
        if (error) return serverError(error);
      }
      await logAction(auth.profile.username, "update", "clearance_items", null, {
        clearance_id: id,
        signed: body.data.items.length,
      });
    }

    const { data: clearance } = await db
      .from("clearances")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return ok({ clearance });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/clearances/[id] — soft delete (studentManager)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("clearances")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Clearance not found");
    await logAction(auth.profile.username, "delete", "clearances", id, {});
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
