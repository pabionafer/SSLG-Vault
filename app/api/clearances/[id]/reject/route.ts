import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/clearances/[id]/reject — pending → rejected (studentManager)
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  let remarks: string | undefined;
  try {
    const j = (await req.json()) as { remarks?: unknown };
    if (typeof j.remarks === "string") remarks = j.remarks.slice(0, 500);
  } catch {
    /* empty body is fine */
  }

  try {
    const db = createAdminClient();
    const { data: clearance } = await db
      .from("clearances")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!clearance) return notFound("Clearance not found");
    if (clearance.status !== "pending") return conflict(`Cannot reject a ${clearance.status} clearance`);

    const { data, error } = await db
      .from("clearances")
      .update({
        status: "rejected",
        remarks: remarks ?? clearance.remarks,
        decided_at: new Date().toISOString(),
        decided_by: auth.profile.username,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "reject", "clearances", id, {
      student_id: clearance.student_id,
      remarks: remarks ?? null,
    });
    return ok({ clearance: data });
  } catch (err) {
    return serverError(err);
  }
}
