import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/clearances/[id]/release — approved → released (final step) (studentManager)
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: clearance } = await db
      .from("clearances")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!clearance) return notFound("Clearance not found");
    if (clearance.status !== "approved") return conflict("Only approved clearances can be released");

    const { data, error } = await db
      .from("clearances")
      .update({ status: "released" })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "update", "clearances", id, {
      note: "released",
      student_id: clearance.student_id,
    });
    return ok({ clearance: data });
  } catch (err) {
    return serverError(err);
  }
}
