import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { round2 } from "@/lib/formulas";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/igps/[id] — with recent income entries (igpEditor)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("igps")
      .select("*, category:categories(id,name)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("IGP not found");

    const { data: incomeRows } = await db
      .from("income")
      .select("id,description,amount,income_date,source")
      .eq("igp_id", id)
      .is("deleted_at", null)
      .order("income_date", { ascending: false })
      .limit(50);

    const total_income = round2(
      (incomeRows ?? []).reduce((acc, r) => acc + Number(r.amount), 0),
    );
    return ok({ igp: data, recent_income: incomeRows ?? [], total_income });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullish(),
  category_id: z.coerce.number().int().positive().nullish(),
  custodian: z.string().max(150).nullish(),
  is_active: z.boolean().optional(),
});

// PATCH /api/igps/[id] (igpEditor)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  if (Object.keys(body.data).length === 0) return ok({ igp: null, note: "no changes" });

  try {
    const db = createAdminClient();
    if (body.data.name) {
      const { data: clash } = await db
        .from("igps")
        .select("id")
        .ilike("name", body.data.name)
        .neq("id", id)
        .maybeSingle();
      if (clash) return conflict("An IGP with this name already exists");
    }

    const updates: Record<string, unknown> = { ...body.data };
    if (updates.description === "") updates.description = null;
    if (updates.custodian === "") updates.custodian = null;

    const { data, error } = await db
      .from("igps")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*, category:categories(id,name)")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("IGP not found");

    await logAction(auth.profile.username, "update", "igps", id, { fields: Object.keys(updates) });
    return ok({ igp: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/igps/[id] — soft delete (igpEditor)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("igps")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("IGP not found");

    await logAction(auth.profile.username, "delete", "igps", id, { name: data.name });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
