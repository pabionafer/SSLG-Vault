import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/payments/[id]/schedule-purge — 7-day countdown to hard delete (admin)
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("payments")
      .select("*")
      .eq("id", id)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (!existing) return notFound("Deleted payment not found");
    if (existing.pending_hard_delete) return conflict("Purge already scheduled");

    const { data, error } = await db
      .from("payments")
      .update({
        pending_hard_delete: true,
        pending_hard_delete_at: new Date().toISOString(),
        delete_reason: existing.delete_reason ?? "scheduled for purge",
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "update", "payments", id, {
      receipt_no: existing.receipt_no,
      note: "purge scheduled",
    });
    return ok({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}
