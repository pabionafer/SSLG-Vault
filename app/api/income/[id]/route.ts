import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, parseBody, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/income/[id] (igpEditor)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("income")
      .select("*, igp:igps(id,name), category:categories(id,name)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Income entry not found");
    return ok({ income: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  description: z.string().min(1).max(300).optional(),
  amount: z.coerce.number().positive().max(99_999_999).optional(),
  income_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(["igp", "other"]).optional(),
  igp_id: z.coerce.number().int().positive().nullish(),
  category_id: z.coerce.number().int().positive().nullish(),
  reference_no: z.string().max(60).nullish(),
  academic_year: z.string().min(1).optional(),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]).nullish(),
});

// PATCH /api/income/[id] (igpEditor)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  if (Object.keys(body.data).length === 0) return ok({ income: null, note: "no changes" });

  try {
    const db = createAdminClient();
    const updates: Record<string, unknown> = { ...body.data };
    if (updates.reference_no === "") updates.reference_no = null;
    if (updates.semester === "") updates.semester = null;
    if (updates.igp_id === null && updates.source === "igp") delete updates.igp_id;

    if (updates.igp_id) {
      const { data: igp } = await db
        .from("igps")
        .select("id")
        .eq("id", updates.igp_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!igp) return notFound("IGP not found");
    }

    const { data, error } = await db
      .from("income")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*, igp:igps(id,name), category:categories(id,name)")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Income entry not found");

    await logAction(auth.profile.username, "update", "income", id, { fields: Object.keys(updates) });
    return ok({ income: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/income/[id] — soft delete (igpEditor)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("income")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Income entry not found");

    await logAction(auth.profile.username, "delete", "income", id, {
      description: data.description,
      amount: data.amount,
    });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
