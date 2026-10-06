import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { refreshFeeItems } from "@/lib/clearance";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/clearances/[id]/approve — allowed only when every fee item is cleared (studentManager)
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
    if (clearance.status !== "pending") return conflict(`Cannot approve a ${clearance.status} clearance`);

    const { blockers } = await refreshFeeItems(id, String(clearance.student_id));
    if (blockers.length > 0) {
      return NextResponse.json(
        { error: "Fee requirements are not yet cleared", blockers },
        { status: 409 },
      );
    }

    const { data, error } = await db
      .from("clearances")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: auth.profile.username,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "approve", "clearances", id, {
      student_id: clearance.student_id,
    });
    return ok({ clearance: data });
  } catch (err) {
    return serverError(err);
  }
}
