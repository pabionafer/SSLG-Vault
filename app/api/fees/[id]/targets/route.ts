import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { notFound, ok, parseBody, serverError, badRequest } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/fees/[id]/targets — the target set (empty = everyone) (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db.from("fee_targets").select("*").eq("fee_id", id);
    if (error) return serverError(error);
    return ok({ targets: data ?? [], applies_to_all: (data ?? []).length === 0 });
  } catch (err) {
    return serverError(err);
  }
}

const putSchema = z.object({
  targets: z
    .array(
      z
        .object({
          student_id: z.coerce.number().int().positive().nullish(),
          year_level: z.coerce.number().int().min(1).max(6).nullish(),
        })
        .refine((t) => t.student_id != null || t.year_level != null, {
          message: "Each target needs student_id or year_level",
        }),
    )
    .max(5000),
});

// PUT /api/fees/[id]/targets — replace the target set; [] = applies to everyone (treasurer+)
export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, putSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data: fee } = await db
      .from("fees")
      .select("id,name,deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (!fee || fee.deleted_at) return notFound("Fee not found");

    const { error: delErr } = await db.from("fee_targets").delete().eq("fee_id", id);
    if (delErr) return serverError(delErr);

    if (body.data.targets.length > 0) {
      const rows = body.data.targets.map((t) => ({
        fee_id: id,
        student_id: t.student_id ?? null,
        year_level: t.year_level ?? null,
      }));
      const { error: insErr } = await db.from("fee_targets").insert(rows);
      if (insErr) {
        if (insErr.code === "23505") return badRequest("Duplicate targets in set");
        return serverError(insErr);
      }
    }

    await logAction(auth.profile.username, "update", "fees", id, {
      note: "targets replaced",
      count: body.data.targets.length,
      applies_to_all: body.data.targets.length === 0,
    });

    const { data: targets } = await db.from("fee_targets").select("*").eq("fee_id", id);
    return ok({ targets: targets ?? [], applies_to_all: (targets ?? []).length === 0 });
  } catch (err) {
    return serverError(err);
  }
}
